import { useEffect, useRef } from 'react'
import useStore from '../store'
import { detectCurves } from '../utils/curveDetection'

// ================================
// Simulation Hook - Demo Mode v2
// Realistic speeds + Better route
// ================================

// Demo route: Boston to Campion Center, Weston
// This is the actual route with the good curves you tested
const DEMO_ROUTE = {
  name: "Boston to Weston Demo",
  distance: 24800, // ~15.4 miles in meters
  duration: 25 * 60, // 25 minutes
  coordinates: [
    // Start: Downtown Boston
    [-71.0756, 42.3529],
    [-71.0785, 42.3538],
    [-71.0820, 42.3545],
    [-71.0860, 42.3550],
    [-71.0905, 42.3555],
    [-71.0950, 42.3558],
    [-71.0995, 42.3560],
    
    // Back Bay / Fenway - gentle curves
    [-71.1040, 42.3558],
    [-71.1085, 42.3552],
    [-71.1125, 42.3542],
    [-71.1165, 42.3530],
    [-71.1200, 42.3515],
    [-71.1235, 42.3505],
    
    // Storrow Drive curves
    [-71.1275, 42.3520],
    [-71.1315, 42.3535],
    [-71.1355, 42.3548],
    [-71.1395, 42.3560],
    [-71.1435, 42.3570],
    [-71.1475, 42.3578],
    
    // Allston - winding along river
    [-71.1515, 42.3585],
    [-71.1555, 42.3590],
    [-71.1595, 42.3598],
    [-71.1635, 42.3608],
    [-71.1675, 42.3618],
    [-71.1715, 42.3625],
    [-71.1755, 42.3630],
    
    // Mass Pike area
    [-71.1795, 42.3632],
    [-71.1835, 42.3630],
    [-71.1875, 42.3625],
    [-71.1915, 42.3618],
    [-71.1955, 42.3612],
    [-71.1995, 42.3608],
    [-71.2035, 42.3605],
    [-71.2075, 42.3605],
    
    // Newton - curves begin
    [-71.2115, 42.3608],
    [-71.2155, 42.3615],
    [-71.2190, 42.3625],
    [-71.2220, 42.3638],
    [-71.2245, 42.3652],
    [-71.2265, 42.3668],
    [-71.2280, 42.3685],
    
    // Newton hills - tighter curves
    [-71.2295, 42.3700],
    [-71.2315, 42.3712],
    [-71.2340, 42.3720],
    [-71.2368, 42.3725],
    [-71.2398, 42.3728],
    [-71.2428, 42.3730],
    
    // Weston approach - winding roads
    [-71.2458, 42.3732],
    [-71.2485, 42.3738],
    [-71.2508, 42.3748],
    [-71.2528, 42.3762],
    [-71.2545, 42.3778],
    [-71.2558, 42.3795],
    [-71.2568, 42.3812],
    
    // Weston Reservoir area - tight curves
    [-71.2580, 42.3828],
    [-71.2598, 42.3840],
    [-71.2620, 42.3848],
    [-71.2645, 42.3852],
    [-71.2672, 42.3850],
    [-71.2698, 42.3842],
    [-71.2722, 42.3830],
    [-71.2742, 42.3815],
    
    // S-curve section
    [-71.2758, 42.3798],
    [-71.2770, 42.3782],
    [-71.2788, 42.3768],
    [-71.2810, 42.3758],
    [-71.2835, 42.3752],
    [-71.2862, 42.3750],
    [-71.2890, 42.3752],
    
    // Final approach
    [-71.2918, 42.3758],
    [-71.2942, 42.3768],
    [-71.2962, 42.3782],
    [-71.2978, 42.3798],
    [-71.2992, 42.3815],
    [-71.3008, 42.3828],
    [-71.3028, 42.3838],
    [-71.3052, 42.3845],
    
    // Destination area
    [-71.3078, 42.3848],
    [-71.3105, 42.3845],
    [-71.3130, 42.3838],
    [-71.3155, 42.3828],
    [-71.3178, 42.3815],
    [-71.3198, 42.3800],
    [-71.3212, 42.3785],
  ]
}

