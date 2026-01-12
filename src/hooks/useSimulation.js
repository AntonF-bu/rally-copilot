import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import { getRoute } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'
import { analyzeRouteCharacter } from '../services/zoneService'

// ================================
// Simulation Hook - v5
// FIXED: Reliable curve updates with better filtering
// ================================

// Demo route coordinates (Boston to Weston via scenic route)
const DEMO_START = [-71.0589, 42.3601]
const DEMO_END = [-71.3012, 42.3665]

export function useSimulation(enabled) {
  const {
    isRunning,
    mode,
    routeData,
    simulationPaused,
    simulationSpeed,
    setRouteData,
    setRouteMode,
    setPosition,
    setHeading,
    setSpeed,
    setSimulationProgress,
    setUpcomingCurves,
    setActiveCurve,
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const lastTimeRef = useRef(0)
  const routeInitializedRef = useRef(false)
  const currentSpeedRef = useRef(35)
  const targetSpeedRef = useRef(35)
  const segmentDataRef = useRef({ lengths: [], totalLength: 0 })
  const lastLogTimeRef = useRef(0)

  // Calculate segment lengths for route
  const calculateSegments = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 2) return { lengths: [], totalLength: 0 }
    
    const lengths = []
    let totalLength = 0
    
    for (let i = 0; i < coordinates.length - 1; i++) {
      const dist = getDistanceBetween(coordinates[i], coordinates[i + 1])
      lengths.push(dist)
      totalLength += dist
    }
    
    return { lengths, totalLength }
  }, [])

  // Initialize demo route
  const initDemoRoute = useCallback(async () => {
    if (routeInitializedRef.current) return
    
    const { setRouteZones } = useStore.getState()
    
    try {
      const route = await getRoute(DEMO_START, DEMO_END)
      if (!route?.coordinates) {
        console.error('Failed to load demo route')
        return
      }

      const curves = detectCurves(route.coordinates)
      const segments = calculateSegments(route.coordinates)
      segmentDataRef.current = segments

      const routeDataObj = {
        coordinates: route.coordinates,
        curves,
        distance: segments.totalLength,
        duration: Math.round(segments.totalLength / 15), // rough estimate
        name: 'Demo Route: Boston to Weston'
      }

      setRouteData(routeDataObj)
      setRouteMode('demo')
      routeInitializedRef.current = true

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5))
      }

      // Analyze route character for zone-aware callouts
      try {
        const analysis = await analyzeRouteCharacter(route.coordinates, curves)
        if (analysis?.segments?.length > 0) {
          setRouteZones(analysis.segments)
          console.log(`🎯 Demo route zones: ${analysis.segments.length} character segments`)
        }
      } catch (err) {
        console.warn('Route character analysis failed:', err)
      }

      console.log(`🚗 Demo route loaded: ${curves.length} curves, ${Math.round(segments.totalLength)}m`)
    } catch (err) {
      console.error('Demo route init error:', err)
    }
  }, [setRouteData, setRouteMode, setUpcomingCurves, calculateSegments])

  // Initialize on enable
  useEffect(() => {
    if (enabled && isRunning && !routeInitializedRef.current) {
      initDemoRoute()
    }
  }, [enabled, isRunning, initDemoRoute])

  // Recalculate segments when route changes
  useEffect(() => {
    if (routeData?.coordinates) {
      segmentDataRef.current = calculateSegments(routeData.coordinates)
    }
  }, [routeData?.coordinates, calculateSegments])

  // Main animation loop - REALISTIC DRIVING
  useEffect(() => {
    if (!enabled || !isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    const coordinates = routeData?.coordinates
    const curves = routeData?.curves || []
    if (!coordinates || coordinates.length < 2) return
    
    const { lengths, totalLength } = segmentDataRef.current
    if (totalLength === 0) return

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaMs = Math.min(timestamp - lastTimeRef.current, 100) // Cap delta to prevent jumps
      lastTimeRef.current = timestamp

      // Sync with store progress (in case slider was dragged)
      const storeProgress = useStore.getState().simulationProgress
      if (Math.abs(storeProgress - progressRef.current) > 0.01) {
        progressRef.current = storeProgress
        // Reset last time to prevent jump
        lastTimeRef.current = timestamp
      }

      // Check if paused
      if (simulationPaused) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Get simulation speed multiplier
      const speedMultiplier = simulationSpeed || 1

      // Calculate current position along route
      const currentDistanceAlong = progressRef.current * totalLength
      
      // Find which segment we're on
      let accumulatedDist = 0
      let segmentIndex = 0
      for (let i = 0; i < lengths.length; i++) {
        if (accumulatedDist + lengths[i] > currentDistanceAlong) {
          segmentIndex = i
          break
        }
        accumulatedDist += lengths[i]
        if (i === lengths.length - 1) segmentIndex = i
      }

      // Interpolate position within segment
      const segmentProgress = lengths[segmentIndex] > 0 
        ? (currentDistanceAlong - accumulatedDist) / lengths[segmentIndex]
        : 0

      const p1 = coordinates[segmentIndex]
      const p2 = coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]
      
      const interpolatedPos = [
        p1[0] + (p2[0] - p1[0]) * Math.min(1, Math.max(0, segmentProgress)),
        p1[1] + (p2[1] - p1[1]) * Math.min(1, Math.max(0, segmentProgress))
      ]

      setPosition(interpolatedPos)

      // Calculate heading from next few points for smoothness
      const lookAheadIdx = Math.min(segmentIndex + 5, coordinates.length - 1)
      const heading = getBearing(interpolatedPos, coordinates[lookAheadIdx])
      setHeading(heading)

      // ================================================================
      // CRITICAL: Calculate curve distances properly
      // ================================================================
      const curvesWithActualDistance = curves
        // FILTER 1: Skip curves at very start of route (the "curve 1 at 0m" problem)
        .filter(curve => {
          const curveStart = curve.distanceFromStart || 0
          return curveStart > 50 // Skip first 50m of route
        })
        .map(curve => {
          const curveStart = curve.distanceFromStart || 0
          const actualDistance = curveStart - currentDistanceAlong
          return {
            ...curve,
            distance: Math.max(0, actualDistance),
            actualDistance // Keep the real value for sorting/filtering
          }
        })
      
      // FILTER 2: Only include curves ahead of us (actualDistance > -30 means we haven't fully passed)
      const upcomingCurvesWithDist = curvesWithActualDistance
        .filter(c => c.actualDistance > -30 && c.actualDistance < 2000)
        .sort((a, b) => a.actualDistance - b.actualDistance)
        .slice(0, 5)

      setUpcomingCurves(upcomingCurvesWithDist)

      // Set active curve (one we're in or very close to)
      const activeCurve = upcomingCurvesWithDist.find(c => c.distance <= 30 && c.distance >= 0)
      setActiveCurve(activeCurve || null)

      // Log for debugging (every ~3 seconds)
      const now = Date.now()
      if (now - lastLogTimeRef.current > 3000 && upcomingCurvesWithDist.length > 0) {
        lastLogTimeRef.current = now
        console.log(`📍 Demo simulation:
          - Progress: ${(progressRef.current * 100).toFixed(1)}%
          - Distance along: ${Math.round(currentDistanceAlong)}m / ${Math.round(totalLength)}m
          - Speed: ${Math.round(currentSpeedRef.current)} mph (${speedMultiplier}x)
          - Upcoming curves: ${upcomingCurvesWithDist.map(c => 
              `${c.id}:${Math.round(c.distance)}m`
            ).join(', ')}`)
      }

      // REALISTIC SPEED CALCULATION
      const nextCurve = upcomingCurvesWithDist[0]
      const baseSpeed = getBaseSpeed(mode)
      
      // Calculate target speed based on upcoming curve
      if (nextCurve && nextCurve.distance < 300) {
        const curveSpeed = getCurveSpeed(nextCurve.severity, mode)
        
        // Start slowing down based on distance to curve
        if (nextCurve.distance < 50) {
          // In the curve - use curve speed
          targetSpeedRef.current = curveSpeed
        } else if (nextCurve.distance < 150) {
          // Approaching curve - blend speeds
          const blendFactor = (nextCurve.distance - 50) / 100
          targetSpeedRef.current = curveSpeed + (baseSpeed - curveSpeed) * blendFactor
        } else if (nextCurve.distance < 300) {
          // Preparing to slow - slight reduction
          const prepFactor = (nextCurve.distance - 150) / 150
          targetSpeedRef.current = baseSpeed - (baseSpeed - curveSpeed) * 0.3 * (1 - prepFactor)
        }
      } else {
        // Open road - cruise at base speed
        targetSpeedRef.current = baseSpeed
      }

      // Smooth acceleration/deceleration
      const speedDiff = targetSpeedRef.current - currentSpeedRef.current
      // Deceleration is faster than acceleration (realistic braking)
      const maxAccel = speedDiff < 0 ? 15 : 8 // mph/s
      const accel = Math.sign(speedDiff) * Math.min(Math.abs(speedDiff), maxAccel * (deltaMs / 1000))
      currentSpeedRef.current += accel
      
      setSpeed(currentSpeedRef.current)

      // Update progress based on current speed
      const speedMps = (currentSpeedRef.current * 1609.34) / 3600 // mph to m/s
      const distanceTraveled = speedMps * (deltaMs / 1000) * speedMultiplier
      progressRef.current = Math.min(1, progressRef.current + distanceTraveled / totalLength)
      
      setSimulationProgress(progressRef.current)

      // Check for end of route
      if (progressRef.current >= 0.99) {
        console.log('🏁 Demo route complete!')
        useStore.getState().endTrip()
        return
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [enabled, isRunning, routeData, simulationPaused, simulationSpeed, mode, setPosition, setHeading, setSpeed, setSimulationProgress, setUpcomingCurves, setActiveCurve])

  // Reset on disable
  useEffect(() => {
    if (!enabled) {
      progressRef.current = 0
      lastTimeRef.current = 0
      currentSpeedRef.current = 35
      targetSpeedRef.current = 35
    }
  }, [enabled])

  return null
}

// ================================
// HELPER FUNCTIONS
// ================================

function getBaseSpeed(mode) {
  const speeds = {
    cruise: 35,
    fast: 45,
    race: 55
  }
  return speeds[mode] || 35
}

function getCurveSpeed(severity, mode) {
  // Base curve speeds by severity
  const baseSpeeds = {
    1: 50,
    2: 45,
    3: 35,
    4: 28,
    5: 22,
    6: 15
  }
  
  const multipliers = {
    cruise: 0.85,
    fast: 1.0,
    race: 1.15
  }
  
  const baseSpeed = baseSpeeds[severity] || 30
  return Math.round(baseSpeed * (multipliers[mode] || 0.85))
}

function getDistanceBetween(coord1, coord2) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

function getBearing(start, end) {
  const startLat = start[1] * Math.PI / 180
  const startLng = start[0] * Math.PI / 180
  const endLat = end[1] * Math.PI / 180
  const endLng = end[0] * Math.PI / 180

  const dLng = endLng - startLng
  const x = Math.sin(dLng) * Math.cos(endLat)
  const y = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng)
  
  let bearing = Math.atan2(x, y) * 180 / Math.PI
  return (bearing + 360) % 360
}

export default useSimulation
