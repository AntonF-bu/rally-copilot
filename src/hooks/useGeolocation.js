import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Geolocation Hook v4 - VERY Lenient Accuracy
// FIXED: Accept GPS even with poor accuracy to keep app working
// ================================

export function useGeolocation(enabled = false) {
  const {
    setPosition,
    setHeading,
    setSpeed,
    setAltitude,
    setGpsAccuracy,
    isRunning
  } = useStore()

  const watchIdRef = useRef(null)
  const lastGpsPositionRef = useRef(null)
  const lastGpsTimeRef = useRef(0)
  const velocityRef = useRef({ vx: 0, vy: 0, speed: 0, heading: 0 })
  const positionHistoryRef = useRef([])
  const animationFrameRef = useRef(null)
  const currentDisplayPositionRef = useRef(null)

  // Interpolate position between GPS updates based on velocity
  const interpolatePosition = useCallback(() => {
    if (!lastGpsPositionRef.current || !isRunning) return

    const now = Date.now()
    const timeSinceGps = (now - lastGpsTimeRef.current) / 1000
    const velocity = velocityRef.current

    if (velocity.speed < 2.2 || timeSinceGps > 3) {
      animationFrameRef.current = requestAnimationFrame(interpolatePosition)
      return
    }

    const maxProjectionTime = velocity.speed > 20 ? 0.3 : 0.5
    const projectionTime = Math.min(timeSinceGps, maxProjectionTime)

    const lastPos = lastGpsPositionRef.current
    
    const latFactor = 1 / 111000
    const lngFactor = 1 / (111000 * Math.cos(lastPos[1] * Math.PI / 180))

    const projectedLng = lastPos[0] + velocity.vx * projectionTime * lngFactor
    const projectedLat = lastPos[1] + velocity.vy * projectionTime * latFactor

    const projectedPosition = [projectedLng, projectedLat]

    if (currentDisplayPositionRef.current) {
      const blendFactor = 0.3
      const blendedPosition = [
        currentDisplayPositionRef.current[0] + (projectedPosition[0] - currentDisplayPositionRef.current[0]) * blendFactor,
        currentDisplayPositionRef.current[1] + (projectedPosition[1] - currentDisplayPositionRef.current[1]) * blendFactor
      ]
      currentDisplayPositionRef.current = blendedPosition
      setPosition(blendedPosition)
    } else {
      currentDisplayPositionRef.current = projectedPosition
      setPosition(projectedPosition)
    }

    animationFrameRef.current = requestAnimationFrame(interpolatePosition)
  }, [setPosition, isRunning])

  // Calculate velocity from position history
  const updateVelocity = useCallback((newPosition, timestamp) => {
    const history = positionHistoryRef.current

    if (history.length < 2) {
      velocityRef.current = { vx: 0, vy: 0, speed: 0, heading: 0 }
      return
    }

    let oldEntry = history[0]
    for (let i = history.length - 1; i >= 0; i--) {
      if (timestamp - history[i].time >= 800) {
        oldEntry = history[i]
        break
      }
    }

    const timeDelta = (timestamp - oldEntry.time) / 1000
    if (timeDelta < 0.1) return

    const dLng = newPosition[0] - oldEntry.pos[0]
    const dLat = newPosition[1] - oldEntry.pos[1]

    const latFactor = 111000
    const lngFactor = 111000 * Math.cos(newPosition[1] * Math.PI / 180)
    
    const dx = dLng * lngFactor
    const dy = dLat * latFactor

    const vx = dx / timeDelta
    const vy = dy / timeDelta
    const speed = Math.sqrt(vx * vx + vy * vy)

    let heading = Math.atan2(dx, dy) * 180 / Math.PI
    if (heading < 0) heading += 360

    if (speed > 1) {
      velocityRef.current = { vx, vy, speed, heading }
      setHeading(heading)
    }
  }, [setHeading])

  // Handle new GPS position
  const handlePosition = useCallback((position) => {
    const { latitude, longitude, accuracy, speed: gpsSpeed, heading: gpsHeading, altitude } = position.coords
    const now = Date.now()

    // ================================================================
    // VERY LENIENT: Accept almost all GPS readings
    // Only reject truly terrible accuracy (>500m)
    // ================================================================
    const maxAccuracy = 500 // Accept up to 500m accuracy
    
    if (accuracy > maxAccuracy) {
      console.log(`📍 GPS ignored - accuracy ${accuracy.toFixed(0)}m > ${maxAccuracy}m (very poor)`)
      return
    }

    const newPosition = [longitude, latitude]

    // Jump filter - reject positions that imply impossible speed
    if (lastGpsPositionRef.current) {
      const timeDelta = (now - lastGpsTimeRef.current) / 1000
      const distance = getDistance(lastGpsPositionRef.current, newPosition)
      const impliedSpeed = distance / timeDelta

      // Max realistic speed ~150 mph = ~67 m/s (be lenient)
      if (impliedSpeed > 67 && timeDelta < 5) {
        console.log(`📍 GPS jump rejected - implied ${(impliedSpeed * 2.237).toFixed(0)}mph`)
        return
      }
    }

    // Update position history
    positionHistoryRef.current.push({ pos: newPosition, time: now })
    if (positionHistoryRef.current.length > 10) {
      positionHistoryRef.current.shift()
    }

    // Update velocity calculation
    updateVelocity(newPosition, now)

    // Store GPS reference
    lastGpsPositionRef.current = newPosition
    lastGpsTimeRef.current = now

    // Update display position
    currentDisplayPositionRef.current = newPosition
    setPosition(newPosition)

    // Set GPS accuracy
    setGpsAccuracy(accuracy)

    // Set altitude
    if (altitude !== null && !isNaN(altitude)) {
      setAltitude(altitude)
    }

    // Use GPS speed if available
    if (gpsSpeed !== null && gpsSpeed >= 0) {
      const speedMph = gpsSpeed * 2.237
      setSpeed(speedMph)
      
      if (gpsSpeed > 1) {
        velocityRef.current.speed = gpsSpeed
      }
    } else {
      setSpeed(velocityRef.current.speed * 2.237)
    }

    // Use GPS heading if available and moving
    if (gpsHeading !== null && !isNaN(gpsHeading) && gpsSpeed > 2) {
      setHeading(gpsHeading)
      velocityRef.current.heading = gpsHeading
    }

    console.log(`📍 GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} | ±${accuracy.toFixed(0)}m | ${(velocityRef.current.speed * 2.237).toFixed(0)}mph`)

  }, [setPosition, setHeading, setSpeed, setAltitude, setGpsAccuracy, updateVelocity])

  // Handle GPS errors
  const handleError = useCallback((error) => {
    console.error('📍 GPS Error:', error.message)
  }, [])

  // Start/stop GPS watching
  useEffect(() => {
    if (!enabled || !isRunning) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      console.error('📍 Geolocation not supported')
      return
    }

    console.log('📍 Starting GPS tracking with interpolation...')

    const options = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    )

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      options
    )

    animationFrameRef.current = requestAnimationFrame(interpolatePosition)

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [enabled, isRunning, handlePosition, handleError, interpolatePosition])

  // Reset on stop
  useEffect(() => {
    if (!isRunning) {
      positionHistoryRef.current = []
      lastGpsPositionRef.current = null
      lastGpsTimeRef.current = 0
      currentDisplayPositionRef.current = null
      velocityRef.current = { vx: 0, vy: 0, speed: 0, heading: 0 }
    }
  }, [isRunning])

  return null
}

// Helper: Calculate distance between two coordinates in meters
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
