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
// ROUND 5: Rally 1-6 Scale
// Converts degrees to professional rally co-driver pace notes
// Scale: 1 = hairpin (tightest), 6 = barely a bend (flat out)
// ================================

function degreesToRallyScale(deg) {
  // Based on test case mappings:
  // 180° → Hairpin (special), 120° → 1, 108° → 2, 88° → 2, 72° → 3, 67° → 3, 59° → 4, 57° → 4, 30° → 5, 12° → 6
  if (deg >= 120) return 1;  // Tight corner (120°+) - scale 1
  if (deg >= 80)  return 2;  // Hard, needs heavy braking (80-119°)
  if (deg >= 60)  return 3;  // Moderate, lift and brake (60-79°)
  if (deg >= 40)  return 4;  // Easy curve, slight lift (40-59°)
  if (deg >= 20)  return 5;  // Gentle, maintain speed (20-39°)
  return 6;                   // Barely a bend, flat out (<20°)
}

function cleanForSpeech(text) {
  if (!text) return text;

  // Remove "CAUTION - " prefix
  let clean = text.replace(/^CAUTION\s*[-–—]\s*/i, '');

  // Remove "DANGER - " prefix
  clean = clean.replace(/^DANGER\s*[-–—]\s*/i, '');

  // Check for modifiers BEFORE stripping degrees
  const hasTightens = /tightens/i.test(clean);
  const hasOpens = /opens/i.test(clean);
  const hasLong = /\blong\b/i.test(clean);
  const hasDontCut = /don'?t\s*cut/i.test(clean);

  // Handle "Technical section" and other non-curve announcements
  if (/technical section|urban section|open road|highway|clear\./i.test(clean)) {
    // Replace dashes with periods and ensure proper capitalization after periods
    let result = clean.replace(/\s*-\s*/g, '. ')
    // Capitalize first letter after each period
    result = result.replace(/\.\s+([a-z])/g, (match, letter) => `. ${letter.toUpperCase()}`)
    result = result.trim()
    // Ensure ends with period
    if (!result.endsWith('.')) result += '.'
    return result;
  }

  // Handle HAIRPIN specially - keep the word
  if (/hairpin/i.test(clean)) {
    // "Right into HAIRPIN LEFT" → "Right into hairpin left"
    // "HAIRPIN LEFT" → "Hairpin left"
    clean = clean.toLowerCase();
    clean = clean.replace(/\s*\d+°?\s*/g, ' '); // strip any degrees
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  // Track if we have compound patterns (for "into" insertion)
  let hasCompound = false;

  // Strip modifier words from the text before conversion (we'll add them back later)
  clean = clean.replace(/,?\s*(tightens|opens|long|don'?t\s*cut)/gi, '');

  // Convert each "Direction Degrees°" to rally scale
  // Match patterns like "Hard left 120°", "Left 74°", "Right 31°"
  clean = clean.replace(/(Hard\s+)?(left|right)\s+(\d+)°?/gi, (match, hardPrefix, direction, degrees) => {
    const deg = parseInt(degrees);
    const dir = direction.toLowerCase();
    const scale = degreesToRallyScale(deg);

    // Only say "Hairpin" for 180°+ turns (true hairpins)
    if (deg >= 180) return `hairpin ${dir}`;
    // Scale 1 (120-179°) uses numeric form
    if (scale === 1) return `${dir} 1`;
    if (scale === 6) return `${dir} 6`;  // modifier added later
    return `${dir} ${scale}`;
  });

  // Convert comma-separated curves to "into" notation
  // "left 5, right 5" → "left 5 into right 5"
  // Also handles "left 5, left 3" etc
  clean = clean.replace(/(\d)(,?\s+)(left|right)/gi, (match, num, sep, dir) => {
    hasCompound = true;
    return `${num} into ${dir}`;
  });

  // Also handle "direction into direction" that's already there (e.g., "right into hairpin left")
  if (/\binto\b/i.test(clean)) {
    hasCompound = true;
  }

  // Strip remaining degree symbols and "Hard" prefix artifacts
  clean = clean.replace(/°/g, '');

  // Normalize case
  clean = clean.replace(/\bHARD\b/gi, '');
  clean = clean.replace(/\bINTO\b/g, 'into');

  // Build modifiers list
  let modifiers = [];
  if (hasTightens) modifiers.push('tightens');
  if (hasOpens) modifiers.push('opens');
  if (hasLong) modifiers.push('long');
  if (hasDontCut) modifiers.push("don't cut");

  // Add modifiers to the end of the phrase
  if (modifiers.length > 0) {
    clean = clean + ', ' + modifiers.join(', ');
  }

  // Add "flat out" for severity 6 curves (if not already modified and not compound)
  if (/\b6\b/.test(clean) && modifiers.length === 0 && !hasCompound) {
    clean = clean + ', flat out';
  }

  // Clean whitespace
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
// ROUND 5: Rally 1-6 scale tests
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
    { input: 'Left 32°, Right 31°', expected: 'Left 5 into right 5' },
    { input: 'HARD LEFT 108° into HARD RIGHT 82°', expected: 'Left 2 into right 2' },

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

  console.log('\n🧪 TESTING cleanForSpeech() - Rally 1-6 Scale\n');

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

      // ROUND 5 CHANGE 5: Clear currentlyPlayingRef on audio end
      utterance.onend = () => {
        isPlayingRef.current = false
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
      }

      utterance.onerror = () => {
        isPlayingRef.current = false
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
      // ROUND 5 CHANGE 5: Clear currentlyPlayingRef on audio end
      const onEnded = () => {
        isPlayingRef.current = false
        currentlyPlayingRef.current = null
        setSpeaking(false, '')
        globalAudioElement.removeEventListener('ended', onEnded)
        globalAudioElement.removeEventListener('error', onError)
      }
      const onError = (e) => {
        console.log('🔊 Playback error:', e)
        isPlayingRef.current = false
        currentlyPlayingRef.current = null
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
  // ROUND 5 CHANGE 5: Priority-based interruption
  // Higher priority can interrupt lower priority, same priority can interrupt same
  // low < normal < high
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

    // ROUND 5 CHANGE 5: Priority-based interruption logic
    const priorityRank = { low: 0, normal: 1, high: 2 }
    const newRank = priorityRank[priority] ?? 1

    if (isPlayingRef.current && currentlyPlayingRef.current) {
      const currentRank = priorityRank[currentlyPlayingRef.current.priority] ?? 1

      // Lower priority items cannot interrupt higher priority items
      if (newRank < currentRank) {
        console.log(`🔇 SKIPPED (lower priority): "${text.substring(0, 30)}..." (${priority}) while "${currentlyPlayingRef.current.text.substring(0, 20)}..." (${currentlyPlayingRef.current.priority}) playing`)
        return false
      }

      // Same or higher priority - interrupt
      console.log(`⏹️ INTERRUPTED: "${currentlyPlayingRef.current.text.substring(0, 20)}..." replaced by "${text.substring(0, 30)}..."`)
      globalAudioElement?.pause()
      if (globalAudioElement) {
        globalAudioElement.currentTime = 0
      }
      synthRef.current?.cancel()
      isPlayingRef.current = false
      currentlyPlayingRef.current = null
    }

    lastSpokenRef.current = text
    lastSpokenTimeRef.current = now

    // Track what's playing
    currentlyPlayingRef.current = { text, priority }

    // Clean text for natural TTS pronunciation
    // "CAUTION - Right 67°" → "Right 3"
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
    currentlyPlayingRef.current = null  // ROUND 5 CHANGE 5
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
