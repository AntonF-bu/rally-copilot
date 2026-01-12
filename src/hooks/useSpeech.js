import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v4 - iOS Audio Fix
// Proper audio context unlocking for Safari
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Voice style configurations
export const VOICE_STYLES = {
  relaxed: {
    stability: 0.90,
    similarity_boost: 0.80,
    style: 0.10,
    playbackRate: 0.95,
    label: 'Highway'
  },
  normal: {
    stability: 0.75,
    similarity_boost: 0.80,
    style: 0.15,
    playbackRate: 1.0,
    label: 'Spirited'
  },
  urgent: {
    stability: 0.60,
    similarity_boost: 0.75,
    style: 0.25,
    playbackRate: 1.1,
    label: 'Technical'
  }
}

// Map route character to voice style
export const CHARACTER_TO_VOICE = {
  transit: 'relaxed',
  spirited: 'normal',
  technical: 'urgent',
  urban: 'normal'
}

// Multi-voice cache: Map<"text:style", audioUrl>
const AUDIO_CACHE = new Map()

// Audio context for iOS
let audioContext = null
let audioUnlocked = false

// Get cache key
const getCacheKey = (text, style = 'normal') => `${text}:${style}`

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)
  const currentStyleRef = useRef('normal')

  // Initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element with iOS-specific attributes
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    // This helps on iOS
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.error('Audio error:', e)
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

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
      setTimeout(loadVoices, 100)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  const setSpeakingWithTimeout = useCallback((speaking, text, duration = 5000) => {
    clearTimeout(timeoutRef.current)
    setSpeaking(speaking, text)
    
    if (speaking) {
      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, duration)
    }
  }, [setSpeaking])

  const speakNative = useCallback((text, style = 'normal') => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()
      
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text)
        
        if (voiceRef.current) {
          utterance.voice = voiceRef.current
        }
        
        const voiceConfig = VOICE_STYLES[style] || VOICE_STYLES.normal
        utterance.rate = voiceConfig.playbackRate
        utterance.pitch = 1.0
        utterance.volume = settings.volume || 1.0

        utterance.onend = () => {
          clearTimeout(timeoutRef.current)
          isPlayingRef.current = false
          setSpeaking(false, '')
        }
        
        utterance.onerror = () => {
          clearTimeout(timeoutRef.current)
          isPlayingRef.current = false
          setSpeaking(false, '')
        }

        synthRef.current.speak(utterance)
      }, 10)

      isPlayingRef.current = true
      setSpeakingWithTimeout(true, text, 5000)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [setSpeaking, setSpeakingWithTimeout, settings.volume])

  const speakElevenLabs = useCallback(async (text, style = 'normal') => {
    const cacheKey = getCacheKey(text, style)
    const voiceConfig = VOICE_STYLES[style] || VOICE_STYLES.normal
    
    // Check cache first
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        const cachedUrl = AUDIO_CACHE.get(cacheKey)
        audioRef.current.src = cachedUrl
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.playbackRate = voiceConfig.playbackRate
        audioRef.current.currentTime = 0
        
        isPlayingRef.current = true
        setSpeakingWithTimeout(true, text, 5000)
        
        // Use play() with promise handling for iOS
        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          await playPromise
        }
        return true
      } catch (err) {
        console.error('Cache playback error:', err)
        isPlayingRef.current = false
        setSpeaking(false, '')
        // Don't return false - try fetching fresh
      }
    }

    if (!navigator.onLine) return false

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: {
            stability: voiceConfig.stability,
            similarity_boost: voiceConfig.similarity_boost,
            style: voiceConfig.style,
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
      audioRef.current.playbackRate = voiceConfig.playbackRate
      audioRef.current.currentTime = 0
      
      isPlayingRef.current = true
      setSpeakingWithTimeout(true, text, 5000)
      
      // Use play() with promise handling for iOS
      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        await playPromise
      }
      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, setSpeakingWithTimeout, settings.volume])

  // Set current voice style (for route character)
  const setVoiceStyle = useCallback((style) => {
    if (VOICE_STYLES[style]) {
      currentStyleRef.current = style
    }
  }, [])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal', styleOverride = null) => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    const style = styleOverride || currentStyleRef.current
    
    // Prevent duplicate callouts
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
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

    console.log(`🔊 Speaking: "${text}" (style: ${style})`)

    // Try ElevenLabs first, fall back to native
    const success = await speakElevenLabs(text, style)
    if (success) return true
    
    console.log('🔊 Falling back to native speech')
    return speakNative(text, style)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // ================================================================
  // FIXED: Proper iOS audio unlocking
  // ================================================================
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS...')
    
    try {
      // Method 1: Create and resume AudioContext (required for iOS Safari)
      if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (AudioContext) {
          audioContext = new AudioContext()
        }
      }
      
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume()
        console.log('🔊 AudioContext resumed')
      }
      
      // Method 2: Play a silent sound on the audio element
      if (audioRef.current) {
        // Create a very short silent audio
        // This is a minimal valid MP3 file (silent)
        const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAS7u7vd3d0iIiIiIiJ3d3e7u93dIiIiAAAAAHd3vd3SIiIAAAAiIiIid3d3u7u93SIiIiIAAAB3d73d0iIiIiIAAAAiInd3d7u73d0iIiIiIiIid3e7u7u7u93dIiIiIiJ3d3e7u7u73d3SIiIiInd3d7u7u93d3SIiIiIid3d3u7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3d0iIiIiIiInd3e7u93d0iIiIiIiJ3d3e7u7vd3dIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0iIiIiIiJ3d3e7u7vd3SIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0='
        
        audioRef.current.src = silentMp3
        audioRef.current.volume = 0.01
        
        try {
          await audioRef.current.play()
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          console.log('🔊 Audio element unlocked')
        } catch (e) {
          console.log('🔊 Silent play failed (expected on some browsers):', e.message)
        }
      }
      
      // Method 3: Trigger speech synthesis (helps on some iOS versions)
      if (synthRef.current) {
        try {
          const utterance = new SpeechSynthesisUtterance('')
          utterance.volume = 0
          synthRef.current.speak(utterance)
          setTimeout(() => {
            try { synthRef.current?.cancel() } catch (e) {}
          }, 10)
          console.log('🔊 Speech synthesis unlocked')
        } catch (e) {
          console.log('🔊 Speech synthesis unlock failed:', e.message)
        }
      }
      
      audioUnlocked = true
      console.log('🔊 Audio initialization complete')
      return true
    } catch (e) {
      console.error('🔊 Audio init error:', e)
      return true // Return true anyway to not block
    }
  }, [])

  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current)
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])

  // Check if a callout is cached
  const isCached = useCallback((text, style = 'normal') => {
    return AUDIO_CACHE.has(getCacheKey(text, style))
  }, [])

  // Get cache stats
  const getCacheStats = useCallback(() => {
    return {
      size: AUDIO_CACHE.size,
      keys: Array.from(AUDIO_CACHE.keys())
    }
  }, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio, 
    setVoiceStyle,
    isCached,
    getCacheStats,
    preloadCopilotVoices
  }
}

