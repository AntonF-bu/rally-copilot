import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v10 - iOS Audio Fix
// Aggressive iOS audio unlocking for CarPlay/Bluetooth
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

let isAudioUnlocked = false

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)
  const audioContextRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audio.muted = false
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = () => {
      console.log('🔊 Audio error, will use native speech')
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        audioContextRef.current = new AudioContext()
        console.log('🔊 AudioContext created, state:', audioContextRef.current.state)
      }
    } catch (e) {
      console.log('🔊 AudioContext not available')
    }

    synthRef.current = window.speechSynthesis

    const loadVoice = () => {
      const voices = synthRef.current?.getVoices() || []
      voiceRef.current = voices.find(v => v.name.includes('Samantha')) ||
                         voices.find(v => v.lang.startsWith('en') && v.localService) ||
                         voices[0]
    }
    loadVoice()
    synthRef.current?.addEventListener?.('voiceschanged', loadVoice)

    return () => {
      synthRef.current?.removeEventListener?.('voiceschanged', loadVoice)
    }
  }, [setSpeaking])

  const speakNative = useCallback(async (text) => {
    if (!synthRef.current || !text) return false

    try {
      synthRef.current.cancel()
      
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voiceRef.current
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      return new Promise((resolve) => {
        utterance.onend = () => {
          isPlayingRef.current = false
          setSpeaking(false, '')
          resolve(true)
        }
        utterance.onerror = () => {
          isPlayingRef.current = false
          setSpeaking(false, '')
          resolve(false)
        }

        isPlayingRef.current = true
        setSpeaking(true, text)
        synthRef.current.speak(utterance)
        console.log(`🔊 Native: "${text}"`)
      })
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  const speakElevenLabs = useCallback(async (text) => {
    if (!text || !audioRef.current) return false

    const cacheKey = getCacheKey(text)
    
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        isPlayingRef.current = true
        setSpeaking(true, text)
        audioRef.current.src = AUDIO_CACHE.get(cacheKey)
        audioRef.current.volume = settings.volume || 1.0
        await audioRef.current.play()
        console.log(`🔊 Cached: "${text}"`)
        return true
      } catch (err) {
        isPlayingRef.current = false
        setSpeaking(false, '')
        return false
      }
    }

    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY
    if (!apiKey) {
      return speakNative(text)
    }

    const safetyTimeout = setTimeout(() => {
      if (isPlayingRef.current) {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
    }, 10000)

    try {
      isPlayingRef.current = true
      setSpeaking(true, text)

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      })

      if (!response.ok) throw new Error('ElevenLabs API error')

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      
      AUDIO_CACHE.set(cacheKey, url)
      
      audioRef.current.src = url
      audioRef.current.volume = settings.volume || 1.0
      
      await audioRef.current.play()
      console.log(`🔊 ElevenLabs: "${text}"`)
      
      clearTimeout(safetyTimeout)
      return true
    } catch (err) {
      console.log('🔊 ElevenLabs failed:', err.message)
      isPlayingRef.current = false
      setSpeaking(false, '')
      clearTimeout(safetyTimeout)
      return false
    }
  }, [setSpeaking, settings.volume, speakNative])

  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    if (!isAudioUnlocked && audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
      } catch (e) {}
    }

    const now = Date.now()
    
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    if (priority === 'high') {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    const success = await speakElevenLabs(text)
    if (success) return true
    
    console.log('🔊 Falling back to native speech')
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS...')
    
    // Strategy 1: Resume AudioContext
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume()
          console.log('🔊 AudioContext resumed:', audioContextRef.current.state)
        }
        
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050)
        const source = audioContextRef.current.createBufferSource()
        source.buffer = buffer
        source.connect(audioContextRef.current.destination)
        source.start(0)
        console.log('🔊 Silent buffer played')
      } catch (e) {
        console.log('🔊 AudioContext unlock failed:', e)
      }
    }
    
    // Strategy 2: Use oscillator to create actual audio (works better on iOS)
    if (audioContextRef.current) {
      try {
        const oscillator = audioContextRef.current.createOscillator()
        const gainNode = audioContextRef.current.createGain()
        gainNode.gain.value = 0.001 // Nearly silent
        oscillator.connect(gainNode)
        gainNode.connect(audioContextRef.current.destination)
        oscillator.start()
        oscillator.stop(audioContextRef.current.currentTime + 0.1)
        console.log('🔊 Oscillator played')
      } catch (e) {
        console.log('🔊 Oscillator failed:', e)
      }
    }
    
    // Strategy 3: Unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('.')
        u.volume = 0.01
        u.rate = 10 // Super fast
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 100)
        console.log('🔊 Speech synthesis unlocked')
      } catch (e) {
        console.log('🔊 Speech synthesis unlock failed:', e)
      }
    }
    
    // Strategy 4: Pre-fetch one ElevenLabs audio to warm up the connection
    const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY
    if (apiKey && audioRef.current) {
      try {
        console.log('🔊 Pre-fetching ElevenLabs audio...')
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
          },
          body: JSON.stringify({
            text: 'Ready',
            model_id: 'eleven_turbo_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        })
        
        if (response.ok) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          AUDIO_CACHE.set('ready', url)
          
          // Play it quietly to establish audio route
          audioRef.current.src = url
          audioRef.current.volume = 0.01
          await audioRef.current.play()
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          audioRef.current.volume = 1.0
          console.log('🔊 ElevenLabs audio route established!')
        }
      } catch (e) {
        console.log('🔊 ElevenLabs pre-fetch failed:', e.message)
      }
    }
    
    isAudioUnlocked = true
    console.log('🔊 iOS Audio initialization complete!')
    
    return true
  }, [])

  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current)
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const setVoiceStyle = useCallback(() => {}, [])
  const getCacheStats = useCallback(() => ({ size: AUDIO_CACHE.size }), [])

  return { 
    speak, stop, isSpeaking, initAudio, setVoiceStyle, getCacheStats,
    preloadCopilotVoices
  }
}

