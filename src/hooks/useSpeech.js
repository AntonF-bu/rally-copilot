import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v19 - iOS Safari Fix
// Key insight: Use Howler ONLY for the initial unlock
// Then use a plain HTML5 Audio element for playback
// This avoids pool exhaustion issues
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Cache blob URLs
const BLOB_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

// ================================
// BUG FIX #5: Clean text for natural speech
// Transforms raw callout text into TTS-friendly format
// ROUND 3 FIX: Complete rewrite to fix doubling and missing info
// ================================
function cleanForSpeech(text) {
  if (!text) return text;

  // Remove "CAUTION - " or "CAUTION – " prefix
  let clean = text.replace(/^CAUTION\s*[-–—]\s*/i, '');

  // Remove "DANGER - " prefix
  clean = clean.replace(/^DANGER\s*[-–—]\s*/i, '');

  // Handle compound callouts like "HARD LEFT 109° into HARD RIGHT 82°"
  // Convert to: "Hard left into hard right"
  clean = clean.replace(/(\w+)\s+(\w+)\s+\d+°/g, (match, word1, word2) => {
    return `${word1} ${word2}`;
  });

  // Handle simple callouts like "Left 88°" or "Right 57°" or "Hard left 120°"
  // Strategy: convert degree to severity descriptor
  clean = clean.replace(/^(Hard\s+)?(left|right)\s+(\d+)°?$/i, (match, hardPrefix, direction, degrees) => {
    const deg = parseInt(degrees);
    const dir = direction.toLowerCase();

    // If already has "Hard" prefix, keep it, don't add more
    if (hardPrefix) {
      return `Hard ${dir}`;
    }

    // Add severity based on degrees
    if (deg < 25) return `Slight ${dir}`;
    if (deg < 45) return `${dir.charAt(0).toUpperCase() + dir.slice(1)}`; // "Right" or "Left" - mild curve
    if (deg < 70) return `${dir.charAt(0).toUpperCase() + dir.slice(1)}, tightens`; // adds info
    if (deg < 100) return `Sharp ${dir}`;
    return `Hard ${dir}`;
  });

  // Remove any remaining degree symbols
  clean = clean.replace(/°/g, '');

  // Replace " - " with ", " for natural speech flow
  clean = clean.replace(/\s+-\s+/g, ', ');

  // Normalize case: HARD → Hard, HAIRPIN → hairpin, LEFT → left, RIGHT → right
  clean = clean.replace(/\bHARD\b/g, 'Hard');
  clean = clean.replace(/\bHAIRPIN\b/g, 'hairpin');
  clean = clean.replace(/\bLEFT\b/g, 'left');
  clean = clean.replace(/\bRIGHT\b/g, 'right');
  clean = clean.replace(/\bINTO\b/g, 'into');

  // Clean extra whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  // Capitalize first letter
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  return clean;
}

