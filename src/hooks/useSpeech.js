import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Speech Hook v10 - iOS Audio Fix
// Aggressive iOS audio unlocking for CarPlay/Bluetooth
// ================================

const ELEVENLABS_VOICE_ID = 'puLAe8o1npIDg374vYZp'

// Minimal cache - only for current session
const AUDIO_CACHE = new Map()
const getCacheKey = (text) => text.toLowerCase().trim()

// Track if audio is unlocked globally
let isAudioUnlocked = false

export function useSpeech() {
  const { settings, setSpeaking } = useStore()
  
  const audioRef = useRef(null)
  const synthRef = useRef(null)
  const voiceRef = useRef(null)
  const lastSpokenRef = useRef(null)
  const lastSpokenTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef(null)
  const audioContextRef = useRef(null)

  // Initialize
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Audio element - THIS routes through CarPlay/Bluetooth!
    const audio = new Audio()
    audio.playsInline = true
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    audio.setAttribute('webkit-playsinline', '')
    // iOS specific - allow playback without user gesture after unlock
    audio.muted = false
    audioRef.current = audio

    audio.onended = () => {
      clearTimeout(timeoutRef.current)
      isPlayingRef.current = false
      setSpeaking(false, '')
    }
    
    audio.onerror = (e) => {
      console.log('🔊 Audio error, will use native speech')
      isPlayingRef.current = false
      setSpeaking(false, '')
    }

    // Create AudioContext for iOS unlock
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        audioContextRef.current = new AudioContext()
        console.log('🔊 AudioContext created, state:', audioContextRef.current.state)
      }
    } catch (e) {
      console.log('🔊 AudioContext not available')
    }
    }

    // Native speech as fallback
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis

      const loadVoices = () => {
        const voices = synthRef.current.getVoices()
        if (voices.length === 0) return
        
        const preferred = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Ava']
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
      synthRef.current.onvoiceschanged = loadVoices
      setTimeout(loadVoices, 100)
    }

    return () => {
      clearTimeout(timeoutRef.current)
      audioRef.current?.pause()
      synthRef.current?.cancel()
    }
  }, [setSpeaking])

  // Native speech fallback (doesn't route through CarPlay)
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
        clearTimeout(timeoutRef.current)
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
      
      utterance.onerror = () => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }

      timeoutRef.current = setTimeout(() => {
        isPlayingRef.current = false
        setSpeaking(false, '')
      }, 5000)

      isPlayingRef.current = true
      setSpeaking(true, text)
      synthRef.current.speak(utterance)
      console.log(`🔊 Native: "${text}"`)
      return true
    } catch (err) {
      return false
    }
  }, [setSpeaking, settings.volume])

  // ElevenLabs via Audio element (routes through CarPlay!)
  const speakElevenLabs = useCallback(async (text) => {
    const cacheKey = getCacheKey(text)
    
    // Safety: Reset isPlaying if it's been stuck for too long
    // This prevents the "stuck playing" bug
    
    // Check cache
    if (AUDIO_CACHE.has(cacheKey)) {
      try {
        audioRef.current.src = AUDIO_CACHE.get(cacheKey)
        audioRef.current.volume = settings.volume || 1.0
        audioRef.current.currentTime = 0
        
        isPlayingRef.current = true
        setSpeaking(true, text)
        
        // Safety timeout - reset after 10 seconds max
        const safetyTimeout = setTimeout(() => {
          if (isPlayingRef.current) {
            console.log('🔊 Safety timeout - resetting isPlaying')
            isPlayingRef.current = false
            setSpeaking(false, '')
          }
        }, 10000)
        
        await audioRef.current.play()
        console.log(`🔊 Cached: "${text}"`)
        
        // Clear safety timeout on success (onended will handle cleanup)
        clearTimeout(safetyTimeout)
        return true
      } catch (err) {
        console.log('🔊 Cache play failed:', err.message)
        isPlayingRef.current = false
        setSpeaking(false, '')
      }
    }

    // Fetch from API
    if (!navigator.onLine) {
      console.log('🔊 Offline')
      return false
    }

    try {
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
        console.log('🔊 API error:', response.status)
        return false
      }

      const blob = await response.blob()
      if (blob.size < 500) {
        console.log('🔊 Blob too small:', blob.size)
        return false
      }

      const audioUrl = URL.createObjectURL(blob)
      AUDIO_CACHE.set(cacheKey, audioUrl)
      
      audioRef.current.src = audioUrl
      audioRef.current.volume = settings.volume || 1.0
      audioRef.current.currentTime = 0
      
      isPlayingRef.current = true
      setSpeaking(true, text)
      
      // Safety timeout
      const safetyTimeout = setTimeout(() => {
        if (isPlayingRef.current) {
          console.log('🔊 Safety timeout - resetting isPlaying')
          isPlayingRef.current = false
          setSpeaking(false, '')
        }
      }, 10000)
      
      await audioRef.current.play()
      console.log(`🔊 ElevenLabs: "${text}"`)
      
      clearTimeout(safetyTimeout)
      return true
    } catch (err) {
      console.log('🔊 ElevenLabs failed:', err.message)
      isPlayingRef.current = false
      setSpeaking(false, '')
      return false
    }
  }, [setSpeaking, settings.volume])

  // Main speak function
  const speak = useCallback(async (text, priority = 'normal') => {
    if (!settings.voiceEnabled || !text) return false

    // iOS: Ensure audio is unlocked
    if (!isAudioUnlocked) {
      console.log('🔊 Audio not unlocked yet, attempting unlock...')
      // Try to resume AudioContext
      if (audioContextRef.current?.state === 'suspended') {
        try {
          await audioContextRef.current.resume()
        } catch (e) {}
      }
    }

    const now = Date.now()
    
    // Prevent duplicates
    if (text === lastSpokenRef.current && now - lastSpokenTimeRef.current < 1500) {
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

    // Try ElevenLabs first (routes through CarPlay)
    const success = await speakElevenLabs(text)
    if (success) return true
    
    // Fall back to native (phone speaker only)
    console.log('🔊 Falling back to native speech')
    return speakNative(text)
  }, [settings.voiceEnabled, speakNative, speakElevenLabs])

  // Initialize audio for iOS - AGGRESSIVE UNLOCK
  const initAudio = useCallback(async () => {
    console.log('🔊 Initializing audio for iOS...')
    
    // Strategy 1: Resume AudioContext (iOS requirement)
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume()
          console.log('🔊 AudioContext resumed:', audioContextRef.current.state)
        }
        
        // Play a silent buffer to fully unlock
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050)
        const source = audioContextRef.current.createBufferSource()
        source.buffer = buffer
        source.connect(audioContextRef.current.destination)
        source.start(0)
        console.log('🔊 Silent buffer played')
      } catch (e) {
        console.log('🔊 AudioContext unlock failed:', e)
      }
    }
    
    // Strategy 2: Play silent MP3 through Audio element
    if (audioRef.current) {
      const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+9DEAAAIAANIAAAAQAAAaQAAAAS7u7vd3d0iIiIiIiJ3d3e7u93dIiIiAAAAAHd3vd3SIiIAAAAiIiIid3d3u7u93SIiIiIAAAB3d73d0iIiIiIAAAAiInd3d7u73d0iIiIiIiIid3e7u7u7u93dIiIiIiJ3d3e7u7u73d3SIiIiInd3d7u7u93d3SIiIiIid3d3u7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3dIiIiIiIiInd3u7vd3d0iIiIiIiJ3d7u7u93d3SIiIiIiInd3d7u73d3d0iIiIiIiInd3e7u93d0iIiIiIiJ3d3e7u7vd3dIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0iIiIiIiJ3d3e7u7vd3SIiIiIiInd3d7u7vd3dIiIiIiIiInd3e7u73d0='
      
      audioRef.current.src = silentMp3
      audioRef.current.volume = 0.01
      
      try {
        await audioRef.current.play()
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        console.log('🔊 Audio element unlocked')
      } catch (e) {
        console.log('🔊 Audio element unlock failed:', e)
      }
    }
    
    // Strategy 3: Unlock speech synthesis
    if (synthRef.current) {
      try {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        synthRef.current.speak(u)
        setTimeout(() => synthRef.current?.cancel(), 50)
        console.log('🔊 Speech synthesis unlocked')
      } catch (e) {
        console.log('🔊 Speech synthesis unlock failed:', e)
      }
    }
    
    // Strategy 4: Play actual audio to ensure route is established
    try {
      // Speak a very short phrase to establish audio route
      const testAudio = new Audio()
      testAudio.playsInline = true
      testAudio.setAttribute('playsinline', '')
      testAudio.volume = 0.01
      
      // Use a real but quiet beep
      testAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp6chYN6goyVm5qUiYOBhY6WmpmVjYmGiI6UmZiVkY6LiouOkpWWlZKPjYuKi42PkZOUk5GPjoyKiouNj5GTk5KQjo2LiomKjI6QkpOSkY+OjIuKiouNj5GTk5KQj42Mi4qKjI6QkpOTkpCPjYyLioqMjpCSkpKRkI6NjIuKioyOkJKSkpGQjo2Mi4qKjI6QkpKSkZCOjYyLioqMjpCSkpKRkI6NjIuKioyOkJKSko+Ojo2Mi4uLjY+RkpKRkI6NjIuLi42Pk5OSkZCOjYyLi4uNj5GSkpGQjo2Mi4uLjY+RkpKRkI6NjIuLi42PkZKSkZCOjYyLi4uNj5GSkpGQjo2Mi4uLjY+RkZGQj46NjIuLi4yOkJGRkI+OjYyLi4uMjpCRkZCPjo2Mi4uLjI6QkZGQj42MjIuLi4yOkJGRkI+OjYyLi4uMjpCRkZCPjo2Mi4uLjI6QkZGQj42Mi4uLjI2PkZGQj46NjIuLjI2PkZGQj46NjIuLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQj46NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLi4yNj5CQkI6NjYyLjIyNj5CQkI6NjYyMjI2PkJCQjo2NjIyMjY+QkJCOjY2MjIyNj5CQkI6NjYyMjI2PkJCQjo2NjIyMjY+QkJCOjY2MjIyNj5CQkI6NjYyMjI2PkJCQjo2NjIyMjY+QkJCOjY2MjIyNj5CQkI6NjYyMjI2PkJCQjo2NjIyMjY+QkJCOjY2MjIyNj5CQkI6NjYyMjI2PkJCQjo2NjIyMjY+QkJCOjY2MjIyMjY+QkJCOjY2MjIyMjY+QkJCOjY2MjIyMjY+QkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkJCOjY2NjIyMjY6PkI+Ojo2NjIyMjY6Pj46OjY2MjIyNjo+Pjo6NjYyMjI2Oj4+Ojo2NjIyMjY6Pj46OjY2MjIyNjo+Pjo6NjYyMjI2Oj4+Ojo2NjIyMjY6Pj46OjY2MjIyNjo+Pjo6NjYyMjI2Oj4+Ojo2NjIyMjY6Pj46OjY2MjIyNjo+Pjo6NjYyMjI2Oj4+Ojo2NjIyMjY6Pj46OjY2MjIyNjo+Pjo6NjYyMjI2Oj4+Ojo2NjIyMjY6Pj46OjY2NjIyMjY6Ojo6OjY2MjIyNjo6Ojo6NjYyMjI2Ojo6OjY2NjIyMjY6Ojo6NjY2MjIyNjo6Ojo6NjYyMjI2Ojo6OjY2NjIyMjY6Ojo6NjY2MjIyNjo6Ojo6NjYyMjI2Ojo6OjY2NjIyMjY6Ojo6NjY2MjIyNjo6Ojo6NjYyMjI2Ojo6OjY2NjIyMjY6Ojo6NjY2MjIyNjo6Ojo6NjYyMjI2Ojo6OjY2NjIyMjY6Ojo6NjY2MjIyNjo6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6NjY2MjIyNjY6Ojo6NjYyMjI2Njo6OjY2NjIyMjY2Ojo6OjY2MjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjYyMjIyNjY6Ojo6NjY2MjIyNjY6Ojo6NjY2MjIyNjY6Ojo6NjY2MjIyNjY6Ojo6NjY2MjIyNjY6Ojo6NjY2MjIyNjY6Ojo6NjY2MjIyNjY6OjoyMjIyNjY6Ojo6MjIyMjY2Ojo6OjIyMjI2Njo6OjoyMjIyNjY6Ojo6MjIyMjY2Ojo6OjIyMjI2Njo6OjoyMjIyNjY6Ojo6MjIyMjY2Ojo6OjIyMjI2Njo6OjoyMjIyNjY6Ojo6MjIyMjY2Ojo6OjIyMjI2Njo6OjoyMjIyNjY6Ojo6MjIyMjY2Ojo6OjIyMjI2Njo6OjoyMjIyNjY6Ojo6MjIyMjY2Njo6OjIyMjI2NjY6OjoyMjIyNjY2Ojo6MjIyMjY2Njo6OjIyMjI2NjY6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY6Ojo6MjIyMjI2Ojo6OjIyMjIyNjo6OjoyMjIyMjY2Ojo6MjIyMjI2Njo6OjIyMjIyNjY6OjoyMjIyMjY2Ojo6MjIyMjI2Njo6OjIyMjIyNjY6OjoyMjIyMjY2Ojo6MjIyMjI2Njo6OjIyMjIyNjY6OjoyMjIyMjY2Ojo6MjIyMjI2Njo6OjIyMjIyNjY6OjoyMjIyMjY2Ojo6MjIyMjI2Njo6OjIyMjIyNjY6Ojg=='
      await testAudio.play()
      testAudio.pause()
      console.log('🔊 Test audio played')
    } catch (e) {
      console.log('🔊 Test audio failed:', e)
    }
    
    isAudioUnlocked = true
    console.log('🔊 iOS Audio fully unlocked!')
    
    return true
  }, [])

  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current)
    audioRef.current?.pause()
    synthRef.current?.cancel()
    isPlayingRef.current = false
    setSpeaking(false, '')
  }, [setSpeaking])

  const isSpeaking = useCallback(() => isPlayingRef.current, [])
  const setVoiceStyle = useCallback(() => {}, [])
  const getCacheStats = useCallback(() => ({ size: AUDIO_CACHE.size }), [])

  return { 
    speak, stop, isSpeaking, initAudio, setVoiceStyle, getCacheStats,
    preloadCopilotVoices
  }
}

