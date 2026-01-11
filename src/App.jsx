import { useEffect, useRef } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateEarlyWarning, generateFinalWarning } from './hooks/useSpeech'

// Components
import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'

// ================================
// Rally Co-Pilot App - v8
// Progressive callouts: early, main, final
// ================================

export default function App() {
  const { speak } = useSpeech()
  
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    setLastAnnouncedCurveId,
    getDisplaySpeed,
    showRouteSelector,
    showRoutePreview,
    routeMode,
    routeData,
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData
  } = useStore()

  // Track which curves have had which callout phases
  const earlyWarningsRef = useRef(new Set())   // Early "heads up" given
  const mainCalloutsRef = useRef(new Set())    // Main callout given
  const finalWarningsRef = useRef(new Set())   // Final "NOW" given
  const lastCalloutTimeRef = useRef(0)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Reset callout tracking when route changes
  useEffect(() => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    lastCalloutTimeRef.current = Date.now()
  }, [routeMode, routeData])

  // Progressive Callout Logic
  useEffect(() => {
    // Always log state for debugging
    console.log('🔊 Callout check:', {
      isRunning,
      voiceEnabled: settings.voiceEnabled,
      curvesCount: upcomingCurves.length,
      nextCurve: upcomingCurves[0] ? {
        id: upcomingCurves[0].id,
        distance: upcomingCurves[0].distance,
        severity: upcomingCurves[0].severity
      } : null,
      currentSpeed,
      earlySet: Array.from(earlyWarningsRef.current),
      mainSet: Array.from(mainCalloutsRef.current)
    })

    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      console.log('🔊 Skipping - isRunning:', isRunning, 'voiceEnabled:', settings.voiceEnabled, 'curves:', upcomingCurves.length)
      return
    }

    const now = Date.now()
    const MIN_CALLOUT_INTERVAL = 1500 // Reduced for progressive warnings
    
    if (now - lastCalloutTimeRef.current < MIN_CALLOUT_INTERVAL) {
      console.log('🔊 Skipping - too soon, wait', MIN_CALLOUT_INTERVAL - (now - lastCalloutTimeRef.current), 'ms')
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return

    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 8) // min 8 m/s for calculations
    const distance = nextCurve.distance
    
    // Calculate dynamic distances based on speed
    const earlyDistance = Math.max(400, speedMps * 10)    // ~10 seconds out
    const mainDistance = Math.max(200, speedMps * 5)      // ~5 seconds out  
    const finalDistance = Math.max(50, speedMps * 1.5)    // ~1.5 seconds out

    console.log('🔊 Distances:', { distance, earlyDistance, mainDistance, finalDistance, speedMps })

    const isHardCurve = nextCurve.severity >= 4
    const curveId = nextCurve.id

    // EARLY WARNING - Heads up for what's coming (only for harder curves)
    if (isHardCurve && 
        distance <= earlyDistance && 
        distance > mainDistance &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateEarlyWarning(nextCurve, mode, settings.speedUnit)
      console.log('🔊 EARLY:', callout)
      speak(callout, 'normal')
      
      earlyWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now
      return
    }

    // MAIN CALLOUT - Full details with distance
    if (distance <= mainDistance && 
        distance > finalDistance &&
        !mainCalloutsRef.current.has(curveId)) {
      
      const secondCurve = upcomingCurves[1]
      let includeSecond = null
      
      if (secondCurve && !secondCurve.isChicane) {
        const distanceToSecond = secondCurve.distanceFromStart - (nextCurve.distanceFromStart + nextCurve.length)
        if (distanceToSecond < 150 && distanceToSecond >= 0) {
          includeSecond = secondCurve
        }
      }
      
      const callout = generateCallout(nextCurve, mode, settings.speedUnit, includeSecond, 'main')
      console.log('🔊 MAIN:', callout)
      speak(callout, 'high')
      
      mainCalloutsRef.current.add(curveId)
      setLastAnnouncedCurveId(curveId)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
        navigator.vibrate(pattern)
      }
      return
    }

    // FINAL WARNING - Action cue (only for hard curves, only if main was given)
    if (isHardCurve &&
        distance <= finalDistance && 
        distance > 15 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateFinalWarning(nextCurve, mode, settings.speedUnit)
      console.log('🔊 FINAL:', callout)
      speak(callout, 'high')
      
      finalWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate([150])
      }
      return
    }

    // Check second curve if first is already fully announced
    const secondCurve = upcomingCurves[1]
    if (secondCurve && 
        mainCalloutsRef.current.has(curveId) &&
        !mainCalloutsRef.current.has(secondCurve.id)) {
      
      const secondDistance = secondCurve.distance
      const secondMainDistance = Math.max(200, speedMps * 5)
      
      if (secondDistance <= secondMainDistance && secondDistance > 50) {
        const callout = generateCallout(secondCurve, mode, settings.speedUnit, upcomingCurves[2], 'main')
        console.log('🔊 MAIN (2nd):', callout)
        speak(callout, 'high')
        
        mainCalloutsRef.current.add(secondCurve.id)
        setLastAnnouncedCurveId(secondCurve.id)
        lastCalloutTimeRef.current = now
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak])

  // Clear old curve warnings when passed
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    // Clean up refs for curves no longer in view
    ;[earlyWarningsRef, mainCalloutsRef, finalWarningsRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!upcomingIds.has(id)) {
          ref.current.delete(id)
        }
      })
    })
  }, [isRunning, upcomingCurves])

  // Handle starting navigation from preview
  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    goToDriving()
  }

  // Handle going back from preview to selector
  const handleBackFromPreview = () => {
    clearRouteData()
    goToMenu()
  }

  // Debug log
  console.log('App render - showRouteSelector:', showRouteSelector, 'showRoutePreview:', showRoutePreview, 'isRunning:', isRunning)

  // SCREEN 1: Route Selector
  if (showRouteSelector) {
    return <RouteSelector />
  }

  // SCREEN 2: Route Preview
  if (showRoutePreview) {
    return (
      <RoutePreview 
        onStartNavigation={handleStartNavigation}
        onBack={handleBackFromPreview}
      />
    )
  }

  // SCREEN 3: Main Driving UI (default when both are false)
  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden">
      <Map />
      <CalloutOverlay />
      <VoiceIndicator />
      <BottomBar />
      <SettingsPanel />
    </div>
  )
}
