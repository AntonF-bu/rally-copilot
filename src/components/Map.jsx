import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Map Component - v19
// Clean navigation map with severity gradients
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const SEVERITY_COLORS = {
  0: '#22c55e', 1: '#22c55e', 2: '#84cc16',
  3: '#eab308', 4: '#f97316', 5: '#ef4444', 6: '#dc2626',
}

const HIGHWAY_BEND_COLOR = '#3b82f6'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const highwayMarkers = useRef([])
  const routeLayersRef = useRef([])
  const lastCameraUpdateRef = useRef(0)
  const isAnimatingRef = useRef(false)
  const routeAddedRef = useRef(false)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [showRecenter, setShowRecenter] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)

  const position = useStore(state => state.position)
  const heading = useStore(state => state.heading)
  const speed = useStore(state => state.speed)
  const isRunning = useStore(state => state.isRunning)
  const activeCurve = useStore(state => state.activeCurve)
  const mode = useStore(state => state.mode)
  const routeData = useStore(state => state.routeData)
  const routeZones = useStore(state => state.routeZones)
  const highwayBends = useStore(state => state.highwayBends) || []
  const simulationProgress = useStore(state => state.simulationProgress)

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  const isInTransitZone = useCallback((distance) => {
    if (!routeZones?.length) return false
    return routeZones.some(seg =>
      seg.character === 'transit' &&
      distance >= seg.startDistance &&
      distance <= seg.endDistance
    )
  }, [routeZones])

  const interpolateColor = (color1, color2, progress) => {
    const hex = (c) => parseInt(c.slice(1), 16)
    const r1 = (hex(color1) >> 16) & 255, g1 = (hex(color1) >> 8) & 255, b1 = hex(color1) & 255
    const r2 = (hex(color2) >> 16) & 255, g2 = (hex(color2) >> 8) & 255, b2 = hex(color2) & 255
    const r = Math.round(r1 + (r2 - r1) * progress)
    const g = Math.round(g1 + (g2 - g1) * progress)
    const b = Math.round(b1 + (b2 - b1) * progress)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  const buildSeveritySegments = useCallback((coords, curves) => {
    if (!coords?.length) return [{ coords, color: '#22c55e' }]
    if (!curves?.length) return [{ coords, color: '#22c55e' }]

    const totalDist = routeData?.distance || 15000
    const gradientDist = 150

    const coordColors = coords.map(() => SEVERITY_COLORS[0])

    curves.forEach(curve => {
      if (!curve.distanceFromStart) return
      if (isInTransitZone(curve.distanceFromStart)) return

      const curveDist = curve.distanceFromStart
      const severity = curve.severity || 3
      const curveColor = SEVERITY_COLORS[Math.min(severity, 6)]

      const warningStart = curveDist - gradientDist
      const curveEnd = curveDist + (curve.length || 50)
      const recoveryEnd = curveEnd + (gradientDist * 0.5)

      coords.forEach((coord, i) => {
        const coordDist = (i / coords.length) * totalDist

        if (coordDist >= warningStart && coordDist < curveDist) {
          const progress = (coordDist - warningStart) / gradientDist
          coordColors[i] = interpolateColor(SEVERITY_COLORS[0], curveColor, progress)
        }

        if (coordDist >= curveDist && coordDist < curveEnd) {
          coordColors[i] = curveColor
        }

        if (coordDist >= curveEnd && coordDist < recoveryEnd) {
          const progress = (coordDist - curveEnd) / (gradientDist * 0.5)
          coordColors[i] = interpolateColor(curveColor, SEVERITY_COLORS[0], progress)
        }
      })
    })

    const segments = []
    let currentSegment = { coords: [coords[0]], color: coordColors[0] }

    for (let i = 1; i < coords.length; i++) {
      if (coordColors[i] === currentSegment.color) {
        currentSegment.coords.push(coords[i])
      } else {
        currentSegment.coords.push(coords[i])
        segments.push(currentSegment)
        currentSegment = { coords: [coords[i]], color: coordColors[i] }
      }
    }
    segments.push(currentSegment)

    return segments.filter(s => s.coords.length > 1)
  }, [routeData?.distance, isInTransitZone])

  const addRouteToMap = useCallback(() => {
    if (!map.current || !routeData?.coordinates?.length) return false

    console.log('🗺️ Adding route to map...', routeData.coordinates.length, 'points')

    try {
      routeLayersRef.current.forEach(id => {
        try {
          if (map.current.getLayer(id)) map.current.removeLayer(id)
          if (map.current.getSource(id)) map.current.removeSource(id)
        } catch (e) {}
      })
      routeLayersRef.current = []

      const coords = routeData.coordinates
      const routeSegs = buildSeveritySegments(coords, routeData.curves)

      map.current.addSource('route-outline-src', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
      })

      map.current.addLayer({
        id: 'route-outline',
        type: 'line',
        source: 'route-outline-src',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000000', 'line-width': 10, 'line-opacity': 0.6 }
      })
      routeLayersRef.current.push('route-outline-src', 'route-outline')

      routeSegs.forEach((seg, i) => {
        const srcId = `route-src-${i}`
        const glowId = `route-glow-${i}`
        const lineId = `route-line-${i}`

        map.current.addSource(srcId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } }
        })

        map.current.addLayer({
          id: glowId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 14, 'line-blur': 6, 'line-opacity': 0.5 }
        })

        map.current.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 5 }
        })

        routeLayersRef.current.push(srcId, glowId, lineId)
      })

      console.log(`🗺️ Route added: ${routeSegs.length} segments`)
      routeAddedRef.current = true
      return true
    } catch (e) {
      console.error('Route rendering error:', e)
      return false
    }
  }, [routeData, routeZones, buildSeveritySegments])

  const addCurveMarkers = useCallback(() => {
    if (!map.current || !routeData?.curves?.length) return

    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    let added = 0, skipped = 0

    console.log(`🗺️ Curve markers: ${routeData.curves.length} curves, ${routeZones?.length || 0} zones`)

    routeData.curves.forEach((curve) => {
      if (!curve.position) return
      if (isInTransitZone(curve.distanceFromStart)) { skipped++; return }

      const color = getCurveColor(curve.severity)
      const el = document.createElement('div')
      el.style.cursor = 'pointer'

      if (curve.isChicane) {
        el.innerHTML = `<div style="position:relative;background:#000d;padding:2px 5px;border-radius:5px;border:2px solid ${color};font-size:9px;font-weight:700;color:${color};text-align:center;">${curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}${curve.startDirection === 'LEFT' ? '←' : '→'}<br/>${curve.severitySequence}</div>`
      } else {
        const arrow = curve.direction === 'LEFT' ? '←' : '→'
        el.innerHTML = `<div style="display:flex;align-items:center;gap:2px;background:#000d;padding:2px 5px;border-radius:5px;border:1px solid ${color};"><span style="font-size:11px;font-weight:700;color:${color};">${arrow}${curve.severity}</span></div>`
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(curve.position)
        .addTo(map.current)

      curveMarkers.current.push(marker)
      added++
    })

    console.log(`🗺️ Curve markers: added ${added}, skipped ${skipped} in transit zones`)
  }, [routeData?.curves, routeZones, isInTransitZone])

  const addHighwayBendMarkers = useCallback(() => {
    if (!map.current || !mapLoaded) return

    highwayMarkers.current.forEach(m => m.remove())
    highwayMarkers.current = []

    console.log(`🗺️ Highway bend markers: ${highwayBends?.length || 0} bends available`)

    if (!highwayBends?.length) return

    highwayBends.forEach((bend) => {
      if (!bend.position) return

      const el = document.createElement('div')

      if (bend.isSection) {
        const bgColor = '#f59e0b'
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:2px solid ${bgColor};box-shadow:0 2px 10px ${bgColor}40;"><span style="font-size:9px;font-weight:700;color:${bgColor};letter-spacing:0.5px;text-transform:uppercase;">ACTIVE</span><span style="font-size:11px;font-weight:600;color:${bgColor};">${bend.bendCount} bends</span><span style="font-size:9px;color:${bgColor}80;">${bend.length}m</span></div>`
      } else if (bend.isSSweep) {
        const dir1 = bend.firstBend?.direction === 'LEFT' ? '←' : '→'
        const dir2 = bend.secondBend?.direction === 'LEFT' ? '←' : '→'
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.85);padding:3px 6px;border-radius:6px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 8px ${HIGHWAY_BEND_COLOR}30;"><span style="font-size:8px;font-weight:700;color:${HIGHWAY_BEND_COLOR};letter-spacing:0.5px;">S-SWEEP</span><span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${dir1}${bend.firstBend?.angle || ''}° ${dir2}${bend.secondBend?.angle || ''}°</span></div>`
      } else {
        const dirArrow = bend.direction === 'LEFT' ? '←' : '→'
        el.innerHTML = `<div style="display:flex;align-items:center;gap:2px;background:rgba(0,0,0,0.8);padding:2px 6px;border-radius:5px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 6px ${HIGHWAY_BEND_COLOR}20;"><span style="font-size:9px;font-weight:700;color:${HIGHWAY_BEND_COLOR};">SW</span><span style="font-size:10px;color:${HIGHWAY_BEND_COLOR};">${dirArrow}</span><span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${bend.angle}°</span></div>`
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(bend.position)
        .addTo(map.current)

      highwayMarkers.current.push(marker)
    })

    console.log(`🗺️ Highway bend markers: added ${highwayMarkers.current.length} markers`)
  }, [highwayBends, mapLoaded])

  useEffect(() => {
    if (map.current) return

    const startCoord = routeData?.coordinates?.[0] || [-71.0589, 42.3601]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: startCoord,
      zoom: 14,
      pitch: 60,
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      console.log('🗺️ Map loaded')
      try {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        })
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })
      } catch (e) {
        console.log('Terrain setup error:', e)
      }
      setMapLoaded(true)
    })

    map.current.on('dragstart', () => {
      setIsFollowing(false)
      setShowRecenter(true)
    })

    map.current.on('moveend', () => {
      isAnimatingRef.current = false
    })

    return () => {
      map.current?.remove()
      map.current = null
      routeAddedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!mapLoaded || !routeData?.coordinates?.length) return

    addRouteToMap()
    addCurveMarkers()
    addHighwayBendMarkers()

    if (!isRunning && routeData.coordinates.length >= 2) {
      const lngs = routeData.coordinates.map(c => c[0])
      const lats = routeData.coordinates.map(c => c[1])
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ]
      map.current?.fitBounds(bounds, { padding: 80, duration: 1000 })
    }
  }, [mapLoaded, routeData, routeZones, addRouteToMap, addCurveMarkers, addHighwayBendMarkers, isRunning])

  useEffect(() => {
    if (mapLoaded && highwayBends?.length > 0) {
      addHighwayBendMarkers()
    }
  }, [highwayBends, mapLoaded, addHighwayBendMarkers])

  useEffect(() => {
    if (!map.current || !mapLoaded || userMarker.current) return

    const el = document.createElement('div')
    el.className = 'user-marker'
    userMarkerEl.current = el

    el.innerHTML = `
      <div style="position: relative; width: 48px; height: 48px;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, rgba(0,212,255,0.3), transparent); border: 2px solid ${modeColor}; box-shadow: 0 0 20px ${modeColor}40;"></div>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; border-radius: 50%; background: ${modeColor}; box-shadow: 0 2px 15px ${modeColor}80;"></div>
        <div id="heading-arrow" style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 16px solid ${modeColor}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
      </div>
    `

    const startPos = routeData?.coordinates?.[0] || [-71.0589, 42.3601]

    userMarker.current = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat(startPos)
      .addTo(map.current)
  }, [mapLoaded, modeColor])

  useEffect(() => {
    if (!userMarker.current || !position) return
    userMarker.current.setLngLat(position)
  }, [position])

  useEffect(() => {
    if (!userMarkerEl.current) return
    const arrow = userMarkerEl.current.querySelector('#heading-arrow')
    if (arrow) {
      arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    }
  }, [heading])

  useEffect(() => {
    if (!map.current || !position || !isFollowing || !isRunning) return

    const now = Date.now()
    if (now - lastCameraUpdateRef.current < 100) return
    if (isAnimatingRef.current) return

    lastCameraUpdateRef.current = now
    isAnimatingRef.current = true

    const targetZoom = speed > 60 ? 14 : speed > 30 ? 14.5 : 15

    map.current.easeTo({
      center: position,
      bearing: heading,
      zoom: targetZoom,
      pitch: 60,
      duration: 300,
      easing: (t) => t
    })
  }, [position, heading, isFollowing, isRunning, speed])

  const handleRecenter = () => {
    setIsFollowing(true)
    setShowRecenter(false)
    if (position && map.current) {
      map.current.easeTo({
        center: position,
        bearing: heading,
        zoom: 15,
        pitch: 60,
        duration: 500
      })
    }
  }

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />

      {showRecenter && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-32 right-4 w-12 h-12 bg-black/80 rounded-full flex items-center justify-center border border-white/20 shadow-lg active:scale-95 transition-transform"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      )}
    </div>
  )
}
