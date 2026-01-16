import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v9 - iOS Audio Fix
// - Unlocks audio on navigation start
// - Keeps audio session alive
// - Better error logging
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Minimal cache - only for current session
const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

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

  // Initialize audio element
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create Audio element - THIS routes through CarPlay/Bluetooth!
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.log('🔊 Audio error:', e?.message || 'unknown')
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Native speech as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Ava']
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
  // iOS AUDIO UNLOCK
  // Must be called from user interaction
  // ================================
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS...')
    
    // Silent MP3 - minimal valid audio
    const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAEAAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAAA=='
    
    if (audioRef.current) {
      audioRef.current.src = silentMp3
      audioRef.current.volume = 0.01
      
      try {
        await audioRef.current.play()
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioUnlockedRef.current = true
        console.log('🔊 ✅ Audio unlocked successfully!')
      } catch (e) {
        console.log('🔊 ⚠️ Audio unlock failed:', e.message)
      }
    }
    
    // Also unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 10)
        console.log('🔊 ✅ Speech synthesis unlocked')
      } catch (e) {
        console.log('🔊 ⚠️ Speech unlock failed:', e.message)
      }
    }
    
    return audioUnlockedRef.current
  }, [])

  // ================================
  // KEEP AUDIO SESSION ALIVE
  // iOS kills audio session after ~30s of silence
  // ================================
  const startKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) return
    
    console.log('🔊 Starting audio keep-alive...')
    
    // Play silent audio every 25 seconds to keep session alive
    keepAliveIntervalRef.current = setInterval(async () => {
      if (!audioRef.current || isPlayingRef.current) return
      
      try {
        const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAEAAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAAA=='
        
        audioRef.current.src = silentMp3
        audioRef.current.volume = 0.01
        await audioRef.current.play()
        // Let it finish naturally (very short)
        console.log('🔊 Keep-alive ping')
      } catch (e) {
        // Session may have died, try to re-unlock
        console.log('🔊 Keep-alive failed, re-unlocking...')
        await initAudio()
      }
    }, 25000) // Every 25 seconds
  }, [initAudio])

  const stopKeepAlive = useCallback(() => {
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current)
      keepAliveIntervalRef.current = null
      console.log('🔊 Stopped audio keep-alive')
    }
  }, [])

  // Start/stop keep-alive based on navigation state
  useEffect(() => {
    if (isRunning) {
      startKeepAlive()
    } else {
      stopKeepAlive()
    }
    return () => stopKeepAlive()
  }, [isRunning, startKeepAlive, stopKeepAlive])

  // Native speech fallback (doesn't route through CarPlay)
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

      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, 5000)

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

  // ElevenLabs via Audio element (routes through CarPlay!)
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Check if audio is unlocked
    if (!audioUnlockedRef.current) {
      console.log('🔊 ⚠️ Audio not unlocked, attempting...')
      await initAudio()
    }
    
    // Check cache first
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        audioRef.current.src = AUDIO_CACHE.get(cacheKey)
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.currentTime = 0
        
        isPlayingRef.current = true
        setSpeaking(true, text)
        
        await audioRef.current.play()
        console.log(`🔊 Cached: "${text}"`)
        return true
      } catch (err) {
        console.log('🔊 Cache play failed:', err.message)
        // Try to re-unlock
        await initAudio()
      }
    }

    // Fetch from API
    if (!navigator.onLine) {
      console.log('🔊 Offline - using native')
      return false
    }

    try {
      console.log(`🔊 Fetching TTS for: "${text}"`)
      
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

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) {
      console.log(`🔊 Speak blocked: voiceEnabled=${settings.voiceEnabled}, text=${!!text}`)
      return false
    }

    const now = Date.now()
    
    // Prevent duplicates
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      console.log(`🔊 Skipping duplicate: "${text}"`)
      return false
    }

    // Handle priority
    if (priority === 'high') {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
      console.log(`🔊 Already playing, skipping: "${text}"`)
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    console.log(`🔊 Attempting to speak: "${text}" (priority: ${priority})`)

    // Try ElevenLabs first (routes through CarPlay)
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fall back to native (phone speaker only)
    console.log('🔊 Falling back to native speech')
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
  const setVoiceStyle = useCallback(() => {}, [])
  const getCacheStats = useCallback(() => ({ size: AUDIO_CACHE.size }), [])
  const isAudioUnlocked = useCallback(() => audioUnlockedRef.current, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio,
    isAudioUnlocked,
    setVoiceStyle, 
    getCacheStats,
    preloadCopilotVoices
  }
}

// Quick pre-load - just essential callouts
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Left 2 long', 'Right 2 long',
    'Left 3 ahead', 'Right 3 ahead',
    'Left 4 ahead', 'Right 4 ahead',
    'Chicane', 'S curve',
    'Technical section', 'Highway', 'Urban area'
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  console.log(`🔊 Pre-caching ${total} essential callouts...`)
  
  for (const text of essentialCallouts) {
    try {
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
  
  console.log(`🔊 Cached ${cached}/${total} callouts`)
  return { success: true, cached, total }
}

// Callout generators
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
