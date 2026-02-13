// =============================================
// useFreeDrive.js — Real-time road lookahead engine
//
// Core loop (every 10s while driving):
// 1. Get GPS position + heading
// 2. Call Mapbox Directions API → 2km ahead
// 3. Run curve detection on returned geometry
// 4. Diff against known curves (don't re-announce)
// 5. Feed new curves to speech planner
// =============================================

import { useRef, useCallback, useEffect } from 'react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const LOOKAHEAD_KM = 2
const EARTH_RADIUS = 6371000
const CALL_INTERVAL_MS = 10000        // 10s between API calls
const MIN_MOVE_FOR_CALL = 200         // 200m movement triggers immediate call
const MIN_SPEED_MPH = 5               // Don't call API below 5mph
const HEADING_HOLD_SPEED = 10         // Below this, hold last reliable heading
const ROAD_ANNOUNCE_COOLDOWN = 60000  // 1 road announcement per 60s max
const CURVE_BEHIND_BUFFER = 50        // 50m behind before removing a curve
const JUNCTION_WARN_DIST = 200        // Announce junction at 200m
const CURVE_ANNOUNCE_DIST = 300       // Announce curves within 300m
const CURVE_ANNOUNCE_COOLDOWN = 3000  // 3s between curve announcements

// ── Geo helpers ──

function toRad(d) { return d * Math.PI / 180 }
function toDeg(r) { return r * 180 / Math.PI }

function haversine([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing([lng1, lat1], [lng2, lat2]) {
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function destinationPoint([lng, lat], bearingDeg, distM) {
  const d = distM / EARTH_RADIUS
  const br = toRad(bearingDeg)
  const lat1 = toRad(lat)
  const lng1 = toRad(lng)
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
  )
  const lng2 = lng1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  )
  return [toDeg(lng2), toDeg(lat2)]
}

function angleDiff(a, b) {
  let d = ((b - a) % 360 + 360) % 360
  return d > 180 ? d - 360 : d
}

// ── Degree → rally scale text ──

function degreeToRallyText(angle, direction) {
  const absAngle = Math.abs(angle)
  const dir = direction.toLowerCase()
  if (absAngle >= 180) return `Hairpin ${dir}`
  if (absAngle >= 120) return `CAUTION - ${dir} ${absAngle}°`
  if (absAngle >= 80) return `${dir} ${absAngle}°`
  if (absAngle >= 60) return `${dir} ${absAngle}°`
  if (absAngle >= 40) return `${dir} ${absAngle}°`
  if (absAngle >= 20) return `${dir} ${absAngle}°`
  return `${dir} ${absAngle}°`
}

// ── Curve detection on geometry ──

function detectCurvesOnGeometry(coords) {
  if (coords.length < 3) return []

  const raw = []
  let dist = 0

  for (let i = 1; i < coords.length - 1; i++) {
    dist += haversine(coords[i - 1], coords[i])
    const b1 = bearing(coords[i - 1], coords[i])
    const b2 = bearing(coords[i], coords[i + 1])
    const turn = angleDiff(b1, b2)

    if (Math.abs(turn) >= 15) {
      raw.push({
        index: i,
        distance: dist,
        angle: turn,
        position: coords[i],
      })
    }
  }

  // Merge nearby angle changes into single curves (within 30m, same direction)
  const merged = []
  for (const r of raw) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(r.distance - last.distance) < 40 &&
        Math.sign(r.angle) === Math.sign(last.angle)) {
      last.angle += r.angle
      last.endDistance = r.distance
      last.endPosition = r.position
    } else {
      merged.push({
        ...r,
        endDistance: r.distance,
        endPosition: r.position,
      })
    }
  }

  // Build curve objects with stable IDs
  return merged
    .filter(c => Math.abs(c.angle) >= 15) // re-filter after merge
    .map(c => {
      const direction = c.angle > 0 ? 'Right' : 'Left'
      const absAngle = Math.round(Math.abs(c.angle))
      const pos = c.position
      const id = `${pos[1].toFixed(5)}_${pos[0].toFixed(5)}_${direction}`
      const text = degreeToRallyText(absAngle, direction)

      return {
        id,
        type: 'curve',
        text,
        direction,
        angle: absAngle,
        distanceFromDriver: c.distance,
        triggerDistance: c.distance,    // used by speech planner
        triggerMile: c.distance / 1609.34,
        position: pos,
        severity: absAngle >= 120 ? 'critical' : absAngle >= 80 ? 'high' : absAngle >= 40 ? 'medium' : 'low',
      }
    })
}

// ── Junction detection from Directions API steps ──

