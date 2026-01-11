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

    // Try ElevenLabs first (better voice)
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fallback to native speech
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio (call from user interaction)
  const initAudio = useCallback(async () => {
    try {
      // Unlock audio context
      if (audioRef.current) {
        audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v/////////////////////////////////'
        audioRef.current.volume = 0.01
        try {
          await audioRef.current.play()
          audioRef.current.pause()
        } catch (playErr) {
          console.log('Audio unlock skipped:', playErr.message)
        }
      }
      
      // Unlock speech synthesis
      if (synthRef.current) {
        try {
          const u = new SpeechSynthesisUtterance('')
          u.volume = 0
          synthRef.current.speak(u)
          setTimeout(() => synthRef.current?.cancel(), 10)
        } catch (speechErr) {
          console.log('Speech unlock skipped:', speechErr.message)
        }
      }
      
      console.log('🔊 Audio initialized')
      return true
    } catch (e) {
      console.log('Audio init error:', e.message)
      return true // Return true anyway to not block navigation
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

// Generate callout - ADAPTIVE LENGTH based on time available
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null, phase = 'main', options = {}) {
  if (!curve) return ''

  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
    const mult = { cruise: 1.0, fast: 1.15, race: 1.3 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }

  const dir = curve.direction === 'LEFT' ? 'left' : 'right'
  const Dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  const speed = getSpeed(curve.severity)
  const isHard = curve.severity >= 4
  const isVeryHard = curve.severity >= 5
  const isGentle = curve.severity <= 2
  
  // Distance text
  const distText = getDistanceText(curve.distance, speedUnit)
  
  // Check gap to next curve - determines callout length
  let gapToNext = 999
  if (nextCurve) {
    gapToNext = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
  }
  const hasTimeForDetail = gapToNext > 150 // More than 150m to next curve = time for details
  
  // Curve character description
  const curveCharacter = getCurveCharacter(curve)
  
  // PHASE: EARLY WARNING
  if (phase === 'early') {
    if (isVeryHard) {
      return `Caution ahead. ${curveCharacter} ${dir} ${curve.severity} in ${distText}. Prepare to slow to ${speed}.`
    }
    if (isHard) {
      return `${curveCharacter} ${dir} ${curve.severity} coming in ${distText}. Target ${speed}.`
    }
    return `${curveCharacter} ${dir} ${curve.severity} ahead in ${distText}.`
  }
  
  // PHASE: FINAL WARNING - always short
  if (phase === 'final') {
    if (isVeryHard) {
      return `${Dir} ${curve.severity} now! ${speed}!`
    }
    return `${Dir} ${curve.severity} now.`
  }
  
  // PHASE: MAIN CALLOUT - length depends on time available
  const sentences = []
  
  if (curve.isChicane) {
    const chicaneDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
    const maxSev = Math.max(...(curve.severitySequence?.split('-').map(Number) || [curve.severity]))
    const chicaneSpeed = getSpeed(maxSev)
    
    sentences.push(`In ${distText}, chicane starting ${chicaneDir}.`)
    sentences.push(`Severity ${curve.severitySequence}, take at ${chicaneSpeed}.`)
    
  } else {
    // Opening with action and curve info
    if (isVeryHard) {
      sentences.push(`Slow to ${speed}.`)
      sentences.push(`In ${distText}, ${curveCharacter} ${dir} ${curve.severity}.`)
    } else if (isHard) {
      sentences.push(`Brake ahead.`)
      sentences.push(`In ${distText}, ${curveCharacter} ${dir} ${curve.severity}. Target ${speed}.`)
    } else if (isGentle) {
      sentences.push(`In ${distText}, gentle ${dir} ${curve.severity}. ${speed}.`)
    } else {
      sentences.push(`In ${distText}, ${curveCharacter} ${dir} ${curve.severity}. Target ${speed}.`)
    }
    
    // Add details ONLY if we have time (next curve is far)
    if (hasTimeForDetail) {
      // Curve behavior
      if (curve.modifier) {
        switch (curve.modifier) {
          case 'HAIRPIN': 
            sentences.push(`Hairpin turn. Slow to ${getSpeed(6)} at apex.`)
            break
          case 'SHARP': 
            sentences.push(`Sharp turn.`)
            break
          case 'LONG': 
            sentences.push(`Long curve, hold your line.`)
            break
          case 'TIGHTENS':
            sentences.push(`Tightens through. Exit at ${getSpeed(Math.min(6, curve.severity + 1))}.`)
            break
          case 'OPENS':
            sentences.push(`Opens on exit. Accelerate to ${getSpeed(Math.max(1, curve.severity - 1))}.`)
            break
        }
      }
      
      // Length info for long curves
      if (curve.length > 150) {
        const lengthText = speedUnit === 'kmh' 
          ? `${Math.round(curve.length)} meters long`
          : `${Math.round(curve.length * 3.28084 / 50) * 50} feet long`
        sentences.push(lengthText + '.')
      }
    }
  }
  
  // Next curve preview
  if (nextCurve && !curve.isChicane) {
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    const nextSpeed = getSpeed(nextCurve.severity)
    const nextCharacter = getCurveCharacter(nextCurve)
    
    if (gapToNext < 50) {
      sentences.push(`Immediately into ${nextDir} ${nextCurve.severity}.`)
    } else if (gapToNext < 150) {
      sentences.push(`Then ${nextDir} ${nextCurve.severity} at ${nextSpeed}.`)
    } else if (gapToNext < 300 && hasTimeForDetail) {
      sentences.push(`${nextCharacter} ${nextDir} ${nextCurve.severity} follows.`)
    }
  }
  
  return sentences.join(' ')
}

// Get curve character description
function getCurveCharacter(curve) {
  if (!curve) return ''
  
  const severity = curve.severity
  const length = curve.length || 0
  
  // Wide sweeper
  if (severity <= 2 && length > 150) {
    return 'sweeping'
  }
  
  if (severity <= 1) return 'gentle'
  if (severity === 2) return 'easy'
  if (severity === 3) return 'moderate'
  if (severity === 4) return 'tight'
  if (severity === 5) return 'sharp'
  return 'very sharp'
}

// Short distance text
function getShortDistanceText(distanceMeters, speedUnit = 'mph') {
  if (!distanceMeters || distanceMeters < 0) return 'ahead'
  
  if (speedUnit === 'kmh') {
    if (distanceMeters >= 500) {
      return `${Math.round(distanceMeters / 100) * 100}m`
    }
    return `${Math.round(distanceMeters / 50) * 50}m`
  } else {
    const feet = distanceMeters * 3.28084
    if (feet >= 1000) {
      return `${Math.round(feet / 100) * 100} feet`
    }
    return `${Math.round(feet / 50) * 50} feet`
  }
}

// Generate straight section callout - SHORT
export function generateStraightCallout(distanceMeters, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const distText = getShortDistanceText(distanceMeters, speedUnit)
  
  if (nextCurve) {
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    return `Clear. ${nextDir} ${nextCurve.severity} in ${distText}.`
  }
  return `Clear for ${distText}.`
}

// Generate "after curve" callout - SHORT
export function generatePostCurveCallout(straightDistance, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const distText = getShortDistanceText(straightDistance, speedUnit)
  
  if (nextCurve) {
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    return `Clear. ${nextDir} ${nextCurve.severity} in ${distText}.`
  }
  return `Clear for ${distText}.`
}

// Convert distance to natural speech
function getDistanceText(distanceMeters, speedUnit = 'mph') {
  if (!distanceMeters || distanceMeters < 0) return 'ahead'
  
  if (speedUnit === 'kmh') {
    // Metric
    if (distanceMeters >= 1000) {
      const km = Math.round(distanceMeters / 100) / 10
      return `${km} kilometers`
    } else if (distanceMeters >= 200) {
      return `${Math.round(distanceMeters / 50) * 50} meters`
    } else if (distanceMeters >= 50) {
      return `${Math.round(distanceMeters / 25) * 25} meters`
    }
    return `${Math.round(distanceMeters)} meters`
  } else {
    // Imperial - convert to feet
    const feet = distanceMeters * 3.28084
    if (feet >= 2640) { // Half mile+
      const miles = Math.round(feet / 528) / 10
      return `${miles} miles`
    } else if (feet >= 1000) {
      return `${Math.round(feet / 100) * 100} feet`
    } else if (feet >= 200) {
      return `${Math.round(feet / 50) * 50} feet`
    }
    return `${Math.round(feet / 25) * 25} feet`
  }
}

// Generate early warning callout
export function generateEarlyWarning(curve, mode = 'cruise', speedUnit = 'mph') {
  return generateCallout(curve, mode, speedUnit, null, 'early')
}

// Generate final "NOW" callout
export function generateFinalWarning(curve, mode = 'cruise', speedUnit = 'mph') {
  return generateCallout(curve, mode, speedUnit, null, 'final')
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
