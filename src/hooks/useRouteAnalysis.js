import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints } from '../services/routeService'

// ================================
// Route Analysis Hook
// Manages route fetching and curve detection
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
    console.log(`Detected ${curves.length} curves`)
    allCurvesRef.current = curves
    
    return curves
  }, [])

  // Initialize route for destination mode
  const initDestinationRoute = useCallback(async (destination) => {
    if (!position) {
      console.warn('No current position for destination route')
      return false
    }

    try {
      // Geocode destination
      const results = await geocodeAddress(destination)
      if (!results || results.length === 0) {
        console.error('Could not find destination')
        return false
      }

      const destCoords = results[0].coordinates

      // Get route
      const route = await getRoute(position, destCoords)
      if (!route) {
        console.error('Could not get route')
        return false
      }

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
  }, [position, processRoute, setRouteData])

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
        // Need to geocode origin/destination
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

      // Get route
      const route = await getRouteWithWaypoints(waypoints)
      if (!route) {
        console.error('Could not get route')
        return false
      }

      // Process curves
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

  // Look-ahead mode: fetch road ahead periodically
  const fetchRoadAhead = useCallback(async () => {
    if (!position || !heading || isFetchingRef.current) return

    // Check if we've moved enough to warrant a new fetch (500m)
    if (lastFetchPositionRef.current) {
      const dist = getDistance(lastFetchPositionRef.current, position)
      if (dist < 500) return
    }

    isFetchingRef.current = true

    try {
      const route = await getRoadAhead(position, heading, 2000)
      if (route) {
        const curves = processRoute(route.coordinates)
        setRouteData({
          coordinates: route.coordinates,
          curves,
          lookahead: true
        })
        lastFetchPositionRef.current = position
      }
    } catch (error) {
      console.error('Look-ahead fetch error:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [position, heading, processRoute, setRouteData])

  // Update upcoming curves based on position
  useEffect(() => {
    if (!isRunning || !position || allCurvesRef.current.length === 0) return

    const upcoming = getUpcomingCurves(
      allCurvesRef.current,
      position,
      heading,
      1000
    )

    setUpcomingCurves(upcoming)

    // Set active curve if close enough
    if (upcoming.length > 0 && upcoming[0].distance < 300) {
      setActiveCurve(upcoming[0])
    } else {
      setActiveCurve(null)
    }
  }, [position, heading, isRunning, setUpcomingCurves, setActiveCurve])

  // Look-ahead mode: periodically fetch road ahead
  useEffect(() => {
    if (routeMode !== 'lookahead' || !isRunning) return

    // Initial fetch
    fetchRoadAhead()

    // Periodic fetch every 10 seconds
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
