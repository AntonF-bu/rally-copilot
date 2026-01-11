import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v2 - Technical Sections
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
      setTimeout(loadVoices, 100)
      setTimeout(loadVoices, 500)
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

  const speakNative = useCallback((text) => {
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

  const speakElevenLabs = useCallback(async (text) => {
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

  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    const now = Date.now()
    
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 2000) {
      return false
    }

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

    const success = await speakElevenLabs(text)
    if (success) return true
    
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const initAudio = useCallback(async () => {
    try {
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

  return { speak, stop, isSpeaking, initAudio, preloadRouteAudio }
}

// Preload for offline
async function preloadRouteAudio(curves) {
  if (!curves?.length || !navigator.onLine) {
    return { success: true, cached: 0, total: 0 }
  }

  const callouts = new Set()
  curves.forEach(curve => {
    if (curve.isTechnicalSection) {
      callouts.add(`Technical section ahead`)
      callouts.add(`${curve.sectionCharacter} section, ${curve.curveCount} curves`)
    } else if (curve.isChicane) {
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

/**
 * Generate callout for a curve, chicane, or technical section
 */
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null, phase = 'main', options = {}) {
  if (!curve) return ''

  // Handle technical sections
  if (curve.isTechnicalSection) {
    return generateTechnicalSectionCallout(curve, mode, speedUnit, phase)
  }

  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 24, 6: 18 }
    const mult = { cruise: 0.92, fast: 1.0, race: 1.15 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 0.92))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }

  // FIXED: Always use startDirection for chicanes, direction for regular curves
  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'left' : 'right')
    : (curve.direction === 'LEFT' ? 'left' : 'right')
  const Dir = dir.charAt(0).toUpperCase() + dir.slice(1)
  
  const speed = curve.isChicane 
    ? getSpeed(Math.max(...(curve.severitySequence?.split('-').map(Number) || [curve.severity])))
    : getSpeed(curve.severity)
  
  const isHard = curve.severity >= 4
  const isVeryHard = curve.severity >= 5
  const isGentle = curve.severity <= 2
  
  const distText = getDistanceText(curve.distance, speedUnit)
  
  // Calculate gap to next curve - use relative distances if available, fall back to absolute
  let gapToNext = 999
  if (nextCurve) {
    // If we have relative distances (from upcoming curves), use the difference
    if (nextCurve.distance !== undefined && curve.distance !== undefined) {
      gapToNext = nextCurve.distance - curve.distance
    } else if (nextCurve.distanceFromStart !== undefined && curve.distanceFromStart !== undefined) {
      // Fall back to absolute distances
      gapToNext = (nextCurve.distanceFromStart || 0) - ((curve.distanceFromStart || 0) + (curve.length || 0))
    }
  }
  const hasTimeForDetail = gapToNext > 150
  
  const curveCharacter = getCurveCharacter(curve)
  
  // PHASE: EARLY WARNING
  if (phase === 'early') {
    if (curve.isChicane) {
      return `Chicane ahead starting ${dir}. Severity ${curve.severitySequence}. Prepare for ${speed}.`
    }
    if (isVeryHard) {
      return `Caution ahead. ${curveCharacter} ${dir} ${curve.severity} in ${distText}. Prepare to slow to ${speed}.`
    }
    if (isHard) {
      return `${curveCharacter} ${dir} ${curve.severity} coming in ${distText}. Target ${speed}.`
    }
    return `${curveCharacter} ${dir} ${curve.severity} ahead in ${distText}.`
  }
  
  // PHASE: FINAL WARNING
  if (phase === 'final') {
    if (curve.isChicane) {
      return `Chicane now! ${Dir} first, ${speed}!`
    }
    if (isVeryHard) {
      return `${Dir} ${curve.severity} now! ${speed}!`
    }
    return `${Dir} ${curve.severity} now.`
  }
  
  // PHASE: MAIN CALLOUT
  const sentences = []
  
  if (curve.isChicane) {
    sentences.push(`In ${distText}, chicane starting ${dir}.`)
    sentences.push(`Severity ${curve.severitySequence}, take at ${speed}.`)
    
  } else {
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
    
    if (hasTimeForDetail) {
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
      
      if (curve.length > 150) {
        const lengthText = speedUnit === 'kmh' 
          ? `${Math.round(curve.length)} meters long`
          : `${Math.round(curve.length * 3.28084 / 50) * 50} feet long`
        sentences.push(lengthText + '.')
      }
    }
  }
  
  // Next curve preview
  if (nextCurve && !curve.isChicane && !nextCurve.isTechnicalSection) {
    const nextDir = nextCurve.isChicane 
      ? (nextCurve.startDirection === 'LEFT' ? 'left' : 'right')
      : (nextCurve.direction === 'LEFT' ? 'left' : 'right')
    const nextSpeed = getSpeed(nextCurve.severity)
    const nextCharacter = getCurveCharacter(nextCurve)
    
    if (gapToNext < 50) {
      if (nextCurve.isChicane) {
        sentences.push(`Immediately into chicane ${nextDir}.`)
      } else {
        sentences.push(`Immediately into ${nextDir} ${nextCurve.severity}.`)
      }
    } else if (gapToNext < 150) {
      if (nextCurve.isChicane) {
        sentences.push(`Then chicane ${nextDir} at ${nextSpeed}.`)
      } else {
        sentences.push(`Then ${nextDir} ${nextCurve.severity} at ${nextSpeed}.`)
      }
    } else if (gapToNext < 300 && hasTimeForDetail) {
      sentences.push(`${nextCharacter} ${nextDir} ${nextCurve.severity} follows.`)
    }
  }
  
  return sentences.join(' ')
}

/**
 * Generate callout for technical section (sustained windy stretch)
 */
function generateTechnicalSectionCallout(section, mode, speedUnit, phase) {
  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 24, 6: 18 }
    const mult = { cruise: 0.92, fast: 1.0, race: 1.15 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 0.92))
    if (speedUnit === 'kmh') speed = Math.round(speed * 1.609)
    return speed
  }
  
  const dir = section.direction === 'LEFT' ? 'left' : 'right'
  const speed = getSpeed(section.severity)
  const distText = getDistanceText(section.distance, speedUnit)
  const lengthText = getLengthText(section.length, speedUnit)
  
  // Character descriptions
  const characterDesc = {
    'switchbacks': 'switchback section',
    'sweeping': 'sweeping curves',
    'technical': 'technical section',
    'windy': 'windy stretch'
  }
  const character = characterDesc[section.sectionCharacter] || 'windy section'
  
  if (phase === 'early') {
    return `${character} ahead. ${section.curveCount} curves over ${lengthText}. Max severity ${section.severity}. Hold ${speed}.`
  }
  
  if (phase === 'final') {
    return `${character} now! Starting ${dir}. Hold ${speed}.`
  }
  
  // Main callout - comprehensive summary
  const sentences = []
  
  sentences.push(`In ${distText}, ${character}.`)
  sentences.push(`${section.curveCount} curves over ${lengthText}, starting ${dir}.`)
  sentences.push(`Max severity ${section.severity}. Maintain ${speed} through.`)
  
  // Add direction sequence hint for complex sections
  if (section.directionChanges >= 3) {
    const seqHint = section.directionSequence.slice(0, 5) // First 5 directions
    const readable = seqHint.split('').map(d => d === 'L' ? 'left' : 'right').join(', ')
    sentences.push(`Pattern: ${readable}.`)
  }
  
  return sentences.join(' ')
}

/**
 * Generate abbreviated callout for curves WITHIN a technical section
 * Used after the initial section announcement
 */
export function generateInSectionCallout(curve, mode, speedUnit) {
  const dir = curve.direction === 'LEFT' ? 'left' : 'right'
  const Dir = dir.charAt(0).toUpperCase() + dir.slice(1)
  
  // Very short callouts within section
  if (curve.severity >= 5) {
    return `${Dir} ${curve.severity}!`
  }
  return `${Dir} ${curve.severity}`
}

// Get curve character description
function getCurveCharacter(curve) {
  if (!curve) return ''
  if (curve.isChicane) return 'chicane'
  if (curve.isTechnicalSection) return curve.sectionCharacter || 'technical'
  
  const severity = curve.severity
  const length = curve.length || 0
  
  if (severity <= 2 && length > 150) return 'sweeping'
  if (severity <= 1) return 'gentle'
  if (severity === 2) return 'easy'
  if (severity === 3) return 'moderate'
  if (severity === 4) return 'tight'
  if (severity === 5) return 'sharp'
  return 'very sharp'
}

// Convert distance to natural speech
function getDistanceText(distanceMeters, speedUnit = 'mph') {
  if (!distanceMeters || distanceMeters < 0) return 'ahead'
  
  if (speedUnit === 'kmh') {
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
    const feet = distanceMeters * 3.28084
    if (feet >= 2640) {
      const miles = Math.round(feet / 528) / 10
      return `${miles} miles`
    } else if (feet >= 800) {
      // Round to nearest 100 feet for clarity
      return `${Math.round(feet / 100) * 100} feet`
    } else if (feet >= 300) {
      // Use simpler terms for closer distances
      return `${Math.round(feet / 100) * 100} feet`
    } else if (feet >= 150) {
      return `200 feet`
    }
    // Very close - don't give specific distance
    return `ahead`
  }
}

// Convert length to natural speech (for section lengths)
function getLengthText(lengthMeters, speedUnit = 'mph') {
  if (speedUnit === 'kmh') {
    if (lengthMeters >= 1000) {
      const km = Math.round(lengthMeters / 100) / 10
      return `${km} km`
    }
    return `${Math.round(lengthMeters / 50) * 50} meters`
  } else {
    const feet = lengthMeters * 3.28084
    if (feet >= 2640) {
      const miles = Math.round(feet / 528) / 10
      return `${miles} miles`
    } else if (feet >= 1320) {
      return 'quarter mile'
    }
    return `${Math.round(feet / 100) * 100} feet`
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

// Generate straight section callout
export function generateStraightCallout(distanceMeters, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const distText = getDistanceText(distanceMeters, speedUnit)
  
  if (nextCurve) {
    const nextDir = nextCurve.isChicane 
      ? (nextCurve.startDirection === 'LEFT' ? 'left' : 'right')
      : (nextCurve.direction === 'LEFT' ? 'left' : 'right')
    
    if (nextCurve.isTechnicalSection) {
      return `Clear. ${nextCurve.sectionCharacter} section in ${distText}.`
    }
    return `Clear. ${nextDir} ${nextCurve.severity} in ${distText}.`
  }
  return `Clear for ${distText}.`
}

// Generate post-curve callout
export function generatePostCurveCallout(straightDistance, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  return generateStraightCallout(straightDistance, mode, speedUnit, nextCurve)
}

export function generateShortCallout(curve, mode = 'cruise') {
  if (!curve) return ''
  const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 24, 6: 18 }
  const mult = { cruise: 0.92, fast: 1.0, race: 1.15 }
  const speed = Math.round((speeds[curve.severity] || 40) * (mult[mode] || 0.92))
  
  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  return `${dir} ${curve.severity}, ${speed}`
}

export default useSpeech
