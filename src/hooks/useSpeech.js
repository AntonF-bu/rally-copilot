import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Synthesis Hook
// ================================

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Speech synthesis not supported')
      return
    }

    synthRef.current = window.speechSynthesis

    const loadVoices = () => {
      const voices = synthRef.current.getVoices()
      
      // Find a good English voice
      voiceRef.current = voices.find(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Daniel') || 
         v.name.includes('Samantha') || 
         v.name.includes('Alex') ||
         v.name.includes('Karen'))
      ) || voices.find(v => v.lang.startsWith('en-US')) 
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0]

      if (voices.length > 0) {
        setIsReady(true)
        setError(null)
      }
    }

    // Load voices (async in some browsers)
    loadVoices()
    synthRef.current.onvoiceschanged = loadVoices

    // Fallback timeout
    const timeout = setTimeout(() => {
      if (!isReady) setIsReady(true)
    }, 1000)

    return () => {
      clearTimeout(timeout)
      synthRef.current?.cancel()
    }
  }, [])

  // Speak text
  const speak = useCallback((text, priority = 'normal') => {
    if (!settings.voiceEnabled || !synthRef.current) {
      return false
    }

    try {
      // Cancel current speech if high priority
      if (priority === 'high') {
        synthRef.current.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(text)

      // Set voice
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }

      // Adjust rate based on driving mode
      const rateMap = { cruise: 1.0, fast: 1.1, race: 1.2 }
      utterance.rate = rateMap[mode] || 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Event handlers
      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = (e) => {
        console.error('Speech error:', e)
        setSpeaking(false, '')
        setError('Voice playback failed')
      }

      synthRef.current.speak(utterance)
      return true

    } catch (err) {
      console.error('Speech error:', err)
      setError('Could not play voice')
      return false
    }
  }, [settings.voiceEnabled, mode, setSpeaking])

  // Cancel current speech
  const cancel = useCallback(() => {
    synthRef.current?.cancel()
    setSpeaking(false, '')
  }, [setSpeaking])

  // Test voice
  const test = useCallback(() => {
    speak('Rally co-pilot ready. Left 3 tightens, 45.', 'high')
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

  const parts = []

  // Direction and severity
  parts.push(`${curve.direction} ${curve.severity}`)

  // Modifier if present
  if (curve.modifier) {
    parts.push(curve.modifier.toLowerCase())
  }

  // Speed recommendation
  parts.push(String(displaySpeed))

  return parts.join(', ')
}

export default useSpeech
