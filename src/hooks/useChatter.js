// ================================
// useChatter Hook v1.0
// 
// Consumes pre-generated chatter during navigation
// - Only plays in highway zones
// - NEVER interrupts curve callouts
// - Respects companion mode setting
// - Tracks what's been played to avoid repeats
// ================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import { pickChatterVariant, canPlayChatter } from '../services/chatterService'
import { useSpeech } from './useSpeech'

// Minimum time between chatter (prevents spam)
const MIN_CHATTER_INTERVAL = 45000 // 45 seconds

// Buffer before callouts (don't play if callout within this time)
const CALLOUT_BUFFER_SECONDS = 8

/**
 * Hook to manage chatter playback during navigation
 * 
 * @returns {Object} { 
 *   nextChatter,           // Next chatter item that could play
 *   playChatter,           // Function to trigger chatter playback
 *   chatterEnabled,        // Whether chatter is enabled
 *   chatterStats           // Stats about chatter (played, remaining, etc)
 * }
 */
export function useChatter() {
  const { speak } = useSpeech()
  
  // Store state
  const chatterTimeline = useStore(state => state.chatterTimeline) || []
  const curatedHighwayCallouts = useStore(state => state.curatedHighwayCallouts) || []
  const routeZones = useStore(state => state.routeZones) || []
  const isRunning = useStore(state => state.isRunning)
  const speed = useStore(state => state.speed) // mph
  
  // Highway store
  const { highwayMode, highwayFeatures } = useHighwayStore()
  
  // Local state
  const [playedChatterIds, setPlayedChatterIds] = useState(new Set())
  const [lastChatterTime, setLastChatterTime] = useState(0)
  const currentDistanceRef = useRef(0)
  
  // Is chatter enabled?
  const chatterEnabled = useMemo(() => {
    // Only in companion mode with chatter feature on
    return highwayMode === 'companion' && highwayFeatures.chatter
  }, [highwayMode, highwayFeatures.chatter])
  
  // Update current distance from store
  useEffect(() => {
    const unsubscribe = useStore.subscribe(
      state => {
        // Get distance from simulation progress or GPS
        const routeData = state.routeData
        const simulationProgress = state.simulationProgress
        const userDistance = state.userDistance || 0
        
        if (userDistance > 0) {
          currentDistanceRef.current = userDistance
        } else if (simulationProgress && routeData?.distance) {
          currentDistanceRef.current = simulationProgress * routeData.distance
        }
      }
    )
    return unsubscribe
  }, [])
  
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
  
  // Find next chatter that should play
  const nextChatter = useMemo(() => {
    if (!chatterEnabled || !isRunning) return null
    if (!chatterTimeline.length) return null
    
    const distance = currentDistanceRef.current
    
    // Find chatter items we haven't played yet, that are coming up
    const upcoming = chatterTimeline
      .filter(c => {
        // Not played yet
        if (playedChatterIds.has(c.id)) return false
        
        // Within trigger range (not passed, and not too far ahead)
        const triggerDist = c.triggerDistance
        const distanceToTrigger = triggerDist - distance
        
        // Trigger when within 100m of trigger point, and not passed
        return distanceToTrigger > -50 && distanceToTrigger < 100
      })
      .sort((a, b) => a.triggerDistance - b.triggerDistance)
    
    return upcoming[0] || null
  }, [chatterTimeline, playedChatterIds, chatterEnabled, isRunning])
  
  // Play chatter function
  const playChatter = useCallback(async (chatterItem) => {
    if (!chatterItem) return false
    if (!chatterEnabled) return false
    
    // Check minimum interval
    const now = Date.now()
    if (now - lastChatterTime < MIN_CHATTER_INTERVAL) {
      console.log('🎙️ Chatter skipped - too soon after last')
      return false
    }
    
    // Check if we're in highway zone
    if (!isInHighwayZone()) {
      console.log('🎙️ Chatter skipped - not in highway zone')
      return false
    }
    
    // Check if callout conflict
    const upcomingCallouts = getUpcomingCallouts()
    const speedMs = (speed || 55) * 0.44704 // Convert mph to m/s
    
    if (!canPlayChatter(chatterItem, upcomingCallouts, currentDistanceRef.current, CALLOUT_BUFFER_SECONDS, speedMs)) {
      console.log('🎙️ Chatter skipped - callout conflict')
      return false
    }
    
    // Pick a variant
    const text = pickChatterVariant(chatterItem)
    if (!text) return false
    
    console.log(`🎙️ Playing chatter: "${text}"`)
    
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
    }
  }, [chatterEnabled, lastChatterTime, isInHighwayZone, getUpcomingCallouts, speed, speak])
  
  // Auto-play chatter when conditions are right
  useEffect(() => {
    if (!nextChatter) return
    if (!chatterEnabled) return
    if (!isRunning) return
    
    // Small delay to check conditions settled
    const timer = setTimeout(() => {
      playChatter(nextChatter)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [nextChatter, chatterEnabled, isRunning, playChatter])
  
  // Reset on navigation start
  useEffect(() => {
    if (isRunning) {
      setPlayedChatterIds(new Set())
      setLastChatterTime(0)
    }
  }, [isRunning])
  
  // Stats
  const chatterStats = useMemo(() => {
    return {
      total: chatterTimeline.length,
      played: playedChatterIds.size,
      remaining: chatterTimeline.length - playedChatterIds.size,
      enabled: chatterEnabled
    }
  }, [chatterTimeline.length, playedChatterIds.size, chatterEnabled])
  
  return {
    nextChatter,
    playChatter,
    chatterEnabled,
    chatterStats,
    isInHighwayZone
  }
}

export default useChatter