/**
 * Pre-cache essential callouts in all voice styles
 */
export async function preloadCopilotVoices(curves, segments, onProgress) {
  if (!navigator.onLine) {
    return { success: false, cached: 0, total: 0, error: 'offline' }
  }

  const callouts = new Set()
  
  // Basic direction + severity callouts
  const directions = ['Left', 'Right']
  const severities = [1, 2, 3, 4, 5, 6]
  
  directions.forEach(dir => {
    severities.forEach(sev => {
      callouts.add(`${dir} ${sev}`)
    })
  })
  
  // Common modifiers
  callouts.add('tightens')
  callouts.add('opens')
  callouts.add('long')
  callouts.add('hairpin')
  
  // Zone transitions
  callouts.add('Technical section ahead')
  callouts.add('Highway ahead, relax')
  callouts.add('Urban zone')
  callouts.add('Back to spirited')
  
  // Clear callouts
  callouts.add('Clear ahead')
  callouts.add('Clear')
  
  // Add curve-specific callouts from route
  if (curves?.length) {
    curves.forEach(curve => {
      if (curve.isChicane && curve.severitySequence) {
        const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
        callouts.add(`Chicane ${dir} ${curve.severitySequence}`)
      }
    })
  }

  const calloutList = Array.from(callouts)
  
  // Determine which styles to cache based on route segments
  const stylesToCache = new Set(['normal'])
  
  if (segments?.length) {
    segments.forEach(seg => {
      const style = CHARACTER_TO_VOICE[seg.character]
      if (style) stylesToCache.add(style)
    })
  } else {
    stylesToCache.add('relaxed')
    stylesToCache.add('urgent')
  }
  
  const styles = Array.from(stylesToCache)
  const totalItems = calloutList.length * styles.length
  let cached = 0
  let failed = 0

  console.log(`🔊 Pre-caching ${totalItems} callouts (${calloutList.length} phrases × ${styles.length} styles)`)

  for (const style of styles) {
    const voiceConfig = VOICE_STYLES[style]
    
    for (const text of calloutList) {
      const cacheKey = getCacheKey(text, style)
      
      if (AUDIO_CACHE.has(cacheKey)) {
        cached++
        onProgress?.({ cached, total: totalItems, percent: (cached / totalItems) * 100 })
        continue
      }
      
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text, 
            voiceId: ELEVENLABS_VOICE_ID,
            voiceSettings: {
              stability: voiceConfig.stability,
              similarity_boost: voiceConfig.similarity_boost,
              style: voiceConfig.style,
              use_speaker_boost: true
            }
          }),
        })
        
        if (response.ok) {
          const blob = await response.blob()
          if (blob.size > 500) {
            AUDIO_CACHE.set(cacheKey, URL.createObjectURL(blob))
            cached++
          } else {
            failed++
          }
        } else {
          failed++
        }
      } catch (e) {
        failed++
      }
      
      onProgress?.({ cached, total: totalItems, percent: (cached / totalItems) * 100 })
    }
  }

  console.log(`🔊 Pre-cache complete: ${cached}/${totalItems} cached, ${failed} failed`)
  
  return { 
    success: failed < totalItems * 0.5,
    cached, 
    total: totalItems, 
    failed 
  }
}

