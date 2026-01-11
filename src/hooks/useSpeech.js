import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook - Simple & Working
// ElevenLabs with native fallback
// Voice ID: puLAe8o1npIDg434vYZp
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)

  // Initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create audio element
    audioRef.current = new Audio()
    
    audioRef.current.addEventListener('ended', () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    })
    
    audioRef.current.addEventListener('error', () => {
      isPlayingRef.current = false
      setSpeaking(false, '')
    })

    // Native speech synthesis fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        // Find a good English voice
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Alex', 'Ava', 'Tom']
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
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = loadVoices
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Native speech (reliable fallback)
  const speakNative = useCallback((text) => {
    if (!synthRef.current) return false

    try {
      synthRef.current.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      if (voiceRef.current) {
        utterance.voice = voiceRef.current
      }
      utterance.rate = 1.0
      utterance.pitch = 1.0
      utterance.volume = settings.volume || 1.0

      utterance.onstart = () => {
        isPlayingRef.current = true
        setSpeaking(true, text)
      }
      utterance.onend = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      utterance.onerror = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      synthRef.current.speak(utterance)
      return true
    } catch (err) {
      console.error('Native speech error:', err)
      return false
    }
  }, [setSpeaking, settings.volume])

  // ElevenLabs TTS (checks cache first)
  const speakElevenLabs = useCallback(async (text) => {
    // Check cache first (for offline support)
    if (AUDIO_CACHE.has(text)) {
      try {
        audioRef.current.src = AUDIO_CACHE.get(text)
        audioRef.current.volume = settings.volume || 1.0
        isPlayingRef.current = true
        setSpeaking(true, text)
        await audioRef.current.play()
        return true
      } catch (err) {
        console.error('Cache playback error:', err)
      }
    }

    // Can't fetch if offline
    if (!navigator.onLine) {
      return false
    }

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
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      
      // Cache for future use
      AUDIO_CACHE.set(text, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await audioRef.current.play()
      return true
    } catch (err) {
      console.error('ElevenLabs error:', err)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    // Don't repeat same callout within 2 seconds
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
      return false
    }

    // Handle priority
    if (priority === 'high') {
      audioRef.current?.pause()
      synthRef.current?.cancel()
      isPlayingRef.current = false
    } else if (isPlayingRef.current || synthRef.current?.speaking) {
      return false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Try ElevenLabs first, fall back to native
    const success = await speakElevenLabs(text)
    if (success) return true

    // Fallback to native
    return speakNative(text)
  }, [settings.voiceEnabled, speakElevenLabs, speakNative])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => {
    return isPlayingRef.current || (synthRef.current?.speaking ?? false)
  }, [])

  // Simple init for iOS - just play/pause to unlock audio
  const initAudio = useCallback(async () => {
    try {
      audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV////////////////////////////////////////////AAAAAExhdmM1OC4xMwAAAAAAAAAAAAAAACQAAAAAAAAAAQGwSRPuNgAAAAAAAAAAAAAAAAD/4xjEAAV0A0AgAAANI2hG4ow/8uD/Lw/ygP8oGP/E4Bh/5c/+XP/l4f5QH+UB/lz/5eH//5cP/Lhj/8uGP/y4f//+Mf/lz//w/8uH/lwx/+XDH/y5/8vD'
      audioRef.current.volume = 0.01
      await audioRef.current.play()
      audioRef.current.pause()
    } catch (e) {
      // Ignore - just trying to unlock
    }
  }, [])

  return { speak, stop, isSpeaking, initAudio, preloadRouteAudio }
}

// Audio cache for offline use
const AUDIO_CACHE = new Map()

