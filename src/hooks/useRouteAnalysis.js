import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints, expandShortUrl } from '../services/routeService'

// ================================
// Route Analysis Hook
// Manual reroute only - no auto rerouting
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

  // Manual reroute - call this from UI button
  const reroute = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const destination = destinationRef.current
    
    if (!currentPosition) {
      console.log('Cannot reroute: no current position')
      return false
    }

    if (!destination) {
      console.log('Cannot reroute: no destination saved')
      return false
    }

    console.log('🔄 Manual reroute from', currentPosition, 'to', destination.name)

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

      // Set initial upcoming curves
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

  // Initialize route for destination mode
  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    
    if (!currentPosition) {
      console.warn('No current position for destination route')
      return false
    }

    console.log('Initializing destination route to', destinationQuery)

    try {
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) {
        console.error('Could not find destination')
        return false
      }

      const destCoords = results[0].coordinates

      // Save destination for manual rerouting
      destinationRef.current = {
        name: results[0].name,
        coordinates: destCoords
      }

      const route = await getRoute(currentPosition, destCoords)
      if (!route) {
        console.error('Could not get route')
        return false
      }

      const curves = processRoute(route.coordinates)
      
      setRouteData({
        coordinates: route.coordinates,
        curves,
        destination: results[0].name,
        distance: route.distance,
        duration: route.duration
      })

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
  }, [processRoute, setRouteData, setUpcomingCurves])

  // Initialize route from Google Maps import
  const initImportedRoute = useCallback(async (url) => {
    const currentPosition = useStore.getState().position

    try {
      console.log('Processing Google Maps URL...')
      
      let fullUrl = url
      if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
        const expanded = await expandShortUrl(url)
        if (expanded) {
          fullUrl = expanded
        } else {
          return { error: 'SHORT_URL', message: 'Please paste the full URL from your browser address bar' }
        }
      }

      const parsed = parseGoogleMapsUrl(fullUrl)
      
      if (!parsed) {
        console.error('Could not parse Google Maps URL')
        return false
      }

      console.log('Parsed result:', parsed)

      let waypoints = []

      // Handle multi-stop routes
      if (parsed.waypoints && parsed.waypoints.length >= 2) {
        console.log('Processing multi-stop route')
        
        for (const wp of parsed.waypoints) {
          if (wp.coords) {
            waypoints.push(wp.coords)
          } else if (wp.name) {
            // Check for "your location" type strings
            if (wp.name.toLowerCase().includes('your location') || 
                wp.name.toLowerCase().includes('my location')) {
              if (currentPosition) {
                waypoints.push(currentPosition)
              }
            } else {
              const results = await geocodeAddress(wp.name)
              if (results?.length) {
                waypoints.push(results[0].coordinates)
              }
            }
          }
        }
        
        if (waypoints.length >= 2) {
          const lastWp = parsed.waypoints[parsed.waypoints.length - 1]
          destinationRef.current = {
            name: lastWp.name || 'Destination',
            coordinates: waypoints[waypoints.length - 1]
          }
        }
      }
      // Direct coordinates
      else if (parsed.coordinates && parsed.coordinates.length >= 2) {
        waypoints = parsed.coordinates
        destinationRef.current = {
          name: 'Destination',
          coordinates: waypoints[waypoints.length - 1]
        }
      }
      // Single coordinate, need origin
      else if (parsed.coordinates && parsed.coordinates.length === 1 && parsed.needsOrigin) {
        if (currentPosition) {
          waypoints = [currentPosition, parsed.coordinates[0]]
          destinationRef.current = {
            name: 'Destination',
            coordinates: parsed.coordinates[0]
          }
        }
      }
      // Origin coords + destination name
      else if (parsed.originCoordinates && parsed.destination) {
        const destResults = await geocodeAddress(parsed.destination)
        if (destResults?.length) {
          waypoints = [parsed.originCoordinates, destResults[0].coordinates]
          destinationRef.current = {
            name: destResults[0].name,
            coordinates: destResults[0].coordinates
          }
        }
      }
      // Both need geocoding
      else if (parsed.needsGeocoding) {
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
        } else if (parsed.destination && currentPosition) {
          const destResults = await geocodeAddress(parsed.destination)
          if (destResults?.length) {
            waypoints = [currentPosition, destResults[0].coordinates]
            destinationRef.current = {
              name: destResults[0].name,
              coordinates: destResults[0].coordinates
            }
          }
        }
      }

      if (waypoints.length < 2) {
        console.error('Could not extract enough waypoints')
        return false
      }

      console.log('Final waypoints:', waypoints.length)

      const route = await getRouteWithWaypoints(waypoints)
      if (!route) {
        console.error('Could not get route from Mapbox')
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
      console.error('Look-ahead error:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [processRoute, setRouteData])

  // Update upcoming curves based on position (non-demo modes)
  useEffect(() => {
    if (!isRunning || !position || routeMode === 'demo') return
    if (allCurvesRef.current.length === 0 && routeData?.curves?.length > 0) {
      allCurvesRef.current = routeData.curves
    }
    if (allCurvesRef.current.length === 0) return

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

  // Look-ahead mode: periodic fetch
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
    processRoute,
    reroute // Manual reroute function
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
