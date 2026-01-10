import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Native Fallback
// Voice ID: puLAe8o1npIDg374vYZp
// ALWAYS tries ElevenLabs first on each call
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
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

        // Try to find a good male voice for native fallback
        const preferred = ['Daniel', 'Alex', 'Tom', 'David', 'James', 'Samantha', 'Karen', 'Ava']
        for (const name of preferred) {
          const found = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
          if (found) {
            voiceRef.current = found
            console.log('Native voice fallback:', found.name)
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
      console.log('🎤 Trying ElevenLabs for:', text)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          voiceId: ELEVENLABS_VOICE_ID
        }),
      })

      console.log('🎤 ElevenLabs response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('🎤 ElevenLabs API error:', response.status, errorText)
        return false
      }

      const audioBlob = await response.blob()
      console.log('🎤 ElevenLabs audio blob size:', audioBlob.size)
      
      if (audioBlob.size < 1000) {
        console.error('🎤 ElevenLabs returned suspiciously small audio')
        return false
      }

      const audioUrl = URL.createObjectURL(audioBlob)
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      audioRef.current.src = audioUrl
      await audioRef.current.play()

      console.log('🎤 ElevenLabs playing successfully')
      return true
    } catch (err) {
      console.error('🎤 ElevenLabs error:', err)
      return false
    }
  }, [setSpeaking])

  // Speak using native speech synthesis (fallback)
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      console.log('🔊 Using native speech for:', text)
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
        console.log('🔊 Using voice:', voiceRef.current.name)
      }

      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = () => setSpeaking(false, '')

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('🔊 Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function - ALWAYS tries ElevenLabs first
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

    // ALWAYS try ElevenLabs first (don't remember failures)
    const elevenLabsSuccess = await speakElevenLabs(text)
    if (elevenLabsSuccess) {
      return true
    }

    // Fall back to native only if ElevenLabs fails THIS time
    console.log('🔊 Falling back to native speech')
    return speakNative(text)
  }, [settings.voiceEnabled, speakElevenLabs, speakNative])

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
