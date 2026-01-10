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

// ================================
// Rally Co-Pilot App
// Map-focused minimal UI
// ================================

export default function App() {
  // Initialize simulation
  useSimulation()
  
  const { speak } = useSpeech()
  
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    lastAnnouncedCurveId,
    setLastAnnouncedCurveId,
    getDisplaySpeed
  } = useStore()

  const currentSpeed = getDisplaySpeed()

  // ================================
  // Callout Logic - Distance-based triggering
  // ================================
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve || nextCurve.id === lastAnnouncedCurveId) {
      return
    }

    // Calculate announce distance based on speed
    // At 30mph (~13m/s), 5 seconds = ~65m
    // At 60mph (~27m/s), 5 seconds = ~135m
    // We'll use a minimum of 150m and scale with speed
    const speedMps = (currentSpeed * 1609.34) / 3600 // Convert mph to m/s
    const announceDistance = Math.max(150, speedMps * settings.calloutTiming)
    
    // Add GPS lag offset (convert seconds to approximate meters)
    const adjustedDistance = announceDistance + (settings.gpsLagOffset * speedMps)

    // Announce when curve is within trigger distance
    // But not if we're already past it (distance < 20m)
    if (nextCurve.distance <= adjustedDistance && nextCurve.distance > 20) {
      const callout = generateCallout(nextCurve, mode, settings.speedUnit)
      speak(callout, 'high')
      setLastAnnouncedCurveId(nextCurve.id)

      // Haptic feedback
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

  // ================================
  // Render - Map-focused layout
  // ================================

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden">
      {/* Full-screen Map (base layer) */}
      <Map />
      
      {/* Callout Overlay (top) */}
      <CalloutOverlay />
      
      {/* Voice Indicator (middle) */}
      <VoiceIndicator />
      
      {/* Bottom Controls (minimal) */}
      <BottomBar />
      
      {/* Settings Modal */}
      <SettingsPanel />
    </div>
  )
}
