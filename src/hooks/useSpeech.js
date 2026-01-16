import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v10 - iOS Audio Fix
// Uses Web Audio API for reliable iOS unlock
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Audio cache
const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

// Global Web Audio context (shared across instances)
let globalAudioContext = null

export function useSpeech() {
  const { settings, setSpeaking, isRunning } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)
  const audioUnlockedRef = useRef(false)
  const keepAliveIntervalRef = useRef(null)
  const audioContextRef = useRef(null)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create Audio element for playback
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.log('🔊 Audio element error')
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Native speech synthesis as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        // Prefer high-quality iOS voices
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Ava', 'Alex']
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
        console.log('🔊 Voice loaded:', voiceRef.current?.name || 'default')
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
      setTimeout(loadVoices, 100)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      clearInterval(keepAliveIntervalRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // ================================
  // iOS AUDIO UNLOCK using Web Audio API
  // This is the most reliable method for iOS
  // ================================
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS (Web Audio API)...')
    
    try {
      // Create or resume AudioContext
      if (!globalAudioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (AudioContext) {
          globalAudioContext = new AudioContext()
          console.log('🔊 Created AudioContext')
        }
      }
      
      audioContextRef.current = globalAudioContext
      
      if (audioContextRef.current) {
        // Resume if suspended (iOS requires this)
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume()
          console.log('🔊 AudioContext resumed')
        }
        
        // Play a tiny silent buffer to fully unlock
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050)
        const source = audioContextRef.current.createBufferSource()
        source.buffer = buffer
        source.connect(audioContextRef.current.destination)
        source.start(0)
        
        audioUnlockedRef.current = true
        console.log('🔊 ✅ Web Audio API unlocked!')
      }
    } catch (e) {
      console.log('🔊 Web Audio unlock error:', e.message)
    }
    
    // Also unlock the Audio element by loading a tiny valid audio
    if (audioRef.current) {
      try {
        // Create a tiny valid WAV file (44 bytes - smallest valid WAV)
        const wavHeader = new Uint8Array([
          0x52, 0x49, 0x46, 0x46, // "RIFF"
          0x24, 0x00, 0x00, 0x00, // file size - 8
          0x57, 0x41, 0x56, 0x45, // "WAVE"
          0x66, 0x6D, 0x74, 0x20, // "fmt "
          0x10, 0x00, 0x00, 0x00, // chunk size (16)
          0x01, 0x00,             // audio format (1 = PCM)
          0x01, 0x00,             // num channels (1)
          0x44, 0xAC, 0x00, 0x00, // sample rate (44100)
          0x88, 0x58, 0x01, 0x00, // byte rate
          0x02, 0x00,             // block align
          0x10, 0x00,             // bits per sample (16)
          0x64, 0x61, 0x74, 0x61, // "data"
          0x00, 0x00, 0x00, 0x00  // data size (0 - silent)
        ])
        
        const blob = new Blob([wavHeader], { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        
        audioRef.current.src = url
        audioRef.current.volume = 0.01
        await audioRef.current.play()
        audioRef.current.pause()
        
        URL.revokeObjectURL(url)
        console.log('🔊 ✅ Audio element unlocked!')
        audioUnlockedRef.current = true
      } catch (e) {
        console.log('🔊 Audio element unlock failed:', e.message)
      }
    }
    
    // Unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 10)
        console.log('🔊 ✅ Speech synthesis unlocked')
      } catch (e) {
        console.log('🔊 Speech synthesis unlock failed:', e.message)
      }
    }
    
    return audioUnlockedRef.current
  }, [])

  // ================================
  // KEEP AUDIO SESSION ALIVE
  // ================================
  const startKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) return
    
    console.log('🔊 Starting audio keep-alive...')
    
    keepAliveIntervalRef.current = setInterval(async () => {
      if (isPlayingRef.current) return
      
      try {
        // Use Web Audio API for keep-alive (more reliable)
        if (audioContextRef.current) {
          if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume()
          }
          
          // Play silent buffer
          const buffer = audioContextRef.current.createBuffer(1, 1, 22050)
          const source = audioContextRef.current.createBufferSource()
          source.buffer = buffer
          source.connect(audioContextRef.current.destination)
          source.start(0)
          
          console.log('🔊 Keep-alive ping (Web Audio)')
        }
      } catch (e) {
        console.log('🔊 Keep-alive failed, re-init...')
        await initAudio()
      }
    }, 20000) // Every 20 seconds
  }, [initAudio])

  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current)
      keepAliveIntervalRef.current = null
      console.log('🔊 Stopped audio keep-alive')
    }
  }, [])

  // Auto start/stop keep-alive
  useEffect(() => {
    if (isRunning) {
      startKeepAlive()
    } else {
      stopKeepAlive()
    }
    return () => stopKeepAlive()
  }, [isRunning, startKeepAlive, stopKeepAlive])

  // ================================
  // NATIVE SPEECH (fallback)
  // ================================
  const speakNative = useCallback((text) => {
    if (!synthRef.current) {
      console.log('🔊 Native speech not available')
      return false
    }

    try {
      synthRef.current.cancel()
      
      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) utterance.voice = voiceRef.current
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      utterance.onend = () => {
        clearTimeout(timeoutRef.current)
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      
      utterance.onerror = (e) => {
        console.log('🔊 Native speech error:', e?.error || 'unknown')
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      // Safety timeout
      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, 8000)

      isPlayingRef.current = true
      setSpeaking(true, text)
      synthRef.current.speak(utterance)
      console.log(`🔊 Native: "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 Native speech exception:', err.message)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ================================
  // ELEVENLABS TTS
  // ================================
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Ensure audio is unlocked
    if (!audioUnlockedRef.current) {
      console.log('🔊 Audio not unlocked, attempting...')
      await initAudio()
    }
    
    // Check cache
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        const cachedUrl = AUDIO_CACHE.get(cacheKey)
        audioRef.current.src = cachedUrl
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.currentTime = 0
        
        isPlayingRef.current = true
        setSpeaking(true, text)
        
        await audioRef.current.play()
        console.log(`🔊 Cached: "${text}"`)
        return true
      } catch (err) {
        console.log('🔊 Cache play failed:', err.message)
        // Don't return - try fetching fresh
      }
    }

    // Fetch from API
    if (!navigator.onLine) {
      console.log('🔊 Offline')
      return false
    }

    try {
      console.log(`🔊 Fetching TTS: "${text}"`)
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: {
            stability: 0.90,
            similarity_boost: 0.80,
            style: 0.05,
            use_speaker_boost: true
          }
        }),
      })

      if (!response.ok) {
        console.log(`🔊 TTS API error: ${response.status}`)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.log('🔊 TTS response too small')
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(cacheKey, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      audioRef.current.currentTime = 0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audioRef.current.play()
      console.log(`🔊 ElevenLabs: "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 ElevenLabs failed:', err.message)
      return false
    }
  }, [setSpeaking, settings.volume, initAudio])

  // ================================
  // MAIN SPEAK FUNCTION
  // ================================
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) {
      return false
    }

    const now = Date.now()
    
    // Prevent duplicates
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      console.log(`🔊 Skip duplicate: "${text}"`)
      return false
    }

    // Handle priority
    if (priority === 'high') {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
      console.log(`🔊 Already playing, skip: "${text}"`)
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    console.log(`🔊 Speaking: "${text}" (${priority})`)

    // Try ElevenLabs first
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fall back to native
    console.log('🔊 Falling back to native')
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current)
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const isAudioUnlocked = useCallback(() => audioUnlockedRef.current, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio,
    isAudioUnlocked,
    preloadCopilotVoices
  }
}

