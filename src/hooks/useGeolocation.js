import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Real GPS Hook
// ================================

export function useGeolocation() {
  const {
    isRunning,
    routeMode,
    setPosition,
    setHeading,
    setSpeed
  } = useStore()

  const watchIdRef = useRef(null)
  const lastPositionRef = useRef(null)
  const lastTimestampRef = useRef(null)

  // Calculate heading from two points
  const calculateHeading = useCallback((from, to) => {
    const dLon = (to[0] - from[0]) * Math.PI / 180
    const lat1 = from[1] * Math.PI / 180
    const lat2 = to[1] * Math.PI / 180
    
    const y = Math.sin(dLon) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
    
    let heading = Math.atan2(y, x) * 180 / Math.PI
    return (heading + 360) % 360
  }, [])

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported')
      return
    }

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, speed, accuracy } = position.coords
        const timestamp = position.timestamp
        const newPosition = [longitude, latitude]

        // Update position
        setPosition(newPosition)

        // Use device heading if available, otherwise calculate from movement
        if (heading !== null && !isNaN(heading)) {
          setHeading(heading)
        } else if (lastPositionRef.current) {
          const calculatedHeading = calculateHeading(lastPositionRef.current, newPosition)
          setHeading(calculatedHeading)
        }

        // Use device speed if available, otherwise calculate
        if (speed !== null && !isNaN(speed) && speed >= 0) {
          // Convert m/s to mph
          setSpeed(speed * 2.237)
        } else if (lastPositionRef.current && lastTimestampRef.current) {
          // Calculate speed from distance/time
          const timeDelta = (timestamp - lastTimestampRef.current) / 1000 // seconds
          if (timeDelta > 0) {
            const distance = getDistance(lastPositionRef.current, newPosition)
            const calculatedSpeed = (distance / timeDelta) * 2.237 // m/s to mph
            setSpeed(Math.min(calculatedSpeed, 150)) // Cap at 150mph for sanity
          }
        }

        // Store for next calculation
        lastPositionRef.current = newPosition
        lastTimestampRef.current = timestamp

        // Log accuracy for debugging
        if (accuracy > 30) {
          console.warn(`GPS accuracy low: ${accuracy}m`)
        }
      },
      (error) => {
        console.error('Geolocation error:', error.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    )
  }, [setPosition, setHeading, setSpeed, calculateHeading])

  // Stop watching
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    lastPositionRef.current = null
    lastTimestampRef.current = null
  }, [])

  // Auto start/stop based on running state and mode
  useEffect(() => {
    const isRealGpsMode = routeMode === 'lookahead' || routeMode === 'destination' || routeMode === 'imported'
    
    if (isRunning && isRealGpsMode) {
      startWatching()
    } else {
      stopWatching()
    }

    return () => stopWatching()
  }, [isRunning, routeMode, startWatching, stopWatching])

  return {
    startWatching,
    stopWatching
  }
}

// Helper: Calculate distance between two points in meters
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

export default useGeolocation
