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

  // Build static map URL - compact dimensions, no attribution
  const staticMapUrl = useMemo(() => {
    if (!hasValidToken) return null

    const startCoord = `${route.start.lng},${route.start.lat}`
    const endCoord = `${route.end.lng},${route.end.lat}`
    const markers = `pin-s+00d4ff(${startCoord}),pin-s+ff9500(${endCoord})`

    let pathOverlay = ''
    if (routePath) {
      pathOverlay = `path-3+00d4ff-0.9(${encodeURIComponent(routePath)}),`
    }

    // Compact card image with no logo/attribution
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pathOverlay}${markers}/auto/300x150@2x?padding=30,30,30,30&logo=false&attribution=false&access_token=${mapboxToken}`
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
      className="w-full text-left rounded-lg overflow-hidden transition-all duration-150 active:scale-[0.97] hover:brightness-110"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: isSaved
          ? '1px solid rgba(0, 212, 255, 0.35)'
          : '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      {/* Map Thumbnail - compact 2:1 aspect ratio */}
      <div
        className="w-full relative overflow-hidden"
        style={{ aspectRatio: '2/1', backgroundColor: '#0a0a1a' }}
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
            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(0, 212, 255, 0.3)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg
              width="10"
              height="10"
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
          className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium capitalize"
          style={{
            background: diffColor.bg,
            color: diffColor.text,
            backdropFilter: 'blur(4px)',
          }}
        >
          {route.difficulty}
        </div>
      </div>

      {/* Content - very compact */}
      <div className="px-2 py-1.5">
        {/* Route name - truncate */}
        <h3
          className="text-white font-medium text-xs leading-tight truncate"
          title={route.name}
        >
          {route.name}
        </h3>

        {/* Location + Stats on same line */}
        <p
          className="text-[11px] mt-0.5 truncate"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {route.start.label} → {route.end.label} · {route.distance}mi · {route.duration}m
        </p>
      </div>
    </button>
  )
}