// ================================
// CALLOUT GENERATORS
// ================================

export function generateCallout(curve, mode, speedUnit, nextCurve = null, phase = 'main') {
  if (!curve) return null
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  const severity = curve.severity
  
  let callout = `${dir} ${severity}`
  
  if (curve.modifier) {
    const modMap = {
      'TIGHTENS': 'tightens',
      'OPENS': 'opens',
      'LONG': 'long',
      'HAIRPIN': 'hairpin'
    }
    const mod = modMap[curve.modifier] || curve.modifier.toLowerCase()
    callout += `, ${mod}`
  }
  
  return callout
}

export function generateFinalWarning(curve, speedUnit) {
  if (!curve) return null
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return curve.severity >= 5 ? `${dir} ${curve.severity} now!` : `${dir} now`
}

export function generateStraightCallout(distanceMeters, nextCurve, speedUnit) {
  if (distanceMeters < 300) return null
  
  if (nextCurve) {
    const nextDir = nextCurve.isChicane 
      ? (nextCurve.startDirection === 'LEFT' ? 'left' : 'right')
      : (nextCurve.direction === 'LEFT' ? 'left' : 'right')
    return `Clear. ${nextDir.charAt(0).toUpperCase() + nextDir.slice(1)} ${nextCurve.severity} ahead.`
  }
  return `Clear ahead`
}

export function generateInSectionCallout(curve, mode, speedUnit) {
  const dir = curve.direction === 'LEFT' ? 'left' : 'right'
  const Dir = dir.charAt(0).toUpperCase() + dir.slice(1)
  
  if (curve.severity >= 5) {
    return `${Dir} ${curve.severity}!`
  }
  return `${Dir} ${curve.severity}`
}

export function generateZoneTransitionCallout(fromCharacter, toCharacter) {
  const transitions = {
    'technical': 'Technical section ahead',
    'transit': 'Highway ahead, relax',
    'urban': 'Urban zone',
    'spirited': 'Back to spirited'
  }
  
  return transitions[toCharacter] || null
}

export default useSpeech
