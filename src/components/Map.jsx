import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'

// ================================
// Map Component - v12
// With severity gradients, zone colors, better markers
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Severity colors for braking zones
const SEVERITY_COLORS = {
  0: '#22c55e',  // Green - clear
  1: '#22c55e',  // Green
  2: '#84cc16',  // Lime
  3: '#eab308',  // Yellow
  4: '#f97316',  // Orange
  5: '#ef4444',  // Red
  6: '#dc2626',  // Dark red
}

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const routeLayersRef = useRef([])
  
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
    
    // Sort curves by distance
    const sortedCurves = [...curves].sort((a, b) => 
      (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
    )

    sortedCurves.forEach(curve => {
      const curveDist = curve.distanceFromStart || 0
      const warningDist = 200 // meters before curve to start coloring
      
      const curveProgress = curveDist / totalDist
      const warningProgress = Math.max(0, (curveDist - warningDist) / totalDist)
      
      const curveIdx = Math.min(Math.floor(curveProgress * coordinates.length), coordinates.length - 1)
      const warningIdx = Math.floor(warningProgress * coordinates.length)
      
      // Green segment before warning zone
      if (warningIdx > lastIdx) {
        segments.push({
          coords: coordinates.slice(lastIdx, warningIdx + 1),
          color: '#22c55e'
        })
      }
      
      // Colored segment for curve (warning zone)
      if (curveIdx > warningIdx) {
        const color = SEVERITY_COLORS[curve.severity] || SEVERITY_COLORS[3]
        segments.push({
          coords: coordinates.slice(warningIdx, curveIdx + 1),
          color
        })
      }
      
      lastIdx = curveIdx
    })
    
    // Final green segment after last curve
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

    map.current.on('dragstart', () => {
      console.log('📍 User dragged map - following disabled')
      window.dispatchEvent(new CustomEvent('map-user-drag'))
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
        // Remove old route layers
        routeLayersRef.current.forEach(id => {
          try {
            if (map.current.getLayer(id)) map.current.removeLayer(id)
            if (map.current.getSource(id)) map.current.removeSource(id)
          } catch (e) {}
        })
        routeLayersRef.current = []

        // Build severity segments
        const segments = buildSeveritySegments(routeData.coordinates, routeData.curves)
        
        // Add each segment
        segments.forEach((seg, i) => {
          if (!seg.coords || seg.coords.length < 2) return
          
          const sourceId = `route-seg-${i}`
          const glowId = `route-glow-${i}`
          const lineId = `route-line-${i}`
          
          map.current.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: seg.coords }
            }
          })

          // Glow layer
          map.current.addLayer({
            id: glowId,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': seg.color,
              'line-width': 14,
              'line-blur': 8,
              'line-opacity': 0.4
            }
          })

          // Main line
          map.current.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': seg.color,
              'line-width': 5,
              'line-opacity': 0.9
            }
          })
          
          routeLayersRef.current.push(sourceId, glowId, lineId)
        })
      } catch (e) {
        console.log('Route add/update error:', e.message)
      }
    }

    if (map.current.isStyleLoaded()) {
      addRoute()
    } else {
      map.current.once('styledata', addRoute)
    }
  }, [mapLoaded, routeData, buildSeveritySegments])

  // Create user marker ONCE
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (userMarker.current) return

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px;">
        <div style="position: absolute; inset: 0; border: 2px solid ${modeColor}; border-radius: 50%; animation: pulse 2s ease-out infinite;"></div>
        <div id="heading-arrow" style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 18px solid ${modeColor}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
        <div style="position: absolute; inset: 10px; background: ${modeColor}; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 15px ${modeColor}80;"></div>
      </div>
    `
    
    userMarkerEl.current = el

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

  // Listen for user drag event
  useEffect(() => {
    const handleUserDrag = () => {
      setIsFollowing(false)
      setShowRecenter(true)
    }
    window.addEventListener('map-user-drag', handleUserDrag)
    return () => window.removeEventListener('map-user-drag', handleUserDrag)
  }, [])

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

      if (isRunning && isFollowing) {
        const currentSpeed = speed || 0
        const duration = currentSpeed > 50 ? 400 : currentSpeed > 30 ? 600 : 800
        const zoom = currentSpeed > 50 ? 15.5 : currentSpeed > 30 ? 16 : 16.5
        
        map.current.easeTo({
          center: position,
          bearing: heading || 0,
          pitch: 60,
          zoom: zoom,
          duration: duration,
          easing: (t) => 1 - Math.pow(1 - t, 3)
        })
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
    
    map.current.easeTo({
      center: centerPos,
      bearing: heading || 0,
      pitch: 65,
      zoom: 16,
      duration: 500
    })
  }, [position, heading, routeData])

  // Update curve markers - Enhanced style
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    console.log(`🗺️ Map: Updating curve markers - routeData.curves: ${routeData?.curves?.length || 0}`)

    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    const curvesToShow = routeData?.curves || []
    
    if (curvesToShow.length === 0) {
      console.log('🗺️ Map: No curves to show')
      return
    }

    console.log(`🗺️ Map: Adding ${curvesToShow.length} curve markers`)

    curvesToShow.forEach((curve) => {
      if (!curve.position) {
        console.log(`🗺️ Map: Curve ${curve.id} has no position, skipping`)
        return
      }
      
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      
      // Use startDirection for chicanes
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
        // Regular curve - clean pill style
        const modifierText = curve.modifier ? `<span style="font-size: 8px; color: ${isActive ? 'white' : color}; opacity: 0.8; margin-top: 2px;">${curve.modifier}</span>` : ''
        
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; background: ${isActive ? color : 'rgba(0,0,0,0.9)'}; padding: 6px 10px; border-radius: 10px; border: 2px solid ${color}; box-shadow: 0 4px 15px ${color}50; transform: scale(${isActive ? 1.15 : 1});">
            <div style="display: flex; align-items: center; gap: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isActive ? 'white' : color}" style="transform: ${isLeft ? 'scaleX(-1)' : 'none'}">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
              </svg>
              <span style="font-size: 18px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severity}</span>
            </div>
            ${modifierText}
          </div>
        `
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(curve.position)
        .addTo(map.current)

      curveMarkers.current.push(marker)
    })
  }, [routeData, activeCurve, mapLoaded])

  // Keep screen awake
  useEffect(() => {
    if (!isRunning || settings.keepScreenOn === false) return
    
    let wakeLock = null
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch (err) {}
    }
    
    requestWakeLock()
    return () => wakeLock?.release()
  }, [isRunning, settings.keepScreenOn])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {showRecenter && (
        <button
          onClick={handleRecenter}
          className="absolute top-1/2 right-4 -translate-y-1/2 z-30 bg-cyan-500 hover:bg-cyan-400 rounded-full p-4 border-2 border-white shadow-lg transition-all active:scale-95"
          style={{ boxShadow: '0 4px 20px rgba(0,212,255,0.5)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading map...</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
