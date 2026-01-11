import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints, expandShortUrl } from '../services/routeService'
import { analyzeRouteCharacter } from '../services/zoneService'

// ================================
// Route Analysis Hook - v3
// With full reroute capability
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
    setActiveCurve,
    setDestination,
    setRouteZones,
  } = useStore()
  
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

  // FULL REROUTE - New API calls, new cache
  const reroute = useCallback(async () => {
    const currentPosition = useStore.getState().position
    const dest = useStore.getState().destination
    
    if (!currentPosition) {
      console.warn('Reroute: No current position')
      return false
    }
    
    if (!dest) {
      console.warn('Reroute: No destination set')
      return false
    }

    console.log('🔄 Rerouting from current position to:', dest.name)
    isFetchingRef.current = true

    try {
      // 1. Get new route from current position to destination
      const route = await getRoute(currentPosition, dest.coordinates)
      if (!route?.coordinates) {
        console.error('Reroute: Failed to get route')
        return false
      }

      // 2. Detect curves on new route
      const curves = processRoute(route.coordinates)
      
      // 3. Calculate route stats
      const distance = calculateRouteDistance(route.coordinates)
      const duration = Math.round(distance / 15) // rough estimate in seconds

      // 4. Analyze route character (zones)
      let zones = []
      try {
        const analysis = await analyzeRouteCharacter(route.coordinates, curves)
        zones = analysis.segments || []
        setRouteZones(zones)
        console.log(`🎯 Reroute: Found ${zones.length} character zones`)
      } catch (err) {
        console.warn('Route character analysis failed:', err)
      }

      // 5. Update route data
      const newRouteData = {
        coordinates: route.coordinates,
        curves,
        destination: dest.name,
        distance,
        duration,
        rerouted: true,
        reroutedAt: Date.now(),
        name: `Reroute to ${dest.name}`
      }

      setRouteData(newRouteData)

      // 6. Update upcoming curves
      if (curves.length > 0) {
        const upcoming = curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        }))
        setUpcomingCurves(upcoming)
      }

      console.log(`✅ Reroute complete: ${curves.length} curves, ${Math.round(distance)}m`)
      
      // 7. Note: Voice cache will need to be updated
      // The CopilotLoader handles this when navigation starts
      // For mid-route reroute, we'd need to pre-cache new callouts
      // For now, fallback to browser TTS for uncached callouts

      return true
    } catch (error) {
      console.error('Reroute error:', error)
      return false
    } finally {
      isFetchingRef.current = false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setRouteZones])

  // Initialize destination route
  const initDestinationRoute = useCallback(async (destinationQuery) => {
    const currentPosition = useStore.getState().position
    if (!currentPosition) {
      console.warn('initDestinationRoute: No current position')
      return false
    }

    try {
      // Geocode the destination
      const results = await geocodeAddress(destinationQuery)
      if (!results || results.length === 0) {
        console.error('Geocoding failed for:', destinationQuery)
        return false
      }

      const destCoords = results[0].coordinates
      const destName = results[0].name

      // Set destination for future reroutes
      setDestination({ coordinates: destCoords, name: destName })

      // Get route
      const route = await getRoute(currentPosition, destCoords)
      if (!route?.coordinates) return false

      const curves = processRoute(route.coordinates)
      const distance = calculateRouteDistance(route.coordinates)

      const routeDataObj = {
        coordinates: route.coordinates,
        curves,
        destination: destName,
        distance,
        duration: Math.round(distance / 15),
        name: `Route to ${destName}`
      }

      setRouteData(routeDataObj)
      
      // Analyze character
      try {
        const analysis = await analyzeRouteCharacter(route.coordinates, curves)
        setRouteZones(analysis.segments || [])
      } catch {}

      // Add to recent routes
      addRecentRoute({
        ...routeDataObj,
        type: 'destination',
        startCoords: currentPosition,
        endCoords: destCoords
      })

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5).map((c, i) => ({
          ...c,
          distance: c.distanceFromStart || (i * 200 + 100)
        })))
      }

      return true
    } catch (error) {
      console.error('initDestinationRoute error:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setDestination, setRouteZones, addRecentRoute])

  // Import route from URL (Google Maps, etc.)
  const importRouteFromUrl = useCallback(async (url) => {
    try {
      // Expand short URLs
      const expandedUrl = await expandShortUrl(url)
      
      // Parse Google Maps URL
      const parsed = parseGoogleMapsUrl(expandedUrl || url)
      if (!parsed) {
        console.error('Could not parse URL:', url)
        return false
      }

      let route
      if (parsed.waypoints && parsed.waypoints.length > 0) {
        route = await getRouteWithWaypoints(
          parsed.origin,
          parsed.destination,
          parsed.waypoints
        )
      } else {
        route = await getRoute(parsed.origin, parsed.destination)
      }

      if (!route?.coordinates) return false

      const curves = processRoute(route.coordinates)
      const distance = calculateRouteDistance(route.coordinates)

      setDestination({ 
        coordinates: parsed.destination, 
        name: 'Imported Route' 
      })

      const routeDataObj = {
        coordinates: route.coordinates,
        curves,
        distance,
        duration: Math.round(distance / 15),
        name: 'Imported Route',
        imported: true
      }

      setRouteData(routeDataObj)

      // Analyze character
      try {
        const analysis = await analyzeRouteCharacter(route.coordinates, curves)
        setRouteZones(analysis.segments || [])
      } catch {}

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5))
      }

      return true
    } catch (error) {
      console.error('importRouteFromUrl error:', error)
      return false
    }
  }, [processRoute, setRouteData, setUpcomingCurves, setDestination, setRouteZones])

  // Lookahead mode - continuously fetch road ahead
  const fetchRoadAhead = useCallback(async () => {
    if (isFetchingRef.current) return
    if (!position || !heading) return
    
    // Don't refetch if we haven't moved much
    if (lastFetchPositionRef.current) {
      const dist = getDistanceBetween(position, lastFetchPositionRef.current)
      if (dist < 200) return
    }

    isFetchingRef.current = true
    lastFetchPositionRef.current = position

    try {
      const roadData = await getRoadAhead(position, heading)
      if (!roadData?.coordinates) return

      const curves = processRoute(roadData.coordinates)
      
      setRouteData({
        coordinates: roadData.coordinates,
        curves,
        distance: calculateRouteDistance(roadData.coordinates),
        lookahead: true
      })

      if (curves.length > 0) {
        setUpcomingCurves(curves.slice(0, 5))
      }
    } catch (error) {
      console.error('fetchRoadAhead error:', error)
    } finally {
      isFetchingRef.current = false
    }
  }, [position, heading, processRoute, setRouteData, setUpcomingCurves])

  // Auto-fetch in lookahead mode
  useEffect(() => {
    if (routeMode !== 'lookahead' || !isRunning) return

    const interval = setInterval(() => {
      fetchRoadAhead()
    }, 5000)

    fetchRoadAhead() // Initial fetch

    return () => clearInterval(interval)
  }, [routeMode, isRunning, fetchRoadAhead])

  // Update upcoming curves based on position (for non-lookahead modes)
  useEffect(() => {
    if (!isRunning || !position || !routeData?.curves?.length) return
    if (routeMode === 'lookahead') return

    const curves = routeData.curves
    const currentDist = estimateDistanceAlongRoute(position, routeData.coordinates)

    const upcoming = curves
      .map(curve => ({
        ...curve,
        distance: Math.max(0, (curve.distanceFromStart || 0) - currentDist)
      }))
      .filter(c => c.distance >= -50 && c.distance < 2000)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)

    setUpcomingCurves(upcoming)

    // Set active curve
    const active = upcoming.find(c => c.distance <= 30 && c.distance >= -30)
    setActiveCurve(active || null)
  }, [isRunning, position, routeData, routeMode, setUpcomingCurves, setActiveCurve])

  return {
    reroute,
    initDestinationRoute,
    importRouteFromUrl,
    fetchRoadAhead
  }
}

// ================================
// HELPER FUNCTIONS
// ================================

function calculateRouteDistance(coordinates) {
  if (!coordinates || coordinates.length < 2) return 0
  
  let total = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += getDistanceBetween(coordinates[i], coordinates[i + 1])
  }
  return total
}

function getDistanceBetween(coord1, coord2) {
  const R = 6371e3
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

function estimateDistanceAlongRoute(position, coordinates) {
  if (!coordinates || coordinates.length < 2) return 0
  
  // Find closest point on route
  let minDist = Infinity
  let closestIdx = 0
  
  for (let i = 0; i < coordinates.length; i++) {
    const dist = getDistanceBetween(position, coordinates[i])
    if (dist < minDist) {
      minDist = dist
      closestIdx = i
    }
  }
  
  // Calculate distance along route to that point
  let distAlong = 0
  for (let i = 0; i < closestIdx; i++) {
    distAlong += getDistanceBetween(coordinates[i], coordinates[i + 1])
  }
  
  return distAlong
}
