import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints, expandShortUrl } from '../services/routeService'

// ================================
// Route Analysis Hook
// With rerouting support
// Fixed: Also handles demo mode curves
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
  const destinationRef = useRef(null)
  const lastRerouteTimeRef = useRef(0)
  const offRouteCountRef = useRef(0)

  // Process route and detect curves
  const processRoute = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 3) {
      console.warn('Not enough coordinates to detect curves')
      return []
    }
    
    const curves = detectCurves(coordinates)
    console.log(`Detected ${curves.length} curves from ${coordinates.length} points`)
    allCurvesRef.current = curves
    
    return curves
  }, [])

  // Calculate distance from point to nearest point on route
  const getDistanceFromRoute = useCallback((position, routeCoords) => {
    if (!position || !routeCoords || routeCoords.length < 2) return Infinity

    let minDistance = Infinity
    
    for (let i = 0; i < routeCoords.length; i++) {
      const dist = getDistance(position, routeCoords[i])
      if (dist < minDistance) {
        minDistance = dist
      }
    }
    
    return minDistance
  }, [])

  // Reroute from current position to destination
  const reroute = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const destination = destinationRef.current
    
    if (!currentPosition || !destination) {
      console.log('Cannot reroute: missing position or destination')
      return false
    }

    const now = Date.now()
    if (now - lastRerouteTimeRef.current < 10000) {
      console.log('Reroute throttled')
      return false
    }
    lastRerouteTimeRef.current = now

    console.log('🔄 Rerouting from', currentPosition, 'to', destination)

    try {
      const route = await getRoute(currentPosition, destination.coordinates)
      if (!route) {
        console.error('Reroute failed: could not get new route')
        return false
      }

      console.log('✅ Reroute successful with', route.coordinates.length, 'points')

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        destination: destination.name,
        distance: route.distance,
        duration: route.duration,
        rerouted: true
      })

      offRouteCountRef.current = 0
      return true
    } catch (error) {
      console.error('Reroute error:', error)
      return false
    }
  }, [processRoute, setRouteData])

  // Initialize route for destination mode
  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    
    if (!currentPosition) {
      console.warn('No current position for destination route')
      return false
    }

    console.log('Initializing destination route from', currentPosition, 'to', destinationQuery)

    try {
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) {
        console.error('Could not find destination')
        return false
      }

      const destCoords = results[0].coordinates
      console.log('Destination coordinates:', destCoords)

      destinationRef.current = {
        name: results[0].name,
        coordinates: destCoords
      }

      const route = await getRoute(currentPosition, destCoords)
      if (!route) {
        console.error('Could not get route')
        return false
      }

      console.log('Route received with', route.coordinates.length, 'points')

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        destination: results[0].name,
        distance: route.distance,
        duration: route.duration
      })

      // Set initial upcoming curves
      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      console.log('Route data set successfully')
      return true
    } catch (error) {
      console.error('Error initializing destination route:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves])

  // Initialize route from Google Maps import
  const initImportedRoute = useCallback(async (url) => {
    const currentPosition = useStore.getState().position

    try {
      console.log('Processing Google Maps URL...')
      
      let fullUrl = url
      if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
        console.log('Short URL detected, expanding...')
        const expanded = await expandShortUrl(url)
        if (expanded) {
          fullUrl = expanded
          console.log('Expanded URL:', fullUrl)
        } else {
          console.error('Could not expand short URL')
          return { error: 'SHORT_URL', message: 'Please paste the full URL (open the short link in your browser first, then copy the full URL from the address bar)' }
        }
      }

      console.log('Parsing Google Maps URL...')
      const parsed = parseGoogleMapsUrl(fullUrl)
      
      if (!parsed) {
        console.error('Could not parse Google Maps URL')
        return false
      }

      console.log('Parsed result:', parsed)

      let waypoints = []

      if (parsed.coordinates && parsed.coordinates.length >= 2) {
        waypoints = parsed.coordinates
      }
      else if (parsed.coordinates && parsed.coordinates.length === 1 && parsed.needsOrigin) {
        if (currentPosition) {
          waypoints = [currentPosition, parsed.coordinates[0]]
        } else {
          console.error('Need current position for route origin')
          return false
        }
      }
      else if (parsed.originCoordinates && parsed.destination) {
        console.log('Geocoding destination:', parsed.destination)
        const destResults = await geocodeAddress(parsed.destination)
        if (destResults?.length) {
          waypoints = [parsed.originCoordinates, destResults[0].coordinates]
          destinationRef.current = {
            name: destResults[0].name,
            coordinates: destResults[0].coordinates
          }
        }
      }
      else if (parsed.destinationCoordinates && parsed.origin) {
        console.log('Geocoding origin:', parsed.origin)
        const originResults = await geocodeAddress(parsed.origin)
        if (originResults?.length) {
          waypoints = [originResults[0].coordinates, parsed.destinationCoordinates]
          destinationRef.current = {
            name: 'Destination',
            coordinates: parsed.destinationCoordinates
          }
        }
      }
      else if (parsed.needsGeocoding) {
        console.log('Geocoding both origin and destination...')
        
        if (parsed.origin && parsed.destination) {
          const originResults = await geocodeAddress(parsed.origin)
          const destResults = await geocodeAddress(parsed.destination)
          
          if (originResults?.length && destResults?.length) {
            waypoints = [originResults[0].coordinates, destResults[0].coordinates]
            destinationRef.current = {
              name: destResults[0].name,
              coordinates: destResults[0].coordinates
            }
          }
        } else if (parsed.destination) {
          const destResults = await geocodeAddress(parsed.destination)
          if (destResults?.length && currentPosition) {
            waypoints = [currentPosition, destResults[0].coordinates]
            destinationRef.current = {
              name: destResults[0].name,
              coordinates: destResults[0].coordinates
            }
          }
        }
      }

      console.log('Final waypoints:', waypoints)

      if (waypoints.length < 2) {
        console.error('Could not extract enough waypoints')
        return false
      }

      if (!destinationRef.current) {
        destinationRef.current = {
          name: 'Destination',
          coordinates: waypoints[waypoints.length - 1]
        }
      }

      console.log('Getting route from Mapbox...')
      const route = await getRouteWithWaypoints(waypoints)
      if (!route) {
        console.error('Could not get route from Mapbox')
        return false
      }

      console.log('Route received with', route.coordinates.length, 'points')

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        distance: route.distance,
        duration: route.duration,
        imported: true
      })

      // Set initial upcoming curves
      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      console.log('Imported route set successfully')
      return true
    } catch (error) {
      console.error('Error importing route:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves])

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
    console.log('Fetching road ahead from', currentPosition)

    try {
      const route = await getRoadAhead(currentPosition, currentHeading || 0, 2000)
      if (route) {
        console.log('Look-ahead route received with', route.coordinates.length, 'points')
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

  // Check if off route and trigger reroute
  useEffect(() => {
    if (!isRunning || !position || routeMode === 'demo' || routeMode === 'lookahead') return
    if (!routeData?.coordinates || routeData.coordinates.length < 2) return

    const distanceFromRoute = getDistanceFromRoute(position, routeData.coordinates)
    
    if (distanceFromRoute > 50) {
      offRouteCountRef.current++
      console.log(`Off route: ${Math.round(distanceFromRoute)}m (count: ${offRouteCountRef.current})`)
      
      if (offRouteCountRef.current >= 3) {
        console.log('🚨 Off route detected, initiating reroute...')
        reroute()
      }
    } else {
      offRouteCountRef.current = 0
    }
  }, [position, isRunning, routeMode, routeData, getDistanceFromRoute, reroute])

  // Update upcoming curves based on position (for ALL modes including demo)
  useEffect(() => {
    if (!isRunning || !position) return
    if (allCurvesRef.current.length === 0 && routeData?.curves?.length > 0) {
      allCurvesRef.current = routeData.curves
    }
    if (allCurvesRef.current.length === 0) return

    // For demo mode, useSimulation handles curves - skip here
    if (routeMode === 'demo') return

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
  }, [position, heading, isRunning, routeMode, routeData, setUpcomingCurves, setActiveCurve])

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
      console.log('Synced', routeData.curves.length, 'curves from route data')
    }
  }, [routeData])

  return {
    initDestinationRoute,
    initImportedRoute,
    fetchRoadAhead,
    processRoute,
    reroute
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
