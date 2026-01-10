import { useEffect, useRef } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout } from './hooks/useSpeech'

// Components
import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'

// ================================
// Rally Co-Pilot App
// v3: Improved callout sequencing
// ================================

export default function App() {
  const { speak, isSpeaking } = useSpeech()
  
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    lastAnnouncedCurveId,
    setLastAnnouncedCurveId,
    getDisplaySpeed,
    showRouteSelector,
    showRoutePreview,
    setShowRoutePreview,
    setShowRouteSelector,
    routeMode,
    startDrive,
    clearRouteData
  } = useStore()

  // Track announced curves to prevent cut-offs
  const announcedCurvesRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  
  // Only use simulation for demo mode
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode)
  useGeolocation()
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Reset announced curves when route changes
  useEffect(() => {
    announcedCurvesRef.current = new Set()
  }, [routeMode])

  // Improved Callout Logic
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const now = Date.now()
    const MIN_CALLOUT_INTERVAL = 2500 // Minimum 2.5 seconds between callouts
    
    // Don't interrupt ongoing speech too quickly
    if (now - lastCalloutTimeRef.current < MIN_CALLOUT_INTERVAL) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    // Skip if already announced this curve
    if (announcedCurvesRef.current.has(nextCurve.id)) {
      // Check if there's a second curve to announce
      const secondCurve = upcomingCurves[1]
      if (secondCurve && !announcedCurvesRef.current.has(secondCurve.id)) {
        // Announce second curve if it's getting close
        const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10)
        const timeBasedDistance = speedMps * settings.calloutTiming
        const announceDistance = Math.max(200, timeBasedDistance)
        
        if (secondCurve.distance <= announceDistance) {
          const callout = generateCallout(secondCurve, mode, settings.speedUnit)
          speak(callout, 'high')
          announcedCurvesRef.current.add(secondCurve.id)
          setLastAnnouncedCurveId(secondCurve.id)
          lastCalloutTimeRef.current = now
          
          if (settings.hapticFeedback && 'vibrate' in navigator) {
            navigator.vibrate([50])
          }
        }
      }
      return
    }

    // Calculate announce distance based on speed
    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10)
    const timeBasedDistance = speedMps * settings.calloutTiming
    const announceDistance = Math.max(250, timeBasedDistance)

    if (nextCurve.distance <= announceDistance) {
      // Check for close following curve to include in callout
      const secondCurve = upcomingCurves[1]
      let includeSecond = null
      
      if (secondCurve && !secondCurve.isChicane) {
        const distanceToSecond = secondCurve.distanceFromStart - (nextCurve.distanceFromStart + nextCurve.length)
        // Include second curve if it's within 100m
        if (distanceToSecond < 100 && distanceToSecond >= 0) {
          includeSecond = secondCurve
        }
      }
      
      const callout = generateCallout(nextCurve, mode, settings.speedUnit, includeSecond)
      speak(callout, 'high')
      
      announcedCurvesRef.current.add(nextCurve.id)
      if (includeSecond) {
        announcedCurvesRef.current.add(includeSecond.id)
      }
      
      setLastAnnouncedCurveId(nextCurve.id)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
        navigator.vibrate(pattern)
      }
    }
  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak])

  // Clear announced curves when passed
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    // Get IDs of upcoming curves
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    // Remove passed curves from announced set
    announcedCurvesRef.current.forEach(id => {
      if (!upcomingIds.has(id)) {
        announcedCurvesRef.current.delete(id)
      }
    })
  }, [isRunning, upcomingCurves])

  // Handle starting navigation from preview
  const handleStartNavigation = () => {
    setShowRoutePreview(false)
    announcedCurvesRef.current = new Set()
    startDrive()
  }

  // Handle going back from preview to selector
  const handleBackFromPreview = () => {
    setShowRoutePreview(false)
    setShowRouteSelector(true)
    clearRouteData()
  }

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

  // SCREEN 3: Main Driving UI
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
