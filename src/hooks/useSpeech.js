import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Native Fallback
// Voice ID: puLAe8o1npIDg374vYZp
// ================================

// Your specified ElevenLabs voice ID
const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null)
  const [useElevenLabs, setUseElevenLabs] = useState(true)
  
  const audioRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element for ElevenLabs
    audioRef.current = new Audio()
    audioRef.current.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
      processQueue()
    }
    audioRef.current.onerror = () => {
      console.log('ElevenLabs audio error, falling back to native')
      isPlayingRef.current = false
      setUseElevenLabs(false)
    }

    // Initialize native speech synthesis as fallback
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
    }
  }, [setSpeaking])

  // Process audio queue
  const processQueue = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return
    
    const next = audioQueueRef.current.shift()
    if (next) {
      playAudio(next.url, next.text)
    }
  }, [])

  // Play audio from URL
  const playAudio = useCallback((url, text) => {
    if (!audioRef.current) return
    
    isPlayingRef.current = true
    setSpeaking(true, text)
    audioRef.current.src = url
    audioRef.current.play().catch(err => {
      console.error('Audio play error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
    })
  }, [setSpeaking])

  // Speak using ElevenLabs
  const speakElevenLabs = useCallback(async (text) => {
    try {
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
      
      // If already playing, queue it
      if (isPlayingRef.current) {
        audioQueueRef.current.push({ url: audioUrl, text })
      } else {
        playAudio(audioUrl, text)
      }

      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      setError('Premium voice unavailable')
      return false
    }
  }, [playAudio])

  // Speak using native speech synthesis
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

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

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    const MIN_INTERVAL = 1500 // Minimum 1.5s between same callouts
    
    // Don't repeat the same callout too quickly
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < MIN_INTERVAL) {
      return false
    }

    // Cancel current speech for high priority
    if (priority === 'high') {
      audioRef.current?.pause()
      audioQueueRef.current = []
      synthRef.current?.cancel()
      isPlayingRef.current = false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try ElevenLabs first
    if (useElevenLabs) {
      const success = await speakElevenLabs(text)
      if (success) return true
      
      console.log('Falling back to native voice')
      setUseElevenLabs(false)
    }

    // Use native speech
    return speakNative(text)
  }, [settings.voiceEnabled, useElevenLabs, speakElevenLabs, speakNative])

  // Check if currently speaking
  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  // Cancel speech
  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioQueueRef.current = []
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  // Test voice
  const test = useCallback(() => {
    speak('Left 3 tightens into right 4', 'high')
  }, [speak])

  return {
    speak,
    stop,
    isSpeaking,
    test,
    isReady,
    error,
    useElevenLabs
  }
}

// ================================
// Generate Callout Text
// Enhanced for chicanes, modifiers, sequences
// ================================

export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  // Handle chicanes and S-curves
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    
    if (curve.chicaneType === 'CHICANE' && curve.curves?.length === 3) {
      parts.push(`Chicane ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    } else {
      parts.push(`S ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    }
  } else {
    // Standard curve callout
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    // Add modifier
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN':
          parts.push('hairpin')
          break
        case 'SHARP':
          parts.push('sharp')
          break
        case 'LONG':
          parts.push('long')
          break
        case 'TIGHTENS':
          parts.push('tightens')
          break
        case 'OPENS':
          parts.push('opens')
          break
      }
    }
  }
  
  // Add "into" or "then" for close sequences
  if (nextCurve && !curve.isChicane) {
    const distanceToNext = nextCurve.distanceFromStart - (curve.distanceFromStart + curve.length)
    
    if (distanceToNext < 30) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`into ${nextDir} ${nextCurve.severity}`)
    } else if (distanceToNext < 100) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`then ${nextDir} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(' ')
}

export default useSpeech
