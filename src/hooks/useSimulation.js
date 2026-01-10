import { useEffect, useRef } from 'react'
import useStore from '../store'
import { WESTON_DEMO_ROUTE } from '../data/westonRoute'

// ================================
// Simulation Hook - Demo Mode
// Uses the Weston route (Boston → Campion Center)
// ================================

export function useSimulation(enabled = false) {
  const {
    isRunning,
    setPosition,
    setHeading,
    setSpeed,
    setSimulationProgress,
    routeData,
    setRouteData,
    setRouteMode
  } = useStore()

  const animationRef = useRef(null)
  const progressRef = useRef(0)
  const lastTimeRef = useRef(0)

  // Set up demo route data when simulation starts
  useEffect(() => {
    if (enabled && isRunning && !routeData) {
      console.log('Setting up demo route with Weston data')
      setRouteData({
        name: WESTON_DEMO_ROUTE.name,
        coordinates: WESTON_DEMO_ROUTE.coordinates,
        distance: WESTON_DEMO_ROUTE.distance,
        duration: WESTON_DEMO_ROUTE.duration
      })
      setRouteMode('demo')
    }
  }, [enabled, isRunning, routeData, setRouteData, setRouteMode])

  // Animation loop
  useEffect(() => {
    if (!enabled || !isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      return
    }

    const coordinates = routeData?.coordinates || WESTON_DEMO_ROUTE.coordinates
    if (!coordinates || coordinates.length < 2) return

    // Simulate driving speed (adjust for demo)
    const SIMULATION_SPEED = 0.0003 // Progress per frame at 60fps (~15 min route in ~2 min)

    const animate = (timestamp) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      // Update progress
      progressRef.current += SIMULATION_SPEED * (delta / 16.67) // Normalize to 60fps
      
      if (progressRef.current >= 1) {
        progressRef.current = 0 // Loop back
      }

      setSimulationProgress(progressRef.current)

      // Calculate current position along route
      const totalSegments = coordinates.length - 1
      const exactIndex = progressRef.current * totalSegments
      const segmentIndex = Math.floor(exactIndex)
      const segmentProgress = exactIndex - segmentIndex

      const startCoord = coordinates[Math.min(segmentIndex, coordinates.length - 1)]
      const endCoord = coordinates[Math.min(segmentIndex + 1, coordinates.length - 1)]

      // Interpolate position
      const lng = startCoord[0] + (endCoord[0] - startCoord[0]) * segmentProgress
      const lat = startCoord[1] + (endCoord[1] - startCoord[1]) * segmentProgress

      setPosition([lng, lat])

      // Calculate heading
      const dLng = endCoord[0] - startCoord[0]
      const dLat = endCoord[1] - startCoord[1]
      const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
      setHeading(heading)

      // Simulate speed (vary based on curves - slower near tight curves)
      // Base speed around 35-50 mph for demo
      const baseSpeed = 42
      const speedVariation = Math.sin(progressRef.current * Math.PI * 20) * 8
      setSpeed(Math.max(25, baseSpeed + speedVariation))

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [enabled, isRunning, routeData, setPosition, setHeading, setSpeed, setSimulationProgress])

  // Reset on stop
  useEffect(() => {
    if (!isRunning) {
      progressRef.current = 0
      lastTimeRef.current = 0
    }
  }, [isRunning])

  return null
}

export default useSimulation
