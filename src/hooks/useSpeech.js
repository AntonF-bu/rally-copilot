import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - iOS Fixed
// Native speech with timeout fallback
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'
const AUDIO_CACHE = new Map()

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)

  // Initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element
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

    // Native speech synthesis
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
            console.log('🔊 Voice selected:', found.name)
            break
          }
        }
        if (!voiceRef.current) {
          voiceRef.current = voices.find(v => v.lang.startsWith('en')) || voices[0]
        }
      }

      loadVoices()
      synthRef.current.onvoiceschanged = loadVoices
      
      // iOS hack: voices may not load immediately
      setTimeout(loadVoices, 100)
      setTimeout(loadVoices, 500)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Clear speaking state after timeout (iOS safety)
  const setSpeakingWithTimeout = useCallback((speaking, text, duration = 5000) => {
    clearTimeout(timeoutRef.current)
    setSpeaking(speaking, text)
    
    if (speaking) {
      // Auto-clear after timeout in case events don't fire (iOS issue)
      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, duration)
    }
  }, [setSpeaking])

  // Native speech
  const speakNative = useCallback((text) => {
    if (!synthRef.current) {
      console.log('🔊 No speech synthesis available')
      return false
    }

    try {
      // Cancel any ongoing speech
      synthRef.current.cancel()
      
      // iOS fix: need small delay after cancel
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text)
        
        if (voiceRef.current) {
          utterance.voice = voiceRef.current
        }
        utterance.rate = 1.0
        utterance.pitch = 1.0
        utterance.volume = settings.volume || 1.0

        utterance.onstart = () => {
          console.log('🔊 Speaking:', text)
        }
        
        utterance.onend = () => {
          clearTimeout(timeoutRef.current)
          isPlayingRef.current = false
          setSpeaking(false, '')
        }
        
        utterance.onerror = (e) => {
          console.log('🔊 Speech error:', e.error)
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

  // ElevenLabs TTS
  const speakElevenLabs = useCallback(async (text) => {
    // Check cache
    if (AUDIO_CACHE.has(text)) {
      try {
        audioRef.current.src = AUDIO_CACHE.get(text)
        audioRef.current.volume = settings.volume || 1.0
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
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })

      if (!response.ok) return false

      const blob = await response.blob()
      if (blob.size < 500) return false

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(text, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      
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

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Don't repeat within 2 seconds
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
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

    // Try native speech (most reliable on iOS)
    const nativeSuccess = speakNative(text)
    if (nativeSuccess) return true
    
    // Fallback to ElevenLabs
    return await speakElevenLabs(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio (call from user interaction)
  const initAudio = useCallback(async () => {
    try {
      // Unlock audio context
      if (audioRef.current) {
        audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v/////////////////////////////////'
        audioRef.current.volume = 0.01
        await audioRef.current.play()
        audioRef.current.pause()
      }
      
      // Unlock speech synthesis
      if (synthRef.current) {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current.cancel(), 10)
      }
      
      console.log('🔊 Audio initialized')
    } catch (e) {
      console.log('Audio init:', e.message)
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

  return { speak, stop, isSpeaking, initAudio, preloadRouteAudio }
}

// Preload for offline
async function preloadRouteAudio(curves) {
  if (!curves?.length || !navigator.onLine) {
    return { success: true, cached: 0, total: 0 }
  }

  const callouts = new Set()
  curves.forEach(curve => {
    if (curve.isChicane) {
      const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
      callouts.add(`Chicane ${dir} ${curve.severitySequence}`)
    } else {
      const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
      callouts.add(`${dir} ${curve.severity}`)
      if (curve.modifier) {
        callouts.add(`${dir} ${curve.severity} ${curve.modifier.toLowerCase()}`)
      }
    }
  })

  const list = Array.from(callouts)
  let cached = 0

  for (const text of list) {
    if (AUDIO_CACHE.has(text)) { cached++; continue }
    
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })
      if (res.ok) {
        const blob = await res.blob()
        if (blob.size > 500) {
          AUDIO_CACHE.set(text, URL.createObjectURL(blob))
          cached++
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 100))
  }

  return { success: cached > 0, cached, total: list.length }
}

// Generate callout with speeds
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const getSpeed = (severity) => {
    const speeds = { 1: 65, 2: 55, 3: 45, 4: 35, 5: 28, 6: 20 }
    const mult = { cruise: 0.9, fast: 1.0, race: 1.15 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }

  const parts = []
  const speed = getSpeed(curve.severity)
  
  if (curve.isChicane) {
    const dir = curve.startDirection === 'LEFT' ? 'left' : 'right'
    const maxSev = Math.max(...(curve.severitySequence?.split('-').map(Number) || [curve.severity]))
    parts.push(`Chicane ${dir} ${curve.severitySequence}, ${getSpeed(maxSev)} through`)
  } else {
    const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(`${dir} ${curve.severity}`)
    
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN': parts.push(`hairpin, ${getSpeed(6)}`); break
        case 'SHARP': parts.push(`sharp, ${speed - 5}`); break
        case 'LONG': parts.push(`long, hold ${speed}`); break
        case 'TIGHTENS':
          parts.push(`tightens, ${speed} to ${getSpeed(Math.min(6, curve.severity + 1))}`)
          break
        case 'OPENS':
          parts.push(`opens, ${speed} to ${getSpeed(Math.max(1, curve.severity - 1))}`)
          break
        default: parts.push(`, ${speed}`)
      }
    } else {
      parts.push(`, ${speed}`)
    }
  }
  
  if (nextCurve && !curve.isChicane) {
    const dist = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    const nextSpeed = getSpeed(nextCurve.severity)
    
    if (dist >= 0 && dist < 30) {
      parts.push(`into ${nextDir} ${nextCurve.severity}, ${nextSpeed}`)
    } else if (dist >= 0 && dist < 80) {
      parts.push(`then ${nextDir} ${nextCurve.severity}, ${nextSpeed}`)
    }
  }
  
  return parts.join(' ')
}

export function generateShortCallout(curve, mode = 'cruise') {
  if (!curve) return ''
  const speeds = { 1: 65, 2: 55, 3: 45, 4: 35, 5: 28, 6: 20 }
  const mult = { cruise: 0.9, fast: 1.0, race: 1.15 }
  const speed = Math.round((speeds[curve.severity] || 40) * (mult[mode] || 1.0))
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return `${dir} ${curve.severity}, ${speed}`
}

export default useSpeech
