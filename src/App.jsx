import { useEffect, useRef, useState } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateFinalWarning, generateStraightCallout } from './hooks/useSpeech'
import { getBehaviorForCurve, shouldAnnounceCurve, CHARACTER_COLORS, ROUTE_CHARACTER } from './services/zoneService'

// Import callout engine
import { 
  DRIVING_MODE,
  getWarningDistances, 
  shouldCallClear,
  generateModeCallout,
  generateChicaneCallout,
  generateClearCallout,
  shouldAnnounceCurveInMode
} from './services/calloutEngine'

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
// Rally Co-Pilot App - v17
// FIXED: Better callout triggering, removed clear callouts
// ================================

const CHARACTER_TO_MODE = {
  [ROUTE_CHARACTER.TRANSIT]: DRIVING_MODE.HIGHWAY,
  [ROUTE_CHARACTER.SPIRITED]: DRIVING_MODE.SPIRITED,
  [ROUTE_CHARACTER.TECHNICAL]: DRIVING_MODE.TECHNICAL,
  [ROUTE_CHARACTER.URBAN]: DRIVING_MODE.URBAN
}

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

  // Callout tracking
  const earlyWarningsRef = useRef(new Set())
  const mainCalloutsRef = useRef(new Set())
  const finalWarningsRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  const lastZoneCalloutTimeRef = useRef(0)
  const lastTripUpdateRef = useRef(0)
  const announcedCurvesRef = useRef(new Set())
  const lastCalloutLogRef = useRef(0)
  
  const currentZoneRef = useRef(null)
  const zoneTransitionAnnouncedRef = useRef(new Set())
  
  const [currentDrivingMode, setCurrentDrivingMode] = useState(DRIVING_MODE.SPIRITED)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()
  const speedUnit = settings.units === 'metric' ? 'kmh' : 'mph'

  // Reset tracking on route change
  useEffect(() => {
    console.log('🔄 Route changed - resetting callout tracking')
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    zoneTransitionAnnouncedRef.current = new Set()
    currentZoneRef.current = null
    lastCalloutTimeRef.current = Date.now() - 10000
    announcedCurvesRef.current = new Set()
  }, [routeMode, routeData])

  useEffect(() => {
    if (isRunning) {
      console.log(`🚀 Navigation started - mode: ${routeMode}`)
      earlyWarningsRef.current = new Set()
      mainCalloutsRef.current = new Set()
      finalWarningsRef.current = new Set()
      lastCalloutTimeRef.current = Date.now() - 10000
    }
  }, [isRunning, routeMode])

  // Trip stats
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

  // Zone detection
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
      console.log(`🎯 Mode changed: ${currentDrivingMode} → ${newMode}`)
      setCurrentDrivingMode(newMode)
      
      const voiceStyle = MODE_TO_VOICE_STYLE[newMode]
      if (setVoiceStyle) setVoiceStyle(voiceStyle)
    }
    
    const zoneId = currentZone.id
    if (currentZoneRef.current !== zoneId && !zoneTransitionAnnouncedRef.current.has(zoneId)) {
      const now = Date.now()
      if (now - lastZoneCalloutTimeRef.current > 3000) {
        const transitionCallout = getZoneTransitionCallout(currentZone.character)
        if (transitionCallout && settings.voiceEnabled) {
          speak(transitionCallout, 'normal')
          lastZoneCalloutTimeRef.current = now
          console.log(`📢 Zone: ${transitionCallout}`)
        }
        zoneTransitionAnnouncedRef.current.add(zoneId)
      }
      currentZoneRef.current = zoneId
    }
    
  }, [isRunning, routeZones, upcomingCurves, position, currentDrivingMode, settings.voiceEnabled, speak, setVoiceStyle])

  // ================================
  // MAIN CALLOUT LOGIC - v17
  // ================================
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled) return
    
    if (upcomingCurves.length === 0) {
      const now = Date.now()
      if (now - lastCalloutLogRef.current > 5000) {
        lastCalloutLogRef.current = now
        console.log('⚠️ No upcoming curves')
      }
      return
    }

    const now = Date.now()
    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    const distanceMeters = nextCurve.distance
    const curveId = nextCurve.id
    
    // Get timing thresholds
    const distances = getWarningDistances(currentDrivingMode, currentSpeed, currentSpeed)
    
    // Minimum pause between callouts
    const minPause = isDemoMode ? 800 : 1200
    const timeSinceLastCallout = now - lastCalloutTimeRef.current
    
    if (timeSinceLastCallout < minPause) {
      return
    }
    
    // Log status every 2 seconds
    if (now - lastCalloutLogRef.current > 2000) {
      lastCalloutLogRef.current = now
      const distFeet = Math.round(distanceMeters * 3.28084)
      console.log(`🎯 Curve ${curveId}: ${nextCurve.direction} ${nextCurve.severity} @ ${Math.round(distanceMeters)}m (${distFeet}ft)`)
      console.log(`   Thresholds: early=${Math.round(distances.early)}m, main=${Math.round(distances.main)}m`)
      console.log(`   Announced: early=${earlyWarningsRef.current.has(curveId)}, main=${mainCalloutsRef.current.has(curveId)}`)
    }
    
    // Check if curve should be announced
    const shouldAnnounce = shouldAnnounceCurveInMode(currentDrivingMode, nextCurve)
    
    if (!shouldAnnounce) {
      // Skip this curve but don't log every time
      return
    }

    const isHardCurve = nextCurve.severity >= 4

    // EARLY WARNING (severity 4+ only)
    if (isHardCurve && 
        distanceMeters <= distances.early && 
        distanceMeters > distances.main &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'early', { speedUnit })
      if (callout) {
        console.log(`🔊 EARLY: "${callout}" @ ${Math.round(distanceMeters)}m`)
        speak(callout, 'normal')
        earlyWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
      }
      return
    }

    // MAIN CALLOUT
    const hasBeenAnnounced = mainCalloutsRef.current.has(curveId)
    const inMainWindow = distanceMeters <= distances.main && distanceMeters > distances.final
    const jumpedPast = distanceMeters <= distances.final && !hasBeenAnnounced && distanceMeters > 0
    
    if ((inMainWindow || jumpedPast) && !hasBeenAnnounced) {
      let callout
      
      if (nextCurve.isChicane) {
        callout = generateChicaneCallout(currentDrivingMode, nextCurve, 'main')
      } else {
        callout = generateModeCallout(currentDrivingMode, nextCurve, 'main', { speedUnit })
      }
      
      if (callout) {
        mainCalloutsRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        
        console.log(`🔊 MAIN: "${callout}" @ ${Math.round(distanceMeters)}m`)
        speak(callout, 'high')
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate(nextCurve.severity >= 5 ? [100, 50, 100] : [50])
        }
      }
      return
    }

    // FINAL WARNING (severity 5+ only)
    if (nextCurve.severity >= 5 &&
        distanceMeters <= distances.final && 
        distanceMeters > 10 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateModeCallout(currentDrivingMode, nextCurve, 'final', { speedUnit })
      if (callout) {
        console.log(`🔊 FINAL: "${callout}" @ ${Math.round(distanceMeters)}m`)
        speak(callout, 'high')
        finalWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, settings, setLastAnnouncedCurveId, speak, currentDrivingMode, speedUnit, isDemoMode])

  // Cleanup passed curves
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    ;[earlyWarningsRef, mainCalloutsRef, finalWarningsRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!upcomingIds.has(id)) ref.current.delete(id)
      })
    })
  }, [isRunning, upcomingCurves])

  // Navigation handlers
  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    zoneTransitionAnnouncedRef.current = new Set()
    currentZoneRef.current = null
    lastCalloutTimeRef.current = Date.now() - 10000
    console.log('🚀 Navigation started')
    goToDriving()
  }

  const handleGoToPreview = () => goToPreview()
  const handleGoToMenu = () => { clearRouteData(); goToMenu() }
  const handleGoToEditor = () => goToEditor()

  // Render
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

function getZoneTransitionCallout(character) {
  const callouts = {
    [ROUTE_CHARACTER.TECHNICAL]: 'Technical section ahead',
    [ROUTE_CHARACTER.TRANSIT]: 'Highway ahead, relax',
    [ROUTE_CHARACTER.SPIRITED]: 'Back to spirited',
    [ROUTE_CHARACTER.URBAN]: 'Urban zone'
  }
  return callouts[character] || null
}
