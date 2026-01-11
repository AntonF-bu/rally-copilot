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

  // Reset callout tracking when route changes
  useEffect(() => {
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
      if (now - lastCalloutTimeRef.current > 2000) { // Don't interrupt recent callouts
        const transitionCallout = getZoneTransitionCallout(currentZone.character)
        if (transitionCallout && settings.voiceEnabled) {
          speak(transitionCallout, 'normal')
          lastCalloutTimeRef.current = now
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
    const curveId = nextCurve.id
    
    // Log on every check
    console.log(`📊 Mode: ${currentDrivingMode} | Curve ${curveId}: ${Math.round(distance)}m | Early: ${Math.round(distances.early)}m | Main: ${Math.round(distances.main)}m | Already announced: ${mainCalloutsRef.current.has(curveId)}`)
    
    // Respect minimum pause between callouts
    const timeSinceLastCallout = now - lastCalloutTimeRef.current
    if (timeSinceLastCallout < voiceParams.minPause) {
      console.log(`⏳ Waiting: ${Math.round(timeSinceLastCallout)}ms < ${voiceParams.minPause}ms minPause`)
      return
    }
    
    // Get behavior for this curve based on route character
    const behavior = getBehaviorForCurve(routeZones, nextCurve)
    
    // Check if curve should be announced based on character behavior
    const shouldAnnounce = shouldAnnounceCurve(routeZones, nextCurve)
    
    if (!shouldAnnounce) {
      // Still allow chicanes through if they have any severity 3+ curve
      if (nextCurve.isChicane) {
        const severities = nextCurve.severitySequence?.split('-').map(Number) || [1]
        const maxSev = Math.max(...severities)
        if (maxSev < behavior.minSeverity) {
          checkClearCallout(now, nextCurve.distance)
          return
        }
      } else {
        // Log why we're skipping this curve
        if (now % 3000 < 100) {
          console.log(`⏭️ Skipping curve ${nextCurve.id}: severity ${nextCurve.severity} < minSeverity ${behavior.minSeverity}`)
        }
        checkClearCallout(now, nextCurve.distance)
        return
      }
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

    // MAIN CALLOUT
    if (distance <= distances.main && 
        distance > distances.final &&
        !mainCalloutsRef.current.has(curveId)) {
      
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
        speak(callout, 'high')
        mainCalloutsRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        console.log(`🔊 Main callout: ${callout}`)
        
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
