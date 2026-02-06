// Compact grid card for Discover tab - Tramo Brand Identity
// 2-column grid layout with map thumbnail

import { useState, useEffect, useMemo } from 'react'

// Difficulty color mapping
const DIFFICULTY_COLORS = {
  easy: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  moderate: { bg: 'rgba(232, 98, 44, 0.15)', text: '#E8622C' },
  hard: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  challenging: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  expert: { bg: 'rgba(220, 38, 38, 0.15)', text: '#dc2626' },
}

// Polyline encoder for simplified coordinates
function encodePolyline(coordinates) {
  // coordinates are [lng, lat] - polyline expects [lat, lng]
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
    // Green start marker, orange end marker
    const markers = `pin-s+22c55e(${startCoord}),pin-s+E8622C(${endCoord})`

    let pathOverlay = ''
    if (routePath) {
      // Use orange (#E8622C) for visibility on dark map
      pathOverlay = `path-3+E8622C-1(${encodeURIComponent(routePath)}),`
    }

    // Compact card image with no logo/attribution
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pathOverlay}${markers}/auto/300x150@2x?padding=30,30,30,30&logo=false&attribution=false&access_token=${mapboxToken}`
  }, [hasValidToken, route, routePath, mapboxToken])

  // Get difficulty colors
  const diffColor = DIFFICULTY_COLORS[route.difficulty] || DIFFICULTY_COLORS.moderate

  return (
    <button
      onClick={() => onSelect?.(route)}
      style={{
        ...styles.card,
        border: isSaved ? '1px solid rgba(232, 98, 44, 0.3)' : '1px solid #1A1A1A',
        boxShadow: isSaved ? '0 0 15px rgba(232, 98, 44, 0.1)' : 'none',
      }}
    >
      {/* Map Thumbnail - compact 2:1 aspect ratio */}
      <div style={styles.mapContainer}>
        {/* Fallback gradient background - always present behind image */}
        <div style={styles.mapFallback}>
          <div style={styles.fallbackRoute}>
            <div style={styles.startDot} />
            <div style={styles.routeLine} />
            <div style={styles.endDot} />
          </div>
        </div>

        {/* Map image - overlays fallback when loaded successfully */}
        {staticMapUrl && !imageError && (
          <img
            src={staticMapUrl}
            alt={`Map of ${route.name}`}
            style={styles.mapImage}
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {/* Saved heart indicator */}
        {isSaved && (
          <div style={styles.savedBadge}>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="#E8622C"
              stroke="#E8622C"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
        )}

        {/* Difficulty badge on map */}
        <div
          style={{
            ...styles.difficultyBadge,
            background: diffColor.bg,
            color: diffColor.text,
          }}
        >
          {route.difficulty}
        </div>
      </div>

      {/* Content - very compact */}
      <div style={styles.content}>
        {/* Route name - truncate */}
        <h3 style={styles.routeName} title={route.name}>
          {route.name}
        </h3>

        {/* Location + Stats on same line */}
        <p style={styles.routeMeta}>
          {route.start.label} to {route.end.label} - {route.distance}mi - {route.duration}m
        </p>
      </div>
    </button>
  )
}

const styles = {
  card: {
    width: '100%',
    textAlign: 'left',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'all 0.15s ease',
    background: '#111111',
    padding: 0,
    cursor: 'pointer',
  },
  mapContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    aspectRatio: '2/1',
    backgroundColor: '#0A0A0A',
  },
  mapFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, rgba(232,98,44,0.05) 0%, #0A0A0A 100%)',
  },
  fallbackRoute: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  startDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#22c55e',
  },
  routeLine: {
    width: '40px',
    height: '2px',
    background: 'repeating-linear-gradient(90deg, rgba(232,98,44,0.4) 0px, rgba(232,98,44,0.4) 6px, transparent 6px, transparent 10px)',
  },
  endDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#E8622C',
  },
  mapImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  savedBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(232, 98, 44, 0.2)',
  },
  difficultyBadge: {
    position: 'absolute',
    bottom: '6px',
    left: '6px',
    padding: '3px 8px',
    borderRadius: '6px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  content: {
    padding: '8px 10px 10px',
  },
  routeName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    fontWeight: 600,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '2px',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  routeMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
