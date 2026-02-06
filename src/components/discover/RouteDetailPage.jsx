// Route Detail Page - Tramo Brand Identity
// Full-screen route detail with map hero, stats, and start drive CTA

import { useState, useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import useStore from '../../store'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import TramoLogo from '../TramoLogo'
import { fetchRouteDriveCountBySlug } from '../../services/driveLogService'

// Difficulty color mapping
const DIFFICULTY_COLORS = {
  easy: '#22c55e',
  moderate: '#E8622C',
  hard: '#ef4444',
  expert: '#dc2626',
  challenging: '#ef4444',
}

export function RouteDetailPage({ route, onBack, onStartDrive }) {
  // Enable iOS-style swipe-back gesture
  useSwipeBack(onBack)

  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [routeGeometry, setRouteGeometry] = useState(null)
  const [loadingRoute, setLoadingRoute] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [driveCount, setDriveCount] = useState(0)

  // Store access for favorites
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []
  const addFavoriteRoute = useStore((state) => state.addFavoriteRoute)
  const removeFavoriteRoute = useStore((state) => state.removeFavoriteRoute)

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const mapboxStyle = 'mapbox://styles/antonflk/cml9m9s1j001401sgggri2ovp'

  // Fetch drive count for this route
  useEffect(() => {
    const loadDriveCount = async () => {
      if (!route.id) return
      try {
        const count = await fetchRouteDriveCountBySlug(route.id)
        setDriveCount(count)
        console.log(`🗄️ Route ${route.id} has ${count} drives`)
      } catch (err) {
        console.error('🗄️ Failed to fetch drive count:', err)
      }
    }
    loadDriveCount()
  }, [route.id])

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
        console.error('🗄️ Failed to fetch route geometry:', err)
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
      style: mapboxStyle,
      center: [centerLng, centerLat],
      zoom: 10,
      attributionControl: false,
      // Enable map interaction (zoom, pan, rotate)
      scrollZoom: true,
      dragPan: true,
      touchZoomRotate: true,
    })

    map.current.on('load', () => {
      setMapLoaded(true)

      // Add start marker source
      map.current.addSource('start-marker', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [route.start.lng, route.start.lat],
          },
        },
      })

      // Add end marker source
      map.current.addSource('end-marker', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [route.end.lng, route.end.lat],
          },
        },
      })

      // Start marker - outer glow
      map.current.addLayer({
        id: 'start-marker-glow',
        type: 'circle',
        source: 'start-marker',
        paint: {
          'circle-radius': 14,
          'circle-color': '#22c55e',
          'circle-opacity': 0.3,
          'circle-blur': 0.5,
          'circle-emissive-strength': 1.0,
        },
      })

      // Start marker - main circle
      map.current.addLayer({
        id: 'start-marker-main',
        type: 'circle',
        source: 'start-marker',
        paint: {
          'circle-radius': 8,
          'circle-color': '#22c55e',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-emissive-strength': 1.0,
        },
      })

      // End marker - outer glow
      map.current.addLayer({
        id: 'end-marker-glow',
        type: 'circle',
        source: 'end-marker',
        paint: {
          'circle-radius': 14,
          'circle-color': '#ef4444',
          'circle-opacity': 0.3,
          'circle-blur': 0.5,
          'circle-emissive-strength': 1.0,
        },
      })

      // End marker - main circle
      map.current.addLayer({
        id: 'end-marker-main',
        type: 'circle',
        source: 'end-marker',
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-emissive-strength': 1.0,
        },
      })
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

    // Remove existing layers/source if present
    if (map.current.getLayer('route-line')) {
      map.current.removeLayer('route-line')
    }
    if (map.current.getLayer('route-line-glow')) {
      map.current.removeLayer('route-line-glow')
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route')
    }

    // Add route source
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: routeGeometry,
      },
    })

    // Add glow layer
    map.current.addLayer({
      id: 'route-line-glow',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#E8622C',
        'line-width': 12,
        'line-blur': 5,
        'line-opacity': 0.4,
        'line-emissive-strength': 1.0,
      },
    })

    // Main route line
    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#E8622C',
        'line-width': 4,
        'line-opacity': 1.0,
        'line-emissive-strength': 1.0,
      },
    })

    // Fit bounds to route
    const coordinates = routeGeometry.coordinates
    const bounds = coordinates.reduce(
      (bounds, coord) => bounds.extend(coord),
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
    )

    map.current.fitBounds(bounds, {
      padding: { top: 50, bottom: 50, left: 50, right: 50 },
      duration: 500,
    })
  }, [mapLoaded, routeGeometry])

  // Handle save/unsave
  const handleSave = useCallback(async () => {
    if (isSaved) {
      const existing = favoriteRoutes.find(
        (fav) => fav.discoveryId === route.id || fav.id === route.id
      )
      if (existing) {
        removeFavoriteRoute(existing.id)
      }
    } else {
      setIsSaving(true)

      const favoriteRoute = {
        name: route.name,
        destination: route.end.label,
        origin: route.start.label,
        distance: route.distance * 1609.34,
        duration: route.duration * 60,
        discoveryId: route.id,
        isDiscoveryRoute: true,
        geometry: routeGeometry,
        startCoords: [route.start.lng, route.start.lat],
        endCoords: [route.end.lng, route.end.lat],
        waypoints: route.waypoints || [],
        discoveryData: route,
      }

      addFavoriteRoute(favoriteRoute)
      setIsSaving(false)
    }
  }, [isSaved, favoriteRoutes, route, routeGeometry, addFavoriteRoute, removeFavoriteRoute])

  // Handle Start Drive
  const handleStartDrive = useCallback(() => {
    if (!onStartDrive) return

    const routeObject = {
      name: route.name,
      destination: route.end.label,
      origin: route.start.label,
      distance: route.distance * 1609.34,
      duration: route.duration * 60,
      startCoords: [route.start.lng, route.start.lat],
      endCoords: [route.end.lng, route.end.lat],
      waypoints: route.waypoints || [],
      geometry: routeGeometry,
      isDiscoveryRoute: true,
      discoveryId: route.id,
      discoveryData: route,
    }

    onStartDrive(routeObject)
  }, [route, routeGeometry, onStartDrive])

  const difficultyColor = DIFFICULTY_COLORS[route.difficulty] || DIFFICULTY_COLORS.moderate

  return (
    <div style={styles.container}>
      {/* Scrollable Content */}
      <div style={styles.scrollContainer}>
        {/* Map Hero */}
        <div style={styles.mapHero}>
          <div ref={mapContainer} style={styles.mapContainer} />

          {/* Loading overlay */}
          {loadingRoute && (
            <div style={styles.loadingOverlay}>
              <div style={styles.spinner} />
            </div>
          )}

          {/* Back Button */}
          <button onClick={onBack} style={styles.backButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              ...styles.saveButton,
              background: isSaved ? 'rgba(232, 98, 44, 0.3)' : 'rgba(0, 0, 0, 0.6)',
              borderColor: isSaved ? 'rgba(232, 98, 44, 0.5)' : 'rgba(255, 255, 255, 0.2)',
            }}
          >
            {isSaving ? (
              <div style={styles.smallSpinner} />
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill={isSaved ? '#E8622C' : 'none'}
                stroke={isSaved ? '#E8622C' : 'white'}
                strokeWidth="2"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          </button>

          {/* No token fallback */}
          {!mapboxToken && (
            <div style={styles.mapFallback}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="1.5">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
              <span style={styles.mapFallbackText}>Map preview unavailable</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Title Section */}
          <div style={styles.titleSection}>
            <h1 style={styles.routeName}>{route.name}</h1>
            <div style={styles.titleMeta}>
              <span style={styles.regionLabel}>{route.region.replace('-', ' ')}</span>
              <span
                style={{
                  ...styles.difficultyBadge,
                  background: `${difficultyColor}20`,
                  color: difficultyColor,
                }}
              >
                {route.difficulty}
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div style={styles.statsRow}>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{route.distance}</span>
              <span style={styles.statLabel}>Miles</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{route.duration}</span>
              <span style={styles.statLabel}>Minutes</span>
            </div>
            <div style={styles.statCard}>
              <span style={{ ...styles.statValue, color: difficultyColor }}>
                {route.difficulty === 'easy' ? '1' : route.difficulty === 'moderate' ? '2' : route.difficulty === 'hard' ? '3' : '4'}
              </span>
              <span style={styles.statLabel}>Difficulty</span>
            </div>
            <div style={styles.statCard}>
              <span style={styles.statValue}>{driveCount}</span>
              <span style={styles.statLabel}>Drives</span>
            </div>
          </div>

          {/* Description Section */}
          <div style={styles.section}>
            <span style={styles.sectionLabel}>About This Route</span>
            <p style={styles.description}>{route.description}</p>
          </div>

          {/* Tags Section */}
          {route.tags && route.tags.length > 0 && (
            <div style={styles.section}>
              <div style={styles.tagsContainer}>
                {route.tags.map((tag) => (
                  <span key={tag} style={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Route Info Section */}
          <div style={styles.section}>
            <div style={styles.routeInfoRow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <circle cx="12" cy="10" r="3" />
                <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z" />
              </svg>
              <span style={styles.routeInfoLabel}>Start:</span>
              <span style={styles.routeInfoValue}>{route.start.label}</span>
            </div>
            <div style={styles.routeInfoRow}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              <span style={styles.routeInfoLabel}>End:</span>
              <span style={styles.routeInfoValue}>{route.end.label}</span>
            </div>
            {route.elevationGain && (
              <div style={styles.routeInfoRow}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2">
                  <path d="M8 3v18m0 0l-5-5m5 5l5-5" />
                  <path d="M16 21V3m0 0l5 5m-5-5l-5 5" />
                </svg>
                <span style={styles.routeInfoLabel}>Elevation:</span>
                <span style={styles.routeInfoValue}>{route.elevationGain.toLocaleString()} ft</span>
              </div>
            )}
          </div>

          {/* Curated By Section */}
          <div style={styles.curatedSection}>
            <TramoLogo size={20} bgColor="#0A0A0A" />
            <span style={styles.curatedText}>Curated by Tramo</span>
          </div>

          {/* Spacer for fixed bottom bar */}
          <div style={{ height: '100px' }} />
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div style={styles.bottomBar}>
        <button onClick={handleStartDrive} style={styles.startButton}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Start Drive</span>
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    inset: 0,
    background: '#0A0A0A',
    display: 'flex',
    flexDirection: 'column',
  },
  scrollContainer: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  mapHero: {
    position: 'relative',
    height: '250px',
    width: '100%',
    background: '#111111',
  },
  mapContainer: {
    position: 'absolute',
    inset: 0,
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.5)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid #1A1A1A',
    borderTopColor: '#E8622C',
    animation: 'spin 1s linear infinite',
  },
  smallSpinner: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#E8622C',
    animation: 'spin 1s linear infinite',
  },
  backButton: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top, 16px))',
    left: '16px',
    width: '44px',
    height: '44px',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10,
  },
  saveButton: {
    position: 'absolute',
    top: 'max(16px, env(safe-area-inset-top, 16px))',
    right: '16px',
    width: '44px',
    height: '44px',
    borderRadius: '8px',
    border: '1px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10,
    transition: 'all 0.2s ease',
  },
  mapFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    background: '#111111',
  },
  mapFallbackText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
  },
  content: {
    padding: '20px 16px',
  },
  titleSection: {
    marginBottom: '20px',
  },
  routeName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '28px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '8px',
    lineHeight: 1.2,
  },
  titleMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  regionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#666666',
  },
  difficultyBadge: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '4px 10px',
    borderRadius: '6px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '28px',
    color: '#FFFFFF',
    lineHeight: 1,
    letterSpacing: '0.02em',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#666666',
    marginTop: '4px',
  },
  section: {
    marginBottom: '20px',
  },
  sectionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#666666',
    display: 'block',
    marginBottom: '10px',
  },
  description: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 400,
    color: '#888888',
    lineHeight: 1.7,
    margin: 0,
  },
  tagsContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: '#888888',
    background: '#1A1A1A',
    padding: '6px 12px',
    borderRadius: '8px',
  },
  routeInfoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  routeInfoLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    color: '#666666',
  },
  routeInfoValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: 400,
    color: '#888888',
  },
  curatedSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #1A1A1A',
  },
  curatedText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(232, 98, 44, 0.6)',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px',
    paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
    background: 'linear-gradient(to top, #0A0A0A 60%, transparent)',
    borderTop: '1px solid #1A1A1A',
  },
  startButton: {
    width: '100%',
    padding: '16px 24px',
    background: '#E8622C',
    border: 'none',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '15px',
    fontWeight: 600,
    color: '#FFFFFF',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
}

// Add keyframes for spinner animation
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`
if (typeof document !== 'undefined' && !document.querySelector('[data-route-detail-styles]')) {
  styleSheet.setAttribute('data-route-detail-styles', 'true')
  document.head.appendChild(styleSheet)
}

export default RouteDetailPage
