import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

// ================================
// Map Component - Full Screen
// Features: zoom fix, recenter button, speed display, screen wake lock
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE'

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const userMarker = useRef(null)
  const curveMarkers = useRef([])
  
  const [mapLoaded, setMapLoaded] = useState(false)
  const [isFollowing, setIsFollowing] = useState(true)
  
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

  // Initialize map
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: route.coordinates[0],
      zoom: 15,
      pitch: 60,
      bearing: 0,
      antialias: true
    })

    map.current.on('load', () => {
      setMapLoaded(true)
      
      // 3D terrain
      map.current.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })
      map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 })

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

      // Route source
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

      // Route glow
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

      // Route line
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
    })

    // Detect user interaction → pause auto-follow
    map.current.on('dragstart', () => {
      setIsFollowing(false)
    })
    
    map.current.on('zoomstart', (e) => {
      // Only pause if user-initiated (not programmatic)
      if (e.originalEvent) {
        setIsFollowing(false)
      }
    })

    map.current.on('pitchstart', (e) => {
      if (e.originalEvent) {
        setIsFollowing(false)
      }
    })

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
      <div style="position: relative; width: 48px; height: 48px;">
        <div style="
          position: absolute;
          inset: 0;
          border: 2px solid #ff6b35;
          border-radius: 50%;
          animation: markerPulse 2s ease-out infinite;
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
          border-bottom: 18px solid #ff6b35;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        "></div>
        <div style="
          position: absolute;
          inset: 12px;
          background: #ff6b35;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 15px rgba(255, 107, 53, 0.7);
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

    // Update heading arrow rotation
    const el = userMarker.current.getElement()
    const arrow = el.querySelector('#heading-arrow')
    if (arrow) {
      arrow.style.transform = `translateX(-50%) rotate(${heading}deg)`
    }

    // Only auto-follow if enabled AND running
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
  }, [position, heading, isRunning, isFollowing, mapLoaded])

  // Recenter button handler
  const handleRecenter = useCallback(() => {
    if (!map.current || !position) return
    
    setIsFollowing(true)
    map.current.easeTo({
      center: position,
      bearing: heading,
      pitch: 65,
      zoom: 16,
      duration: 500
    })
  }, [position, heading])

  // Resume following when simulation restarts
  useEffect(() => {
    if (isRunning) {
      setIsFollowing(true)
    }
  }, [isRunning])

  // Update curve markers
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
        <div style="
          min-width: 50px;
          height: 50px;
          background: ${isActive ? dirColor : 'rgba(0,0,0,0.85)'};
          border: 3px solid ${dirColor};
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Orbitron', system-ui;
          font-weight: 700;
          font-size: 16px;
          color: ${isActive ? 'white' : dirColor};
          box-shadow: 0 4px 20px ${dirColor}50;
          backdrop-filter: blur(8px);
          transform: scale(${isActive ? 1.2 : 1});
          transition: all 0.2s ease;
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

  // Keep screen awake when running
  useEffect(() => {
    if (!isRunning) return
    
    let wakeLock = null
    
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen')
          console.log('Screen wake lock active')
        }
      } catch (err) {
        console.log('Wake lock not available:', err)
      }
    }
    
    requestWakeLock()
    
    // Re-acquire on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    
    return () => {
      wakeLock?.release()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isRunning])

  // Calculate display speed
  const displaySpeed = settings?.speedUnit === 'kmh' 
    ? Math.round((speed || 0) * 1.609) 
    : Math.round(speed || 0)

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Speed Display - Bottom Left */}
      {isRunning && (
        <div className="absolute bottom-36 left-4 z-10">
          <div className="bg-black/80 backdrop-blur-xl rounded-2xl px-5 py-3 border border-white/10">
            <div 
              className="text-4xl font-black text-center"
              style={{ 
                fontFamily: 'Orbitron, system-ui',
                color: modeColors[mode] || '#00d4ff'
              }}
            >
              {displaySpeed}
            </div>
            <div className="text-xs text-gray-400 text-center mt-1">
              {(settings?.speedUnit || 'mph').toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* Recenter Button - Shows when not following */}
      {isRunning && !isFollowing && (
        <button
          onClick={handleRecenter}
          className="absolute bottom-36 right-4 z-10 bg-black/80 backdrop-blur-xl rounded-2xl p-4 border border-white/10 hover:bg-white/10 active:scale-95 transition-all"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
        >
          <svg 
            width="28" 
            height="28" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="#00d4ff" 
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>
      )}

      {/* Loading state */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Token warning */}
      {mapLoaded && (!mapboxgl.accessToken || mapboxgl.accessToken === 'YOUR_MAPBOX_TOKEN_HERE') && (
        <div className="absolute top-24 left-4 right-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 backdrop-blur z-30">
          <p className="text-yellow-400 text-sm font-medium">
            ⚠️ Add your Mapbox token in Vercel → Settings → Environment Variables
          </p>
          <p className="text-yellow-400/70 text-xs mt-1">
            Key: VITE_MAPBOX_TOKEN
          </p>
        </div>
      )}

      {/* CSS for marker pulse animation */}
      <style>{`
        @keyframes markerPulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
