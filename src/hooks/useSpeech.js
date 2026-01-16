import { useCallback, useEffect, useRef } from 'react'
import { Howl, Howler } from 'howler'
import useStore from '../store'

// ================================
// Speech Hook v11 - Using Howler.js
// Howler handles iOS Safari audio unlock automatically
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Audio cache using Howl instances
const HOWL_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

export function useSpeech() {
  const { settings, setSpeaking, isRunning } = useStore()
  
  const currentHowlRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const audioUnlockedRef = useRef(false)

  // Initialize native speech as fallback
  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Ava', 'Alex']
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
      currentHowlRef.current?.stop()
      synthRef.current?.cancel()
    }
  }, [])

  // ================================
  // iOS AUDIO UNLOCK
  // Howler handles this automatically, but we can force it
  // ================================
  const initAudio = useCallback(() => {
    console.log('🔊 initAudio called (Howler)')
    
    // Howler's built-in mobile unlock
    try {
      // Create a tiny silent sound to trigger unlock
      const silentHowl = new Howl({
        src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'],
        volume: 0.01,
        onend: () => {
          audioUnlockedRef.current = true
          console.log('🔊 ✅ Howler audio unlocked')
        },
        onloaderror: () => {
          console.log('🔊 Howler silent load error (ok)')
        },
        onplayerror: () => {
          console.log('🔊 Howler silent play error (ok)')
        }
      })
      silentHowl.play()
    } catch (e) {
      console.log('🔊 Howler init error:', e?.message)
    }
    
    // Also unlock speech synthesis
    try {
      if (synthRef.current) {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 10)
      }
    } catch (e) {}
    
    audioUnlockedRef.current = true
    return Promise.resolve(true)
  }, [])

  // ================================
  // NATIVE SPEECH (fallback)
  // ================================
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
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      
      utterance.onerror = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      isPlayingRef.current = true
      setSpeaking(true, text)
      synthRef.current.speak(utterance)
      console.log(`🔊 Native: "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 Native error:', err?.message)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ================================
  // ELEVENLABS TTS via Howler
  // ================================
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Check cache
    if (HOWL_CACHE.has(cacheKey)) {
      try {
        const cachedHowl = HOWL_CACHE.get(cacheKey)
        
        // Stop current audio
        currentHowlRef.current?.stop()
        currentHowlRef.current = cachedHowl
        
        cachedHowl.volume(settings.volume || 1.0)
        cachedHowl.seek(0)
        
        isPlayingRef.current = true
        setSpeaking(true, text)
        cachedHowl.play()
        
        console.log(`🔊 Cached: "${text}"`)
        return true
      } catch (err) {
        console.log('🔊 Cache play error:', err?.message)
      }
    }

    // Fetch from API
    if (!navigator.onLine) {
      console.log('🔊 Offline')
      return false
    }

    try {
      console.log(`🔊 Fetching: "${text}"`)
      
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
        console.log(`🔊 TTS error: ${response.status}`)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.log('🔊 TTS too small')
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      
      // Create Howl instance
      const howl = new Howl({
        src: [audioUrl],
        format: ['mp3'],
        html5: true, // Important for iOS - uses HTML5 Audio instead of Web Audio
        volume: settings.volume || 1.0,
        onend: () => {
          isPlayingRef.current = false
          setSpeaking(false, '')
        },
        onloaderror: (id, err) => {
          console.log('🔊 Howl load error:', err)
          isPlayingRef.current = false
          setSpeaking(false, '')
        },
        onplayerror: (id, err) => {
          console.log('🔊 Howl play error:', err)
          // Try to unlock and play again
          howl.once('unlock', () => {
            howl.play()
          })
        }
      })
      
      // Cache it
      HOWL_CACHE.set(cacheKey, howl)
      
      // Stop current and play new
      currentHowlRef.current?.stop()
      currentHowlRef.current = howl
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      howl.play()
      
      console.log(`🔊 ElevenLabs: "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 ElevenLabs error:', err?.message)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ================================
  // MAIN SPEAK FUNCTION
  // ================================
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) {
      return false
    }

    const now = Date.now()
    
    // Prevent duplicates
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      console.log(`🔊 Skip duplicate: "${text}"`)
      return false
    }

    // Handle priority
    if (priority === 'high') {
      currentHowlRef.current?.stop()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
      console.log(`🔊 Already playing, skip: "${text}"`)
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    console.log(`🔊 Speaking: "${text}" (${priority})`)

    // Try ElevenLabs first
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fall back to native
    console.log('🔊 Falling back to native')
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const stop = useCallback(() => {
    currentHowlRef.current?.stop()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const isAudioUnlocked = useCallback(() => audioUnlockedRef.current, [])

  return { 
    speak, 
    stop, 
    isSpeaking, 
    initAudio,
    isAudioUnlocked,
    preloadCopilotVoices
  }
}

// ================================
// PRELOAD ESSENTIAL CALLOUTS
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 2', 'Left 3', 'Left 4', 'Left 5',
    'Right 2', 'Right 3', 'Right 4', 'Right 5',
    'Technical section', 'Highway', 'Urban area'
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  console.log(`🔊 Pre-caching ${total} callouts...`)
  
  for (const text of essentialCallouts) {
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: { stability: 0.90, similarity_boost: 0.80, style: 0.05, use_speaker_boost: true }
        }),
      })
      
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 500) {
          const audioUrl = URL.createObjectURL(blob)
          const howl = new Howl({
            src: [audioUrl],
            format: ['mp3'],
            html5: true,
            preload: true
          })
          HOWL_CACHE.set(getCacheKey(text), howl)
          cached++
        }
      }
    } catch (e) {}
    
    onProgress?.({ cached, total, percent: (cached / total) * 100 })
  }
  
  console.log(`🔊 Cached ${cached}/${total}`)
  return { success: true, cached, total }
}

// Legacy exports for compatibility
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
