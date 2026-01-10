import { useCallback, useEffect, useRef } from 'react'
import useStore from '../store'

// ================================
// Geolocation Hook
// ================================

export function useGeolocation() {
  const { 
    setPosition, 
    setHeading, 
    setSpeed,
    isRunning 
  } = useStore()
  
  const watchIdRef = useRef(null)

  // Start watching position
  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      console.error('Geolocation not supported')
      return false
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, speed, accuracy } = position.coords
        
        setPosition([longitude, latitude])
        
        if (heading !== null && !isNaN(heading)) {
          setHeading(heading)
        }
        
        if (speed !== null && !isNaN(speed)) {
          // Convert m/s to mph
          setSpeed(speed * 2.237)
        }
      },
      (error) => {
        console.error('Geolocation error:', error)
      },
      options
    )

    return true
  }, [setPosition, setHeading, setSpeed])

  // Stop watching
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // Get current position once
  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Geolocation not supported'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          resolve([longitude, latitude])
        },
        reject,
        { enableHighAccuracy: true }
      )
    })
  }, [])

  // Auto-track when running
  useEffect(() => {
    if (isRunning) {
      startTracking()
    } else {
      stopTracking()
    }

    return () => stopTracking()
  }, [isRunning, startTracking, stopTracking])

  return {
    startTracking,
    stopTracking,
    getCurrentPosition
  }
}

export default useGeolocation
