import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v6 - Cache Fix + Offline Fallback
// - Caches full callouts with modifiers
// - Falls back to native speech when offline/cache miss
// - Better logging for debugging
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Voice style configurations - HIGH STABILITY to prevent choppiness
export const VOICE_STYLES = {
  relaxed: {
    stability: 0.92,
    similarity_boost: 0.80,
    style: 0.05,
    playbackRate: 0.95,
    label: 'Highway'
  },
  normal: {
    stability: 0.88,
    similarity_boost: 0.80,
    style: 0.08,
    playbackRate: 1.0,
    label: 'Spirited'
  },
  urgent: {
    stability: 0.85,
    similarity_boost: 0.80,
    style: 0.10,
    playbackRate: 1.05,
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
      console.error('🔊 Audio error:', e)
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
        console.log('🔊 Voice loaded:', voiceRef.current?.name)
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

  // Native speech synthesis - works offline!
  const speakNative = useCallback((text, style = 'normal') => {
    if (!synthRef.current) {
      console.log('🔊 No speech synthesis available')
      return false
    }

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
        
        utterance.onerror = (e) => {
          console.error('🔊 Native speech error:', e)
          clearTimeout(timeoutRef.current)
          isPlayingRef.current = false
          setSpeaking(false, '')
        }

        synthRef.current.speak(utterance)
      }, 10)

      isPlayingRef.current = true
      setSpeakingWithTimeout(true, text, 5000)
      console.log(`🔊 Speaking (native): "${text}"`)
      return true
    } catch (err) {
      console.error('🔊 Native speech error:', err)
      return false
    }
  }, [setSpeaking, setSpeakingWithTimeout, settings.volume])

  // ElevenLabs speech - checks cache first
  const speakElevenLabs = useCallback(async (text, style = 'normal') => {
    const cacheKey = getCacheKey(text, style)
    const voiceConfig = VOICE_STYLES[style] || VOICE_STYLES.normal
    
    // Check cache first
    if (AUDIO_CACHE.has(cacheKey)) {
      console.log(`🔊 Cache HIT: "${text}" (${style})`)
      try {
        const cachedUrl = AUDIO_CACHE.get(cacheKey)
        audioRef.current.src = cachedUrl
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.playbackRate = voiceConfig.playbackRate
        audioRef.current.currentTime = 0
        
        isPlayingRef.current = true
        setSpeakingWithTimeout(true, text, 5000)
        
        const playPromise = audioRef.current.play()
        if (playPromise !== undefined) {
          await playPromise
        }
        return true
      } catch (err) {
        console.error('🔊 Cache playback error:', err)
        isPlayingRef.current = false
        setSpeaking(false, '')
        // Fall through to try fetching or native
      }
    } else {
      console.log(`🔊 Cache MISS: "${text}" (${style})`)
    }

    // If offline, don't try to fetch
    if (!navigator.onLine) {
      console.log('🔊 Offline - using native speech')
      return false // Will fall back to native
    }

    // Try fetching from API
    try {
      console.log(`🔊 Fetching from API: "${text}"`)
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

      if (!response.ok) {
        console.log(`🔊 API error: ${response.status}`)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.log('🔊 Audio blob too small')
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(cacheKey, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      audioRef.current.playbackRate = voiceConfig.playbackRate
      audioRef.current.currentTime = 0
      
      isPlayingRef.current = true
      setSpeakingWithTimeout(true, text, 5000)
      
      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        await playPromise
      }
      return true
    } catch (err) {
      console.error('🔊 ElevenLabs error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, setSpeakingWithTimeout, settings.volume])

  // Set current voice style
  const setVoiceStyle = useCallback((style) => {
    if (VOICE_STYLES[style]) {
      currentStyleRef.current = style
      console.log(`🔊 Voice style set to: ${style}`)
    }
  }, [])

  // Main speak function - ALWAYS tries to speak something
  const speak = useCallback(async (text, priority = 'normal', styleOverride = null) => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    const style = styleOverride || currentStyleRef.current
    
    // Prevent duplicate callouts within 2 seconds
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
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
      console.log(`🔊 Already speaking, skipping: "${text}"`)
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    console.log(`🔊 Speaking: "${text}" (style: ${style}, priority: ${priority})`)

    // Try ElevenLabs first (uses cache)
    const success = await speakElevenLabs(text, style)
    if (success) return true
    
    // Fall back to native speech - ALWAYS works offline
    console.log('🔊 Falling back to native speech')
    return speakNative(text, style)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio for iOS
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS...')
    
    try {
      // Resume AudioContext
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
      
      // Play silent audio to unlock
      if (audioRef.current) {
        const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAS7u7vd3d0iIiIiIiJ3d3e7u93dIiIiAAAAAHd3vd3SIiIAAAAiIiIid3d3u7u93SIiIiIAAAB3d73d0iIiIiIAAAAiInd3d7u73d0iIiIiIiIid3e7u7u7u93dIiIiIiJ3d3e7u7u73d3SIiIiInd3d7u7u93d3SIiIiIid3d3u7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3d0iIiIiIiInd3e7u93d0iIiIiIiJ3d3e7u7vd3dIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0iIiIiIiJ3d3e7u7vd3SIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0='
        
        audioRef.current.src = silentMp3
        audioRef.current.volume = 0.01
        
        try {
          await audioRef.current.play()
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          console.log('🔊 Audio element unlocked')
        } catch (e) {
          console.log('🔊 Silent play info:', e.message)
        }
      }
      
      // Test speech synthesis
      if (synthRef.current) {
        try {
          const utterance = new SpeechSynthesisUtterance('')
          utterance.volume = 0
          synthRef.current.speak(utterance)
          setTimeout(() => {
            try { synthRef.current?.cancel() } catch (e) {}
          }, 10)
          console.log('🔊 Speech synthesis ready')
        } catch (e) {}
      }
      
      console.log('🔊 Audio initialization complete')
      return true
    } catch (e) {
      console.error('🔊 Audio init error:', e)
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

  const isCached = useCallback((text, style = 'normal') => {
    return AUDIO_CACHE.has(getCacheKey(text, style))
  }, [])

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
 * Pre-cache essential callouts
 * FIXED: Now caches full callouts WITH modifiers
 */
export async function preloadCopilotVoices(curves, segments, onProgress) {
  if (!navigator.onLine) {
    return { success: false, cached: 0, total: 0, error: 'offline' }
  }

  const callouts = new Set()
  
  // Basic direction + severity callouts
  const directions = ['Left', 'Right']
  const severities = [2, 3, 4, 5, 6] // Skip severity 1 - not announced
  const modifiers = ['', ' long', ' tightens', ' opens', ' hairpin']
  
  // Generate all combinations
  directions.forEach(dir => {
    severities.forEach(sev => {
      modifiers.forEach(mod => {
        callouts.add(`${dir} ${sev}${mod}`)
      })
    })
  })
  
  // Early warnings
  directions.forEach(dir => {
    severities.forEach(sev => {
      callouts.add(`${dir} ${sev} ahead`)
      modifiers.forEach(mod => {
        if (mod) callouts.add(`${dir} ${sev} ahead,${mod}`)
      })
    })
  })
  
  // Final warnings
  directions.forEach(dir => {
    callouts.add(`${dir} now`)
    severities.filter(s => s >= 5).forEach(sev => {
      callouts.add(`${dir} ${sev} now!`)
    })
  })
  
  // Zone transitions
  callouts.add('Technical section ahead')
  callouts.add('Highway ahead, relax')
  callouts.add('Urban zone')
  callouts.add('Back to spirited')
  
  // Clear callouts - common distances
  callouts.add('Clear ahead')
  callouts.add('Clear')
  callouts.add('Clear, 600 meters')
  callouts.add('Clear, 800 meters')
  callouts.add('Clear, 1000 meters')
  callouts.add('Clear, 2000 feet')
  callouts.add('Clear, 2500 feet')
  callouts.add('Clear, 3000 feet')
  callouts.add('Clear, 3500 feet')
  callouts.add('Clear, 4000 feet')
  callouts.add('Clear, 5000 feet')
  callouts.add('Clear, 6000 feet')
  
  // Chicanes from route
  if (curves?.length) {
    curves.forEach(curve => {
      if (curve.isChicane && curve.severitySequence) {
        const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
        callouts.add(`Chicane ${dir}-${curve.endDirection?.toLowerCase() || 'right'} ${curve.severitySequence}`)
        callouts.add(`S-curve ${dir}-${curve.endDirection?.toLowerCase() || 'right'} ${curve.severitySequence}`)
      }
      
      // Add specific curve callouts from the route
      if (curve.direction && curve.severity) {
        const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
        const mod = curve.modifier ? ` ${curve.modifier.toLowerCase()}` : ''
        callouts.add(`${dir} ${curve.severity}${mod}`)
      }
    })
  }

  const calloutList = Array.from(callouts)
  
  // Determine styles to cache
  const stylesToCache = new Set(['normal', 'urgent']) // Always cache both main styles
  
  if (segments?.length) {
    segments.forEach(seg => {
      const style = CHARACTER_TO_VOICE[seg.character]
      if (style) stylesToCache.add(style)
    })
  }
  
  const styles = Array.from(stylesToCache)
  const totalItems = calloutList.length * styles.length
  let cached = 0
  let failed = 0

  console.log(`🔊 Pre-caching ${totalItems} callouts (${calloutList.length} phrases × ${styles.length} styles)`)
  console.log(`🔊 Sample callouts:`, calloutList.slice(0, 10))

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
  console.log(`🔊 Cache size: ${AUDIO_CACHE.size} entries`)
  
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
    callout += ` ${mod}`
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
