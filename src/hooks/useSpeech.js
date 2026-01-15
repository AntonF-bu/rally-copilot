import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v9 - Bulletproof iOS Audio
// 
// Key iOS fixes:
// 1. User interaction required before ANY audio - unlock on first touch
// 2. AudioContext can suspend - resume before each play
// 3. Multiple fallback layers: ElevenLabs → Native → Silent
// 4. Aggressive error recovery
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Cache for session
const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

// Silent MP3 for unlocking audio (base64 encoded)
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAS7u7vd3d0iIiIiIiJ3d3e7u93dIiIiAAAAAHd3vd3SIiIAAAAiIiIid3d3u7u93SIiIiIAAAB3d73d0iIiIiIAAAAiInd3d7u73d0iIiIiIiIid3e7u7u7u93dIiIiIiJ3d3e7u7u73d3SIiIiInd3d7u7u93d3SIiIiIid3d3u7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3d0iIiIiIiInd3e7u93d0iIiIiIiJ3d3e7u7vd3dIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0iIiIiIiJ3d3e7u7vd3SIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0='

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  // Refs for audio elements and state
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const isPlayingRef = useRef(false)
  const isUnlockedRef = useRef(false)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const timeoutRef = useRef(null)
  const retryCountRef = useRef(0)

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create Audio element with iOS-specific attributes
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    // Event handlers
    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.warn('🔊 Audio element error:', e.type)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    audio.oncanplaythrough = () => {
      console.log('🔊 Audio ready to play')
    }

    // Create AudioContext for iOS (helps with background audio)
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        audioContextRef.current = new AudioContext()
        console.log('🔊 AudioContext created, state:', audioContextRef.current.state)
      }
    } catch (e) {
      console.warn('🔊 AudioContext not available:', e.message)
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
            console.log('🔊 Selected voice:', found.name)
            break
          }
        }
        if (!voiceRef.current) {
          voiceRef.current = voices.find(v => v.lang.startsWith('en')) || voices[0]
        }
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
      // iOS needs multiple attempts to load voices
      setTimeout(loadVoices, 100)
      setTimeout(loadVoices, 500)
      setTimeout(loadVoices, 1000)
    }

    // Cleanup
    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
      audioContextRef.current?.close()
    }
  }, [setSpeaking])

  // Unlock audio on user interaction (CRITICAL for iOS)
  const unlockAudio = useCallback(async () => {
    if (isUnlockedRef.current) return true
    
    console.log('🔊 Attempting to unlock audio...')
    
    let success = false

    // 1. Resume AudioContext if suspended
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
        console.log('🔊 AudioContext resumed')
      } catch (e) {
        console.warn('🔊 AudioContext resume failed:', e.message)
      }
    }

    // 2. Play silent audio to unlock Audio element
    if (audioRef.current) {
      try {
        audioRef.current.src = SILENT_MP3
        audioRef.current.volume = 0.01
        audioRef.current.muted = false
        
        const playPromise = audioRef.current.play()
        if (playPromise) {
          await playPromise
        }
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        console.log('🔊 Audio element unlocked')
        success = true
      } catch (e) {
        console.warn('🔊 Audio element unlock failed:', e.message)
      }
    }

    // 3. Trigger speech synthesis to unlock it
    if (synthRef.current) {
      try {
        const utterance = new SpeechSynthesisUtterance('')
        utterance.volume = 0
        synthRef.current.speak(utterance)
        setTimeout(() => synthRef.current?.cancel(), 50)
        console.log('🔊 Speech synthesis unlocked')
        success = true
      } catch (e) {
        console.warn('🔊 Speech synthesis unlock failed:', e.message)
      }
    }

    isUnlockedRef.current = success
    return success
  }, [])

  // Initialize audio (call this on first user interaction)
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio system...')
    const unlocked = await unlockAudio()
    console.log('🔊 Audio initialization:', unlocked ? 'SUCCESS' : 'PARTIAL')
    return unlocked
  }, [unlockAudio])

  // Ensure AudioContext is running before playback
  const ensureAudioReady = useCallback(async () => {
    // Resume AudioContext if suspended (iOS suspends it frequently)
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
      } catch (e) {
        console.warn('🔊 Could not resume AudioContext')
      }
    }
    
    // If not unlocked yet, try to unlock
    if (!isUnlockedRef.current) {
      await unlockAudio()
    }
  }, [unlockAudio])

  // Native speech (fallback - doesn't route through CarPlay)
  const speakNative = useCallback(async (text) => {
    if (!synthRef.current) {
      console.log('🔊 Native speech not available')
      return false
    }

    await ensureAudioReady()

    return new Promise((resolve) => {
      try {
        // Cancel any existing speech
        synthRef.current.cancel()
        
        const utterance = new SpeechSynthesisUtterance(text)
        if (voiceRef.current) {
          utterance.voice = voiceRef.current
        }
        utterance.rate = 1.0
        utterance.pitch = 1.0
        utterance.volume = settings.volume || 1.0

        utterance.onend = () => {
          clearTimeout(timeoutRef.current)
          isPlayingRef.current = false
          setSpeaking(false, '')
          resolve(true)
        }
        
        utterance.onerror = (e) => {
          console.warn('🔊 Native speech error:', e.error)
          isPlayingRef.current = false
          setSpeaking(false, '')
          resolve(false)
        }

        // Safety timeout
        timeoutRef.current = setTimeout(() => {
          console.warn('🔊 Native speech timeout')
          synthRef.current?.cancel()
          isPlayingRef.current = false
          setSpeaking(false, '')
          resolve(false)
        }, 8000)

        isPlayingRef.current = true
        setSpeaking(true, text)
        synthRef.current.speak(utterance)
        console.log(`🔊 Native: "${text}"`)
        
      } catch (err) {
        console.error('🔊 Native speech exception:', err.message)
        isPlayingRef.current = false
        setSpeaking(false, '')
        resolve(false)
      }
    })
  }, [setSpeaking, settings.volume, ensureAudioReady])

  // ElevenLabs via Audio element (routes through CarPlay/Bluetooth)
  const speakElevenLabs = useCallback(async (text) => {
    await ensureAudioReady()
    
    const cacheKey = getCacheKey(text)
    
    // Try cache first
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        const cachedUrl = AUDIO_CACHE.get(cacheKey)
        audioRef.current.src = cachedUrl
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.currentTime = 0
        audioRef.current.muted = false
        
        isPlayingRef.current = true
        setSpeaking(true, text)
        
        await audioRef.current.play()
        console.log(`🔊 ElevenLabs (cached): "${text}"`)
        retryCountRef.current = 0
        return true
      } catch (err) {
        console.warn('🔊 Cache playback failed:', err.message)
        // Continue to fetch fresh
      }
    }

    // Need network for fresh fetch
    if (!navigator.onLine) {
      console.log('🔊 Offline - cannot fetch audio')
      return false
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
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
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        console.warn('🔊 TTS API error:', response.status)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.warn('🔊 TTS response too small')
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(cacheKey, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      audioRef.current.currentTime = 0
      audioRef.current.muted = false
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audioRef.current.play()
      console.log(`🔊 ElevenLabs: "${text}"`)
      retryCountRef.current = 0
      return true
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('🔊 TTS request timed out')
      } else {
        console.warn('🔊 ElevenLabs error:', err.message)
      }
      return false
    }
  }, [setSpeaking, settings.volume, ensureAudioReady])

  // Main speak function with fallback chain
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Prevent rapid duplicate calls
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      console.log('🔊 Skipping duplicate:', text)
      return false
    }

    // Handle priority
    if (priority === 'high') {
      // Interrupt current speech for high priority
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
      // Don't interrupt for normal priority
      console.log('🔊 Busy, skipping:', text)
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // FALLBACK CHAIN:
    // 1. Try ElevenLabs (best quality, routes through CarPlay)
    let success = await speakElevenLabs(text)
    
    if (!success) {
      // 2. Try native speech (always available, phone speaker only)
      console.log('🔊 Falling back to native speech')
      success = await speakNative(text)
    }

    if (!success) {
      // 3. Complete failure - log but don't crash
      console.error('🔊 All speech methods failed for:', text)
      retryCountRef.current++
      
      // After multiple failures, try re-unlocking audio
      if (retryCountRef.current >= 3) {
        console.log('🔊 Multiple failures - attempting audio re-unlock')
        isUnlockedRef.current = false
        await unlockAudio()
        retryCountRef.current = 0
      }
    }

    return success
  }, [settings.voiceEnabled, speakElevenLabs, speakNative, unlockAudio])

  // Stop all audio
  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current)
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  // Status functions
  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const getCacheStats = useCallback(() => ({ size: AUDIO_CACHE.size }), [])
  const setVoiceStyle = useCallback(() => {}, []) // Placeholder for future

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio, 
    setVoiceStyle, 
    getCacheStats,
    preloadCopilotVoices,
    unlockAudio  // Expose for manual unlock if needed
  }
}

// Pre-load essential callouts
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    // Directions with angles
    'Left 15°', 'Left 25°', 'Left 35°', 'Left 45°',
    'Right 15°', 'Right 25°', 'Right 35°', 'Right 45°',
    // Danger callouts
    'CAUTION - Left 60°', 'CAUTION - Right 60°',
    'CAUTION - Hard left 90°', 'CAUTION - Hard right 90°',
    // Zone transitions
    'Technical section', 'Highway section', 'Urban area',
    // Common chatter
    'Curves ahead', 'Stay sharp'
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
    } catch (e) {
      // Silent fail for individual callouts
    }
    
    onProgress?.({ cached, total, percent: (cached / total) * 100 })
  }
  
  console.log(`🔊 Cached ${cached}/${total} callouts`)
  return { success: true, cached, total }
}

// Utility exports for callout generation
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
