import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'

// ================================
// Map Component - v13
// FIXED: Smooth camera, proper gesture handling
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Severity colors for braking zones
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
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showRecenter, setShowRecenter] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  
  const {
    position,
    heading,
    speed,
    isRunning,
    upcomingCurves,
    activeCurve,
    mode,
    settings,
    routeData,
    routeZones,
    simulationProgress
  } = useStore()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Build severity segments for route coloring
  const buildSeveritySegments = useCallback((coordinates, curves) => {
    if (!coordinates?.length) return []
    if (!curves?.length) {
      return [{ coords: coordinates, color: '#22c55e' }]
    }

    const segments = []
    const totalDist = routeData?.distance || 15000
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
  }, [routeData?.distance])

  // Initialize map ONCE
  useEffect(() => {
    if (map.current) return

    const startCoord = routeData?.coordinates?.[0] || [-71.0589, 42.3601]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: startCoord,
      zoom: 16,
      pitch: 65,
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      setMapLoaded(true)
      
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
    })

    // Detect user interaction - disable following
    map.current.on('dragstart', () => {
      console.log('📍 User dragged map - following disabled')
      setIsFollowing(false)
      setShowRecenter(true)
    })

    map.current.on('zoomstart', (e) => {
      // Only disable if it's a user gesture, not programmatic
      if (e.originalEvent) {
        console.log('📍 User zoomed map - following disabled')
        setIsFollowing(false)
        setShowRecenter(true)
      }
    })

    map.current.on('pitchstart', (e) => {
      if (e.originalEvent) {
        setIsFollowing(false)
        setShowRecenter(true)
      }
    })

    map.current.on('rotatestart', (e) => {
      if (e.originalEvent) {
        setIsFollowing(false)
        setShowRecenter(true)
      }
    })

    // Detect when animations complete
    map.current.on('moveend', () => {
      isAnimatingRef.current = false
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Add or update route with severity segments
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!routeData?.coordinates?.length) return

    const addRoute = () => {
      try {
        routeLayersRef.current.forEach(id => {
          if (map.current.getLayer(id)) map.current.removeLayer(id)
          if (map.current.getSource(id)) map.current.removeSource(id)
        })
        routeLayersRef.current = []

        const segments = buildSeveritySegments(routeData.coordinates, routeData.curves)

        segments.forEach((segment, i) => {
          const sourceId = `route-segment-${i}`
          const layerId = `route-layer-${i}`

          map.current.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: segment.coords }
            }
          })

          map.current.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round'
            },
            paint: {
              'line-color': segment.color,
              'line-width': 6,
              'line-opacity': 0.9
            }
          })

          routeLayersRef.current.push(sourceId, layerId)
        })

        // Outline
        const outlineSourceId = 'route-outline'
        const outlineLayerId = 'route-outline-layer'

        if (!map.current.getSource(outlineSourceId)) {
          map.current.addSource(outlineSourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: routeData.coordinates }
            }
          })

          map.current.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: outlineSourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': '#000000',
              'line-width': 10,
              'line-opacity': 0.4
            }
          }, routeLayersRef.current[0])

          routeLayersRef.current.push(outlineSourceId, outlineLayerId)
        }

      } catch (e) {
        console.error('Route rendering error:', e)
      }
    }

    if (map.current.isStyleLoaded()) {
      addRoute()
    } else {
      map.current.once('style.load', addRoute)
    }
  }, [routeData, mapLoaded, buildSeveritySegments])

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
    if (divs[0]) divs[0].style.borderColor = modeColor
    if (divs[2]) {
      divs[2].style.background = modeColor
      divs[2].style.boxShadow = `0 2px 15px ${modeColor}80`
    }
    if (arrow) arrow.style.borderBottomColor = modeColor
  }, [modeColor])

  // ================================================================
  // FIXED: Smooth camera updates - throttled and non-blocking
  // ================================================================
  useEffect(() => {
    if (!map.current || !mapLoaded || !userMarker.current) return
    
    if (position) {
      // Always update marker position (this is fast and doesn't block)
      userMarker.current.setLngLat(position)

      // Update heading arrow
      if (userMarkerEl.current) {
        const arrow = userMarkerEl.current.querySelector('#heading-arrow')
        if (arrow) {
          arrow.style.transform = `translateX(-50%) rotate(${heading || 0}deg)`
        }
      }

      // Only move camera if following AND not currently animating
      if (isRunning && isFollowing && !isAnimatingRef.current) {
        const now = Date.now()
        const timeSinceLastUpdate = now - lastCameraUpdateRef.current
        
        // Throttle camera updates based on speed
        // At high speed: update every 300ms
        // At low speed: update every 600ms
        const currentSpeed = speed || 0
        const minUpdateInterval = currentSpeed > 40 ? 300 : currentSpeed > 20 ? 400 : 600
        
        if (timeSinceLastUpdate >= minUpdateInterval) {
          lastCameraUpdateRef.current = now
          isAnimatingRef.current = true
          
          // Longer duration = smoother animation
          const duration = currentSpeed > 50 ? 500 : currentSpeed > 30 ? 700 : 900
          const zoom = currentSpeed > 50 ? 15.5 : currentSpeed > 30 ? 16 : 16.5
          
          map.current.easeTo({
            center: position,
            bearing: heading || 0,
            pitch: 60,
            zoom: zoom,
            duration: duration,
            easing: (t) => t * (2 - t) // Smooth ease-out
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
      pitch: 65,
      zoom: 16,
      duration: 500
    })
  }, [position, heading, routeData])

  // Update curve markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    const curvesToShow = routeData?.curves || []
    
    if (curvesToShow.length === 0) return

    curvesToShow.forEach((curve) => {
      if (!curve.position) return
      
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      
      const direction = curve.isChicane ? curve.startDirection : curve.direction
      const isLeft = direction === 'LEFT'
      
      if (curve.isTechnicalSection) {
        const dirChar = isLeft ? '←' : '→'
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; background: ${isActive ? color : 'rgba(0,0,0,0.9)'}; padding: 6px 10px; border-radius: 10px; border: 2px solid ${color}; box-shadow: 0 4px 15px ${color}50; transform: scale(${isActive ? 1.15 : 1});">
            <span style="font-size: 8px; font-weight: 700; color: ${isActive ? 'white' : color}; letter-spacing: 0.5px;">TECH</span>
            <span style="font-size: 11px; font-weight: 700; color: ${isActive ? 'white' : color};">${dirChar}${curve.curveCount}c</span>
          </div>
        `
      } else if (curve.isChicane) {
        const dirChar = isLeft ? '←' : '→'
        const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
        
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; background: ${isActive ? color : 'rgba(0,0,0,0.9)'}; padding: 6px 10px; border-radius: 10px; border: 2px solid ${color}; box-shadow: 0 4px 15px ${color}50; transform: scale(${isActive ? 1.15 : 1});">
            <span style="font-size: 9px; font-weight: 700; color: ${isActive ? 'white' : color};">${typeLabel}${dirChar}</span>
            <span style="font-size: 11px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severitySequence}</span>
          </div>
        `
      } else {
        const modifierText = curve.modifier ? `<span style="font-size: 8px; color: ${isActive ? 'white' : color}; text-transform: uppercase; margin-top: 1px;">${curve.modifier}</span>` : ''
        const dirChar = isLeft ? '←' : '→'
        
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; background: ${isActive ? color : 'rgba(0,0,0,0.9)'}; padding: 5px 10px; border-radius: 10px; border: 2px solid ${color}; box-shadow: 0 4px 15px ${color}50; transform: scale(${isActive ? 1.15 : 1}); min-width: 36px;">
            <div style="display: flex; align-items: center; gap: 2px;">
              <span style="font-size: 12px; color: ${isActive ? 'white' : color};">${dirChar}</span>
              <span style="font-size: 14px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severity}</span>
            </div>
            ${modifierText}
          </div>
        `
      }
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(curve.position)
        .addTo(map.current)
      
      curveMarkers.current.push(marker)
    })
  }, [routeData?.curves, activeCurve, mapLoaded])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Recenter Button */}
      {showRecenter && isRunning && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-32 right-4 z-20 bg-black/80 backdrop-blur-sm border border-cyan-500/50 rounded-full p-3 shadow-lg"
          style={{ boxShadow: '0 4px 15px rgba(0,212,255,0.3)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      )}
    </div>
  )
}