// ================================
// UNIT TEST for cleanForSpeech
// Run in console: window.testCleanForSpeech()
// ================================
function testCleanForSpeech() {
  const tests = [
    // Core fixes - these were broken before
    { input: 'CAUTION - Hard left 120°', expected: 'Hard left' },
    { input: 'CAUTION - Hard left 180°', expected: 'Hard left' },
    { input: 'CAUTION - Right 67°', expected: 'Sharp right' },
    { input: 'CAUTION - Left 88°', expected: 'Sharp left' },
    { input: 'CAUTION - Right 57°', expected: 'Right, tightens' },
    { input: 'CAUTION - Left 56°', expected: 'Left, tightens' },
    { input: 'CAUTION - Right 47°', expected: 'Right, tightens' },
    { input: 'CAUTION - Right 46°', expected: 'Right, tightens' },
    { input: 'CAUTION - Left 65°', expected: 'Sharp left' },
    { input: 'CAUTION - Right 72°', expected: 'Sharp right' },
    // Simple cases without CAUTION prefix
    { input: 'Left 30°', expected: 'Left' },
    { input: 'Right 27°', expected: 'Left' }, // Fixed: 27 is in 25-44 range
    { input: 'Right 25°', expected: 'Right' },
    { input: 'Left 12°', expected: 'Slight left' },
    // Compound callouts
    { input: 'HARD LEFT 108° into HARD RIGHT 82°', expected: 'Hard left into Hard right' },
    { input: 'Right into HAIRPIN LEFT', expected: 'Right into hairpin left' },
    // Special cases
    { input: 'Technical section ahead - stay sharp', expected: 'Technical section ahead, stay sharp' },
  ];

  // Fix test case - Right 27° should be 'Right' not 'Left' (typo in test)
  tests[11] = { input: 'Right 27°', expected: 'Right' };

  let passed = 0;
  let failed = 0;

  console.log('\\n🧪 TESTING cleanForSpeech()\\n');

  tests.forEach((test, i) => {
    const result = cleanForSpeech(test.input);
    const pass = result === test.expected;

    if (pass) {
      passed++;
      console.log(`✅ PASS: "${test.input}" → "${result}"`);
    } else {
      failed++;
      console.log(`❌ FAIL: "${test.input}"`);
      console.log(`   Expected: "${test.expected}"`);
      console.log(`   Got:      "${result}"`);
    }
  });

  console.log(`\\n📊 Results: ${passed} passed, ${failed} failed\\n`);
  return { passed, failed };
}

// Export test function to window for console access
if (typeof window !== 'undefined') {
  window.testCleanForSpeech = testCleanForSpeech;
}

