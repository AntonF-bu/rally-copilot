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
// Rally Co-Pilot App - v7
// Uses goToMenu, goToPreview, goToDriving
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
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData
  } = useStore()

  const announcedCurvesRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Reset announced curves when route changes
  useEffect(() => {
    announcedCurvesRef.current = new Set()
    lastCalloutTimeRef.current = Date.now() // Prevent immediate callout after route change
  }, [routeMode, routeData])

  // Callout Logic
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const now = Date.now()
    const MIN_CALLOUT_INTERVAL = 2500
    
    if (now - lastCalloutTimeRef.current < MIN_CALLOUT_INTERVAL) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return
    
    if (announcedCurvesRef.current.has(nextCurve.id)) {
      const secondCurve = upcomingCurves[1]
      if (secondCurve && !announcedCurvesRef.current.has(secondCurve.id)) {
        const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10)
        const timeBasedDistance = speedMps * (settings.calloutTiming || 6)
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

    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10)
    const timeBasedDistance = speedMps * (settings.calloutTiming || 6)
    const announceDistance = Math.max(250, timeBasedDistance)

    if (nextCurve.distance <= announceDistance) {
      const secondCurve = upcomingCurves[1]
      let includeSecond = null
      
      if (secondCurve && !secondCurve.isChicane) {
        const distanceToSecond = secondCurve.distanceFromStart - (nextCurve.distanceFromStart + nextCurve.length)
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
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    announcedCurvesRef.current.forEach(id => {
      if (!upcomingIds.has(id)) {
        announcedCurvesRef.current.delete(id)
      }
    })
  }, [isRunning, upcomingCurves])

  // Handle starting navigation from preview
  const handleStartNavigation = () => {
    announcedCurvesRef.current = new Set()
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
