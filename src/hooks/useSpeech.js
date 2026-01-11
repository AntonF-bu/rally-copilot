import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v3 - Multi-Voice Pre-caching
// Supports relaxed/normal/urgent voice styles
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

    const audio = new Audio()
    audio.playsInline = true
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = () => {
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
        
        // Adjust rate based on style
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
        audioRef.current.src = AUDIO_CACHE.get(cacheKey)
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.playbackRate = voiceConfig.playbackRate
        isPlayingRef.current = true
        setSpeakingWithTimeout(true, text, 5000)
        await audioRef.current.play()
        return true
      } catch (err) {
        console.error('Cache playback error:', err)
        isPlayingRef.current = false
        setSpeaking(false, '')
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
      
      isPlayingRef.current = true
      setSpeakingWithTimeout(true, text, 5000)
      
      await audioRef.current.play()
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

    const success = await speakElevenLabs(text, style)
    if (success) return true
    
    return speakNative(text, style)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const initAudio = useCallback(async () => {
    try {
      if (audioRef.current) {
        audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v/////////////////////////////////'
        audioRef.current.volume = 0.01
        try {
          await audioRef.current.play()
          audioRef.current.pause()
        } catch (e) {}
      }
      
      if (synthRef.current) {
        try {
          const u = new SpeechSynthesisUtterance('')
          u.volume = 0
          synthRef.current.speak(u)
          setTimeout(() => synthRef.current?.cancel(), 10)
        } catch (e) {}
      }
      
      console.log('🔊 Audio initialized')
      return true
    } catch (e) {
      return true
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
    preloadCopilotVoices  // Export the preload function
  }
}

/**
 * Pre-cache essential callouts in all voice styles
 * Returns progress updates via callback
 */
export async function preloadCopilotVoices(curves, segments, onProgress) {
  if (!navigator.onLine) {
    return { success: false, cached: 0, total: 0, error: 'offline' }
  }

  // Build list of callouts to cache
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
  const stylesToCache = new Set(['normal']) // Always cache normal
  
  if (segments?.length) {
    segments.forEach(seg => {
      const style = CHARACTER_TO_VOICE[seg.character]
      if (style) stylesToCache.add(style)
    })
  } else {
    // Cache all styles if no segments info
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
      
      // Skip if already cached
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
      
      onProgress?.({ cached, failed, total: totalItems, percent: (cached / totalItems) * 100 })
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 80))
    }
  }

  console.log(`🔊 Pre-cache complete: ${cached}/${totalItems} cached, ${failed} failed`)
  
  return { 
    success: cached > 0, 
    cached, 
    failed,
    total: totalItems 
  }
}

// Legacy export for compatibility
export async function preloadRouteAudio(curves) {
  return preloadCopilotVoices(curves, null, null)
}

// Callout generation functions (unchanged)
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null, phase = 'main') {
  if (!curve) return ''

  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 24, 6: 18 }
    const mult = { cruise: 0.92, fast: 1.0, race: 1.15 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 0.92))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }

  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'left' : 'right')
    : (curve.direction === 'LEFT' ? 'left' : 'right')
  const Dir = dir.charAt(0).toUpperCase() + dir.slice(1)
  
  const speed = curve.isChicane 
    ? getSpeed(Math.max(...curve.severitySequence.split('-').map(Number)))
    : getSpeed(curve.severity)

  if (curve.isChicane) {
    if (phase === 'final') return `Chicane ${dir} now!`
    return `Chicane ${dir} ${curve.severitySequence}`
  }

  if (phase === 'early') {
    return `${Dir} ${curve.severity} ahead`
  }
  
  if (phase === 'final') {
    return curve.severity >= 5 ? `${Dir} ${curve.severity} now!` : `${Dir} now`
  }

  // Main callout
  let callout = `${Dir} ${curve.severity}`
  if (curve.modifier) {
    callout += ` ${curve.modifier.toLowerCase()}`
  }
  
  return callout
}

export function generateEarlyWarning(curve, mode = 'cruise', speedUnit = 'mph') {
  return generateCallout(curve, mode, speedUnit, null, 'early')
}

export function generateFinalWarning(curve, mode = 'cruise', speedUnit = 'mph') {
  return generateCallout(curve, mode, speedUnit, null, 'final')
}

export function generateStraightCallout(distanceMeters, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
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

// Zone transition callouts
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
