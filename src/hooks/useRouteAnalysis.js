import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints, expandShortUrl } from '../services/routeService'

export function useRouteAnalysis() {
  const {
    routeMode,
    isRunning,
    position,
    heading,
    routeData,
    setRouteData,
    setUpcomingCurves,
    setActiveCurve,
    setDestination,
  } = useStore()
  
  // Get addRecentRoute directly to avoid hook dependency issues
  const addRecentRoute = useStore.getState().addRecentRoute

  const allCurvesRef = useRef([])
  const lastFetchPositionRef = useRef(null)
  const isFetchingRef = useRef(false)

  const processRoute = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 3) return []
    const curves = detectCurves(coordinates)
    console.log(`Detected ${curves.length} curves from ${coordinates.length} points`)
    allCurvesRef.current = curves
    return curves
  }, [])

  const reroute = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const dest = useStore.getState().destination
    
    if (!currentPosition || !dest) return false

    try {
      const route = await getRoute(currentPosition, dest.coordinates)
      if (!route) return false

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        destination: dest.name,
        distance: route.distance,
        duration: route.duration,
        rerouted: true
      })

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      return true
    } catch (error) {
      console.error('Reroute error:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves])

  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    if (!currentPosition) return false

    try {
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) return false

      const destCoords = results[0].coordinates
      setDestination({ name: results[0].name, coordinates: destCoords })

      const route = await getRoute(currentPosition, destCoords)
      if (!route) return false

      const curves = processRoute(route.coordinates)
      
      const routeInfo = {
        coordinates: route.coordinates,
        curves,
        name: results[0].name,
        destination: results[0].name,
        distance: route.distance,
        duration: route.duration
      }
      
      setRouteData(routeInfo)
      
      // Save to recent routes
      addRecentRoute(routeInfo)

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      return true
    } catch (error) {
      console.error('Error initializing destination route:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setDestination, addRecentRoute])

  // NEW: Multi-stop route initialization
  const initMultiStopRoute = useCallback(async (waypoints) => {
    if (!waypoints || waypoints.length < 2) return false

    try {
      const route = await getRouteWithWaypoints(waypoints)
      if (!route) return false

      const curves = processRoute(route.coordinates)
      
      // Create a name from waypoints
      const routeName = `Multi-stop (${waypoints.length} stops)`
      
      const routeInfo = {
        coordinates: route.coordinates,
        curves,
        name: routeName,
        waypoints: waypoints,
        distance: route.distance,
        duration: route.duration,
        multiStop: true
      }
      
      setRouteData(routeInfo)
      
      // Set destination as last waypoint
      setDestination({
        name: routeName,
        coordinates: waypoints[waypoints.length - 1]
      })
      
      // Save to recent routes
      addRecentRoute(routeInfo)

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      return true
    } catch (error) {
      console.error('Error initializing multi-stop route:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setDestination, addRecentRoute])

  const initImportedRoute = useCallback(async (url) => {
    const currentPosition = useStore.getState().position

    try {
      let fullUrl = url
      if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
        const expanded = await expandShortUrl(url)
        if (expanded) fullUrl = expanded
        else return { error: 'SHORT_URL', message: 'Please paste the full URL from your browser address bar' }
      }

      const parsed = parseGoogleMapsUrl(fullUrl)
      if (!parsed) return false

      let waypoints = []

      if (parsed.waypoints && parsed.waypoints.length >= 2) {
        for (const wp of parsed.waypoints) {
          if (wp.coords) {
            waypoints.push(wp.coords)
          } else if (wp.name) {
            if (wp.name.toLowerCase().includes('your location') || wp.name.toLowerCase().includes('my location')) {
              if (currentPosition) waypoints.push(currentPosition)
            } else {
              const results = await geocodeAddress(wp.name)
              if (results?.length) waypoints.push(results[0].coordinates)
            }
          }
        }
        
        if (waypoints.length >= 2) {
          const lastWp = parsed.waypoints[parsed.waypoints.length - 1]
          setDestination({ name: lastWp.name || 'Destination', coordinates: waypoints[waypoints.length - 1] })
        }
      } else if (parsed.coordinates && parsed.coordinates.length >= 2) {
        waypoints = parsed.coordinates
        setDestination({ name: 'Destination', coordinates: waypoints[waypoints.length - 1] })
      } else if (parsed.coordinates && parsed.coordinates.length === 1 && parsed.needsOrigin) {
        if (currentPosition) {
          waypoints = [currentPosition, parsed.coordinates[0]]
          setDestination({ name: 'Destination', coordinates: parsed.coordinates[0] })
        }
      } else if (parsed.originCoordinates && parsed.destination) {
        const destResults = await geocodeAddress(parsed.destination)
        if (destResults?.length) {
          waypoints = [parsed.originCoordinates, destResults[0].coordinates]
          setDestination({ name: destResults[0].name, coordinates: destResults[0].coordinates })
        }
      } else if (parsed.needsGeocoding) {
        if (parsed.origin && parsed.destination) {
          const originResults = await geocodeAddress(parsed.origin)
          const destResults = await geocodeAddress(parsed.destination)
          if (originResults?.length && destResults?.length) {
            waypoints = [originResults[0].coordinates, destResults[0].coordinates]
            setDestination({ name: destResults[0].name, coordinates: destResults[0].coordinates })
          }
        } else if (parsed.destination && currentPosition) {
          const destResults = await geocodeAddress(parsed.destination)
          if (destResults?.length) {
            waypoints = [currentPosition, destResults[0].coordinates]
            setDestination({ name: destResults[0].name, coordinates: destResults[0].coordinates })
          }
        }
      }

      if (waypoints.length < 2) return false

      const route = await getRouteWithWaypoints(waypoints)
      if (!route) return false

      const curves = processRoute(route.coordinates)
      
      const destName = useStore.getState().destination?.name || 'Imported Route'
      
      const routeInfo = {
        coordinates: route.coordinates,
        curves,
        name: destName,
        distance: route.distance,
        duration: route.duration,
        imported: true
      }
      
      setRouteData(routeInfo)
      
      // Save to recent routes
      addRecentRoute(routeInfo)

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      return true
    } catch (error) {
      console.error('Error importing route:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setDestination, addRecentRoute])

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
        setRouteData({ coordinates: route.coordinates, curves, lookahead: true })
        lastFetchPositionRef.current = currentPosition
      }
    } catch (error) {
      console.error('Look-ahead error:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [processRoute, setRouteData])

  // Initialize upcoming curves when route is loaded
  useEffect(() => {
    if (!isRunning || routeMode === 'demo') return
    if (!routeData?.curves?.length) return
    
    allCurvesRef.current = routeData.curves
    
    const currentUpcoming = useStore.getState().upcomingCurves
    if (currentUpcoming.length === 0) {
      const initial = routeData.curves.slice(0, 5).map((c, i) => ({
        ...c,
        distance: c.distanceFromStart || (500 + i * 300)
      }))
      setUpcomingCurves(initial)
    }
  }, [isRunning, routeMode, routeData, setUpcomingCurves])

  // Update upcoming curves based on position
  useEffect(() => {
    if (!isRunning || !position || routeMode === 'demo') return
    if (allCurvesRef.current.length === 0 && routeData?.curves?.length > 0) {
      allCurvesRef.current = routeData.curves
    }
    if (allCurvesRef.current.length === 0) return

    const upcoming = getUpcomingCurves(allCurvesRef.current, position, heading || 0, 1000)

    if (upcoming.length > 0) {
      setUpcomingCurves(upcoming)
    }

    if (upcoming.length > 0 && upcoming[0].distance < 300) {
      setActiveCurve(upcoming[0])
    } else {
      setActiveCurve(null)
    }
  }, [position, heading, isRunning, routeMode, routeData, setUpcomingCurves, setActiveCurve])

  // Look-ahead mode
  useEffect(() => {
    if (routeMode !== 'lookahead' || !isRunning) return
    fetchRoadAhead()
    const interval = setInterval(fetchRoadAhead, 10000)
    return () => clearInterval(interval)
  }, [routeMode, isRunning, fetchRoadAhead])

  useEffect(() => {
    if (routeData?.curves) allCurvesRef.current = routeData.curves
  }, [routeData])

  return { initDestinationRoute, initImportedRoute, initMultiStopRoute, fetchRoadAhead, processRoute, reroute }
}

function getDistance(pos1, pos2) {
  const R = 6371e3
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

export default useRouteAnalysis
