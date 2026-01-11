import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Offline Cache
// Pre-downloads all callouts for offline use
// Voice ID: puLAe8o1npIDg374vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Global audio cache - persists across component remounts
const AUDIO_CACHE = new Map()

// Track cache status
let cacheStatus = {
  isPreloading: false,
  progress: 0,
  total: 0,
  ready: false
}

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const isPlayingRef = useRef(false)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    audioRef.current = new Audio()
    audioRef.current.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    audioRef.current.onerror = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Initialize native speech as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return

        const preferred = ['Daniel', 'Alex', 'Tom', 'Fred', 'Samantha', 'Karen']
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
    }

    return () => {
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Fetch and cache a single callout
  const fetchAndCacheAudio = useCallback(async (text) => {
    if (AUDIO_CACHE.has(text)) return true

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })

      if (!response.ok) return false

      const blob = await response.blob()
      if (blob.size < 500) return false

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(text, audioUrl)
      return true
    } catch (err) {
      console.error('Failed to cache:', text, err)
      return false
    }
  }, [])

  // Pre-cache all callouts for a route
  const preloadRouteAudio = useCallback(async (curves, onProgress) => {
    if (!curves || curves.length === 0) {
      console.log('🎤 No curves to preload')
      return { success: true, cached: 0, total: 0 }
    }

    // Generate all unique callouts for the route
    const callouts = new Set()

    curves.forEach(curve => {
      if (curve.isChicane) {
        const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
        if (curve.chicaneType === 'CHICANE') {
          callouts.add(`Chicane ${dir} ${curve.severitySequence}`)
        } else {
          callouts.add(`S ${dir} ${curve.severitySequence}`)
        }
      } else {
        const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
        
        // Base callout
        callouts.add(`${dir} ${curve.severity}`)
        
        // With modifiers
        if (curve.modifier) {
          callouts.add(`${dir} ${curve.severity} ${curve.modifier.toLowerCase()}`)
        }
        
        // Common combinations with "into" and "then"
        for (let nextSev = 1; nextSev <= 6; nextSev++) {
          callouts.add(`${dir} ${curve.severity} into left ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} into right ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} then left ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} then right ${nextSev}`)
        }
      }
    })

    // Add common standalone callouts
    const standalones = ['Caution', 'Tightens', 'Opens', 'Keep left', 'Keep right']
    standalones.forEach(s => callouts.add(s))

    const calloutList = Array.from(callouts)
    const total = calloutList.length

    console.log(`🎤 Pre-loading ${total} callouts for offline use...`)

    cacheStatus = { isPreloading: true, progress: 0, total, ready: false }
    onProgress?.(0, total)

    let cached = 0
    let failed = 0

    for (let i = 0; i < calloutList.length; i++) {
      const text = calloutList[i]
      
      // Skip if already cached
      if (AUDIO_CACHE.has(text)) {
        cached++
      } else {
        const success = await fetchAndCacheAudio(text)
        if (success) {
          cached++
        } else {
          failed++
        }
        
        // Small delay to not overwhelm the API
        await new Promise(r => setTimeout(r, 100))
      }

      cacheStatus.progress = i + 1
      onProgress?.(i + 1, total, cached, failed)
    }

    cacheStatus = { isPreloading: false, progress: total, total, ready: cached > 0 }
    
    console.log(`🎤 Pre-loaded ${cached}/${total} callouts (${failed} failed)`)
    
    return { success: failed < total * 0.5, cached, total, failed }
  }, [fetchAndCacheAudio])

  // Play from cache (offline-safe)
  const playFromCache = useCallback(async (text) => {
    const audioUrl = AUDIO_CACHE.get(text)
    if (!audioUrl) return false

    try {
      isPlayingRef.current = true
      setSpeaking(true, text)
      audioRef.current.src = audioUrl
      await audioRef.current.play()
      return true
    } catch (err) {
      console.error('Cache playback error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking])

  // Speak using ElevenLabs (live fetch)
  const speakElevenLabs = useCallback(async (text) => {
    // First check cache
    if (AUDIO_CACHE.has(text)) {
      console.log('🎤 Playing from cache:', text)
      return playFromCache(text)
    }

    // If offline, can't fetch
    if (!navigator.onLine) {
      console.log('🎤 Offline, no cache for:', text)
      return false
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })

      if (!response.ok) return false

      const audioBlob = await response.blob()
      if (audioBlob.size < 500) return false

      const audioUrl = URL.createObjectURL(audioBlob)
      
      // Cache for future use
      AUDIO_CACHE.set(text, audioUrl)
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      audioRef.current.src = audioUrl
      await audioRef.current.play()

      return true
    } catch (err) {
      console.error('🎤 ElevenLabs error:', err)
      return false
    }
  }, [setSpeaking, playFromCache])

  // Native speech fallback
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) utterance.voice = voiceRef.current
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = () => setSpeaking(false, '')

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('🔊 Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current || synthRef.current?.speaking) {
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Priority order:
    // 1. Cached audio (works offline!)
    // 2. Live ElevenLabs (if online)
    // 3. Native speech (always works)

    if (AUDIO_CACHE.has(text)) {
      const success = await playFromCache(text)
      if (success) return true
    }

    if (navigator.onLine) {
      const success = await speakElevenLabs(text)
      if (success) return true
    }

    // Last resort: native speech
    console.log('🔊 Using native speech (offline or API failed)')
    return speakNative(text)
  }, [settings.voiceEnabled, playFromCache, speakElevenLabs, speakNative])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  // Get cache status
  const getCacheStatus = useCallback(() => {
    return {
      ...cacheStatus,
      cachedCount: AUDIO_CACHE.size
    }
  }, [])

  // Clear cache (for memory management)
  const clearCache = useCallback(() => {
    AUDIO_CACHE.forEach(url => URL.revokeObjectURL(url))
    AUDIO_CACHE.clear()
    cacheStatus = { isPreloading: false, progress: 0, total: 0, ready: false }
    console.log('🎤 Audio cache cleared')
  }, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    preloadRouteAudio,
    getCacheStatus,
    clearCache
  }
}

// ================================
// Generate Callout Text
// ================================

export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'left' : 'right'
    
    if (curve.chicaneType === 'CHICANE') {
      parts.push(`Chicane ${dirWord} ${curve.severitySequence}`)
    } else {
      parts.push(`S ${dirWord} ${curve.severitySequence}`)
    }
  } else {
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    if (curve.modifier) {
      parts.push(curve.modifier.toLowerCase())
    }
  }
  
  if (nextCurve && !curve.isChicane) {
    const distanceToNext = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    
    if (distanceToNext < 30 && distanceToNext >= 0) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`into ${nextDir} ${nextCurve.severity}`)
    } else if (distanceToNext < 100 && distanceToNext >= 0) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`then ${nextDir} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(' ')
}

export default useSpeech
