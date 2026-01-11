import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - Simple & Working
// ElevenLabs with native fallback
// Voice ID: puLAe8o1npIDg434vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)

  // Initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element
    audioRef.current = new Audio()
    
    audioRef.current.addEventListener('ended', () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    })
    
    audioRef.current.addEventListener('error', () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    })

    // Native speech synthesis fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        // Find a good English voice
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Alex', 'Ava', 'Tom']
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
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = loadVoices
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Native speech (reliable fallback)
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      utterance.onstart = () => {
        isPlayingRef.current = true
        setSpeaking(true, text)
      }
      utterance.onend = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      utterance.onerror = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ElevenLabs TTS
  const speakElevenLabs = useCallback(async (text) => {
    if (!navigator.onLine) {
      return false
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })

      if (!response.ok) {
        console.error('TTS API error:', response.status)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audioRef.current.play()
      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Don't repeat same callout within 2 seconds
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
      return false
    }

    // Handle priority
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current || synthRef.current?.speaking) {
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try ElevenLabs first, fall back to native
    const success = await speakElevenLabs(text)
    if (success) return true

    // Fallback to native
    return speakNative(text)
  }, [settings.voiceEnabled, speakElevenLabs, speakNative])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  // Simple init for iOS - just play/pause to unlock audio
  const initAudio = useCallback(async () => {
    try {
      audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAQGwSRPuNgAAAAAAAAAAAAAAAAD/4xjEAAV0A0AgAAANI2hG4ow/8uD/Lw/ygP8oGP/E4Bh/5c/+XP/l4f5QH+UB/lz/5eH//5cP/Lhj/8uGP/y4f//+Mf/lz//w/8uH/lwx/+XDH/y5/8vD'
      audioRef.current.volume = 0.01
      await audioRef.current.play()
      audioRef.current.pause()
    } catch (e) {
      // Ignore - just trying to unlock
    }
  }, [])

  return { speak, stop, isSpeaking, initAudio }
}

// Generate callout text from curve data
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'left' : 'right'
    parts.push(curve.chicaneType === 'CHICANE' 
      ? `Chicane ${dirWord} ${curve.severitySequence}`
      : `S ${dirWord} ${curve.severitySequence}`)
  } else {
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    if (curve.modifier) {
      parts.push(curve.modifier.toLowerCase())
    }
  }
  
  if (nextCurve && !curve.isChicane) {
    const distanceToNext = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    
    if (distanceToNext < 30 && distanceToNext >= 0) {
      parts.push(`into ${nextCurve.direction === 'LEFT' ? 'left' : 'right'} ${nextCurve.severity}`)
    } else if (distanceToNext < 100 && distanceToNext >= 0) {
      parts.push(`then ${nextCurve.direction === 'LEFT' ? 'left' : 'right'} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(' ')
}

export default useSpeech
