import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'

// ================================
// Free Drive Simulator - v1
// Walks along pre-fetched road geometry,
// feeding synthetic GPS to the store.
// useFreeDrive sees it as real GPS.
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// MA-181 technical section near Belchertown/Amherst
// Use intermediate waypoints to keep Mapbox on Route 181
const MA181_WAYPOINTS = [
  [-72.4099, 42.2871],  // North — Belchertown center
  [-72.3952, 42.2562],  // Mid — stay on 181
  [-72.3621, 42.2103],  // South-mid — curvy section
  [-72.3388, 42.1773],  // South — near Palmer
]

// Update rate (ms) — ~1Hz like real GPS
const UPDATE_INTERVAL_MS = 1000

export function useFreeDriveSim(enabled) {
  const {
    setPosition,
    setHeading,
    setSpeed,
    setGps,
    setIsSimulating,
  } = useStore()

  const coordsRef = useRef(null)        // Fetched route coordinates
  const segmentsRef = useRef(null)       // { lengths[], totalLength }
  const distAlongRef = useRef(0)         // Current distance along route (meters)
  const pausedRef = useRef(false)        // Play/pause state
  const speedMphRef = useRef(40)         // Simulated speed (mph)
  const timerRef = useRef(null)          // setInterval handle
  const initedRef = useRef(false)        // Prevent double-init
  const lastUpdateRef = useRef(0)        // Timestamp of last tick

  // ── Fetch MA-181 geometry from Mapbox ──
  const fetchRoute = useCallback(async () => {
    if (initedRef.current) return coordsRef.current
    initedRef.current = true

    try {
      const waypointStr = MA181_WAYPOINTS.map(p => `${p[0]},${p[1]}`).join(';')
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${waypointStr}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
      const res = await fetch(url)
      const data = await res.json()

      if (!data.routes?.[0]?.geometry?.coordinates?.length) {
        console.error('🎮 Free Drive Sim: no route returned')
        return null
      }

      const coords = data.routes[0].geometry.coordinates
      const segs = calculateSegments(coords)
      coordsRef.current = coords
      segmentsRef.current = segs

      console.log(`🎮 Free Drive Sim: loaded ${coords.length} coords, ${(segs.totalLength / 1609.34).toFixed(1)} mi`)
      return coords
    } catch (err) {
      console.error('🎮 Free Drive Sim: route fetch failed', err)
      return null
    }
  }, [])

  // ── Position interpolation along route ──
  const getPositionAtDistance = useCallback((dist) => {
    const coords = coordsRef.current
    const segs = segmentsRef.current
    if (!coords || !segs) return null

    const clampedDist = Math.max(0, Math.min(dist, segs.totalLength))
    let accum = 0

    for (let i = 0; i < segs.lengths.length; i++) {
      if (accum + segs.lengths[i] > clampedDist) {
        const segFraction = (clampedDist - accum) / segs.lengths[i]
        const p1 = coords[i]
        const p2 = coords[i + 1]
        const lng = p1[0] + (p2[0] - p1[0]) * segFraction
        const lat = p1[1] + (p2[1] - p1[1]) * segFraction

        // Heading: look ahead ~5 segments for smoothness
        const lookIdx = Math.min(i + 5, coords.length - 1)
        const heading = getBearing([lng, lat], coords[lookIdx])

        return { position: [lng, lat], heading, segmentIndex: i }
      }
      accum += segs.lengths[i]
    }

    // At end
    const last = coords[coords.length - 1]
    const prev = coords[coords.length - 2] || last
    return { position: last, heading: getBearing(prev, last), segmentIndex: coords.length - 2 }
  }, [])

  // ── Simulation tick — called at ~1Hz ──
  const tick = useCallback(() => {
    if (pausedRef.current) return
    if (!coordsRef.current || !segmentsRef.current) return

    const now = Date.now()
    const dt = lastUpdateRef.current ? Math.min((now - lastUpdateRef.current) / 1000, 2) : 1
    lastUpdateRef.current = now

    // Advance distance
    const speedMps = (speedMphRef.current * 1609.34) / 3600
    distAlongRef.current += speedMps * dt

    // Check if finished
    if (distAlongRef.current >= segmentsRef.current.totalLength) {
      console.log('🎮 Free Drive Sim: reached end of route')
      distAlongRef.current = segmentsRef.current.totalLength - 1
      pausedRef.current = true
    }

    const posData = getPositionAtDistance(distAlongRef.current)
    if (!posData) return

    // v4: Single store mutation → single re-render (was 3 separate calls)
    setGps(posData.position, posData.heading, speedMphRef.current)

    // Log every 5th tick to avoid flooding
    if (Math.round(distAlongRef.current) % 100 < 20) {
      const pct = ((distAlongRef.current / segmentsRef.current.totalLength) * 100).toFixed(1)
      console.log(`[FreeDrive] 🎮 Sim: ${pct}% | ${speedMphRef.current}mph | pos=(${posData.position[1].toFixed(4)}, ${posData.position[0].toFixed(4)}) | hdg=${Math.round(posData.heading)}°`)
    }
  }, [getPositionAtDistance, setGps])

  // ── Initialize on enable ──
  useEffect(() => {
    if (!enabled) return

    let mounted = true

    const init = async () => {
      const coords = await fetchRoute()
      if (!mounted || !coords) return

      setIsSimulating(true)

      // Set initial position
      const posData = getPositionAtDistance(0)
      if (posData) {
        setPosition(posData.position)
        setHeading(posData.heading)
        setSpeed(0)
      }

      console.log('🎮 Free Drive Sim: ready — hit play to start')
    }

    init()

    return () => {
      mounted = false
    }
  }, [enabled, fetchRoute, getPositionAtDistance, setPosition, setHeading, setSpeed, setIsSimulating])

  // ── Tick loop ──
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(tick, UPDATE_INTERVAL_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, tick])

  // ── Cleanup on disable ──
  useEffect(() => {
    if (!enabled) {
      distAlongRef.current = 0
      lastUpdateRef.current = 0
      pausedRef.current = false
      initedRef.current = false
      coordsRef.current = null
      segmentsRef.current = null
    }
  }, [enabled])

  // ── Controls API ──
  const play = useCallback(() => {
    pausedRef.current = false
    lastUpdateRef.current = Date.now()
    console.log('🎮 ▶ Playing')
  }, [])

  const pause = useCallback(() => {
    pausedRef.current = true
    console.log('🎮 ⏸ Paused')
  }, [])

  const togglePause = useCallback(() => {
    if (pausedRef.current) play()
    else pause()
  }, [play, pause])

  const setSimSpeed = useCallback((mph) => {
    speedMphRef.current = Math.max(5, Math.min(120, mph))
  }, [])

  const getSimState = useCallback(() => {
    const segs = segmentsRef.current
    const posData = getPositionAtDistance(distAlongRef.current)
    return {
      paused: pausedRef.current,
      speedMph: speedMphRef.current,
      distanceAlong: distAlongRef.current,
      totalDistance: segs?.totalLength || 0,
      progressPercent: segs ? (distAlongRef.current / segs.totalLength) * 100 : 0,
      position: posData?.position || null,
      heading: posData?.heading || 0,
      ready: !!coordsRef.current,
    }
  }, [getPositionAtDistance])

  return {
    play,
    pause,
    togglePause,
    setSimSpeed,
    getSimState,
  }
}

// ================================
// HELPERS
// ================================

function calculateSegments(coordinates) {
  const lengths = []
  let totalLength = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    const d = getDistanceBetween(coordinates[i], coordinates[i + 1])
    lengths.push(d)
    totalLength += d
  }
  return { lengths, totalLength }
}

function getDistanceBetween(c1, c2) {
  const R = 6371e3
  const φ1 = c1[1] * Math.PI / 180
  const φ2 = c2[1] * Math.PI / 180
  const Δφ = (c2[1] - c1[1]) * Math.PI / 180
  const Δλ = (c2[0] - c1[0]) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function getBearing(start, end) {
  const sLat = start[1] * Math.PI / 180
  const sLng = start[0] * Math.PI / 180
  const eLat = end[1] * Math.PI / 180
  const eLng = end[0] * Math.PI / 180
  const dLng = eLng - sLng
  const x = Math.sin(dLng) * Math.cos(eLat)
  const y = Math.cos(sLat) * Math.sin(eLat) - Math.sin(sLat) * Math.cos(eLat) * Math.cos(dLng)
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
}

export default useFreeDriveSim
