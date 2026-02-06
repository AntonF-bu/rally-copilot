// Discover Tab - Tramo Brand Identity
// Browse and save curated routes with proper navigation flow

import { useState, useMemo, useEffect, useCallback } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES, VIBE_FILTERS, REGION_FILTERS } from '../../data/discoveryRoutes'
import { fetchPublishedRoutes } from '../../services/supabaseRouteService'
import { DiscoverGridCard } from '../discover/DiscoverGridCard'
import { RouteDetailPage } from '../discover/RouteDetailPage'

export function DiscoverTab({ onStartRoute, onTabChange }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVibes, setSelectedVibes] = useState([])
  const [selectedRegions, setSelectedRegions] = useState([])

  // Route detail page state
  const [selectedRoute, setSelectedRoute] = useState(null)

  // Supabase route fetching state
  const [routes, setRoutes] = useState(DISCOVERY_ROUTES) // Start with fallback
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Get favorites from store
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []

  // Store actions for starting drive
  const initRouteFromCoordinates = useStore((state) => state.initRouteFromCoordinates)
  const setCurrentRoute = useStore((state) => state.setCurrentRoute)
  const setActiveRoute = useStore((state) => state.setActiveRoute)

  // Fetch routes from Supabase on mount
  const loadRoutes = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)

    try {
      console.log('🗄️ DiscoverTab: Fetching routes from Supabase...')
      const supabaseRoutes = await fetchPublishedRoutes()

      if (supabaseRoutes && supabaseRoutes.length > 0) {
        console.log(`🗄️ DiscoverTab: Loaded ${supabaseRoutes.length} routes from Supabase`)
        setRoutes(supabaseRoutes)
      } else {
        console.log('🗄️ DiscoverTab: No routes in Supabase, using fallback')
        setRoutes(DISCOVERY_ROUTES)
      }
    } catch (error) {
      console.error('🗄️ DiscoverTab: Failed to fetch routes, using fallback:', error)
      setFetchError(error.message || 'Failed to load routes')
      // Use fallback data so app doesn't break
      setRoutes(DISCOVERY_ROUTES)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRoutes()
  }, [loadRoutes])

  const handleVibeToggle = (vibeId) => {
    setSelectedVibes((prev) =>
      prev.includes(vibeId)
        ? prev.filter((v) => v !== vibeId)
        : [...prev, vibeId]
    )
  }

  const handleRegionToggle = (regionId) => {
    setSelectedRegions((prev) =>
      prev.includes(regionId)
        ? prev.filter((r) => r !== regionId)
        : [...prev, regionId]
    )
  }

  // Filter routes based on search, vibes, and regions
  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase().trim()
      const searchMatch =
        !searchLower ||
        route.name.toLowerCase().includes(searchLower) ||
        route.description?.toLowerCase().includes(searchLower) ||
        route.tags.some((tag) => tag.toLowerCase().includes(searchLower)) ||
        route.start.label.toLowerCase().includes(searchLower) ||
        route.end.label.toLowerCase().includes(searchLower)

      // Vibe filter
      const vibeMatch =
        selectedVibes.length === 0 ||
        selectedVibes.some((vibe) => route.tags.includes(vibe))

      // Region filter
      const regionMatch =
        selectedRegions.length === 0 ||
        selectedRegions.includes(route.region)

      return searchMatch && vibeMatch && regionMatch
    })
  }, [routes, searchQuery, selectedVibes, selectedRegions])

  const isRouteSaved = (routeId) => {
    return favoriteRoutes.some((fav) => fav.discoveryId === routeId || fav.id === routeId)
  }

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
    console.log('🗄️ DiscoverTab: Starting drive with route:', routeObject.name)

    // If we have route geometry, initialize directly
    if (routeObject.geometry) {
      // Set the route in store
      setCurrentRoute(routeObject)
      setActiveRoute(routeObject)

      // Switch to Home tab (drive mode)
      if (onTabChange) {
        onTabChange('home')
      }
    } else if (onStartRoute) {
      // Fallback to the original handler
      onStartRoute(routeObject)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedVibes([])
    setSelectedRegions([])
  }

  const hasActiveFilters = searchQuery || selectedVibes.length > 0 || selectedRegions.length > 0

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
        <p style={styles.subtitle}>Browse curated routes near you</p>
      </div>

      {/* Search Bar */}
      <div style={styles.searchSection}>
        <div style={styles.searchBar}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#666666"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search routes, roads, or areas..."
            style={styles.searchInput}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={styles.clearSearchButton}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div style={styles.filtersSection}>
        {/* Vibes */}
        <div style={styles.filterGroup}>
          <p style={styles.filterLabel}>Vibes</p>
          <div style={styles.chipContainer}>
            {VIBE_FILTERS.map((filter) => {
              const isSelected = selectedVibes.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleVibeToggle(filter.id)}
                  style={{
                    ...styles.chip,
                    background: isSelected ? '#E8622C' : '#1A1A1A',
                    color: isSelected ? '#FFFFFF' : '#888888',
                  }}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Regions */}
        <div style={styles.filterGroup}>
          <p style={styles.filterLabel}>Region</p>
          <div style={styles.chipContainer}>
            {REGION_FILTERS.map((filter) => {
              const isSelected = selectedRegions.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleRegionToggle(filter.id)}
                  style={{
                    ...styles.chip,
                    background: isSelected ? '#E8622C' : '#1A1A1A',
                    color: isSelected ? '#FFFFFF' : '#888888',
                  }}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Results count + Clear filters */}
      <div style={styles.resultsRow}>
        <p style={styles.resultsCount}>
          {filteredRoutes.length} route{filteredRoutes.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' found'}
        </p>
        {hasActiveFilters && (
          <button onClick={clearFilters} style={styles.clearFiltersButton}>
            Clear all
          </button>
        )}
      </div>

      {/* Route Grid */}
      <div style={styles.gridContainer}>
        {/* Loading State */}
        {isLoading ? (
          <div style={styles.grid}>
            {/* Skeleton cards */}
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} style={styles.skeletonCard} />
            ))}
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
              }
            `}</style>
          </div>
        ) : fetchError ? (
          /* Error State with Retry */
          <div style={styles.emptyState}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,100,100,0.5)"
              strokeWidth="1.5"
              style={{ marginBottom: '12px' }}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <p style={styles.emptyTitle}>Couldn't load routes from server</p>
            <p style={styles.emptySubtitle}>Showing cached routes</p>
            <button onClick={loadRoutes} style={styles.retryButton}>
              Retry
            </button>
          </div>
        ) : filteredRoutes.length > 0 ? (
          /* Route Cards */
          <div style={styles.grid}>
            {filteredRoutes.map((route) => (
              <DiscoverGridCard
                key={route.id}
                route={route}
                isSaved={isRouteSaved(route.id)}
                onSelect={handleSelectRoute}
              />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div style={styles.emptyState}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#333333"
              strokeWidth="1.5"
              style={{ marginBottom: '12px' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p style={styles.emptyTitle}>
              {routes.length === 0
                ? 'Routes coming soon to this area'
                : 'No routes match your search'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={styles.clearFiltersButton}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100%',
    position: 'relative',
    background: '#0A0A0A',
  },
  header: {
    padding: '16px 16px 16px',
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
    color: '#666666',
    margin: 0,
  },
  searchSection: {
    padding: '0 16px 12px',
  },
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: '#111111',
    borderRadius: '12px',
    border: '1px solid #1A1A1A',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#FFFFFF',
  },
  clearSearchButton: {
    background: 'none',
    border: 'none',
    padding: '4px',
    cursor: 'pointer',
    color: '#666666',
  },
  filtersSection: {
    padding: '0 16px 16px',
  },
  filterGroup: {
    marginBottom: '12px',
  },
  filterLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: '#666666',
    marginBottom: '8px',
    margin: 0,
    marginBottom: '8px',
  },
  chipContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: {
    padding: '6px 12px',
    borderRadius: '20px',
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  resultsRow: {
    padding: '0 16px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultsCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
    margin: 0,
  },
  clearFiltersButton: {
    background: 'none',
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    color: '#E8622C',
    cursor: 'pointer',
  },
  gridContainer: {
    padding: '0 16px 100px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  skeletonCard: {
    aspectRatio: '4/3',
    borderRadius: '12px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 0',
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#888888',
    margin: 0,
  },
  emptySubtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
    margin: 0,
    marginBottom: '16px',
  },
  retryButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#FFFFFF',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
