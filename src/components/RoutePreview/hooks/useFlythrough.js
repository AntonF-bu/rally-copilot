import { useState, useRef, useCallback, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'

/**
 * Calculate bearing between two points
 * @param {Array} start - [lng, lat]
 * @param {Array} end - [lng, lat]
 * @returns {number} Bearing in degrees
 */
function getBearing(start, end) {
  const dLon = (end[0] - start[0]) * Math.PI / 180
  const lat1 = start[1] * Math.PI / 180
  const lat2 = end[1] * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/**
 * Hook to manage fly-through animation on the map
 * @param {Object} mapRef - Ref to Mapbox GL map instance
 * @param {Object} routeData - Route with coordinates
 * @returns {Object} Flythrough controls and state
 */
export function useFlythrough(mapRef, routeData) {
  const [isFlying, setIsFlying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [flySpeed, setFlySpeed] = useState(1)

  const flyAnimationRef = useRef(null)
  const flyIndexRef = useRef(0)
  const isPausedRef = useRef(false)
  const flySpeedRef = useRef(1)

  // Sync refs with state (for animation loop access)
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  useEffect(() => {
    flySpeedRef.current = flySpeed
  }, [flySpeed])

  // Stop fly-through and reset
  const stop = useCallback(() => {
    if (flyAnimationRef.current) {
      cancelAnimationFrame(flyAnimationRef.current)
      flyAnimationRef.current = null
    }
    setIsFlying(false)
    setIsPaused(false)
    isPausedRef.current = false
    flyIndexRef.current = 0

    // Fit bounds to show full route
    if (mapRef?.current && routeData?.coordinates) {
      setTimeout(() => {
        if (!mapRef.current) return
        const bounds = routeData.coordinates.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
        )
        mapRef.current.fitBounds(bounds, {
          padding: { top: 120, bottom: 160, left: 40, right: 40 },
          duration: 1000,
          pitch: 0,
          bearing: 0
        })
      }, 100)
    }
  }, [mapRef, routeData])

  // Start the animation loop
  const startAnimation = useCallback(() => {
    if (!mapRef?.current || !routeData?.coordinates) return
    const coords = routeData.coordinates

    let lastTime = 0

    const animate = (timestamp) => {
      // Check if we've reached the end
      if (flyIndexRef.current >= coords.length - 1) {
        stop()
        return
      }

      // If paused, keep the animation frame alive but don't advance
      if (isPausedRef.current) {
        flyAnimationRef.current = requestAnimationFrame(animate)
        return
      }

      // Frame rate control based on speed
      const frameInterval = 80 / flySpeedRef.current
      if (timestamp - lastTime < frameInterval) {
        flyAnimationRef.current = requestAnimationFrame(animate)
        return
      }
      lastTime = timestamp

      // Get current position and look-ahead for bearing
      const current = coords[flyIndexRef.current]
      const lookAhead = Math.min(flyIndexRef.current + 15, coords.length - 1)
      const next = coords[lookAhead]

      // Animate camera
      mapRef.current?.easeTo({
        center: current,
        bearing: getBearing(current, next),
        pitch: 55,
        zoom: 15.5,
        duration: 120
      })

      // Advance position based on speed
      const step = Math.max(1, Math.ceil(flySpeedRef.current * 2))
      flyIndexRef.current += step

      flyAnimationRef.current = requestAnimationFrame(animate)
    }

    flyAnimationRef.current = requestAnimationFrame(animate)
  }, [mapRef, routeData, stop])

  // Start fly-through
  const start = useCallback(() => {
    if (!mapRef?.current || !routeData?.coordinates || isFlying) return

    setIsFlying(true)
    setIsPaused(false)
    isPausedRef.current = false
    flyIndexRef.current = 0

    // Initial camera position at route start
    mapRef.current.easeTo({
      center: routeData.coordinates[0],
      pitch: 60,
      zoom: 14,
      duration: 800
    })

    // Start animation after initial camera move
    setTimeout(() => startAnimation(), 850)
  }, [mapRef, routeData, isFlying, startAnimation])

  // Toggle pause
  const togglePause = useCallback(() => {
    if (!isFlying) return
    const newPaused = !isPaused
    setIsPaused(newPaused)
    isPausedRef.current = newPaused
  }, [isFlying, isPaused])

  // Pause
  const pause = useCallback(() => {
    if (!isFlying) return
    setIsPaused(true)
    isPausedRef.current = true
  }, [isFlying])

  // Resume
  const resume = useCallback(() => {
    if (!isFlying) return
    setIsPaused(false)
    isPausedRef.current = false
  }, [isFlying])

  // Set speed
  const setSpeed = useCallback((speed) => {
    setFlySpeed(speed)
    flySpeedRef.current = speed
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (flyAnimationRef.current) {
        cancelAnimationFrame(flyAnimationRef.current)
      }
    }
  }, [])

  return {
    isFlying,
    isPaused,
    flySpeed,
    start,
    pause,
    resume,
    togglePause,
    stop,
    setSpeed
  }
}

export default useFlythrough
