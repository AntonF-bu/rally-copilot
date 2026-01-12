import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Map Component - v15
// FIXED: Route line now shows during navigation
// Issue was stale closure in map.on('load') callback
// Solution: Use ref for routeData and call addRoute in useEffect
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

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const routeLayersRef = useRef([])
  const lastCameraUpdateRef = useRef(0)
  const isAnimatingRef = useRef(false)
  // NEW: Ref to track if route has been added
  const routeAddedRef = useRef(false)
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showRecenter, setShowRecenter] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  
  const {
    position,
    heading,
    speed,
    isRunning,
    activeCurve,
    mode,
    routeData,
  } = useStore()

  // NEW: Keep routeData in a ref for access in callbacks
  const routeDataRef = useRef(routeData)
  useEffect(() => {
    routeDataRef.current = routeData
  }, [routeData])

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

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

  // Add route to map - now takes routeData as parameter to avoid stale closures
  const addRouteToMap = useCallback((routeDataParam) => {
    const data = routeDataParam || routeDataRef.current
    
    if (!map.current) {
      console.log('🗺️ addRouteToMap: No map instance')
      return false
    }
    
    if (!data?.coordinates?.length) {
      console.log('🗺️ addRouteToMap: No route coordinates', { hasData: !!data })
      return false
    }
    
    console.log('🗺️ Adding route to map...', data.coordinates.length, 'points')
    
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
      const outlineSourceId = 'route-outline-source'
      const outlineLayerId = 'route-outline-layer'
      
      map.current.addSource(outlineSourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: data.coordinates }
        }
      })
      
      map.current.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: outlineSourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 12,
          'line-opacity': 0.5
        }
      })
      routeLayersRef.current.push(outlineSourceId, outlineLayerId)

      // Add severity-colored segments
      const segments = buildSeveritySegments(data.coordinates, data.curves, data.distance)
      
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

        // Glow layer
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

        // Main line
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

      console.log(`🗺️ Route added: ${segments.length} segments, ${routeLayersRef.current.length} layers`)
      routeAddedRef.current = true
      return true
      
    } catch (e) {
      console.error('Route rendering error:', e)
      return false
    }
  }, [buildSeveritySegments])

  // Initialize map - only creates the map, doesn't add route
  useEffect(() => {
    if (map.current) return

    const startCoord = routeDataRef.current?.coordinates?.[0] || [-71.0589, 42.3601]

    console.log('🗺️ Initializing map at', startCoord)

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
      
      // Set mapLoaded AFTER terrain is set up
      // Route will be added by the useEffect that watches mapLoaded + routeData
      setMapLoaded(true)
    })

    // User interaction handlers
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

  // CRITICAL: Add route when BOTH map is loaded AND routeData is available
  useEffect(() => {
    console.log('🗺️ Route effect triggered', { 
      mapLoaded, 
      hasRouteData: !!routeData?.coordinates?.length,
      routeAddedAlready: routeAddedRef.current 
    })
    
    if (!mapLoaded) {
      console.log('🗺️ Route effect: Map not loaded yet')
      return
    }
    
    if (!routeData?.coordinates?.length) {
      console.log('🗺️ Route effect: No route data yet')
      return
    }
    
    // Always try to add route when routeData changes (handles re-renders and new routes)
    console.log('🗺️ Route effect: Adding route now')
    const success = addRouteToMap(routeData)
    
    if (success) {
      // Fit bounds to show full route initially (only when not running)
      if (!isRunning) {
        const bounds = routeData.coordinates.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
        )
        map.current?.fitBounds(bounds, { padding: 80, duration: 1000 })
      }
    }
  }, [routeData, mapLoaded, addRouteToMap, isRunning])

  // Reset route added flag when routeData changes (new route)
  useEffect(() => {
    routeAddedRef.current = false
    // Also clear marker tracking so new markers will be created for new route
    createdCurveIdsRef.current.clear()
  }, [routeData?.coordinates])

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

  }, [mapLoaded, modeColor, routeData])

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
      // Always update marker position
      userMarker.current.setLngLat(position)

      // Update heading arrow
      if (userMarkerEl.current) {
        const arrow = userMarkerEl.current.querySelector('#heading-arrow')
        if (arrow) {
          arrow.style.transform = `translateX(-50%) rotate(${heading || 0}deg)`
        }
      }

      // Move camera if following
      if (isRunning && isFollowing && !isAnimatingRef.current) {
        const now = Date.now()
        const timeSinceLastUpdate = now - lastCameraUpdateRef.current
        
        const currentSpeed = speed || 0
        const minUpdateInterval = currentSpeed > 40 ? 300 : currentSpeed > 20 ? 400 : 600
        
        if (timeSinceLastUpdate >= minUpdateInterval) {
          lastCameraUpdateRef.current = now
          isAnimatingRef.current = true
          
          const duration = currentSpeed > 50 ? 500 : currentSpeed > 30 ? 700 : 900
          const zoom = currentSpeed > 50 ? 15.5 : currentSpeed > 30 ? 16 : 16.5
          
          map.current.easeTo({
            center: position,
            bearing: heading || 0,
            pitch: 60,
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
    if (!map.current) return
    
    const centerPos = position || routeData?.coordinates?.[0]
    if (!centerPos) return
    
    setIsFollowing(true)
    setShowRecenter(false)
    isAnimatingRef.current = true
    
    map.current.easeTo({
      center: centerPos,
      bearing: heading || 0,
      pitch: 60,
      zoom: 16,
      duration: 500
    })
  }, [position, heading, routeData])

  // Store marker elements for updating active state without recreating
  const markerElementsRef = useRef(new Map()) // curveId -> { element, curve }
  // Track the curve IDs we've created markers for to avoid unnecessary recreation
  const createdCurveIdsRef = useRef(new Set())

  // Create curve markers - only when the ACTUAL curves change (not just distance updates)
  // We use a stable comparison based on curve IDs to avoid recreation
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const curvesToShow = routeData?.curves || []
    
    // Check if we actually need to recreate markers
    // Only recreate if the set of curve IDs has changed
    const newCurveIds = new Set(curvesToShow.map(c => c.id))
    const existingIds = createdCurveIdsRef.current
    
    const sameMarkers = newCurveIds.size === existingIds.size && 
      [...newCurveIds].every(id => existingIds.has(id))
    
    if (sameMarkers && curveMarkers.current.length > 0) {
      // Markers already exist for these curves, skip recreation
      return
    }

    console.log('🗺️ Creating curve markers:', curvesToShow.length, 'curves')

    // Clear existing markers
    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []
    markerElementsRef.current.clear()
    createdCurveIdsRef.current.clear()

    if (curvesToShow.length === 0) return

    curvesToShow.forEach((curve) => {
      if (!curve.position) return
      
      const el = document.createElement('div')
      el.dataset.curveId = curve.id
      const color = getCurveColor(curve.severity)
      
      const direction = curve.isChicane ? curve.startDirection : curve.direction
      const isLeft = direction === 'LEFT'
      
      // Create marker with inactive state initially
      if (curve.isChicane) {
        const dirChar = isLeft ? '←' : '→'
        const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
        
        el.innerHTML = `
          <div class="curve-marker-inner" style="display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.85); padding: 4px 8px; border-radius: 8px; border: 2px solid ${color}; box-shadow: 0 2px 10px ${color}40; transition: background 0.15s ease;">
            <span class="marker-text-1" style="font-size: 10px; font-weight: 700; color: ${color}; transition: color 0.15s ease;">${typeLabel}${dirChar}</span>
            <span class="marker-text-2" style="font-size: 11px; font-weight: 700; color: ${color}; transition: color 0.15s ease;">${curve.severitySequence}</span>
          </div>
        `
      } else {
        el.innerHTML = `
          <div class="curve-marker-inner" style="display: flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.85); padding: 4px 8px; border-radius: 8px; border: 2px solid ${color}; box-shadow: 0 2px 10px ${color}40; transition: background 0.15s ease;">
            <svg class="marker-icon" width="12" height="12" viewBox="0 0 24 24" fill="${color}" style="transform: ${isLeft ? 'scaleX(-1)' : 'none'}; transition: fill 0.15s ease;">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
            <span class="marker-text-1" style="font-size: 14px; font-weight: 700; color: ${color}; transition: color 0.15s ease;">${curve.severity}</span>
            ${curve.modifier ? `<span class="marker-text-2" style="font-size: 9px; color: ${color}; opacity: 0.8; transition: color 0.15s ease;">${curve.modifier}</span>` : ''}
          </div>
        `
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(curve.position)
        .addTo(map.current)
      
      curveMarkers.current.push(marker)
      markerElementsRef.current.set(curve.id, { element: el, curve, color })
      createdCurveIdsRef.current.add(curve.id)
    })
  }, [routeData?.curves, mapLoaded])

  // Update active curve styling - runs frequently but doesn't recreate markers
  const lastActiveCurveIdRef = useRef(null)
  
  useEffect(() => {
    const newActiveId = activeCurve?.id || null
    const oldActiveId = lastActiveCurveIdRef.current
    
    // Skip if nothing changed
    if (newActiveId === oldActiveId) return
    
    // Deactivate old marker
    if (oldActiveId) {
      const oldData = markerElementsRef.current.get(oldActiveId)
      if (oldData) {
        const { element, color } = oldData
        const inner = element.querySelector('.curve-marker-inner')
        const texts = element.querySelectorAll('.marker-text-1, .marker-text-2')
        const icon = element.querySelector('.marker-icon')
        
        if (inner) inner.style.background = 'rgba(0,0,0,0.85)'
        texts.forEach(t => t.style.color = color)
        if (icon) icon.style.fill = color
      }
    }
    
    // Activate new marker
    if (newActiveId) {
      const newData = markerElementsRef.current.get(newActiveId)
      if (newData) {
        const { element, color } = newData
        const inner = element.querySelector('.curve-marker-inner')
        const texts = element.querySelectorAll('.marker-text-1, .marker-text-2')
        const icon = element.querySelector('.marker-icon')
        
        if (inner) inner.style.background = color
        texts.forEach(t => t.style.color = 'white')
        if (icon) icon.style.fill = 'white'
      }
    }
    
    lastActiveCurveIdRef.current = newActiveId
  }, [activeCurve])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Recenter button */}
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
      
      {/* Debug info - remove in production */}
      {!mapLoaded && (
        <div className="absolute top-20 left-4 bg-black/80 text-white text-xs p-2 rounded">
          Loading map...
        </div>
      )}
    </div>
  )
}
