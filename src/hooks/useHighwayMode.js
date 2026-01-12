import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import {
  analyzeHighwayBends,
  identifySweepers,
  generateHighwayCallout,
  generateApexCallout,
  getSilenceBreaker,
  getSweeperFeedback,
  checkProgressMilestone,
  generateStatsCallout,
  shouldUseHighwayMode,
  getHighwayModeConfig,
  HIGHWAY_MODE
} from '../services/highwayModeService'

// ================================
// useHighwayMode Hook v2.0
// NEW: Uses independent highway bend detection
// ================================

export function useHighwayMode() {
  const {
    routeData,
    routeZones,
    simulationProgress,
    isRunning,
    speed,
    userDistanceAlongRoute  // ADD: Get GPS distance for live navigation
  } = useStore()

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

  // Store highway bends from independent detection
  const highwayBendsRef = useRef([])
  const announcedBendsRef = useRef(new Set())
  const routeAnalyzedRef = useRef(false)

  // ================================
  // ROUTE INITIALIZATION
  // Run independent highway bend detection when route loads
  // ================================
  
  useEffect(() => {
    if (!routeData?.coordinates?.length || !routeZones?.length) {
      routeAnalyzedRef.current = false
      return
    }
    
    // Only analyze once per route
    if (routeAnalyzedRef.current) return
    routeAnalyzedRef.current = true
    
    // Run independent highway bend detection
    const bends = analyzeHighwayBends(routeData.coordinates, routeZones)
    highwayBendsRef.current = bends
    
    console.log(`🛣️ Highway Mode: Found ${bends.length} highway bends`)
    
    // Log some details for debugging
    if (bends.length > 0) {
      const sSweeps = bends.filter(b => b.isSSweep)
      const sweepers = bends.filter(b => b.isSweeper && !b.isSSweep)
      console.log(`   - S-sweeps: ${sSweeps.length}`)
      console.log(`   - Sweepers: ${sweepers.length}`)
      console.log(`   - Other bends: ${bends.length - sSweeps.length - sweepers.length}`)
      
      // Log first few bends for inspection
      bends.slice(0, 3).forEach((b, i) => {
        console.log(`   Bend ${i + 1}: ${b.direction} ${b.angle}° @ ${b.distanceFromStart}m${b.isSSweep ? ' (S-sweep)' : ''}`)
      })
    }
    
    // Also tag sweepers on existing curves (backward compat)
    if (routeData.curves?.length) {
      const enhancedCurves = identifySweepers(routeData.curves, routeZones)
      const sweeperCount = enhancedCurves.filter(c => c.isSweeper).length
      console.log(`🛣️ Highway Mode: Tagged ${sweeperCount} sweepers on existing curves`)
    }
    
  }, [routeData?.coordinates, routeZones])

  // Reset on route change
  useEffect(() => {
    announcedBendsRef.current = new Set()
    routeAnalyzedRef.current = false
  }, [routeData])

  // ================================
  // ZONE TRACKING
  // Detect when entering/exiting highway zones
  // ================================

  useEffect(() => {
    if (!isRunning || !routeZones?.length || !routeData?.distance) return

    const totalDist = routeData.distance
    // Use userDistanceAlongRoute for GPS, simulationProgress for demo
    const currentDist = userDistanceAlongRoute > 0 
      ? userDistanceAlongRoute 
      : (simulationProgress || 0) * totalDist

    // Find current zone
    const currentZone = routeZones.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )

    const nowInHighway = currentZone?.character === 'transit'

    if (nowInHighway !== inHighwayZone) {
      setInHighwayZone(nowInHighway)
      console.log(`🛣️ Highway zone: ${nowInHighway ? 'ENTERED' : 'EXITED'} @ ${Math.round(currentDist)}m`)
    }
  }, [isRunning, routeZones, simulationProgress, userDistanceAlongRoute, routeData?.distance, inHighwayZone, setInHighwayZone])

  // ================================
  // SPEED SAMPLING
  // Track average speed for stats (Companion mode)
  // ================================

  useEffect(() => {
    if (!isRunning || !inHighwayZone || !highwayFeatures.stats) return

    const interval = setInterval(() => {
      if (speed > 0) {
        addSpeedSample(speed)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isRunning, inHighwayZone, speed, highwayFeatures.stats, addSpeedSample])

  // ================================
  // MAIN CALLOUT FUNCTION
  // Returns next highway callout if one is due
  // ================================

  const getNextHighwayCallout = useCallback((currentDistance) => {
    // Check if sweepers feature is enabled
    if (!highwayFeatures.sweepers) return null

    const config = getHighwayModeConfig(highwayMode)
    const bends = highwayBendsRef.current
    
    if (!bends?.length) return null

    // Find upcoming bends within range
    const upcomingBends = bends.filter(bend => {
      const distanceToBend = bend.distanceFromStart - currentDistance
      return distanceToBend > 0 && distanceToBend < 500 // Look ahead 500m
    })

    if (upcomingBends.length === 0) {
      // No bends coming up - check for chatter (Companion mode)
      if (config.enableChatter && inHighwayZone) {
        const chatter = getSilenceBreaker(lastCalloutTime, lastChatterTime)
        if (chatter) {
          recordChatterTime()
          return chatter
        }
      }
      return null
    }

    // Get closest bend
    const nextBend = upcomingBends[0]
    const distanceToBend = nextBend.distanceFromStart - currentDistance

    // Check announcement windows based on bend type
    const announceDistance = nextBend.isSection ? 450 :
                            nextBend.isSSweep ? 400 : 
                            nextBend.angle > 20 ? 350 : 
                            nextBend.angle > 10 ? 300 : 250

    // Check if we should announce
    if (distanceToBend <= announceDistance && !announcedBendsRef.current.has(nextBend.id)) {
      announcedBendsRef.current.add(nextBend.id)
      
      const callout = generateHighwayCallout(nextBend, highwayMode)
      if (callout) {
        recordCalloutTime()
        
        // Queue apex callout if enabled
        if (config.enableApex && (nextBend.isHighwayBend || nextBend.isSweeper)) {
          // Apex timing is handled separately via delay
        }
        
        return callout
      }
    }

    return null
  }, [inHighwayZone, highwayFeatures.sweepers, highwayMode, lastCalloutTime, lastChatterTime, recordCalloutTime, recordChatterTime])

  // ================================
  // PROGRESS CALLOUTS
  // ================================

  const getProgressCallout = useCallback(() => {
    if (!highwayFeatures.progress || !routeData?.distance) return null

    const totalDist = routeData.distance
    const currentDist = (simulationProgress || 0) * totalDist

    return checkProgressMilestone(currentDist, totalDist, announcedMilestones)
  }, [highwayFeatures.progress, routeData?.distance, simulationProgress, announcedMilestones])

  // ================================
  // SWEEPER/BEND COMPLETION
  // ================================

  const onBendCompleted = useCallback((bend) => {
    if (!highwayFeatures.feedback) return null

    incrementSweepersCleared()

    // Random chance of feedback (not every time)
    if (Math.random() < 0.4) {
      return getSweeperFeedback()
    }

    return null
  }, [highwayFeatures.feedback, incrementSweepersCleared])

  // ================================
  // STATS CALLOUTS (Companion mode)
  // ================================

  const getStatsCallout = useCallback(() => {
    if (!highwayFeatures.stats) return null

    // Check for milestone callouts (every 10 sweepers)
    if (highwayStats.sweepersCleared > 0 && highwayStats.sweepersCleared % 10 === 0) {
      return generateStatsCallout(highwayStats, 'sweepers')
    }

    return null
  }, [highwayFeatures.stats, highwayStats])

  // ================================
  // GET HIGHWAY BENDS FOR DISPLAY
  // Used by Map/RoutePreview to show markers
  // ================================

  const getHighwayBends = useCallback(() => {
    return highwayBendsRef.current
  }, [])

  // ================================
  // RETURN HOOK API
  // ================================

  return {
    // State
    isHighwayActive: inHighwayZone && highwayFeatures.sweepers,
    highwayMode,
    highwayStats,
    
    // Data
    highwayBends: highwayBendsRef.current,
    getHighwayBends,
    
    // Callout functions
    getNextHighwayCallout,
    getProgressCallout,
    getStatsCallout,
    onBendCompleted,
    
    // Actions
    resetHighwayTrip
  }
}

export default useHighwayMode
