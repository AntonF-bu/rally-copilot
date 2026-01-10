import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Native Fallback
// ================================

// Adam voice ID from ElevenLabs
const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [useElevenLabs, setUseElevenLabs] = useState(true)
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)

  // Initialize native speech as fallback
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element for ElevenLabs
    audioRef.current = new Audio()
    audioRef.current.onended = () => setSpeaking(false, '')
    audioRef.current.onerror = () => {
      console.log('ElevenLabs audio error, falling back to native')
      setUseElevenLabs(false)
    }

    // Initialize native speech synthesis as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return

        // Find best native voice
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Alex', 'Ava']
        for (const name of preferred) {
          const found = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
          if (found) {
            voiceRef.current = found
            break
          }
        }
        if (!voiceRef.current) {
          voiceRef.current = voices.find(v => v.lang.startsWith('en')) || voices[0]
        }
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
    }

    setIsReady(true)

    return () => {
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Speak using ElevenLabs
  const speakElevenLabs = useCallback(async (text) => {
    try {
      setSpeaking(true, text)

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          voiceId: ELEVENLABS_VOICE_ID
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      audioRef.current.src = audioUrl
      await audioRef.current.play()

      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      setError('Premium voice unavailable')
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking])

  // Speak using native speech synthesis
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }

      // Optimize for natural sound
      const modeSettings = {
        cruise: { rate: 0.95, pitch: 0.95 },
        fast: { rate: 1.0, pitch: 1.0 },
        race: { rate: 1.1, pitch: 1.0 }
      }
      const { rate, pitch } = modeSettings[mode] || modeSettings.cruise
      
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = 1.0

      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = () => setSpeaking(false, '')

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [mode, setSpeaking])

  // Main speak function - tries ElevenLabs first, falls back to native
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled) return false

    // Cancel any current speech
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }

    // Try ElevenLabs first
    if (useElevenLabs) {
      const success = await speakElevenLabs(text)
      if (success) return true
      
      // If ElevenLabs fails, fall back to native
      console.log('Falling back to native voice')
      setUseElevenLabs(false)
    }

    // Use native speech
    return speakNative(text)
  }, [settings.voiceEnabled, useElevenLabs, speakElevenLabs, speakNative])

  // Cancel speech
  const cancel = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    setSpeaking(false, '')
  }, [setSpeaking])

  // Test voice
  const test = useCallback(() => {
    speak('Left 3. Tightens. 45.', 'high')
  }, [speak])

  // Toggle between ElevenLabs and native
  const toggleVoiceType = useCallback(() => {
    setUseElevenLabs(prev => !prev)
  }, [])

  return {
    speak,
    cancel,
    test,
    isReady,
    error,
    useElevenLabs,
    toggleVoiceType
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

  // Modifier
  if (curve.modifier) {
    parts.push(curve.modifier.toLowerCase())
  }

  // Speed
  parts.push(String(displaySpeed))

  // Use periods for natural pauses
  return parts.join('. ') + '.'
}

export default useSpeech
