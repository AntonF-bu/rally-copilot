import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'
import { MOHAWK_TRAIL, getDistance, getBearing } from '../data/routes'

// ================================
// Simulation Hook - Demo Mode
// ================================

export function useSimulation() {
  const {
    isRunning,
    useSimulation,
    simulationProgress,
    mode,
    setPosition,
    setHeading,
    setSpeed,
    setSimulationProgress,
    setUpcomingCurves,
    setActiveCurve,
  } = useStore()

  const intervalRef = useRef(null)
  const route = MOHAWK_TRAIL

  // Interpolate position along route
  const getPositionAtProgress = useCallback((progress) => {
    const coords = route.coordinates
    const totalSegments = coords.length - 1
    const segmentFloat = progress * totalSegments
    const segmentIndex = Math.floor(segmentFloat)
    const segmentProgress = segmentFloat - segmentIndex

    if (segmentIndex >= totalSegments) {
      return coords[coords.length - 1]
    }

    const start = coords[segmentIndex]
    const end = coords[segmentIndex + 1]

    return [
      start[0] + (end[0] - start[0]) * segmentProgress,
      start[1] + (end[1] - start[1]) * segmentProgress
    ]
  }, [route])

  // Get heading at position
  const getHeadingAtProgress = useCallback((progress) => {
    const coords = route.coordinates
    const totalSegments = coords.length - 1
    const segmentIndex = Math.min(
      Math.floor(progress * totalSegments),
      totalSegments - 1
    )

    const start = coords[segmentIndex]
    const end = coords[segmentIndex + 1]

    return getBearing(start, end)
  }, [route])

  // Calculate upcoming curves from current position
  // Only returns curves that are AHEAD of the car on the route
  const calculateUpcomingCurves = useCallback((currentPos, currentProgress) => {
    const curves = route.curves
    const upcoming = []
    const coords = route.coordinates

    // Find which curves are ahead based on route progress
    for (const curve of curves) {
      // Calculate where this curve is on the route (0-1)
      // by finding the closest point on the route to the curve
      let minDist = Infinity
      let curveProgress = 0
      
      for (let i = 0; i < coords.length; i++) {
        const dist = getDistance(coords[i], curve.position)
        if (dist < minDist) {
          minDist = dist
          curveProgress = i / (coords.length - 1)
        }
      }

      // Only include if curve is ahead of current position
      if (curveProgress > currentProgress) {
        const distance = getDistance(currentPos, curve.position)
        
        if (distance < 1000) { // Within 1km
          upcoming.push({
            ...curve,
            distance: Math.round(distance),
            routeProgress: curveProgress
          })
        }
      }
    }

    // Sort by route progress (not distance) to ensure correct order
    return upcoming
      .sort((a, b) => a.routeProgress - b.routeProgress)
      .slice(0, 5)
  }, [route])

  // Run simulation tick
  const tick = useCallback(() => {
    if (!isRunning || !useSimulation) return

    // Advance progress
    const newProgress = simulationProgress + 0.0015

    if (newProgress >= 1) {
      // Loop back to start
      setSimulationProgress(0)
      return
    }

    setSimulationProgress(newProgress)

    // Update position
    const position = getPositionAtProgress(newProgress)
    setPosition(position)

    // Update heading
    const heading = getHeadingAtProgress(newProgress)
    setHeading(heading)

    // Simulate speed with variation
    const baseSpeeds = { cruise: 42, fast: 52, race: 62 }
    const baseSpeed = baseSpeeds[mode] || 42
    const variation = Math.sin(Date.now() / 1500) * 8 + (Math.random() - 0.5) * 4
    setSpeed(Math.max(15, baseSpeed + variation))

    // Update upcoming curves (pass progress to know which are ahead)
    const upcoming = calculateUpcomingCurves(position, newProgress)
    setUpcomingCurves(upcoming)

    // Set active curve if close enough
    if (upcoming.length > 0 && upcoming[0].distance < 300) {
      setActiveCurve(upcoming[0])
    } else {
      setActiveCurve(null)
    }

  }, [
    isRunning,
    useSimulation,
    simulationProgress,
    mode,
    getPositionAtProgress,
    getHeadingAtProgress,
    calculateUpcomingCurves,
    setSimulationProgress,
    setPosition,
    setHeading,
    setSpeed,
    setUpcomingCurves,
    setActiveCurve
  ])

  // Start/stop simulation
  useEffect(() => {
    if (isRunning && useSimulation) {
      intervalRef.current = setInterval(tick, 100)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, useSimulation, tick])

  // Initialize position when simulation starts
  useEffect(() => {
    if (isRunning && useSimulation && simulationProgress === 0) {
      const initialPos = getPositionAtProgress(0)
      setPosition(initialPos)
      setHeading(getHeadingAtProgress(0))
    }
  }, [isRunning, useSimulation, simulationProgress, getPositionAtProgress, getHeadingAtProgress, setPosition, setHeading])

  return {
    route
  }
}

export default useSimulation
