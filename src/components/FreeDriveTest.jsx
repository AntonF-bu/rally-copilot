// =============================================
// Free Drive Lookahead Prototype
// Tests two approaches to road geometry extraction:
//   A) Tile-based: querySourceFeatures + stitching
//   B) Directions API: Mapbox routing as lookahead
// =============================================

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
mapboxgl.accessToken = MAPBOX_TOKEN

// MA-181 technical section near Amherst
const DEFAULT_CENTER = [-72.40, 42.28]
const DEFAULT_ZOOM = 14
const LOOKAHEAD_METERS = 2000
const EARTH_RADIUS = 6371000

// ── Geo Helpers ──

function toRad(deg) { return deg * Math.PI / 180 }
function toDeg(rad) { return rad * 180 / Math.PI }

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

function destinationPoint([lng, lat], bearingDeg, distMeters) {
  const d = distMeters / EARTH_RADIUS
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

function lineLength(coords) {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversine(coords[i - 1], coords[i])
  }
  return total
}

// ── Tile-based road stitching ──

function stitchRoad(features, startPos, headingDeg) {
  if (!features.length) return { coords: [], featureCount: 0, junctionDetected: false }

  // Flatten all feature geometries into line segments with endpoints
  const segments = []
  for (const f of features) {
    const geom = f.geometry
    if (!geom) continue
    const lines = geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates]
    for (const line of lines) {
      if (!line || line.length < 2) continue
      segments.push({
        coords: line,
        start: line[0],
        end: line[line.length - 1],
        roadClass: f.properties?.class || '',
        structure: f.properties?.structure || '',
      })
    }
  }

  // Filter out non-road segments
  const roadSegments = segments.filter(s => {
    const cls = s.roadClass
    if (['path', 'ferry', 'pedestrian', 'track'].includes(cls)) return false
    if (s.structure === 'tunnel') return false // optional: skip tunnels
    return true
  })

  if (!roadSegments.length) return { coords: [], featureCount: 0, junctionDetected: false }

  // Find segment closest to start position
  let bestSeg = null
  let bestDist = Infinity
  let bestEnd = 'start' // which end is closer

  for (const seg of roadSegments) {
    const dStart = haversine(startPos, seg.start)
    const dEnd = haversine(startPos, seg.end)
    if (dStart < bestDist) { bestDist = dStart; bestSeg = seg; bestEnd = 'start' }
    if (dEnd < bestDist) { bestDist = dEnd; bestSeg = seg; bestEnd = 'end' }
  }

  if (!bestSeg || bestDist > 50) return { coords: [], featureCount: 0, junctionDetected: false }

  // Orient the first segment so we walk in the heading direction
  let currentCoords = bestEnd === 'end' ? [...bestSeg.coords].reverse() : [...bestSeg.coords]

  // Check if the segment direction aligns with heading
  if (currentCoords.length >= 2) {
    const segBearing = bearing(currentCoords[0], currentCoords[currentCoords.length - 1])
    if (Math.abs(angleDiff(headingDeg, segBearing)) > 90) {
      currentCoords.reverse()
    }
  }

  const stitched = [...currentCoords]
  const usedSegments = new Set([roadSegments.indexOf(bestSeg)])
  let totalLength = lineLength(currentCoords)
  let junctionDetected = false
  let iterations = 0

  // Walk forward, connecting segments at endpoints
  while (totalLength < LOOKAHEAD_METERS && iterations < 200) {
    iterations++
    const tip = stitched[stitched.length - 1]
    const tipBearing = stitched.length >= 2
      ? bearing(stitched[stitched.length - 2], tip)
      : headingDeg

    // Find connecting segments
    const candidates = []
    for (let i = 0; i < roadSegments.length; i++) {
      if (usedSegments.has(i)) continue
      const seg = roadSegments[i]
      const dStart = haversine(tip, seg.start)
      const dEnd = haversine(tip, seg.end)

      if (dStart < 15) {
        const segBearing = bearing(seg.start, seg.end)
        if (Math.abs(angleDiff(tipBearing, segBearing)) < 60) {
          candidates.push({ idx: i, coords: seg.coords, dist: dStart })
        }
      }
      if (dEnd < 15) {
        const segBearing = bearing(seg.end, seg.start)
        if (Math.abs(angleDiff(tipBearing, segBearing)) < 60) {
          candidates.push({ idx: i, coords: [...seg.coords].reverse(), dist: dEnd })
        }
      }
    }

    if (candidates.length === 0) break
    if (candidates.length > 1) junctionDetected = true

    // Pick the best candidate (closest, most aligned)
    candidates.sort((a, b) => a.dist - b.dist)
    const best = candidates[0]
    usedSegments.add(best.idx)

    // Append (skip first point to avoid duplicate)
    const newCoords = best.coords.slice(1)
    const addedLength = lineLength([tip, ...newCoords])
    stitched.push(...newCoords)
    totalLength += addedLength
  }

  return {
    coords: stitched,
    featureCount: usedSegments.size,
    junctionDetected,
    totalLength,
  }
}

