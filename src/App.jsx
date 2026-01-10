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
  // Callout Logic
  // ================================
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const nextCurve = upcomingCurves[0]
    if (!nextCurve || nextCurve.id === lastAnnouncedCurveId) {
      return
    }

    // Calculate time to curve
    const speedMps = (currentSpeed * 1609.34) / 3600
    const adjustedSpeed = Math.max(speedMps, 5)
    const timeToReach = nextCurve.distance / adjustedSpeed
    const adjustedTime = timeToReach + settings.gpsLagOffset

    // Announce when within timing window
    if (adjustedTime <= settings.calloutTiming && adjustedTime > 0.5) {
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
