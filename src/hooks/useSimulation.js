import { useEffect, useRef } from 'react'
import useStore from '../store'
import { MOHAWK_TRAIL } from '../data/routes'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'

// ================================
// Simulation Hook (Demo Mode Only)
// ================================

export function useSimulation(enabled = true) {
  const {
    isRunning,
    routeMode,
    setPosition,
    setHeading,
    setSpeed,
    setSimulationProgress,
    setUpcomingCurves,
    setActiveCurve
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const curvesRef = useRef([])

  // Only run for demo mode
  const shouldRun = enabled && routeMode === 'demo'

  // Detect curves from demo route on mount
  useEffect(() => {
    if (!shouldRun) return
    
    const curves = detectCurves(MOHAWK_TRAIL.coordinates)
    curvesRef.current = curves
    console.log(`Demo mode: Detected ${curves.length} curves`)
  }, [shouldRun])

  useEffect(() => {
    if (!isRunning || !shouldRun) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    const route = MOHAWK_TRAIL
    const coordinates = route.coordinates
    const totalPoints = coordinates.length

    // Simulation speeds (points per frame at 60fps)
    const speeds = { cruise: 0.15, fast: 0.25, race: 0.35 }

    const animate = () => {
      const { mode } = useStore.getState()
      const speed = speeds[mode] || speeds.cruise

      progressRef.current += speed / 60
      if (progressRef.current >= totalPoints - 1) {
        progressRef.current = 0
      }

      const index = Math.floor(progressRef.current)
      const nextIndex = Math.min(index + 1, totalPoints - 1)
      const fraction = progressRef.current - index

      // Interpolate position
      const currentPos = coordinates[index]
      const nextPos = coordinates[nextIndex]
      const position = [
        currentPos[0] + (nextPos[0] - currentPos[0]) * fraction,
        currentPos[1] + (nextPos[1] - currentPos[1]) * fraction
      ]

      // Calculate heading
      const heading = getBearing(currentPos, nextPos)

      // Simulated speed based on mode
      const simSpeed = mode === 'race' ? 65 : mode === 'fast' ? 50 : 35

      setPosition(position)
      setHeading(heading)
      setSpeed(simSpeed + Math.sin(progressRef.current * 0.5) * 10)
      setSimulationProgress(progressRef.current / totalPoints)

      // Update upcoming curves
      const upcoming = getUpcomingCurves(curvesRef.current, position, heading, 1000)
      setUpcomingCurves(upcoming)

      if (upcoming.length > 0 && upcoming[0].distance < 300) {
        setActiveCurve(upcoming[0])
      } else {
        setActiveCurve(null)
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRunning, shouldRun, setPosition, setHeading, setSpeed, setSimulationProgress, setUpcomingCurves, setActiveCurve])

  return null
}

// Helper: Calculate bearing between two points
function getBearing(from, to) {
  const dLon = (to[0] - from[0]) * Math.PI / 180
  const lat1 = from[1] * Math.PI / 180
  const lat2 = to[1] * Math.PI / 180

  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)

  let bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

export default useSimulation