// ================================
// Pre-load essential callouts including sweepers
// ================================
export async function preloadCopilotVoices(curves, segments, onProgress) {
  const essentialCallouts = [
    // Regular curves
    'Left 1', 'Left 2', 'Left 3', 'Left 4', 'Left 5', 'Left 6',
    'Right 1', 'Right 2', 'Right 3', 'Right 4', 'Right 5', 'Right 6',
    'Left 2 long', 'Right 2 long',
    'Left 3 ahead', 'Right 3 ahead',
    'Left 4 ahead', 'Right 4 ahead',
    'Left 5 ahead', 'Right 5 ahead',
    'Chicane', 'S curve',
    
    // NEW: Sweeper callouts (common angles for highways)
    'Sweeper left, 5 degrees',
    'Sweeper right, 5 degrees',
    'Sweeper left, 8 degrees',
    'Sweeper right, 8 degrees',
    'Sweeper left, 10 degrees',
    'Sweeper right, 10 degrees',
    'Sweeper left, 12 degrees',
    'Sweeper right, 12 degrees',
    'Sweeper left, 15 degrees',
    'Sweeper right, 15 degrees',
    'Sweeper left, 18 degrees',
    'Sweeper right, 18 degrees',
    'Sweeper left, 20 degrees',
    'Sweeper right, 20 degrees',
    'Sweeper left, 22 degrees',
    'Sweeper right, 22 degrees',
    'Sweeper left, 25 degrees',
    'Sweeper right, 25 degrees',
  ]
  
  let cached = 0
  const total = essentialCallouts.length
  
  console.log(`🔊 Pre-caching ${total} essential callouts (including sweepers)...`)
  
  for (const text of essentialCallouts) {
    try {
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
      
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 500) {
          AUDIO_CACHE.set(getCacheKey(text), URL.createObjectURL(blob))
          cached++
        }
      }
    } catch (e) {}
    
    onProgress?.({ cached, total, percent: (cached / total) * 100 })
  }
  
  console.log(`🔊 Cached ${cached}/${total} callouts`)
  return { success: true, cached, total }
}

