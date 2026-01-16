import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import {
  generateHighwayCallout,
  generateApexCallout,
  checkProgressMilestone,
  getHighwayModeConfig,
  HIGHWAY_MODE
} from '../services/highwayModeService'
import { resetChatterSession } from '../services/smartChatter'

// ================================
// useHighwayMode Hook v6.0 - iOS BULLETPROOF
// 
// KEY CHANGES for iOS stability:
// 1. NO real-time getSmartChatter() calls - uses PRE-GENERATED timeline
// 2. NO complex calculations during navigation
// 3. NO setInterval - uses distance-based triggers
// 4. Minimal useEffects - only essential ones
// ================================

export function useHighwayMode() {
  const {
    routeData,
    routeZones,
    simulationProgress,
    isRunning,
    speed,
    userDistanceAlongRoute,  // Use this from App.jsx
    chatterTimeline          // Pre-generated in RoutePreview!
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
    resetHighwayTrip
  } = useHighwayStore()

  // Refs for tracking - minimal state
  const announcedBendsRef = useRef(new Set())
  const announcedChatterRef = useRef(new Set())
  const lastRouteIdRef = useRef(null)
  const mountedRef = useRef(true)

  // Cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Get current distance - simple, no computation
  const getCurrentDistance = useCallback(() => {
    if (userDistanceAlongRoute > 0) return userDistanceAlongRoute
    const totalDist = routeData?.distance || 15000
    return (simulationProgress || 0) * totalDist
  }, [userDistanceAlongRoute, routeData?.distance, simulationProgress])

  // ================================
  // ROUTE INIT (once per route)
  // ================================
  useEffect(() => {
    if (!routeData?.coordinates?.length) return
    
    const routeId = `${routeData.coordinates.length}-${routeData.distance}`
    if (lastRouteIdRef.current === routeId) return
    lastRouteIdRef.current = routeId
    
    // Reset tracking for new route
    announcedBendsRef.current = new Set()
    announcedChatterRef.current = new Set()
    resetChatterSession()
    
    console.log('🛣️ Highway mode initialized for new route')
  }, [routeData?.coordinates?.length, routeData?.distance])

  // ================================
  // ZONE TRACKING (simplified)
  // Only updates when distance changes significantly
  // ================================
  const lastZoneCheckDistRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning || !routeZones?.length) return
    if (!mountedRef.current) return
    
    const currentDist = getCurrentDistance()
    
    // Only check every 100m to reduce CPU
    if (Math.abs(currentDist - lastZoneCheckDistRef.current) < 100) return
    lastZoneCheckDistRef.current = currentDist
    
    // Find current zone
    const currentZone = routeZones.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    ) || routeZones[0]

    const nowInHighway = currentZone?.character === 'transit'
    
    if (nowInHighway !== inHighwayZone) {
      setInHighwayZone(nowInHighway)
    }
  }, [isRunning, routeZones, inHighwayZone, setInHighwayZone, getCurrentDistance])

  // ================================
  // GET UPCOMING BEND (simple lookup)
  // ================================
  const getUpcomingBend = useCallback(() => {
    if (!highwayBends?.length || !mountedRef.current) return null
    
    const currentDist = getCurrentDistance()
    
    // Simple linear search - highway bends are already sorted
    for (const bend of highwayBends) {
      const bendDist = bend.distanceFromStart || 0
      const ahead = bendDist - currentDist
      
      if (ahead > 0 && ahead < 2000 && !announcedBendsRef.current.has(bend.id)) {
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
  // GET CHATTER - Uses PRE-GENERATED timeline!
  // This is the key iOS fix - NO computation, just lookup
  // ================================
  const getChatter = useCallback(() => {
    if (!mountedRef.current) return null
    if (!isRunning || !inHighwayZone) return null
    
    // Check if chatter is enabled
    if (highwayFeatures?.chatter === false) return null
    
    // Check cooldown (30 seconds between chatter)
    const now = Date.now()
    if (now - lastChatterTime < 30000) return null
    
    // USE PRE-GENERATED CHATTER TIMELINE!
    // This was generated by Claude during RoutePreview
    const timeline = chatterTimeline || window.__chatterTimeline
    if (!timeline?.length) {
      // Fallback: no pre-generated chatter available
      return null
    }
    
    const currentDist = getCurrentDistance()
    const currentMile = currentDist / 1609.34
    
    // Find next unannounced chatter trigger
    for (const item of timeline) {
      const triggerMile = item.triggerMile || item.mile || 0
      const distAhead = (triggerMile * 1609.34) - currentDist
      
      // Trigger when within 200m of the trigger point
      if (distAhead > -200 && distAhead < 200 && !announcedChatterRef.current.has(item.id)) {
        announcedChatterRef.current.add(item.id)
        recordChatterTime()
        
        // Pick appropriate variant based on speed
        let text = item.text
        if (item.variants) {
          const speedCategory = speed > 70 ? 'fast' : speed > 50 ? 'cruise' : 'slow'
          const variants = item.variants[speedCategory] || item.variants.cruise || [item.text]
          text = variants[Math.floor(Math.random() * variants.length)]
        }
        
        console.log(`🎤 CHATTER (pre-gen): "${text}" @ mile ${triggerMile.toFixed(1)}`)
        return text
      }
    }
    
    return null
  }, [isRunning, inHighwayZone, highwayFeatures?.chatter, lastChatterTime, chatterTimeline, speed, recordChatterTime, getCurrentDistance])

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
    
    // Aliases for App.jsx
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
    checkProgressMilestone,
    getHighwayModeConfig,
    
    // Distance
    getCurrentDistance
  }
}

export default useHighwayMode
