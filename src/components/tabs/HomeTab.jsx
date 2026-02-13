// Home Tab - Tramo Brand Identity
// Clean dark aesthetic with precise typography and minimal accents

import { useState, useEffect, useMemo } from 'react'
import useStore from '../../store'
import { geocodeAddress } from '../../services/routeService'
import { DISCOVERY_ROUTES } from '../../data/discoveryRoutes'
import { RouteDetailPage } from '../discover/RouteDetailPage'
import './HomeTab.css'

export function HomeTab({
  hasLocation,
  recentRoutes,
  favoriteRoutes,
  onStartDrive,
  onStartFreeDrive,
  onSelectSavedRoute,
  onStartDiscoveryRoute,
  onRemoveRecent,
  onRemoveFavorite,
  onClearRecentRoutes,
  isLoading,
  error,
  onClearError,
  onTabChange,
}) {
  const [showDestination, setShowDestination] = useState(false)
  const [showRecentList, setShowRecentList] = useState(false)
  const [showFavoritesList, setShowFavoritesList] = useState(false)
  const [selectedDiscoveryRoute, setSelectedDiscoveryRoute] = useState(null)

  // Get profile from store for personalized greeting
  const profile = useStore((state) => state.profile)
  const displayName = profile?.display_name || 'driver'

  // Search state
  const [destination, setDestination] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  // Geocode search
  useEffect(() => {
    if (!destination || destination.length < 3) {
      setSearchResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const results = await geocodeAddress(destination)
      setSearchResults(results || [])
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [destination])

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 5) return 'Good night'
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    if (hour < 21) return 'Good evening'
    return 'Good night'
  }, [])

  // Hero route - prefer recent route with curves, else fall back to discovery
  const heroRoute = useMemo(() => {
    if (recentRoutes?.length > 0) {
      // Find a route with decent curve count
      const withCurves = recentRoutes.find(r => (r.curveCount || 0) > 5)
      return withCurves || recentRoutes[0]
    }
    return DISCOVERY_ROUTES[0] || null
  }, [recentRoutes])

  // Compute lifetime stats from recentRoutes
  const lifetimeStats = useMemo(() => {
    if (!recentRoutes?.length) {
      return { drives: 0, miles: 0, curves: 0 }
    }
    return recentRoutes.reduce((acc, route) => ({
      drives: acc.drives + 1,
      miles: acc.miles + (route.distance ? route.distance / 1609.34 : 0),
      curves: acc.curves + (route.curveCount || 0),
    }), { drives: 0, miles: 0, curves: 0 })
  }, [recentRoutes])

  // Nearby routes - first 3 from discovery
  const nearbyRoutes = useMemo(() => {
    return DISCOVERY_ROUTES.slice(0, 3)
  }, [])

  // Handlers
  const handleStartDrive = () => setShowDestination(true)

  const handleSelectDestination = async (dest) => {
    setShowDestination(false)
    setDestination('')
    setSearchResults([])
    onStartDrive(dest)
  }

  // Open discovery route preview instead of starting drive immediately
  const handleOpenRoutePreview = (route) => {
    setSelectedDiscoveryRoute(route)
  }

  // Handle clicking a saved/favorite route - look up full route from discoveryRoutes
  const handleSavedRouteClick = (savedRoute) => {
    // If it has discoveryData, use it directly
    if (savedRoute.discoveryData) {
      setSelectedDiscoveryRoute(savedRoute.discoveryData)
      return
    }

    // Try to find the route by multiple methods
    let fullRoute = null

    // 1. Try matching by slug (the route's original id)
    if (savedRoute.slug) {
      fullRoute = DISCOVERY_ROUTES.find(r => r.id === savedRoute.slug)
    }

    // 2. Try matching by discoveryId
    if (!fullRoute && savedRoute.discoveryId) {
      fullRoute = DISCOVERY_ROUTES.find(r => r.id === savedRoute.discoveryId)
    }

    // 3. Try matching by name
    if (!fullRoute && savedRoute.name) {
      fullRoute = DISCOVERY_ROUTES.find(r => r.name === savedRoute.name)
    }

    if (fullRoute) {
      setSelectedDiscoveryRoute(fullRoute)
      return
    }

    // This is a free drive or custom route - open RouteDetailPage with saved data
    // Create a minimal route object that RouteDetailPage can display
    if (savedRoute.isDiscoveryRoute || savedRoute.startCoords) {
      setSelectedDiscoveryRoute({
        ...savedRoute,
        id: savedRoute.slug || savedRoute.discoveryId || savedRoute.name,
        start: savedRoute.startCoords || savedRoute.start,
        end: savedRoute.endCoords || savedRoute.end,
      })
      return
    }

    // True fallback for non-discovery routes
    onSelectSavedRoute(savedRoute)
  }

  // Handle starting drive from the preview - use the discovery route handler
  const handleStartDiscoveryDrive = (routeData) => {
    // Use the dedicated discovery route handler which handles coordinates directly
    if (onStartDiscoveryRoute) {
      onStartDiscoveryRoute(routeData)
    } else {
      // Fallback to saved route handler
      onSelectSavedRoute(routeData)
    }
  }

  const formatDist = (meters) => {
    if (!meters) return '--'
    const miles = meters / 1609.34
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '--'
    const mins = Math.round(seconds / 60)
    return `${mins} min`
  }

  // Format duration intelligently - handles both seconds and minutes
  const formatDurationSmart = (duration) => {
    if (!duration || duration === 0) return null
    // If duration is large (> 200), it's probably in seconds - convert to minutes
    // Discovery routes store duration in minutes (e.g., 34, 55)
    // Free drive routes from API might store in seconds (e.g., 1906)
    const mins = duration > 200 ? Math.round(duration / 60) : Math.round(duration)
    if (mins >= 60) {
      const hours = Math.floor(mins / 60)
      const remainingMins = mins % 60
      return `${hours} hr ${remainingMins} min`
    }
    return `${mins} min`
  }

  const timeAgo = (timestamp) => {
    if (!timestamp) return ''
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const getDifficulty = (route) => {
    if (route.difficulty) return route.difficulty
    // Derive from curves per mile
    const miles = (route.distance || 0) / 1609.34
    const curves = route.curveCount || 0
    const cpm = miles > 0 ? curves / miles : 0
    if (cpm < 1) return 'easy'
    if (cpm < 2) return 'moderate'
    if (cpm < 4) return 'hard'
    return 'expert'
  }

  // Generate SVG route path - creates a stylized route visualization
  const generateRoutePath = (seed = 0, width = 300, height = 120) => {
    // Simple deterministic path generation
    const points = []
    const segments = 6
    for (let i = 0; i <= segments; i++) {
      const x = (width * 0.1) + (width * 0.8 * i / segments)
      const baseY = height * 0.5
      const variance = height * 0.3
      // Use seed to create deterministic but varied paths
      const offset = Math.sin((seed + i) * 1.5) * variance
      points.push({ x, y: baseY + offset })
    }

    // Build smooth curve path
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const cpx = (prev.x + curr.x) / 2
      d += ` Q ${prev.x + (curr.x - prev.x) * 0.5} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`
    }
    d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`

    return { d, start: points[0], end: points[points.length - 1] }
  }

  // Show RouteDetailPage when a discovery route is selected (full screen replacement)
  if (selectedDiscoveryRoute) {
    return (
      <RouteDetailPage
        route={selectedDiscoveryRoute}
        onBack={() => setSelectedDiscoveryRoute(null)}
        onStartDrive={handleStartDiscoveryDrive}
      />
    )
  }

  return (
    <div className="ns-container">
      {/* Atmospheric backgrounds now in RouteSelector app shell */}

      {/* Main content */}
      <div className="ns-content">
        {/* Top Bar */}
        <div className="ns-topbar ns-d1">
          <div className="ns-topbar-left">
            <div className="ns-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div className="ns-brand">
              <span className="ns-brand-name">Tramo</span>
              <div className="ns-location">
                <div className={`ns-gps-dot ${!hasLocation ? 'acquiring' : ''}`} />
                <span>{hasLocation ? 'Boston, MA' : 'Acquiring GPS...'}</span>
              </div>
            </div>
          </div>
          <div className="ns-topbar-right">
            {/* Settings moved to bottom nav tab */}
          </div>
        </div>

        {/* Greeting */}
        <div className="ns-greeting ns-d2">
          <h1 className="ns-greeting-text">
            Hey, <strong>{displayName}</strong>
          </h1>
          <div className="ns-weather">
            <svg className="ns-weather-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            <span>28°F · Clear skies · Perfect driving conditions</span>
          </div>
        </div>

        {/* Voice Ready Indicator */}
        <div className="ns-voice-ready ns-d3">
          <div className="ns-voice-bars">
            <div className="ns-voice-bar" />
            <div className="ns-voice-bar" />
            <div className="ns-voice-bar" />
            <div className="ns-voice-bar" />
            <div className="ns-voice-bar" />
          </div>
          <span className="ns-voice-text">Voice Guide Ready</span>
        </div>

        {/* Hero Stage Card - Show full card only when user has recent routes */}
        {recentRoutes?.length > 0 && heroRoute ? (
          <div className="ns-hero ns-d4">
            <div className="ns-hero-badges">
              <div className="ns-badge ns-badge-recommended">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Last Drive
              </div>
              <div className={`ns-badge ns-badge-difficulty ${getDifficulty(heroRoute)}`}>
                {getDifficulty(heroRoute).toUpperCase()}
              </div>
            </div>

            {/* Route Visualization */}
            <div className="ns-route-viz">
              <svg className="ns-route-svg" viewBox="0 0 300 120" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="ns-route-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#E8622C" />
                    <stop offset="100%" stopColor="#888888" />
                  </linearGradient>
                </defs>
                {(() => {
                  const { d, start, end } = generateRoutePath(heroRoute.id?.charCodeAt(0) || 0)
                  return (
                    <>
                      <path className="ns-route-path-bg" d={d} />
                      <path className="ns-route-path" d={d} />
                      <circle className="ns-origin-pulse" cx={start.x} cy={start.y} />
                      <circle className="ns-origin-dot" cx={start.x} cy={start.y} />
                      <circle className="ns-dest-pulse" cx={end.x} cy={end.y} />
                      <circle className="ns-dest-dot" cx={end.x} cy={end.y} />
                    </>
                  )
                })()}
              </svg>
            </div>

            {/* Route Info */}
            <div className="ns-route-info">
              <h2 className="ns-route-name">
                {heroRoute.name || heroRoute.destination || 'Unknown Route'}
              </h2>
              <div className="ns-route-endpoints">
                <span>{heroRoute.start?.label || heroRoute.origin || 'Start'}</span>
                <span className="ns-route-arrow">→</span>
                <span>{heroRoute.end?.label || heroRoute.destination || 'End'}</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="ns-stats-grid">
              <div className="ns-stat">
                <div className="ns-stat-value">
                  {(() => {
                    if (!heroRoute.distance) return '--'
                    // Recent routes have distance in meters
                    const miles = heroRoute.distance > 500
                      ? Math.round(heroRoute.distance / 1609.34)
                      : heroRoute.distance
                    return miles
                  })()}
                </div>
                <div className="ns-stat-label">Miles</div>
              </div>
              <div className="ns-stat">
                <div className="ns-stat-value">
                  {(() => {
                    if (!heroRoute.duration) return '--'
                    // Recent routes have duration in seconds
                    const mins = heroRoute.duration > 500
                      ? Math.round(heroRoute.duration / 60)
                      : heroRoute.duration
                    return mins
                  })()}
                </div>
                <div className="ns-stat-label">Minutes</div>
              </div>
              <div className="ns-stat">
                <div className="ns-stat-value accent">
                  {heroRoute.curveCount || heroRoute.curves || '--'}
                </div>
                <div className="ns-stat-label">Curves</div>
              </div>
              <div className="ns-stat">
                <div className="ns-stat-value">
                  {recentRoutes?.filter(r => r.id === heroRoute.id).length || 1}
                </div>
                <div className="ns-stat-label">Drives</div>
              </div>
            </div>

            {/* CTA Button */}
            <button
              className="ns-cta"
              onClick={handleStartDrive}
              disabled={!hasLocation || isLoading}
            >
              <span className="ns-cta-shimmer" />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
              </svg>
              Start Drive
            </button>
          </div>
        ) : (
          /* Simple CTA card when no recent routes */
          <div className="ns-hero ns-hero-simple ns-d4">
            <div className="ns-hero-simple-content">
              <h2 className="ns-hero-simple-title">Where to?</h2>
              <p className="ns-hero-simple-subtitle">Search for a destination or explore curated routes below</p>
            </div>
            <button
              className="ns-cta ns-cta-large"
              onClick={handleStartDrive}
              disabled={!hasLocation || isLoading}
            >
              <span className="ns-cta-shimmer" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Set Destination
            </button>
          </div>
        )}

        {/* Free Drive CTA */}
        <div className="ns-d5" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '0 20px',
          marginTop: '-4px',
          marginBottom: '8px',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px', fontFamily: "'Sora', sans-serif" }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
        </div>
        <div className="ns-d5" style={{ padding: '0 20px', marginBottom: '16px' }}>
          <button
            onClick={onStartFreeDrive}
            disabled={!hasLocation || isLoading}
            style={{
              width: '100%',
              padding: '14px 20px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              color: '#ccc',
              fontSize: '14px',
              fontFamily: "'Sora', sans-serif",
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: (!hasLocation || isLoading) ? 0.4 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8622C" strokeWidth="2">
              <path d="M12 2L12 22M2 12L22 12" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="#E8622C" stroke="none" />
            </svg>
            Free Drive
            <span style={{ fontSize: '11px', color: '#666', fontWeight: 400, marginLeft: '4px' }}>
              No destination needed
            </span>
          </button>
        </div>

        {/* Your Driving Section - only show if user has driven */}
        {recentRoutes?.length > 0 && (
          <div className="ns-section ns-d5">
            <div className="ns-section-header">
              <h3 className="ns-section-title">Your Driving</h3>
              <button className="ns-section-link" onClick={() => onTabChange('profile')}>
                Details
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="ns-lifetime-stats">
              <div className="ns-lifetime-stat">
                <div className="ns-lifetime-value orange">{lifetimeStats.drives}</div>
                <div className="ns-lifetime-label">Drives</div>
              </div>
              <div className="ns-lifetime-stat">
                <div className="ns-lifetime-value white">{Math.round(lifetimeStats.miles)}</div>
                <div className="ns-lifetime-label">Miles</div>
              </div>
              <div className="ns-lifetime-stat">
                <div className="ns-lifetime-value blue">{lifetimeStats.curves}</div>
                <div className="ns-lifetime-label">Curves</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Drives Section */}
        {recentRoutes?.length > 0 && (
          <div className="ns-section ns-d6">
            <div className="ns-section-header">
              <h3 className="ns-section-title">Recent Drives</h3>
              <button className="ns-section-link" onClick={() => setShowRecentList(true)}>
                All
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="ns-recent-scroll">
              {recentRoutes.slice(0, 6).map((route, idx) => {
                const difficulty = getDifficulty(route)
                const { d, start, end } = generateRoutePath(idx + 10, 150, 60)
                return (
                  <div
                    key={route.id || idx}
                    className="ns-recent-card"
                    onClick={() => onSelectSavedRoute(route)}
                  >
                    <div className={`ns-recent-accent ${difficulty}`} />
                    <div className="ns-recent-viz">
                      <svg className="ns-recent-svg" viewBox="0 0 150 60" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id={`ns-recent-grad-${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#E8622C" />
                            <stop offset="100%" stopColor="#888888" />
                          </linearGradient>
                        </defs>
                        <path
                          className="ns-recent-path"
                          d={d}
                          stroke={`url(#ns-recent-grad-${idx})`}
                        />
                        <circle cx={start.x} cy={start.y} r="4" fill="#E8622C" />
                        <circle cx={end.x} cy={end.y} r="4" fill="#888888" />
                      </svg>
                    </div>
                    <div className="ns-recent-content">
                      <div className="ns-recent-name">
                        {route.name || route.destination || 'Unknown'}
                      </div>
                      <div className="ns-recent-endpoints">
                        <span>{route.origin || 'Start'}</span>
                        <span>→</span>
                        <span>{route.destination || 'End'}</span>
                      </div>
                      <div className="ns-recent-meta">
                        <span>{formatDist(route.distance)}</span>
                        <span className="ns-recent-meta-sep">·</span>
                        <span>{formatDuration(route.duration)}</span>
                        <span className="ns-recent-time">{timeAgo(route.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Saved Routes Section */}
        {favoriteRoutes?.length > 0 && (
          <div className="ns-section ns-d6">
            <div className="ns-section-header">
              <h3 className="ns-section-title">Saved Routes</h3>
              <button className="ns-section-link" onClick={() => setShowFavoritesList(true)}>
                All
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="ns-saved-list">
              {favoriteRoutes.slice(0, 3).map((route, idx) => {
                // Look up full route data from discovery routes for accurate display
                const fullRoute = DISCOVERY_ROUTES.find(r =>
                  r.id === route.slug || r.id === route.discoveryId || r.name === route.name
                ) || route
                const difficulty = getDifficulty(fullRoute)
                const displayDistance = fullRoute.distance || route.distance
                const displayDuration = fullRoute.duration || route.duration
                return (
                  <div
                    key={route.id || idx}
                    className="ns-nearby-card"
                    onClick={() => handleSavedRouteClick(route)}
                  >
                    <div className={`ns-nearby-accent ${difficulty}`} />
                    <div className="ns-nearby-icon ns-saved-icon">
                      <svg viewBox="0 0 24 24" fill="#E8622C" stroke="#E8622C" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </div>
                    <div className="ns-nearby-info">
                      <div className="ns-nearby-name">{fullRoute.name || route.destination || 'Saved Route'}</div>
                      <div className="ns-nearby-endpoints">
                        <span>{route.origin || fullRoute.start?.label || 'Start'}</span>
                        <span>→</span>
                        <span>{route.destination || fullRoute.end?.label || 'End'}</span>
                      </div>
                      <div className="ns-nearby-meta">
                        <span>{typeof displayDistance === 'number' && displayDistance < 500 ? `${displayDistance} mi` : formatDist(displayDistance)}</span>
                        <span>·</span>
                        <span>{formatDurationSmart(displayDuration) || '--'}</span>
                      </div>
                    </div>
                    <div className="ns-nearby-chevron">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Routes Near You Section */}
        {nearbyRoutes.length > 0 && (
          <div className="ns-section ns-d7">
            <div className="ns-section-header">
              <h3 className="ns-section-title">Routes Near You</h3>
              <button className="ns-section-link" onClick={() => onTabChange('discover')}>
                Discover
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="ns-nearby-list">
              {nearbyRoutes.map((route, idx) => {
                const difficulty = getDifficulty(route)
                return (
                  <div
                    key={route.id || idx}
                    className="ns-nearby-card"
                    onClick={() => handleOpenRoutePreview(route)}
                  >
                    <div className={`ns-nearby-accent ${difficulty}`} />
                    <div className="ns-nearby-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2L4 7l8 5 8-5-8-5z" />
                        <path d="M4 12l8 5 8-5" />
                        <path d="M4 17l8 5 8-5" />
                      </svg>
                    </div>
                    <div className="ns-nearby-info">
                      <div className="ns-nearby-name">{route.name}</div>
                      <div className="ns-nearby-endpoints">
                        <span>{route.start?.label || 'Start'}</span>
                        <span>→</span>
                        <span>{route.end?.label || 'End'}</span>
                      </div>
                      <div className="ns-nearby-meta">
                        <span>{route.distance} mi</span>
                        <span>·</span>
                        <span>{route.duration} min</span>
                      </div>
                    </div>
                    <div className="ns-nearby-chevron">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="ns-error">
          <span className="ns-error-text">{error}</span>
          <button className="ns-error-close" onClick={onClearError}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Search Modal */}
      {showDestination && (
        <SearchModal
          destination={destination}
          setDestination={setDestination}
          searchResults={searchResults}
          isSearching={isSearching}
          isLoading={isLoading}
          onSelect={handleSelectDestination}
          onClose={() => {
            setShowDestination(false)
            setDestination('')
            setSearchResults([])
          }}
        />
      )}

      {/* Recent Routes List Modal */}
      {showRecentList && (
        <RouteListModal
          title="Recent Drives"
          routes={recentRoutes}
          onSelect={onSelectSavedRoute}
          onRemove={onRemoveRecent}
          onClearAll={onClearRecentRoutes}
          onClose={() => setShowRecentList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          formatDurationSmart={formatDurationSmart}
          accentColor="#E8622C"
        />
      )}

      {/* Favorites List Modal */}
      {showFavoritesList && (
        <RouteListModal
          title="Favorites"
          routes={favoriteRoutes}
          onSelect={handleSavedRouteClick}
          onRemove={onRemoveFavorite}
          onClose={() => setShowFavoritesList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          formatDurationSmart={formatDurationSmart}
          accentColor="#E8622C"
          isFavorites
        />
      )}
    </div>
  )
}


// ================================
// Search Modal Component
// ================================
function SearchModal({
  destination,
  setDestination,
  searchResults,
  isSearching,
  isLoading,
  onSelect,
  onClose,
}) {
  return (
    <>
      <div className="ns-modal-overlay" onClick={onClose} />
      <div className="ns-modal">
        <div className="ns-modal-header">
          <button className="ns-modal-back" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
          </button>
          <h2 className="ns-modal-title">Set Destination</h2>
        </div>

        <div className="ns-search-input-wrap">
          <svg className="ns-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="ns-search-input"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Search for a place..."
            autoFocus
          />
          {isSearching && <div className="ns-search-spinner" />}
        </div>

        <div className="ns-search-results">
          {searchResults.length > 0 ? (
            searchResults.map((result, i) => (
              <div
                key={i}
                className="ns-search-result"
                onClick={() => !isLoading && onSelect(result)}
                style={{ opacity: isLoading ? 0.5 : 1 }}
              >
                <div className="ns-search-result-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="10" r="3" />
                    <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z" />
                  </svg>
                </div>
                <div className="ns-search-result-info">
                  <div className="ns-search-result-name">{result.name}</div>
                  {result.address && (
                    <div className="ns-search-result-address">{result.address}</div>
                  )}
                </div>
              </div>
            ))
          ) : destination.length >= 3 && !isSearching ? (
            <div className="ns-search-empty">No results found</div>
          ) : (
            <div className="ns-search-empty">Start typing to search</div>
          )}
        </div>
      </div>
    </>
  )
}


// ================================
// Route List Modal Component
// ================================
function RouteListModal({
  title,
  routes,
  onSelect,
  onRemove,
  onClearAll,
  onClose,
  isLoading,
  formatDist,
  formatDurationSmart,
  accentColor,
  isFavorites,
}) {
  const timeAgo = (timestamp) => {
    if (!timestamp) return ''
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <>
      <div className="ns-modal-overlay" onClick={onClose} />
      <div className="ns-modal">
        <div className="ns-modal-header">
          <button className="ns-modal-back" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7" />
            </svg>
          </button>
          <h2 className="ns-modal-title">{title}</h2>
          {onClearAll && routes?.length >= 5 && (
            <button className="ns-clear-all" onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>

        <div className="ns-search-results">
          {routes?.map((route) => (
            <div key={route.id} className="ns-list-item">
              <button
                className="ns-list-item-btn"
                onClick={() => !isLoading && onSelect(route)}
                disabled={isLoading}
              >
                <div
                  className="ns-list-icon"
                  style={{ background: `${accentColor}15` }}
                >
                  {isFavorites ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={accentColor} stroke={accentColor} strokeWidth="2">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2">
                      <circle cx="12" cy="10" r="3" />
                      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z" />
                    </svg>
                  )}
                </div>
                <div className="ns-list-info">
                  <div className="ns-list-name">
                    {route.name || route.destination || 'Unknown'}
                  </div>
                  <div className="ns-list-meta">
                    <span>{typeof route.distance === 'number' && route.distance < 500 ? `${route.distance} mi` : formatDist(route.distance)}</span>
                    <span>·</span>
                    <span>{formatDurationSmart(route.duration) || '--'}</span>
                    {route.timestamp && !isFavorites && (
                      <>
                        <span>·</span>
                        <span>{timeAgo(route.timestamp)}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              <button
                className="ns-list-remove"
                onClick={() => onRemove(route.id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
