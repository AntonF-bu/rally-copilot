import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

// ================================
// Map Component - Full Screen
// ================================

// Use environment variable or fallback
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiYW50b25mbGsiLCJhIjoiY21rOG0xaGE4MHMxZzNmb254bmE3Y2kxaCJ9.N5_5rwIZRbCye16OkkhpKg'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  
  const [mapLoaded, setMapLoaded] = useState(false)
  
  const {
    position,
    heading,
    isRunning,
    upcomingCurves,
    activeCurve,
    mode
  } = useStore()

  const route = MOHAWK_TRAIL

  // Mode colors
  const modeColors = {
    cruise: '#00d4ff',
    fast: '#ffd500', 
    race: '#ff3366'
  }

  // Initialize map
  useEffect(() => {
    if (map.current) return

    const initialCenter = route.coordinates[0]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter,
      zoom: 15,
      pitch: 60,
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      setMapLoaded(true)
      
      // Add terrain for 3D effect
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })

      // Add sky atmosphere
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })

      // Add route source
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

      // Route glow effect
      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 14,
          'line-blur': 10,
          'line-opacity': 0.4
        }
      })

      // Main route line
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 5,
          'line-opacity': 0.9
        }
      })
    })

    // Touch controls
    map.current.touchZoomRotate.enable()
    map.current.dragPan.enable()

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [route])

  // Create user marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position: relative; width: 40px; height: 40px;">
        <div style="
          position: absolute;
          inset: 8px;
          background: #ff6b35;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 15px rgba(255, 107, 53, 0.6);
        "></div>
        <div style="
          position: absolute;
          inset: 0;
          border: 2px solid #ff6b35;
          border-radius: 50%;
          animation: pulse 2s ease-out infinite;
        "></div>
        <div id="heading-arrow" style="
          position: absolute;
          top: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-bottom: 14px solid #ff6b35;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        "></div>
      </div>
    `

    userMarker.current = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat(route.coordinates[0])
      .addTo(map.current)

    return () => userMarker.current?.remove()
  }, [mapLoaded, route])

  // Update position and camera
  useEffect(() => {
    if (!map.current || !mapLoaded || !position || !userMarker.current) return

    userMarker.current.setLngLat(position)

    // Rotate heading arrow
    const el = userMarker.current.getElement()
    const arrow = el.querySelector('#heading-arrow')
    if (arrow) {
      arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    }

    // Smooth camera follow
    if (isRunning) {
      map.current.easeTo({
        center: position,
        bearing: heading,
        pitch: 65,
        zoom: 16,
        duration: 100,
        easing: t => t
      })
    }
  }, [position, heading, isRunning, mapLoaded])

  // Update curve markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Clear old markers
    curveMarkers.current.forEach(m => m.remove())
    curveMarkers.current = []

    // Add new markers
    upcomingCurves.forEach((curve, i) => {
      const el = document.createElement('div')
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      const isLeft = curve.direction === 'LEFT'
      const dirColor = isLeft ? '#00d4ff' : '#ff6b35'
      
      el.innerHTML = `
        <div style="
          min-width: 44px;
          height: 44px;
          background: ${isActive ? dirColor : 'rgba(0,0,0,0.8)'};
          border: 2px solid ${dirColor};
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Orbitron', system-ui;
          font-weight: 700;
          font-size: 14px;
          color: ${isActive ? 'white' : dirColor};
          box-shadow: 0 2px 10px ${dirColor}40;
          backdrop-filter: blur(8px);
          transform: scale(${isActive ? 1.15 : 1});
          transition: transform 0.2s;
        ">
          ${curve.direction[0]}${curve.severity}
        </div>
      `

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(curve.position)
        .addTo(map.current)

      curveMarkers.current.push(marker)
    })
  }, [upcomingCurves, activeCurve, mapLoaded])

  // Update route color based on mode
  useEffect(() => {
    if (!map.current || !mapLoaded) return
    
    const color = modeColors[mode] || modeColors.cruise
    
    if (map.current.getLayer('route-line')) {
      map.current.setPaintProperty('route-line', 'line-color', color)
    }
    if (map.current.getLayer('route-glow')) {
      map.current.setPaintProperty('route-glow', 'line-color', color)
    }
  }, [mode, mapLoaded])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Loading state */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading map...</p>
          </div>
        </div>
      )}

      {/* Token warning */}
      {mapLoaded && (!mapboxgl.accessToken || mapboxgl.accessToken === 'YOUR_MAPBOX_TOKEN_HERE') && (
        <div className="absolute top-20 left-4 right-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-3 backdrop-blur z-30">
          <p className="text-yellow-400 text-sm">
            ⚠️ Add your Mapbox token in Vercel Environment Variables
          </p>
        </div>
      )}

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
