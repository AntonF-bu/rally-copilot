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
  // Triggers 200-400m before curve
  // ================================
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve || nextCurve.id === lastAnnouncedCurveId) {
      return
    }

    // Fixed announce distance: 250m minimum, or 6 seconds at current speed
    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 10) // min 10 m/s
    const timeBasedDistance = speedMps * settings.calloutTiming
    const announceDistance = Math.max(250, timeBasedDistance)

    // Debug log
    console.log(`Curve ${nextCurve.id}: dist=${nextCurve.distance}m, trigger=${Math.round(announceDistance)}m`)

    // Trigger when within announce distance
    if (nextCurve.distance <= announceDistance) {
      console.log(`🎤 Announcing curve ${nextCurve.id}`)
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
