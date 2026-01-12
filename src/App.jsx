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
// Rally Co-Pilot App - v16
// FIXED: Callout distances and aggressive triggering
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
  const lastZoneCalloutTimeRef = useRef(0)
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

  useEffect(() => {
    console.log('🔄 Resetting callout refs (routeMode/routeData changed)')
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    clearCalledRef.current = new Set()
    zoneTransitionAnnouncedRef.current = new Set()
    currentZoneRef.current = null
    lastCalloutTimeRef.current = Date.now() - 10000
    announcedCurvesRef.current = new Set()
  }, [routeMode, routeData])

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
    
    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    const curveDistance = nextCurve.distanceFromStart || 0
    const currentZone = routeZones.find(z => 
      curveDistance >= z.startDistance && curveDistance <= z.endDistance
    )
    
    if (!currentZone) return
    
    const newMode = CHARACTER_TO_MODE[currentZone.character] || DRIVING_MODE.SPIRITED
    
    if (newMode !== currentDrivingMode) {
      console.log(`🎯 Driving mode changed: ${currentDrivingMode} → ${newMode}`)
      setCurrentDrivingMode(newMode)
      
      const voiceStyle = MODE_TO_VOICE_STYLE[newMode]
      if (setVoiceStyle) {
        setVoiceStyle(voiceStyle)
      }
    }
    
    const zoneId = currentZone.id
    if (currentZoneRef.current !== zoneId && !zoneTransitionAnnouncedRef.current.has(zoneId)) {
      const now = Date.now()
      if (now - lastZoneCalloutTimeRef.current > 2000) {
        const transitionCallout = getZoneTransitionCallout(currentZone.character)
        if (transitionCallout && settings.voiceEnabled) {
          speak(transitionCallout, 'normal')
          lastZoneCalloutTimeRef.current = now
          console.log(`📢 Zone transition: ${transitionCallout}`)
        }
        zoneTransitionAnnouncedRef.current.add(zoneId)
      }
      currentZoneRef.current = zoneId
    }
    
  }, [isRunning, routeZones, upcomingCurves, position, currentDrivingMode, settings.voiceEnabled, speak, setVoiceStyle])

  // ================================
  // MAIN CALLOUT LOGIC - FIXED v16
  // ================================
  
  useEffect(() => {
    if (!isRunning) {
      return
    }
    
    if (!settings.voiceEnabled) {
      return
    }
    
    if (upcomingCurves.length === 0) {
      const now = Date.now()
      if (now - lastCalloutLogRef.current > 5000) {
        lastCalloutLogRef.current = now
        console.log('⚠️ No upcoming curves available for callouts')
      }
      return
    }

    const now = Date.now()
    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    // Get distance in METERS (internal unit)
    const distanceMeters = nextCurve.distance
    const curveId = nextCurve.id
    
    // Get mode-aware timing (all in METERS)
    const distances = getWarningDistances(currentDrivingMode, currentSpeed, currentSpeed)
    const voiceParams = getVoiceParamsForMode(currentDrivingMode)
    
    // Minimum pause between callouts
    const simulationSpeed = isDemoMode ? (useStore.getState().simulationSpeed || 1) : 1
    const effectiveMinPause = Math.max(500, voiceParams.minPause / simulationSpeed)
    
    const timeSinceLastCallout = now - lastCalloutTimeRef.current
    if (timeSinceLastCallout < effectiveMinPause) {
      return
    }
    
    // DIAGNOSTIC: Log every 2 seconds
    if (now - lastCalloutLogRef.current > 2000) {
      lastCalloutLogRef.current = now
      const distanceFeet = Math.round(distanceMeters * 3.28084)
      console.log(`🎯 CALLOUT CHECK:
        Curve ${curveId}: ${nextCurve.direction} ${nextCurve.severity}${nextCurve.isChicane ? ' (chicane)' : ''}
        Distance: ${Math.round(distanceMeters)}m (${distanceFeet}ft)
        Thresholds: early=${Math.round(distances.early)}m, main=${Math.round(distances.main)}m, final=${Math.round(distances.final)}m
        Already announced: early=${earlyWarningsRef.current.has(curveId)}, main=${mainCalloutsRef.current.has(curveId)}
        Mode: ${currentDrivingMode} | Speed: ${Math.round(currentSpeed)}mph
        Voice enabled: ${settings.voiceEnabled}`)
    }
    
    // Determine if curve should be announced
    let shouldAnnounce = true // Default to announce everything in live testing
    
    // In technical mode, announce all curves
    if (currentDrivingMode === DRIVING_MODE.TECHNICAL) {
      shouldAnnounce = true
    }
    // In spirited mode, skip severity 1
    else if (currentDrivingMode === DRIVING_MODE.SPIRITED) {
      shouldAnnounce = nextCurve.severity >= 2
    }
    // In highway mode, skip severity 1-2
    else if (currentDrivingMode === DRIVING_MODE.HIGHWAY) {
      shouldAnnounce = nextCurve.severity >= 3
    }
    // In urban mode, only announce severity 4+
    else if (currentDrivingMode === DRIVING_MODE.URBAN) {
      shouldAnnounce = nextCurve.severity >= 4
    }
    
    // OVERRIDE: Always announce severity 4+ regardless of mode
    if (nextCurve.severity >= 4) {
      shouldAnnounce = true
    }
    
    // OVERRIDE: Always announce chicanes
    if (nextCurve.isChicane) {
      shouldAnnounce = true
    }
    
    if (!shouldAnnounce) {
      return
    }

    const isHardCurve = nextCurve.severity >= 4

    // ================================
    // EARLY WARNING (hard curves only, severity 4+)
    // ================================
    if (isHardCurve && 
        distanceMeters <= distances.early && 
        distanceMeters > distances.main &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'early', { speedUnit })
      if (callout) {
        console.log(`🔊 EARLY WARNING: "${callout}" (curve ${curveId}, ${Math.round(distanceMeters)}m / ${Math.round(distanceMeters * 3.28084)}ft)`)
        speak(callout, 'normal')
        earlyWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
      }
      return
    }

    // ================================
    // MAIN CALLOUT - Most important!
    // ================================
    const hasBeenAnnounced = mainCalloutsRef.current.has(curveId)
    const inMainWindow = distanceMeters <= distances.main && distanceMeters > distances.final
    const jumpedPastWindow = distanceMeters <= distances.final && !hasBeenAnnounced && distanceMeters >= 0
    
    if ((inMainWindow || jumpedPastWindow) && !hasBeenAnnounced) {
      let callout
      
      if (nextCurve.isChicane) {
        callout = generateChicaneCallout(currentDrivingMode, nextCurve, 'main')
      } else {
        // Check if second curve is close - link them
        const secondCurve = upcomingCurves[1]
        let includeSecond = null
        
        if (currentDrivingMode === DRIVING_MODE.TECHNICAL && secondCurve && !secondCurve.isChicane) {
          const gapToSecond = secondCurve.distance - distanceMeters
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
        mainCalloutsRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        
        console.log(`🔊 MAIN CALLOUT: "${callout}" (curve ${curveId}, ${Math.round(distanceMeters)}m / ${Math.round(distanceMeters * 3.28084)}ft)`)
        
        speak(callout, 'high')
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
          navigator.vibrate(pattern)
        }
      }
      return
    }

    // ================================
    // FINAL WARNING (hard curves only)
    // ================================
    if (isHardCurve &&
        distanceMeters <= distances.final && 
        distanceMeters > 10 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'final', { speedUnit })
      if (callout) {
        console.log(`🔊 FINAL WARNING: "${callout}" (curve ${curveId}, ${Math.round(distanceMeters)}m)`)
        speak(callout, 'high')
        finalWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
      return
    }

    // Clear callout (technical mode only, strict conditions)
    if (currentDrivingMode === DRIVING_MODE.TECHNICAL) {
      checkClearCallout(now, distanceMeters)
    }

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak, currentDrivingMode, routeZones, speedUnit, isDemoMode])

  // Helper: Check if we should call "clear"
  const checkClearCallout = (now, distanceToNext) => {
    if (!shouldCallClear(currentDrivingMode, now - lastCalloutTimeRef.current, distanceToNext)) {
      return
    }
    
    const clearKey = `clear-${Math.floor(distanceToNext / 100)}`
    if (clearCalledRef.current.has(clearKey)) return
    
    const nextCurve = upcomingCurves[1]
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
