import { useEffect } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useSpeech, generateCallout } from './hooks/useSpeech'

// Components
import Map from './components/Map'
import CalloutDisplay from './components/CalloutDisplay'
import BottomPanel from './components/BottomPanel'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'

// ================================
// Rally Co-Pilot App
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
    const speedMps = (currentSpeed * 1609.34) / 3600 // mph to m/s
    const adjustedSpeed = Math.max(speedMps, 5) // min 5 m/s
    const timeToReach = nextCurve.distance / adjustedSpeed
    const adjustedTime = timeToReach + settings.gpsLagOffset

    // Announce if within timing window
    if (adjustedTime <= settings.calloutTiming && adjustedTime > 0.5) {
      const callout = generateCallout(nextCurve, mode, settings.speedUnit)
      speak(callout, 'high')
      setLastAnnouncedCurveId(nextCurve.id)

      // Haptic feedback
      if (settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate(50)
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
  // Render
  // ================================

  return (
    <div className="h-screen w-screen overflow-hidden bg-rally-dark">
      {/* Full-screen Map */}
      <Map />
      
      {/* Callout Overlay (top) */}
      <CalloutDisplay />
      
      {/* Bottom Control Panel */}
      <BottomPanel />
      
      {/* Settings Modal */}
      <SettingsPanel />
      
      {/* Voice Indicator */}
      <VoiceIndicator />
    </div>
  )
}
