import { useEffect, useRef, useCallback, useMemo } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import {
  generateHighwayCallout,
  generateApexCallout,
  getSilenceBreaker,
  getSweeperFeedback,
  checkProgressMilestone,
  generateStatsCallout,
  getHighwayModeConfig,
  HIGHWAY_MODE
} from '../services/highwayModeService'
import { 
  getSmartChatter, 
  resetChatterSession, 
  updateChatterData,
  onZoneComplete 
} from '../services/smartChatter'

// ================================
// useHighwayMode Hook v5.0 - iOS Optimized
// 
// FIXES for iOS crashes:
// 1. Removed duplicate distance calculation (uses store)
// 2. Reduced effect frequency with throttling
// 3. Added mounted checks in callbacks
// 4. Memoized expensive computations
// ================================

export function useHighwayMode() {
  const {
    routeData,
    routeZones,
    simulationProgress,
    isRunning,
    speed,
    position,
    userDistanceAlongRoute  // Use distance from App.jsx instead of recalculating!
  } = useStore()
  
  // Get highwayBends with stable reference
  const highwayBends = useStore((state) => state.highwayBends) || []

  const {
    highwayMode,
    highwayFeatures,
    highwayStats,
    lastCalloutTime,
    lastChatterTime,
    inHighwayZone,
    announcedMilestones,
    setInHighwayZone,
    recordCalloutTime,
    recordChatterTime,
    incrementSweepersCleared,
    addSpeedSample,
    resetHighwayTrip
  } = useHighwayStore()

  // Refs for tracking
  const announcedBendsRef = useRef(new Set())
  const previousZoneRef = useRef(null)
  const lastRouteIdRef = useRef(null)
  const mountedRef = useRef(true)
  const lastZoneCheckRef = useRef(0)

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Get current distance - use store value instead of recalculating!
  const getCurrentDistance = useCallback(() => {
    // Prefer the already-calculated distance from App.jsx
    if (userDistanceAlongRoute > 0) {
      return userDistanceAlongRoute
    }
    // Fallback for demo mode
    const totalDist = routeData?.distance || 15000
    return (simulationProgress || 0) * totalDist
  }, [userDistanceAlongRoute, routeData?.distance, simulationProgress])

  // ================================
  // ROUTE INITIALIZATION (once per route)
  // ================================
  useEffect(() => {
    if (!routeData?.coordinates?.length || !routeZones?.length) return
    if (!mountedRef.current) return
    
    // Track route changes
    const routeId = `${routeData.coordinates.length}-${routeData.distance}`
    if (lastRouteIdRef.current === routeId) return
    lastRouteIdRef.current = routeId
    
    // Reset for new route
    announcedBendsRef.current = new Set()
    resetChatterSession()
    
    // Log what Preview gave us (no re-analysis!)
    console.log('🛣️ Navigation: Using zones from Preview:', 
      routeZones.map(z => `${z.character}(${Math.round(z.startDistance)}-${Math.round(z.endDistance)}m)`).join(' → ')
    )
    
    if (highwayBends?.length > 0) {
      console.log(`🛣️ Navigation: Using ${highwayBends.length} highway bends`)
    }
    
  }, [routeData?.coordinates?.length, routeData?.distance, routeZones, highwayBends?.length])

  // Reset on route change
  useEffect(() => {
    announcedBendsRef.current = new Set()
    resetChatterSession()
  }, [routeData])

  // ================================
  // ZONE TRACKING (throttled)
  // ================================
  useEffect(() => {
    if (!isRunning || !routeZones?.length || !routeData?.distance) return
    if (!mountedRef.current) return
    
    // Throttle zone checks to every 500ms
    const now = Date.now()
    if (now - lastZoneCheckRef.current < 500) return
    lastZoneCheckRef.current = now

    const currentDist = getCurrentDistance()
    
    // Memoize zone lookup
    const sortedZones = routeZones
    
    // Find current zone
    let currentZone = sortedZones.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )
    
    // Handle distance=0 or gaps at route start
    if (!currentZone && currentDist < 100) {
      currentZone = sortedZones[0]
    }

    const nowInHighway = currentZone?.character === 'transit'

    // Track zone completion for smart chatter
    if (previousZoneRef.current && currentZone && 
        previousZoneRef.current.startDistance !== currentZone.startDistance) {
      onZoneComplete(previousZoneRef.current.character, currentDist)
    }
    previousZoneRef.current = currentZone

    if (nowInHighway !== inHighwayZone) {
      setInHighwayZone(nowInHighway)
      console.log(`🛣️ Highway zone: ${nowInHighway ? 'ENTERED' : 'EXITED'}`)
    }
  }, [isRunning, routeZones, routeData?.distance, inHighwayZone, setInHighwayZone, getCurrentDistance])

  // ================================
  // SPEED SAMPLING (throttled)
  // ================================
  const lastSpeedSampleRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning || !inHighwayZone || !speed || speed < 20) return
    if (!mountedRef.current) return
    
    // Only sample every 2 seconds
    const now = Date.now()
    if (now - lastSpeedSampleRef.current < 2000) return
    lastSpeedSampleRef.current = now

    addSpeedSample(speed)
  }, [isRunning, inHighwayZone, speed, addSpeedSample])

  // ================================
  // SMART CHATTER UPDATES (throttled)
  // ================================
  const lastChatterUpdateRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning) return
    if (!mountedRef.current) return
    
    // Only update every 5 seconds
    const now = Date.now()
    if (now - lastChatterUpdateRef.current < 5000) return
    lastChatterUpdateRef.current = now

    const currentDist = getCurrentDistance()
    const totalDist = routeData?.distance || 15000

    updateChatterData({
      distanceTraveled: currentDist,
      totalDistance: totalDist,
      currentSpeed: speed || 0,
      currentZone: previousZoneRef.current?.character || null,
      bendCount: highwayBends?.length || 0,
      isHighway: inHighwayZone
    })
  }, [isRunning, speed, routeData?.distance, inHighwayZone, highwayBends?.length, getCurrentDistance])

  // ================================
  // GET UPCOMING BEND (memoized)
  // ================================
  const getUpcomingBend = useCallback(() => {
    if (!highwayBends?.length) return null
    if (!mountedRef.current) return null
    
    const currentDist = getCurrentDistance()
    
    // Find next unannounced bend
    for (const bend of highwayBends) {
      const bendDist = bend.distanceFromStart || 0
      const distanceAhead = bendDist - currentDist
      
      if (distanceAhead > 0 && distanceAhead < 2000 && !announcedBendsRef.current.has(bend.id)) {
        return bend
      }
    }
    
    return null
  }, [highwayBends, getCurrentDistance])

  // ================================
  // MARK BEND ANNOUNCED
  // ================================
  const markBendAnnounced = useCallback((bendId) => {
    announcedBendsRef.current.add(bendId)
    recordCalloutTime()
  }, [recordCalloutTime])

  // ================================
  // GET CHATTER (with safety checks)
  // ================================
  const getChatter = useCallback(() => {
    if (!mountedRef.current) return null
    if (!isRunning) return null
    
    // Check chatter feature
    const chatterEnabled = highwayFeatures?.chatter !== false
    if (!chatterEnabled || !inHighwayZone) return null
    
    const now = Date.now()
    if (now - lastChatterTime < 30000) return null
    
    try {
      const chatterData = {
        speed: speed || 0,
        userDistance: getCurrentDistance(),
        totalDistance: routeData?.distance || 0,
        expectedDuration: routeData?.duration || 0,
        highwayBends: highwayBends || [],
        zones: routeZones || [],
        curves: routeData?.curves || [],
        currentZone: 'transit',
        speedLimit: 65
      }
      
      const chatter = getSmartChatter(chatterData)
      
      if (chatter) {
        recordChatterTime()
        return chatter.text || chatter
      }
    } catch (e) {
      console.warn('Chatter error:', e.message)
    }
    
    return null
  }, [isRunning, highwayFeatures?.chatter, inHighwayZone, lastChatterTime, recordChatterTime, speed, routeData, highwayBends, routeZones, getCurrentDistance])

  // ================================
  // RETURN VALUES
  // ================================
  return {
    // State
    isHighwayActive: inHighwayZone,
    inHighwayZone,
    highwayBends: highwayBends || [],
    highwayMode,
    highwayFeatures,
    highwayStats,
    
    // Actions
    getUpcomingBend,
    markBendAnnounced,
    getChatter,
    
    // Aliases for App.jsx compatibility
    getNextHighwayCallout: getUpcomingBend,
    getProgressCallout: () => {
      if (!mountedRef.current) return null
      return checkProgressMilestone(
        getCurrentDistance(), 
        routeData?.distance || 0, 
        announcedMilestones
      )
    },
    onBendCompleted: incrementSweepersCleared,
    resetHighwayTrip,
    recordCalloutTime,
    
    // Helpers
    generateHighwayCallout,
    generateApexCallout,
    getSilenceBreaker,
    getSweeperFeedback,
    checkProgressMilestone,
    generateStatsCallout,
    getHighwayModeConfig,
    
    // Distance
    getCurrentDistance
  }
}

export default useHighwayMode
