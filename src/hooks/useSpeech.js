import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Queue Management
// Fixes: inconsistent voice, cutoffs, overlapping audio
// ================================

const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [useElevenLabs, setUseElevenLabs] = useState(true)
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const isPlayingRef = useRef(false)
  const queueRef = useRef([])

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element for ElevenLabs
    audioRef.current = new Audio()
    
    audioRef.current.onplay = () => {
      isPlayingRef.current = true
    }
    
    audioRef.current.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
      // Process next in queue
      processQueue()
    }
    
    audioRef.current.onerror = (e) => {
      console.log('Audio error:', e)
      isPlayingRef.current = false
      setSpeaking(false, '')
      processQueue()
    }

    // Initialize native speech as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return

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
      queueRef.current = []
    }
  }, [setSpeaking])

  // Process speech queue
  const processQueue = useCallback(() => {
    if (queueRef.current.length === 0) return
    if (isPlayingRef.current) return
    
    const next = queueRef.current.shift()
    if (next) {
      next()
    }
  }, [])

  // Speak using ElevenLabs (internal)
  const speakElevenLabsInternal = useCallback(async (text) => {
    try {
      isPlayingRef.current = true
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
      
      // Clean up previous URL
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src)
      }
      
      audioRef.current.src = audioUrl
      await audioRef.current.play()

      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      setError('Premium voice unavailable')
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking])

  // Speak using native (internal)
  const speakNativeInternal = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      const utterance = new SpeechSynthesisUtterance(text)
      
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }

      const modeSettings = {
        cruise: { rate: 0.95, pitch: 0.95 },
        fast: { rate: 1.0, pitch: 1.0 },
        race: { rate: 1.1, pitch: 1.0 }
      }
      const { rate, pitch } = modeSettings[mode] || modeSettings.cruise
      
      utterance.rate = rate
      utterance.pitch = pitch
      utterance.volume = 1.0

      utterance.onstart = () => {
        isPlayingRef.current = true
        setSpeaking(true, text)
      }
      utterance.onend = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
        processQueue()
      }
      utterance.onerror = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
        processQueue()
      }

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [mode, setSpeaking, processQueue])

  // Main speak function with queue management
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled) return false

    // High priority = clear queue and interrupt
    if (priority === 'high') {
      queueRef.current = []
      
      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      synthRef.current?.cancel()
      isPlayingRef.current = false
    }

    // If something is playing, queue this one (unless high priority)
    if (isPlayingRef.current && priority !== 'high') {
      // Don't queue too many
      if (queueRef.current.length < 2) {
        queueRef.current.push(() => speak(text, 'normal'))
      }
      return true
    }

    // Try ElevenLabs
    if (useElevenLabs) {
      const success = await speakElevenLabsInternal(text)
      if (success) return true
      
      console.log('Falling back to native voice')
      setUseElevenLabs(false)
    }

    // Fallback to native
    return speakNativeInternal(text)
  }, [settings.voiceEnabled, useElevenLabs, speakElevenLabsInternal, speakNativeInternal])

  // Cancel all speech
  const cancel = useCallback(() => {
    queueRef.current = []
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  // Test voice
  const test = useCallback(() => {
    cancel() // Clear any existing
    speak('Left 3. Tightens. 45.', 'high')
  }, [speak, cancel])

  // Toggle voice type
  const toggleVoiceType = useCallback(() => {
    setUseElevenLabs(prev => !prev)
    setError(null)
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

  // Periods create natural pauses in ElevenLabs
  return parts.join('. ') + '.'
}

export default useSpeech
