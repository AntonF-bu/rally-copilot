import { useCallback, useEffect, useRef, useState } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Native Fallback
// Voice ID: puLAe8o1npIDg374vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, mode, setSpeaking } = useStore()
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

    console.log('🎤 Speech hook initializing...')

    // Create audio element for ElevenLabs
    audioRef.current = new Audio()
    audioRef.current.onended = () => {
      console.log('🎤 Audio ended')
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    audioRef.current.onerror = (e) => {
      console.error('🎤 Audio error:', e)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Initialize native speech synthesis as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        console.log('🎤 Available voices:', voices.length)
        
        if (voices.length === 0) return

        const preferred = ['Samantha', 'Daniel', 'Karen', 'Alex', 'Ava']
        for (const name of preferred) {
          const found = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
          if (found) {
            voiceRef.current = found
            console.log('🎤 Selected native voice:', found.name)
            break
          }
        }
        if (!voiceRef.current) {
          voiceRef.current = voices.find(v => v.lang.startsWith('en')) || voices[0]
          console.log('🎤 Fallback native voice:', voiceRef.current?.name)
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
    console.log('🎤 Trying ElevenLabs for:', text)
    
    try {
      setSpeaking(true, text)
      
      console.log('🎤 Calling /api/tts with voice:', ELEVENLABS_VOICE_ID)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text,
          voiceId: ELEVENLABS_VOICE_ID
        }),
      })

      console.log('🎤 TTS Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('🎤 TTS Error:', errorText)
        throw new Error(`API error: ${response.status} - ${errorText}`)
      }

      const audioBlob = await response.blob()
      console.log('🎤 Got audio blob, size:', audioBlob.size)
      
      const audioUrl = URL.createObjectURL(audioBlob)
      
      isPlayingRef.current = true
      audioRef.current.src = audioUrl
      
      await audioRef.current.play()
      console.log('🎤 ElevenLabs audio playing!')

      return true
    } catch (err) {
      console.error('🎤 ElevenLabs failed:', err)
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking])

  // Speak using native speech synthesis
  const speakNative = useCallback((text) => {
    console.log('🎤 Using native speech for:', text)
    
    if (!synthRef.current) {
      console.error('🎤 No speech synthesis available')
      return false
    }

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
        console.log('🎤 Using voice:', voiceRef.current.name)
      }

      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = 1.0

      utterance.onstart = () => {
        console.log('🎤 Native speech started')
        setSpeaking(true, text)
      }
      utterance.onend = () => {
        console.log('🎤 Native speech ended')
        setSpeaking(false, '')
      }
      utterance.onerror = (e) => {
        console.error('🎤 Native speech error:', e)
        setSpeaking(false, '')
      }

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('🎤 Native speech error:', err)
      return false
    }
  }, [setSpeaking])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) {
      console.log('🎤 Voice disabled or no text')
      return false
    }

    const now = Date.now()
    const MIN_INTERVAL = 1500
    
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < MIN_INTERVAL) {
      console.log('🎤 Skipping duplicate callout')
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

    console.log('🎤 Speaking:', text, '| ElevenLabs enabled:', useElevenLabs)

    // Try ElevenLabs first
    if (useElevenLabs) {
      const success = await speakElevenLabs(text)
      if (success) {
        console.log('🎤 ElevenLabs success!')
        return true
      }
      
      console.log('🎤 ElevenLabs failed, switching to native')
      setUseElevenLabs(false)
    }

    // Use native speech
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
