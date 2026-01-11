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

// Generate callout with speeds
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null, phase = 'main', options = {}) {
  if (!curve) return ''

  const getSpeed = (severity) => {
    const speeds = { 1: 65, 2: 55, 3: 45, 4: 35, 5: 28, 6: 20 }
    const mult = { cruise: 0.9, fast: 1.0, race: 1.15 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }
  
  const getStraightSpeed = () => {
    const speeds = { cruise: 55, fast: 65, race: 75 }
    let speed = speeds[mode] || 55
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }

  const dir = curve.direction === 'LEFT' ? 'left' : 'right'
  const Dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  const speed = getSpeed(curve.severity)
  const isHard = curve.severity >= 4
  const isVeryHard = curve.severity >= 5
  
  // Distance text
  const distText = getDistanceText(curve.distance, speedUnit)
  
  // Curve length description
  const lengthDesc = getCurveLengthDescription(curve.length)
  
  // Elevation context (if available)
  const elevationContext = options.elevationChange ? getElevationContext(options.elevationChange) : ''
  
  // PHASE: EARLY WARNING (far away, heads up)
  if (phase === 'early') {
    if (curve.isChicane) {
      const chicaneDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
      return `Chicane ahead in ${distText}, starts ${chicaneDir}`
    }
    
    if (isVeryHard) {
      const modText = curve.modifier === 'HAIRPIN' ? 'hairpin ' : (curve.modifier === 'SHARP' ? 'sharp ' : '')
      return `Caution ahead, ${modText}${dir} ${curve.severity} in ${distText}, prepare to slow to ${speed}`
    }
    
    return `${Dir} ${curve.severity} ahead in ${distText}`
  }
  
  // PHASE: FINAL WARNING (very close, action needed NOW)
  if (phase === 'final') {
    if (curve.isChicane) {
      const chicaneDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
      return `Chicane now, ${chicaneDir}, ${getSpeed(curve.severity)}`
    }
    
    return `${Dir} ${curve.severity} now`
  }
  
  // PHASE: MAIN CALLOUT (primary announcement with full details)
  const parts = []
  
  if (curve.isChicane) {
    const chicaneDir = curve.startDirection === 'LEFT' ? 'left' : 'right'
    const maxSev = Math.max(...(curve.severitySequence?.split('-').map(Number) || [curve.severity]))
    const chicaneSpeed = getSpeed(maxSev)
    
    parts.push(`In ${distText}`)
    parts.push(`chicane starting ${chicaneDir}`)
    parts.push(`severity ${curve.severitySequence}`)
    parts.push(`${chicaneSpeed} through`)
    
    // Add length context for chicanes
    if (curve.length > 150) {
      parts.push(`${Math.round(curve.length)} meters long`)
    }
  } else {
    // Braking warning for hard curves
    if (isVeryHard) {
      parts.push(`Slow to ${speed}`)
    } else if (isHard) {
      parts.push(`Brake to ${speed}`)
    }
    
    // Distance
    parts.push(`In ${distText}`)
    
    // Direction and severity with description
    const severityDesc = getSeverityDescription(curve.severity)
    parts.push(`${dir} ${curve.severity}`)
    parts.push(severityDesc)
    
    // Curve length description
    if (lengthDesc) {
      parts.push(lengthDesc)
    }
    
    // Elevation context
    if (elevationContext) {
      parts.push(elevationContext)
    }
    
    // Modifier details
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN': 
          parts.push(`hairpin turn`)
          parts.push(`slow to ${getSpeed(6)}`)
          break
        case 'SHARP': 
          parts.push(`sharp`)
          break
        case 'LONG': 
          parts.push(`long sweeping curve`)
          parts.push(`hold ${speed}`)
          break
        case 'TIGHTENS':
          parts.push(`tightens through the turn`)
          parts.push(`exit at ${getSpeed(Math.min(6, curve.severity + 1))}`)
          break
        case 'OPENS':
          parts.push(`opens up on exit`)
          parts.push(`accelerate to ${getSpeed(Math.max(1, curve.severity - 1))}`)
          break
      }
    }
    
    // Speed if not already mentioned
    if (!isHard && !isVeryHard && !curve.modifier) {
      parts.push(`${speed}`)
    }
    
    // Exit direction hint for hard curves
    if (isHard && nextCurve) {
      const gapDist = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
      if (gapDist > 200) {
        parts.push(`exits to straight`)
      }
    }
  }
  
  // Next curve info (sequence awareness)
  if (nextCurve && !curve.isChicane) {
    const gapDist = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    const nextSpeed = getSpeed(nextCurve.severity)
    
    if (gapDist >= 0 && gapDist < 50) {
      parts.push(`immediately into ${nextDir} ${nextCurve.severity}`)
    } else if (gapDist >= 0 && gapDist < 150) {
      parts.push(`then ${nextDir} ${nextCurve.severity} at ${nextSpeed}`)
    } else if (gapDist >= 0 && gapDist < 300) {
      parts.push(`followed by ${nextDir} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(', ').replace(/, ,/g, ',').replace(/,\s*$/, '')
}

// Generate straight section callout
export function generateStraightCallout(distanceMeters, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const getStraightSpeed = () => {
    const speeds = { cruise: 55, fast: 65, race: 75 }
    let speed = speeds[mode] || 55
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }
  
  const speed = getStraightSpeed()
  const distText = getDistanceText(distanceMeters, speedUnit)
  
  const parts = []
  
  // Main message
  if (distanceMeters >= 800) {
    parts.push(`Clear ahead for ${distText}`)
    parts.push(`cruise at ${speed}`)
  } else if (distanceMeters >= 400) {
    parts.push(`Straight section`)
    parts.push(`${speed} for ${distText}`)
  } else {
    parts.push(`Short straight`)
    parts.push(`${speed}`)
  }
  
  // Add next curve preview if available
  if (nextCurve) {
    const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
    const nextSeverity = nextCurve.severity
    
    if (nextSeverity >= 4) {
      parts.push(`then ${nextDir} ${nextSeverity} ahead`)
    } else {
      parts.push(`${nextDir} ${nextSeverity} coming up`)
    }
  }
  
  return parts.join(', ')
}

// Generate "after curve" callout for straights following curves
export function generatePostCurveCallout(straightDistance, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const getStraightSpeed = () => {
    const speeds = { cruise: 55, fast: 65, race: 75 }
    let speed = speeds[mode] || 55
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }
  
  const speed = getStraightSpeed()
  
  if (straightDistance >= 500) {
    const distText = getDistanceText(straightDistance, speedUnit)
    if (nextCurve) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      return `Clear, ${speed}, next ${nextDir} ${nextCurve.severity} in ${distText}`
    }
    return `Clear ahead, ${speed} for ${distText}`
  } else if (straightDistance >= 200) {
    if (nextCurve) {
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      return `Short straight, ${nextDir} ${nextCurve.severity} ahead`
    }
    return `Short straight, ${speed}`
  }
  
  return '' // Too short to call out
}

// Get curve length description
function getCurveLengthDescription(lengthMeters) {
  if (!lengthMeters) return ''
  
  if (lengthMeters < 30) return 'quick turn'
  if (lengthMeters < 60) return 'short'
  if (lengthMeters < 100) return '' // Normal, no need to mention
  if (lengthMeters < 150) return 'extended'
  if (lengthMeters < 250) return 'long'
  return 'very long sweeper'
}

// Get elevation context
function getElevationContext(elevationChange) {
  if (!elevationChange) return ''
  
  // elevationChange is in meters, positive = uphill, negative = downhill
  if (elevationChange > 10) return 'uphill'
  if (elevationChange > 5) return 'slight uphill'
  if (elevationChange < -10) return 'downhill, watch braking'
  if (elevationChange < -5) return 'slight downhill'
  return ''
}

// Get severity description
function getSeverityDescription(severity) {
  switch(severity) {
    case 1: return 'very gentle'
    case 2: return 'easy'
    case 3: return 'moderate'
    case 4: return 'tight'
    case 5: return 'very tight'
    case 6: return 'extreme'
    default: return ''
  }
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