// ================================
// PRELOAD ESSENTIAL CALLOUTS
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Technical section', 'Highway', 'Urban area'
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  console.log(`🔊 Pre-caching ${total} callouts...`)
  
  for (const text of essentialCallouts) {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: { stability: 0.90, similarity_boost: 0.80, style: 0.05, use_speaker_boost: true }
        }),
      })
      
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 500) {
          AUDIO_CACHE.set(getCacheKey(text), URL.createObjectURL(blob))
          cached++
        }
      }
    } catch (e) {}
    
    onProgress?.({ cached, total, percent: (cached / total) * 100 })
  }
  
  console.log(`🔊 Cached ${cached}/${total}`)
  return { success: true, cached, total }
}

// Legacy exports for compatibility
export function generateCallout(curve) {
  if (!curve) return null
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let text = `${dir} ${curve.severity}`
  if (curve.modifier) {
    const mods = { 'TIGHTENS': 'tightens', 'OPENS': 'opens', 'LONG': 'long', 'HAIRPIN': 'hairpin' }
    text += ` ${mods[curve.modifier] || curve.modifier.toLowerCase()}`
  }
  return text
}

export function generateFinalWarning(curve) {
  if (!curve) return null
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return curve.severity >= 5 ? `${dir} now` : null
}

export function generateStraightCallout() { return null }
export function generateZoneTransitionCallout(from, to) { return null }

export default useSpeech
