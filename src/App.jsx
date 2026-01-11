import { useEffect, useRef } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateEarlyWarning, generateFinalWarning, generateStraightCallout, generatePostCurveCallout } from './hooks/useSpeech'

// Components
import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'

// ================================
// Rally Co-Pilot App - v9
// Progressive callouts + straight sections
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
  const straightCalledRef = useRef(new Set())  // Straight sections announced
  const lastCalloutTimeRef = useRef(0)
  const lastCurvePassedRef = useRef(null)      // Track last curve we passed for post-curve callouts
  
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
    straightCalledRef.current = new Set()
    lastCurvePassedRef.current = null
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
        return
      }
    }

    // STRAIGHT SECTION CALLOUTS - Frequent nudges for continuous awareness
    // More nudge points for constant communication
    if (distance > 150) {
      const straightDistance = distance
      
      // Define many nudge points for continuous updates
      const nudgePoints = [
        { dist: 1200, key: 'very-far' },  // Very long straight
        { dist: 800, key: 'far' },         // Long straight
        { dist: 500, key: 'mid' },         // Mid point
        { dist: 350, key: 'approaching' }, // Getting closer
        { dist: 250, key: 'near' },        // Almost there
        { dist: 180, key: 'soon' }         // Very close
      ]
      
      for (const nudge of nudgePoints) {
        const nudgeKey = `straight-${curveId}-${nudge.key}`
        
        // Check if we're in the right distance band and haven't called this nudge yet
        if (straightDistance >= nudge.dist && !straightCalledRef.current.has(nudgeKey)) {
          let callout = ''
          const distText = getDistanceText(straightDistance, settings.speedUnit)
          const nextCharacter = nextCurve ? getCurveCharacter(nextCurve) : ''
          const nextDir = nextCurve?.direction === 'LEFT' ? 'left' : 'right'
          
          if (nudge.key === 'very-far' && straightDistance >= 1200) {
            // Very long straight
            callout = `Long clear stretch ahead. Cruise at ${getStraightSpeed(mode, settings.speedUnit)}. ${nextCharacter} ${nextDir} in ${distText}.`
          } else if (nudge.key === 'far' && straightDistance >= 800 && straightDistance < 1200) {
            // Long straight
            callout = generateStraightCallout(straightDistance, mode, settings.speedUnit, nextCurve)
          } else if (nudge.key === 'mid' && straightDistance >= 500 && straightDistance < 800) {
            // Mid-straight reminder
            callout = nextCurve 
              ? `Still clear. ${nextCharacter} ${nextDir} in ${distText}.`
              : `Clear for ${distText}. Hold your speed.`
          } else if (nudge.key === 'approaching' && straightDistance >= 350 && straightDistance < 500) {
            // Approaching curve
            if (nextCurve) {
              const targetSpeed = getSpeedForSeverity(nextCurve.severity, mode, settings.speedUnit)
              callout = `${nextCharacter} ${nextDir} ahead in ${distText}. Target ${targetSpeed}.`
            }
          } else if (nudge.key === 'near' && straightDistance >= 250 && straightDistance < 350) {
            // Getting close
            if (nextCurve) {
              callout = `${nextCharacter} ${nextDir} coming up. ${distText}.`
            }
          } else if (nudge.key === 'soon' && straightDistance >= 180 && straightDistance < 250) {
            // Almost at the curve
            if (nextCurve && nextCurve.severity >= 3) {
              callout = `Get ready. ${nextCharacter} ${nextDir} soon.`
            }
          }
          
          if (callout) {
            console.log(`🔊 STRAIGHT (${nudge.key}):`, callout)
            speak(callout, nudge.key === 'soon' || nudge.key === 'near' ? 'high' : 'normal')
            straightCalledRef.current.add(nudgeKey)
            lastCalloutTimeRef.current = now
            return // Exit after speaking
          }
        }
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak])

// Helper function for straight speed
function getStraightSpeed(mode, speedUnit) {
  const speeds = { cruise: 55, fast: 65, race: 75 }
  let speed = speeds[mode] || 55
  if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
  return speed
}

// Helper function for curve speed
function getSpeedForSeverity(severity, mode, speedUnit) {
  const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
  const mult = { cruise: 1.0, fast: 1.15, race: 1.3 }
  let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
  if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
  return speed
}

// Helper functions for straight callouts
function getDistanceText(distanceMeters, speedUnit = 'mph') {
  if (!distanceMeters || distanceMeters < 0) return 'ahead'
  
  if (speedUnit === 'kmh') {
    if (distanceMeters >= 1000) {
      const km = Math.round(distanceMeters / 100) / 10
      return `${km} kilometers`
    } else if (distanceMeters >= 200) {
      return `${Math.round(distanceMeters / 50) * 50} meters`
    }
    return `${Math.round(distanceMeters)} meters`
  } else {
    const feet = distanceMeters * 3.28084
    if (feet >= 2640) {
      const miles = Math.round(feet / 528) / 10
      return `${miles} miles`
    } else if (feet >= 1000) {
      return `${Math.round(feet / 100) * 100} feet`
    }
    return `${Math.round(feet / 50) * 50} feet`
  }
}

function getCurveCharacter(curve) {
  if (!curve) return ''
  const severity = curve.severity
  const length = curve.length || 0
  
  if (severity <= 2 && length > 150) return 'sweeping'
  if (severity <= 1) return 'gentle'
  if (severity === 2) return 'easy'
  if (severity === 3) return 'moderate'
  if (severity === 4) return 'tight'
  if (severity === 5) return 'sharp'
  return 'very sharp'
}

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
    
    // Clean up straight callouts for passed curves
    straightCalledRef.current.forEach(key => {
      const curveId = parseInt(key.split('-')[1])
      if (!upcomingIds.has(curveId)) {
        straightCalledRef.current.delete(key)
      }
    })
  }, [isRunning, upcomingCurves])

  // Handle starting navigation from preview
  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    straightCalledRef.current = new Set()
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
