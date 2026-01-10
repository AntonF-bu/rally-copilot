import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

// ================================
// Map - Dark Racing Style
// Supports both demo and real routes
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  const [mapStyle, setMapStyle] = useState('dark')
  
  const { 
    position, 
    heading, 
    isRunning, 
    upcomingCurves, 
    activeCurve, 
    mode,
    routeMode,
    routeData
  } = useStore()

  // Use real route data if available, otherwise demo route
  const getRouteCoordinates = () => {
    if (routeData?.coordinates && routeData.coordinates.length > 0) {
      return routeData.coordinates
    }
    return MOHAWK_TRAIL.coordinates
  }

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }

  const mapStyles = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
  }

  // Initialize map
  useEffect(() => {
    if (map.current) return

    const coordinates = getRouteCoordinates()
    const startPosition = position || coordinates[0]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyles[mapStyle],
      center: startPosition,
      zoom: 15.5,
      pitch: 60,
      bearing: 0,
      antialias: true,
      maxPitch: 80
    })

    map.current.on('load', () => {
      setMapLoaded(true)
      
      // 3D Terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 })

      // Atmospheric sky
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 5
        }
      })

      // Route source
      map.current.addSource('route', {
        type: 'geojson',
        data: { 
          type: 'Feature', 
          properties: {}, 
          geometry: { type: 'LineString', coordinates: coordinates }
        }
      })

      // Route outer glow
      map.current.addLayer({
        id: 'route-glow-outer',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-width': 20, 'line-blur': 12, 'line-opacity': 0.3 }
      })

      // Route inner glow
      map.current.addLayer({
        id: 'route-glow-inner',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-width': 10, 'line-blur': 4, 'line-opacity': 0.5 }
      })

      // Route main line
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-width': 4, 'line-opacity': 1 }
      })

      // Center dashes
      map.current.addLayer({
        id: 'route-dashes',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.4, 'line-dasharray': [2, 4] }
      })
    })

    map.current.on('dragstart', () => setIsFollowing(false))
    map.current.on('zoomstart', (e) => { if (e.originalEvent) setIsFollowing(false) })

    return () => { map.current?.remove(); map.current = null }
  }, [])

  // Update route when routeData changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const coordinates = getRouteCoordinates()
    const source = map.current.getSource('route')
    
    if (source) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coordinates }
      })

      // Fit map to route bounds for non-demo modes
      if (routeMode !== 'demo' && routeData?.coordinates?.length > 0) {
        const bounds = coordinates.reduce((bounds, coord) => {
          return bounds.extend(coord)
        }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]))

        map.current.fitBounds(bounds, {
          padding: { top: 150, bottom: 200, left: 50, right: 50 },
          duration: 1000
        })
      }
    }
  }, [routeData, mapLoaded, routeMode])

  // Style change handler
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    map.current.once('style.load', () => {
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
      }
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 })
      
      const coordinates = getRouteCoordinates()
      if (!map.current.getSource('route')) {
        map.current.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coordinates }}})
      }
      const color = modeColors[mode] || modeColors.cruise
      if (!map.current.getLayer('route-glow-outer')) {
        map.current.addLayer({ id: 'route-glow-outer', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 20, 'line-blur': 12, 'line-opacity': 0.3 }})
      }
      if (!map.current.getLayer('route-glow-inner')) {
        map.current.addLayer({ id: 'route-glow-inner', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 10, 'line-blur': 4, 'line-opacity': 0.5 }})
      }
      if (!map.current.getLayer('route-line')) {
        map.current.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 1 }})
      }
    })
  }, [mapStyle, mapLoaded])

  // User marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    
    const coordinates = getRouteCoordinates()
    const startPos = position || coordinates[0]
    
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position:relative;width:48px;height:48px;filter:drop-shadow(0 4px 12px rgba(255,107,53,0.5))">
        <div style="position:absolute;inset:0;border:2px solid rgba(255,107,53,0.4);border-radius:50%;animation:markerPulse 2s ease-out infinite"></div>
        <div id="heading-arrow" style="position:absolute;top:-10px;left:50%;transform:translateX(-50%)">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
            <path d="M9 0L18 18L9 14L0 18L9 0Z" fill="#ff6b35" stroke="#fff" stroke-width="1.5"/>
          </svg>
        </div>
        <div style="position:absolute;inset:12px;background:linear-gradient(145deg,#ff6b35,#e55a2b);border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px rgba(255,107,53,0.6)"></div>
      </div>
    `
    userMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(startPos).addTo(map.current)
    return () => userMarker.current?.remove()
  }, [mapLoaded])

  // Position updates
  useEffect(() => {
    if (!map.current || !mapLoaded || !position || !userMarker.current) return
    userMarker.current.setLngLat(position)
    const arrow = userMarker.current.getElement().querySelector('#heading-arrow')
    if (arrow) arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    if (isRunning && isFollowing) {
      map.current.easeTo({ center: position, bearing: heading, pitch: 60, zoom: 16, duration: 100, easing: t => t })
    }
  }, [position, heading, isRunning, isFollowing, mapLoaded])

  const handleRecenter = useCallback(() => {
    if (!map.current || !position) return
    setIsFollowing(true)
    map.current.easeTo({ center: position, bearing: heading, pitch: 60, zoom: 16, duration: 500 })
  }, [position, heading])

  useEffect(() => { if (isRunning) setIsFollowing(true) }, [isRunning])

  // Curve markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    upcomingCurves.forEach((curve) => {
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const isLeft = curve.direction === 'LEFT'
      const sevColor = getCurveColor(curve.severity)
      
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 12px ${sevColor}40)">
          <div style="display:flex;align-items:center;gap:4px;background:${isActive ? sevColor : 'rgba(10,10,15,0.92)'};padding:8px 12px;border-radius:10px;border:2px solid ${sevColor};transform:scale(${isActive ? 1.1 : 1});transition:all 0.2s ease;box-shadow:${isActive ? `0 0 25px ${sevColor}60` : 'none'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isActive ? '#fff' : sevColor}" style="transform:${isLeft ? 'scaleX(-1)' : 'none'}">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
            <span style="font-family:-apple-system,system-ui;font-weight:700;font-size:18px;color:${isActive ? '#fff' : sevColor}">${curve.severity}</span>
          </div>
          ${curve.modifier ? `<div style="margin-top:4px;padding:2px 8px;background:rgba(0,0,0,0.8);border-radius:4px;font-family:-apple-system,system-ui;font-size:9px;font-weight:700;color:${sevColor};letter-spacing:0.5px">${curve.modifier}</div>` : ''}
        </div>
      `
      curveMarkers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(curve.position).addTo(map.current))
    })
  }, [upcomingCurves, activeCurve, mapLoaded])

  // Route color
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const color = modeColors[mode] || modeColors.cruise
    ;['route-line', 'route-glow-inner', 'route-glow-outer'].forEach(layer => {
      if (map.current.getLayer(layer)) map.current.setPaintProperty(layer, 'line-color', color)
    })
  }, [mode, mapLoaded])

  // Wake lock
  useEffect(() => {
    if (!isRunning) return
    let wl = null
    const req = async () => { try { if ('wakeLock' in navigator) wl = await navigator.wakeLock.request('screen') } catch(e){} }
    req()
    return () => wl?.release()
  }, [isRunning])

  const toggleMapStyle = useCallback(() => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    if (map.current) map.current.setStyle(mapStyles[next])
  }, [mapStyle])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      <button onClick={toggleMapStyle} className="absolute top-4 right-4 z-10 hud-button w-10 h-10 flex items-center justify-center">
        {mapStyle === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
        )}
      </button>

      {isRunning && !isFollowing && (
        <button onClick={handleRecenter} className="absolute bottom-52 right-4 z-10 hud-button w-12 h-12 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
        </button>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-white/10 border-t-cyan-500 rounded-full animate-spin" />
            <span className="text-white/30 text-sm font-medium tracking-wider">LOADING MAP</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes markerPulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
        .hud-button { background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); transition: all 0.2s ease; }
        .hud-button:hover { background: rgba(255,255,255,0.08); }
        .hud-button:active { transform: scale(0.95); }
      `}</style>
    </div>
  )
}
