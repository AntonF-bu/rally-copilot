import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useHighwayMode } from '../hooks/useHighwayMode'

// ================================
// Map Component - v17
// NEW: Transit zone filtering + highway bend markers
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const SEVERITY_COLORS = {
  0: '#22c55e',
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
  6: '#dc2626',
}

// Highway blue color for bend markers
const HIGHWAY_BEND_COLOR = '#3b82f6'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const highwayMarkers = useRef([])  // NEW: Highway bend markers
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
  const simulationProgress = useStore(state => state.simulationProgress)

  // NEW: Get highway bends from hook
  const { highwayBends, isHighwayActive } = useHighwayMode()

  // Calculate current zone character for zoom adjustment
  const currentZoneCharacter = (() => {
    if (!routeZones?.length || !routeData?.distance) return null
    const totalDist = routeData.distance
    const currentDist = (simulationProgress || 0) * totalDist
    const segment = routeZones.find(s => 
      currentDist >= s.startDistance && currentDist <= s.endDistance
    )
    return segment?.character || null
  })()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // NEW: Helper to check if a distance is within a transit zone
  const isInTransitZone = useCallback((distance) => {
    if (!routeZones?.length) return false
    return routeZones.some(seg => 
      seg.character === 'transit' && 
      distance >= seg.startDistance && 
      distance <= seg.endDistance
    )
  }, [routeZones])

  // Build severity segments for route coloring
  const buildSeveritySegments = useCallback((coordinates, curves, totalDistance) => {
    if (!coordinates?.length) return []
    if (!curves?.length) {
      return [{ coords: coordinates, color: '#22c55e' }]
    }

    const segments = []
    const totalDist = totalDistance || 15000
    let lastIdx = 0
    
    const sortedCurves = [...curves].sort((a, b) => 
      (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
    )

    sortedCurves.forEach(curve => {
      const curveDist = curve.distanceFromStart || 0
      const warningDist = 200
      
      const curveProgress = curveDist / totalDist
      const warningProgress = Math.max(0, (curveDist - warningDist) / totalDist)
      
      const curveIdx = Math.min(Math.floor(curveProgress * coordinates.length), coordinates.length - 1)
      const warningIdx = Math.floor(warningProgress * coordinates.length)
      
      if (warningIdx > lastIdx) {
        segments.push({
          coords: coordinates.slice(lastIdx, warningIdx + 1),
          color: '#22c55e'
        })
      }
      
      if (curveIdx > warningIdx) {
        const color = SEVERITY_COLORS[curve.severity] || SEVERITY_COLORS[3]
        segments.push({
          coords: coordinates.slice(warningIdx, curveIdx + 1),
          color
        })
      }
      
      lastIdx = curveIdx
    })
    
    if (lastIdx < coordinates.length - 1) {
      segments.push({
        coords: coordinates.slice(lastIdx),
        color: '#22c55e'
      })
    }
    
    return segments
  }, [])

  // Add route to map
  const addRouteToMap = useCallback(() => {
    if (!map.current || !routeData?.coordinates?.length) {
      return false
    }
    
    console.log('🗺️ Adding route to map...', routeData.coordinates.length, 'points')
    
    try {
      // Clear any existing route layers
      routeLayersRef.current.forEach(id => {
        try {
          if (map.current.getLayer(id)) map.current.removeLayer(id)
          if (map.current.getSource(id)) map.current.removeSource(id)
        } catch (e) {}
      })
      routeLayersRef.current = []

      // Add outline first (underneath)
      map.current.addSource('route-outline-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeData.coordinates }
        }
      })
      
      map.current.addLayer({
        id: 'route-outline-layer',
        type: 'line',
        source: 'route-outline-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 12,
          'line-opacity': 0.5
        }
      })
      routeLayersRef.current.push('route-outline-source', 'route-outline-layer')

      // Add severity-colored segments
      const segments = buildSeveritySegments(routeData.coordinates, routeData.curves, routeData.distance)
      
      segments.forEach((segment, i) => {
        if (segment.coords.length < 2) return
        
        const sourceId = `route-segment-${i}`
        const glowLayerId = `route-glow-${i}`
        const lineLayerId = `route-line-${i}`

        map.current.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: segment.coords }
          }
        })

        map.current.addLayer({
          id: glowLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': segment.color,
            'line-width': 14,
            'line-blur': 6,
            'line-opacity': 0.4
          }
        })

        map.current.addLayer({
          id: lineLayerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': segment.color,
            'line-width': 6,
            'line-opacity': 0.95
          }
        })

        routeLayersRef.current.push(sourceId, glowLayerId, lineLayerId)
      })

      console.log(`🗺️ Route added: ${segments.length} segments`)
      routeAddedRef.current = true
      return true
      
    } catch (e) {
      console.error('Route rendering error:', e)
      return false
    }
  }, [routeData, buildSeveritySegments])

  // Initialize map
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
      
      // Add terrain
      try {
        map.current.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        })
        map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })

        map.current.addLayer({
          id: 'sky',
          type: 'sky',
          paint: {
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15
          }
        })
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

  // Add route when map is loaded and routeData is available
  useEffect(() => {
    if (!mapLoaded) return
    if (!routeData?.coordinates?.length) return
    
    addRouteToMap()
    
    // Fit bounds - SAFE version using array format instead of LngLatBounds
    if (!isRunning && routeData.coordinates.length >= 2) {
      const lngs = routeData.coordinates.map(c => c[0])
      const lats = routeData.coordinates.map(c => c[1])
      const bounds = [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ]
      map.current?.fitBounds(bounds, { padding: 80, duration: 1000 })
    }
  }, [mapLoaded, routeData?.coordinates?.length, addRouteToMap, isRunning])

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

  // Update user marker color when mode changes
  useEffect(() => {
    if (!userMarkerEl.current) return
    
    const divs = userMarkerEl.current.querySelectorAll('div')
    const arrow = userMarkerEl.current.querySelector('#heading-arrow')
    if (divs[1]) divs[1].style.borderColor = modeColor
    if (divs[2]) {
      divs[2].style.background = modeColor
      divs[2].style.boxShadow = `0 2px 15px ${modeColor}80`
    }
    if (arrow) arrow.style.borderBottomColor = modeColor
  }, [modeColor])

  // Update position and camera
  useEffect(() => {
    if (!map.current || !mapLoaded || !userMarker.current) return
    
    if (position) {
      userMarker.current.setLngLat(position)

      if (userMarkerEl.current) {
        const arrow = userMarkerEl.current.querySelector('#heading-arrow')
        if (arrow) {
          arrow.style.transform = `translateX(-50%) rotate(${heading || 0}deg)`
        }
      }

      if (isRunning && isFollowing && !isAnimatingRef.current) {
        const now = Date.now()
        const timeSinceLastUpdate = now - lastCameraUpdateRef.current
        
        const currentSpeed = speed || 0
        const minUpdateInterval = currentSpeed > 40 ? 300 : currentSpeed > 20 ? 400 : 600
        
        if (timeSinceLastUpdate >= minUpdateInterval) {
          lastCameraUpdateRef.current = now
          isAnimatingRef.current = true
          
          const duration = currentSpeed > 50 ? 500 : currentSpeed > 30 ? 700 : 900
          
          // Zoom out more on highway (transit) zones for better visibility
          const isHighway = currentZoneCharacter === 'transit'
          let zoom
          if (isHighway) {
            // Highway: zoom out more
            zoom = currentSpeed > 60 ? 14 : currentSpeed > 40 ? 14.5 : 15
          } else {
            // Normal zones
            zoom = currentSpeed > 50 ? 15.5 : currentSpeed > 30 ? 16 : 16.5
          }
          
          map.current.easeTo({
            center: position,
            bearing: heading || 0,
            pitch: isHighway ? 50 : 60, // Slightly lower pitch on highway too
            zoom: zoom,
            duration: duration,
            easing: (t) => t * (2 - t)
          })
        }
      }
    }
  }, [position, heading, isRunning, mapLoaded, isFollowing, speed])

  // Reset following when navigation starts
  useEffect(() => {
    if (isRunning) {
      setIsFollowing(true)
      setShowRecenter(false)
    }
  }, [isRunning])

  // Recenter handler
  const handleRecenter = useCallback(() => {
    if (!map.current || !position) return
    
    setIsFollowing(true)
    setShowRecenter(false)
    isAnimatingRef.current = true
    
    map.current.easeTo({
      center: position,
      bearing: heading || 0,
      pitch: 60,
      zoom: 16,
      duration: 500
    })
  }, [position, heading])

  // Add curve markers - UPDATED: Skip curves in transit zones
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Clear existing markers
    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    const curves = routeData?.curves
    if (!curves?.length) return

    curves.forEach((curve) => {
      if (!curve.position) return
      
      // NEW: Skip curves in transit zones - highway system handles those
      if (isInTransitZone(curve.distanceFromStart)) {
        return
      }
      
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      
      const direction = curve.isChicane ? curve.startDirection : curve.direction
      const isLeft = direction === 'LEFT'
      
      if (curve.isChicane) {
        const dirChar = isLeft ? '←' : '→'
        const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
        
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; background: ${isActive ? color : 'rgba(0,0,0,0.85)'}; padding: 4px 8px; border-radius: 8px; border: 2px solid ${color}; box-shadow: 0 2px 10px ${color}40;">
            <span style="font-size: 10px; font-weight: 700; color: ${isActive ? 'white' : color};">${typeLabel}${dirChar}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severitySequence}</span>
          </div>
        `
      } else {
        el.innerHTML = `
          <div style="display: flex; align-items: center; gap: 3px; background: ${isActive ? color : 'rgba(0,0,0,0.85)'}; padding: 4px 8px; border-radius: 8px; border: 2px solid ${color}; box-shadow: 0 2px 10px ${color}40;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${isActive ? 'white' : color}" style="transform: ${isLeft ? 'scaleX(-1)' : 'none'}">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
            <span style="font-size: 14px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severity}</span>
            ${curve.modifier ? `<span style="font-size: 9px; color: ${isActive ? 'white' : color}; opacity: 0.8;">${curve.modifier}</span>` : ''}
          </div>
        `
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(curve.position)
        .addTo(map.current)
      
      curveMarkers.current.push(marker)
    })
  }, [routeData?.curves?.length, activeCurve?.id, mapLoaded, isInTransitZone])

  // NEW: Add highway bend markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Clear existing highway markers
    highwayMarkers.current.forEach(m => m.remove())
    highwayMarkers.current = []

    if (!highwayBends?.length) return

    highwayBends.forEach((bend) => {
      if (!bend.position) return
      
      const el = document.createElement('div')
      
      if (bend.isSection) {
        // SECTION marker - consolidated cluster
        const bgColor = bend.character === 'technical' ? '#f59e0b' : 
                       bend.character === 'challenging' ? '#ef4444' : HIGHWAY_BEND_COLOR
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:2px solid ${bgColor};box-shadow:0 2px 10px ${bgColor}40;">
            <span style="font-size:9px;font-weight:700;color:${bgColor};letter-spacing:0.5px;text-transform:uppercase;">${bend.character}</span>
            <span style="font-size:11px;font-weight:600;color:${bgColor};">${bend.bendCount} bends</span>
            <span style="font-size:9px;color:${bgColor}80;">${bend.length}m</span>
          </div>
        `
      } else if (bend.isSSweep) {
        // S-sweep marker
        const dir1 = bend.firstBend.direction === 'LEFT' ? '←' : '→'
        const dir2 = bend.secondBend.direction === 'LEFT' ? '←' : '→'
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.85);padding:3px 6px;border-radius:6px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 8px ${HIGHWAY_BEND_COLOR}30;">
            <span style="font-size:8px;font-weight:700;color:${HIGHWAY_BEND_COLOR};letter-spacing:0.5px;">S-SWEEP</span>
            <span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${dir1}${bend.firstBend.angle}° ${dir2}${bend.secondBend.angle}°</span>
          </div>
        `
      } else {
        // Regular highway bend marker
        const isLeft = bend.direction === 'LEFT'
        const dirArrow = isLeft ? '←' : '→'
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:2px;background:rgba(0,0,0,0.8);padding:2px 6px;border-radius:5px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 6px ${HIGHWAY_BEND_COLOR}20;">
            <span style="font-size:9px;font-weight:700;color:${HIGHWAY_BEND_COLOR};">SW</span>
            <span style="font-size:10px;color:${HIGHWAY_BEND_COLOR};">${dirArrow}</span>
            <span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${bend.angle}°</span>
          </div>
        `
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(bend.position)
        .addTo(map.current)
      
      highwayMarkers.current.push(marker)
    })
  }, [highwayBends, mapLoaded])

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
