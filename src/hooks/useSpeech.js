import { useCallback, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v2
// Enhanced callouts: combined sequences, chicanes, tightening/opening
// ================================

// Speech synthesis setup
let synth = null
let preferredVoice = null

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  synth = window.speechSynthesis
  
  const loadVoices = () => {
    const voices = synth.getVoices()
    // Prefer: Samantha, Daniel, or any English voice
    preferredVoice = voices.find(v => v.name.includes('Samantha')) ||
                     voices.find(v => v.name.includes('Daniel')) ||
                     voices.find(v => v.lang.startsWith('en') && v.localService) ||
                     voices.find(v => v.lang.startsWith('en')) ||
                     voices[0]
  }
  
  loadVoices()
  synth.onvoiceschanged = loadVoices
}

/**
 * Generate callout text for a curve or sequence
 */
export function generateCallout(curve, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  if (!curve) return ''

  const parts = []
  
  // Handle chicanes and S-curves
  if (curve.isChicane) {
    const dirWord = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    
    if (curve.chicaneType === 'CHICANE' && curve.curves?.length === 3) {
      // Triple chicane: "Chicane left 3-4-3"
      parts.push(`Chicane ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    } else {
      // S-curve: "S-left 3-4" 
      parts.push(`S ${dirWord.toLowerCase()} ${curve.severitySequence}`)
    }
  } else {
    // Standard curve callout
    const dirWord = curve.direction === 'LEFT' ? 'Left' : 'Right'
    parts.push(dirWord)
    parts.push(curve.severity.toString())
    
    // Add modifier
    if (curve.modifier) {
      switch (curve.modifier) {
        case 'HAIRPIN':
          parts.push('hairpin')
          break
        case 'SHARP':
          parts.push('sharp')
          break
        case 'LONG':
          parts.push('long')
          break
        case 'TIGHTENS':
          parts.push('tightens')
          break
        case 'OPENS':
          parts.push('opens')
          break
      }
    }
  }
  
  // Add "into" or "then" for close sequences
  if (nextCurve && !curve.isChicane) {
    const distanceToNext = nextCurve.distanceFromStart - (curve.distanceFromStart + curve.length)
    
    if (distanceToNext < 30) {
      // Very close - curves are connected
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`into ${nextDir} ${nextCurve.severity}`)
    } else if (distanceToNext < 100) {
      // Close - quick succession
      const nextDir = nextCurve.direction === 'LEFT' ? 'left' : 'right'
      parts.push(`then ${nextDir} ${nextCurve.severity}`)
    }
  }
  
  return parts.join(' ')
}

/**
 * Generate full callout with distance
 */
export function generateFullCallout(curve, distance, mode = 'cruise', speedUnit = 'mph', nextCurve = null) {
  const callout = generateCallout(curve, mode, speedUnit, nextCurve)
  
  // Round distance to nice numbers
  let distanceText
  if (distance > 400) {
    distanceText = `${Math.round(distance / 100) * 100} meters`
  } else if (distance > 150) {
    distanceText = `${Math.round(distance / 50) * 50} meters`
  } else {
    distanceText = `${Math.round(distance / 25) * 25} meters`
  }
  
  return `In ${distanceText}, ${callout}`
}

/**
 * Hook for speech synthesis
 */
export function useSpeech() {
  const { setSpeaking, settings } = useStore()
  const lastSpokenRef = useRef(null)
  const speakingRef = useRef(false)
  const queueRef = useRef([])
  
  const processQueue = useCallback(() => {
    if (speakingRef.current || queueRef.current.length === 0) return
    
    const { text, priority } = queueRef.current.shift()
    
    if (!synth || !settings.voiceEnabled) return
    
    // Don't repeat the same callout
    if (text === lastSpokenRef.current) {
      processQueue()
      return
    }
    
    // Cancel any ongoing speech for high priority
    if (priority === 'high') {
      synth.cancel()
    }
    
    const utterance = new SpeechSynthesisUtterance(text)
    
    if (preferredVoice) {
      utterance.voice = preferredVoice
    }
    
    utterance.rate = 1.1 // Slightly faster for urgency
    utterance.pitch = 1.0
    utterance.volume = settings.volume || 1.0
    
    utterance.onstart = () => {
      speakingRef.current = true
      setSpeaking(true, text)
    }
    
    utterance.onend = () => {
      speakingRef.current = false
      setSpeaking(false)
      lastSpokenRef.current = text
      // Process next in queue
      setTimeout(processQueue, 100)
    }
    
    utterance.onerror = () => {
      speakingRef.current = false
      setSpeaking(false)
      setTimeout(processQueue, 100)
    }
    
    synth.speak(utterance)
  }, [setSpeaking, settings.voiceEnabled, settings.volume])
  
  const speak = useCallback((text, priority = 'normal') => {
    if (!text || !synth || !settings.voiceEnabled) return
    
    // High priority goes to front of queue
    if (priority === 'high') {
      queueRef.current.unshift({ text, priority })
    } else {
      queueRef.current.push({ text, priority })
    }
    
    processQueue()
  }, [processQueue, settings.voiceEnabled])
  
  const stop = useCallback(() => {
    if (synth) {
      synth.cancel()
      queueRef.current = []
      speakingRef.current = false
      setSpeaking(false)
    }
  }, [setSpeaking])
  
  const isSpeaking = useCallback(() => {
    return speakingRef.current
  }, [])
  
  return { speak, stop, isSpeaking }
}

export default useSpeech
