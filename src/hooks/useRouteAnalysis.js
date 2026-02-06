import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { getRoute, geocodeAddress } from '../services/routeService'

// ================================
// Route Analysis Hook - v6
// NOW INCLUDES: legs in routeData for road ref extraction
// ================================

export function useRouteAnalysis() {
  const {
    routeMode,
    isRunning,
    position,
    routeData,
    routeZones,
    setUpcomingCurves,
    setActiveCurve,
    setDestination,
    setRouteData,
  } = useStore()

  const lastCurveUpdateRef = useRef(0)
  const lastDistanceAlongRef = useRef(0)

  // ================================================================
  // HELPER: Check if curve is in a transit zone (skip callouts)
  // ================================================================
  const isInTransitZone = useCallback((distance) => {
    if (!routeZones?.length) return false
    return routeZones.some(zone =>
      zone.character === 'transit' &&
      distance >= zone.startDistance &&
      distance <= zone.endDistance
    )
  }, [routeZones])

  // ================================================================
  // HELPER: Calculate total route distance
  // ================================================================
  const calculateRouteDistance = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 2) return 0
    
    let total = 0
    for (let i = 1; i < coordinates.length; i++) {
      const [lon1, lat1] = coordinates[i - 1]
      const [lon2, lat2] = coordinates[i]
      
      // Haversine formula
      const R = 6371e3 // Earth's radius in meters
      const φ1 = lat1 * Math.PI / 180
      const φ2 = lat2 * Math.PI / 180
      const Δφ = (lat2 - lat1) * Math.PI / 180
      const Δλ = (lon2 - lon1) * Math.PI / 180

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

      total += R * c
    }
    
    return total
  }, [])

  // ================================================================
  // REROUTE - Gets new route with legs
  // ================================================================
  const reroute = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const dest = useStore.getState().destination
    
    if (!currentPosition || !dest) {
      console.warn('Reroute: Missing position or destination')
      return false
    }

    console.log('🔄 Rerouting from current position to:', dest.name)

    try {
      const route = await getRoute(currentPosition, dest.coordinates)
      if (!route?.coordinates) {
        console.error('Reroute: Failed to get route')
        return false
      }

      // Update with new route data INCLUDING legs
      setRouteData(prev => ({
        ...prev,
        coordinates: route.coordinates,
        distance: route.distance,
        duration: route.duration,
        legs: route.legs,  // NEW: Include legs for road ref extraction
        rerouted: true,
        reroutedAt: Date.now()
      }))

      console.log('✅ Reroute complete')
      return true
    } catch (error) {
      console.error('Reroute error:', error)
      return false
    }
  }, [setRouteData])

  // ================================================================
  // INIT DESTINATION ROUTE - For setting up a new destination
  // NOW INCLUDES: legs in routeData
  // ================================================================
  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    if (!currentPosition) {
      console.warn('initDestinationRoute: No current position')
      return false
    }

    try {
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) {
        console.error('Geocoding failed for:', destinationQuery)
        return false
      }

      const destCoords = results[0].coordinates
      const destName = results[0].name

      setDestination({ coordinates: destCoords, name: destName })

      const route = await getRoute(currentPosition, destCoords)
      if (!route?.coordinates) return false

      // Calculate distance if not provided
      const distance = route.distance || calculateRouteDistance(route.coordinates)

      setRouteData({
        coordinates: route.coordinates,
        curves: [], // Preview will detect these
        destination: destName,
        distance: distance,
        duration: route.duration,
        name: `Route to ${destName}`,
        legs: route.legs,  // NEW: Include legs for road ref extraction
      })

      console.log(`📍 Route initialized: ${destName}, ${(distance/1609.34).toFixed(1)}mi, ${route.legs?.length || 0} leg(s)`)

      return true
    } catch (error) {
      console.error('initDestinationRoute error:', error)
      return false
    }
  }, [setRouteData, setDestination, calculateRouteDistance])

  // ================================================================
  // INIT MULTI-STOP ROUTE - For routes with multiple waypoints
  // NOW INCLUDES: legs in routeData
  // ================================================================
  const initMultiStopRoute = useCallback(async (waypointCoords) => {
    if (!waypointCoords || waypointCoords.length < 2) {
      console.warn('initMultiStopRoute: Need at least 2 waypoints')
      return false
    }

    try {
      // Import getRouteWithWaypoints dynamically to avoid circular deps
      const { getRouteWithWaypoints } = await import('../services/routeService')

      const route = await getRouteWithWaypoints(waypointCoords)
      if (!route?.coordinates) {
        console.error('Failed to get multi-stop route')
        return false
      }

      // Calculate distance if not provided
      const distance = route.distance || calculateRouteDistance(route.coordinates)

      setRouteData({
        coordinates: route.coordinates,
        curves: [], // Preview will detect these
        distance: distance,
        duration: route.duration,
        name: `Trip with ${waypointCoords.length} stops`,
        isMultiStop: true,
        waypointCount: waypointCoords.length,
        legs: route.legs,  // NEW: Include legs for road ref extraction
      })

      console.log(`📍 Multi-stop route initialized: ${waypointCoords.length} stops, ${(distance/1609.34).toFixed(1)}mi, ${route.legs?.length || 0} leg(s)`)

      return true
    } catch (error) {
      console.error('initMultiStopRoute error:', error)
      return false
    }
  }, [setRouteData, calculateRouteDistance])

  // ================================================================
  // INIT ROUTE FROM COORDINATES - For discovery routes with known coords
  // Takes start/end coordinates directly, no geocoding needed
  // ================================================================
  const initRouteFromCoordinates = useCallback(async (startCoords, endCoords, waypoints, routeName) => {
    try {
      // Build waypoint array: [start, ...waypoints, end]
      const allPoints = [startCoords]
      if (waypoints?.length) {
        allPoints.push(...waypoints.map(wp => [wp.lng, wp.lat]))
      }
      allPoints.push(endCoords)

      let route
      if (allPoints.length > 2) {
        const { getRouteWithWaypoints } = await import('../services/routeService')
        route = await getRouteWithWaypoints(allPoints)
      } else {
        route = await getRoute(startCoords, endCoords)
      }

      if (!route?.coordinates) return false

      const distance = route.distance || calculateRouteDistance(route.coordinates)

      setDestination({ coordinates: endCoords, name: routeName })
      setRouteData({
        coordinates: route.coordinates,
        curves: [],
        destination: routeName,
        distance: distance,
        duration: route.duration,
        name: `Route to ${routeName}`,
        legs: route.legs,
      })

      console.log(`📍 Route from coords initialized: ${routeName}, ${(distance/1609.34).toFixed(1)}mi`)
      return true
    } catch (error) {
      console.error('initRouteFromCoordinates error:', error)
      return false
    }
  }, [setRouteData, setDestination, calculateRouteDistance])

  // ================================================================
  // INIT IMPORTED ROUTE - For routes from Google Maps URLs
  // NOW INCLUDES: legs in routeData
  // ================================================================
  const initImportedRoute = useCallback(async (url) => {
    try {
      const { parseGoogleMapsUrl, getRoute: fetchRoute, getRouteWithWaypoints, geocodeAddress: geocode } = await import('../services/routeService')
      
      const parsed = parseGoogleMapsUrl(url)
      if (!parsed) {
        console.error('Could not parse URL')
        return false
      }

      let route = null
      let routeName = 'Imported Route'

      // Handle different parsing results
      if (parsed.coordinates && parsed.coordinates.length >= 2) {
        // Direct coordinates - fetch route
        if (parsed.coordinates.length === 2) {
          route = await fetchRoute(parsed.coordinates[0], parsed.coordinates[1])
        } else {
          route = await getRouteWithWaypoints(parsed.coordinates)
        }
      } else if (parsed.needsGeocoding) {
        // Need to geocode addresses
        let startCoords = parsed.originCoordinates
        let endCoords = parsed.destinationCoordinates

        if (!startCoords && parsed.origin) {
          const results = await geocode(parsed.origin)
          if (results?.length > 0) startCoords = results[0].coordinates
        }

        if (!endCoords && parsed.destination) {
          const results = await geocode(parsed.destination)
          if (results?.length > 0) {
            endCoords = results[0].coordinates
            routeName = `Route to ${results[0].name}`
          }
        }

        if (startCoords && endCoords) {
          route = await fetchRoute(startCoords, endCoords)
        }
      }

      if (!route?.coordinates) {
        console.error('Failed to get route from parsed URL')
        return false
      }

      const distance = route.distance || calculateRouteDistance(route.coordinates)

      setRouteData({
        coordinates: route.coordinates,
        curves: [], // Preview will detect these
        distance: distance,
        duration: route.duration,
        name: routeName,
        isImported: true,
        legs: route.legs,  // NEW: Include legs for road ref extraction
      })

      console.log(`📍 Imported route initialized: ${(distance/1609.34).toFixed(1)}mi, ${route.legs?.length || 0} leg(s)`)

      return true
    } catch (error) {
      console.error('initImportedRoute error:', error)
      return false
    }
  }, [setRouteData, calculateRouteDistance])

  // ================================================================
  // IMPORT FROM URL - Alias for compatibility
  // ================================================================
  const importRouteFromUrl = initImportedRoute

  // ================================================================
  // FETCH ROAD AHEAD - Stub for compatibility
  // ================================================================
  const fetchRoadAhead = useCallback(async () => {
    console.log('fetchRoadAhead called - use Preview instead')
    return false
  }, [])

  // ================================================================
  // MAIN EFFECT: Update upcoming curves based on GPS position
  // Uses routeData.curves from store (set by Preview)
  // ================================================================
  useEffect(() => {
    if (!isRunning || !position) return
    if (!routeData?.curves?.length || !routeData?.coordinates?.length) return
    if (routeMode === 'lookahead') return

    const now = Date.now()
    if (now - lastCurveUpdateRef.current < 500) return // Throttle to 2Hz
    lastCurveUpdateRef.current = now

    // Find user's position along route
    const distanceAlong = findDistanceAlongRoute(position, routeData.coordinates)
    
    // Only update if moved significantly
    if (Math.abs(distanceAlong - lastDistanceAlongRef.current) < 10) return
    lastDistanceAlongRef.current = distanceAlong

    // Get curves ahead of current position
    const curvesAhead = routeData.curves
      .filter(curve => {
        const curveDistance = curve.distanceFromStart || 0
        const distanceToGo = curveDistance - distanceAlong
        // Only curves 50m to 2000m ahead
        return distanceToGo > 50 && distanceToGo < 2000
      })
      .filter(curve => {
        // Skip curves in transit zones (unless they're significant)
        const curveDistance = curve.distanceFromStart || 0
        if (isInTransitZone(curveDistance) && curve.severity < 4) {
          return false
        }
        return true
      })
      .sort((a, b) => (a.distanceFromStart || 0) - (b.distanceFromStart || 0))
      .slice(0, 5) // Max 5 upcoming curves

    setUpcomingCurves(curvesAhead)

    // Set active curve (closest one)
    if (curvesAhead.length > 0) {
      const closest = curvesAhead[0]
      const distanceToCurve = (closest.distanceFromStart || 0) - distanceAlong
      if (distanceToCurve < 500) {
        setActiveCurve({ ...closest, distanceTo: distanceToCurve })
      } else {
        setActiveCurve(null)
      }
    } else {
      setActiveCurve(null)
    }
  }, [isRunning, position, routeData, routeMode, routeZones, isInTransitZone, setUpcomingCurves, setActiveCurve])

  return {
    initDestinationRoute,
    initMultiStopRoute,
    initRouteFromCoordinates,
    initImportedRoute,
    importRouteFromUrl,
    fetchRoadAhead,
    reroute,
  }
}

// ================================================================
// HELPER: Find distance along route for a given position
// ================================================================
function findDistanceAlongRoute(position, coordinates) {
  if (!position || !coordinates?.length) return 0

  const [userLng, userLat] = [position[0], position[1]]
  
  let minDist = Infinity
  let closestIndex = 0
  
  // Find closest point on route
  for (let i = 0; i < coordinates.length; i++) {
    const [lng, lat] = coordinates[i]
    const dist = Math.sqrt(
      Math.pow((lng - userLng) * 111000 * Math.cos(userLat * Math.PI / 180), 2) +
      Math.pow((lat - userLat) * 111000, 2)
    )
    if (dist < minDist) {
      minDist = dist
      closestIndex = i
    }
  }
  
  // Calculate distance from start to closest point
  let distance = 0
  for (let i = 1; i <= closestIndex; i++) {
    const [lng1, lat1] = coordinates[i - 1]
    const [lng2, lat2] = coordinates[i]
    distance += Math.sqrt(
      Math.pow((lng2 - lng1) * 111000 * Math.cos(lat1 * Math.PI / 180), 2) +
      Math.pow((lat2 - lat1) * 111000, 2)
    )
  }
  
  return distance
}

export default useRouteAnalysis
