// Route card for Discover tab
// Tappable preview card that opens route detail view
// Tramo Brand Design

import { useState, useEffect, useMemo } from 'react'

// Tramo brand colors
const ACCENT = '#E8622C'
const ACCENT_GLOW = 'rgba(232,98,44,0.15)'

export function DiscoverRouteCard({ route, isSaved, onSelect }) {
  const [routePath, setRoutePath] = useState(null)

  // Generate Mapbox Static Image URL
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

        const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?geometries=polyline&overview=full&access_token=${mapboxToken}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.routes?.[0]?.geometry) {
          // geometry is already polyline encoded
          setRoutePath(data.routes[0].geometry)
        }
      } catch (err) {
        console.error('Failed to fetch route for preview:', err)
      }
    }

    fetchRoute()
  }, [route, hasValidToken, mapboxToken, routePath])

  // Build static map URL with route path overlay
  const staticMapUrl = useMemo(() => {
    if (!hasValidToken) return null

    const startCoord = `${route.start.lng},${route.start.lat}`
    const endCoord = `${route.end.lng},${route.end.lat}`

    // Use small circle markers instead of pins for cleaner look
    const markers = `pin-s+00d4ff(${startCoord}),pin-s+ff9500(${endCoord})`

    // Build path overlay if we have the route geometry
    let pathOverlay = ''
    if (routePath) {
      // Cyan route line, 3px width, good opacity
      pathOverlay = `path-3+00d4ff-0.85(${encodeURIComponent(routePath)}),`
    }

    // Use dark-v11 for clean minimal look (no traffic/road highlights)
    // Use 'auto' to automatically fit bounds to path and markers with padding
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pathOverlay}${markers}/auto/400x180@2x?padding=50,50,50,50&access_token=${mapboxToken}`
  }, [hasValidToken, route, routePath, mapboxToken])

  const difficultyColors = {
    easy: { bg: 'rgba(0, 255, 136, 0.15)', text: '#00ff88' },
    moderate: { bg: 'rgba(255, 170, 0, 0.15)', text: '#ffaa00' },
    hard: { bg: 'rgba(255, 68, 68, 0.15)', text: '#ff4444' },
  }

  const diffColor = difficultyColors[route.difficulty] || difficultyColors.moderate

  return (
    <button
      onClick={() => onSelect?.(route)}
      className="w-full text-left rounded-2xl overflow-hidden transition-all duration-150 active:scale-[0.98] active:brightness-110 hover:brightness-105"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: isSaved
          ? '1px solid rgba(0, 212, 255, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Map Preview */}
      <div
        className="w-full h-36 relative overflow-hidden"
        style={{ backgroundColor: '#0a0a1a' }}
      >
        {/* Map image or fallback */}
        {staticMapUrl ? (
          <img
            src={staticMapUrl}
            alt={`Map of ${route.name}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Hide image on error, fallback will show
              e.target.style.display = 'none'
            }}
          />
        ) : (
          /* Gradient fallback with route indicator */
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(15,26,46,0.9) 50%, rgba(10,10,20,1) 100%)'
            }}
          >
            {/* Stylized route indicator */}
            <div className="flex items-center gap-3">
              {/* Start dot */}
              <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
              {/* Dashed line */}
              <div
                className="w-20 h-0.5"
                style={{
                  background: 'repeating-linear-gradient(90deg, rgba(0,212,255,0.5) 0px, rgba(0,212,255,0.5) 8px, transparent 8px, transparent 12px)'
                }}
              />
              {/* End dot */}
              <div className="w-3 h-3 rounded-full bg-orange-400 shadow-lg shadow-orange-400/50" />
            </div>
          </div>
        )}

        {/* Overlay gradient for text readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, transparent 50%, rgba(10,10,15,0.8) 100%)'
          }}
        />

        {/* Saved indicator */}
        {isSaved && (
          <div
            className="absolute top-2 right-2 px-2 py-1 rounded-full flex items-center gap-1"
            style={{
              background: ACCENT_GLOW,
              backdropFilter: 'blur(8px)',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={ACCENT}
              stroke={ACCENT}
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-xs" style={{ color: ACCENT }}>Saved</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title + Location */}
        <h3 className="text-white font-semibold text-lg mb-1">
          {route.name}
        </h3>
        <div
          className="flex items-center gap-1 text-sm mb-3"
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
          <span className="mx-1">·</span>
          <span>{route.distance} mi</span>
          <span className="mx-1">·</span>
          <span>{route.duration} min</span>
        </div>

        {/* Description */}
        {route.description && (
          <p
            className="text-sm mb-3 line-clamp-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {route.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {route.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs capitalize"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              {tag}
            </span>
          ))}
          <span
            className="px-2 py-0.5 rounded-full text-xs capitalize"
            style={{
              background: diffColor.bg,
              color: diffColor.text,
            }}
          >
            {route.difficulty}
          </span>
        </div>
      </div>
    </button>
  )
}
