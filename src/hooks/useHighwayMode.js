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
import { 
  getSmartChatter, 
  resetChatterSession, 
  updateChatterData,
  onZoneComplete 
} from '../services/smartChatter'

// ================================
// useHighwayMode Hook v3.0
// NEW: Smart data-backed chatter system
// ================================

export function useHighwayMode() {
  const {
    routeData,
    routeZones,
    simulationProgress,
    isRunning,
    speed,
    position  // Use position to calculate distance for GPS mode
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

  // Track calculated distance
  const calculatedDistanceRef = useRef(0)

  // ================================
  // DISTANCE CALCULATION
  // Calculate distance along route from GPS position
  // ================================
  useEffect(() => {
    if (!isRunning || !routeData?.coordinates?.length) return
    
    const totalDist = routeData.distance || 15000
    
    // In demo mode, use simulationProgress
    if (!position || (simulationProgress > 0 && !position)) {
      calculatedDistanceRef.current = (simulationProgress || 0) * totalDist
      return
    }
    
    // In live GPS mode, calculate from position
    const coords = routeData.coordinates
    let minDist = Infinity
    let closestIdx = 0
    
    for (let i = 0; i < coords.length; i++) {
      const dx = coords[i][0] - position[0]
      const dy = coords[i][1] - position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        minDist = dist
        closestIdx = i
      }
    }
    
    // Calculate actual distance along route
    let distanceAlong = 0
    for (let i = 0; i < closestIdx && i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0]
      const dy = coords[i + 1][1] - coords[i][1]
      const dxMeters = dx * 111320 * Math.cos(coords[i][1] * Math.PI / 180)
      const dyMeters = dy * 110540
      distanceAlong += Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters)
    }
    
    calculatedDistanceRef.current = distanceAlong
  }, [isRunning, position, routeData, simulationProgress])

  // Helper to get current distance
  const getCurrentDistance = useCallback(() => {
    const totalDist = routeData?.distance || 15000
    // Prefer calculated distance, fall back to simulation progress
    if (calculatedDistanceRef.current > 0) {
      return calculatedDistanceRef.current
    }
    return (simulationProgress || 0) * totalDist
  }, [routeData?.distance, simulationProgress])

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
    
    // Reset smart chatter session for new route
    resetChatterSession()
    
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
    resetChatterSession()  // Reset smart chatter on route change
  }, [routeData])

  // Track previous zone for completion detection
  const previousZoneRef = useRef(null)

  // ================================
  // ZONE TRACKING
  // Detect when entering/exiting highway zones
  // ================================

  useEffect(() => {
    if (!isRunning || !routeZones?.length || !routeData?.distance) return

    const currentDist = getCurrentDistance()

    // Find current zone
    const currentZone = routeZones.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )

    const nowInHighway = currentZone?.character === 'transit'

    // Track zone completion for smart chatter
    if (previousZoneRef.current && currentZone && 
        previousZoneRef.current.startDistance !== currentZone.startDistance) {
      // Zone changed - record completion of previous zone
      onZoneComplete(previousZoneRef.current.character, currentDist)
    }
    previousZoneRef.current = currentZone

    if (nowInHighway !== inHighwayZone) {
      setInHighwayZone(nowInHighway)
      console.log(`🛣️ Highway zone: ${nowInHighway ? 'ENTERED' : 'EXITED'} @ ${Math.round(currentDist)}m`)
    }
  }, [isRunning, routeZones, simulationProgress, position, routeData?.distance, inHighwayZone, setInHighwayZone, getCurrentDistance])

  // ================================
  // SPEED SAMPLING
  // Track average speed for stats (Companion mode)
  // ================================

  useEffect(() => {
    if (!isRunning) return

    const interval = setInterval(() => {
      if (speed > 0) {
        const currentDist = getCurrentDistance()
        
        // Find current zone
        const currentZone = routeZones?.find(z => 
          currentDist >= z.startDistance && currentDist <= z.endDistance
        )?.character || 'transit'
        
        // Feed stats system (existing)
        if (inHighwayZone && highwayFeatures.stats) {
          addSpeedSample(speed)
        }
        
        // Feed smart chatter system (new)
        updateChatterData({
          speed,
          distance: currentDist,
          zoneType: currentZone
        })
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isRunning, inHighwayZone, speed, highwayFeatures.stats, addSpeedSample, routeZones, getCurrentDistance])

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
    const currentDist = getCurrentDistance()

    return checkProgressMilestone(currentDist, totalDist, announcedMilestones)
  }, [highwayFeatures.progress, routeData?.distance, getCurrentDistance, announcedMilestones])

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
  // COMPANION CHATTER (SMART DATA-BACKED)
  // Generates intelligent, data-driven callouts
  // ================================
  const getChatter = useCallback(() => {
    if (!inHighwayZone) return null
    
    const config = getHighwayModeConfig(highwayMode)
    if (!config.enableChatter) return null
    
    // Calculate current distance
    const totalDist = routeData?.distance || 15000
    const currentDist = getCurrentDistance()
    
    // Get current zone type
    const currentZone = routeZones?.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )?.character || 'transit'
    
    // Call smart chatter with all available data
    const chatterResult = getSmartChatter({
      speed: speed || 0,
      userDistance: currentDist,
      totalDistance: totalDist,
      expectedDuration: routeData?.duration || 1800,
      highwayBends: highwayBendsRef.current,
      zones: routeZones,
      curves: routeData?.curves,
      currentZone,
      speedLimit: 65  // TODO: Could get from zone data
    })
    
    if (chatterResult) {
      recordChatterTime()
      console.log(`🎤 SMART CHATTER [${chatterResult.type}]: "${chatterResult.text}"`)
      return chatterResult.text
    }
    
    return null
  }, [inHighwayZone, highwayMode, routeData, routeZones, speed, getCurrentDistance, recordChatterTime])

  // ================================
  // RETURN HOOK API
  // ================================

  return {
    // State
    isHighwayActive: inHighwayZone && highwayFeatures.sweepers,
    inHighwayZone,  // Expose directly for debugging
    highwayMode,
    highwayStats,
    
    // Data
    highwayBends: highwayBendsRef.current,
    getHighwayBends,
    
    // Callout functions
    getNextHighwayCallout,
    getProgressCallout,
    getStatsCallout,
    getChatter,  // NEW: For companion mode chatter
    onBendCompleted,
    
    // Actions
    resetHighwayTrip,
    recordCalloutTime
  }
}

export default useHighwayMode