export function useSimulation(enabled = false) {
  const {
    isRunning, setPosition, setHeading, setSpeed, setSimulationProgress,
    setUpcomingCurves, setActiveCurve, routeData, setRouteData, setRouteMode, mode
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const lastTimeRef = useRef(0)
  const allCurvesRef = useRef([])
  const routeInitializedRef = useRef(false)
  const currentSpeedRef = useRef(35) // Start at 35 mph

  useEffect(() => {
    if (!enabled || !isRunning) return
    if (routeInitializedRef.current) return

    const coordinates = DEMO_ROUTE.coordinates
    const curves = detectCurves(coordinates)
    allCurvesRef.current = curves

    setRouteData({
      name: DEMO_ROUTE.name,
      coordinates: coordinates,
      curves: curves,
      distance: DEMO_ROUTE.distance,
      duration: DEMO_ROUTE.duration
    })
    
    setRouteMode('demo')
    routeInitializedRef.current = true

    if (curves.length > 0) {
      setUpcomingCurves(curves.slice(0, 5))
    }
    
    console.log(`🎮 Demo initialized: ${coordinates.length} points, ${curves.length} curves`)
  }, [enabled, isRunning, setRouteData, setRouteMode, setUpcomingCurves])

  useEffect(() => {
    if (!enabled || !isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    const coordinates = routeData?.coordinates || DEMO_ROUTE.coordinates
    if (!coordinates || coordinates.length < 2) return

    // Calculate total route length for proper distance tracking
    let totalRouteLength = 0
    const segmentLengths = []
    for (let i = 0; i < coordinates.length - 1; i++) {
      const segLen = getDistance(coordinates[i], coordinates[i + 1])
      segmentLengths.push(segLen)
      totalRouteLength += segLen
    }

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaMs = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      // Calculate current position along route
      const currentDistanceAlong = progressRef.current * totalRouteLength
      
      // Find which segment we're on
      let accumulatedDist = 0
      let segmentIndex = 0
      for (let i = 0; i < segmentLengths.length; i++) {
        if (accumulatedDist + segmentLengths[i] > currentDistanceAlong) {
          segmentIndex = i
          break
        }
        accumulatedDist += segmentLengths[i]
        segmentIndex = i
      }

      const segmentProgress = segmentLengths[segmentIndex] > 0 
        ? (currentDistanceAlong - accumulatedDist) / segmentLengths[segmentIndex]
        : 0

      const startCoord = coordinates[Math.min(segmentIndex, coordinates.length - 1)]
      const endCoord = coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]

      // Interpolate position
      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * Math.min(1, Math.max(0, segmentProgress))
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * Math.min(1, Math.max(0, segmentProgress))
      const currentPosition = [lng, lat]

      setPosition(currentPosition)

      // Calculate heading
      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
      setHeading(heading)

      // *** REALISTIC SPEED CALCULATION ***
      // Find nearest upcoming curve and adjust speed accordingly
      let targetSpeed = getBaseSpeed(mode) // Base cruising speed
      
      if (allCurvesRef.current.length > 0) {
        const upcoming = allCurvesRef.current
          .filter(curve => {
            const curveDistance = curve.distanceFromStart || 0
            const distanceToCurve = curveDistance - currentDistanceAlong
            return distanceToCurve > -30 && distanceToCurve < 800
          })
          .map(curve => ({
            ...curve,
            distance: Math.max(0, (curve.distanceFromStart || 0) - currentDistanceAlong)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)

        setUpcomingCurves(upcoming)

        // Active curve detection
        if (upcoming.length > 0 && upcoming[0].distance < 150) {
          setActiveCurve(upcoming[0])
        } else {
          setActiveCurve(null)
        }

        // Speed adjustment based on upcoming curves
        if (upcoming.length > 0) {
          const nextCurve = upcoming[0]
          const distToCurve = nextCurve.distance
          const curveSpeed = getCurveSpeed(nextCurve.severity, mode)
          
          if (distToCurve < 30) {
            // In the curve - use curve speed
            targetSpeed = curveSpeed
          } else if (distToCurve < 100) {
            // Approaching curve - slow down
            targetSpeed = curveSpeed + (distToCurve / 100) * (getBaseSpeed(mode) - curveSpeed) * 0.3
          } else if (distToCurve < 250) {
            // Preparing for curve - gradual slowdown
            const blendFactor = (distToCurve - 100) / 150
            targetSpeed = curveSpeed + blendFactor * (getBaseSpeed(mode) - curveSpeed)
          }
          // Otherwise use base speed
        }
      }

      // Smooth speed transitions (don't jump instantly)
      const speedDiff = targetSpeed - currentSpeedRef.current
      const maxSpeedChange = (deltaMs / 1000) * (speedDiff > 0 ? 8 : 15) // Accelerate slower, brake faster
      
      if (Math.abs(speedDiff) < maxSpeedChange) {
        currentSpeedRef.current = targetSpeed
      } else {
        currentSpeedRef.current += Math.sign(speedDiff) * maxSpeedChange
      }

      // Add slight variation for realism
      const displaySpeed = currentSpeedRef.current + (Math.sin(timestamp / 800) * 1.5)
      setSpeed(Math.max(15, displaySpeed))

      // *** REALISTIC PROGRESS UPDATE ***
      // Convert current speed (mph) to meters per second, then to progress per frame
      const speedMps = (currentSpeedRef.current * 1609.34) / 3600 // mph to m/s
      const distanceThisFrame = speedMps * (deltaMs / 1000)
      const progressThisFrame = distanceThisFrame / totalRouteLength

      progressRef.current += progressThisFrame
      
      // Loop at end of route
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

// Base cruising speed by mode (mph)
function getBaseSpeed(mode) {
  switch (mode) {
    case 'race': return 55
    case 'fast': return 48
    case 'cruise':
    default: return 40
  }
}

// Speed for curves based on severity and mode (mph)
function getCurveSpeed(severity, mode) {
  const baseSpeeds = {
    1: { cruise: 38, fast: 45, race: 52 },
    2: { cruise: 34, fast: 40, race: 48 },
    3: { cruise: 30, fast: 36, race: 42 },
    4: { cruise: 25, fast: 30, race: 36 },
    5: { cruise: 20, fast: 25, race: 30 },
    6: { cruise: 15, fast: 20, race: 25 }
  }
  
  const speeds = baseSpeeds[Math.min(6, Math.max(1, severity))] || baseSpeeds[3]
  return speeds[mode] || speeds.cruise
}

// Calculate distance between two coordinates in meters
function getDistance(pos1, pos2) {
  const R = 6371e3
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

export default useSimulation
