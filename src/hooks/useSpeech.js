import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v19 - iOS Safari Fix
// Key insight: Use Howler ONLY for the initial unlock
// Then use a plain HTML5 Audio element for playback
// This avoids pool exhaustion issues
// ================================

const ELEVENLABS_VOICE_ID = 'IRHApOXLvnW57QJPQH2P'

// Cache blob URLs — keyed by "profile:text" to separate voice settings
const BLOB_CACHE = new Map()
const getCacheKey = (text, profile = 'default') => `${profile}:${text.toLowerCase().trim()}`

// Voice profiles per speech source type
const VOICE_PROFILES = {
  // Curve callouts: punchy, consistent, slight speed boost
  curve: {
    stability: 0.85,
    similarity_boost: 0.75,
    style: 0.1,
    speed: 1.1,
  },
  // Zone briefings: calm, authoritative, natural pace
  briefing: {
    stability: 0.65,
    similarity_boost: 0.70,
    style: 0.3,
    speed: 1.0,
  },
  // Chatter: expressive, varied, lets the humor land
  chatter: {
    stability: 0.35,
    similarity_boost: 0.65,
    style: 0.6,
    speed: 0.95,
  },
  // Default fallback
  default: {
    stability: 0.65,
    similarity_boost: 0.75,
    style: 0.2,
    speed: 1.0,
  },
}

// ================================
// ROUND 7: Rally 1-6 Scale (integrated into cleanForSpeech)
// Converts degrees to professional rally co-driver pace notes
// Scale: 1 = hairpin (tightest), 6 = barely a bend (flat out)
// ================================

