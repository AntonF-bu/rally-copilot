// Compact grid card for Discover tab
// 2-column grid layout with map thumbnail

import { useState, useEffect, useMemo } from 'react'

export function DiscoverGridCard({ route, isSaved, onSelect }) {
  const [routePath, setRoutePath] = useState(null)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const hasValidToken = mapboxToken && mapboxToken.length > 10

  // Fetch route geometry for the path overlay
  useEffect(() => {
    if (!hasValidToken || routePath) return

    const fetchRoute = async () => {
      try {
        const coords = [
          `${route.start.lng},${route.start.lat}`,
          ...(route.waypoints || []).map((wp) => `${wp.lng},${wp.lat}`),
          `${route.end.lng},${route.end.lat}`,
        ].join(';')

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=polyline&overview=full&access_token=${mapboxToken}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.routes?.[0]?.geometry) {
          setRoutePath(data.routes[0].geometry)
        }
      } catch (err) {
        console.error('Failed to fetch route for preview:', err)
      }
    }

    fetchRoute()
  }, [route, hasValidToken, mapboxToken, routePath])

  // Build static map URL - smaller dimensions for grid
  const staticMapUrl = useMemo(() => {
    if (!hasValidToken) return null

    const startCoord = `${route.start.lng},${route.start.lat}`
    const endCoord = `${route.end.lng},${route.end.lat}`
    const markers = `pin-s+00d4ff(${startCoord}),pin-s+ff9500(${endCoord})`

    let pathOverlay = ''
    if (routePath) {
      pathOverlay = `path-3+00d4ff-0.9(${encodeURIComponent(routePath)}),`
    }

    // Smaller image for grid cards
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pathOverlay}${markers}/auto/300x200@2x?padding=40,40,40,40&access_token=${mapboxToken}`
  }, [hasValidToken, route, routePath, mapboxToken])

  const difficultyColors = {
    easy: { bg: 'rgba(0, 255, 136, 0.2)', text: '#00ff88' },
    moderate: { bg: 'rgba(255, 170, 0, 0.2)', text: '#ffaa00' },
    hard: { bg: 'rgba(255, 68, 68, 0.2)', text: '#ff4444' },
  }

  const diffColor = difficultyColors[route.difficulty] || difficultyColors.moderate

  return (
    <button
      onClick={() => onSelect?.(route)}
      className="w-full text-left rounded-xl overflow-hidden transition-all duration-150 active:scale-[0.97] hover:brightness-110"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: isSaved
          ? '1px solid rgba(0, 212, 255, 0.35)'
          : '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Map Thumbnail - 60% of card height */}
      <div
        className="w-full relative overflow-hidden"
        style={{ aspectRatio: '4/3', backgroundColor: '#0a0a1a' }}
      >
        {staticMapUrl ? (
          <img
            src={staticMapUrl}
            alt={`Map of ${route.name}`}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(10,10,20,1) 100%)'
            }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
              <div
                className="w-12 h-0.5"
                style={{
                  background: 'repeating-linear-gradient(90deg, rgba(0,212,255,0.4) 0px, rgba(0,212,255,0.4) 6px, transparent 6px, transparent 10px)'
                }}
              />
              <div className="w-2 h-2 rounded-full bg-orange-400" />
            </div>
          </div>
        )}

        {/* Saved heart indicator */}
        {isSaved && (
          <div
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(0, 212, 255, 0.3)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="#00d4ff"
              stroke="#00d4ff"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        )}

        {/* Difficulty badge on map */}
        <div
          className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded text-xs font-medium"
          style={{
            background: diffColor.bg,
            color: diffColor.text,
            backdropFilter: 'blur(4px)',
          }}
        >
          {route.difficulty}
        </div>
      </div>

      {/* Content - compact */}
      <div className="p-2.5">
        {/* Route name - truncate */}
        <h3
          className="text-white font-semibold text-sm leading-tight truncate"
          title={route.name}
        >
          {route.name}
        </h3>

        {/* Location */}
        <p
          className="text-xs mt-0.5 truncate"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {route.start.label} → {route.end.label}
        </p>

        {/* Stats row */}
        <div
          className="flex items-center gap-2 mt-1.5 text-xs"
          style={{ color: 'rgba(255,255,255,0.6)' }}
        >
          <span>{route.distance} mi</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
          <span>{route.duration} min</span>
        </div>
      </div>
    </button>
  )
}