// ================================
// Callout generators
// ================================

/**
 * Generate callout text for a curve
 * NEW: Handles sweepers with angle
 */
export function generateCallout(curve) {
  if (!curve) return null
  
  // NEW: Handle sweepers - "Sweeper right, 15 degrees"
  if (curve.isSweeper) {
    const dir = curve.direction === 'LEFT' ? 'left' : 'right'
    const angle = curve.sweeperAngle || curve.totalAngle || 10
    return `Sweeper ${dir}, ${angle} degrees`
  }
  
  // Handle chicanes
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${firstDir} ${curve.severitySequence || ''}`
  }
  
  // Handle technical sections
  if (curve.isTechnicalSection) {
    const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
    return `Technical section ${dir}, ${curve.curveCount} curves`
  }
  
  // Regular curve
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let text = `${dir} ${curve.severity}`
  if (curve.modifier) {
    const mods = { 'TIGHTENS': 'tightens', 'OPENS': 'opens', 'LONG': 'long', 'HAIRPIN': 'hairpin' }
    text += ` ${mods[curve.modifier] || curve.modifier.toLowerCase()}`
  }
  return text
}

/**
 * Generate final warning for hard curves
 */
export function generateFinalWarning(curve) {
  if (!curve) return null
  
  // Sweepers don't need final warnings - they're gentle
  if (curve.isSweeper) return null
  
  // Only for severity 5+
  if (curve.severity < 5) return null
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return `${dir} now`
}

export function generateStraightCallout() { return null }
export function generateZoneTransitionCallout(from, to) { return null }

export default useSpeech
