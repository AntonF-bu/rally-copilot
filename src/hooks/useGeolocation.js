import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Geolocation Hook v5 - iOS Crash Fix
// Added try-catch guards and delayed initialization
// ================================

export function useGeolocation(enabled = false, onDiagnostic = null) {
  const {
    setPosition,
    setHeading,
    setSpeed,
    setAltitude,
    setGpsAccuracy,
    isRunning,
    isSimulating
  } = useStore()

  const watchIdRef = useRef(null)
  const lastGpsPositionRef = useRef(null)
  const lastGpsTimeRef = useRef(0)
  const velocityRef = useRef({ vx: 0, vy: 0, speed: 0, heading: 0 })
  const positionHistoryRef = useRef([])
  const animationFrameRef = useRef(null)
  const currentDisplayPositionRef = useRef(null)
  const mountedRef = useRef(true)

  // Round 9B: GPS update rate diagnostic
  const gpsUpdateTimesRef = useRef([])

  // Interpolate position between GPS updates based on velocity
  const interpolatePosition = useCallback(() => {
    // Safety check - don't run if unmounted or stopped
    if (!mountedRef.current || !lastGpsPositionRef.current || !isRunning) {
      return
    }

    const now = Date.now()
    const timeSinceGps = (now - lastGpsTimeRef.current) / 1000
    const velocity = velocityRef.current

    if (velocity.speed < 2.2 || timeSinceGps > 3) {
      if (mountedRef.current && isRunning) {
        animationFrameRef.current = requestAnimationFrame(interpolatePosition)
      }
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

    if (mountedRef.current && isRunning) {
      animationFrameRef.current = requestAnimationFrame(interpolatePosition)
    }
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
    // Safety check
    if (!mountedRef.current) return
    
    try {
      const { latitude, longitude, accuracy, speed: gpsSpeed, heading: gpsHeading, altitude } = position.coords
      const now = Date.now()

      // Round 9C: Log GPS update rate with min/max gap
      gpsUpdateTimesRef.current.push(now)
      if (gpsUpdateTimesRef.current.length >= 10) {
        const times = gpsUpdateTimesRef.current
        const gaps = []
        for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1])
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
        const minGap = Math.min(...gaps)
        const maxGap = Math.max(...gaps)
        const msg = `${(1000 / avgGap).toFixed(1)}Hz avg | gaps: ${minGap}ms - ${maxGap}ms`
        if (onDiagnostic) onDiagnostic('gps', msg)
        else console.log(`📡 GPS: ${msg}`)
        gpsUpdateTimesRef.current = []
      }

      // VERY LENIENT: Accept almost all GPS readings
      const maxAccuracy = 500
      
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

    } catch (e) {
      console.error('📍 Error processing GPS position:', e)
    }
  }, [setPosition, setHeading, setSpeed, setAltitude, setGpsAccuracy, updateVelocity])

  // Handle GPS errors
  const handleError = useCallback((error) => {
    console.error('📍 GPS Error:', error.message)
  }, [])

  // Start/stop GPS watching
  useEffect(() => {
    mountedRef.current = true

    // Skip real GPS when simulation is active
    if (isSimulating) {
      console.log('📍 Skipping real GPS - simulation active')
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current)
        } catch (e) {
          console.error('📍 clearWatch error:', e)
        }
        watchIdRef.current = null
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      return
    }

    if (!enabled || !isRunning) {
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current)
        } catch (e) {
          console.error('📍 clearWatch error:', e)
        }
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
      timeout: 15000  // Longer timeout for iOS
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        options
      )

      // Delay first position request slightly for iOS stability
      const initTimeout = setTimeout(() => {
        if (!mountedRef.current) return
        try {
          navigator.geolocation.getCurrentPosition(
            handlePosition,
            handleError,
            options
          )
        } catch (e) {
          console.error('📍 getCurrentPosition error:', e)
        }
      }, 100)

      // Delay interpolation start for iOS
      const interpTimeout = setTimeout(() => {
        if (mountedRef.current && isRunning && enabled) {
          animationFrameRef.current = requestAnimationFrame(interpolatePosition)
        }
      }, 500)

      return () => {
        mountedRef.current = false
        clearTimeout(initTimeout)
        clearTimeout(interpTimeout)
        
        if (watchIdRef.current !== null) {
          try {
            navigator.geolocation.clearWatch(watchIdRef.current)
          } catch (e) {
            console.error('📍 clearWatch error:', e)
          }
          watchIdRef.current = null
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
          animationFrameRef.current = null
        }
      }
    } catch (e) {
      console.error('📍 GPS initialization error:', e)
    }
  }, [enabled, isRunning, isSimulating, handlePosition, handleError, interpolatePosition])

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
