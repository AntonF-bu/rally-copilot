// Compact grid card for Discover tab
// 2-column grid layout with map thumbnail

import { useState, useEffect, useMemo } from 'react'
import { colors } from '../../styles/theme'

// Polyline encoder for simplified coordinates
function encodePolyline(coordinates) {
  // coordinates are [lng, lat] — polyline expects [lat, lng]
  let encoded = ''
  let prevLat = 0, prevLng = 0

  for (const [lng, lat] of coordinates) {
    const latRound = Math.round(lat * 1e5)
    const lngRound = Math.round(lng * 1e5)
    encoded += encodeValue(latRound - prevLat)
    encoded += encodeValue(lngRound - prevLng)
    prevLat = latRound
    prevLng = lngRound
  }
  return encoded
}

function encodeValue(value) {
  value = value < 0 ? ~(value << 1) : value << 1
  let encoded = ''
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63)
    value >>= 5
  }
  encoded += String.fromCharCode(value + 63)
  return encoded
}

export function DiscoverGridCard({ route, isSaved, onSelect }) {
  const [routePath, setRoutePath] = useState(null)
  const [imageError, setImageError] = useState(false)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const hasValidToken = mapboxToken && mapboxToken.length > 10

  // Fetch route geometry for the path overlay - using GeoJSON for simplification
  useEffect(() => {
    if (!hasValidToken || routePath) return

    const fetchRoute = async () => {
      try {
        const coords = [
          `${route.start.lng},${route.start.lat}`,
          ...(route.waypoints || []).map((wp) => `${wp.lng},${wp.lat}`),
          `${route.end.lng},${route.end.lat}`,
        ].join(';')

        // Use geojson format so we can simplify the coordinates
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxToken}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.routes?.[0]?.geometry?.coordinates) {
          const fullCoords = data.routes[0].geometry.coordinates
          // Simplify: take every Nth point to keep under ~50 points (avoids URL length issues)
          const maxPoints = 50
          const step = Math.max(1, Math.floor(fullCoords.length / maxPoints))
          const simplified = fullCoords.filter((_, i) => i % step === 0 || i === fullCoords.length - 1)
          // Encode as polyline for static map API
          const encoded = encodePolyline(simplified)
          setRoutePath(encoded)
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
    // Cyan start marker, orange end marker
    const markers = `pin-s+00d4ff(${startCoord}),pin-s+F97316(${endCoord})`

    let pathOverlay = ''
    if (routePath) {
      // Use orange (#F97316) for visibility on dark map
      pathOverlay = `path-3+F97316-1(${encodeURIComponent(routePath)}),`
    }

    // Compact card image with no logo/attribution
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pathOverlay}${markers}/auto/300x150@2x?padding=30,30,30,30&logo=false&attribution=false&access_token=${mapboxToken}`
  }, [hasValidToken, route, routePath, mapboxToken])

  // Use theme difficulty colors
  const diffColor = colors.difficulty[route.difficulty] || colors.difficulty.moderate

  return (
    <button
      onClick={() => onSelect?.(route)}
      className="w-full text-left rounded-xl overflow-hidden transition-all duration-150 active:scale-[0.97]"
      style={{
        background: colors.bgCard,
        border: isSaved
          ? `1px solid ${colors.warmBorder}`
          : `1px solid ${colors.glassBorder}`,
        boxShadow: isSaved ? `0 0 15px ${colors.accentGlow}` : 'none',
      }}
    >
      {/* Map Thumbnail - compact 2:1 aspect ratio */}
      <div
        className="w-full relative overflow-hidden"
        style={{ aspectRatio: '2/1', backgroundColor: '#0a0a1a' }}
      >
        {/* Fallback gradient background - always present behind image */}
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

        {/* Map image - overlays fallback when loaded successfully */}
        {staticMapUrl && !imageError && (
          <img
            src={staticMapUrl}
            alt={`Map of ${route.name}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {/* Saved heart indicator */}
        {isSaved && (
          <div
            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: colors.accentGlow,
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill={colors.accent}
              stroke={colors.accent}
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        )}

        {/* Difficulty badge on map */}
        <div
          className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded"
          style={{
            fontFamily: "'Sora', -apple-system, sans-serif",
            fontSize: '9px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
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
          className="text-white leading-tight truncate"
          title={route.name}
          style={{
            fontFamily: "'Sora', -apple-system, sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
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