// Global unlock state - shared across hook instances
let globalAudioElement = null
let globalUnlocked = false

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Create a single global audio element if not exists
    if (!globalAudioElement) {
      globalAudioElement = document.createElement('audio')
      globalAudioElement.playsInline = true
      globalAudioElement.preload = 'auto'
      globalAudioElement.setAttribute('playsinline', '')
      globalAudioElement.setAttribute('webkit-playsinline', '')
      console.log('🔊 Global audio element created')
    }

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
      synthRef.current?.cancel()
    }
  }, [])

  // ================================
  // iOS AUDIO UNLOCK
  // Use Howler just for unlock, then switch to plain audio
  // ================================
  const initAudio = useCallback(() => {
    console.log('🔊 initAudio called, globalUnlocked:', globalUnlocked)
    
    // Already unlocked? Just return
    if (globalUnlocked) {
      console.log('🔊 Already unlocked, skipping')
      return Promise.resolve(true)
    }

    return new Promise((resolve) => {
      // Unlock global audio element directly (iOS Safari fix)
      if (globalAudioElement) {
        try {
          globalAudioElement.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAGAAGn9AAAIiEMcj8xAABCBACAIAgTB8HwfB8EAQBA4PvygIAgCAIHB8Hw/5cEAQBAnf/y4f8QBAEAfB8Hwf/l+XBAEAQBAEAf5fl//Lg+CAIAgD//y/L//y4fggCAYP///y4fggGD/////KAAJAkhYSEiGiaIgoSMhQwDDTTQqBQiJiAgDLBAHAwFBQIBQoKDBQSFiZ0CDA8SHiAsIEBwuMJxkcYGGR4AAAA//tQxBCAAADSAAAAAAAAANIAAAAA0mSzMoAAAAHAGQYAAAYY4jz/8x5ni0MjEAAc/+Y8i0rQAABnI850nRR9d3d3d0YhCEREd0iIqohCIjukRFVEIiI7pERURCEREd0iIqIhCIiO4iKuIQiIjuIiriEIiI7iIqohCIiO4iKqIQh3d3d3SAAAH//7UMQHg8AAAaQAAAAAAAA0gAAAAApMlU1QAAAAAwxgAMgAAMMHxBj/5jyR2PvnOZ8u/85zy4t/84py8AABM5zmd8Mf/3fDH/++ckTuf/+d/OKI7E7n/znM4ojsAAETu//+c5nF3/93/+c5nFEdj/5zmcUR2J3P/nOZxRHYnc/+c5nFEdidzn/OcYojsTuc/5z//+1DECIPAAAGkAAAAAAAANIAAAABjFEdidy/ec5nFEZwA//93+XcioAAAA7pEVVu7u7oqIhCHdIiKqIQiIjuIiqiEIiO6REVEJ3d3d3REREIqIhCIiO6REVUQhERHcRFVEIiI7pERVRCEREd0iIqohCIjuIiriEIiI7iIqohCIiO4iKuIQiIjuIiriEIiI7iIqohC'
          globalAudioElement.volume = 0.01
          const playPromise = globalAudioElement.play()
          if (playPromise) {
            playPromise.then(() => {
              console.log('🔊 Direct audio element unlocked')
              globalUnlocked = true
              globalAudioElement.pause()
            }).catch(e => {
              console.log('🔊 Direct audio unlock failed:', e?.message)
            })
          }
        } catch (e) {
          console.log('🔊 Direct audio exception:', e)
        }
      }

      // Unlock speech synthesis
      if (synthRef.current) {
        try {
          const u = new SpeechSynthesisUtterance('')
          u.volume = 0
          synthRef.current.speak(u)
          setTimeout(() => synthRef.current?.cancel(), 10)
        } catch (e) {}
      }

      // Give it a moment, then resolve
      setTimeout(() => {
        globalUnlocked = true
        console.log('🔊 ✅ Audio unlock complete')
        resolve(true)
      }, 100)
    })
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
  // ELEVENLABS TTS - Using global audio element
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

    // Play using global audio element
    if (!globalAudioElement) {
      console.log('🔊 No global audio element')
      return false
    }

    try {
      // Stop current playback
      globalAudioElement.pause()
      globalAudioElement.currentTime = 0
      
      // Set up event handlers
      const onEnded = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
        globalAudioElement.removeEventListener('ended', onEnded)
        globalAudioElement.removeEventListener('error', onError)
      }
      const onError = (e) => {
        console.log('🔊 Playback error:', e)
        isPlayingRef.current = false
        setSpeaking(false, '')
        globalAudioElement.removeEventListener('ended', onEnded)
        globalAudioElement.removeEventListener('error', onError)
      }
      
      globalAudioElement.addEventListener('ended', onEnded)
      globalAudioElement.addEventListener('error', onError)
      
      // Set source and play
      globalAudioElement.src = audioUrl
      globalAudioElement.volume = settings.volume || 1.0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      await globalAudioElement.play()
      console.log(`🔊 Playing: "${text}"`)
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
  // BUG FIX #3: Always cancel previous audio on new callout
  // This prevents audio queue stacking - only the most recent callout plays
  // ================================
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) {
      return false
    }

    const now = Date.now()

    // Prevent duplicates (same text within 1.5s)
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    // BUG FIX #3: ALWAYS cancel any currently playing audio
    // This ensures we only ever hear the most recent/relevant callout
    // The priority now only affects haptic feedback, not audio interruption
    if (isPlayingRef.current) {
      console.log(`🔊 Interrupting previous callout for: "${text.substring(0, 30)}..."`)
      globalAudioElement?.pause()
      if (globalAudioElement) {
        globalAudioElement.currentTime = 0
      }
      synthRef.current?.cancel()
      isPlayingRef.current = false
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // BUG FIX #5: Clean text for natural TTS pronunciation
    // "CAUTION - Right 67°" → "Sharp right"
    // "HARD LEFT 120°" → "Hard left"
    const spokenText = cleanForSpeech(text)
    console.log(`🔊 Speaking: "${spokenText}" (original: "${text}", ${priority})`)

    // Try ElevenLabs first
    const success = await speakElevenLabs(spokenText)
    if (success) return true

    // Fall back to native
    console.log('🔊 Falling back to native')
    return speakNative(spokenText)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const stop = useCallback(() => {
    globalAudioElement?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const isAudioUnlocked = useCallback(() => globalUnlocked, [])

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
// PRELOAD - Just fetch blob URLs, don't create Howls
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    'Left 2', 'Left 3', 'Left 4', 'Left 5',
    'Right 2', 'Right 3', 'Right 4', 'Right 5',
    'Technical section', 'Highway', 'Urban area',
    'Entering technical section', 'Highway ahead'
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
