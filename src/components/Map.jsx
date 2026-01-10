import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { MOHAWK_TRAIL, getCurveColor } from '../data/routes'

// ================================
// IMPORTANT: Replace with your Mapbox token
// Get one free at: https://mapbox.com
// ================================
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiYW50b25mbGsiLCJhIjoiY21rOG0xaGE4MHMxZzNmb254bmE3Y2kxaCJ9.N5_5rwIZRbCye16OkkhpKg'

// ================================
// Map Component
// ================================

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
    mode,
    getModeConfig
  } = useStore()

  const modeConfig = getModeConfig()
  const route = MOHAWK_TRAIL

  // Initialize map
  useEffect(() => {
    if (map.current) return

    // Default to route start
    const initialCenter = route.coordinates[0]

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter,
      zoom: 14,
      pitch: 60, // 3D tilt
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

      // Add sky for atmosphere
      map.current.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      })

      // Add route line
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

      // Route glow layer
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
          'line-width': 12,
          'line-blur': 8,
          'line-opacity': 0.4
        }
      })

      // Route main line
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
          'line-width': 4,
          'line-opacity': 0.8
        }
      })
    })

    // Disable scroll zoom for mobile
    map.current.scrollZoom.disable()

    return () => {
      map.current?.remove()
    }
  }, [route])

  // Create user position marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Create custom marker element
    const el = document.createElement('div')
    el.className = 'user-marker'
    el.innerHTML = `
      <div class="user-marker-pulse"></div>
      <div class="user-marker-heading"></div>
      <div class="user-marker-dot"></div>
    `

    userMarker.current = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat(route.coordinates[0])
      .addTo(map.current)

    return () => {
      userMarker.current?.remove()
    }
  }, [mapLoaded, route])

  // Update user position and camera
  useEffect(() => {
    if (!map.current || !mapLoaded || !position || !userMarker.current) return

    // Update marker position
    userMarker.current.setLngLat(position)

    // Update heading rotation
    const markerEl = userMarker.current.getElement()
    const headingEl = markerEl.querySelector('.user-marker-heading')
    if (headingEl) {
      headingEl.style.transform = `translateX(-50%) rotate(${heading}deg)`
    }

    // Smooth camera follow when running
    if (isRunning) {
      map.current.easeTo({
        center: position,
        bearing: heading,
        pitch: 65,
        zoom: 15.5,
        duration: 100,
        easing: (t) => t // Linear for smooth tracking
      })
    }
  }, [position, heading, isRunning, mapLoaded])

  // Update curve markers
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    // Remove old markers
    curveMarkers.current.forEach(marker => marker.remove())
    curveMarkers.current = []

    // Add markers for upcoming curves
    upcomingCurves.forEach((curve, index) => {
      const el = document.createElement('div')
      el.className = `curve-marker ${curve.direction.toLowerCase()} severity-${curve.severity}`
      
      const isActive = activeCurve?.id === curve.id
      const color = getCurveColor(curve.severity)
      
      el.innerHTML = `
        <span>${curve.direction[0]}${curve.severity}</span>
      `
      
      if (isActive) {
        el.style.transform = 'scale(1.2)'
        el.style.boxShadow = `0 0 20px ${color}`
      }

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(curve.position)
        .addTo(map.current)

      curveMarkers.current.push(marker)
    })
  }, [upcomingCurves, activeCurve, mapLoaded])

  // Update route color based on mode
  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const color = modeConfig?.color || '#00d4ff'

    if (map.current.getLayer('route-line')) {
      map.current.setPaintProperty('route-line', 'line-color', color)
    }
    if (map.current.getLayer('route-glow')) {
      map.current.setPaintProperty('route-glow', 'line-color', color)
    }
  }, [mode, modeConfig, mapLoaded])

  return (
    <div className="absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-rally-dark flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-rally-cyan border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Map token warning */}
      {mapLoaded && mapboxgl.accessToken === 'YOUR_MAPBOX_TOKEN_HERE' && (
        <div className="absolute top-20 left-4 right-4 bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 backdrop-blur">
          <p className="text-yellow-400 text-sm font-medium">
            ⚠️ Add your Mapbox token in <code className="bg-black/30 px-1 rounded">src/components/Map.jsx</code>
          </p>
          <p className="text-yellow-400/70 text-xs mt-1">
            Get a free token at mapbox.com
          </p>
        </div>
      )}
    </div>
  )
}
