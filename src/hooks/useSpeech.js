import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - Improved Voice Quality
// ================================

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)

  // Initialize and find the best voice
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Speech not supported')
      return
    }

    synthRef.current = window.speechSynthesis

    const findBestVoice = () => {
      const voices = synthRef.current.getVoices()
      if (voices.length === 0) return

      // Priority order for natural-sounding voices
      const preferredVoices = [
        // iOS Premium voices (these sound great)
        'Samantha',
        'Daniel',
        'Karen',
        'Moira',
        'Tessa',
        // macOS voices
        'Alex',
        'Ava',
        'Tom',
        // Google voices (if available)
        'Google UK English Male',
        'Google UK English Female',
        'Google US English',
      ]

      // Try to find a preferred voice
      for (const preferred of preferredVoices) {
        const found = voices.find(v => 
          v.name.includes(preferred) && v.lang.startsWith('en')
        )
        if (found) {
          voiceRef.current = found
          console.log('Selected voice:', found.name)
          break
        }
      }

      // Fallback to any English voice
      if (!voiceRef.current) {
        voiceRef.current = voices.find(v => v.lang.startsWith('en-')) || 
                          voices.find(v => v.lang.startsWith('en')) ||
                          voices[0]
      }

      setIsReady(true)
      setError(null)
    }

    findBestVoice()
    synthRef.current.onvoiceschanged = findBestVoice

    // Fallback timeout
    const timeout = setTimeout(() => setIsReady(true), 1500)

    return () => {
      clearTimeout(timeout)
      synthRef.current?.cancel()
    }
  }, [])

  // Main speak function
  const speak = useCallback((text, priority = 'normal') => {
    if (!settings.voiceEnabled || !synthRef.current) return false

    try {
      if (priority === 'high') {
        synthRef.current.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(text)

      // Use selected voice
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }

      // Adjust speech parameters for more natural sound
      // Slightly slower and lower pitch sounds more natural
      const modeSettings = {
        cruise: { rate: 0.95, pitch: 0.95 },
        fast: { rate: 1.0, pitch: 1.0 },
        race: { rate: 1.1, pitch: 1.0 }
      }

      const { rate, pitch } = modeSettings[mode] || modeSettings.cruise
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = 1.0

      // Events
      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = (e) => {
        console.error('Speech error:', e)
        setSpeaking(false, '')
      }

      synthRef.current.speak(utterance)
      return true

    } catch (err) {
      console.error('Speech error:', err)
      setError('Voice playback failed')
      return false
    }
  }, [settings.voiceEnabled, mode, setSpeaking])

  // Cancel speech
  const cancel = useCallback(() => {
    synthRef.current?.cancel()
    setSpeaking(false, '')
  }, [setSpeaking])

  // Test voice with sample callout
  const test = useCallback(() => {
    speak('Left 3, tightens. 45.', 'high')
  }, [speak])

  return {
    speak,
    cancel,
    test,
    isReady,
    error
  }
}

// ================================
// Generate Callout Text
// ================================

export function generateCallout(curve, mode, speedUnit) {
  const speedKey = `speed${mode.charAt(0).toUpperCase() + mode.slice(1)}`
  const speed = curve[speedKey] || curve.speedCruise
  const displaySpeed = speedUnit === 'kmh' ? Math.round(speed * 1.609) : speed

  // Build callout parts
  const parts = []

  // Direction and severity
  parts.push(`${curve.direction} ${curve.severity}`)

  // Modifier
  if (curve.modifier) {
    parts.push(curve.modifier.toLowerCase())
  }

  // Speed
  parts.push(String(displaySpeed))

  // Join with proper pauses (commas create natural pauses in TTS)
  return parts.join('. ') + '.'
}

export default useSpeech
