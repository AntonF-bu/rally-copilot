import { useRef, useEffect, useCallback } from 'react'
import useStore from '../store'

// ================================
// Drive Stats Collection v1.0
// Tracks comprehensive drive data during navigation.
// All hot-path tracking uses refs for zero re-renders.
// Flush to store on navigation end for TripSummary.
// ================================

function createEmptyStats() {
  return {
    startTime: null,
    totalDistance: 0,       // meters
    driveTime: 0,          // ms
    avgSpeed: 0,           // mph
    topSpeed: 0,           // mph

    // Technical zone stats
    technicalTime: 0,      // ms
    technicalCurves: 0,
    technicalAvgSpeed: 0,  // mph
    technicalDistance: 0,   // meters

    // Highway zone stats
    highwayTime: 0,        // ms
    highwayAvgSpeed: 0,    // mph
    highwayTopSpeed: 0,    // mph
    highwayDistance: 0,     // meters

    // Apex & curve tracking
    fastestApex: null,     // { speed, curveAngle, curveDirection, mile }
    hardestCurve: null,    // { angle, direction, mile }

    calloutsDelivered: 0,
    zoneBreakdown: [],     // [{ zone, distance, time }]
  }
}

export function useDriveStats({ isRunning, currentSpeed, currentMode, userDistanceAlongRoute, routeZones }) {
  // All tracking is ref-based — no re-renders during navigation
  const statsRef = useRef(createEmptyStats())

  // Internal tracking refs
  const currentSpeedRef = useRef(0)
  const zoneEntryRef = useRef({ zone: null, time: 0, distance: 0 })
  const lastSampleTimeRef = useRef(0)
  const speedSamplesRef = useRef([])
  const technicalSpeedSamplesRef = useRef([])
  const highwaySpeedSamplesRef = useRef([])
  const apexWindowRef = useRef(null)
  const recentSpeedRef = useRef([])
  const currentZoneCharRef = useRef(null)

  const setDriveStats = useStore(state => state.setDriveStats)

  // Keep currentSpeed in ref for stable callbacks
  currentSpeedRef.current = currentSpeed

  // Reset on navigation start
  useEffect(() => {
    if (isRunning) {
      statsRef.current = createEmptyStats()
      statsRef.current.startTime = Date.now()
      zoneEntryRef.current = { zone: null, time: 0, distance: 0 }
      lastSampleTimeRef.current = 0
      speedSamplesRef.current = []
      technicalSpeedSamplesRef.current = []
      highwaySpeedSamplesRef.current = []
      apexWindowRef.current = null
      recentSpeedRef.current = []
      currentZoneCharRef.current = null
    }
  }, [isRunning])

  // Main tick — runs on distance/speed changes during navigation
  useEffect(() => {
    if (!isRunning || !userDistanceAlongRoute) return

    const now = Date.now()
    const stats = statsRef.current

    // Update basic stats
    stats.totalDistance = userDistanceAlongRoute
    stats.driveTime = now - stats.startTime
    if (currentSpeed > stats.topSpeed) stats.topSpeed = currentSpeed

    // Speed sampling (every 2 seconds)
    if (now - lastSampleTimeRef.current > 2000) {
      lastSampleTimeRef.current = now
      speedSamplesRef.current.push(currentSpeed)
      if (speedSamplesRef.current.length > 500) {
        speedSamplesRef.current = speedSamplesRef.current.slice(-500)
      }

      // Recalculate avg speed
      const samples = speedSamplesRef.current
      if (samples.length > 0) {
        stats.avgSpeed = samples.reduce((a, b) => a + b, 0) / samples.length
      }

      // Zone-specific speed sampling
      const zoneChar = currentZoneCharRef.current
      if (zoneChar === 'technical' && currentSpeed > 0) {
        technicalSpeedSamplesRef.current.push(currentSpeed)
      }
      if (zoneChar === 'transit' && currentSpeed > 0) {
        highwaySpeedSamplesRef.current.push(currentSpeed)
      }

      // Recent speed for finish-line "was moving" check
      recentSpeedRef.current.push({ speed: currentSpeed, time: now })
      recentSpeedRef.current = recentSpeedRef.current.filter(s => now - s.time < 30000)
    }

    // Zone change detection via routeZones
    const currentZone = routeZones?.find(z =>
      userDistanceAlongRoute >= z.startDistance && userDistanceAlongRoute <= z.endDistance
    )
    const newZoneChar = currentZone?.character || null

    if (newZoneChar && newZoneChar !== currentZoneCharRef.current) {
      // Close previous zone entry
      const prev = zoneEntryRef.current
      if (prev.zone) {
        const zoneTime = now - prev.time
        const zoneDist = userDistanceAlongRoute - prev.distance

        const existing = stats.zoneBreakdown.find(z => z.zone === prev.zone)
        if (existing) {
          existing.distance += zoneDist
          existing.time += zoneTime
        } else {
          stats.zoneBreakdown.push({ zone: prev.zone, distance: zoneDist, time: zoneTime })
        }

        if (prev.zone === 'technical') stats.technicalTime += zoneTime
        if (prev.zone === 'transit') stats.highwayTime += zoneTime
      }

      // Start tracking new zone
      currentZoneCharRef.current = newZoneChar
      zoneEntryRef.current = { zone: newZoneChar, time: now, distance: userDistanceAlongRoute }
    }

    // Check apex sampling window
    if (apexWindowRef.current) {
      const win = apexWindowRef.current
      if (currentSpeed > win.maxSpeed) win.maxSpeed = currentSpeed

      // Close window after 10 seconds
      if (now - win.startTime > 10000) {
        if (!stats.fastestApex || win.maxSpeed > stats.fastestApex.speed) {
          stats.fastestApex = {
            speed: Math.round(win.maxSpeed),
            curveAngle: win.curveAngle,
            curveDirection: win.curveDirection,
            mile: win.mile,
          }
        }
        apexWindowRef.current = null
      }
    }
  }, [isRunning, userDistanceAlongRoute, currentSpeed, routeZones])

  // Record when a curve callout fires (called by speech planner)
  const recordCurveCallout = useCallback(({ angle, direction, mile }) => {
    const stats = statsRef.current

    // Track hardest curve
    if (!stats.hardestCurve || angle > stats.hardestCurve.angle) {
      stats.hardestCurve = { angle, direction, mile }
    }

    // Track technical curves
    if (currentZoneCharRef.current === 'technical') {
      stats.technicalCurves++
    }

    // Open 10-second apex sampling window
    apexWindowRef.current = {
      startTime: Date.now(),
      curveAngle: angle,
      curveDirection: direction,
      mile,
      maxSpeed: currentSpeedRef.current,
    }
  }, [])

  // Record when any callout is spoken
  const recordCalloutSpoken = useCallback(() => {
    statsRef.current.calloutsDelivered++
  }, [])

  // Check if driver was moving recently (for finish line)
  const wasMovingRecently = useCallback(() => {
    return recentSpeedRef.current.some(s => s.speed > 5)
  }, [])

  // Flush stats to store — call before endTrip()
  const flushStats = useCallback(() => {
    const stats = { ...statsRef.current }
    const now = Date.now()

    // Close current zone entry
    const prev = zoneEntryRef.current
    if (prev.zone) {
      const zoneTime = now - prev.time
      const zoneDist = (userDistanceAlongRoute || 0) - prev.distance

      const existing = stats.zoneBreakdown.find(z => z.zone === prev.zone)
      if (existing) {
        existing.distance += zoneDist
        existing.time += zoneTime
      } else {
        stats.zoneBreakdown.push({ zone: prev.zone, distance: zoneDist, time: zoneTime })
      }

      if (prev.zone === 'technical') stats.technicalTime += zoneTime
      if (prev.zone === 'transit') stats.highwayTime += zoneTime
    }

    // Close any open apex window
    if (apexWindowRef.current) {
      const win = apexWindowRef.current
      if (!stats.fastestApex || win.maxSpeed > stats.fastestApex.speed) {
        stats.fastestApex = {
          speed: Math.round(win.maxSpeed),
          curveAngle: win.curveAngle,
          curveDirection: win.curveDirection,
          mile: win.mile,
        }
      }
    }

    stats.driveTime = now - stats.startTime

    // Compute derived zone stats from samples
    const techSamples = technicalSpeedSamplesRef.current
    if (techSamples.length > 0) {
      stats.technicalAvgSpeed = Math.round(techSamples.reduce((a, b) => a + b, 0) / techSamples.length)
    }

    const hwySamples = highwaySpeedSamplesRef.current
    if (hwySamples.length > 0) {
      stats.highwayAvgSpeed = Math.round(hwySamples.reduce((a, b) => a + b, 0) / hwySamples.length)
      stats.highwayTopSpeed = Math.round(Math.max(...hwySamples))
    }

    // Compute zone distances from breakdown
    stats.highwayDistance = stats.zoneBreakdown
      .filter(z => z.zone === 'transit')
      .reduce((s, z) => s + z.distance, 0)
    stats.technicalDistance = stats.zoneBreakdown
      .filter(z => z.zone === 'technical')
      .reduce((s, z) => s + z.distance, 0)

    setDriveStats(stats)
    console.log('📊 Drive stats flushed to store', stats)
  }, [setDriveStats, userDistanceAlongRoute])

  return {
    driveStatsRef: statsRef,
    recordCurveCallout,
    recordCalloutSpoken,
    flushStats,
    wasMovingRecently,
  }
}

export default useDriveStats
