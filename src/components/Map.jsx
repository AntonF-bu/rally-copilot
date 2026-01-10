import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Map Component - v9
// Mode changes only update colors, not view
// Recenter button always visible when panned
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const userMarkerEl = useRef(null)
  const curveMarkers = useRef([])
  const routeAddedRef = useRef(false)
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showRecenter, setShowRecenter] = useState(false)
  const isFollowingRef = useRef(true)
  
  const {
    position,
    heading,
    isRunning,
    upcomingCurves,
    activeCurve,
    mode,
    settings,
    routeData
  } = useStore()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Initialize map ONCE - empty dependency array
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
      
      // 3D terrain
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

    // User interaction = show recenter button
    const showRecenterBtn = () => {
      isFollowingRef.current = false
      setShowRecenter(true)
    }

    map.current.on('dragstart', showRecenterBtn)
    map.current.on('zoomstart', (e) => {
      if (e.originalEvent) showRecenterBtn()
    })
    map.current.on('pitchstart', showRecenterBtn)
    map.current.on('rotatestart', showRecenterBtn)

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, []) // EMPTY - only run once

  // Add route to map when loaded
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (!routeData?.coordinates?.length) return
    if (routeAddedRef.current) return

    try {
      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeData.coordinates
          }
        }
      })

      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00d4ff',
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
          'line-color': '#00d4ff',
          'line-width': 5,
          'line-opacity': 0.9
        }
      })

      routeAddedRef.current = true
      console.log('Route added with', routeData.coordinates.length, 'points')
    } catch (e) {
      console.log('Route add error:', e)
    }
  }, [mapLoaded, routeData])

  // Update route color when mode changes - ONLY color, nothing else
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
    
    // Update marker color too
    if (userMarkerEl.current) {
      const circles = userMarkerEl.current.querySelectorAll('div')
      const arrow = userMarkerEl.current.querySelector('#heading-arrow')
      if (circles[0]) circles[0].style.borderColor = modeColor
      if (circles[2]) {
        circles[2].style.background = modeColor
        circles[2].style.boxShadow = `0 2px 15px ${modeColor}80`
      }
      if (arrow) {
        arrow.style.borderBottomColor = modeColor
      }
    }
  }, [modeColor, mapLoaded])

  // Create user marker ONCE
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    if (userMarker.current) return // Already created

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px;">
        <div style="
          position: absolute; inset: 0;
          border: 2px solid #00d4ff;
          border-radius: 50%;
          animation: pulse 2s ease-out infinite;
        "></div>
        <div id="heading-arrow" style="
          position: absolute; top: -8px; left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 18px solid #00d4ff;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        "></div>
        <div style="
          position: absolute; inset: 10px;
          background: #00d4ff;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 15px #00d4ff80;
        "></div>
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

  // Update position and camera
  useEffect(() => {
    if (!map.current || !mapLoaded || !userMarker.current) return
    
    if (position) {
      userMarker.current.setLngLat(position)

      // Update heading arrow rotation
      if (userMarkerEl.current) {
        const arrow = userMarkerEl.current.querySelector('#heading-arrow')
        if (arrow) {
          arrow.style.transform = `translateX(-50%) rotate(${heading || 0}deg)`
        }
      }

      // Follow camera if enabled
      if (isRunning && isFollowingRef.current) {
        map.current.easeTo({
          center: position,
          bearing: heading || 0,
          pitch: 65,
          zoom: 16,
          duration: 100,
          easing: t => t
        })
      }
    }
  }, [position, heading, isRunning, mapLoaded])

  // Recenter handler
  const handleRecenter = useCallback(() => {
    if (!map.current) return
    
    const centerPos = position || routeData?.coordinates?.[0]
    if (!centerPos) return
    
    isFollowingRef.current = true
    setShowRecenter(false)
    
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

    upcomingCurves.forEach((curve) => {
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      const isLeft = curve.direction === 'LEFT'
      
      if (curve.isChicane) {
        const dirChar = curve.startDirection === 'LEFT' ? '←' : '→'
        const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
        
        el.innerHTML = `
          <div style="
            display: flex; flex-direction: column; align-items: center;
            background: ${isActive ? color : 'rgba(0,0,0,0.9)'};
            padding: 6px 10px; border-radius: 10px;
            border: 2px solid ${color};
            box-shadow: 0 4px 15px ${color}50;
            transform: scale(${isActive ? 1.15 : 1});
          ">
            <span style="font-size: 10px; font-weight: 700; color: ${isActive ? 'white' : color}; letter-spacing: 1px;">
              ${typeLabel}${dirChar}
            </span>
            <span style="font-size: 13px; font-weight: 700; color: ${isActive ? 'white' : color};">
              ${curve.severitySequence}
            </span>
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
          <div style="
            display: flex; flex-direction: column; align-items: center;
            background: ${isActive ? color : 'rgba(0,0,0,0.9)'};
            padding: 6px 10px; border-radius: 10px;
            border: 2px solid ${color};
            box-shadow: 0 4px 15px ${color}50;
            transform: scale(${isActive ? 1.15 : 1});
          ">
            <div style="display: flex; align-items: center; gap: 4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isActive ? 'white' : color}" style="transform: ${isLeft ? 'scaleX(-1)' : 'none'}">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
              </svg>
              <span style="font-size: 18px; font-weight: 700; color: ${isActive ? 'white' : color};">
                ${curve.severity}
              </span>
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
  }, [upcomingCurves, activeCurve, mapLoaded])

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
      
      {/* Recenter Button */}
      {showRecenter && (
        <button
          onClick={handleRecenter}
          className="absolute top-24 right-4 z-30 bg-cyan-500 hover:bg-cyan-400 rounded-full p-3 border-2 border-white shadow-lg transition-all active:scale-95"
          style={{ boxShadow: '0 4px 20px rgba(0,212,255,0.5)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      )}

      {/* Loading state */}
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
