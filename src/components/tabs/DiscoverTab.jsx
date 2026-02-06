// Discover Tab - Night Stage Design
// Browse and save curated routes with premium dark aesthetic

import { useState, useMemo, useEffect, useCallback } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES, VIBE_FILTERS, REGION_FILTERS } from '../../data/discoveryRoutes'
import { fetchPublishedRoutes } from '../../services/supabaseRouteService'
import { DiscoverGridCard } from '../discover/DiscoverGridCard'
import { colors, fonts, transitions } from '../../styles/theme'

export function DiscoverTab({ onStartRoute, onTabChange }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVibes, setSelectedVibes] = useState([])
  const [selectedRegions, setSelectedRegions] = useState([])

  // Supabase route fetching state
  const [routes, setRoutes] = useState(DISCOVERY_ROUTES) // Start with fallback
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Get favorites from store
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []

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

  const handleSelectRoute = (route) => {
    if (onStartRoute) {
      onStartRoute(route)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedVibes([])
    setSelectedRegions([])
  }

  const hasActiveFilters = searchQuery || selectedVibes.length > 0 || selectedRegions.length > 0

  return (
    <div style={{ minHeight: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 16px', paddingTop: 'calc(env(safe-area-inset-top, 20px) + 8px)' }}>
        <h1 style={{
          fontFamily: fonts.primary,
          fontSize: '28px',
          fontWeight: 600,
          color: colors.textPrimary,
          margin: 0,
          marginBottom: '4px',
        }}>
          Discover
        </h1>
        <p style={{
          fontFamily: fonts.primary,
          fontSize: '13px',
          color: colors.textDim || 'rgba(255,255,255,0.5)',
          margin: 0,
        }}>
          Browse curated routes near you
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '0 16px 12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.4)"
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
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: fonts.primary,
              fontSize: '14px',
              color: colors.textPrimary,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips */}
      <div style={{ padding: '0 16px 16px' }}>
        {/* Vibes */}
        <div style={{ marginBottom: '12px' }}>
          <p style={{
            fontFamily: fonts.mono,
            fontSize: '9px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '8px',
          }}>
            Vibes
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {VIBE_FILTERS.map((filter) => {
              const isSelected = selectedVibes.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleVibeToggle(filter.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: 'none',
                    fontFamily: fonts.mono,
                    fontSize: '10px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: transitions.snappy,
                    background: isSelected ? colors.accent : 'rgba(255,255,255,0.05)',
                    color: isSelected ? '#111114' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Regions */}
        <div>
          <p style={{
            fontFamily: fonts.mono,
            fontSize: '9px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '8px',
          }}>
            Region
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {REGION_FILTERS.map((filter) => {
              const isSelected = selectedRegions.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleRegionToggle(filter.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: 'none',
                    fontFamily: fonts.mono,
                    fontSize: '10px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: transitions.snappy,
                    background: isSelected ? colors.accent : 'rgba(255,255,255,0.05)',
                    color: isSelected ? '#111114' : 'rgba(255,255,255,0.6)',
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
      <div style={{
        padding: '0 16px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <p style={{
          fontFamily: fonts.mono,
          fontSize: '10px',
          color: 'rgba(255,255,255,0.4)',
          margin: 0,
        }}>
          {filteredRoutes.length} route{filteredRoutes.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' found'}
        </p>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: fonts.mono,
              fontSize: '10px',
              fontWeight: 500,
              color: colors.accent,
              cursor: 'pointer',
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Route Grid */}
      <div style={{ padding: '0 16px 100px' }}>
        {/* Loading State */}
        {isLoading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
            {/* Skeleton cards */}
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '4/3',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            textAlign: 'center',
          }}>
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
            <p style={{
              fontFamily: fonts.primary,
              fontSize: '14px',
              color: 'rgba(255,255,255,0.5)',
              margin: 0,
              marginBottom: '4px',
            }}>
              Couldn't load routes from server
            </p>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
              margin: 0,
              marginBottom: '16px',
            }}>
              Showing cached routes
            </p>
            <button
              onClick={loadRoutes}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: colors.accent,
                color: '#111114',
                fontFamily: fonts.mono,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : filteredRoutes.length > 0 ? (
          /* Route Cards */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
          }}>
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
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            textAlign: 'center',
          }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.5"
              style={{ marginBottom: '12px' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p style={{
              fontFamily: fonts.primary,
              fontSize: '14px',
              color: 'rgba(255,255,255,0.5)',
              margin: 0,
            }}>
              {routes.length === 0
                ? 'Routes coming soon to this area'
                : 'No routes match your search'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  marginTop: '12px',
                  background: 'none',
                  border: 'none',
                  fontFamily: fonts.mono,
                  fontSize: '11px',
                  fontWeight: 500,
                  color: colors.accent,
                  cursor: 'pointer',
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