function detectJunctions(steps) {
  if (!steps?.length) return null
  for (const step of steps) {
    const type = step.maneuver?.type
    if (type === 'turn' || type === 'fork' || type === 'end of road' || type === 'roundabout') {
      const dist = step.distance || 0
      // Calculate distance from driver to this junction
      // step.distance is distance OF this step, not TO it
      // We need cumulative distance up to the step
      return {
        type,
        distance: dist,
        instruction: step.maneuver?.instruction || '',
      }
    }
  }
  return null
}

// ── Extract road info from steps ──

function extractRoadInfo(steps) {
  if (!steps?.length) return { name: '', roadClass: '' }
  const first = steps[0]
  return {
    name: first.name || '',
    roadClass: first.driving_side || '', // Directions API doesn't give class directly
  }
}

// ── Main hook ──

export function useFreeDrive({ isActive, position, heading, speed, speak }) {
  // Current state
  const stateRef = useRef({
    geometry: [],
    detectedCurves: [],
    announcedCurves: new Set(),
    lastApiCall: 0,
    lastPosition: null,
    lastHeading: 0,
    junctionAhead: null,
    junctionAnnounced: false,
    roadName: '',
    lastRoadAnnounce: 0,
    prevRoadName: '',
    apiCallCount: 0,
    totalCurvesCalled: 0,
    startTime: 0,
    topSpeed: 0,
    speedSamples: [],
    roadsVisited: {},     // { roadName: { distance, curves, speedSamples } }
    paused: false,
    lastCurveAnnounce: 0,
  })

  // Reliable heading ref (hold last good heading when speed drops)
  const reliableHeadingRef = useRef(0)

  // Update reliable heading
  useEffect(() => {
    if (speed > HEADING_HOLD_SPEED && heading != null) {
      reliableHeadingRef.current = heading
    }
  }, [heading, speed])

  // Track top speed
  useEffect(() => {
    if (isActive && speed > stateRef.current.topSpeed) {
      stateRef.current.topSpeed = speed
    }
  }, [isActive, speed])

  // ── API call ──
  const callDirectionsAPI = useCallback(async (pos, hdg) => {
    const target = destinationPoint(pos, hdg, LOOKAHEAD_KM * 1000)

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pos[0]},${pos[1]};${target[0]},${target[1]}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`

    const start = performance.now()
    const resp = await fetch(url)
    const data = await resp.json()
    const latency = Math.round(performance.now() - start)

    if (!data.routes?.length) {
      console.warn('[FreeDrive] No route from API')
      return null
    }

    const route = data.routes[0]
    const coords = route.geometry.coordinates
    const steps = route.legs?.[0]?.steps || []

    stateRef.current.apiCallCount++

    return { coords, steps, distance: route.distance, latency }
  }, [])

  // ── Process API response ──
  const processLookahead = useCallback((apiResult, currentPos) => {
    const state = stateRef.current
    const { coords, steps, latency } = apiResult

    // Store geometry for map display
    state.geometry = coords

    // Detect curves
    const curves = detectCurvesOnGeometry(coords)

    // Detect junction
    let junctionDist = 0
    const junction = detectJunctions(steps)
    if (junction) {
      // Calculate cumulative distance to junction step
      let cumDist = 0
      for (const step of steps) {
        if (step.maneuver?.type === junction.type) {
          junctionDist = cumDist
          break
        }
        cumDist += step.distance || 0
      }
      state.junctionAhead = { ...junction, distanceFromDriver: junctionDist }
    } else {
      state.junctionAhead = null
      state.junctionAnnounced = false
    }

    // Filter out curves beyond junction (they might be on wrong road)
    const safeCurves = junction && junctionDist > 0
      ? curves.filter(c => c.distanceFromDriver < junctionDist)
      : curves

    // Update curves: keep announced set stable, add new ones
    const newCurves = safeCurves.filter(c => !state.announcedCurves.has(c.id))
    state.detectedCurves = safeCurves

    // Extract road info
    const roadInfo = extractRoadInfo(steps)
    if (roadInfo.name && roadInfo.name !== state.roadName) {
      state.prevRoadName = state.roadName
      state.roadName = roadInfo.name

      // Track road visit
      if (!state.roadsVisited[roadInfo.name]) {
        state.roadsVisited[roadInfo.name] = { distance: 0, curves: 0, speedSamples: [] }
      }
    }

    // Update position
    state.lastPosition = currentPos
    state.lastApiCall = Date.now()

    console.log(`[FreeDrive] API: ${latency}ms | ${coords.length} pts | ${safeCurves.length} curves (${newCurves.length} new) | road: ${state.roadName}`)

    return { newCurves, allCurves: safeCurves }
  }, [])

  // ── Main tick (called from App.jsx effect) ──
  const tick = useCallback(async () => {
    if (!isActive || !position) return null

    const state = stateRef.current
    const now = Date.now()
    const pos = position // [lng, lat]
    const hdg = reliableHeadingRef.current

    // Initialize start time
    if (!state.startTime) state.startTime = now

    // Speed sample
    if (speed > 0) {
      state.speedSamples.push(speed)
      if (state.speedSamples.length > 10000) state.speedSamples = state.speedSamples.slice(-5000)

      // Track per-road speed
      const road = state.roadsVisited[state.roadName]
      if (road) road.speedSamples.push(speed)
    }

    // Pause: don't call API when crawling
    if (speed < MIN_SPEED_MPH) {
      state.paused = true
      return null
    }
    state.paused = false

    // Check if we should make an API call
    const timeSinceLast = now - state.lastApiCall
    const distSinceLast = state.lastPosition ? haversine(pos, state.lastPosition) : Infinity
    const headingChange = state.lastPosition
      ? Math.abs(angleDiff(hdg, bearing(state.lastPosition, pos)))
      : 0

    // Skip if nothing changed significantly
    if (timeSinceLast < CALL_INTERVAL_MS &&
        distSinceLast < MIN_MOVE_FOR_CALL &&
        distSinceLast < 50 && headingChange < 15) {
      // Still process existing curves (driver may be approaching them)
      return processExistingCurves(pos, hdg, state, speak, now)
    }

    // Make API call
    try {
      const result = await callDirectionsAPI(pos, hdg)
      if (!result) return null

      const { newCurves, allCurves } = processLookahead(result, pos)

      // Announce road change
      announceRoadChange(state, speak, now)

      // Announce approaching curves
      announceCurves(state, pos, hdg, speak, now)

      // Announce junction if approaching
      announceJunction(state, speak)

      // Remove curves that are behind the driver
      cleanupPassedCurves(state, pos, hdg)

      return {
        geometry: state.geometry,
        curves: allCurves,
        newCurves,
        roadName: state.roadName,
        junctionAhead: state.junctionAhead,
        apiLatency: result.latency,
      }
    } catch (err) {
      console.error('[FreeDrive] API error:', err)
      return null
    }
  }, [isActive, position, speed, callDirectionsAPI, processLookahead, speak])

  // ── Get current state (for HUD) ──
  const getState = useCallback(() => {
    const state = stateRef.current
    const avgSpeed = state.speedSamples.length > 0
      ? state.speedSamples.reduce((a, b) => a + b, 0) / state.speedSamples.length
      : 0

    return {
      geometry: state.geometry,
      detectedCurves: state.detectedCurves,
      roadName: state.roadName,
      junctionAhead: state.junctionAhead,
      paused: state.paused,
      apiCallCount: state.apiCallCount,
      totalCurvesCalled: state.totalCurvesCalled,
      topSpeed: state.topSpeed,
      avgSpeed,
      startTime: state.startTime,
      roadsVisited: state.roadsVisited,
    }
  }, [])

  // ── Build callouts array for speech planner ──
  const getCalloutsForPlanner = useCallback((currentDist) => {
    const state = stateRef.current
    // Convert free drive curves to the format speech planner expects
    return state.detectedCurves.map(c => ({
      ...c,
      // triggerDistance relative to some "virtual route start"
      // For free drive, we use distance-from-driver directly
      triggerDistance: currentDist + c.distanceFromDriver,
      triggerMile: (currentDist + c.distanceFromDriver) / 1609.34,
    }))
  }, [])

  // ── Reset state ──
  const reset = useCallback(() => {
    stateRef.current = {
      geometry: [],
      detectedCurves: [],
      announcedCurves: new Set(),
      lastApiCall: 0,
      lastPosition: null,
      lastHeading: 0,
      junctionAhead: null,
      junctionAnnounced: false,
      roadName: '',
      lastRoadAnnounce: 0,
      prevRoadName: '',
      apiCallCount: 0,
      totalCurvesCalled: 0,
      startTime: 0,
      topSpeed: 0,
      speedSamples: [],
      roadsVisited: {},
      paused: false,
      lastCurveAnnounce: 0,
    }
    reliableHeadingRef.current = 0
  }, [])

  // ── Get trip stats for summary ──
  const getTripStats = useCallback(() => {
    const state = stateRef.current
    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    const avgSpeed = state.speedSamples.length > 0
      ? state.speedSamples.reduce((a, b) => a + b, 0) / state.speedSamples.length
      : 0

    // Estimate total distance from speed samples (each ~1s apart in the tick)
    // Better: use GPS position history
    const totalDist = state.lastPosition && state.speedSamples.length > 0
      ? avgSpeed * (elapsed / 3600000) // rough: avg mph * hours → miles
      : 0

    return {
      driveTime: elapsed,
      avgSpeed: Math.round(avgSpeed),
      topSpeed: Math.round(state.topSpeed),
      totalCurvesCalled: state.totalCurvesCalled,
      apiCallCount: state.apiCallCount,
      totalDistanceMiles: totalDist,
      roadsVisited: Object.entries(state.roadsVisited).map(([name, data]) => ({
        name,
        curves: data.curves,
        avgSpeed: data.speedSamples.length > 0
          ? Math.round(data.speedSamples.reduce((a, b) => a + b, 0) / data.speedSamples.length)
          : 0,
      })),
    }
  }, [])

  return { tick, getState, getCalloutsForPlanner, reset, getTripStats }
}

// ── Helper: process existing curves without API call ──
function processExistingCurves(pos, hdg, state, speak, now) {
  announceCurves(state, pos, hdg, speak, now)
  announceJunction(state, speak)
  cleanupPassedCurves(state, pos, hdg)

  return {
    geometry: state.geometry,
    curves: state.detectedCurves,
    newCurves: [],
    roadName: state.roadName,
    junctionAhead: state.junctionAhead,
  }
}

// ── Helper: announce approaching curves ──
function announceCurves(state, pos, hdg, speak, now) {
  if (now - state.lastCurveAnnounce < CURVE_ANNOUNCE_COOLDOWN) return

  // Find nearest unannounced curve within announce distance
  const upcoming = state.detectedCurves
    .filter(c => {
      if (state.announcedCurves.has(c.id)) return false
      // Check it's ahead, not behind
      const brg = bearing(pos, c.position)
      const diff = Math.abs(angleDiff(hdg, brg))
      return diff < 90
    })
    .sort((a, b) => a.distanceFromDriver - b.distanceFromDriver)

  if (upcoming.length === 0) return

  const nearest = upcoming[0]
  // Adaptive announce distance: faster = earlier warning
  // ~80m at 20mph, ~250m at 60mph
  const dist = haversine(pos, nearest.position)
  if (dist > CURVE_ANNOUNCE_DIST) return

  // Check for chain: is there another curve within 250m?
  let text = nearest.text
  if (upcoming.length >= 2) {
    const second = upcoming[1]
    const gap = second.distanceFromDriver - nearest.distanceFromDriver
    if (gap < 250 && gap > 0) {
      text = `${nearest.text}, ${second.text}`
      state.announcedCurves.add(second.id)
      state.totalCurvesCalled++
    }
  }

  speak(text, 'high')
  state.announcedCurves.add(nearest.id)
  state.lastCurveAnnounce = now
  state.totalCurvesCalled++

  // Track per-road curves
  const road = state.roadsVisited[state.roadName]
  if (road) road.curves++

  console.log(`[FreeDrive] Announce: "${text}" at ${Math.round(dist)}m`)
}

// ── Helper: announce road name change ──
function announceRoadChange(state, speak, now) {
  if (!state.roadName || state.roadName === state.prevRoadName) return
  if (now - state.lastRoadAnnounce < ROAD_ANNOUNCE_COOLDOWN) return

  const text = `Now on ${state.roadName}`
  speak(text, 'normal')
  state.lastRoadAnnounce = now
  state.prevRoadName = state.roadName
  console.log(`[FreeDrive] Road: ${text}`)
}

// ── Helper: announce approaching junction ──
function announceJunction(state, speak) {
  if (!state.junctionAhead || state.junctionAnnounced) return
  if (state.junctionAhead.distanceFromDriver < JUNCTION_WARN_DIST) {
    speak('Junction ahead', 'normal')
    state.junctionAnnounced = true
    console.log(`[FreeDrive] Junction announced at ${state.junctionAhead.distanceFromDriver}m`)
  }
}

// ── Helper: remove curves the driver has passed ──
function cleanupPassedCurves(state, pos, hdg) {
  state.detectedCurves = state.detectedCurves.filter(c => {
    const dist = haversine(pos, c.position)
    // Check if curve is behind us (bearing from pos to curve vs our heading)
    const brg = bearing(pos, c.position)
    const diff = Math.abs(angleDiff(hdg, brg))
    const isBehind = diff > 90 && dist > CURVE_BEHIND_BUFFER
    if (isBehind) {
      state.announcedCurves.add(c.id)
    }
    return !isBehind
  })
}
