// Route detail view with interactive Mapbox map
// Shows when user taps a route card in Discover tab

import { useState, useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import useStore from '../../store'

export function RouteDetailView({ route, onClose }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeGeometry, setRouteGeometry] = useState(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [heartAnimating, setHeartAnimating] = useState(false)

  // Store access
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []
  const addFavoriteRoute = useStore((state) => state.addFavoriteRoute)
  const removeFavoriteRoute = useStore((state) => state.removeFavoriteRoute)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN

  // Check if route is saved
  const isSaved = favoriteRoutes.some(
    (fav) => fav.discoveryId === route.id || fav.id === route.id
  )

  // Fetch route geometry
  useEffect(() => {
    if (!mapboxToken || routeGeometry) return

    const fetchGeometry = async () => {
      setLoadingRoute(true)
      try {
        const coords = [
          `${route.start.lng},${route.start.lat}`,
          ...(route.waypoints || []).map((wp) => `${wp.lng},${wp.lat}`),
          `${route.end.lng},${route.end.lat}`,
        ].join(';')

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxToken}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.routes?.[0]?.geometry) {
          setRouteGeometry(data.routes[0].geometry)
        }
      } catch (err) {
        console.error('Failed to fetch route:', err)
      } finally {
        setLoadingRoute(false)
      }
    }

    fetchGeometry()
  }, [route, mapboxToken, routeGeometry])

  // Initialize map
  useEffect(() => {
    if (!mapboxToken || map.current) return

    mapboxgl.accessToken = mapboxToken

    const centerLng = (route.start.lng + route.end.lng) / 2
    const centerLat = (route.start.lat + route.end.lat) / 2

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [centerLng, centerLat],
      zoom: 11,
      attributionControl: false,
    })

    map.current.on('load', () => {
      setMapLoaded(true)

      // Add start marker (cyan)
      new mapboxgl.Marker({ color: '#00d4ff' })
        .setLngLat([route.start.lng, route.start.lat])
        .addTo(map.current)

      // Add end marker (orange)
      new mapboxgl.Marker({ color: '#ff9500' })
        .setLngLat([route.end.lng, route.end.lat])
        .addTo(map.current)
    })

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [mapboxToken, route])

  // Add route line when geometry is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded || !routeGeometry) return

    // Remove existing layer/source if present
    if (map.current.getLayer('route-line')) {
      map.current.removeLayer('route-line')
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route')
    }

    // Add route source and layer
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: routeGeometry,
      },
    })

    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#00d4ff',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    })

    // Fit bounds to route
    const coordinates = routeGeometry.coordinates
    const bounds = coordinates.reduce(
      (bounds, coord) => bounds.extend(coord),
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
    )

    // Increased padding to ensure route is visible above the info panel
    map.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 350, left: 60, right: 60 },
      duration: 500,
    })
  }, [mapLoaded, routeGeometry])

  // Quick toggle for the floating heart button
  const handleQuickToggle = useCallback(() => {
    setHeartAnimating(true)
    setTimeout(() => setHeartAnimating(false), 300)
    handleSave()
  }, [])

  // Handle save/unsave
  const handleSave = async () => {
    if (isSaved) {
      const existing = favoriteRoutes.find(
        (fav) => fav.discoveryId === route.id || fav.id === route.id
      )
      if (existing) {
        removeFavoriteRoute(existing.id)
      }
    } else {
      setIsSaving(true)

      // Use already fetched geometry or fetch if needed
      let geometry = routeGeometry
      let fetchedDistance = null
      let fetchedDuration = null

      if (!geometry && mapboxToken) {
        try {
          const coords = [
            `${route.start.lng},${route.start.lat}`,
            ...(route.waypoints || []).map((wp) => `${wp.lng},${wp.lat}`),
            `${route.end.lng},${route.end.lat}`,
          ].join(';')

          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxToken}`
          const response = await fetch(url)
          const data = await response.json()

          if (data.routes?.[0]) {
            geometry = data.routes[0].geometry
            fetchedDistance = data.routes[0].distance
            fetchedDuration = data.routes[0].duration
          }
        } catch (err) {
          console.error('Failed to fetch route geometry:', err)
        }
      }

      const favoriteRoute = {
        name: route.name,
        destination: route.end.label,
        origin: route.start.label,
        distance: fetchedDistance || route.distance * 1609.34,
        duration: fetchedDuration || route.duration * 60,
        discoveryId: route.id,
        isDiscoveryRoute: true,
        geometry: geometry,
        startCoords: [route.start.lng, route.start.lat],
        endCoords: [route.end.lng, route.end.lat],
        waypoints: route.waypoints || [],
        discoveryData: route,
      }

      addFavoriteRoute(favoriteRoute)
      setIsSaving(false)
    }
  }

  const difficultyColors = {
    easy: { bg: 'rgba(0, 255, 136, 0.15)', text: '#00ff88' },
    moderate: { bg: 'rgba(255, 170, 0, 0.15)', text: '#ffaa00' },
    hard: { bg: 'rgba(255, 68, 68, 0.15)', text: '#ff4444' },
  }

  const diffColor = difficultyColors[route.difficulty] || difficultyColors.moderate

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: '#0a0a0f',
        // Full viewport coverage for mobile Safari
        height: '100dvh',
        minHeight: '-webkit-fill-available',
      }}
    >
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Loading overlay */}
      {loadingRoute && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Back Button - high contrast pill for visibility on any map background */}
      <button
        onClick={onClose}
        className="absolute z-10 flex items-center gap-1.5 rounded-full shadow-lg"
        style={{
          top: 'max(16px, env(safe-area-inset-top, 16px))',
          left: '16px',
          padding: '10px 14px',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {/* ChevronLeft icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        <span className="text-white text-sm font-medium">Back</span>
      </button>

      {/* Favorite Button - floating in top right */}
      <button
        onClick={handleQuickToggle}
        disabled={isSaving}
        className="absolute z-10 flex items-center justify-center rounded-full shadow-lg transition-transform duration-150"
        style={{
          top: 'max(16px, env(safe-area-inset-top, 16px))',
          right: '16px',
          width: '44px',
          height: '44px',
          background: isSaved ? 'rgba(0, 212, 255, 0.25)' : 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: isSaved
            ? '1px solid rgba(0, 212, 255, 0.4)'
            : '1px solid rgba(255, 255, 255, 0.15)',
          transform: heartAnimating ? 'scale(1.2)' : 'scale(1)',
        }}
      >
        {isSaving ? (
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={isSaved ? '#00d4ff' : 'none'}
            stroke={isSaved ? '#00d4ff' : 'white'}
            strokeWidth="2"
            className="transition-all duration-150"
            style={{
              transform: heartAnimating ? 'scale(1.1)' : 'scale(1)',
            }}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        )}
      </button>

      {/* Bottom Info Panel */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 rounded-t-3xl"
        style={{
          background: 'rgba(10, 10, 15, 0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          // Ensure safe area padding for home indicator
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="p-5 pb-6">
          {/* Route Name */}
          <h2 className="text-xl font-bold text-white mb-2">{route.name}</h2>

          {/* Location */}
          <div
            className="flex items-center gap-1.5 text-sm mb-3"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            {/* MapPin icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>
              {route.start.label} → {route.end.label}
            </span>
          </div>

          {/* Stats Row */}
          <div className="flex gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              {/* Route/Road icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
              >
                <path d="M12 2v20M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span className="text-white">{route.distance} mi</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Clock icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-white">{route.duration} min</span>
            </div>
          </div>

          {/* Description */}
          {route.description && (
            <p
              className="text-sm mb-4"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {route.description}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {route.tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full text-xs capitalize"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}
              >
                {tag}
              </span>
            ))}
            <span
              className="px-2.5 py-1 rounded-full text-xs capitalize"
              style={{
                background: diffColor.bg,
                color: diffColor.text,
              }}
            >
              {route.difficulty}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all disabled:opacity-70"
              style={{
                background: isSaved
                  ? 'rgba(0, 212, 255, 0.2)'
                  : 'rgba(255, 255, 255, 0.08)',
                border: isSaved
                  ? '1px solid rgba(0, 212, 255, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
                color: isSaved ? '#00d4ff' : 'rgba(255,255,255,0.9)',
              }}
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  {/* Heart icon */}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={isSaved ? '#00d4ff' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span>{isSaved ? 'Saved' : 'Save Route'}</span>
                </>
              )}
            </button>

            {/* Start Drive Button */}
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #00a3cc 100%)',
                color: '#000',
                fontWeight: 600,
              }}
            >
              {/* Play icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Start Drive</span>
            </button>
          </div>
        </div>
      </div>

      {/* No token fallback */}
      {!mapboxToken && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: 'rgba(10,10,15,0.95)' }}
        >
          {/* Map icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.5"
            className="mb-3"
          >
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <p style={{ color: 'rgba(255,255,255,0.4)' }}>
            Map unavailable
          </p>
        </div>
      )}
    </div>
  )
}
