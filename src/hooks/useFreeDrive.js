// =============================================
// useFreeDrive.js — Geometry-only lookahead fetcher v3
//
// Does ONE thing: calls Mapbox Directions API every 10s
// from current position → 3km ahead along heading.
// Returns geometry as coordinate array. That's it.
//
// All curve detection, filtering, callout generation,
// speech, and announcement logic is handled by the
// SAME pipeline Route Mode uses (analyzeRoadFlow →
// filterEventsToCallouts → mergeCloseCallouts →
// useSpeechPlanner). See App.jsx for the wiring.
// =============================================

import { useRef, useCallback, useEffect } from 'react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const LOOKAHEAD_KM = 3
const EARTH_RADIUS = 6371000
const CALL_INTERVAL_MS = 10000        // 10s between API calls
const MIN_SPEED_MPH = 5               // Don't call API below 5mph
const HEADING_HOLD_SPEED = 10         // Below this, hold last reliable heading

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

// ── Main hook ──

export function useFreeDrive({ isActive, position, heading, speed }) {
  const stateRef = useRef({
    geometry: [],
    steps: [],
    roadName: '',
    apiCallCount: 0,
    startTime: 0,
    topSpeed: 0,
    speedSamples: [],
    roadsVisited: {},
    paused: false,
    tickCount: 0,
  })

  // API throttle + concurrency guard
  const lastApiCallRef = useRef(0)
  const tickInProgressRef = useRef(false)

  // Stable refs for props (tick doesn't depend on these changing)
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
  const callDirectionsAPI = useCallback(async (pos, hdg) => {
    const target = destinationPoint(pos, hdg, LOOKAHEAD_KM * 1000)

    console.log(`[FreeDrive] API call: (${pos[1].toFixed(4)},${pos[0].toFixed(4)}) → heading=${Math.round(hdg)}°`)

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

    stateRef.current.apiCallCount++

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

      // API throttle
      const timeSinceLastApi = now - lastApiCallRef.current
      if (timeSinceLastApi < CALL_INTERVAL_MS) {
        return null // No new data this tick
      }

      // Mark throttle BEFORE async call
      lastApiCallRef.current = now

      const result = await callDirectionsAPI(pos, hdg)
      if (!result) return null

      // Store geometry + road name
      state.geometry = result.coords
      state.steps = result.steps

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
      paused: state.paused,
      apiCallCount: state.apiCallCount,
    }
  }, [])

  // ── Reset ──
  const reset = useCallback(() => {
    stateRef.current = {
      geometry: [],
      steps: [],
      roadName: '',
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
