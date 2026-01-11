import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Geolocation Hook - Real GPS Tracking
// With accuracy filtering & error handling
// ================================

export function useGeolocation(enabled = false) {
  const {
    setPosition,
    setHeading,
    setSpeed,
    setGpsAccuracy,
    isRunning
  } = useStore()

  const watchIdRef = useRef(null)
  const lastPositionRef = useRef(null)
  const lastUpdateTimeRef = useRef(0)
  const positionHistoryRef = useRef([])

  // Calculate heading from position history (more stable than device heading)
  const calculateHeading = useCallback((newPos) => {
    const history = positionHistoryRef.current
    
    if (history.length < 2) return null
    
    // Use last few positions to calculate heading (smoother)
    const oldPos = history[Math.max(0, history.length - 3)]
    
    const dLng = newPos[0] - oldPos[0]
    const dLat = newPos[1] - oldPos[1]
    
    // Only calculate if we've moved enough (avoid jitter)
    const distance = Math.sqrt(dLng * dLng + dLat * dLat) * 111000 // rough meters
    if (distance < 5) return null
    
    const heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360
    return heading
  }, [])

  // Handle position update
  const handlePosition = useCallback((position) => {
    const { latitude, longitude, accuracy, speed, heading } = position.coords
    const now = Date.now()

    // *** ACCURACY FILTER ***
    // Ignore very inaccurate readings (common in urban areas, tunnels)
    if (accuracy > 50) {
      console.log(`📍 GPS update ignored - accuracy too low: ${accuracy.toFixed(0)}m`)
      return
    }

    // *** THROTTLE UPDATES ***
    // Don't update more than 4x per second
    if (now - lastUpdateTimeRef.current < 250) {
      return
    }

    const newPosition = [longitude, latitude]
    
    // *** JUMP FILTER ***
    // If position jumped too far too fast, it's probably a GPS glitch
    if (lastPositionRef.current) {
      const timeDelta = (now - lastUpdateTimeRef.current) / 1000 // seconds
      const distance = getDistance(lastPositionRef.current, newPosition)
      const impliedSpeed = distance / timeDelta // m/s
      
      // If implied speed > 200 mph (89 m/s), probably a glitch
      if (impliedSpeed > 89 && timeDelta < 5) {
        console.log(`📍 GPS jump ignored - implied ${(impliedSpeed * 2.237).toFixed(0)} mph`)
        return
      }
    }

    // Update position history (keep last 10)
    positionHistoryRef.current.push(newPosition)
    if (positionHistoryRef.current.length > 10) {
      positionHistoryRef.current.shift()
    }

    // Set position
    setPosition(newPosition)
    lastPositionRef.current = newPosition
    lastUpdateTimeRef.current = now

    // Set GPS accuracy
    setGpsAccuracy(accuracy)

    // Set speed (convert m/s to mph)
    if (speed !== null && speed >= 0) {
      const speedMph = speed * 2.237
      setSpeed(speedMph)
    }

    // Set heading (prefer calculated over device heading for stability)
    const calculatedHeading = calculateHeading(newPosition)
    if (calculatedHeading !== null) {
      setHeading(calculatedHeading)
    } else if (heading !== null && !isNaN(heading)) {
      setHeading(heading)
    }

    console.log(`📍 GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} | ±${accuracy.toFixed(0)}m | ${(speed * 2.237).toFixed(0)} mph`)

  }, [setPosition, setHeading, setSpeed, setGpsAccuracy, calculateHeading])

  // Handle errors
  const handleError = useCallback((error) => {
    console.error('📍 GPS Error:', error.message)
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        console.error('📍 Location permission denied')
        // Could show UI notification here
        break
      case error.POSITION_UNAVAILABLE:
        console.error('📍 Location unavailable (tunnel? airplane mode?)')
        break
      case error.TIMEOUT:
        console.error('📍 Location request timed out')
        break
    }
  }, [])

  // Start/stop watching
  useEffect(() => {
    if (!enabled || !isRunning) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        console.log('📍 GPS tracking stopped')
      }
      return
    }

    if (!navigator.geolocation) {
      console.error('📍 Geolocation not supported')
      return
    }

    console.log('📍 Starting GPS tracking...')

    // High accuracy options
    const options = {
      enableHighAccuracy: true,
      maximumAge: 1000,        // Accept cached position up to 1s old
      timeout: 10000           // Wait up to 10s for position
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    )

    // Also get immediate position
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      options
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
        console.log('📍 GPS tracking stopped')
      }
    }
  }, [enabled, isRunning, handlePosition, handleError])

  // Clear history on stop
  useEffect(() => {
    if (!isRunning) {
      positionHistoryRef.current = []
      lastPositionRef.current = null
      lastUpdateTimeRef.current = 0
    }
  }, [isRunning])

  return null
}

// Helper: Calculate distance between two coordinates in meters
function getDistance(pos1, pos2) {
  const R = 6371e3 // Earth radius in meters
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