// ── Curve detection ──

function detectCurves(coords, minAngle = 15) {
  if (coords.length < 3) return []
  const curves = []
  let distFromStart = 0

  for (let i = 1; i < coords.length - 1; i++) {
    distFromStart += haversine(coords[i - 1], coords[i])
    const b1 = bearing(coords[i - 1], coords[i])
    const b2 = bearing(coords[i], coords[i + 1])
    const turn = angleDiff(b1, b2)

    if (Math.abs(turn) >= minAngle) {
      curves.push({
        distance: Math.round(distFromStart),
        direction: turn > 0 ? 'R' : 'L',
        angle: Math.round(Math.abs(turn)),
      })
    }
  }

  // Merge curves that are very close together (within 20m)
  const merged = []
  for (const c of curves) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(c.distance - last.distance) < 20 && c.direction === last.direction) {
      last.angle += c.angle
    } else {
      merged.push({ ...c })
    }
  }

  return merged
}

// ── Main Component ──

export default function FreeDriveTest() {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const debounceTimerRef = useRef(null)
  const simIntervalRef = useRef(null)
  const logRef = useRef(null)

  const [heading, setHeading] = useState(0)
  const [autoHeading, setAutoHeading] = useState(true)
  const [markerPos, setMarkerPos] = useState(DEFAULT_CENTER)
  const [tileResult, setTileResult] = useState(null)
  const [apiResult, setApiResult] = useState(null)
  const [curves, setCurves] = useState([])
  const [curveSource, setCurveSource] = useState('tile')
  const [simulating, setSimulating] = useState(false)
  const [simSpeed, setSimSpeed] = useState(40)
  const [logs, setLogs] = useState([])
  const [mapLoaded, setMapLoaded] = useState(false)

  const addLog = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString()
    setLogs(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200))
  }, [])

  // ── Initialize Map ──
  useEffect(() => {
    if (mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    // Draggable marker
    const marker = new mapboxgl.Marker({ draggable: true, color: '#E8622C' })
      .setLngLat(DEFAULT_CENTER)
      .addTo(map)

    marker.on('dragend', () => {
      const lngLat = marker.getLngLat()
      setMarkerPos([lngLat.lng, lngLat.lat])
    })

    map.on('load', () => {
      // Tile stitched line (red)
      map.addSource('tile-line', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
      map.addLayer({ id: 'tile-line', type: 'line', source: 'tile-line', paint: { 'line-color': '#ff4444', 'line-width': 4, 'line-opacity': 0.8 } })

      // API route (blue)
      map.addSource('api-line', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
      map.addLayer({ id: 'api-line', type: 'line', source: 'api-line', paint: { 'line-color': '#4488ff', 'line-width': 4, 'line-opacity': 0.8 } })

      // Curve markers
      map.addSource('curve-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'curve-points', type: 'circle', source: 'curve-points',
        paint: { 'circle-radius': 6, 'circle-color': '#ffcc00', 'circle-stroke-color': '#000', 'circle-stroke-width': 1 }
      })

      // Heading arrow
      map.addSource('heading-arrow', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } })
      map.addLayer({ id: 'heading-arrow', type: 'line', source: 'heading-arrow', paint: { 'line-color': '#E8622C', 'line-width': 2, 'line-dasharray': [2, 2] } })

      setMapLoaded(true)
    })

    mapRef.current = map
    markerRef.current = marker

    return () => map.remove()
  }, [])

  // ── Run analysis on marker move ──
  useEffect(() => {
    if (!mapLoaded) return
    clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      runAnalysis(markerPos, heading)
    }, 500)
  }, [markerPos, heading, mapLoaded])

  // ── Draw heading arrow ──
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    const tip = destinationPoint(markerPos, heading, 200)
    const src = mapRef.current.getSource('heading-arrow')
    if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [markerPos, tip] } })
  }, [markerPos, heading, mapLoaded])

  // ── Core analysis ──
  const runAnalysis = useCallback(async (pos, hdg) => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Auto-heading: use road direction from nearby features
    if (autoHeading) {
      const point = map.project(pos)
      const nearby = map.queryRenderedFeatures(
        [[point.x - 30, point.y - 30], [point.x + 30, point.y + 30]],
        { layers: map.getStyle().layers.filter(l => l['source-layer'] === 'road' && l.type === 'line').map(l => l.id) }
      )
      if (nearby.length > 0) {
        const geom = nearby[0].geometry
        const coords = geom.type === 'MultiLineString' ? geom.coordinates[0] : geom.coordinates
        if (coords && coords.length >= 2) {
          // Find closest segment and derive bearing
          let bestIdx = 0, bestD = Infinity
          for (let i = 0; i < coords.length; i++) {
            const d = haversine(pos, coords[i])
            if (d < bestD) { bestD = d; bestIdx = i }
          }
          if (bestIdx < coords.length - 1) {
            const autoHdg = bearing(coords[bestIdx], coords[bestIdx + 1])
            setHeading(Math.round(autoHdg))
            hdg = Math.round(autoHdg)
          }
        }
      }
    }

    // ── Panel A: Tile-based ──
    const tileStart = performance.now()
    try {
      // Calculate bounding box 2km ahead in heading direction
      const ahead = destinationPoint(pos, hdg, LOOKAHEAD_METERS)
      const left = destinationPoint(pos, (hdg - 90 + 360) % 360, 300)
      const right = destinationPoint(pos, (hdg + 90) % 360, 300)
      const aheadLeft = destinationPoint(ahead, (hdg - 90 + 360) % 360, 300)
      const aheadRight = destinationPoint(ahead, (hdg + 90) % 360, 300)

      const allPts = [pos, ahead, left, right, aheadLeft, aheadRight]
      const minLng = Math.min(...allPts.map(p => p[0]))
      const maxLng = Math.max(...allPts.map(p => p[0]))
      const minLat = Math.min(...allPts.map(p => p[1]))
      const maxLat = Math.max(...allPts.map(p => p[1]))

      const sw = map.project([minLng, minLat])
      const ne = map.project([maxLng, maxLat])

      // Query rendered road features in the bounding box
      const roadLayerIds = map.getStyle().layers
        .filter(l => l['source-layer'] === 'road' && l.type === 'line')
        .map(l => l.id)

      const features = map.queryRenderedFeatures(
        [[Math.min(sw.x, ne.x), Math.min(sw.y, ne.y)], [Math.max(sw.x, ne.x), Math.max(sw.y, ne.y)]],
        { layers: roadLayerIds }
      )

      const result = stitchRoad(features, pos, hdg)
      const elapsed = Math.round(performance.now() - tileStart)

      setTileResult({
        rawFeatures: features.length,
        stitchedFeatures: result.featureCount,
        length: Math.round(result.totalLength || 0),
        junction: result.junctionDetected,
        timeMs: elapsed,
        coords: result.coords,
      })

      // Draw on map
      const src = map.getSource('tile-line')
      if (src && result.coords.length >= 2) {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: result.coords } })
      } else if (src) {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } })
      }
    } catch (err) {
      console.error('Tile approach error:', err)
      setTileResult({ error: err.message })
    }

    // ── Panel B: Directions API ──
    const apiStart = performance.now()
    try {
      const target = destinationPoint(pos, hdg, LOOKAHEAD_METERS)
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pos[0]},${pos[1]};${target[0]},${target[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`

      const resp = await fetch(url)
      const data = await resp.json()
      const elapsed = Math.round(performance.now() - apiStart)

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0]
        const coords = route.geometry.coordinates
        const routeLength = route.distance // meters from API
        const straightDist = haversine(pos, target)
        // If route is >2x the straight-line distance, it probably took a detour
        const detour = routeLength > straightDist * 2.5

        setApiResult({
          length: Math.round(routeLength),
          coordCount: coords.length,
          timeMs: elapsed,
          detour,
          coords,
        })

        const src = map.getSource('api-line')
        if (src) {
          src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
        }
      } else {
        setApiResult({ error: data.message || 'No route found', timeMs: elapsed })
      }
    } catch (err) {
      console.error('API approach error:', err)
      setApiResult({ error: err.message, timeMs: Math.round(performance.now() - apiStart) })
    }
  }, [autoHeading])

  // ── Curve detection ──
  const runCurveDetection = useCallback(() => {
    const coords = curveSource === 'tile' ? tileResult?.coords : apiResult?.coords
    if (!coords || coords.length < 3) {
      setCurves([])
      addLog('No line data for curve detection')
      return
    }
    const detected = detectCurves(coords, 15)
    setCurves(detected)
    addLog(`Curve detection (${curveSource}): ${detected.length} curves found`)

    // Draw curve points on map
    const map = mapRef.current
    if (map) {
      const features = detected.map(c => {
        // Find the coordinate at the given distance
        let dist = 0
        let pt = coords[0]
        for (let i = 1; i < coords.length; i++) {
          const d = haversine(coords[i - 1], coords[i])
          if (dist + d >= c.distance) {
            pt = coords[i]
            break
          }
          dist += d
        }
        return { type: 'Feature', geometry: { type: 'Point', coordinates: pt }, properties: { angle: c.angle, direction: c.direction } }
      })
      const src = map.getSource('curve-points')
      if (src) src.setData({ type: 'FeatureCollection', features })
    }
  }, [curveSource, tileResult, apiResult, addLog])

  // Refs for simulation interval (avoid stale closures)
  const headingRef = useRef(heading)
  const simSpeedRef = useRef(simSpeed)
  useEffect(() => { headingRef.current = heading }, [heading])
  useEffect(() => { simSpeedRef.current = simSpeed }, [simSpeed])

  // ── Simulate drive ──
  const toggleSimulation = useCallback(() => {
    if (simulating) {
      clearInterval(simIntervalRef.current)
      setSimulating(false)
      addLog('Simulation stopped')
      return
    }

    setSimulating(true)
    addLog(`Simulation started at ${simSpeedRef.current}mph`)

    simIntervalRef.current = setInterval(() => {
      setMarkerPos(prev => {
        const h = headingRef.current
        const metersPerSec = simSpeedRef.current * 0.44704 // mph to m/s
        const moveDistance = metersPerSec * 5 // 5-second intervals
        const newPos = destinationPoint(prev, h, moveDistance)

        if (markerRef.current) markerRef.current.setLngLat(newPos)
        return newPos
      })

      // Log current results (read from refs to avoid nested setState)
      setTileResult(tr => {
        setApiResult(ar => {
          const tileInfo = tr ? `Tile: ${tr.length}m, ${tr.stitchedFeatures}feat, ${tr.timeMs}ms` : 'Tile: --'
          const apiInfo = ar ? `API: ${ar.length}m, ${ar.timeMs}ms` : 'API: --'
          addLog(`${tileInfo} | ${apiInfo}`)
          return ar
        })
        return tr
      })
    }, 5000)
  }, [simulating, addLog])

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => clearInterval(simIntervalRef.current)
  }, [])

  // ── Render ──
  return (
    <div style={{ fontFamily: 'monospace', background: '#0a0e18', color: '#ddd', minHeight: '100vh', padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '16px', color: '#E8622C' }}>Free Drive Lookahead Test</h1>
        <a href="/" style={{ color: '#888', fontSize: '12px' }}>Back to App</a>
      </div>

      {/* Map */}
      <div ref={mapContainer} style={{ width: '100%', height: '45vh', minHeight: '300px' }} />

      {/* Controls Bar */}
      <div style={{ padding: '8px 12px', background: '#111827', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input type="checkbox" checked={autoHeading} onChange={e => setAutoHeading(e.target.checked)} />
          Auto heading
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '150px' }}>
          Heading: {heading}°
          <input type="range" min={0} max={360} value={heading} onChange={e => { setHeading(Number(e.target.value)); setAutoHeading(false) }}
            style={{ flex: 1 }} disabled={autoHeading} />
        </label>
        <span style={{ color: '#888' }}>
          {markerPos[1].toFixed(4)}, {markerPos[0].toFixed(4)}
        </span>
      </div>

      {/* Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#1a1a2e' }}>
        {/* Panel A: Tile */}
        <div style={{ padding: '10px 12px', background: '#0f1420' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#ff4444' }}>A: Tile-Based</h3>
          {tileResult?.error ? (
            <div style={{ color: '#ff6666' }}>{tileResult.error}</div>
          ) : tileResult ? (
            <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
              <div>Raw features: <b>{tileResult.rawFeatures}</b></div>
              <div>Stitched: <b>{tileResult.stitchedFeatures}</b></div>
              <div>Length: <b>{tileResult.length}m</b></div>
              <div>Junction: <b style={{ color: tileResult.junction ? '#ffcc00' : '#66ff66' }}>{tileResult.junction ? 'YES' : 'no'}</b></div>
              <div>Time: <b>{tileResult.timeMs}ms</b></div>
            </div>
          ) : (
            <div style={{ color: '#666' }}>Drag marker to analyze...</div>
          )}
        </div>

        {/* Panel B: API */}
        <div style={{ padding: '10px 12px', background: '#0f1420' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '13px', color: '#4488ff' }}>B: Directions API</h3>
          {apiResult?.error ? (
            <div style={{ color: '#ff6666' }}>{apiResult.error}</div>
          ) : apiResult ? (
            <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
              <div>Length: <b>{apiResult.length}m</b></div>
              <div>Coords: <b>{apiResult.coordCount}</b></div>
              <div>Latency: <b>{apiResult.timeMs}ms</b></div>
              <div>Detour: <b style={{ color: apiResult.detour ? '#ff6666' : '#66ff66' }}>{apiResult.detour ? 'YES (weird)' : 'no'}</b></div>
            </div>
          ) : (
            <div style={{ color: '#666' }}>Drag marker to analyze...</div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ padding: '10px 12px', background: '#111827', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={runCurveDetection} style={btnStyle}>
          Run Curve Detection
        </button>
        <select value={curveSource} onChange={e => setCurveSource(e.target.value)}
          style={{ background: '#1a1a2e', color: '#ddd', border: '1px solid #333', padding: '6px 8px', fontSize: '12px', borderRadius: '4px' }}>
          <option value="tile">From Tiles (red)</option>
          <option value="api">From API (blue)</option>
        </select>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Speed:
          <input type="number" value={simSpeed} onChange={e => setSimSpeed(Number(e.target.value))}
            style={{ width: '50px', background: '#1a1a2e', color: '#ddd', border: '1px solid #333', padding: '4px', fontSize: '12px', borderRadius: '4px' }}
            min={10} max={120} step={5} />
          mph
        </label>
        <button onClick={toggleSimulation} style={{ ...btnStyle, background: simulating ? '#cc3333' : '#2a6e2a' }}>
          {simulating ? 'Stop Sim' : 'Simulate Drive'}
        </button>
      </div>

      {/* Curve Results */}
      {curves.length > 0 && (
        <div style={{ padding: '10px 12px', background: '#0f1420', borderTop: '1px solid #222' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '13px', color: '#ffcc00' }}>Detected Curves ({curves.length})</h3>
          <div style={{ fontSize: '11px', maxHeight: '120px', overflow: 'auto' }}>
            {curves.map((c, i) => (
              <div key={i} style={{ padding: '2px 0', borderBottom: '1px solid #1a1a2e' }}>
                {c.distance}m — {c.direction} {c.angle}°
                {c.angle >= 80 ? ' [TIGHT]' : c.angle >= 40 ? ' [MEDIUM]' : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Console */}
      <div style={{ padding: '8px 12px', background: '#080b12', borderTop: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '12px', color: '#888' }}>Console</h3>
          <button onClick={() => setLogs([])} style={{ background: 'none', border: 'none', color: '#666', fontSize: '11px', cursor: 'pointer' }}>Clear</button>
        </div>
        <div ref={logRef} style={{ fontSize: '10px', maxHeight: '150px', overflow: 'auto', color: '#999', lineHeight: '1.5' }}>
          {logs.length === 0 ? (
            <div style={{ color: '#555' }}>Drag the marker to start testing...</div>
          ) : (
            logs.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </div>
    </div>
  )
}

const btnStyle = {
  background: '#1a3a5c',
  color: '#ddd',
  border: '1px solid #2a4a6c',
  padding: '6px 12px',
  fontSize: '12px',
  borderRadius: '4px',
  cursor: 'pointer',
}
