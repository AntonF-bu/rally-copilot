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
  // BUG FIX #2: Direct zone lookup instead of cached inHighwayZone
  // ================================
  const getChatter = useCallback(() => {
    if (!mountedRef.current) return null
    if (!isRunning) return null

    // Check if chatter is enabled
    if (highwayFeatures?.chatter === false) return null

    // Check cooldown (10 seconds between chatter — timeline spacing handles the rest)
    const now = Date.now()
    if (now - lastChatterTime < 10000) {
      return null
    }

    // USE PRE-GENERATED CHATTER TIMELINE!
    // This was generated by Claude during RoutePreview
    const timeline = chatterTimeline || window.__chatterTimeline
    if (!timeline?.length) {
      // Fallback: no pre-generated chatter available
      return null
    }

    const currentDist = getCurrentDistance()

    // BUG FIX #2: Direct zone lookup instead of using cached inHighwayZone
    // This ensures accurate zone detection after seeking/scrubbing
    const currentZone = routeZones?.find(z =>
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )
    // Chatter fires in TRANSIT zones (which map to HIGHWAY mode) or when mode is highway
    const isInHighwayZone = currentZone?.character === 'transit'

    // FIX ROUND 4: Use lookahead-style triggering (like curated callouts)
    // Fire when within LOOKAHEAD meters AHEAD of trigger, or crossed but not too far past
    // This prevents chatter from being missed when car is moving fast
    const CHATTER_LOOKAHEAD = 200 // fire when within 200m ahead
    const MAX_OVERSHOOT = 500 // meters - same as callouts

    // Find unannounced chatter items we're approaching or have crossed
    for (const item of timeline) {
      if (announcedChatterRef.current.has(item.id)) continue

      const triggerMile = item.triggerMile || item.mile || 0
      const triggerDist = triggerMile * 1609.34
      const overshoot = currentDist - triggerDist
      // overshoot < 0 means we're approaching (ahead of trigger)
      // overshoot >= 0 means we've crossed it

      // Fire if: within lookahead ahead (-200 to 0) OR crossed but not too far past (0 to 500)
      if (overshoot >= -CHATTER_LOOKAHEAD && overshoot < MAX_OVERSHOOT) {
        // BUG FIX #2: Use direct zone lookup for accurate highway detection
        // Chatter fires when in transit zone (which IS the highway)
        if (!isInHighwayZone) {
          console.log(`💬 CHATTER SKIPPED (zone=${currentZone?.character || 'unknown'}, not transit): "${(item.text || '').substring(0, 30)}..."`)
          announcedChatterRef.current.add(item.id)
          continue
        }

        announcedChatterRef.current.add(item.id)
        recordChatterTime()

        // Pick appropriate variant based on speed
        let text = item.text
        if (item.variants) {
          const speedCategory = speed > 70 ? 'fast' : speed > 50 ? 'cruise' : 'slow'
          const variants = item.variants[speedCategory] || item.variants.cruise || [item.text]
          text = variants[Math.floor(Math.random() * variants.length)]
        }

        const distAway = triggerDist - currentDist // positive = ahead, negative = passed
        console.log(`💬 CHATTER TRIGGER: car at ${Math.round(currentDist)}m, trigger at ${Math.round(triggerDist)}m, distAway=${Math.round(distAway)}m, zone=${currentZone?.character}`)
        console.log(`🎤 CHATTER FIRED: "${text}" @ mile ${triggerMile.toFixed(1)}`)
        return text
      }
    }

    return null
  }, [isRunning, routeZones, highwayFeatures?.chatter, lastChatterTime, chatterTimeline, speed, recordChatterTime, getCurrentDistance])

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