// Pre-load essential callouts
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 1', 'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 1', 'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Sweeper left', 'Sweeper right',
    'Easy left', 'Easy right',
    'Highway', 'Urban area', 'Technical section'
  ]

  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY
  if (!apiKey) {
    console.log('🔊 No API key, skipping preload')
    onProgress?.({ percent: 100 })
    return { success: true, cached: 0 }
  }

  console.log(`🔊 Pre-caching ${essentialCallouts.length} essential callouts...`)
  
  let cached = 0
  for (let i = 0; i < essentialCallouts.length; i++) {
    const text = essentialCallouts[i]
    const cacheKey = getCacheKey(text)
    
    if (AUDIO_CACHE.has(cacheKey)) {
      cached++
      continue
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        AUDIO_CACHE.set(cacheKey, url)
        cached++
      }
    } catch (e) {
      console.log(`🔊 Failed to cache: ${text}`)
    }

    onProgress?.({ percent: ((i + 1) / essentialCallouts.length) * 100 })
  }

  console.log(`🔊 Cached ${cached}/${essentialCallouts.length} callouts`)
  return { success: true, cached }
}

export default useSpeech

// Generate callout text for a curve
export function generateCallout(curve, mode = 'cruise', units = 'mph') {
  if (!curve) return ''
  
  const direction = curve.direction === 'LEFT' ? 'Left' : 'Right'
  const severity = curve.severity || 3
  
  if (curve.isChicane) {
    const startDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
    return `Chicane ${startDir}, ${curve.severitySequence || severity}`
  }
  
  if (curve.isSCurve) {
    const startDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
    return `S curve ${startDir}, ${curve.severitySequence || severity}`
  }
  
  // Simple callout
  return `${direction} ${severity}`
}
