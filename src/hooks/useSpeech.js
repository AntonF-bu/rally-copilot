import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v7 - NATIVE SPEECH FIRST
// ElevenLabs was causing choppiness due to network
// Native iOS speech is smooth and reliable
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Simple cache for ElevenLabs (optional enhancement)
const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)
  const useElevenLabsRef = useRef(false) // Default to native speech

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Audio element for ElevenLabs (optional)
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Native speech synthesis - RELIABLE
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        // Prefer good quality voices
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Ava', 'Alex']
        for (const name of preferred) {
          const found = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'))
          if (found) {
            voiceRef.current = found
            console.log(`🔊 Voice selected: ${found.name}`)
            break
          }
        }
        if (!voiceRef.current) {
          voiceRef.current = voices.find(v => v.lang.startsWith('en')) || voices[0]
          console.log(`🔊 Fallback voice: ${voiceRef.current?.name}`)
        }
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
      setTimeout(loadVoices, 100)
      setTimeout(loadVoices, 500)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Native speech - SMOOTH AND RELIABLE
  const speakNative = useCallback((text) => {
    if (!synthRef.current) {
      console.log('🔊 No speech synthesis')
      return false
    }

    try {
      // Cancel any ongoing speech
      synthRef.current.cancel()
      
      const utterance = new SpeechSynthesisUtterance(text)
      
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }
      
      // Settings for clarity
      utterance.rate = 1.0      // Normal speed
      utterance.pitch = 1.0     // Normal pitch
      utterance.volume = settings.volume || 1.0

      utterance.onstart = () => {
        isPlayingRef.current = true
        setSpeaking(true, text)
      }

      utterance.onend = () => {
        clearTimeout(timeoutRef.current)
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      
      utterance.onerror = (e) => {
        console.log('🔊 Speech error:', e.error)
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      // Safety timeout
      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, 5000)

      synthRef.current.speak(utterance)
      console.log(`🔊 Speaking: "${text}"`)
      return true
    } catch (err) {
      console.error('🔊 Speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ElevenLabs speech (optional - only if cached)
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    if (!AUDIO_CACHE.has(cacheKey)) {
      return false // Not cached, use native
    }

    try {
      const cachedUrl = AUDIO_CACHE.get(cacheKey)
      audioRef.current.src = cachedUrl
      audioRef.current.volume = settings.volume || 1.0
      audioRef.current.currentTime = 0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audioRef.current.play()
      return true
    } catch (err) {
      console.log('🔊 ElevenLabs playback failed, using native')
      isPlayingRef.current = false
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function - NATIVE FIRST for reliability
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Prevent duplicate callouts
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    // Handle priority
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

    // Try ElevenLabs if cached and enabled
    if (useElevenLabsRef.current && AUDIO_CACHE.has(getCacheKey(text))) {
      const success = await speakElevenLabs(text)
      if (success) return true
    }
    
    // Use native speech - ALWAYS WORKS
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio for iOS
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio...')
    
    // Test speech synthesis
    if (synthRef.current) {
      try {
        const utterance = new SpeechSynthesisUtterance('')
        utterance.volume = 0
        synthRef.current.speak(utterance)
        setTimeout(() => synthRef.current?.cancel(), 10)
      } catch (e) {}
    }
    
    console.log('🔊 Audio ready')
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
  
  const setVoiceStyle = useCallback(() => {}, []) // No-op for now

  const getCacheStats = useCallback(() => ({
    size: AUDIO_CACHE.size,
    keys: Array.from(AUDIO_CACHE.keys())
  }), [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio, 
    setVoiceStyle,
    getCacheStats,
    preloadCopilotVoices
  }
}

/**
 * Simplified pre-loading - just marks as ready, doesn't actually cache
 * Native speech doesn't need pre-caching!
 */
export async function preloadCopilotVoices(curves, segments, onProgress) {
  console.log('🔊 Using native speech - no pre-caching needed')
  
  // Simulate quick progress for UI
  for (let i = 0; i <= 100; i += 20) {
    onProgress?.({ cached: i, total: 100, percent: i })
    await new Promise(r => setTimeout(r, 100))
  }
  
  return { success: true, cached: 0, total: 0, failed: 0 }
}

// ================================
// CALLOUT GENERATORS
// ================================

export function generateCallout(curve, mode, speedUnit) {
  if (!curve) return null
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let callout = `${dir} ${curve.severity}`
  
  if (curve.modifier) {
    const modMap = {
      'TIGHTENS': 'tightens',
      'OPENS': 'opens',
      'LONG': 'long',
      'HAIRPIN': 'hairpin'
    }
    callout += ` ${modMap[curve.modifier] || curve.modifier.toLowerCase()}`
  }
  
  return callout
}

export function generateFinalWarning(curve) {
  if (!curve) return null
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return curve.severity >= 5 ? `${dir} ${curve.severity} now` : `${dir} now`
}

export function generateStraightCallout() {
  return null // Disabled
}

export function generateZoneTransitionCallout(from, to) {
  const transitions = {
    'technical': 'Technical section',
    'transit': 'Highway',
    'urban': 'Urban',
    'spirited': 'Spirited'
  }
  return transitions[to] || null
}

export default useSpeech
