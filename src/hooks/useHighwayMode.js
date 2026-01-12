// ================================
// useHighwayMode Hook
// Integration layer for highway mode features
// 
// Usage in App.jsx:
//   const { getNextHighwayCallout, isHighwayActive } = useHighwayMode()
// ================================

import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import {
  identifySweepers,
  generateHighwayCallout,
  generateApexCallout,
  getSilenceBreaker,
  getSweeperFeedback,
  checkProgressMilestone,
  generateStatsCallout,
  shouldUseHighwayMode,
  HIGHWAY_MODE
} from '../services/highwayModeService'

/**
 * Hook for highway mode integration
 * Call this from App.jsx to get highway-specific callouts
 */
export function useHighwayMode() {
  // Main store state
  const { 
    routeData, 
    routeZones,
    speed,
    isRunning,
    simulationProgress
  } = useStore()
  
  // Highway store state
  const {
    highwayMode,
    highwayFeatures,
    highwayStats,
    lastCalloutTime,
    lastChatterTime,
    inHighwayZone,
    routeSweepers,
    setRouteSweepers,
    setInHighwayZone,
    recordCalloutTime,
    recordChatterTime,
    incrementSweepersCleared,
    addSpeedSample,
    addAnnouncedMilestone,
    announcedMilestones,
    resetHighwayTrip
  } = useHighwayStore()
  
  // Refs for tracking
  const lastSweeperIdRef = useRef(null)
  const pendingApexRef = useRef(null)
  
  // ================================
  // ROUTE INITIALIZATION
  // Process curves to identify sweepers when route loads
  // ================================
  
  useEffect(() => {
    if (!routeData?.curves || !routeZones?.length) {
      setRouteSweepers([])
      return
    }
    
    // Identify sweepers in highway zones
    const enhancedCurves = identifySweepers(routeData.curves, routeZones)
    const sweepers = enhancedCurves.filter(c => c.isSweeper)
    
    console.log(`🛣️ Highway Mode: Found ${sweepers.length} sweepers out of ${routeData.curves.length} curves`)
    
    setRouteSweepers(enhancedCurves)
  }, [routeData?.curves, routeZones, setRouteSweepers])
  
  // ================================
  // ZONE TRACKING
  // Detect when we enter/exit highway zones
  // ================================
  
  useEffect(() => {
    if (!routeZones?.length || !isRunning) return
    
    // Calculate current position along route
    const totalDistance = routeData?.distance || 0
    const currentDistance = totalDistance * simulationProgress
    
    // Find current zone
    const currentZone = routeZones.find(z => 
      currentDistance >= z.startDistance && currentDistance <= z.endDistance
    )
    
    const isHighway = currentZone?.character === 'transit'
    setInHighwayZone(isHighway)
    
  }, [routeZones, simulationProgress, routeData?.distance, isRunning, setInHighwayZone])
  
  // ================================
  // SPEED SAMPLING
  // Track average speed in highway zones
  // ================================
  
  useEffect(() => {
    if (!inHighwayZone || !isRunning || speed <= 0) return
    
    // Sample speed every 2 seconds
    const interval = setInterval(() => {
      addSpeedSample(speed)
    }, 2000)
    
    return () => clearInterval(interval)
  }, [inHighwayZone, isRunning, speed, addSpeedSample])
  
  // ================================
  // MAIN CALLOUT FUNCTION
  // Returns the next highway callout if any
  // ================================
  
  const getNextHighwayCallout = useCallback((upcomingCurves, distanceToFirst) => {
    // Not in highway zone? No highway callouts
    if (!inHighwayZone) return null
    
    // Features disabled? No callouts
    if (!highwayFeatures.sweepers) return null
    
    const now = Date.now()
    
    // Check pending apex callout
    if (pendingApexRef.current) {
      const apex = pendingApexRef.current
      if (now >= apex.triggerTime) {
        pendingApexRef.current = null
        return apex.callout
      }
    }
    
    // Look for sweeper in upcoming curves
    if (upcomingCurves?.length > 0 && highwayFeatures.sweepers) {
      const curve = upcomingCurves[0]
      
      // Find enhanced version with sweeper data
      const enhancedCurve = routeSweepers.find(c => c.id === curve.id)
      
      if (enhancedCurve?.isSweeper && enhancedCurve.id !== lastSweeperIdRef.current) {
        // Check if we should call this sweeper (within warning distance)
        const warningDistance = speed > 60 ? 400 : speed > 40 ? 300 : 200
        
        if (distanceToFirst <= warningDistance && distanceToFirst > 50) {
          lastSweeperIdRef.current = enhancedCurve.id
          
          // Generate sweeper callout
          const callout = generateHighwayCallout(enhancedCurve, highwayMode)
          
          if (callout) {
            recordCalloutTime()
            
            // Queue apex callout if companion mode
            if (highwayMode === HIGHWAY_MODE.COMPANION && highwayFeatures.apex) {
              const apexCallout = generateApexCallout(enhancedCurve, speed)
              if (apexCallout) {
                pendingApexRef.current = {
                  callout: apexCallout,
                  triggerTime: now + apexCallout.delayMs
                }
              }
            }
            
            return callout
          }
        }
      }
    }
    
    // Check for chatter (Companion mode only)
    if (highwayMode === HIGHWAY_MODE.COMPANION && highwayFeatures.chatter) {
      const chatter = getSilenceBreaker(lastCalloutTime, lastChatterTime)
      if (chatter) {
        recordChatterTime()
        return chatter
      }
    }
    
    return null
  }, [
    inHighwayZone, 
    highwayMode, 
    highwayFeatures, 
    routeSweepers, 
    speed, 
    lastCalloutTime, 
    lastChatterTime,
    recordCalloutTime,
    recordChatterTime
  ])
  
  // ================================
  // PROGRESS CALLOUT
  // Check for milestone announcements
  // ================================
  
  const getProgressCallout = useCallback(() => {
    if (!highwayFeatures.progress || !routeData?.distance) return null
    
    const totalDistance = routeData.distance
    const currentDistance = totalDistance * simulationProgress
    
    return checkProgressMilestone(currentDistance, totalDistance, announcedMilestones)
  }, [highwayFeatures.progress, routeData?.distance, simulationProgress, announcedMilestones])
  
  // ================================
  // SWEEPER COMPLETION
  // Called when a sweeper is passed
  // ================================
  
  const onSweeperCompleted = useCallback((curve) => {
    if (!curve?.isSweeper) return null
    
    incrementSweepersCleared()
    
    // Return feedback if companion mode
    if (highwayMode === HIGHWAY_MODE.COMPANION && highwayFeatures.feedback) {
      return getSweeperFeedback()
    }
    
    return null
  }, [highwayMode, highwayFeatures.feedback, incrementSweepersCleared])
  
  // ================================
  // STATS CALLOUT
  // Periodic stats in companion mode
  // ================================
  
  const getStatsCallout = useCallback(() => {
    if (highwayMode !== HIGHWAY_MODE.COMPANION || !highwayFeatures.stats) return null
    if (!inHighwayZone) return null
    
    // Check for sweeper milestone
    if (highwayStats.sweepersCleared > 0 && highwayStats.sweepersCleared % 10 === 0) {
      return generateStatsCallout(highwayStats, 'sweepers')
    }
    
    return null
  }, [highwayMode, highwayFeatures.stats, inHighwayZone, highwayStats])
  
  // ================================
  // RESET ON NEW TRIP
  // ================================
  
  useEffect(() => {
    if (!isRunning) {
      // Reset when navigation stops
      lastSweeperIdRef.current = null
      pendingApexRef.current = null
    }
  }, [isRunning])
  
  // ================================
  // PUBLIC API
  // ================================
  
  return {
    // State
    isHighwayActive: inHighwayZone,
    highwayMode,
    highwayStats,
    routeSweepers,
    
    // Callout functions
    getNextHighwayCallout,
    getProgressCallout,
    getStatsCallout,
    onSweeperCompleted,
    
    // Control
    resetHighwayTrip
  }
}

export default useHighwayMode
