import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import useHighwayStore from '../services/highwayStore'
import {
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
// useHighwayMode Hook v4.0
// SIMPLIFIED: No re-analysis - reads from store
// Preview does all the work, Navigation just reads
// ================================

export function useHighwayMode() {
  const {
    routeData,
    routeZones,
    simulationProgress,
    isRunning,
    speed,
    position
  } = useStore()
  
  // Get highwayBends separately with fallback to empty array
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

  // Track calculated distance
  const calculatedDistanceRef = useRef(0)

  // ================================
  // DISTANCE CALCULATION
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
    if (calculatedDistanceRef.current > 0) {
      return calculatedDistanceRef.current
    }
    return (simulationProgress || 0) * totalDist
  }, [routeData?.distance, simulationProgress])

  // Refs for tracking
  const announcedBendsRef = useRef(new Set())
  const previousZoneRef = useRef(null)
  const lastRouteIdRef = useRef(null)

  // ================================
  // ROUTE INITIALIZATION
  // Just log what we got from Preview - NO re-analysis
  // ================================
  
  useEffect(() => {
    if (!routeData?.coordinates?.length || !routeZones?.length) return
    
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
      console.log(`🛣️ Navigation: Using ${highwayBends.length} highway bends from Preview`)
      const sSweeps = highwayBends.filter(b => b.isSSweep)
      const sections = highwayBends.filter(b => b.isSection)
      const sweepers = highwayBends.filter(b => !b.isSSweep && !b.isSection)
      console.log(`   - S-sweeps: ${sSweeps.length}, Sections: ${sections.length}, Sweepers: ${sweepers.length}`)
    } else {
      console.log('🛣️ Navigation: No highway bends from Preview')
    }
    
  }, [routeData?.coordinates?.length, routeData?.distance, routeZones, highwayBends])

  // Reset on route change
  useEffect(() => {
    announcedBendsRef.current = new Set()
    resetChatterSession()
  }, [routeData])

  // Track previous zone for completion detection

  // ================================
  // ZONE TRACKING
  // Detect when entering/exiting highway zones
  // ================================

  useEffect(() => {
    if (!isRunning || !routeZones?.length || !routeData?.distance) return

    const currentDist = getCurrentDistance()
    
    // Sort zones by startDistance
    const sortedZones = [...routeZones].sort((a, b) => a.startDistance - b.startDistance)

    // Find current zone
    let currentZone = sortedZones.find(z => 
      currentDist >= z.startDistance && currentDist <= z.endDistance
    )
    
    // Handle distance=0 or gaps at route start
    if (!currentZone && currentDist < 100) {
      currentZone = sortedZones.find(z => z.startDistance <= 100) || sortedZones[0]
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
      console.log(`🛣️ Highway zone: ${nowInHighway ? 'ENTERED' : 'EXITED'} @ ${Math.round(currentDist)}m`)
    }
  }, [isRunning, routeZones, simulationProgress, position, routeData?.distance, inHighwayZone, setInHighwayZone, getCurrentDistance])

  // ================================
  // SPEED SAMPLING
  // ================================

  useEffect(() => {
    if (!isRunning) return
    if (!inHighwayZone) return
    if (!speed || speed < 20) return

    addSpeedSample(speed)
  }, [isRunning, inHighwayZone, speed, addSpeedSample])

  // ================================
  // SMART CHATTER UPDATES
  // ================================

  useEffect(() => {
    if (!isRunning) return

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
  }, [isRunning, speed, simulationProgress, position, routeData?.distance, inHighwayZone, highwayBends?.length, getCurrentDistance])

  // ================================
  // GET UPCOMING BEND
  // Find next highway bend from Preview data
  // ================================

  const getUpcomingBend = useCallback(() => {
    if (!highwayBends?.length) return null
    
    const currentDist = getCurrentDistance()
    
    // Find next unannounced bend
    const upcoming = highwayBends
      .filter(b => {
        const bendDist = b.distanceFromStart || 0
        const distanceAhead = bendDist - currentDist
        return distanceAhead > 0 && distanceAhead < 2000 && !announcedBendsRef.current.has(b.id)
      })
      .sort((a, b) => (a.distanceFromStart || 0) - (b.distanceFromStart || 0))
    
    return upcoming[0] || null
  }, [highwayBends, getCurrentDistance])

  // ================================
  // ANNOUNCE BEND
  // Mark a bend as announced
  // ================================

  const markBendAnnounced = useCallback((bendId) => {
    announcedBendsRef.current.add(bendId)
    recordCalloutTime()
  }, [recordCalloutTime])

  // ================================
  // GET CHATTER
  // Get smart chatter if conditions are right
  // ================================

  const getChatter = useCallback(() => {
    if (!isRunning || !highwayFeatures.chatter) return null
    if (!inHighwayZone) return null
    
    const now = Date.now()
    if (now - lastChatterTime < 30000) return null
    
    // Build data object for smart chatter
    const chatterData = {
      speed: speed || 0,
      userDistance: calculatedDistanceRef.current || 0,
      totalDistance: routeData?.distance || 0,
      expectedDuration: routeData?.duration || 0,
      highwayBends: highwayBends || [],
      zones: routeZones || [],
      curves: routeData?.curves || [],
      currentZone: inHighwayZone ? 'transit' : 'technical',
      speedLimit: 65
    }
    
    const chatter = getSmartChatter(chatterData)
    if (chatter) {
      recordChatterTime()
    }
    return chatter
  }, [isRunning, highwayFeatures.chatter, inHighwayZone, lastChatterTime, recordChatterTime, speed, routeData, highwayBends, routeZones])

  // ================================
  // RETURN VALUES
  // ================================

  return {
    // State
    isHighwayActive: inHighwayZone,
    inHighwayZone,  // Also expose directly for backwards compatibility
    highwayBends: highwayBends || [],
    highwayMode,
    highwayFeatures,
    highwayStats,
    
    // Actions
    getUpcomingBend,
    markBendAnnounced,
    getChatter,
    
    // Functions App.jsx expects
    getNextHighwayCallout: getUpcomingBend,  // Alias
    getProgressCallout: () => checkProgressMilestone(
      calculatedDistanceRef.current || 0, 
      routeData?.distance || 0, 
      announcedMilestones
    ),
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
