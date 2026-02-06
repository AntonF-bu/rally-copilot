// Discover Tab - Tramo Editorial Design
// Clean, curated browsing experience

import { useState, useEffect, useCallback, useMemo } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES } from '../../data/discoveryRoutes'
import { fetchPublishedRoutes } from '../../services/supabaseRouteService'
import { fetchAllRouteStats } from '../../services/ratingService'
import { RouteDetailPage } from '../discover/RouteDetailPage'

// Difficulty badge component
function DifficultyBadge({ difficulty }) {
  const difficultyColors = {
    easy: { bg: 'rgba(76,175,80,0.15)', text: '#6FCF73' },
    moderate: { bg: 'rgba(255,193,7,0.15)', text: '#FFC107' },
    challenging: { bg: 'rgba(255,107,53,0.2)', text: '#FF8B5E' },
    expert: { bg: 'rgba(244,67,54,0.15)', text: '#FF6B6B' },
  }
  const colors = difficultyColors[difficulty] || difficultyColors.moderate

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '4px',
        background: colors.bg,
        color: colors.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '9px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {difficulty}
    </span>
  )
}

// Featured route card with map preview
function FeaturedRouteCard({ route, stats, onSelect }) {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const hasValidToken = mapboxToken && mapboxToken.length > 10

  // Get first sentence of description for excerpt
  const excerpt = useMemo(() => {
    if (!route.description) return ''
    const firstSentence = route.description.split('.')[0]
    return firstSentence.length > 80 ? firstSentence.substring(0, 80) + '...' : firstSentence + '.'
  }, [route.description])

  // Generate static map URL
  const mapUrl = useMemo(() => {
    if (!hasValidToken) return null

    // Use geometry if available, otherwise use start/end coords
    if (route.geometry?.coordinates?.length >= 2) {
      const coords = route.geometry.coordinates
      const midIdx = Math.floor(coords.length / 2)
      const [lng, lat] = coords[midIdx]
      return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${lng},${lat},10,0/400x200@2x?access_token=${mapboxToken}`
    }

    // Fallback: use midpoint between start and end
    if (route.start?.lat && route.end?.lat) {
      const midLat = (route.start.lat + route.end.lat) / 2
      const midLng = (route.start.lng + route.end.lng) / 2
      return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${midLng},${midLat},11,0/400x200@2x?access_token=${mapboxToken}`
    }

    return null
  }, [route.geometry, route.start, route.end, hasValidToken, mapboxToken])

  return (
    <button onClick={() => onSelect(route)} style={styles.featuredCard}>
      {/* Map Preview */}
      <div style={styles.featuredMapContainer}>
        {mapUrl ? (
          <img src={mapUrl} alt="" style={styles.featuredMapImage} />
        ) : (
          <div style={styles.featuredMapPlaceholder} />
        )}
        {/* TRAMO PICK label */}
        <div style={styles.tramoPick}>TRAMO PICK</div>
      </div>

      {/* Content */}
      <div style={styles.featuredContent}>
        <h3 style={styles.featuredName}>{route.name}</h3>

        <div style={styles.featuredMeta}>
          <span style={styles.featuredRegion}>{route.region}</span>
          <DifficultyBadge difficulty={route.difficulty} />
        </div>

        {excerpt && <p style={styles.featuredExcerpt}>{excerpt}</p>}

        <div style={styles.featuredStats}>
          <span style={styles.statItem}>{route.distance} mi</span>
          <span style={styles.statDot} />
          <span style={styles.statItem}>{route.duration} min</span>
          {stats?.driveCount > 0 && (
            <>
              <span style={styles.statDot} />
              <span style={styles.statItem}>{stats.driveCount} drives</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// Collection route card (single column list item)
function CollectionRouteCard({ route, stats, onSelect }) {
  return (
    <button onClick={() => onSelect(route)} style={styles.collectionCard}>
      <div style={styles.collectionContent}>
        <h4 style={styles.collectionName}>{route.name}</h4>
        <span style={styles.collectionRegion}>{route.region}</span>

        <div style={styles.collectionMeta}>
          <span style={styles.collectionStat}>{route.distance} mi</span>
          <span style={styles.metaDot} />
          <span style={styles.collectionStat}>{route.duration} min</span>
          <span style={styles.metaDot} />
          <DifficultyBadge difficulty={route.difficulty} />

          {/* Social proof */}
          {(stats?.driveCount > 0 || stats?.averageRating > 0) && (
            <>
              <span style={styles.metaDot} />
              <span style={styles.socialProof}>
                {stats.driveCount > 0 && `${stats.driveCount} drives`}
                {stats.driveCount > 0 && stats.averageRating > 0 && ' · '}
                {stats.averageRating > 0 && (
                  <>
                    {stats.averageRating.toFixed(1)}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="#E8622C"
                      stroke="none"
                      style={{ marginLeft: '2px', verticalAlign: 'middle' }}
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#666666"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  )
}

export function DiscoverTab({ onStartRoute, onTabChange }) {
  // Route detail page state
  const [selectedRoute, setSelectedRoute] = useState(null)

  // Supabase route fetching state
  const [routes, setRoutes] = useState(DISCOVERY_ROUTES)
  const [isLoading, setIsLoading] = useState(true)

  // Route stats (drives + ratings) - keyed by route slug
  const [routeStats, setRouteStats] = useState({})

  // Store actions for starting drive
  const setCurrentRoute = useStore((state) => state.setCurrentRoute)
  const setActiveRoute = useStore((state) => state.setActiveRoute)

  // Fetch routes from Supabase on mount
  const loadRoutes = useCallback(async () => {
    setIsLoading(true)

    try {
      console.log('DiscoverTab: Fetching routes from Supabase...')
      const supabaseRoutes = await fetchPublishedRoutes()

      if (supabaseRoutes && supabaseRoutes.length > 0) {
        console.log(`DiscoverTab: Loaded ${supabaseRoutes.length} routes from Supabase`)
        setRoutes(supabaseRoutes)
      } else {
        console.log('DiscoverTab: No routes in Supabase, using fallback')
        setRoutes(DISCOVERY_ROUTES)
      }
    } catch (error) {
      console.error('DiscoverTab: Failed to fetch routes, using fallback:', error)
      setRoutes(DISCOVERY_ROUTES)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRoutes()
  }, [loadRoutes])

  // Fetch route stats (drives + ratings) once on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await fetchAllRouteStats()
        setRouteStats(stats)
      } catch (err) {
        console.error('Failed to fetch route stats:', err)
      }
    }
    loadStats()
  }, [])

  // Get featured route - rotate based on day of week
  const featuredRoute = useMemo(() => {
    if (routes.length === 0) return null
    const dayOfWeek = new Date().getDay()
    const index = dayOfWeek % routes.length
    return routes[index]
  }, [routes])

  // Collection routes - all routes except the featured one
  const collectionRoutes = useMemo(() => {
    if (!featuredRoute) return routes
    return routes.filter((r) => r.id !== featuredRoute.id)
  }, [routes, featuredRoute])

  // Handle route card tap - open detail page
  const handleSelectRoute = (route) => {
    setSelectedRoute(route)
  }

  // Handle back from detail page
  const handleBackFromDetail = () => {
    setSelectedRoute(null)
  }

  // Handle Start Drive from detail page
  const handleStartDrive = async (routeObject) => {
    console.log('DiscoverTab: Starting drive with route:', routeObject.name)

    if (routeObject.geometry) {
      setCurrentRoute(routeObject)
      setActiveRoute(routeObject)

      if (onTabChange) {
        onTabChange('home')
      }
    } else if (onStartRoute) {
      onStartRoute(routeObject)
    }
  }

  // Show RouteDetailPage when a route is selected
  if (selectedRoute) {
    return (
      <RouteDetailPage
        route={selectedRoute}
        onBack={handleBackFromDetail}
        onStartDrive={handleStartDrive}
      />
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Discover</h1>
        <p style={styles.subtitle}>Curated roads worth driving</p>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div style={styles.loadingContainer}>
          <div style={styles.skeletonFeatured} />
          <div style={styles.skeletonSection}>
            <div style={styles.skeletonLabel} />
            {[1, 2, 3].map((i) => (
              <div key={i} style={styles.skeletonCard} />
            ))}
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
        </div>
      ) : (
        <>
          {/* Featured Route */}
          {featuredRoute && (
            <div style={styles.featuredSection}>
              <FeaturedRouteCard
                route={featuredRoute}
                stats={routeStats[featuredRoute.id]}
                onSelect={handleSelectRoute}
              />
            </div>
          )}

          {/* The Collection */}
          <div style={styles.section}>
            <p style={styles.sectionOverline}>THE COLLECTION</p>
            <p style={styles.sectionSubtitle}>
              {routes.length} hand-picked New England roads
            </p>

            <div style={styles.collectionList}>
              {collectionRoutes.map((route) => (
                <CollectionRouteCard
                  key={route.id}
                  route={route}
                  stats={routeStats[route.id]}
                  onSelect={handleSelectRoute}
                />
              ))}
            </div>
          </div>

          {/* Community Roads - Placeholder */}
          <div style={styles.section}>
            <p style={styles.sectionOverline}>COMMUNITY ROADS</p>
            <div style={styles.comingSoonCard}>
              <h4 style={styles.comingSoonTitle}>Coming Soon</h4>
              <p style={styles.comingSoonText}>
                Drive a road you love? Soon you'll be able to share it with the Tramo community.
              </p>
            </div>
          </div>

          {/* Bottom safe area padding */}
          <div style={{ height: '100px' }} />
        </>
      )}
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100%',
    background: 'transparent',
  },
  header: {
    padding: '16px',
    paddingTop: 'calc(env(safe-area-inset-top, 20px) + 8px)',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '28px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '4px',
  },
  subtitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#888888',
    margin: 0,
  },

  // Loading
  loadingContainer: {
    padding: '0 16px',
  },
  skeletonFeatured: {
    height: '280px',
    borderRadius: '16px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    marginBottom: '24px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonSection: {
    marginBottom: '24px',
  },
  skeletonLabel: {
    width: '120px',
    height: '12px',
    borderRadius: '4px',
    background: '#1A1A1A',
    marginBottom: '16px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  skeletonCard: {
    height: '72px',
    borderRadius: '12px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    marginBottom: '8px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },

  // Featured Route
  featuredSection: {
    padding: '0 16px 24px',
  },
  featuredCard: {
    width: '100%',
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '16px',
    overflow: 'hidden',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.2s ease',
  },
  featuredMapContainer: {
    position: 'relative',
    width: '100%',
    height: '200px',
    background: '#0A0A0A',
  },
  featuredMapImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  featuredMapPlaceholder: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #111111 0%, #1A1A1A 100%)',
  },
  tramoPick: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    padding: '4px 8px',
    background: 'rgba(10, 10, 10, 0.85)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#E8622C',
  },
  featuredContent: {
    padding: '16px',
  },
  featuredName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '22px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '8px',
  },
  featuredMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  featuredRegion: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#666666',
  },
  featuredExcerpt: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#888888',
    margin: 0,
    marginBottom: '12px',
    lineHeight: 1.5,
  },
  featuredStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statItem: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#888888',
  },
  statDot: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    background: '#444444',
  },

  // Section
  section: {
    padding: '0 16px 24px',
  },
  sectionOverline: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    margin: 0,
    marginBottom: '4px',
  },
  sectionSubtitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#888888',
    margin: 0,
    marginBottom: '16px',
  },

  // Collection List
  collectionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  collectionCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '16px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.2s ease',
  },
  collectionContent: {
    flex: 1,
    minWidth: 0,
  },
  collectionName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '15px',
    fontWeight: 500,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '2px',
  },
  collectionRegion: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#666666',
    display: 'block',
    marginBottom: '8px',
  },
  collectionMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  collectionStat: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
  },
  metaDot: {
    width: '2px',
    height: '2px',
    borderRadius: '50%',
    background: '#444444',
  },
  socialProof: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
    display: 'flex',
    alignItems: 'center',
  },

  // Coming Soon
  comingSoonCard: {
    padding: '24px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    textAlign: 'center',
  },
  comingSoonTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '16px',
    fontWeight: 500,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '8px',
  },
  comingSoonText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#888888',
    margin: 0,
    lineHeight: 1.5,
  },
}
