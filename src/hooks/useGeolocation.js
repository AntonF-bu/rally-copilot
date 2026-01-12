import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Geolocation Hook v3 - More Lenient Accuracy
// FIXED: Accuracy thresholds were too strict
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
    const timeSinceGps = (now - lastGpsTimeRef.current) / 1000 // seconds
    const velocity = velocityRef.current

    // Don't interpolate if:
    // 1. No velocity data
    // 2. Speed too low (< 5 mph = 2.2 m/s) - GPS jitter would be worse than interpolation
    // 3. Too long since last GPS (> 3 seconds) - might be stale
    if (velocity.speed < 2.2 || timeSinceGps > 3) {
      animationFrameRef.current = requestAnimationFrame(interpolatePosition)
      return
    }

    // Project position forward based on velocity
    // Use shorter projection at higher speeds for more frequent visual updates
    const maxProjectionTime = velocity.speed > 20 ? 0.3 : 0.5 // seconds
    const projectionTime = Math.min(timeSinceGps, maxProjectionTime)

    const lastPos = lastGpsPositionRef.current
    
    // Convert velocity (m/s) to coordinate delta
    // 1 degree lat ≈ 111,000m, 1 degree lng ≈ 111,000m * cos(lat)
    const latFactor = 1 / 111000
    const lngFactor = 1 / (111000 * Math.cos(lastPos[1] * Math.PI / 180))

    const projectedLng = lastPos[0] + velocity.vx * projectionTime * lngFactor
    const projectedLat = lastPos[1] + velocity.vy * projectionTime * latFactor

    const projectedPosition = [projectedLng, projectedLat]

    // Smooth blend with current display position (if exists)
    if (currentDisplayPositionRef.current) {
      const blendFactor = 0.3 // How much to blend toward projected (0-1)
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

    // Use positions from ~1 second ago for stable velocity calculation
    let oldEntry = history[0]
    for (let i = history.length - 1; i >= 0; i--) {
      if (timestamp - history[i].time >= 800) { // ~0.8 seconds
        oldEntry = history[i]
        break
      }
    }

    const timeDelta = (timestamp - oldEntry.time) / 1000 // seconds
    if (timeDelta < 0.1) return // Too short to calculate

    const dLng = newPosition[0] - oldEntry.pos[0]
    const dLat = newPosition[1] - oldEntry.pos[1]

    // Convert to meters
    const latFactor = 111000
    const lngFactor = 111000 * Math.cos(newPosition[1] * Math.PI / 180)
    
    const dx = dLng * lngFactor // meters east
    const dy = dLat * latFactor // meters north

    const vx = dx / timeDelta // m/s east
    const vy = dy / timeDelta // m/s north
    const speed = Math.sqrt(vx * vx + vy * vy) // m/s

    // Calculate heading from velocity (more stable than instantaneous)
    let heading = Math.atan2(dx, dy) * 180 / Math.PI
    if (heading < 0) heading += 360

    // Only update if we're actually moving
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
    // FIXED: More lenient accuracy thresholds
    // Mobile GPS can have 50-100m accuracy, especially at start
    // ================================================================
    const currentSpeed = velocityRef.current.speed * 2.237 // to mph
    
    // Much more lenient thresholds:
    // - At rest (0 mph): accept up to 100m accuracy
    // - Slow (< 20 mph): accept up to 80m accuracy  
    // - Medium (20-40 mph): accept up to 60m accuracy
    // - Fast (> 40 mph): accept up to 40m accuracy (need better precision at speed)
    let maxAccuracy
    if (currentSpeed < 5) {
      maxAccuracy = 100 // Very lenient when starting/stopped
    } else if (currentSpeed < 20) {
      maxAccuracy = 80
    } else if (currentSpeed < 40) {
      maxAccuracy = 60
    } else {
      maxAccuracy = 40
    }
    
    if (accuracy > maxAccuracy) {
      console.log(`📍 GPS ignored - accuracy ${accuracy.toFixed(0)}m > ${maxAccuracy}m threshold at ${currentSpeed.toFixed(0)}mph`)
      return
    }

    const newPosition = [longitude, latitude]

    // Jump filter - reject positions that imply impossible speed
    if (lastGpsPositionRef.current) {
      const timeDelta = (now - lastGpsTimeRef.current) / 1000
      const distance = getDistance(lastGpsPositionRef.current, newPosition)
      const impliedSpeed = distance / timeDelta // m/s

      // Max realistic speed ~120 mph = ~54 m/s
      if (impliedSpeed > 54 && timeDelta < 5) {
        console.log(`📍 GPS jump rejected - implied ${(impliedSpeed * 2.237).toFixed(0)}mph`)
        return
      }
    }

    // Update position history (keep last 2 seconds worth at ~4Hz = 8 entries)
    positionHistoryRef.current.push({ pos: newPosition, time: now })
    if (positionHistoryRef.current.length > 10) {
      positionHistoryRef.current.shift()
    }

    // Update velocity calculation
    updateVelocity(newPosition, now)

    // Store GPS reference
    lastGpsPositionRef.current = newPosition
    lastGpsTimeRef.current = now

    // Snap display position to GPS (will be smoothed by interpolation)
    currentDisplayPositionRef.current = newPosition
    setPosition(newPosition)

    // Set GPS accuracy
    setGpsAccuracy(accuracy)

    // Set altitude
    if (altitude !== null && !isNaN(altitude)) {
      setAltitude(altitude)
    }

    // Use GPS speed if available and reliable, otherwise use calculated
    if (gpsSpeed !== null && gpsSpeed >= 0) {
      const speedMph = gpsSpeed * 2.237
      setSpeed(speedMph)
      
      // Update velocity speed from GPS (more accurate)
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

  // Start/stop GPS watching and interpolation
  useEffect(() => {
    if (!enabled || !isRunning) {
      // Stop GPS watch
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      // Stop interpolation
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
      maximumAge: 0, // Always get fresh position
      timeout: 10000
    }

    // Start GPS watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    )

    // Get immediate position
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      handleError,
      options
    )

    // Start interpolation loop
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
