import { useEffect, useCallback, useRef } from 'react'
import useStore from '../store'

// ================================
// Route Analysis Hook - v5
// SIMPLIFIED: Only updates upcoming curves from store data
// NO curve detection - Preview handles that!
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
  // MAIN EFFECT: Update upcoming curves based on GPS position
  // Uses routeData.curves from store (set by Preview)
  // ================================================================
  useEffect(() => {
    if (!isRunning || !position) return
    if (!routeData?.curves?.length || !routeData?.coordinates?.length) return
    if (routeMode === 'lookahead') return

    const now = Date.now()
    if (now - lastCurveUpdateRef.current < 250) return
    lastCurveUpdateRef.current = now

    const curves = routeData.curves
    const coordinates = routeData.coordinates
    
    // Calculate current distance along route
    const currentDist = estimateDistanceAlongRoute(position, coordinates)
    lastDistanceAlongRef.current = currentDist

    // Filter and map curves - use the SAME curves from Preview
    const upcoming = curves
      .filter(curve => {
        const curveStart = curve.distanceFromStart || 0
        // Skip curves at very start
        if (curveStart < 50) return false
        // Skip curves in transit zones - highway mode handles those
        if (isInTransitZone(curveStart)) return false
        return true
      })
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

    // Log periodically
    if (now % 2000 < 300 && upcoming.length > 0) {
      console.log(`🎯 Upcoming curves (non-transit): ${upcoming.map(c => 
        `${c.direction}${c.severity}@${Math.round(c.distance)}m`
      ).join(', ')}`)
    }

    setUpcomingCurves(upcoming)

    // Set active curve
    const active = upcoming.find(c => c.distance <= 30 && c.distance >= 0)
    setActiveCurve(active || null)
    
  }, [isRunning, position, routeData, routeMode, routeZones, setUpcomingCurves, setActiveCurve, isInTransitZone])

  // ================================================================
  // BACKUP: Interval-based updates for live GPS
  // ================================================================
  useEffect(() => {
    if (!isRunning || routeMode === 'demo' || routeMode === 'lookahead') return
    if (!routeData?.curves?.length) return

    console.log('🔄 Starting live GPS curve update interval')

    const interval = setInterval(() => {
      const currentPosition = useStore.getState().position
      const coordinates = routeData.coordinates
      const curves = routeData.curves
      const zones = useStore.getState().routeZones
      
      if (!currentPosition || !coordinates?.length || !curves?.length) return

      const currentDist = estimateDistanceAlongRoute(currentPosition, coordinates)
      
      // Check if in transit zone helper
      const inTransit = (dist) => {
        if (!zones?.length) return false
        return zones.some(z => 
          z.character === 'transit' && 
          dist >= z.startDistance && 
          dist <= z.endDistance
        )
      }
      
      const upcoming = curves
        .filter(curve => {
          const d = curve.distanceFromStart || 0
          return d > 50 && !inTransit(d)
        })
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
    }, 500)

    return () => {
      console.log('🔄 Stopping live GPS curve update interval')
      clearInterval(interval)
    }
  }, [isRunning, routeMode, routeData])

  // No exports needed - this hook just maintains upcomingCurves state
  return {}
}

// ================================
// HELPER FUNCTIONS
// ================================

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
  
  let minDist = Infinity
  let closestSegmentIdx = 0
  let projectionFactor = 0
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segStart = coordinates[i]
    const segEnd = coordinates[i + 1]
    
    const projection = projectPointOnSegment(position, segStart, segEnd)
    const dist = getDistanceBetween(position, projection.point)
    
    if (dist < minDist) {
      minDist = dist
      closestSegmentIdx = i
      projectionFactor = projection.factor
    }
  }
  
  let distAlong = 0
  for (let i = 0; i < closestSegmentIdx; i++) {
    distAlong += getDistanceBetween(coordinates[i], coordinates[i + 1])
  }
  
  if (closestSegmentIdx < coordinates.length - 1) {
    const segmentLength = getDistanceBetween(
      coordinates[closestSegmentIdx], 
      coordinates[closestSegmentIdx + 1]
    )
    distAlong += segmentLength * Math.max(0, Math.min(1, projectionFactor))
  }
  
  return distAlong
}

function projectPointOnSegment(point, segStart, segEnd) {
  const dx = segEnd[0] - segStart[0]
  const dy = segEnd[1] - segStart[1]
  
  if (dx === 0 && dy === 0) {
    return { point: segStart, factor: 0 }
  }
  
  const t = (
    (point[0] - segStart[0]) * dx + 
    (point[1] - segStart[1]) * dy
  ) / (dx * dx + dy * dy)
  
  const clampedT = Math.max(0, Math.min(1, t))
  
  const projectedPoint = [
    segStart[0] + clampedT * dx,
    segStart[1] + clampedT * dy
  ]
  
  return { point: projectedPoint, factor: clampedT }
}

export default useRouteAnalysis
