// =============================================
// useFreeDrive.js — Smart geometry fetcher v4
//
// Fetches lookahead geometry from Mapbox Directions API
// using smart triggers instead of fixed timer:
//   A) Remaining lookahead distance < 800m
//   B) Driver off-path (>50m from geometry)
//   C) Initial load (first tick)
//
// Zone-adaptive: detects road class from API response
// and adjusts lookahead distance accordingly.
//
// All curve detection, filtering, callout generation,
// speech, and announcement logic is handled by the
// SAME pipeline Route Mode uses. See App.jsx for wiring.
// =============================================

import { useRef, useCallback, useEffect } from 'react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const EARTH_RADIUS = 6371000
const MIN_COOLDOWN_MS = 5000          // 5s minimum between API calls
const MIN_SPEED_MPH = 5               // Don't call API below 5mph
const HEADING_HOLD_SPEED = 10         // Below this, hold last reliable heading
const LOOKAHEAD_LOW_THRESHOLD = 800   // Trigger A: remaining lookahead < 800m
const OFF_PATH_THRESHOLD = 50         // Trigger B: >50m from geometry = off-path

// ── Geo helpers ──

function toRad(d) { return d * Math.PI / 180 }
function toDeg(r) { return r * 180 / Math.PI }

export function haversine([lng1, lat1], [lng2, lat2]) {
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

// Find minimum distance from a point to any vertex of a polyline
function closestPointDistance(point, geometry) {
  if (!geometry?.length) return Infinity
  let minDist = Infinity
  // Sample every few points for performance (Mapbox geometries have hundreds of points)
  const step = Math.max(1, Math.floor(geometry.length / 100))
  for (let i = 0; i < geometry.length; i += step) {
    const d = haversine(point, geometry[i])
    if (d < minDist) minDist = d
  }
  // Always check last point
  const last = haversine(point, geometry[geometry.length - 1])
  if (last < minDist) minDist = last
  return minDist
}

// Compute total length of a geometry polyline (meters)
function computeGeometryLength(geometry) {
  if (!geometry?.length || geometry.length < 2) return 0
  let total = 0
  for (let i = 1; i < geometry.length; i++) {
    total += haversine(geometry[i - 1], geometry[i])
  }
  return total
}

// ── Zone detection from Mapbox steps ──

// Detect dominant road class from Directions API steps
// Returns: 'highway' | 'technical' | 'urban'
export function detectRoadClass(steps) {
  if (!steps?.length) return 'technical'

  // Check road names/refs for highway indicators first (most reliable)
  const firstName = (steps[0]?.name || '').toLowerCase()
  const firstRef = (steps[0]?.ref || '').toUpperCase()

  if (firstRef.match(/^I-\d/) || firstName.includes('turnpike') ||
      firstName.includes('expressway') || firstName.includes('interstate') ||
      firstName.includes('freeway') || firstName.includes('motorway')) {
    return 'highway'
  }

  // Check intersection classes across all steps
  const classCounts = { highway: 0, technical: 0, urban: 0 }
  let totalChecked = 0

  for (const step of steps) {
    const intersections = step.intersections || []
    for (const inter of intersections) {
      const classes = inter.classes || []
      totalChecked++

      if (classes.includes('motorway') || classes.includes('trunk')) {
        classCounts.highway++
      } else if (classes.includes('tertiary') || classes.includes('residential') || classes.includes('service')) {
        classCounts.urban++
      } else {
        // primary, secondary, unclassified → technical
        classCounts.technical++
      }
    }
  }

  if (totalChecked === 0) return 'technical'

  // Dominant class wins (with highway bias — even 30% highway = highway)
  if (classCounts.highway > totalChecked * 0.3) return 'highway'
  if (classCounts.urban > classCounts.technical) return 'urban'
  return 'technical'
}

// Zone-adaptive lookahead distance (km)
function getLookaheadKm(roadClass) {
  switch (roadClass) {
    case 'highway': return 5
    case 'urban': return 1
    default: return 3  // technical
  }
}

// ── Main hook ──

export function useFreeDrive({ isActive, position, heading, speed }) {
  const stateRef = useRef({
    geometry: [],
    steps: [],
    geometryLength: 0,
    roadName: '',
    roadClass: 'technical',
    apiCallCount: 0,
    startTime: 0,
    topSpeed: 0,
    speedSamples: [],
    roadsVisited: {},
    paused: false,
    tickCount: 0,
  })

  // API tracking
  const lastApiCallRef = useRef(0)
  const lastApiPositionRef = useRef(null)
  const tickInProgressRef = useRef(false)

  // Stable refs for props
  const positionRef = useRef(position)
  const speedRef = useRef(speed)
  const isActiveRef = useRef(isActive)
  const reliableHeadingRef = useRef(0)

  useEffect(() => { positionRef.current = position }, [position])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { isActiveRef.current = isActive }, [isActive])

  // Hold last reliable heading when speed drops
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
  const callDirectionsAPI = useCallback(async (pos, hdg, lookaheadKm) => {
    const target = destinationPoint(pos, hdg, lookaheadKm * 1000)

    console.log(`[FreeDrive] API call: (${pos[1].toFixed(4)},${pos[0].toFixed(4)}) → hdg=${Math.round(hdg)}° ahead=${lookaheadKm}km`)

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pos[0]},${pos[1]};${target[0]},${target[1]}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`

    const start = performance.now()
    const resp = await fetch(url)
    const data = await resp.json()
    const latency = Math.round(performance.now() - start)

    if (!data.routes?.length) {
      console.warn('[FreeDrive] API: no route returned')
      return null
    }

    const route = data.routes[0]
    const coords = route.geometry.coordinates
    const steps = route.legs?.[0]?.steps || []

    console.log(`[FreeDrive] API: ${latency}ms | ${coords.length} pts | ${Math.round(route.distance)}m | road: ${steps[0]?.name || '?'}`)

    return { coords, steps, distance: route.distance, latency }
  }, [])

  // ── Main tick ──
  const tick = useCallback(async () => {
    if (tickInProgressRef.current) return null
    tickInProgressRef.current = true

    try {
      const pos = positionRef.current
      const spd = speedRef.current

      if (!isActiveRef.current || !pos) return null

      const state = stateRef.current
      const now = Date.now()
      const hdg = reliableHeadingRef.current

      state.tickCount++
      if (!state.startTime) state.startTime = now

      // Speed samples
      if (spd > 0) {
        state.speedSamples.push(spd)
        if (state.speedSamples.length > 10000) state.speedSamples = state.speedSamples.slice(-5000)
      }

      // Pause when crawling
      if (spd < MIN_SPEED_MPH) {
        if (!state.paused) {
          console.log(`[FreeDrive] Paused: speed ${Math.round(spd)}mph < ${MIN_SPEED_MPH}mph`)
        }
        state.paused = true
        return null
      }
      if (state.paused) {
        console.log(`[FreeDrive] Resumed: speed ${Math.round(spd)}mph`)
      }
      state.paused = false

      // ── Smart trigger evaluation ──
      let shouldCallApi = false
      let triggerReason = ''
      let offPath = false

      // Trigger C: Initial load
      if (state.apiCallCount === 0) {
        shouldCallApi = true
        triggerReason = 'initial'
      }

      // Cooldown check (skip for initial load)
      if (!shouldCallApi) {
        const timeSinceLastApi = now - lastApiCallRef.current
        if (timeSinceLastApi < MIN_COOLDOWN_MS) {
          return null
        }
      }

      // Trigger B: Off-path detection
      if (!shouldCallApi && state.geometry.length > 0) {
        const closestDist = closestPointDistance(pos, state.geometry)
        if (closestDist > OFF_PATH_THRESHOLD) {
          shouldCallApi = true
          offPath = true
          triggerReason = `off-path (${Math.round(closestDist)}m from lookahead)`
          console.log(`[FreeDrive] Off-path detected: ${Math.round(closestDist)}m from lookahead, refreshing`)
        }
      }

      // Trigger A: End of lookahead approaching
      if (!shouldCallApi && state.geometry.length > 0 && lastApiPositionRef.current) {
        const distTraveled = haversine(lastApiPositionRef.current, pos)
        const remaining = state.geometryLength - distTraveled
        if (remaining < LOOKAHEAD_LOW_THRESHOLD) {
          shouldCallApi = true
          triggerReason = `lookahead low (${Math.round(remaining)}m remaining)`
        }
      }

      if (!shouldCallApi) return null

      console.log(`[FreeDrive] Trigger: ${triggerReason}`)

      // Mark API call time BEFORE async call
      lastApiCallRef.current = now
      lastApiPositionRef.current = [...pos]

      // Adaptive lookahead based on current road class
      const lookaheadKm = getLookaheadKm(state.roadClass)

      const result = await callDirectionsAPI(pos, hdg, lookaheadKm)
      if (!result) return null

      // Store geometry + compute length
      state.geometry = result.coords
      state.steps = result.steps
      state.geometryLength = computeGeometryLength(result.coords)
      state.apiCallCount++

      // Detect road class from API response
      const newRoadClass = detectRoadClass(result.steps)
      if (newRoadClass !== state.roadClass) {
        const oldClass = state.roadClass
        state.roadClass = newRoadClass
        if (state.apiCallCount > 1) {
          console.log(`[FreeDrive] Zone: ${oldClass} → ${newRoadClass}`)
        }
      }

      // Road name tracking
      const name = result.steps[0]?.name || ''
      if (name && name !== state.roadName) {
        if (state.roadName) {
          console.log(`[FreeDrive] Road: ${state.roadName} → ${name}`)
        } else {
          console.log(`[FreeDrive] Road: ${name}`)
        }
        state.roadName = name
        if (!state.roadsVisited[name]) {
          state.roadsVisited[name] = { distance: 0, speedSamples: [] }
        }
      }

      return {
        geometry: result.coords,
        steps: result.steps,
        distance: result.distance,
        roadName: state.roadName,
        roadClass: state.roadClass,
        offPath,
      }
    } catch (err) {
      console.error('[FreeDrive] API error:', err)
      return null
    } finally {
      tickInProgressRef.current = false
    }
  }, [callDirectionsAPI])

  // ── Get current state (for HUD + Map) ──
  const getState = useCallback(() => {
    const state = stateRef.current
    return {
      geometry: state.geometry,
      roadName: state.roadName,
      roadClass: state.roadClass,
      paused: state.paused,
      apiCallCount: state.apiCallCount,
    }
  }, [])

  // ── Reset ──
  const reset = useCallback(() => {
    stateRef.current = {
      geometry: [],
      steps: [],
      geometryLength: 0,
      roadName: '',
      roadClass: 'technical',
      apiCallCount: 0,
      startTime: 0,
      topSpeed: 0,
      speedSamples: [],
      roadsVisited: {},
      paused: false,
      tickCount: 0,
    }
    reliableHeadingRef.current = 0
    lastApiCallRef.current = 0
    lastApiPositionRef.current = null
    tickInProgressRef.current = false
  }, [])

  // ── Trip stats for summary ──
  const getTripStats = useCallback(() => {
    const state = stateRef.current
    const elapsed = state.startTime ? Date.now() - state.startTime : 0
    const avgSpeed = state.speedSamples.length > 0
      ? state.speedSamples.reduce((a, b) => a + b, 0) / state.speedSamples.length
      : 0

    return {
      driveTime: elapsed,
      avgSpeed: Math.round(avgSpeed),
      topSpeed: Math.round(state.topSpeed),
      apiCallCount: state.apiCallCount,
      totalDistanceMiles: avgSpeed * (elapsed / 3600000),
      roadsVisited: Object.keys(state.roadsVisited).map(name => ({ name })),
    }
  }, [])

  return { tick, getState, reset, getTripStats }
}
