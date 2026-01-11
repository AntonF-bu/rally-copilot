import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Offline Cache
// Simplified: No complex audio APIs
// Voice ID: puLAe8o1npIDg374vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Global audio cache
const AUDIO_CACHE = new Map()

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

    // Simple audio element
    audioRef.current = new Audio()
    
    audioRef.current.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audioRef.current.onerror = (e) => {
      console.error('Audio playback error:', e)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Initialize native speech synthesis as fallback
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

      if (!response.ok) {
        console.error('TTS API error:', response.status)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.error('TTS returned invalid audio')
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(text, audioUrl)
      return true
    } catch (err) {
      console.error('TTS fetch error:', err)
      return false
    }
  }, [])

  // Pre-cache all callouts for a route
  const preloadRouteAudio = useCallback(async (curves, onProgress) => {
    if (!curves || curves.length === 0) {
      return { success: true, cached: 0, total: 0 }
    }

    // Check if online
    if (!navigator.onLine) {
      console.log('Offline - skipping preload')
      return { success: false, cached: 0, total: 0, failed: 0 }
    }

    const callouts = new Set()

    // Generate callouts for each curve
    curves.forEach(curve => {
      if (curve.isChicane) {
        const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
        callouts.add(curve.chicaneType === 'CHICANE' 
          ? `Chicane ${dir} ${curve.severitySequence}`
          : `S ${dir} ${curve.severitySequence}`)
      } else {
        const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
        callouts.add(`${dir} ${curve.severity}`)
        
        if (curve.modifier) {
          callouts.add(`${dir} ${curve.severity} ${curve.modifier.toLowerCase()}`)
        }
        
        // Common combinations
        for (let nextSev = 2; nextSev <= 5; nextSev++) {
          callouts.add(`${dir} ${curve.severity} into left ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} into right ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} then left ${nextSev}`)
          callouts.add(`${dir} ${curve.severity} then right ${nextSev}`)
        }
      }
    })

    // Add common standalone callouts
    ['Caution', 'Tightens', 'Opens'].forEach(s => callouts.add(s))

    const calloutList = Array.from(callouts)
    const total = calloutList.length

    console.log(`🎤 Pre-loading ${total} callouts...`)

    cacheStatus = { isPreloading: true, progress: 0, total, ready: false }
    onProgress?.(0, total)

    let cached = 0
    let failed = 0

    for (let i = 0; i < calloutList.length; i++) {
      const text = calloutList[i]
      
      if (AUDIO_CACHE.has(text)) {
        cached++
      } else {
        const success = await fetchAndCacheAudio(text)
        if (success) cached++
        else failed++
        
        // Small delay between requests
        await new Promise(r => setTimeout(r, 80))
      }

      cacheStatus.progress = i + 1
      onProgress?.(i + 1, total, cached, failed)
    }

    cacheStatus = { isPreloading: false, progress: total, total, ready: cached > 0 }
    
    console.log(`🎤 Pre-loaded ${cached}/${total} (${failed} failed)`)
    
    return { success: failed < total * 0.3, cached, total, failed }
  }, [fetchAndCacheAudio])

  // Play audio from URL
  const playAudio = useCallback(async (audioUrl, text) => {
    try {
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      
      await audioRef.current.play()
      return true
    } catch (err) {
      console.error('Playback error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, settings.volume])

  // Play from cache
  const playFromCache = useCallback(async (text) => {
    const audioUrl = AUDIO_CACHE.get(text)
    if (!audioUrl) return false
    return playAudio(audioUrl, text)
  }, [playAudio])

  // Speak using ElevenLabs (live or cached)
  const speakElevenLabs = useCallback(async (text) => {
    // Check cache first
    if (AUDIO_CACHE.has(text)) {
      console.log('🎤 Playing from cache:', text)
      return playFromCache(text)
    }

    // Can't fetch if offline
    if (!navigator.onLine) {
      return false
    }

    // Fetch and play
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
      
      // Cache for future
      AUDIO_CACHE.set(text, audioUrl)
      
      return playAudio(audioUrl, text)
    } catch (err) {
      console.error('ElevenLabs error:', err)
      return false
    }
  }, [playFromCache, playAudio])

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
      console.log('🔊 Native speech:', text)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Prevent repeating same callout too fast
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    // High priority interrupts current speech
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current || synthRef.current?.speaking) {
      // Don't interrupt for normal priority
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try ElevenLabs first (cached or live)
    const success = await speakElevenLabs(text)
    if (success) return true

    // Fallback to native speech
    console.log('🔊 Falling back to native speech')
    return speakNative(text)
  }, [settings.voiceEnabled, speakElevenLabs, speakNative])

  // Initialize audio on user interaction (for iOS)
  const initAudio = useCallback(async () => {
    // Play silent audio to unlock playback
    try {
      const silentBlob = new Blob(
        [new Uint8Array([255, 227, 24, 196, 0, 0, 0, 3, 72, 0, 0, 0, 0, 76, 65, 77, 69])],
        { type: 'audio/mp3' }
      )
      const silentUrl = URL.createObjectURL(silentBlob)
      audioRef.current.src = silentUrl
      audioRef.current.volume = 0.01
      await audioRef.current.play()
      audioRef.current.pause()
      URL.revokeObjectURL(silentUrl)
      console.log('🔊 Audio initialized')
    } catch (e) {
      // May fail but that's okay
      console.log('Audio init attempted')
    }
  }, [])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const getCacheStatus = useCallback(() => ({
    ...cacheStatus,
    cachedCount: AUDIO_CACHE.size
  }), [])

  const clearCache = useCallback(() => {
    AUDIO_CACHE.forEach(url => URL.revokeObjectURL(url))
    AUDIO_CACHE.clear()
    cacheStatus = { isPreloading: false, progress: 0, total: 0, ready: false }
  }, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    preloadRouteAudio,
    getCacheStatus,
    clearCache,
    initAudio
  }
}

// Generate Callout Text
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'left' : 'right'
    parts.push(curve.chicaneType === 'CHICANE' 
      ? `Chicane ${dirWord} ${curve.severitySequence}`
      : `S ${dirWord} ${curve.severitySequence}`)
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
