import { useEffect } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useSpeech, generateCallout } from './hooks/useSpeech'

// Components
import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'

// ================================
// Rally Co-Pilot App
// ================================

export default function App() {
  const { speak } = useSpeech()
  
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    lastAnnouncedCurveId,
    setLastAnnouncedCurveId,
    getDisplaySpeed,
    showRouteSelector,
    setShowRouteSelector,
    routeMode
  } = useStore()

  // Initialize simulation (only for demo mode)
  useSimulation()

  const currentSpeed = getDisplaySpeed()

  // Handle route selection
  const handleStartRoute = (routeConfig) => {
    console.log('Starting route:', routeConfig)
    setShowRouteSelector(false)
    
    // TODO: Initialize appropriate mode
    // For now, all modes start the demo
    if (routeConfig.type === 'demo') {
      // Demo mode - use simulation
    } else if (routeConfig.type === 'lookahead') {
      // TODO: Start real GPS + look-ahead analysis
    } else if (routeConfig.type === 'destination') {
      // TODO: Geocode destination, get route, analyze
    } else if (routeConfig.type === 'import') {
      // TODO: Parse Google Maps URL, get route
    }
  }

  // Callout Logic
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve || nextCurve.id === lastAnnouncedCurveId) {
      return
    }

    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10)
    const timeBasedDistance = speedMps * settings.calloutTiming
    const announceDistance = Math.max(250, timeBasedDistance)

    if (nextCurve.distance <= announceDistance) {
      const callout = generateCallout(nextCurve, mode, settings.speedUnit)
      speak(callout, 'high')
      setLastAnnouncedCurveId(nextCurve.id)

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate([50])
      }
    }
  }, [
    isRunning,
    upcomingCurves,
    currentSpeed,
    mode,
    settings,
    lastAnnouncedCurveId,
    setLastAnnouncedCurveId,
    speak
  ])

  // Show route selector
  if (showRouteSelector) {
    return <RouteSelector onStartRoute={handleStartRoute} />
  }

  // Main driving UI
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
