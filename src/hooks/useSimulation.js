import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import { detectCurves } from '../utils/curveDetection'
import { getRoute } from '../services/routeService'

// ================================
// Simulation Hook - Demo Mode v3
// Real Mapbox route + Playback controls
// ================================

// Demo waypoints: Boston to Weston via scenic route
const DEMO_START = [-71.0589, 42.3601] // Boston
const DEMO_END = [-71.3012, 42.3665]   // Weston (Campion Center area)

export function useSimulation(enabled = false) {
  const {
    isRunning, 
    setPosition, 
    setHeading, 
    setSpeed, 
    setSimulationProgress,
    setUpcomingCurves, 
    setActiveCurve, 
    routeData, 
    setRouteData, 
    setRouteMode,
    mode,
    simulationSpeed,
    simulationPaused,
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const lastTimeRef = useRef(0)
  const allCurvesRef = useRef([])
  const routeInitializedRef = useRef(false)
  const currentSpeedRef = useRef(35)
  const segmentDataRef = useRef({ lengths: [], totalLength: 0 })

  // Initialize demo route - fetch real route from Mapbox
  const initDemoRoute = useCallback(async () => {
    if (routeInitializedRef.current) return
    
    console.log('🎮 Fetching real demo route from Mapbox...')
    
    try {
      const route = await getRoute(DEMO_START, DEMO_END)
      
      if (route && route.coordinates && route.coordinates.length > 10) {
        console.log(`🎮 Got route with ${route.coordinates.length} points`)
        
        // Detect curves
        const curves = detectCurves(route.coordinates)
        allCurvesRef.current = curves
        
        // Pre-calculate segment lengths
        let totalLength = 0
        const lengths = []
        for (let i = 0; i < route.coordinates.length - 1; i++) {
          const len = getDistance(route.coordinates[i], route.coordinates[i + 1])
          lengths.push(len)
          totalLength += len
        }
        segmentDataRef.current = { lengths, totalLength }
        
        setRouteData({
          name: "Boston → Weston Demo",
          coordinates: route.coordinates,
          curves: curves,
          distance: route.distance || totalLength,
          duration: route.duration || 1500
        })
        
        setRouteMode('demo')
        routeInitializedRef.current = true
        
        // Initialize upcoming curves
        if (curves.length > 0) {
          const initial = curves.slice(0, 5).map(c => ({
            ...c,
            distance: c.distanceFromStart || 500
          }))
          setUpcomingCurves(initial)
        }
        
        console.log(`🎮 Demo ready: ${curves.length} curves detected`)
      } else {
        console.error('🎮 Failed to get route, using fallback')
        initFallbackRoute()
      }
    } catch (err) {
      console.error('🎮 Route fetch error:', err)
      initFallbackRoute()
    }
  }, [setRouteData, setRouteMode, setUpcomingCurves])

  // Fallback route if Mapbox fails
  const initFallbackRoute = useCallback(() => {
    const fallbackCoords = generateFallbackRoute()
    const curves = detectCurves(fallbackCoords)
    allCurvesRef.current = curves
    
    let totalLength = 0
    const lengths = []
    for (let i = 0; i < fallbackCoords.length - 1; i++) {
      const len = getDistance(fallbackCoords[i], fallbackCoords[i + 1])
      lengths.push(len)
      totalLength += len
    }
    segmentDataRef.current = { lengths, totalLength }
    
    setRouteData({
      name: "Demo Route",
      coordinates: fallbackCoords,
      curves: curves,
      distance: totalLength,
      duration: 1200
    })
    
    setRouteMode('demo')
    routeInitializedRef.current = true
    
    if (curves.length > 0) {
      setUpcomingCurves(curves.slice(0, 5))
    }
  }, [setRouteData, setRouteMode, setUpcomingCurves])

  // Initialize on enable
  useEffect(() => {
    if (enabled && isRunning && !routeInitializedRef.current) {
      initDemoRoute()
    }
  }, [enabled, isRunning, initDemoRoute])

  // Main animation loop
  useEffect(() => {
    if (!enabled || !isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    const coordinates = routeData?.coordinates
    if (!coordinates || coordinates.length < 2) return
    
    const { lengths, totalLength } = segmentDataRef.current
    if (totalLength === 0) return

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaMs = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      // Check if paused
      const isPaused = useStore.getState().simulationPaused
      if (isPaused) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Get simulation speed multiplier (0.5x, 1x, 2x, 4x)
      const speedMultiplier = useStore.getState().simulationSpeed || 1

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

      const segmentProgress = lengths[segmentIndex] > 0 
        ? (currentDistanceAlong - accumulatedDist) / lengths[segmentIndex]
        : 0

      const startCoord = coordinates[Math.min(segmentIndex, coordinates.length - 1)]
      const endCoord = coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]

      // Interpolate position
      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * Math.min(1, Math.max(0, segmentProgress))
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * Math.min(1, Math.max(0, segmentProgress))
      
      setPosition([lng, lat])

      // Calculate heading
      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
      setHeading(heading)

      // Update upcoming curves
      if (allCurvesRef.current.length > 0) {
        const upcoming = allCurvesRef.current
          .filter(curve => {
            const curveDistance = curve.distanceFromStart || 0
            const distanceToCurve = curveDistance - currentDistanceAlong
            return distanceToCurve > -50 && distanceToCurve < 1000
          })
          .map(curve => ({
            ...curve,
            distance: Math.max(0, (curve.distanceFromStart || 0) - currentDistanceAlong)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)

        setUpcomingCurves(upcoming)

        // Active curve
        if (upcoming.length > 0 && upcoming[0].distance < 150) {
          setActiveCurve(upcoming[0])
        } else {
          setActiveCurve(null)
        }

        // Calculate realistic speed based on curves
        let targetSpeed = getBaseSpeed(mode)
        
        if (upcoming.length > 0) {
          const nextCurve = upcoming[0]
          const distToCurve = nextCurve.distance
          const curveSpeed = getCurveSpeed(nextCurve.severity, mode)
          
          if (distToCurve < 30) {
            targetSpeed = curveSpeed
          } else if (distToCurve < 100) {
            targetSpeed = curveSpeed + (distToCurve / 100) * (getBaseSpeed(mode) - curveSpeed) * 0.3
          } else if (distToCurve < 250) {
            const blendFactor = (distToCurve - 100) / 150
            targetSpeed = curveSpeed + blendFactor * (getBaseSpeed(mode) - curveSpeed)
          }
        }

        // Smooth speed transitions
        const speedDiff = targetSpeed - currentSpeedRef.current
        const maxChange = (deltaMs / 1000) * (speedDiff > 0 ? 8 : 15)
        
        if (Math.abs(speedDiff) < maxChange) {
          currentSpeedRef.current = targetSpeed
        } else {
          currentSpeedRef.current += Math.sign(speedDiff) * maxChange
        }
      }

      // Display speed with slight variation
      const displaySpeed = currentSpeedRef.current + (Math.sin(timestamp / 800) * 1.5)
      setSpeed(Math.max(15, displaySpeed))

      // Progress based on actual speed * multiplier
      const speedMps = (currentSpeedRef.current * 1609.34) / 3600
      const distanceThisFrame = speedMps * (deltaMs / 1000) * speedMultiplier
      const progressThisFrame = distanceThisFrame / totalLength

      progressRef.current += progressThisFrame
      
      // Loop at end
      if (progressRef.current >= 1) {
        progressRef.current = 0
        currentSpeedRef.current = 35
      }

      setSimulationProgress(progressRef.current)

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [enabled, isRunning, routeData, mode, setPosition, setHeading, setSpeed, setSimulationProgress, setUpcomingCurves, setActiveCurve])

  // Reset on stop
  useEffect(() => {
    if (!isRunning) {
      progressRef.current = 0
      lastTimeRef.current = 0
      routeInitializedRef.current = false
      currentSpeedRef.current = 35
    }
  }, [isRunning])

  return null
}

// Speed helpers
function getBaseSpeed(mode) {
  return { race: 55, fast: 48, cruise: 40 }[mode] || 40
}

function getCurveSpeed(severity, mode) {
  const speeds = {
    1: { cruise: 38, fast: 45, race: 52 },
    2: { cruise: 34, fast: 40, race: 48 },
    3: { cruise: 30, fast: 36, race: 42 },
    4: { cruise: 25, fast: 30, race: 36 },
    5: { cruise: 20, fast: 25, race: 30 },
    6: { cruise: 15, fast: 20, race: 25 }
  }
  return (speeds[Math.min(6, Math.max(1, severity))] || speeds[3])[mode] || 30
}

function getDistance(pos1, pos2) {
  const R = 6371e3
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Fallback route if Mapbox fails
function generateFallbackRoute() {
  const coords = []
  const start = DEMO_START
  const end = DEMO_END
  const steps = 100
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Add some curves
    const wobble = Math.sin(t * Math.PI * 4) * 0.01
    const lng = start[0] + (end[0] - start[0]) * t + wobble
    const lat = start[1] + (end[1] - start[1]) * t + Math.cos(t * Math.PI * 3) * 0.005
    coords.push([lng, lat])
  }
  
  return coords
}

export default useSimulation
