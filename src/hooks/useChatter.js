// ================================
// useChatter Hook v2.0
// 
// Consumes pre-generated chatter during navigation
// - Only plays in highway zones
// - NEVER interrupts curve callouts
// - Speed-aware variant selection
// - Respects companion mode setting
// - Tracks what's been played to avoid repeats
// ================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import { pickChatterVariant, canPlayChatter, getSpeedBracket, SPEED_BRACKETS } from '../services/chatterService'
import { useSpeech } from './useSpeech'

// Minimum time between chatter (prevents spam)
const MIN_CHATTER_INTERVAL_MS = 45000 // 45 seconds

// Buffer before callouts (don't play if callout within this distance)
const CALLOUT_BUFFER_SECONDS = 8

// Distance tolerance for triggering (meters)
const TRIGGER_TOLERANCE = 200

/**
 * Hook to manage chatter playback during navigation
 */
export function useChatter() {
  const { speak } = useSpeech()
  
  // Store state
  const chatterTimeline = useStore(state => state.chatterTimeline) || []
  const curatedHighwayCallouts = useStore(state => state.curatedHighwayCallouts) || []
  const routeZones = useStore(state => state.routeZones) || []
  const routeData = useStore(state => state.routeData)
  const isRunning = useStore(state => state.isRunning)
  const speed = useStore(state => state.speed) // mph
  const simulationProgress = useStore(state => state.simulationProgress)
  
  // Highway store
  const { highwayMode, highwayFeatures } = useHighwayStore()
  
  // Local state
  const [playedChatterIds, setPlayedChatterIds] = useState(new Set())
  const [lastChatterTime, setLastChatterTime] = useState(0)
  const [currentDistance, setCurrentDistance] = useState(0)
  const [lastSpeedBracket, setLastSpeedBracket] = useState(SPEED_BRACKETS.CRUISE)
  
  // Refs for stable callbacks
  const currentDistanceRef = useRef(0)
  const speedRef = useRef(65)
  const isPlayingRef = useRef(false)
  
  // Is chatter enabled?
  const chatterEnabled = useMemo(() => {
    return highwayMode === 'companion' && highwayFeatures.chatter
  }, [highwayMode, highwayFeatures.chatter])
  
  // Update current distance from store
  useEffect(() => {
    const updateDistance = () => {
      const state = useStore.getState()
      const routeDistance = state.routeData?.distance || 0
      const simProgress = state.simulationProgress || 0
      const userDist = state.userDistance || 0
      
      let dist = 0
      if (userDist > 0) {
        dist = userDist
      } else if (simProgress > 0 && routeDistance > 0) {
        dist = simProgress * routeDistance
      }
      
      currentDistanceRef.current = dist
      setCurrentDistance(dist)
    }
    
    // Initial update
    updateDistance()
    
    // Subscribe to changes
    const unsubscribe = useStore.subscribe(updateDistance)
    return unsubscribe
  }, [])
  
  // Update speed ref
  useEffect(() => {
    speedRef.current = speed || 65
    
    // Track speed bracket changes for logging
    const newBracket = getSpeedBracket(speed || 65)
    if (newBracket !== lastSpeedBracket) {
      setLastSpeedBracket(newBracket)
      console.log(`🎙️ Speed bracket: ${newBracket} (${Math.round(speed || 65)} mph)`)
    }
  }, [speed, lastSpeedBracket])
  
  // Get current zone
  const getCurrentZone = useCallback(() => {
    const distance = currentDistanceRef.current
    if (!routeZones?.length) return null
    
    return routeZones.find(z => 
      distance >= z.startDistance && distance <= z.endDistance
    )
  }, [routeZones])
  
  // Check if we're in a highway zone
  const isInHighwayZone = useCallback(() => {
    const zone = getCurrentZone()
    return zone?.character === 'transit'
  }, [getCurrentZone])
  
  // Get upcoming callouts (sorted by distance)
  const getUpcomingCallouts = useCallback(() => {
    const distance = currentDistanceRef.current
    return curatedHighwayCallouts
      .filter(c => {
        const calloutDist = c.triggerDistance || (c.triggerMile * 1609.34)
        return calloutDist > distance
      })
      .sort((a, b) => {
        const distA = a.triggerDistance || (a.triggerMile * 1609.34)
        const distB = b.triggerDistance || (b.triggerMile * 1609.34)
        return distA - distB
      })
  }, [curatedHighwayCallouts])
  
  // Find chatter items ready to trigger
  const getTriggeredChatter = useCallback(() => {
    if (!chatterEnabled || !isRunning) return null
    if (!chatterTimeline.length) return null
    if (isPlayingRef.current) return null
    
    const distance = currentDistanceRef.current
    
    // Find chatter items we haven't played yet, that are within trigger range
    const ready = chatterTimeline.find(c => {
      // Already played?
      if (playedChatterIds.has(c.id)) return false
      
      // Within trigger range?
      const triggerDist = c.triggerDistance
      const distanceToTrigger = triggerDist - distance
      
      // Trigger when within tolerance of trigger point (not too early, not too late)
      return distanceToTrigger > -100 && distanceToTrigger < TRIGGER_TOLERANCE
    })
    
    return ready || null
  }, [chatterTimeline, playedChatterIds, chatterEnabled, isRunning])
  
  // Play chatter function
  const playChatter = useCallback(async (chatterItem) => {
    if (!chatterItem) return false
    if (!chatterEnabled) return false
    if (isPlayingRef.current) return false
    
    // Check minimum interval
    const now = Date.now()
    if (now - lastChatterTime < MIN_CHATTER_INTERVAL_MS) {
      console.log('🎙️ Chatter skipped - too soon after last')
      return false
    }
    
    // Check if we're in highway zone
    if (!isInHighwayZone()) {
      console.log('🎙️ Chatter skipped - not in highway zone')
      return false
    }
    
    // Check for callout conflict
    const upcomingCallouts = getUpcomingCallouts()
    const speedMs = (speedRef.current || 65) * 0.44704 // Convert mph to m/s
    
    if (!canPlayChatter(chatterItem, upcomingCallouts, currentDistanceRef.current, CALLOUT_BUFFER_SECONDS, speedMs)) {
      console.log('🎙️ Chatter skipped - callout conflict')
      // Don't mark as played - we'll try again
      return false
    }
    
    // Pick a speed-appropriate variant
    const currentSpeed = speedRef.current || 65
    const text = pickChatterVariant(chatterItem, currentSpeed)
    
    if (!text) {
      console.warn('🎙️ No variant found for chatter')
      return false
    }
    
    const bracket = getSpeedBracket(currentSpeed)
    console.log(`🎙️ Playing chatter [${bracket}]: "${text}"`)
    
    // Mark as playing
    isPlayingRef.current = true
    
    // Speak it
    try {
      await speak(text, { priority: 'low' })
      
      // Mark as played
      setPlayedChatterIds(prev => new Set([...prev, chatterItem.id]))
      setLastChatterTime(now)
      
      return true
    } catch (err) {
      console.warn('🎙️ Chatter speak failed:', err.message)
      return false
    } finally {
      isPlayingRef.current = false
    }
  }, [chatterEnabled, lastChatterTime, isInHighwayZone, getUpcomingCallouts, speak])
  
  // Auto-trigger chatter based on distance
  useEffect(() => {
    if (!isRunning || !chatterEnabled) return
    
    const checkInterval = setInterval(() => {
      const triggered = getTriggeredChatter()
      if (triggered) {
        playChatter(triggered)
      }
    }, 500) // Check every 500ms
    
    return () => clearInterval(checkInterval)
  }, [isRunning, chatterEnabled, getTriggeredChatter, playChatter])
  
  // Reset on navigation start
  useEffect(() => {
    if (isRunning) {
      console.log('🎙️ Chatter system reset for new navigation')
      setPlayedChatterIds(new Set())
      setLastChatterTime(0)
      isPlayingRef.current = false
    }
  }, [isRunning])
  
  // Stats
  const chatterStats = useMemo(() => {
    const currentBracket = getSpeedBracket(speed || 65)
    return {
      total: chatterTimeline.length,
      played: playedChatterIds.size,
      remaining: chatterTimeline.length - playedChatterIds.size,
      enabled: chatterEnabled,
      speedBracket: currentBracket,
      currentSpeed: Math.round(speed || 0)
    }
  }, [chatterTimeline.length, playedChatterIds.size, chatterEnabled, speed])
  
  // Debug: Log chatter timeline on mount
  useEffect(() => {
    if (chatterTimeline.length > 0) {
      console.log(`🎙️ Chatter timeline loaded: ${chatterTimeline.length} items`)
      chatterTimeline.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.type} @ mile ${c.triggerMile?.toFixed(1)}`)
      })
    }
  }, [chatterTimeline])
  
  return {
    chatterEnabled,
    chatterStats,
    isInHighwayZone,
    playedChatterIds,
    // Manual trigger (for testing)
    playChatter,
    // Get next chatter (for UI display)
    getTriggeredChatter
  }
}

export default useChatter
