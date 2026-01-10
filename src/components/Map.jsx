import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Map Component - v6
// Fixed: Route displays when starting navigation
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  const routeAdded = useRef(false)
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  
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

  // Initialize map
  useEffect(() => {
    if (map.current) return

    const startCoord = routeData?.coordinates?.[0] || [-71.0589, 42.3601]

    console.log('Initializing map with routeData:', routeData?.coordinates?.length, 'points')

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: settings.mapStyle === 'satellite' 
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/dark-v11',
      center: startCoord,
      zoom: 14,
      pitch: 60,
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      console.log('Map loaded')
      setMapLoaded(true)
      
      // 3D terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })

      // Sky
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })
    })

    // Detect user interaction to pause following
    map.current.on('dragstart', () => setIsFollowing(false))
    map.current.on('zoomstart', (e) => {
      if (e.originalEvent) setIsFollowing(false)
    })

    return () => {
      map.current?.remove()
      map.current = null
      routeAdded.current = false
    }
  }, [])

  // Add route when map is loaded and we have route data
  useEffect(() => {
    if (!map.current || !mapLoaded) {
      console.log('Map not ready yet')
      return
    }
    
    if (!routeData?.coordinates?.length) {
      console.log('No route coordinates')
      return
    }

    console.log('Adding route to map:', routeData.coordinates.length, 'points')

    // Remove existing route layers and source
    try {
      if (map.current.getLayer('route-glow')) {
        map.current.removeLayer('route-glow')
      }
      if (map.current.getLayer('route-line')) {
        map.current.removeLayer('route-line')
      }
      if (map.current.getSource('route')) {
        map.current.removeSource('route')
      }
    } catch (e) {
      console.log('Error removing old route:', e)
    }

    // Add route source
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

    // Route glow
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

    // Route line
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

    routeAdded.current = true
    console.log('Route added successfully!')

    // Fit to route bounds initially
    if (routeData.coordinates.length > 1) {
      const bounds = routeData.coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord)
      }, new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))

      map.current.fitBounds(bounds, {
        padding: { top: 150, bottom: 250, left: 50, right: 50 },
        duration: 1000
      })
    }

  }, [mapLoaded, routeData?.coordinates, modeColor])

  // Create/update user marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Remove existing marker
    if (userMarker.current) {
      userMarker.current.remove()
    }

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 44px; height: 44px;">
        <div style="
          position: absolute;
          inset: 0;
          border: 2px solid ${modeColor};
          border-radius: 50%;
          animation: pulse 2s ease-out infinite;
        "></div>
        <div id="heading-arrow" style="
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 18px solid ${modeColor};
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        "></div>
        <div style="
          position: absolute;
          inset: 10px;
          background: ${modeColor};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 15px ${modeColor}80;
        "></div>
      </div>
    `

    const startPos = position || routeData?.coordinates?.[0] || [-71.0589, 42.3601]
    
    userMarker.current = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat(startPos)
      .addTo(map.current)

  }, [mapLoaded, modeColor])

  // Update position and camera
  useEffect(() => {
    if (!map.current || !mapLoaded || !userMarker.current) return
    
    if (position) {
      userMarker.current.setLngLat(position)

      // Rotate heading arrow
      const el = userMarker.current.getElement()
      const arrow = el?.querySelector('#heading-arrow')
      if (arrow) {
        arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
      }

      // Only follow if enabled and running
      if (isRunning && isFollowing) {
        map.current.easeTo({
          center: position,
          bearing: heading,
          pitch: 65,
          zoom: 16,
          duration: 100,
          easing: t => t
        })
      }
    }
  }, [position, heading, isRunning, isFollowing, mapLoaded])

  // Recenter function
  const handleRecenter = useCallback(() => {
    if (!map.current) return
    
    const centerPos = position || routeData?.coordinates?.[0]
    if (!centerPos) return
    
    setIsFollowing(true)
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

    // Remove existing markers
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
            display: flex;
            flex-direction: column;
            align-items: center;
            background: ${isActive ? color : 'rgba(0,0,0,0.9)'};
            padding: 6px 10px;
            border-radius: 10px;
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
            display: flex;
            flex-direction: column;
            align-items: center;
            background: ${isActive ? color : 'rgba(0,0,0,0.9)'};
            padding: 6px 10px;
            border-radius: 10px;
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
    } catch (e) {
      // Layer might not exist yet
    }
  }, [modeColor, mapLoaded])

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
      {isRunning && !isFollowing && (
        <button
          onClick={handleRecenter}
          className="absolute top-24 right-4 z-10 bg-black/70 backdrop-blur-xl rounded-full p-3 border border-white/10 hover:bg-black/90 transition-all active:scale-95"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
          </svg>
        </button>
      )}

      {/* Debug info - remove in production */}
      {mapLoaded && (
        <div className="absolute bottom-48 left-4 text-[10px] text-white/30 bg-black/50 px-2 py-1 rounded z-10">
          Route: {routeData?.coordinates?.length || 0} pts | Added: {routeAdded.current ? 'Yes' : 'No'}
        </div>
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
