import { useEffect, useRef } from 'react'
import useStore from '../store'
import { detectCurves } from '../utils/curveDetection'

// ================================
// Simulation Hook - Demo Mode
// Now updates curves during simulation!
// ================================

// Demo route: Boston to Weston area
const DEMO_ROUTE = {
  name: "Boston Demo Route",
  distance: 15000,
  duration: 20 * 60,
  coordinates: [
    [-71.0756, 42.3528],
    [-71.0780, 42.3535],
    [-71.0810, 42.3542],
    [-71.0845, 42.3548],
    [-71.0880, 42.3552],
    [-71.0920, 42.3555],
    [-71.0965, 42.3558],
    [-71.1010, 42.3560],
    [-71.1055, 42.3558],
    [-71.1095, 42.3552],
    [-71.1130, 42.3542],
    [-71.1160, 42.3528],
    [-71.1185, 42.3512],
    [-71.1205, 42.3495],
    [-71.1230, 42.3485],
    [-71.1260, 42.3480],
    [-71.1295, 42.3482],
    [-71.1330, 42.3490],
    [-71.1360, 42.3502],
    [-71.1385, 42.3518],
    [-71.1405, 42.3538],
    [-71.1420, 42.3560],
    [-71.1440, 42.3580],
    [-71.1465, 42.3595],
    [-71.1495, 42.3605],
    [-71.1530, 42.3610],
    [-71.1570, 42.3608],
    [-71.1610, 42.3600],
    [-71.1645, 42.3588],
    [-71.1675, 42.3572],
    [-71.1700, 42.3555],
    [-71.1720, 42.3535],
    [-71.1735, 42.3515],
    [-71.1755, 42.3498],
    [-71.1780, 42.3485],
    [-71.1810, 42.3478],
    [-71.1845, 42.3475],
    [-71.1885, 42.3478],
    [-71.1920, 42.3485],
    [-71.1950, 42.3495],
    [-71.1975, 42.3510],
    [-71.1995, 42.3528],
    [-71.2015, 42.3548],
    [-71.2040, 42.3565],
    [-71.2070, 42.3578],
    [-71.2105, 42.3588],
    [-71.2145, 42.3592],
    [-71.2185, 42.3590],
    [-71.2220, 42.3582],
    [-71.2250, 42.3570],
    [-71.2275, 42.3555],
    [-71.2295, 42.3538],
    [-71.2310, 42.3518],
    [-71.2320, 42.3498],
    [-71.2335, 42.3480],
    [-71.2355, 42.3465],
    [-71.2380, 42.3455],
    [-71.2410, 42.3450],
    [-71.2445, 42.3452],
    [-71.2480, 42.3460],
  ]
}

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
    setRouteMode
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const lastTimeRef = useRef(0)
  const allCurvesRef = useRef([])
  const routeInitializedRef = useRef(false)

  // Initialize demo route and detect curves ONCE
  useEffect(() => {
    if (!enabled || !isRunning) return
    if (routeInitializedRef.current) return

    console.log('🎮 Initializing demo route...')
    
    const coordinates = DEMO_ROUTE.coordinates
    
    // Detect curves from the route
    const curves = detectCurves(coordinates)
    console.log(`🎮 Detected ${curves.length} curves for demo`)
    allCurvesRef.current = curves

    // Set route data
    setRouteData({
      name: DEMO_ROUTE.name,
      coordinates: coordinates,
      curves: curves,
      distance: DEMO_ROUTE.distance,
      duration: DEMO_ROUTE.duration
    })
    
    setRouteMode('demo')
    routeInitializedRef.current = true

    // Set initial upcoming curves
    if (curves.length > 0) {
      setUpcomingCurves(curves.slice(0, 5))
      console.log('🎮 Set initial upcoming curves:', curves.slice(0, 5).length)
    }
  }, [enabled, isRunning, setRouteData, setRouteMode, setUpcomingCurves])

  // Animation loop
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

    const SIMULATION_SPEED = 0.00015 // Slower for better demo

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      // Update progress
      progressRef.current += SIMULATION_SPEED * (delta / 16.67)
      
      if (progressRef.current >= 1) {
        progressRef.current = 0
      }

      setSimulationProgress(progressRef.current)

      // Calculate position along route
      const totalSegments = coordinates.length - 1
      const exactIndex = progressRef.current * totalSegments
      const segmentIndex = Math.floor(exactIndex)
      const segmentProgress = exactIndex - segmentIndex

      const startCoord = coordinates[Math.min(segmentIndex, coordinates.length - 1)]
      const endCoord = coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]

      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * segmentProgress
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * segmentProgress
      const currentPosition = [lng, lat]

      setPosition(currentPosition)

      // Calculate heading
      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
      setHeading(heading)

      // Calculate distance along route
      const distanceAlongRoute = progressRef.current * (DEMO_ROUTE.distance || 15000)

      // *** UPDATE UPCOMING CURVES ***
      if (allCurvesRef.current.length > 0) {
        const upcoming = allCurvesRef.current
          .filter(curve => {
            const curveDistance = curve.distanceFromStart || 0
            const distanceToCurve = curveDistance - distanceAlongRoute
            return distanceToCurve > -50 && distanceToCurve < 1000
          })
          .map(curve => ({
            ...curve,
            distance: Math.max(0, (curve.distanceFromStart || 0) - distanceAlongRoute)
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)

        setUpcomingCurves(upcoming)

        // Set active curve
        if (upcoming.length > 0 && upcoming[0].distance < 200) {
          setActiveCurve(upcoming[0])
        } else {
          setActiveCurve(null)
        }
      }

      // Vary speed based on upcoming curves
      const nextCurve = allCurvesRef.current.find(c => 
        (c.distanceFromStart || 0) > distanceAlongRoute
      )
      
      let baseSpeed = 45
      if (nextCurve) {
        const distToCurve = (nextCurve.distanceFromStart || 0) - distanceAlongRoute
        if (distToCurve < 100) {
          baseSpeed = 25 + (nextCurve.severity <= 3 ? 10 : 0)
        } else if (distToCurve < 200) {
          baseSpeed = 35
        }
      }
      
      setSpeed(baseSpeed + Math.sin(timestamp / 500) * 3)

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [enabled, isRunning, routeData, setPosition, setHeading, setSpeed, setSimulationProgress, setUpcomingCurves, setActiveCurve])

  // Reset on stop
  useEffect(() => {
    if (!isRunning) {
      progressRef.current = 0
      lastTimeRef.current = 0
      routeInitializedRef.current = false
    }
  }, [isRunning])

  return null
}

export default useSimulation
