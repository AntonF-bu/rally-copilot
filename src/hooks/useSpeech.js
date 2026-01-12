import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v9 - Sweeper Support
// Uses Audio element (routes through CarPlay) with ElevenLabs
// Falls back to native speech only when offline
// NEW: Sweeper callout generation and preloading
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Minimal cache - only for current session
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

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Audio element - THIS routes through CarPlay/Bluetooth!
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.log('🔊 Audio error, will use native speech')
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
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
      setTimeout(loadVoices, 100)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Native speech fallback (doesn't route through CarPlay)
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

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
      
      utterance.onerror = () => {
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
      return false
    }
  }, [setSpeaking, settings.volume])

  // ElevenLabs via Audio element (routes through CarPlay!)
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Check cache
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
        console.log('🔊 Cache play failed')
      }
    }

    // Fetch from API
    if (!navigator.onLine) {
      console.log('🔊 Offline')
      return false
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: {
            stability: 0.90,        // HIGH stability - no choppiness
            similarity_boost: 0.80,
            style: 0.05,            // LOW style variation
            use_speaker_boost: true
          }
        }),
      })

      if (!response.ok) return false

      const blob = await response.blob()
      if (blob.size < 500) return false

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
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Prevent duplicates
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

    // Try ElevenLabs first (routes through CarPlay)
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fall back to native (phone speaker only)
    console.log('🔊 Falling back to native speech')
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio for iOS
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio...')
    
    // Unlock audio element
    if (audioRef.current) {
      const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAS7u7vd3d0iIiIiIiJ3d3e7u93dIiIiAAAAAHd3vd3SIiIAAAAiIiIid3d3u7u93SIiIiIAAAB3d73d0iIiIiIAAAAiInd3d7u73d0iIiIiIiIid3e7u7u7u93dIiIiIiJ3d3e7u7u73d3SIiIiInd3d7u7u93d3SIiIiIid3d3u7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3d0iIiIiIiInd3e7u93d0iIiIiIiJ3d3e7u7vd3dIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0iIiIiIiJ3d3e7u7vd3SIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0='
      
      audioRef.current.src = silentMp3
      audioRef.current.volume = 0.01
      
      try {
        await audioRef.current.play()
        audioRef.current.pause()
        console.log('🔊 Audio unlocked')
      } catch (e) {}
    }
    
    // Unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 10)
      } catch (e) {}
    }
    
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

// ================================
// Pre-load essential callouts including sweepers
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    // Regular curves
    'Left 1', 'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 1', 'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Left 2 long', 'Right 2 long',
    'Left 3 ahead', 'Right 3 ahead',
    'Left 4 ahead', 'Right 4 ahead',
    'Left 5 ahead', 'Right 5 ahead',
    'Chicane', 'S curve',
    
    // NEW: Sweeper callouts (common angles for highways)
    'Sweeper left, 5 degrees',
    'Sweeper right, 5 degrees',
    'Sweeper left, 8 degrees',
    'Sweeper right, 8 degrees',
    'Sweeper left, 10 degrees',
    'Sweeper right, 10 degrees',
    'Sweeper left, 12 degrees',
    'Sweeper right, 12 degrees',
    'Sweeper left, 15 degrees',
    'Sweeper right, 15 degrees',
    'Sweeper left, 18 degrees',
    'Sweeper right, 18 degrees',
    'Sweeper left, 20 degrees',
    'Sweeper right, 20 degrees',
    'Sweeper left, 22 degrees',
    'Sweeper right, 22 degrees',
    'Sweeper left, 25 degrees',
    'Sweeper right, 25 degrees',
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  console.log(`🔊 Pre-caching ${total} essential callouts (including sweepers)...`)
  
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

// ================================
// Callout generators
// ================================

/**
 * Generate callout text for a curve
 * NEW: Handles sweepers with angle
 */
export function generateCallout(curve) {
  if (!curve) return null
  
  // NEW: Handle sweepers - "Sweeper right, 15 degrees"
  if (curve.isSweeper) {
    const dir = curve.direction === 'LEFT' ? 'left' : 'right'
    const angle = curve.sweeperAngle || curve.totalAngle || 10
    return `Sweeper ${dir}, ${angle} degrees`
  }
  
  // Handle chicanes
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${firstDir} ${curve.severitySequence || ''}`
  }
  
  // Handle technical sections
  if (curve.isTechnicalSection) {
    const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
    return `Technical section ${dir}, ${curve.curveCount} curves`
  }
  
  // Regular curve
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let text = `${dir} ${curve.severity}`
  if (curve.modifier) {
    const mods = { 'TIGHTENS': 'tightens', 'OPENS': 'opens', 'LONG': 'long', 'HAIRPIN': 'hairpin' }
    text += ` ${mods[curve.modifier] || curve.modifier.toLowerCase()}`
  }
  return text
}

/**
 * Generate final warning for hard curves
 */
export function generateFinalWarning(curve) {
  if (!curve) return null
  
  // Sweepers don't need final warnings - they're gentle
  if (curve.isSweeper) return null
  
  // Only for severity 5+
  if (curve.severity < 5) return null
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return `${dir} now`
}

export function generateStraightCallout() { return null }
export function generateZoneTransitionCallout(from, to) { return null }

export default useSpeech
