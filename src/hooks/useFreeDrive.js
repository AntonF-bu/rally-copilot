// =============================================
// useFreeDrive.js — Real-time road lookahead engine v2
//
// Core loop (every 2s while driving):
// 1. Get GPS position + heading
// 2. Call Mapbox Directions API → 2km ahead (every 10s)
// 3. Run curve detection on returned geometry
// 4. Diff against known curves (don't re-announce)
// 5. Announce approaching curves via speak()
//
// v2: Fixed speech timing (one speak per tick),
//     comprehensive [FreeDrive] logging
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
const SPEECH_COOLDOWN_MS = 3000       // Minimum 3s between ANY speech
const STARTUP_GRACE_MS = 6000         // No announcements for first 6s (let opening line play)

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
  // Pass degrees through — cleanForSpeech will convert to rally scale
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

  // Merge nearby angle changes into single curves (within 40m, same direction)
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
        triggerDistance: c.distance,
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
    roadClass: first.driving_side || '',
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
    roadsVisited: {},
    paused: false,
    lastSpeakTime: 0,    // v2: global speech cooldown
    tickCount: 0,         // v2: for logging
  })

  // v3: Sync props into stable refs so tick() doesn't depend on them
  const positionRef = useRef(position)
  const speedRef = useRef(speed)
  const speakRef = useRef(speak)
  const isActiveRef = useRef(isActive)

  useEffect(() => { positionRef.current = position }, [position])
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { speakRef.current = speak }, [speak])
  useEffect(() => { isActiveRef.current = isActive }, [isActive])

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

    console.log(`[FreeDrive] API call: (${pos[1].toFixed(4)},${pos[0].toFixed(4)}) → (${target[1].toFixed(4)},${target[0].toFixed(4)}) heading=${Math.round(hdg)}°`)

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

    // Extract road class from first step
    const roadClass = steps[0]?.ref || steps[0]?.name || 'unknown'

    stateRef.current.apiCallCount++

    console.log(`[FreeDrive] API response: ${latency}ms | ${coords.length} pts | road: ${steps[0]?.name || '?'} | class: ${roadClass}`)

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
      let cumDist = 0
      for (const step of steps) {
        if (step.maneuver?.type === junction.type) {
          junctionDist = cumDist
          break
        }
        cumDist += step.distance || 0
      }
      state.junctionAhead = { ...junction, distanceFromDriver: junctionDist }
      if (!state.junctionAnnounced) {
        console.log(`[FreeDrive] Junction detected: ${junction.type} in ${Math.round(junctionDist)}m`)
      }
    } else {
      state.junctionAhead = null
      state.junctionAnnounced = false
    }

    // Filter out curves beyond junction
    const safeCurves = junction && junctionDist > 0
      ? curves.filter(c => c.distanceFromDriver < junctionDist)
      : curves

    // Update curves: keep announced set stable, add new ones
    // v3: Proximity-based dedup — same physical curve gets slightly different
    // GPS coords between API calls, generating different IDs. Check if a "new"
    // curve is within 50m of an announced curve with same direction.
    const isAlreadyAnnounced = (curve) => {
      if (state.announcedCurves.has(curve.id)) return true
      // Check proximity to any announced curve
      for (const announcedId of state.announcedCurves) {
        const announced = state.detectedCurves.find(c => c.id === announcedId)
        if (!announced) continue
        if (announced.direction !== curve.direction) continue
        const dist = haversine(announced.position, curve.position)
        if (dist < 50) {
          // Same physical curve — add this ID to announced set too
          state.announcedCurves.add(curve.id)
          return true
        }
      }
      return false
    }
    const newCurves = safeCurves.filter(c => !isAlreadyAnnounced(c))
    state.detectedCurves = safeCurves

    // Extract road info
    const roadInfo = extractRoadInfo(steps)
    if (roadInfo.name && roadInfo.name !== state.roadName) {
      state.prevRoadName = state.roadName
      state.roadName = roadInfo.name

      if (!state.roadsVisited[roadInfo.name]) {
        state.roadsVisited[roadInfo.name] = { distance: 0, curves: 0, speedSamples: [] }
      }

      if (state.prevRoadName) {
        console.log(`[FreeDrive] Road changed: ${state.prevRoadName} → ${state.roadName}`)
      } else {
        console.log(`[FreeDrive] Road: ${state.roadName}`)
      }
    }

    // Update position
    state.lastPosition = currentPos
    state.lastApiCall = Date.now()

    // Log curve detection results
    if (safeCurves.length > 0) {
      const curveIds = safeCurves.slice(0, 4).map(c => `${c.direction[0]}${c.angle}°@${Math.round(c.distanceFromDriver)}m`).join(', ')
      console.log(`[FreeDrive] Curves detected: ${safeCurves.length} total | ${newCurves.length} new | ${curveIds}`)
    }

    console.log(`[FreeDrive] 🗺️ Geometry updated: ${coords.length} pts for map`)

    return { newCurves, allCurves: safeCurves }
  }, [])

  // ── Check if speech is allowed (global cooldown + startup grace) ──
  const canSpeak = useCallback((state, now) => {
    // Startup grace period — let opening line play
    if (state.startTime && (now - state.startTime) < STARTUP_GRACE_MS) {
      return false
    }
    // Global speech cooldown
    if ((now - state.lastSpeakTime) < SPEECH_COOLDOWN_MS) {
      return false
    }
    return true
  }, [])

  // ── Main tick (called from App.jsx effect) ──
  // v3: Read position/speed/speak from REFS, not closure — makes tick stable
  const tick = useCallback(async () => {
    const isAct = isActiveRef.current
    const pos = positionRef.current
    const spd = speedRef.current
    const spk = speakRef.current

    if (!isAct || !pos) return null

    const state = stateRef.current
    const now = Date.now()
    const hdg = reliableHeadingRef.current

    state.tickCount++

    // Initialize start time
    if (!state.startTime) state.startTime = now

    // Speed sample
    if (spd > 0) {
      state.speedSamples.push(spd)
      if (state.speedSamples.length > 10000) state.speedSamples = state.speedSamples.slice(-5000)

      const road = state.roadsVisited[state.roadName]
      if (road) road.speedSamples.push(spd)
    }

    // Pause: don't call API when crawling
    if (spd < MIN_SPEED_MPH) {
      if (!state.paused) {
        console.log(`[FreeDrive] Paused: speed ${Math.round(spd)}mph < ${MIN_SPEED_MPH}mph threshold`)
      }
      state.paused = true
      return null
    }
    if (state.paused) {
      console.log(`[FreeDrive] Resumed: speed ${Math.round(spd)}mph`)
    }
    state.paused = false

    // Log every tick
    console.log(`[FreeDrive] Tick #${state.tickCount}: speed=${Math.round(spd)}mph heading=${Math.round(hdg)}° pos=(${pos[1].toFixed(4)}, ${pos[0].toFixed(4)}) curves=${state.detectedCurves.length} announced=${state.announcedCurves.size}`)

    // Check if we should make an API call
    const timeSinceLast = now - state.lastApiCall
    const distSinceLast = state.lastPosition ? haversine(pos, state.lastPosition) : Infinity
    const headingChange = state.lastPosition
      ? Math.abs(angleDiff(hdg, bearing(state.lastPosition, pos)))
      : 0

    // Skip API if nothing changed significantly
    if (timeSinceLast < CALL_INTERVAL_MS &&
        distSinceLast < MIN_MOVE_FOR_CALL &&
        distSinceLast < 50 && headingChange < 15) {
      // Still process existing curves
      return processExistingState(pos, hdg, state, spk, now, canSpeak)
    }

    // Make API call
    try {
      const result = await callDirectionsAPI(pos, hdg)
      if (!result) return null

      const { newCurves, allCurves } = processLookahead(result, pos)

      // Speech: pick ONE thing to say this tick (priority: curves > junction > road)
      if (canSpeak(state, now)) {
        const spoke = trySpeakCurve(state, pos, hdg, spk, now)
        if (!spoke) {
          const spokeJunction = trySpeakJunction(state, spk, now)
          if (!spokeJunction) {
            trySpeakRoadChange(state, spk, now)
          }
        }
      }

      // Cleanup passed curves
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
  }, [callDirectionsAPI, processLookahead, canSpeak]) // v3: NO position/speed/speak deps

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
    return state.detectedCurves.map(c => ({
      ...c,
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
      lastSpeakTime: 0,
      tickCount: 0,
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

    const totalDist = state.lastPosition && state.speedSamples.length > 0
      ? avgSpeed * (elapsed / 3600000)
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

// ── Helper: process existing state without API call ──
function processExistingState(pos, hdg, state, speak, now, canSpeak) {
  // Speech: one thing per tick
  if (canSpeak(state, now)) {
    const spoke = trySpeakCurve(state, pos, hdg, speak, now)
    if (!spoke) {
      trySpeakJunction(state, speak, now)
    }
  }

  cleanupPassedCurves(state, pos, hdg)

  return {
    geometry: state.geometry,
    curves: state.detectedCurves,
    newCurves: [],
    roadName: state.roadName,
    junctionAhead: state.junctionAhead,
  }
}

// ── Helper: try to announce approaching curve (returns true if spoke) ──
function trySpeakCurve(state, pos, hdg, speak, now) {
  // Find nearest unannounced curve ahead within range
  const upcoming = state.detectedCurves
    .filter(c => {
      if (state.announcedCurves.has(c.id)) return false
      const brg = bearing(pos, c.position)
      const diff = Math.abs(angleDiff(hdg, brg))
      return diff < 90
    })
    .sort((a, b) => haversine(pos, a.position) - haversine(pos, b.position))

  if (upcoming.length === 0) return false

  const nearest = upcoming[0]
  const dist = haversine(pos, nearest.position)

  if (dist > CURVE_ANNOUNCE_DIST) {
    return false
  }

  // Build text: chain with next curve if close
  let text = nearest.text
  if (upcoming.length >= 2) {
    const second = upcoming[1]
    const secondDist = haversine(pos, second.position)
    const gap = secondDist - dist
    if (gap < 250 && gap > 0) {
      text = `${nearest.text}, ${second.text}`
      state.announcedCurves.add(second.id)
      state.totalCurvesCalled++
      console.log(`[FreeDrive] Curve chained: "${second.text}" at ${Math.round(secondDist)}m`)
    }
  }

  console.log(`[FreeDrive] Curve approaching: ${nearest.direction} ${nearest.angle}° in ${Math.round(dist)}m (announcing)`)
  console.log(`[FreeDrive] Speech queued: "${text}" | priority: high`)

  speak(text, 'high')
  state.announcedCurves.add(nearest.id)
  state.lastSpeakTime = now
  state.totalCurvesCalled++

  // Track per-road curves
  const road = state.roadsVisited[state.roadName]
  if (road) road.curves++

  return true
}

// ── Helper: try to announce road name change (returns true if spoke) ──
function trySpeakRoadChange(state, speak, now) {
  if (!state.roadName || state.roadName === state.prevRoadName) return false
  if (now - state.lastRoadAnnounce < ROAD_ANNOUNCE_COOLDOWN) return false

  const text = `Now on ${state.roadName}`
  console.log(`[FreeDrive] Speech queued: "${text}" | priority: normal`)

  speak(text, 'normal')
  state.lastSpeakTime = now
  state.lastRoadAnnounce = now
  state.prevRoadName = state.roadName

  return true
}

// ── Helper: try to announce approaching junction (returns true if spoke) ──
function trySpeakJunction(state, speak, now) {
  if (!state.junctionAhead || state.junctionAnnounced) return false
  if (state.junctionAhead.distanceFromDriver >= JUNCTION_WARN_DIST) return false

  console.log(`[FreeDrive] Speech queued: "Junction ahead" | priority: normal`)

  speak('Junction ahead', 'normal')
  state.junctionAnnounced = true
  state.lastSpeakTime = now

  return true
}

// ── Helper: remove curves the driver has passed ──
function cleanupPassedCurves(state, pos, hdg) {
  const before = state.detectedCurves.length
  state.detectedCurves = state.detectedCurves.filter(c => {
    const dist = haversine(pos, c.position)
    const brg = bearing(pos, c.position)
    const diff = Math.abs(angleDiff(hdg, brg))
    const isBehind = diff > 90 && dist > CURVE_BEHIND_BUFFER
    if (isBehind) {
      state.announcedCurves.add(c.id)
      console.log(`[FreeDrive] Curve passed: ${c.id.substring(0, 30)}`)
    }
    return !isBehind
  })
  const removed = before - state.detectedCurves.length
  if (removed > 0) {
    console.log(`[FreeDrive] Cleanup: removed ${removed} passed curves, ${state.detectedCurves.length} remaining`)
  }
}