function cleanForSpeech(text) {
  if (!text) return text;

  let cleaned = text;

  // Handle "Technical section" and other non-curve announcements first
  if (/technical section|urban section|urban zone|open road|highway|clear\./i.test(cleaned)) {
    // Replace dashes with periods and ensure proper capitalization after periods
    let result = cleaned.replace(/\s*-\s*/g, '. ')
    // Capitalize first letter after each period
    result = result.replace(/\.\s+([a-z])/g, (match, letter) => `. ${letter.toUpperCase()}`)
    result = result.trim()
    // Ensure ends with period
    if (!result.endsWith('.')) result += '.'
    return result;
  }

  // Check for modifiers BEFORE any processing
  const hasTightens = /tightens/i.test(cleaned);
  const hasOpens = /opens/i.test(cleaned);
  const hasLong = /\blong\b/i.test(cleaned);
  const hasDontCut = /don'?t\s*cut/i.test(cleaned);

  // Strip modifier words from the text before conversion (we'll add them back later)
  cleaned = cleaned.replace(/,?\s*(tightens|opens|long|don'?t\s*cut)/gi, '');

  // ============================================
  // RALLY SCALE CONVERSION — handles all patterns including merged chains
  // FIX 2 ROUND 7: Convert ALL degrees FIRST, before any other processing
  // ============================================

  // Helper: convert a degree value to rally scale 1-6
  const degreesToRally = (deg) => {
    const d = parseFloat(deg)
    if (isNaN(d)) return ''
    if (d >= 180) return 'hairpin'
    if (d >= 120) return '1'
    if (d >= 80) return '2'
    if (d >= 60) return '3'
    if (d >= 40) return '4'
    if (d >= 20) return '5'
    return '6'
  }

  // Step 1: Convert ALL "N°" patterns to rally scale numbers FIRST
  // This handles degrees anywhere in the string, including inside merged chains
  // Patterns: "Left 29°" → "Left 5", "HARD RIGHT 88°" → "HARD RIGHT 2", "max 32°" → "max 5"
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*°/g, (match, degrees) => {
    return degreesToRally(degrees)
  })

  // Step 2: Strip severity prefixes (CAUTION, DANGER, HARD, SHARP, EASY, SLIGHT)
  // Do this AFTER degree conversion so "HARD LEFT 88°" → "HARD LEFT 2" → "left 2"
  cleaned = cleaned.replace(/^CAUTION\s*[-–—]\s*/i, '')
  cleaned = cleaned.replace(/^DANGER\s*[-–—]\s*/i, '')
  cleaned = cleaned.replace(/\bCAUTION\s*[-–—]?\s*/gi, '')
  cleaned = cleaned.replace(/\bHARD\s+/gi, '')
  cleaned = cleaned.replace(/\bSHARP\s+/gi, '')
  cleaned = cleaned.replace(/\bEASY\s+/gi, '')
  cleaned = cleaned.replace(/\bSLIGHT\s+/gi, '')

  // Step 3: Handle "max N" in esses/sequence callouts
  // After degree conversion, "max 32°" became "max 5" which is meaningful
  // Convert to "tightest N" for clarity
  cleaned = cleaned.replace(/\bmax\s+(\d)\b/gi, (match, num) => {
    return `tightest ${num}`
  })

  // Step 4: Handle HAIRPIN - normalize to lowercase
  // "HAIRPIN LEFT" → "hairpin left", "Right into HAIRPIN LEFT" → "right into hairpin left"
  cleaned = cleaned.replace(/\bHAIRPIN\b/gi, 'hairpin')

  // Step 5: Normalize case — lowercase everything first
  cleaned = cleaned.toLowerCase()

  // Step 6: Handle merged chain formatting
  // Split on commas, clean up each segment, rejoin with "into" connectors where appropriate
  const segments = cleaned.split(/,\s*/).map(s => s.trim()).filter(Boolean)

  // Track if this is a compound callout (for flat out logic)
  let hasCompound = segments.length >= 2

  if (segments.length >= 2) {
    // Pattern to detect curve callouts (with or without numbers)
    const curvePattern = /(?:hairpin\s+)?(?:left|right)(?:\s+\d)?/i
    const isCurveSegment = (s) => curvePattern.test(s)

    // Rebuild with proper connectors
    let result = segments[0]
    for (let k = 1; k < segments.length; k++) {
      const seg = segments[k]
      const prevIsCurve = isCurveSegment(segments[k - 1])
      const thisIsCurve = isCurveSegment(seg)

      if (prevIsCurve && thisIsCurve && !seg.startsWith('into ')) {
        // Two consecutive curve segments — connect with "into"
        result += ', into ' + seg
      } else {
        // Non-curve segment or already has connector — just comma
        result += ', ' + seg
      }
    }
    cleaned = result
  }

  // Also check for existing "into" patterns
  if (/\binto\b/i.test(cleaned)) {
    hasCompound = true
  }

  // Step 7: Clean up any double spaces, trailing/leading whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  // Step 8: Remove any leftover degree symbols that slipped through
  cleaned = cleaned.replace(/°/g, '')

  // Step 9: Build modifiers list and add to end
  let modifiers = [];
  if (hasTightens) modifiers.push('tightens');
  if (hasOpens) modifiers.push('opens');
  if (hasLong) modifiers.push('long');
  if (hasDontCut) modifiers.push("don't cut");

  if (modifiers.length > 0) {
    cleaned = cleaned + ', ' + modifiers.join(', ');
  }

  // Step 10: Add "flat out" for severity 6 curves (if not already modified and not compound)
  if (/\b6\b/.test(cleaned) && modifiers.length === 0 && !hasCompound) {
    cleaned = cleaned + ', flat out';
  }

  // Step 11: Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

// ================================
// UNIT TEST for cleanForSpeech
// Run in console: window.testCleanForSpeech()
// ROUND 7: Updated for merged chain handling and max N° pattern
// ================================
function testCleanForSpeech() {
  const tests = [
    // Basic severity conversions - Rally 1-6 scale
    { input: 'CAUTION - Hard left 180°', expected: 'Hairpin left' },
    { input: 'CAUTION - Hard left 120°', expected: 'Left 1' },
    { input: 'CAUTION - Hard right 103°', expected: 'Right 2' },
    { input: 'CAUTION - Left 88°', expected: 'Left 2' },
    { input: 'CAUTION - Left 87°', expected: 'Left 2' },
    { input: 'CAUTION - Right 67°', expected: 'Right 3' },
    { input: 'CAUTION - Right 57°', expected: 'Right 4' },
    { input: 'CAUTION - Left 65°', expected: 'Left 3' },
    { input: 'CAUTION - Left 59°', expected: 'Left 4' },
    { input: 'Left 30°', expected: 'Left 5' },
    { input: 'Right 31°', expected: 'Right 5' },
    { input: 'Right 27°', expected: 'Right 5' },
    { input: 'Right 25°', expected: 'Right 5' },
    { input: 'Left 12°', expected: 'Left 6, flat out' },
    { input: 'Left 13°', expected: 'Left 6, flat out' },
    { input: 'Right 34°', expected: 'Right 5' },
    { input: 'Left 27°', expected: 'Left 5' },

    // Compound callouts - "into" notation
    { input: 'Left 32°, Right 31°', expected: 'Left 5, into right 5' },
    { input: 'HARD LEFT 108° into HARD RIGHT 82°', expected: 'Left 2 into right 2' },

    // FIX 2 ROUND 7: Merged chain callouts with multiple degrees
    { input: 'Left 29°, Right into HAIRPIN LEFT, CAUTION - Right 63°', expected: 'Left 5, into right into hairpin left, into right 3' },
    { input: 'Right into HARD LEFT 88°', expected: 'Right into left 2' },
    { input: 'Left 15°, Esses, 3 curves, max 32°', expected: 'Left 6, esses, 3 curves, tightest 5' },
    { input: 'HARD RIGHT 45° into HARD LEFT 64°', expected: 'Right 4 into left 3' },

    // Special patterns
    { input: 'Right into HAIRPIN LEFT', expected: 'Right into hairpin left' },
    { input: 'Technical section ahead - stay sharp', expected: 'Technical section ahead. Stay sharp.' },

    // With modifiers (if they appear in original text)
    { input: 'CAUTION - Right 67°, tightens', expected: 'Right 3, tightens' },
    { input: 'CAUTION - Left 59°, opens', expected: 'Left 4, opens' },
    { input: 'CAUTION - Right 72°, long', expected: 'Right 3, long' },
  ];

  let passed = 0;
  let failed = 0;

  console.log('\n🧪 TESTING cleanForSpeech() - Rally 1-6 Scale + Merged Chains\n');

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

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
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

  // ROUND 5 CHANGE 5: Track currently playing audio for priority-based interruption
  const currentlyPlayingRef = useRef(null) // { text, priority }

  // FIX 3 ROUND 6: Priority tracking for speech interrupts
  const currentPriorityRef = useRef(-1)  // -1 = nothing playing

  const PRIORITY_VALUES = {
    'low': 0,      // chatter
    'normal': 1,   // zone announcements
    'high': 2      // curve callouts
  }

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

      // FIX 3 ROUND 6: Reset priority when playback ends
      utterance.onend = () => {
        isPlayingRef.current = false
        currentPriorityRef.current = -1
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
      }

      utterance.onerror = () => {
        isPlayingRef.current = false
        currentPriorityRef.current = -1
        currentlyPlayingRef.current = null
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
  const speakElevenLabs = useCallback(async (text, options = {}) => {
    const profileName = options?.voiceProfile || 'default'
    const profile = VOICE_PROFILES[profileName] || VOICE_PROFILES.default
    const cacheKey = getCacheKey(text, profileName)

    // Get blob URL from cache or fetch new
    let audioUrl = BLOB_CACHE.get(cacheKey)

    if (!audioUrl) {
      if (!navigator.onLine) {
        console.log('🔊 Offline')
        return false
      }

      try {
        console.log(`🔊 Fetching [${profileName}]: "${text}"`)

        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: ELEVENLABS_VOICE_ID,
            voiceSettings: {
              stability: profile.stability,
              similarity_boost: profile.similarity_boost,
              style: profile.style,
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
        currentPriorityRef.current = -1
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
        globalAudioElement.removeEventListener('ended', onEnded)
        globalAudioElement.removeEventListener('error', onError)
      }
      const onError = (e) => {
        console.log('🔊 Playback error:', e)
        isPlayingRef.current = false
        currentPriorityRef.current = -1
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
        globalAudioElement.removeEventListener('ended', onEnded)
        globalAudioElement.removeEventListener('error', onError)
      }

      globalAudioElement.addEventListener('ended', onEnded)
      globalAudioElement.addEventListener('error', onError)

      // Set source, volume, and playback speed from profile
      globalAudioElement.src = audioUrl
      globalAudioElement.volume = settings.volume || 1.0
      globalAudioElement.playbackRate = profile.speed || 1.0

      isPlayingRef.current = true
      setSpeaking(true, text)

      await globalAudioElement.play()
      console.log(`🔊 Playing [${profileName}]: "${text}"`)
      return true
    } catch (err) {
      console.log('🔊 Play error:', err?.message)
      isPlayingRef.current = false
      currentPriorityRef.current = -1
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, settings.volume])

  // ================================
  // MAIN SPEAK FUNCTION
  // ROUND 5 CHANGE 5: Priority-based interruption
  // Higher priority can interrupt lower priority, same priority can interrupt same
  // low < normal < high
  // ================================
  const speak = useCallback(async (text, priority = 'normal', options = {}) => {
    if (!settings.voiceEnabled || !text) {
      return false
    }

    const now = Date.now()

    // Prevent duplicates (same text within 1.5s)
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
      return false
    }

    const priorityValue = PRIORITY_VALUES[priority] ?? 1

    // FIX 3 ROUND 6: SPEECH INTERRUPT LOGIC
    if (isPlayingRef.current) {
      if (priorityValue >= currentPriorityRef.current) {
        // New callout is equal or higher priority — interrupt current playback
        console.log(`⏹️ INTERRUPTED: playing="${lastSpokenRef.current}" (pri=${currentPriorityRef.current}) → new="${text}" (pri=${priorityValue})`)
        if (globalAudioElement) {
          globalAudioElement.pause()
          globalAudioElement.currentTime = 0
        }
        synthRef.current?.cancel()
        isPlayingRef.current = false
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
      } else {
        // New callout is lower priority — skip it entirely
        console.log(`⏭️ SKIPPED (low pri): "${text}" (pri=${priorityValue}), playing="${lastSpokenRef.current}" (pri=${currentPriorityRef.current})`)
        return false
      }
    }

    // Set current priority
    currentPriorityRef.current = priorityValue

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Track what's playing
    currentlyPlayingRef.current = { text, priority }

    // Clean text for natural TTS pronunciation
    // "CAUTION - Right 67°" → "Right 3"
    const spokenText = cleanForSpeech(text)
    console.log(`🔊 Speaking: "${spokenText}" (original: "${text}", ${priority})`)

    // Try ElevenLabs first (pass voice profile options)
    const success = await speakElevenLabs(spokenText, options)
    if (success) return true

    // Fall back to native
    console.log('🔊 Falling back to native')
    return speakNative(spokenText)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  const stop = useCallback(() => {
    globalAudioElement?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    currentPriorityRef.current = -1  // FIX 3 ROUND 6
    currentlyPlayingRef.current = null
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
// ROUND 5: Updated for rally 1-6 scale callouts
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    // Rally scale callouts
    'Left 1', 'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 1', 'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Hairpin left', 'Hairpin right',
    'Left 6, flat out', 'Right 6, flat out',
    // Zone announcements
    'Technical section. Stay sharp.', 'Open road.', 'Urban section.',
    'Clear. Open road.'
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  for (const text of essentialCallouts) {
    try {
      // Preload with curve profile (most common callout type)
      const profile = VOICE_PROFILES.curve
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: ELEVENLABS_VOICE_ID,
          voiceSettings: {
            stability: profile.stability,
            similarity_boost: profile.similarity_boost,
            style: profile.style,
            use_speaker_boost: true
          }
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 500) {
          BLOB_CACHE.set(getCacheKey(text, 'curve'), URL.createObjectURL(blob))
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