// Preload callouts for a route (for offline use)
async function preloadRouteAudio(curves) {
  if (!curves || curves.length === 0) {
    return { success: true, cached: 0, total: 0 }
  }

  if (!navigator.onLine) {
    return { success: false, cached: 0, total: 0 }
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
    }
  })

  const calloutList = Array.from(callouts)
  console.log(`🎤 Pre-loading ${calloutList.length} callouts...`)

  let cached = 0
  let failed = 0

  for (const text of calloutList) {
    if (AUDIO_CACHE.has(text)) {
      cached++
      continue
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: 'puLAe8o1npIDg374vYZp' }),
      })

      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 500) {
          AUDIO_CACHE.set(text, URL.createObjectURL(blob))
          cached++
        } else {
          failed++
        }
      } else {
        failed++
      }
    } catch (err) {
      failed++
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 100))
  }

  console.log(`🎤 Cached ${cached}/${calloutList.length} callouts`)
  
  return { 
    success: cached > 0, 
    cached, 
    total: calloutList.length, 
    failed 
  }
}

// Generate smart callout text with speeds
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  // Get recommended speed for severity
  const getSpeed = (severity) => {
    const baseSpeedsImperial = {
      1: 65, 2: 55, 3: 45, 4: 35, 5: 28, 6: 20
    }
    const modeMultipliers = { cruise: 0.9, fast: 1.0, race: 1.15 }
    const multiplier = modeMultipliers[mode] || 1.0
    const speed = Math.round((baseSpeedsImperial[severity] || 40) * multiplier)
    
    if (speedUnit === 'kmh') {
      return Math.round(speed * 1.609)
    }
    return speed
  }

  const parts = []
  const speed = getSpeed(curve.severity)
  
  if (curve.isChicane) {
    // Chicane/S-curve callout
    const dirWord = curve.startDirection === 'LEFT' ? 'left' : 'right'
    const chicaneSpeed = getSpeed(Math.max(...(curve.severitySequence?.split('-').map(Number) || [curve.severity])))
    
    if (curve.chicaneType === 'CHICANE') {
      parts.push(`Chicane ${dirWord} ${curve.severitySequence}, ${chicaneSpeed} through`)
    } else {
      parts.push(`S ${dirWord} ${curve.severitySequence}, ${chicaneSpeed}`)
    }
  } else {
    // Standard curve
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    // Add modifier with speed implications
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN':
          parts.push(`hairpin, ${getSpeed(6)}`)
          break
        case 'SHARP':
          parts.push(`sharp, ${speed - 5}`)
          break
        case 'LONG':
          parts.push(`long, hold ${speed}`)
          break
        case 'TIGHTENS':
          // Tightening curve - give entry speed then exit speed
          const tighterSpeed = getSpeed(Math.min(6, curve.severity + 1))
          parts.push(`tightens, ${speed} to ${tighterSpeed}`)
          break
        case 'OPENS':
          // Opening curve - can accelerate through
          const fasterSpeed = getSpeed(Math.max(1, curve.severity - 1))
          parts.push(`opens, ${speed} to ${fasterSpeed}`)
          break
        default:
          parts.push(`, ${speed}`)
      }
    } else {
      // No modifier - just add speed
      parts.push(`, ${speed}`)
    }
  }
  
  // Add linked curve info if present
  if (nextCurve && !curve.isChicane) {
    const distanceToNext = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    const nextSpeed = getSpeed(nextCurve.severity)
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    
    if (distanceToNext < 30 && distanceToNext >= 0) {
      // Very close - "into"
      parts.push(`into ${nextDir} ${nextCurve.severity}, ${nextSpeed}`)
    } else if (distanceToNext < 80 && distanceToNext >= 0) {
      // Close - "then"
      parts.push(`then ${nextDir} ${nextCurve.severity}, ${nextSpeed}`)
    } else if (distanceToNext < 150 && distanceToNext >= 0) {
      // Medium distance - "and"
      parts.push(`and ${nextDir} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(' ')
}

// Generate shorter callout for repeats/updates (just key info)
export function generateShortCallout(curve, mode = 'cruise') {
  if (!curve) return ''
  
  const getSpeed = (severity) => {
    const baseSpeeds = { 1: 65, 2: 55, 3: 45, 4: 35, 5: 28, 6: 20 }
    const multipliers = { cruise: 0.9, fast: 1.0, race: 1.15 }
    return Math.round((baseSpeeds[severity] || 40) * (multipliers[mode] || 1.0))
  }
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  const speed = getSpeed(curve.severity)
  
  return `${dir} ${curve.severity}, ${speed}`
}

export default useSpeech
