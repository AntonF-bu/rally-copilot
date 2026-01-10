import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  const [mapStyle, setMapStyle] = useState('satellite')
  
  const {
    position,
    heading,
    speed,
    isRunning,
    upcomingCurves,
    activeCurve,
    mode,
    settings
  } = useStore()

  const route = MOHAWK_TRAIL
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }

  const mapStyles = {
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    dark: 'mapbox://styles/mapbox/dark-v11',
    outdoors: 'mapbox://styles/mapbox/outdoors-v12'
  }

  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyles[mapStyle],
      center: route.coordinates[0],
      zoom: 15.5,
      pitch: 70,
      bearing: 0,
      antialias: true,
      maxPitch: 85
    })

    map.current.on('load', () => {
      setMapLoaded(true)
      
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 })

      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })

      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: route.coordinates
          }
        }
      })

      map.current.addLayer({
        id: 'route-glow-outer',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 24,
          'line-blur': 15,
          'line-opacity': 0.3
        }
      })

      map.current.addLayer({
        id: 'route-glow-inner',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 12,
          'line-blur': 6,
          'line-opacity': 0.5
        }
      })

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 6,
          'line-opacity': 1
        }
      })
    })

    map.current.on('dragstart', () => setIsFollowing(false))
    map.current.on('zoomstart', (e) => { if (e.originalEvent) setIsFollowing(false) })
    map.current.on('pitchstart', (e) => { if (e.originalEvent) setIsFollowing(false) })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [route, mapStyle])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 56px; height: 56px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));">
        <div style="position: absolute; inset: 0; border: 3px solid #ff6b35; border-radius: 50%; animation: markerPulse 2s ease-out infinite;"></div>
        <div id="heading-arrow" style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 14px solid transparent; border-right: 14px solid transparent; border-bottom: 24px solid #ff6b35;"></div>
        <div style="position: absolute; inset: 14px; background: linear-gradient(135deg, #ff6b35 0%, #ff4500 100%); border-radius: 50%; border: 4px solid white; box-shadow: 0 4px 20px rgba(255, 107, 53, 0.6);"></div>
      </div>
    `

    userMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })
      .setLngLat(route.coordinates[0])
      .addTo(map.current)

    return () => userMarker.current?.remove()
  }, [mapLoaded, route])

  useEffect(() => {
    if (!map.current || !mapLoaded || !position || !userMarker.current) return
    userMarker.current.setLngLat(position)
    const arrow = userMarker.current.getElement().querySelector('#heading-arrow')
    if (arrow) arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    if (isRunning && isFollowing) {
      map.current.easeTo({ center: position, bearing: heading, pitch: 70, zoom: 16, duration: 100, easing: t => t })
    }
  }, [position, heading, isRunning, isFollowing, mapLoaded])

  const handleRecenter = useCallback(() => {
    if (!map.current || !position) return
    setIsFollowing(true)
    map.current.easeTo({ center: position, bearing: heading, pitch: 70, zoom: 16, duration: 500 })
  }, [position, heading])

  useEffect(() => { if (isRunning) setIsFollowing(true) }, [isRunning])

  useEffect(() => {
    if (!map.current || !mapLoaded) return
    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    upcomingCurves.forEach((curve) => {
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const isLeft = curve.direction === 'LEFT'
      const dirColor = isLeft ? '#00d4ff' : '#ff6b35'
      
      el.innerHTML = `
        <div style="min-width: 54px; height: 54px; background: ${isActive ? dirColor : 'rgba(0,0,0,0.9)'}; border: 3px solid ${dirColor}; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-family: 'Orbitron', monospace; font-weight: 800; font-size: 18px; color: ${isActive ? 'white' : dirColor}; box-shadow: 0 4px 20px ${dirColor}60; transform: scale(${isActive ? 1.25 : 1}); transition: all 0.2s;">
          ${curve.direction[0]}${curve.severity}
        </div>
      `
      const marker = new mapboxgl.Marker({ element: el }).setLngLat(curve.position).addTo(map.current)
      curveMarkers.current.push(marker)
    })
  }, [upcomingCurves, activeCurve, mapLoaded])

  useEffect(() => {
    if (!map.current || !mapLoaded) return
    const color = modeColors[mode] || modeColors.cruise
    ;['route-line', 'route-glow-inner', 'route-glow-outer'].forEach(layer => {
      if (map.current.getLayer(layer)) map.current.setPaintProperty(layer, 'line-color', color)
    })
  }, [mode, mapLoaded])

  useEffect(() => {
    if (!isRunning) return
    let wakeLock = null
    const requestWakeLock = async () => {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen') } catch (e) {}
    }
    requestWakeLock()
    return () => wakeLock?.release()
  }, [isRunning])

  const cycleMapStyle = useCallback(() => {
    const styles = ['satellite', 'dark', 'outdoors']
    const next = styles[(styles.indexOf(mapStyle) + 1) % styles.length]
    setMapStyle(next)
    if (map.current) map.current.setStyle(mapStyles[next])
  }, [mapStyle])

  const displaySpeed = settings?.speedUnit === 'kmh' ? Math.round((speed || 0) * 1.609) : Math.round(speed || 0)

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {isRunning && (
        <div className="absolute bottom-36 left-4 z-10">
          <div className="bg-black/85 backdrop-blur-xl rounded-2xl px-5 py-3 border border-white/20">
            <div className="text-4xl font-black text-center" style={{ fontFamily: 'Orbitron, monospace', color: modeColors[mode] || '#00d4ff' }}>{displaySpeed}</div>
            <div className="text-xs text-gray-400 text-center mt-1">{(settings?.speedUnit || 'mph').toUpperCase()}</div>
          </div>
        </div>
      )}

      <button onClick={cycleMapStyle} className="absolute top-24 right-4 z-10 bg-black/80 backdrop-blur-xl rounded-xl p-3 border border-white/20 hover:bg-white/10 active:scale-95 transition-all">🗺️</button>

      {isRunning && !isFollowing && (
        <button onClick={handleRecenter} className="absolute bottom-36 right-4 z-10 bg-black/85 backdrop-blur-xl rounded-2xl p-4 border border-white/20 hover:bg-white/10 active:scale-95 transition-all">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
        </button>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-14 h-14 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400 text-lg">Loading map...</p>
          </div>
        </div>
      )}

      <style>{`@keyframes markerPulse { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }`}</style>
    </div>
  )
}
