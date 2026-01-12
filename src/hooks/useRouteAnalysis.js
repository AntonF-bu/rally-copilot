import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'
import { detectCurves, getUpcomingCurves } from '../utils/curveDetection'
import { getRoute, getRoadAhead, geocodeAddress, parseGoogleMapsUrl, getRouteWithWaypoints, expandShortUrl } from '../services/routeService'
import { analyzeRouteCharacter } from '../services/zoneService'

// ================================
// Route Analysis Hook - v4
// FIXED: Reliable curve updates for live GPS mode
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
  const lastCurveUpdateRef = useRef(0)
  const lastDistanceAlongRef = useRef(0)

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

  // ================================================================
  // CRITICAL FIX: Update upcoming curves based on GPS position
  // This effect runs when position changes in live GPS mode
  // ================================================================
  useEffect(() => {
    // Skip if not running or no position
    if (!isRunning || !position) {
      return
    }
    
    // Skip if no route data or curves
    if (!routeData?.curves?.length || !routeData?.coordinates?.length) {
      console.log('📍 GPS Update: No route data or curves available')
      return
    }
    
    // Skip lookahead mode (handled differently)
    if (routeMode === 'lookahead') {
      return
    }

    // Throttle updates to avoid excessive processing
    const now = Date.now()
    if (now - lastCurveUpdateRef.current < 250) { // Max 4 updates per second
      return
    }
    lastCurveUpdateRef.current = now

    const curves = routeData.curves
    const coordinates = routeData.coordinates
    
    // Calculate current distance along route
    const currentDist = estimateDistanceAlongRoute(position, coordinates)
    
    // Log for debugging (every ~2 seconds)
    if (now % 2000 < 300) {
      console.log(`📍 GPS Position Update:
        - Position: [${position[0].toFixed(5)}, ${position[1].toFixed(5)}]
        - Distance along route: ${Math.round(currentDist)}m
        - Route mode: ${routeMode}
        - Total curves: ${curves.length}`)
    }
    
    // Store for reference
    lastDistanceAlongRef.current = currentDist

    // Calculate distance to each curve
    const upcoming = curves
      .filter(curve => {
        // Skip curves at the very start (position 0 issue)
        const curveStart = curve.distanceFromStart || 0
        return curveStart > 50 // Skip first 50m of route
      })
      .map(curve => {
        const curveStart = curve.distanceFromStart || 0
        const distanceToCurve = curveStart - currentDist
        
        return {
          ...curve,
          distance: Math.max(0, distanceToCurve),
          actualDistance: distanceToCurve // Keep negative values for debugging
        }
      })
      .filter(c => {
        // Only include curves that are:
        // 1. Ahead of us (actualDistance > -30 = we haven't fully passed)
        // 2. Within reasonable range (< 2000m)
        return c.actualDistance > -30 && c.actualDistance < 2000
      })
      .sort((a, b) => a.actualDistance - b.actualDistance)
      .slice(0, 5)

    // Log curve updates (throttled)
    if (now % 2000 < 300 && upcoming.length > 0) {
      console.log(`🎯 Upcoming curves: ${upcoming.map(c => 
        `${c.id}:${Math.round(c.distance)}m`
      ).join(', ')}`)
    }

    setUpcomingCurves(upcoming)

    // Set active curve (one we're in or very close to)
    const active = upcoming.find(c => c.distance <= 30 && c.distance >= 0)
    setActiveCurve(active || null)
    
  }, [isRunning, position, routeData, routeMode, setUpcomingCurves, setActiveCurve])

  // ================================================================
  // BACKUP: Interval-based curve updates for live GPS
  // This ensures curves update even if position updates are slow
  // ================================================================
  useEffect(() => {
    // Only run for non-demo, non-lookahead modes when running
    if (!isRunning || routeMode === 'demo' || routeMode === 'lookahead') {
      return
    }
    
    if (!routeData?.curves?.length) {
      return
    }

    console.log('🔄 Starting live GPS curve update interval')

    const interval = setInterval(() => {
      const currentPosition = useStore.getState().position
      const coordinates = routeData.coordinates
      const curves = routeData.curves
      
      if (!currentPosition || !coordinates?.length || !curves?.length) {
        return
      }

      const currentDist = estimateDistanceAlongRoute(currentPosition, coordinates)
      
      const upcoming = curves
        .filter(curve => (curve.distanceFromStart || 0) > 50)
        .map(curve => {
          const curveStart = curve.distanceFromStart || 0
          const distanceToCurve = curveStart - currentDist
          return {
            ...curve,
            distance: Math.max(0, distanceToCurve),
            actualDistance: distanceToCurve
          }
        })
        .filter(c => c.actualDistance > -30 && c.actualDistance < 2000)
        .sort((a, b) => a.actualDistance - b.actualDistance)
        .slice(0, 5)

      if (upcoming.length > 0) {
        useStore.getState().setUpcomingCurves(upcoming)
        
        const active = upcoming.find(c => c.distance <= 30 && c.distance >= 0)
        useStore.getState().setActiveCurve(active || null)
      }
    }, 500) // Update every 500ms

    return () => {
      console.log('🔄 Stopping live GPS curve update interval')
      clearInterval(interval)
    }
  }, [isRunning, routeMode, routeData])

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

/**
 * IMPROVED: Estimate distance along route from current position
 * Uses projection onto route segments for better accuracy
 */
function estimateDistanceAlongRoute(position, coordinates) {
  if (!coordinates || coordinates.length < 2) return 0
  
  let minDist = Infinity
  let closestSegmentIdx = 0
  let closestPointOnSegment = null
  let projectionFactor = 0
  
  // Find closest point on any segment of the route
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segStart = coordinates[i]
    const segEnd = coordinates[i + 1]
    
    // Project position onto segment
    const projection = projectPointOnSegment(position, segStart, segEnd)
    const dist = getDistanceBetween(position, projection.point)
    
    if (dist < minDist) {
      minDist = dist
      closestSegmentIdx = i
      closestPointOnSegment = projection.point
      projectionFactor = projection.factor
    }
  }
  
  // Calculate distance along route to the closest point
  let distAlong = 0
  for (let i = 0; i < closestSegmentIdx; i++) {
    distAlong += getDistanceBetween(coordinates[i], coordinates[i + 1])
  }
  
  // Add partial distance within the closest segment
  if (closestSegmentIdx < coordinates.length - 1) {
    const segmentLength = getDistanceBetween(
      coordinates[closestSegmentIdx], 
      coordinates[closestSegmentIdx + 1]
    )
    distAlong += segmentLength * Math.max(0, Math.min(1, projectionFactor))
  }
  
  return distAlong
}

/**
 * Project a point onto a line segment
 * Returns the closest point on the segment and the projection factor (0-1)
 */
function projectPointOnSegment(point, segStart, segEnd) {
  const dx = segEnd[0] - segStart[0]
  const dy = segEnd[1] - segStart[1]
  
  if (dx === 0 && dy === 0) {
    // Segment is a point
    return { point: segStart, factor: 0 }
  }
  
  // Calculate projection factor
  const t = (
    (point[0] - segStart[0]) * dx + 
    (point[1] - segStart[1]) * dy
  ) / (dx * dx + dy * dy)
  
  // Clamp to segment
  const clampedT = Math.max(0, Math.min(1, t))
  
  // Calculate projected point
  const projectedPoint = [
    segStart[0] + clampedT * dx,
    segStart[1] + clampedT * dy
  ]
  
  return { point: projectedPoint, factor: clampedT }
}
