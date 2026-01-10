import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints } from '../services/routeService'

// ================================
// Route Analysis Hook
// ================================

export function useRouteAnalysis() {
  const {
    routeMode,
    isRunning,
    position,
    heading,
    routeData,
    setRouteData,
    setUpcomingCurves,
    setActiveCurve
  } = useStore()

  const allCurvesRef = useRef([])
  const lastFetchPositionRef = useRef(null)
  const isFetchingRef = useRef(false)

  // Process route and detect curves
  const processRoute = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 3) return []
    
    const curves = detectCurves(coordinates)
    console.log(`Detected ${curves.length} curves from ${coordinates.length} points`)
    allCurvesRef.current = curves
    
    return curves
  }, [])

  // Initialize route for destination mode
  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    
    if (!currentPosition) {
      console.warn('No current position for destination route')
      return false
    }

    try {
      // Geocode destination
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) {
        console.error('Could not find destination')
        return false
      }

      const destCoords = results[0].coordinates
      console.log('Destination:', results[0].name, destCoords)

      // Get route
      const route = await getRoute(currentPosition, destCoords)
      if (!route) {
        console.error('Could not get route')
        return false
      }

      console.log('Route received:', route.coordinates.length, 'points')

      // Process curves
      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        destination: results[0].name,
        distance: route.distance,
        duration: route.duration
      })

      return true
    } catch (error) {
      console.error('Error initializing destination route:', error)
      return false
    }
  }, [processRoute, setRouteData])

  // Initialize route from Google Maps import
  const initImportedRoute = useCallback(async (url) => {
    try {
      const parsed = parseGoogleMapsUrl(url)
      
      if (!parsed) {
        console.error('Could not parse Google Maps URL')
        return false
      }

      let waypoints = []

      if (parsed.coordinates) {
        waypoints = parsed.coordinates
      } else if (parsed.needsGeocoding) {
        if (parsed.origin && parsed.destination) {
          const originResults = await geocodeAddress(parsed.origin)
          const destResults = await geocodeAddress(parsed.destination)
          
          if (originResults?.length && destResults?.length) {
            waypoints = [originResults[0].coordinates, destResults[0].coordinates]
          }
        }
      }

      if (waypoints.length < 2) {
        console.error('Could not extract waypoints from URL')
        return false
      }

      const route = await getRouteWithWaypoints(waypoints)
      if (!route) {
        console.error('Could not get route')
        return false
      }

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        distance: route.distance,
        duration: route.duration,
        imported: true
      })

      return true
    } catch (error) {
      console.error('Error importing route:', error)
      return false
    }
  }, [processRoute, setRouteData])

  // Look-ahead mode: fetch road ahead
  const fetchRoadAhead = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const currentHeading = useStore.getState().heading
    
    if (!currentPosition || isFetchingRef.current) return

    if (lastFetchPositionRef.current) {
      const dist = getDistance(lastFetchPositionRef.current, currentPosition)
      if (dist < 500) return
    }

    isFetchingRef.current = true

    try {
      const route = await getRoadAhead(currentPosition, currentHeading || 0, 2000)
      if (route) {
        const curves = processRoute(route.coordinates)
        setRouteData({
          coordinates: route.coordinates,
          curves,
          lookahead: true
        })
        lastFetchPositionRef.current = currentPosition
      }
    } catch (error) {
      console.error('Look-ahead fetch error:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [processRoute, setRouteData])

  // Update upcoming curves based on position
  useEffect(() => {
    if (!isRunning || !position || allCurvesRef.current.length === 0) return

    const upcoming = getUpcomingCurves(
      allCurvesRef.current,
      position,
      heading || 0,
      1000
    )

    setUpcomingCurves(upcoming)

    if (upcoming.length > 0 && upcoming[0].distance < 300) {
      setActiveCurve(upcoming[0])
    } else {
      setActiveCurve(null)
    }
  }, [position, heading, isRunning, setUpcomingCurves, setActiveCurve])

  // Look-ahead mode: periodically fetch
  useEffect(() => {
    if (routeMode !== 'lookahead' || !isRunning) return

    fetchRoadAhead()
    const interval = setInterval(fetchRoadAhead, 10000)
    return () => clearInterval(interval)
  }, [routeMode, isRunning, fetchRoadAhead])

  // Sync curves when routeData changes
  useEffect(() => {
    if (routeData?.curves) {
      allCurvesRef.current = routeData.curves
    }
  }, [routeData])

  return {
    initDestinationRoute,
    initImportedRoute,
    fetchRoadAhead,
    processRoute
  }
}

// Helper
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

export default useRouteAnalysis
