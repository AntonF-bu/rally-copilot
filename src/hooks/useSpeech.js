import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Native Fallback
// Voice ID: puLAe8o1npIDg374vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  const [useElevenLabs, setUseElevenLabs] = useState(true)
  
  const audioRef = useRef(null)
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
    }
    audioRef.current.onerror = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
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
      
      isPlayingRef.current = true
      audioRef.current.src = audioUrl
      await audioRef.current.play()

      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking])

  // Speak using native speech synthesis (fallback)
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
  }, [setSpeaking])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    const MIN_INTERVAL = 1500
    
    // Don't repeat same callout too quickly
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < MIN_INTERVAL) {
      return false
    }

    // Cancel current speech for high priority
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try ElevenLabs first
    if (useElevenLabs) {
      const success = await speakElevenLabs(text)
      if (success) return true
      
      // Fall back to native if ElevenLabs fails
      setUseElevenLabs(false)
    }

    return speakNative(text)
  }, [settings.voiceEnabled, useElevenLabs, speakElevenLabs, speakNative])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  return { speak, stop, isSpeaking }
}

// ================================
// Generate Callout Text
// ================================

export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    
    if (curve.chicaneType === 'CHICANE' && curve.curves?.length === 3) {
      parts.push(`Chicane ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    } else {
      parts.push(`S ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    }
  } else {
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN': parts.push('hairpin'); break
        case 'SHARP': parts.push('sharp'); break
        case 'LONG': parts.push('long'); break
        case 'TIGHTENS': parts.push('tightens'); break
        case 'OPENS': parts.push('opens'); break
      }
    }
  }
  
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
