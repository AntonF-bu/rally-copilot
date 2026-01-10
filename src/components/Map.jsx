import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

// ================================
// Map - Premium Terrain Style
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  const [mapStyle, setMapStyle] = useState('terrain')
  
  const { position, heading, speed, isRunning, upcomingCurves, activeCurve, mode, settings } = useStore()

  const route = MOHAWK_TRAIL
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }

  const mapStyles = {
    terrain: 'mapbox://styles/mapbox/outdoors-v12',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
  }

  // Initialize
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyles[mapStyle],
      center: route.coordinates[0],
      zoom: 15.5,
      pitch: 65,
      bearing: 0,
      antialias: true,
      maxPitch: 85
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
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 2.0 })

      // Sky atmosphere
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })

      // Route layers
      map.current.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates }}
      })

      // Shadow
      map.current.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 10, 'line-blur': 4, 'line-opacity': 0.2, 'line-translate': [2, 2] }
      })

      // Glow
      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-width': 14, 'line-blur': 6, 'line-opacity': 0.4 }
      })

      // Main line
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
        paint: { 'line-color': '#fff', 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [3, 5] }
      })
    })

    map.current.on('dragstart', () => setIsFollowing(false))
    map.current.on('zoomstart', (e) => { if (e.originalEvent) setIsFollowing(false) })

    return () => { map.current?.remove(); map.current = null }
  }, [route])

  // Style change handler
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    
    map.current.once('style.load', () => {
      // Re-add terrain
      if (!map.current.getSource('mapbox-dem')) {
        map.current.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
      }
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 2.0 })
      
      // Re-add route
      if (!map.current.getSource('route')) {
        map.current.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates }}})
      }
      
      const color = modeColors[mode] || modeColors.cruise
      if (!map.current.getLayer('route-glow')) {
        map.current.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 14, 'line-blur': 6, 'line-opacity': 0.4 }})
      }
      if (!map.current.getLayer('route-line')) {
        map.current.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 1 }})
      }
    })
  }, [mapStyle, mapLoaded])

  // User marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const el = document.createElement('div')
    el.innerHTML = `
      <div class="user-marker" style="position:relative;width:44px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35))">
        <div style="position:absolute;inset:0;border:2px solid rgba(255,107,53,0.5);border-radius:50%;animation:pulse 2s ease-out infinite"></div>
        <div id="heading-arrow" style="position:absolute;top:-8px;left:50%;transform:translateX(-50%)">
          <svg width="16" height="20" viewBox="0 0 16 20"><path d="M8 0L16 16L8 12L0 16L8 0Z" fill="#ff6b35" stroke="#fff" stroke-width="1.5"/></svg>
        </div>
        <div style="position:absolute;inset:10px;background:linear-gradient(145deg,#ff6b35,#e55a2b);border-radius:50%;border:2.5px solid #fff"></div>
      </div>
    `
    userMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(route.coordinates[0]).addTo(map.current)
    return () => userMarker.current?.remove()
  }, [mapLoaded, route])

  // Position updates
  useEffect(() => {
    if (!map.current || !mapLoaded || !position || !userMarker.current) return
    userMarker.current.setLngLat(position)
    const arrow = userMarker.current.getElement().querySelector('#heading-arrow')
    if (arrow) arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    if (isRunning && isFollowing) {
      map.current.easeTo({ center: position, bearing: heading, pitch: 65, zoom: 16, duration: 100, easing: t => t })
    }
  }, [position, heading, isRunning, isFollowing, mapLoaded])

  const handleRecenter = useCallback(() => {
    if (!map.current || !position) return
    setIsFollowing(true)
    map.current.easeTo({ center: position, bearing: heading, pitch: 65, zoom: 16, duration: 500 })
  }, [position, heading])

  useEffect(() => { if (isRunning) setIsFollowing(true) }, [isRunning])

  // Curve markers - Premium design
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
        <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.3))">
          <div style="
            display:flex;align-items:center;gap:3px;
            background:${isActive ? sevColor : 'rgba(10,10,15,0.92)'};
            padding:6px 10px;border-radius:6px;
            border:1.5px solid ${sevColor};
            transform:scale(${isActive ? 1.08 : 1});transition:transform 0.15s;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isActive ? '#fff' : sevColor}" style="transform:${isLeft ? 'scaleX(-1)' : 'none'}">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
            <span style="font-family:-apple-system,system-ui;font-weight:600;font-size:16px;color:${isActive ? '#fff' : sevColor}">${curve.severity}</span>
          </div>
          ${curve.modifier ? `<div style="margin-top:3px;padding:1px 6px;background:rgba(0,0,0,0.75);border-radius:3px;font-family:-apple-system,system-ui;font-size:8px;font-weight:600;color:${sevColor};letter-spacing:0.3px">${curve.modifier}</div>` : ''}
        </div>
      `
      curveMarkers.current.push(new mapboxgl.Marker({ element: el }).setLngLat(curve.position).addTo(map.current))
    })
  }, [upcomingCurves, activeCurve, mapLoaded])

  // Route color by mode
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const color = modeColors[mode] || modeColors.cruise
    if (map.current.getLayer('route-line')) map.current.setPaintProperty('route-line', 'line-color', color)
    if (map.current.getLayer('route-glow')) map.current.setPaintProperty('route-glow', 'line-color', color)
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
    const next = mapStyle === 'terrain' ? 'satellite' : 'terrain'
    setMapStyle(next)
    if (map.current) map.current.setStyle(mapStyles[next])
  }, [mapStyle])

  const displaySpeed = settings?.speedUnit === 'kmh' ? Math.round((speed || 0) * 1.609) : Math.round(speed || 0)

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Speed */}
      {isRunning && (
        <div className="absolute bottom-36 left-4 z-10 bg-black/75 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/[0.08]">
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: '-apple-system, system-ui', color: modeColors[mode] || '#00d4ff' }}>
            {displaySpeed}
          </div>
          <div className="text-[9px] text-white/35 font-medium tracking-widest">{(settings?.speedUnit || 'mph').toUpperCase()}</div>
        </div>
      )}

      {/* Map toggle */}
      <button onClick={toggleMapStyle} className="absolute top-24 right-4 z-10 w-9 h-9 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all">
        {mapStyle === 'terrain' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
        )}
      </button>

      {/* Recenter */}
      {isRunning && !isFollowing && (
        <button onClick={handleRecenter} className="absolute bottom-36 right-4 z-10 w-11 h-11 flex items-center justify-center bg-black/75 backdrop-blur-sm rounded-lg border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
        </button>
      )}

      {/* Loading */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
          <div className="w-8 h-8 border-2 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      <style>{`@keyframes pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(2);opacity:0}}`}</style>
    </div>
  )
}
