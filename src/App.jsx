import { useEffect, useRef, useState } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateFinalWarning, generateStraightCallout } from './hooks/useSpeech'
import { getBehaviorForCurve, shouldAnnounceCurve, CHARACTER_COLORS, ROUTE_CHARACTER } from './services/zoneService'

// Import callout engine for mode-aware timing
import { 
  DRIVING_MODE,
  getWarningDistances, 
  shouldCallClear,
  generateModeCallout,
  generateChicaneCallout,
  generateClearCallout
} from './services/calloutEngine'

// Import voice params for style switching
import { getVoiceParamsForMode, getSpeechRate } from './services/voiceParams'

import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'
import TripSummary from './components/TripSummary'
import RouteEditor from './components/RouteEditor'

// ================================
// Rally Co-Pilot App - v14
// With callout engine integration
// Zone-aware timing, transitions, voice styles
// ================================

// Map route character to driving mode
const CHARACTER_TO_MODE = {
  [ROUTE_CHARACTER.TRANSIT]: DRIVING_MODE.HIGHWAY,
  [ROUTE_CHARACTER.SPIRITED]: DRIVING_MODE.SPIRITED,
  [ROUTE_CHARACTER.TECHNICAL]: DRIVING_MODE.TECHNICAL,
  [ROUTE_CHARACTER.URBAN]: DRIVING_MODE.URBAN
}

// Map driving mode to voice style
const MODE_TO_VOICE_STYLE = {
  [DRIVING_MODE.HIGHWAY]: 'relaxed',
  [DRIVING_MODE.SPIRITED]: 'normal',
  [DRIVING_MODE.TECHNICAL]: 'urgent',
  [DRIVING_MODE.URBAN]: 'normal'
}

