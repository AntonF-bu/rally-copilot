import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Map Component - v11
// Fixed curve marker directions + Smoother camera
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  
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
    routeData
  } = useStore()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

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

  // Add or update route on map
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!routeData?.coordinates?.length) return

    const addRoute = () => {
      try {
        const routeGeoJSON = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeData.coordinates
          }
        }

        const existingSource = map.current.getSource('route')
        
        if (existingSource) {
          existingSource.setData(routeGeoJSON)
        } else {
          map.current.addSource('route', {
            type: 'geojson',
            data: routeGeoJSON
          })

          map.current.addLayer({
            id: 'route-glow',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': modeColor,
              'line-width': 14,
              'line-blur': 10,
              'line-opacity': 0.4
            }
          })

          map.current.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': modeColor,
              'line-width': 5,
              'line-opacity': 0.9
            }
          })
        }
      } catch (e) {
        console.log('Route add/update error:', e.message)
      }
    }

    if (map.current.isStyleLoaded()) {
      addRoute()
    } else {
      map.current.once('styledata', addRoute)
    }
  }, [mapLoaded, routeData, modeColor])

  // Update route color when mode changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    
    try {
      if (map.current.getLayer('route-line')) {
        map.current.setPaintProperty('route-line', 'line-color', modeColor)
      }
      if (map.current.getLayer('route-glow')) {
        map.current.setPaintProperty('route-glow', 'line-color', modeColor)
      }
    } catch (e) {}
    
    if (userMarkerEl.current) {
      const divs = userMarkerEl.current.querySelectorAll('div')
      const arrow = userMarkerEl.current.querySelector('#heading-arrow')
      if (divs[0]) divs[0].style.borderColor = modeColor
      if (divs[2]) {
        divs[2].style.background = modeColor
        divs[2].style.boxShadow = `0 2px 15px ${modeColor}80`
      }
      if (arrow) arrow.style.borderBottomColor = modeColor
    }
  }, [modeColor, mapLoaded])

  // Create user marker ONCE
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (userMarker.current) return

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px;">
        <div style="position: absolute; inset: 0; border: 2px solid #00d4ff; border-radius: 50%; animation: pulse 2s ease-out infinite;"></div>
        <div id="heading-arrow" style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-bottom: 18px solid #00d4ff; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
        <div style="position: absolute; inset: 10px; background: #00d4ff; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 15px #00d4ff80;"></div>
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

  }, [mapLoaded])

  // Listen for user drag event
  useEffect(() => {
    const handleUserDrag = () => {
      setIsFollowing(false)
      setShowRecenter(true)
    }
    window.addEventListener('map-user-drag', handleUserDrag)
    return () => window.removeEventListener('map-user-drag', handleUserDrag)
  }, [])

  // Update position and camera - IMPROVED smoothness
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
        // Adjust camera smoothness based on speed
        // Faster speed = shorter duration for snappier response
        const currentSpeed = speed || 0
        const duration = currentSpeed > 50 ? 400 : currentSpeed > 30 ? 600 : 800
        const zoom = currentSpeed > 50 ? 15.5 : currentSpeed > 30 ? 16 : 16.5
        
        map.current.easeTo({
          center: position,
          bearing: heading || 0,
          pitch: 60,
          zoom: zoom,
          duration: duration,
          easing: (t) => 1 - Math.pow(1 - t, 3) // ease-out cubic
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

  // Update curve markers - FIXED directions
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
      
      // FIXED: Use startDirection for chicanes
      const direction = curve.isChicane ? curve.startDirection : curve.direction
      const isLeft = direction === 'LEFT'
      
      if (curve.isTechnicalSection) {
        // Technical section marker
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
            <span style="font-size: 10px; font-weight: 700; color: ${isActive ? 'white' : color}; letter-spacing: 1px;">${typeLabel}${dirChar}</span>
            <span style="font-size: 13px; font-weight: 700; color: ${isActive ? 'white' : color};">${curve.severitySequence}</span>
          </div>
        `
      } else {
        let modifierText = ''
        if (curve.modifier === 'TIGHTENS') modifierText = '<div style="font-size: 9px; color: #f97316; font-weight: 700;">TIGHTENS</div>'
        else if (curve.modifier === 'OPENS') modifierText = '<div style="font-size: 9px; color: #22c55e; font-weight: 700;">OPENS</div>'
        else if (curve.modifier === 'SHARP') modifierText = `<div style="font-size: 9px; color: ${color}; font-weight: 700;">SHARP</div>`
        else if (curve.modifier === 'HAIRPIN') modifierText = `<div style="font-size: 9px; color: ${color}; font-weight: 700;">HAIRPIN</div>`
        else if (curve.modifier === 'LONG') modifierText = `<div style="font-size: 9px; color: ${color}; font-weight: 700;">LONG</div>`
        
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
