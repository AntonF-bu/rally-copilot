import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { buildZoneSegments as buildZoneSegmentsShared } from '../utils/routeGeometry'
import { createCalloutMarkerElement } from '../utils/calloutMarkers'

// ================================
// Map Component - v24
// Tramo Brand Design
// - Direct color values (no theme.js)
// - Route rendering matches RoutePreview style
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Mapbox style
const MAPBOX_STYLE = 'mapbox://styles/antonflk/cml9m9s1j001401sgggri2ovp'

// Zone colors (keep as-is per brand spec)
const ZONE_COLORS = {
  technical: '#00E68A',
  transit: '#66B3FF',
  urban: '#FF668C',
}

export default function Map({ freeDriveGeometry } = {}) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const calloutMarkers = useRef([])
  const calloutMarkerMapRef = useRef(new Map()) // spatialId → marker (for diff-based rendering)
  // Free Drive curve markers now handled by curatedHighwayCallouts (same as Route Mode)
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
  const curatedHighwayCallouts = useStore(state => state.curatedHighwayCallouts) || []
  const simulationProgress = useStore(state => state.simulationProgress)

  // Mode colors for map visualization - Tramo orange for cruise
  const modeColors = { cruise: '#E8622C', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Check if a distance is in a transit zone
  const isInTransitZone = useCallback((distance) => {
    if (!routeZones?.length) return false
    return routeZones.some(seg =>
      seg.character === 'transit' &&
      distance >= seg.startDistance &&
      distance <= seg.endDistance
    )
  }, [routeZones])

  // ================================
  // Build zone-based segments for route coloring
  // Uses shared utility with accurate Haversine distance calculation
  // ================================
  const getZoneSegments = useCallback((coords) => {
    const segments = buildZoneSegmentsShared(
      coords,
      routeZones,
      routeData?.distance || 0,
      ZONE_COLORS
    )
    // Convert from shared format (coordinates) to local format (coords)
    return segments.map(seg => ({
      coords: seg.coordinates,
      color: seg.color
    }))
  }, [routeZones, routeData?.distance])

  // ================================
  // Add route to map with zone coloring
  // Matches RoutePreview style (no outline, thinner lines)
  // ================================
  const addRouteToMap = useCallback(() => {
    if (!map.current || !routeData?.coordinates?.length) return false
    if (routeAddedRef.current) return true

    try {
      routeLayersRef.current.forEach(id => {
        if (map.current.getLayer(id)) map.current.removeLayer(id)
        if (map.current.getSource(id)) map.current.removeSource(id)
      })
      routeLayersRef.current = []

      const zoneSegs = getZoneSegments(routeData.coordinates)

      // Add zone segments with their colors
      zoneSegs.forEach((seg, i) => {
        const srcId = `route-src-${i}`
        const glowId = `route-glow-${i}`
        const lineId = `route-line-${i}`

        map.current.addSource(srcId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } }
        })

        // DEBUG: Log the color being used
        console.log(`🎨 MAP ZONE ${i}: color=${seg.color}`)

        // Glow layer
        map.current.addLayer({
          id: glowId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 12, 'line-blur': 5, 'line-opacity': 0.4, 'line-emissive-strength': 1.0 }
        })

        // Main line
        map.current.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': seg.color, 'line-width': 4, 'line-opacity': 1.0, 'line-emissive-strength': 1.0 }
        })

        routeLayersRef.current.push(srcId, glowId, lineId)

        console.log(`🎨 Drawing segment ${i}: color=${seg.color}, glow-opacity=0.4, line-width=4`)
      })

      // Force route layers to top of stack
      const style = map.current.getStyle()
      const allLayerIds = style.layers.map(l => l.id)
      const routeLayerIds = allLayerIds.filter(id =>
        id.startsWith('route-') || id.startsWith('glow-') || id.startsWith('line-')
      )

      // Also log ALL layers for debugging
      console.log('📋 ALL MAP LAYERS:', allLayerIds)
      console.log('🛣️ ROUTE LAYERS:', routeLayerIds)

      // Move each route layer to top
      routeLayerIds.forEach(id => {
        try { map.current.moveLayer(id) } catch(e) {}
      })

      console.log(`🗺️ Route added: ${zoneSegs.length} zone segments`)
      routeAddedRef.current = true
      return true
    } catch (e) {
      console.error('Route rendering error:', e)
      return false
    }
  }, [routeData, routeZones, getZoneSegments])

  // ================================
  // Add curve markers (technical zones only)
  // Only used when NO curated callouts exist
  // ================================
  const addCurveMarkers = useCallback(() => {
    if (!map.current || !routeData?.curves?.length) return

    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    // Skip curve markers if we have curated callouts (they replace curve markers)
    if (curatedHighwayCallouts?.length > 0) {
      console.log('🗺️ Skipping curve markers - using curated callouts instead')
      return
    }

    let added = 0, skipped = 0

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
  }, [routeData?.curves, routeZones, isInTransitZone, curatedHighwayCallouts])

  // ================================
  // Add curated callout markers — diff-based rendering
  // Only add/remove changed markers to prevent flicker
  // ================================
  const addCalloutMarkers = useCallback(() => {
    if (!map.current || !mapLoaded) return

    const markerMap = calloutMarkerMapRef.current
    const newIds = new Set()

    if (!curatedHighwayCallouts?.length) {
      // Remove all markers
      markerMap.forEach(m => m.remove())
      markerMap.clear()
      calloutMarkers.current = []
      return
    }

    // Build set of current callout IDs
    curatedHighwayCallouts.forEach(callout => {
      if (!callout.position) return
      const id = callout.spatialId || callout.id || `${callout.position[1].toFixed(4)}_${callout.position[0].toFixed(4)}`
      newIds.add(id)

      // Skip if marker already exists for this ID
      if (markerMap.has(id)) return

      // Create new marker
      const el = createCalloutMarkerElement(callout)
      if (!el) return

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(callout.position)
        .addTo(map.current)

      markerMap.set(id, marker)
    })

    // Remove markers no longer in callouts
    for (const [id, marker] of markerMap) {
      if (!newIds.has(id)) {
        marker.remove()
        markerMap.delete(id)
      }
    }

    // Keep legacy array in sync
    calloutMarkers.current = [...markerMap.values()]
  }, [curatedHighwayCallouts, mapLoaded])

  // Initialize map - matches RoutePreview style (flat view, no terrain)
  useEffect(() => {
    if (map.current) return

    const startCoord = routeData?.coordinates?.[0] || [-71.0589, 42.3601]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAPBOX_STYLE,
      center: startCoord,
      zoom: 10,    // Match Preview (was 14)
      pitch: 0,    // Match Preview flat view (was 60)
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      console.log('🗺️ Map loaded')
      // No 3D terrain - matches Preview
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

  // Add route and markers when map is ready
  useEffect(() => {
    if (!mapLoaded || !routeData?.coordinates?.length) return

    addRouteToMap()
    addCurveMarkers()
    addCalloutMarkers()

    if (!isRunning && routeData.coordinates.length >= 2) {
      const lngs = routeData.coordinates.map(c => c[0])
      const lats = routeData.coordinates.map(c => c[1])
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ]
      map.current?.fitBounds(bounds, { padding: 80, duration: 1000 })
    }
  }, [mapLoaded, routeData, routeZones, addRouteToMap, addCurveMarkers, addCalloutMarkers, isRunning])

  // Update callout markers when they change
  useEffect(() => {
    if (mapLoaded && curatedHighwayCallouts?.length > 0) {
      console.log('🗺️ Curated callouts changed, re-rendering markers')
      addCalloutMarkers()
    }
  }, [curatedHighwayCallouts, mapLoaded, addCalloutMarkers])

  // Free Drive: draw lookahead line (technical green, glow + main like Route Mode)
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const m = map.current

    if (freeDriveGeometry && freeDriveGeometry.length >= 2) {
      // Debug: log first and last coordinate to verify [lng, lat] format
      const first = freeDriveGeometry[0]
      const last = freeDriveGeometry[freeDriveGeometry.length - 1]
      console.log(`[FreeDrive] 🗺️ Lookahead line: ${freeDriveGeometry.length} pts | first=[${first}] last=[${last}]`)

      const geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: freeDriveGeometry }
      }

      const sourceId = 'freedrive-lookahead'
      const glowId = 'freedrive-lookahead-glow'
      const lineId = 'freedrive-lookahead-line'

      if (m.getSource(sourceId)) {
        m.getSource(sourceId).setData(geojson)
      } else {
        m.addSource(sourceId, { type: 'geojson', data: geojson })

        // Rally Orange lookahead line with glow
        m.addLayer({
          id: glowId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#E8622C',
            'line-width': 8,
            'line-opacity': 0.35,
            'line-blur': 5,
          }
        })

        m.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#E8622C',
            'line-width': 4,
            'line-opacity': 0.9,
          }
        })

        // Move to top of layer stack so nothing covers it
        try { m.moveLayer(glowId) } catch(e) {}
        try { m.moveLayer(lineId) } catch(e) {}

        // Verify creation
        const srcCheck = m.getSource(sourceId)
        const glowCheck = m.getLayer(glowId)
        const lineCheck = m.getLayer(lineId)
        console.log(`[FreeDrive] 🗺️ Source exists: ${!!srcCheck} | Glow layer: ${!!glowCheck} | Line layer: ${!!lineCheck}`)
        console.log(`[FreeDrive] 🗺️ All layers:`, m.getStyle().layers.map(l => l.id).filter(id => id.includes('freedrive')))
      }
    } else {
      const src = m.getSource('freedrive-lookahead')
      if (src) {
        src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } })
      }
    }
  }, [mapLoaded, freeDriveGeometry])

  // Free Drive curve markers are now handled by curatedHighwayCallouts
  // (same as Route Mode) — see addCalloutMarkers effect above

  // Create user marker
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

  // Update user position
  useEffect(() => {
    if (!userMarker.current || !position) return
    userMarker.current.setLngLat(position)
  }, [position])

  // Update heading arrow
  useEffect(() => {
    if (!userMarkerEl.current) return
    const arrow = userMarkerEl.current.querySelector('#heading-arrow')
    if (arrow) {
      arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    }
  }, [heading])

  // Camera follow
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
