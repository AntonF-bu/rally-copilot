import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'

/**
 * Hook to fetch and manage elevation data for a route
 * @param {Object} routeData - Route with coordinates and distance
 * @param {Object} settings - App settings (for units)
 * @returns {Object} { elevationData, elevationGain, isLoading, reset }
 */
export function useElevation(routeData, settings) {
  const [elevationData, setElevationData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const fetchedRef = useRef(false)

  // Fetch elevation data from Mapbox
  const fetchElevationData = useCallback(async (coordinates) => {
    if (!coordinates?.length || coordinates.length < 2 || fetchedRef.current) return
    fetchedRef.current = true
    setIsLoading(true)

    try {
      // Sample points along the route (max 40 for performance)
      const numSamples = Math.min(40, coordinates.length)
      const step = Math.max(1, Math.floor(coordinates.length / numSamples))
      const samplePoints = []

      for (let i = 0; i < coordinates.length; i += step) {
        samplePoints.push(coordinates[i])
      }

      // Ensure we include the last point
      if (samplePoints[samplePoints.length - 1] !== coordinates[coordinates.length - 1]) {
        samplePoints.push(coordinates[coordinates.length - 1])
      }

      const totalDistance = routeData?.distance || 15000

      // Fetch elevation for each sample point
      const elevations = await Promise.all(
        samplePoints.map(async (coord, idx) => {
          try {
            const response = await fetch(
              `https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${coord[0]},${coord[1]}.json?layers=contour&access_token=${mapboxgl.accessToken}`
            )
            const data = await response.json()
            let elevation = 0

            if (data.features?.length > 0) {
              const contours = data.features.filter(f => f.properties?.ele !== undefined)
              if (contours.length > 0) {
                elevation = Math.max(...contours.map(f => f.properties.ele))
              }
            }

            return {
              coord,
              elevation,
              distance: (idx / (samplePoints.length - 1)) * totalDistance
            }
          } catch {
            return {
              coord,
              elevation: 0,
              distance: (idx / (samplePoints.length - 1)) * totalDistance
            }
          }
        })
      )

      // Smooth the elevation data (3-point moving average)
      const smoothed = elevations.map((point, i) => {
        if (i === 0 || i === elevations.length - 1) return point
        return {
          ...point,
          elevation: (elevations[i - 1].elevation + point.elevation + elevations[i + 1].elevation) / 3
        }
      })

      setElevationData(smoothed)
    } catch (err) {
      console.error('Elevation error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [routeData?.distance])

  // Fetch elevation when route coordinates change
  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && !fetchedRef.current) {
      fetchElevationData(routeData.coordinates)
    }
  }, [routeData?.coordinates, fetchElevationData])

  // Calculate total elevation gain
  const elevationGain = useMemo(() => {
    if (!elevationData.length) return 0

    let gain = 0
    for (let i = 1; i < elevationData.length; i++) {
      const diff = elevationData[i].elevation - elevationData[i - 1].elevation
      if (diff > 0) gain += diff
    }

    // Convert to feet if imperial
    return Math.round(settings?.units === 'metric' ? gain : gain * 3.28084)
  }, [elevationData, settings?.units])

  // Reset function for when route changes
  const reset = useCallback(() => {
    fetchedRef.current = false
    setElevationData([])
  }, [])

  return {
    elevationData,
    elevationGain,
    isLoading,
    reset
  }
}

export default useElevation
