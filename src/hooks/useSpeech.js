import { useCallback, useEffect, useRef } from 'react'
import { Howl, Howler } from 'howler'
import useStore from '../store'

// ================================
// Speech Hook v16 - HYBRID APPROACH
// Howler for iOS unlock, plain HTML5 Audio for playback
// This avoids Web Audio sample rate issues causing choppiness
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Cache blob URLs
const BLOB_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  // Plain HTML5 Audio element for playback (no Web Audio = no choppiness)
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const audioUnlockedRef = useRef(false)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create plain HTML5 Audio element for playback
    const audio = document.createElement('audio')
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    
    audio.onended = () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.log('🔊 Audio error:', e)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audioRef.current = audio

    // Native speech as fallback
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
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // ================================
  // iOS AUDIO UNLOCK - Use Howler for this!
  // Howler is great at unlocking iOS audio
  // ================================
  const initAudio = useCallback(() => {
    console.log('🔊 initAudio called - using Howler for unlock')
    
    // Use Howler to unlock iOS audio
    const unlockHowl = new Howl({
      src: ['data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='],
      volume: 0.01,
      html5: true,
      onplay: () => {
        console.log('🔊 Howler unlock playing')
      },
      onend: () => {
        console.log('🔊 ✅ Howler unlock complete')
        audioUnlockedRef.current = true
        
        // Now also "prime" our HTML5 Audio element
        if (audioRef.current) {
          audioRef.current.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
          audioRef.current.play().then(() => {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            console.log('🔊 ✅ HTML5 Audio primed')
          }).catch(() => {})
        }
      },
      onplayerror: (id, err) => {
        console.log('🔊 Howler unlock error:', err)
      }
    })
    unlockHowl.play()
    
    // Also unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 10)
      } catch (e) {}
    }
    
    audioUnlockedRef.current = true
    return Promise.resolve(true)
  }, [])

  // ================================
  // NATIVE SPEECH (fallback)
  // ================================
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
      return false
    }
  }, [setSpeaking, settings.volume])

  // ================================
  // ELEVENLABS TTS - Plain HTML5 Audio (no Web Audio!)
  // This should avoid the choppiness
  // ================================
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Get blob URL from cache or fetch new
    let audioUrl = BLOB_CACHE.get(cacheKey)
    
    if (!audioUrl) {
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

        audioUrl = URL.createObjectURL(blob)
        BLOB_CACHE.set(cacheKey, audioUrl)
      } catch (err) {
        console.log('🔊 Fetch error:', err?.message)
        return false
      }
    }

    // Play using plain HTML5 Audio (NOT Howler - avoids Web Audio routing)
    try {
      const audio = audioRef.current
      if (!audio) {
        console.log('🔊 No audio element')
        return false
      }
      
      // Stop any current playback
      audio.pause()
      audio.currentTime = 0
      
      // Set new source and play
      audio.src = audioUrl
      audio.volume = settings.volume || 1.0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audio.play()
      console.log(`🔊 Playing (HTML5): "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 Play error:', err?.message)
      isPlayingRef.current = false
      setSpeaking(false, '')
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
      return false
    }

    // Handle priority
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current) {
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
    audioRef.current?.pause()
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
// PRELOAD
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 2', 'Left 3', 'Left 4', 'Left 5',
    'Right 2', 'Right 3', 'Right 4', 'Right 5',
    'Technical section', 'Highway'
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
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
          BLOB_CACHE.set(getCacheKey(text), URL.createObjectURL(blob))
          cached++
        }
      }
    } catch (e) {}
    
    onProgress?.({ cached, total, percent: (cached / total) * 100 })
  }
  
  console.log(`🔊 Cached ${cached}/${total}`)
  return { success: true, cached, total }
}

// Legacy exports
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
