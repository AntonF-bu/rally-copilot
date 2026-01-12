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
// Rally Co-Pilot App - v15
// FIXED: Reliable callouts for live GPS mode
// With extensive logging for debugging
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
  const lastCalloutLogRef = useRef(0)
  
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

  // ================================
  // RESET CALLOUT TRACKING
  // ================================

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
      console.log(`🚗 Navigation mode: ${routeMode}, isDemoMode: ${isDemoMode}`)
      earlyWarningsRef.current = new Set()
      mainCalloutsRef.current = new Set()
      finalWarningsRef.current = new Set()
      clearCalledRef.current = new Set()
      lastCalloutTimeRef.current = Date.now() - 10000
    }
  }, [isRunning, routeMode, isDemoMode])

  // ================================
  // TRIP STATS UPDATE
  // ================================

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
    // Early exit checks with logging
    if (!isRunning) {
      return
    }
    
    if (!settings.voiceEnabled) {
      return
    }
    
    if (upcomingCurves.length === 0) {
      // Log this occasionally for debugging
      const now = Date.now()
      if (now - lastCalloutLogRef.current > 5000) {
        lastCalloutLogRef.current = now
        console.log('⚠️ No upcoming curves available for callouts')
        console.log(`   Route mode: ${routeMode}`)
        console.log(`   Position: ${position ? `[${position[0].toFixed(5)}, ${position[1].toFixed(5)}]` : 'null'}`)
        console.log(`   Route data curves: ${routeData?.curves?.length || 0}`)
      }
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
    
    // Respect minimum pause between callouts (scaled by simulation speed for demo mode)
    const simulationSpeed = isDemoMode ? (useStore.getState().simulationSpeed || 1) : 1
    const effectiveMinPause = Math.max(500, voiceParams.minPause / simulationSpeed)
    
    const timeSinceLastCallout = now - lastCalloutTimeRef.current
    if (timeSinceLastCallout < effectiveMinPause) {
      return
    }
    
    // Log curve status periodically (every 3 seconds)
    if (now - lastCalloutLogRef.current > 3000) {
      lastCalloutLogRef.current = now
      console.log(`🎯 Callout check:
        - Curve ${curveId}: ${nextCurve.direction} ${nextCurve.severity}
        - Distance: ${Math.round(distance)}m (actual: ${Math.round(actualDist)}m)
        - Warning distances: early=${Math.round(distances.early)}m, main=${Math.round(distances.main)}m, final=${Math.round(distances.final)}m
        - Already announced: ${mainCalloutsRef.current.has(curveId)}
        - Mode: ${routeMode} | Driving mode: ${currentDrivingMode}
        - Speed: ${Math.round(currentSpeed)} mph`)
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
    
    // OVERRIDE: In live GPS mode, be more aggressive about announcing
    // Announce any curve severity 3+ to help the driver
    if (!isDemoMode && nextCurve.severity >= 3) {
      shouldAnnounce = true
    }
    
    if (!shouldAnnounce) {
      // Log why we're skipping this curve (throttled)
      if (now % 5000 < 100) {
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
        console.log(`🔊 Early warning: ${callout} (curve ${curveId}, dist=${Math.round(distance)}m)`)
      }
      return
    }

    // MAIN CALLOUT - KEY FIX: Also trigger if we've jumped past the main window
    // This handles fast simulation where distance can go from 200m to 0m in one frame
    const hasBeenAnnounced = mainCalloutsRef.current.has(curveId)
    const inMainWindow = distance <= distances.main && distance > distances.final
    const jumpedPastWindow = distance <= distances.final && !hasBeenAnnounced && distance >= 0
    
    if ((inMainWindow || jumpedPastWindow) && !hasBeenAnnounced) {
      console.log(`🎯 MAIN CALLOUT TRIGGERED:
        - Curve ${curveId}: ${nextCurve.direction} ${nextCurve.severity}
        - Distance: ${Math.round(distance)}m
        - inMainWindow: ${inMainWindow}
        - jumpedPastWindow: ${jumpedPastWindow}
        - Route mode: ${routeMode}`)
      
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
        // Mark as announced BEFORE speaking
        mainCalloutsRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        
        console.log(`🔊 Callout: "${callout}" (curve ${curveId})`)
        
        speak(callout, 'high')
        
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
        console.log(`🔊 Final warning: ${callout} (curve ${curveId}, dist=${Math.round(distance)}m)`)
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
      return
    }

    // Check for clear callout (technical mode only)
    checkClearCallout(now, distance)

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak, currentDrivingMode, routeZones, speedUnit, isDemoMode, routeMode, position, routeData])

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
    console.log('🚀 Starting navigation, callout refs cleared')
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