export default function App() {
  const { speak, setVoiceStyle } = useSpeech()
  
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    setLastAnnouncedCurveId,
    getDisplaySpeed,
    showRouteSelector,
    showRoutePreview,
    showTripSummary,
    routeMode,
    routeData,
    routeZones,
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    speed,
    updateTripStats,
    showRouteEditor,
    goToEditor,
  } = useStore()

  // Callout tracking refs
  const earlyWarningsRef = useRef(new Set())
  const mainCalloutsRef = useRef(new Set())
  const finalWarningsRef = useRef(new Set())
  const clearCalledRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  const lastZoneCalloutTimeRef = useRef(0) // Separate timer for zone transitions
  const lastTripUpdateRef = useRef(0)
  const announcedCurvesRef = useRef(new Set())
  
  // Zone transition tracking
  const currentZoneRef = useRef(null)
  const zoneTransitionAnnouncedRef = useRef(new Set())
  
  // Current driving mode (derived from zone)
  const [currentDrivingMode, setCurrentDrivingMode] = useState(DRIVING_MODE.SPIRITED)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()
  const speedUnit = settings.units === 'metric' ? 'kmh' : 'mph'

  // Reset callout tracking when route changes OR when navigation starts
  useEffect(() => {
    console.log('🔄 Resetting callout refs (routeMode/routeData changed)')
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    clearCalledRef.current = new Set()
    zoneTransitionAnnouncedRef.current = new Set()
    currentZoneRef.current = null
    // Set to past time so first callout can fire immediately
    lastCalloutTimeRef.current = Date.now() - 10000
    announcedCurvesRef.current = new Set()
  }, [routeMode, routeData])

  // Also reset when navigation starts
  useEffect(() => {
    if (isRunning) {
      console.log('🔄 Resetting callout refs (navigation started)')
      earlyWarningsRef.current = new Set()
      mainCalloutsRef.current = new Set()
      finalWarningsRef.current = new Set()
      clearCalledRef.current = new Set()
      lastCalloutTimeRef.current = Date.now() - 10000
    }
  }, [isRunning])

  // Update trip stats periodically
  useEffect(() => {
    if (!isRunning) return
    
    const now = Date.now()
    if (now - lastTripUpdateRef.current < 500) return
    lastTripUpdateRef.current = now
    
    let passedCurve = null
    if (upcomingCurves.length > 0) {
      const firstCurve = upcomingCurves[0]
      if (firstCurve.distance < 20 && 
          mainCalloutsRef.current.has(firstCurve.id) && 
          !announcedCurvesRef.current.has(firstCurve.id)) {
        passedCurve = firstCurve
        announcedCurvesRef.current.add(firstCurve.id)
      }
    }
    
    updateTripStats(position, speed, passedCurve)
  }, [isRunning, position, speed, upcomingCurves, updateTripStats])

  // ================================
  // ZONE DETECTION & VOICE STYLE
  // ================================
  
  useEffect(() => {
    if (!isRunning || !routeZones?.length || !position) return
    
    // Find current zone based on position
    // Use the next curve's position to determine zone
    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    const curveDistance = nextCurve.distanceFromStart || 0
    const currentZone = routeZones.find(z => 
      curveDistance >= z.startDistance && curveDistance <= z.endDistance
    )
    
    if (!currentZone) return
    
    const newMode = CHARACTER_TO_MODE[currentZone.character] || DRIVING_MODE.SPIRITED
    
    // Update driving mode if changed
    if (newMode !== currentDrivingMode) {
      console.log(`🎯 Driving mode changed: ${currentDrivingMode} → ${newMode}`)
      setCurrentDrivingMode(newMode)
      
      // Update voice style
      const voiceStyle = MODE_TO_VOICE_STYLE[newMode]
      if (setVoiceStyle) {
        setVoiceStyle(voiceStyle)
      }
    }
    
    // Check for zone transition announcement
    const zoneId = currentZone.id
    if (currentZoneRef.current !== zoneId && !zoneTransitionAnnouncedRef.current.has(zoneId)) {
      // New zone entered - announce it
      const now = Date.now()
      if (now - lastZoneCalloutTimeRef.current > 2000) { // Don't spam zone callouts
        const transitionCallout = getZoneTransitionCallout(currentZone.character)
        if (transitionCallout && settings.voiceEnabled) {
          speak(transitionCallout, 'normal')
          lastZoneCalloutTimeRef.current = now // Use separate timer - don't block curve callouts
          console.log(`📢 Zone transition: ${transitionCallout}`)
        }
        zoneTransitionAnnouncedRef.current.add(zoneId)
      }
      currentZoneRef.current = zoneId
    }
    
  }, [isRunning, routeZones, upcomingCurves, position, currentDrivingMode, settings.voiceEnabled, speak, setVoiceStyle])

  // ================================
  // MAIN CALLOUT LOGIC
  // ================================
  
  useEffect(() => {
    // Debug: Log why we might exit early
    console.log(`🔍 Callout effect check: isRunning=${isRunning}, voiceEnabled=${settings.voiceEnabled}, curves=${upcomingCurves.length}, mode=${currentDrivingMode}`)
    
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const now = Date.now()
    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    // Get mode-aware timing
    const distances = getWarningDistances(currentDrivingMode, currentSpeed, currentSpeed)
    const voiceParams = getVoiceParamsForMode(currentDrivingMode)
    
    const distance = nextCurve.distance
    const actualDist = nextCurve.actualDistance ?? distance
    const curveId = nextCurve.id
    
    // Log on every check - include actual distance
    console.log(`📊 Mode: ${currentDrivingMode} | Curve ${curveId}: dist=${Math.round(distance)}m actual=${Math.round(actualDist)}m | Early: ${Math.round(distances.early)}m | Main: ${Math.round(distances.main)}m | Announced: ${mainCalloutsRef.current.has(curveId)}`)
    
    // Respect minimum pause between callouts
    // Scale minPause by simulation speed (at 4x speed, divide pause by 4)
    const simulationSpeed = useStore.getState().simulationSpeed || 1
    const effectiveMinPause = voiceParams.minPause / simulationSpeed
    
    const timeSinceLastCallout = now - lastCalloutTimeRef.current
    if (timeSinceLastCallout < effectiveMinPause) {
      // Only log occasionally to reduce spam
      if (Math.random() < 0.05) {
        console.log(`⏳ Waiting: ${Math.round(timeSinceLastCallout)}ms < ${Math.round(effectiveMinPause)}ms (${voiceParams.minPause}/${simulationSpeed}x)`)
      }
      return
    }
    
    // Get behavior for this curve based on route character
    const behavior = getBehaviorForCurve(routeZones, nextCurve)
    
    // Check if curve should be announced based on character behavior
    let shouldAnnounce = shouldAnnounceCurve(routeZones, nextCurve)
    
    // OVERRIDE: Always announce severity 5+ curves regardless of zone
    if (nextCurve.severity >= 5) {
      shouldAnnounce = true
    }
    
    // OVERRIDE: Always announce chicanes with any 4+ severity component
    if (nextCurve.isChicane) {
      const severities = nextCurve.severitySequence?.split('-').map(Number) || [1]
      const maxSev = Math.max(...severities)
      if (maxSev >= 4) {
        shouldAnnounce = true
      }
    }
    
    if (!shouldAnnounce) {
      // Log why we're skipping this curve
      if (now % 3000 < 100) {
        console.log(`⏭️ Skipping curve ${nextCurve.id}: severity ${nextCurve.severity} < minSeverity ${behavior.minSeverity}`)
      }
      checkClearCallout(now, nextCurve.distance)
      return
    }

    const isHardCurve = nextCurve.severity >= 4

    // EARLY WARNING (hard curves only)
    if (isHardCurve && 
        distance <= distances.early && 
        distance > distances.main &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'early', { speedUnit })
      if (callout) {
        speak(callout, 'normal')
        earlyWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
        console.log(`🔊 Early warning: ${callout}`)
      }
      return
    }

    // MAIN CALLOUT - KEY FIX: Also trigger if we've jumped past the main window
    // This handles fast simulation where distance can go from 200m to 0m in one frame
    const hasBeenAnnounced = mainCalloutsRef.current.has(curveId)
    const inMainWindow = distance <= distances.main && distance > distances.final
    const jumpedPastWindow = distance <= distances.final && !hasBeenAnnounced && distance >= 0
    
    if ((inMainWindow || jumpedPastWindow) && !hasBeenAnnounced) {
      console.log(`🎯 MAIN CALLOUT TRIGGERED: distance=${distance}m, inMainWindow=${inMainWindow}, jumpedPastWindow=${jumpedPastWindow}`)
      
      let callout
      
      if (nextCurve.isChicane) {
        callout = generateChicaneCallout(currentDrivingMode, nextCurve, 'main')
      } else if (nextCurve.isTechnicalSection) {
        callout = generateCallout(nextCurve, mode, speedUnit, null, 'main')
      } else {
        // Check if second curve is close - link them in technical mode
        const secondCurve = upcomingCurves[1]
        let includeSecond = null
        
        if (currentDrivingMode === DRIVING_MODE.TECHNICAL && secondCurve && !secondCurve.isChicane) {
          const gapToSecond = secondCurve.distance - distance
          if (gapToSecond < 150 && gapToSecond > 0) {
            includeSecond = secondCurve
          }
        }
        
        callout = generateModeCallout(currentDrivingMode, nextCurve, 'main', { 
          speedUnit, 
          nextCurve: includeSecond 
        })
        
        if (includeSecond) {
          mainCalloutsRef.current.add(includeSecond.id)
        }
      }
      
      if (callout) {
        console.log(`🔊 Attempting to speak: "${callout}" for curve ${curveId}`)
        console.log(`🔊 mainCalloutsRef BEFORE add: ${Array.from(mainCalloutsRef.current).join(', ')}`)
        // Mark as announced BEFORE speaking to prevent double-calls
        mainCalloutsRef.current.add(curveId)
        console.log(`🔊 mainCalloutsRef AFTER add: ${Array.from(mainCalloutsRef.current).join(', ')}`)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        
        // Fire and forget - don't await in useEffect
        speak(callout, 'high').then(result => {
          console.log(`🔊 Speak completed: ${result ? 'success' : 'failed'}`)
        }).catch(err => {
          console.error('🔊 Speak error:', err)
        })
        
        console.log(`🔊 Main callout queued: ${callout}`)
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
          navigator.vibrate(pattern)
        }
      }
      return
    }

    // FINAL WARNING (hard curves only)
    if (isHardCurve &&
        distance <= distances.final && 
        distance > 15 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'final', { speedUnit })
      if (callout) {
        speak(callout, 'high')
        finalWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
        console.log(`🔊 Final warning: ${callout}`)
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
      return
    }

    // Check for clear callout (technical mode only)
    checkClearCallout(now, distance)

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak, currentDrivingMode, routeZones, speedUnit])

  // Helper: Check if we should call "clear"
  const checkClearCallout = (now, distanceToNext) => {
    if (!shouldCallClear(currentDrivingMode, now - lastCalloutTimeRef.current, distanceToNext)) {
      return
    }
    
    const clearKey = `clear-${Math.floor(distanceToNext / 100)}`
    if (clearCalledRef.current.has(clearKey)) return
    
    const nextCurve = upcomingCurves[1] // Look at curve AFTER the one we're approaching
    const callout = generateClearCallout(currentDrivingMode, distanceToNext, nextCurve, speedUnit)
    
    if (callout && settings.voiceEnabled) {
      speak(callout, 'normal')
      clearCalledRef.current.add(clearKey)
      lastCalloutTimeRef.current = now
      console.log(`🔊 Clear callout: ${callout}`)
    }
  }

  // Clear old curve warnings when passed
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    ;[earlyWarningsRef, mainCalloutsRef, finalWarningsRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!upcomingIds.has(id)) ref.current.delete(id)
      })
    })
    
    // Clean up clear callouts periodically
    if (clearCalledRef.current.size > 20) {
      clearCalledRef.current.clear()
    }
  }, [isRunning, upcomingCurves])

  // ================================
  // NAVIGATION HANDLERS
  // ================================

  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    clearCalledRef.current = new Set()
    zoneTransitionAnnouncedRef.current = new Set()
    currentZoneRef.current = null
    // Set to past time so first callout can fire immediately
    lastCalloutTimeRef.current = Date.now() - 10000
    goToDriving()
  }

  const handleGoToPreview = () => goToPreview()
  const handleGoToMenu = () => { clearRouteData(); goToMenu() }
  const handleGoToEditor = () => goToEditor()

  // ================================
  // RENDER
  // ================================

  if (showRouteSelector) {
    return <RouteSelector onRouteSelected={handleGoToPreview} />
  }

  if (showRoutePreview) {
    return (
      <RoutePreview 
        onStartNavigation={handleStartNavigation} 
        onBack={handleGoToMenu}
        onEdit={handleGoToEditor}
      />
    )
  }
  
  if (showRouteEditor) {
    return (
      <RouteEditor
        onBack={handleGoToPreview}
        onSave={handleGoToPreview}
      />
    )
  }

  if (showTripSummary) {
    return <TripSummary onClose={handleGoToMenu} />
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <Map />
      <CalloutOverlay currentDrivingMode={currentDrivingMode} />
      <BottomBar />
      <SettingsPanel />
      <VoiceIndicator />
    </div>
  )
}

// ================================
// HELPER FUNCTIONS
// ================================

function getZoneTransitionCallout(character) {
  const callouts = {
    [ROUTE_CHARACTER.TECHNICAL]: 'Technical section ahead',
    [ROUTE_CHARACTER.TRANSIT]: 'Highway ahead, relax',
    [ROUTE_CHARACTER.SPIRITED]: 'Back to spirited',
    [ROUTE_CHARACTER.URBAN]: 'Urban zone'
  }
  return callouts[character] || null
}
