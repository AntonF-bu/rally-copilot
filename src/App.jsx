import { useEffect, useRef } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateEarlyWarning, generateFinalWarning, generateStraightCallout, generateInSectionCallout } from './hooks/useSpeech'

import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'
import TripSummary from './components/TripSummary'

// Rally Co-Pilot App - v11
// Trip tracking + Speed display

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
    showTripSummary,
    routeMode,
    routeData,
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    speed,
    updateTripStats,
  } = useStore()

  const earlyWarningsRef = useRef(new Set())
  const mainCalloutsRef = useRef(new Set())
  const finalWarningsRef = useRef(new Set())
  const straightCalledRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  const inTechnicalSectionRef = useRef(null)
  const lastTripUpdateRef = useRef(0)
  const announcedCurvesRef = useRef(new Set()) // Track curves we've passed for trip stats
  
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
    inTechnicalSectionRef.current = null
    lastCalloutTimeRef.current = Date.now()
    announcedCurvesRef.current = new Set()
  }, [routeMode, routeData])

  // Update trip stats periodically
  useEffect(() => {
    if (!isRunning) return
    
    const now = Date.now()
    // Update every 500ms
    if (now - lastTripUpdateRef.current < 500) return
    lastTripUpdateRef.current = now
    
    // Check if any curves were just passed (distance < 20m and we announced them)
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

  // Progressive Callout Logic with Technical Section support
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) return

    const now = Date.now()
    const MIN_CALLOUT_INTERVAL = 1000
    
    if (now - lastCalloutTimeRef.current < MIN_CALLOUT_INTERVAL) return

    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    // For severity 1 curves, only announce if there's space (no other curves within 400m)
    // This avoids cluttering callouts on twisty roads but announces gentle curves on highways
    if (nextCurve.severity <= 1 && !nextCurve.isChicane && !nextCurve.isTechnicalSection) {
      const secondCurve = upcomingCurves[1]
      // If there's another curve coming soon, skip the severity 1
      if (secondCurve && secondCurve.distance < 500) {
        return
      }
    }
    
    // For chicanes, skip only if ALL curves are severity 1 AND curves are bunched
    if (nextCurve.isChicane) {
      const severities = nextCurve.severitySequence?.split('-').map(Number) || [1]
      const maxSev = Math.max(...severities)
      if (maxSev <= 1) {
        const secondCurve = upcomingCurves[1]
        if (secondCurve && secondCurve.distance < 500) {
          return
        }
      }
    }

    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 8)
    const distance = nextCurve.distance
    
    // Tighter timing - announce closer to the curve
    const earlyDistance = Math.max(350, speedMps * 8)
    const mainDistance = Math.max(150, speedMps * 4)
    const finalDistance = Math.max(40, speedMps * 1.2)

    const isHardCurve = nextCurve.severity >= 4
    const curveId = nextCurve.id

    // Handle technical sections
    if (nextCurve.isTechnicalSection) {
      // Announce entry to technical section
      if (distance <= mainDistance && !mainCalloutsRef.current.has(curveId)) {
        const callout = generateCallout(nextCurve, mode, settings.speedUnit, null, 'main')
        speak(callout, 'high')
        mainCalloutsRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutTimeRef.current = now
        inTechnicalSectionRef.current = nextCurve
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 100])
        }
        return
      }
      
      // Final warning for technical section
      if (distance <= finalDistance && !finalWarningsRef.current.has(curveId) && mainCalloutsRef.current.has(curveId)) {
        const callout = generateFinalWarning(nextCurve, mode, settings.speedUnit)
        speak(callout, 'high')
        finalWarningsRef.current.add(curveId)
        lastCalloutTimeRef.current = now
        return
      }
    }

    // Regular curve callouts
    // EARLY WARNING
    if (isHardCurve && 
        distance <= earlyDistance && 
        distance > mainDistance &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateEarlyWarning(nextCurve, mode, settings.speedUnit)
      speak(callout, 'normal')
      earlyWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now
      return
    }

    // MAIN CALLOUT
    if (distance <= mainDistance && 
        distance > finalDistance &&
        !mainCalloutsRef.current.has(curveId)) {
      
      const secondCurve = upcomingCurves[1]
      let includeSecond = null
      
      // Check if second curve is close enough to include in callout
      if (secondCurve && !secondCurve.isChicane && !secondCurve.isTechnicalSection) {
        // Use the distance from upcoming curves (already calculated relative to position)
        const gapToSecond = secondCurve.distance - distance
        
        // If second curve is within 200m of first, include it
        if (gapToSecond < 200 && gapToSecond > 0) {
          includeSecond = secondCurve
          console.log(`🔊 Including close curve: ${secondCurve.direction} ${secondCurve.severity} (gap: ${Math.round(gapToSecond)}m)`)
        }
      }
      
      const callout = generateCallout(nextCurve, mode, settings.speedUnit, includeSecond, 'main')
      speak(callout, 'high')
      
      mainCalloutsRef.current.add(curveId)
      setLastAnnouncedCurveId(curveId)
      lastCalloutTimeRef.current = now
      
      // IMPORTANT: If we included the second curve in the callout, mark it as announced too
      if (includeSecond) {
        mainCalloutsRef.current.add(includeSecond.id)
        console.log(`🔊 Marked curve ${includeSecond.id} as announced (included in combo callout)`)
      }

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
        navigator.vibrate(pattern)
      }
      return
    }

    // FINAL WARNING
    if (isHardCurve &&
        distance <= finalDistance && 
        distance > 15 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateFinalWarning(nextCurve, mode, settings.speedUnit)
      speak(callout, 'high')
      
      finalWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate([150])
      }
      return
    }

    // Check second curve
    const secondCurve = upcomingCurves[1]
    if (secondCurve && 
        mainCalloutsRef.current.has(curveId) &&
        !mainCalloutsRef.current.has(secondCurve.id)) {
      
      const secondDistance = secondCurve.distance
      const secondMainDistance = Math.max(200, speedMps * 5)
      
      if (secondDistance <= secondMainDistance && secondDistance > 50) {
        const callout = generateCallout(secondCurve, mode, settings.speedUnit, upcomingCurves[2], 'main')
        speak(callout, 'high')
        
        mainCalloutsRef.current.add(secondCurve.id)
        setLastAnnouncedCurveId(secondCurve.id)
        lastCalloutTimeRef.current = now
        return
      }
    }

    // STRAIGHT SECTION CALLOUTS
    if (distance > 600 && !straightCalledRef.current.has(`straight-${curveId}`)) {
      const callout = generateStraightCallout(distance, mode, settings.speedUnit, nextCurve)
      speak(callout, 'normal')
      straightCalledRef.current.add(`straight-${curveId}`)
      lastCalloutTimeRef.current = now
    }

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak])

  // Clear old curve warnings when passed
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    ;[earlyWarningsRef, mainCalloutsRef, finalWarningsRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!upcomingIds.has(id)) ref.current.delete(id)
      })
    })
    
    straightCalledRef.current.forEach(key => {
      const curveId = parseInt(key.split('-')[1])
      if (!upcomingIds.has(curveId)) straightCalledRef.current.delete(key)
    })
  }, [isRunning, upcomingCurves])

  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    straightCalledRef.current = new Set()
    inTechnicalSectionRef.current = null
    announcedCurvesRef.current = new Set()
    goToDriving()
  }

  const handleBackFromPreview = () => {
    clearRouteData()
    goToMenu()
  }

  // SCREEN 1: Route Selector
  if (showRouteSelector) return <RouteSelector />

  // SCREEN 2: Trip Summary (Strava-style)
  if (showTripSummary) return <TripSummary />

  // SCREEN 3: Route Preview
  if (showRoutePreview) {
    return (
      <RoutePreview 
        onStartNavigation={handleStartNavigation}
        onBack={handleBackFromPreview}
      />
    )
  }

  // SCREEN 4: Main Driving UI
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
