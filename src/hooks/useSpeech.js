import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - ElevenLabs + Offline Cache
// With Audio Ducking for Spotify/Music compatibility
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
  
  const audioContextRef = useRef(null)
  const gainNodeRef = useRef(null)
  const audioElementRef = useRef(null)
  const isPlayingRef = useRef(false)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)

  // Initialize with Web Audio API for better audio mixing
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio context for mixing/ducking
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      gainNodeRef.current = audioContextRef.current.createGain()
      gainNodeRef.current.connect(audioContextRef.current.destination)
    } catch (e) {
      console.log('Web Audio API not available')
    }

    // Create audio element with special settings for notifications
    audioElementRef.current = new Audio()
    
    // iOS: Request audio session for 'playback' with mixing
    if ('audioSession' in navigator) {
      try {
        // @ts-ignore - experimental API
        navigator.audioSession.type = 'play-and-record' // Allows mixing
      } catch (e) {}
    }
    
    // Set up audio element for notification-style playback
    audioElementRef.current.setAttribute('playsinline', 'true')
    audioElementRef.current.setAttribute('webkit-playsinline', 'true')
    
    audioElementRef.current.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
    }
    
    audioElementRef.current.onerror = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Initialize native speech synthesis
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

    // Set up Media Session for system integration
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Rally Co-Pilot',
        artist: 'Navigation',
        album: 'Driving'
      })
    }

    return () => {
      audioElementRef.current?.pause()
      synthRef.current?.cancel()
      audioContextRef.current?.close()
    }
  }, [setSpeaking])

  // Resume audio context (needed after user interaction on iOS)
  const ensureAudioContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
      } catch (e) {}
    }
  }, [])

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
      return false
    }
  }, [])

  // Pre-cache all callouts for a route
  const preloadRouteAudio = useCallback(async (curves, onProgress) => {
    if (!curves || curves.length === 0) {
      return { success: true, cached: 0, total: 0 }
    }

    const callouts = new Set()

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

    // Add common callouts
    ['Caution', 'Tightens', 'Opens'].forEach(s => callouts.add(s))

    const calloutList = Array.from(callouts)
    const total = calloutList.length

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
        await new Promise(r => setTimeout(r, 80))
      }

      cacheStatus.progress = i + 1
      onProgress?.(i + 1, total, cached, failed)
    }

    cacheStatus = { isPreloading: false, progress: total, total, ready: cached > 0 }
    
    return { success: failed < total * 0.5, cached, total, failed }
  }, [fetchAndCacheAudio])

  // Play audio with ducking behavior
  const playWithDucking = useCallback(async (audioUrl, text) => {
    await ensureAudioContext()
    
    try {
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      // Set volume slightly higher to cut through music
      audioElementRef.current.volume = Math.min(1.0, (settings.volume || 1.0) * 1.2)
      audioElementRef.current.src = audioUrl
      
      // Use play() which should trigger audio ducking on iOS
      await audioElementRef.current.play()
      
      return true
    } catch (err) {
      console.error('Playback error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [ensureAudioContext, setSpeaking, settings.volume])

  // Play from cache
  const playFromCache = useCallback(async (text) => {
    const audioUrl = AUDIO_CACHE.get(text)
    if (!audioUrl) return false
    return playWithDucking(audioUrl, text)
  }, [playWithDucking])

  // Speak using ElevenLabs
  const speakElevenLabs = useCallback(async (text) => {
    if (AUDIO_CACHE.has(text)) {
      return playFromCache(text)
    }

    if (!navigator.onLine) return false

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
      AUDIO_CACHE.set(text, audioUrl)
      
      return playWithDucking(audioUrl, text)
    } catch (err) {
      return false
    }
  }, [playFromCache, playWithDucking])

  // Native speech (also supports ducking on iOS)
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) utterance.voice = voiceRef.current
      
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = Math.min(1.0, (settings.volume || 1.0))

      utterance.onstart = () => setSpeaking(true, text)
      utterance.onend = () => setSpeaking(false, '')
      utterance.onerror = () => setSpeaking(false, '')

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
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
      audioElementRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current || synthRef.current?.speaking) {
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try cached first, then live, then native
    if (AUDIO_CACHE.has(text)) {
      const success = await playFromCache(text)
      if (success) return true
    }

    if (navigator.onLine) {
      const success = await speakElevenLabs(text)
      if (success) return true
    }

    return speakNative(text)
  }, [settings.voiceEnabled, playFromCache, speakElevenLabs, speakNative])

  // Initialize audio on first user interaction (required for iOS)
  const initAudio = useCallback(async () => {
    await ensureAudioContext()
    
    // Play a silent audio to unlock audio playback
    try {
      const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
      silentAudio.volume = 0.01
      await silentAudio.play()
      silentAudio.pause()
    } catch (e) {}
    
    console.log('🔊 Audio initialized')
  }, [ensureAudioContext])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  const stop = useCallback(() => {
    audioElementRef.current?.pause()
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
