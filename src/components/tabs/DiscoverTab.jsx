// Discover Tab - Browse and save curated routes
// Grid layout with search and filters

import { useState, useMemo } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES, VIBE_FILTERS, REGION_FILTERS } from '../../data/discoveryRoutes'
import { DiscoverGridCard } from '../discover/DiscoverGridCard'
import { RouteDetailView } from '../discover/RouteDetailView'

export function DiscoverTab() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVibes, setSelectedVibes] = useState([])
  const [selectedRegions, setSelectedRegions] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)

  // Get favorites from store
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []

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
    return DISCOVERY_ROUTES.filter((route) => {
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
  }, [searchQuery, selectedVibes, selectedRegions])

  const isRouteSaved = (routeId) => {
    return favoriteRoutes.some((fav) => fav.discoveryId === routeId || fav.id === routeId)
  }

  const handleSelectRoute = (route) => {
    setSelectedRoute(route)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedVibes([])
    setSelectedRegions([])
  }

  const hasActiveFilters = searchQuery || selectedVibes.length > 0 || selectedRegions.length > 0

  return (
    <div className="flex flex-col min-h-full topo-bg">
      {/* Header */}
      <div className="px-3 pt-4 pb-2 flex-shrink-0">
        <h1
          className="text-white"
          style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
            fontSize: '28px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Discover
        </h1>
        <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Browse curated routes near you
        </p>
      </div>

      {/* Search Bar - compact height */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Search icon */}
          <svg
            width="16"
            height="16"
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
            className="flex-1 bg-transparent text-white text-xs placeholder-white/40 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-0.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips - compact */}
      <div className="px-3 pb-2 flex-shrink-0">
        {/* Vibes */}
        <div className="mb-2">
          <p
            className="mb-1"
            style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            Vibes
          </p>
          <div className="flex flex-wrap gap-1">
            {VIBE_FILTERS.map((filter) => {
              const isSelected = selectedVibes.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleVibeToggle(filter.id)}
                  className="px-2 py-0.5 rounded-full text-[11px] transition-all"
                  style={{
                    background: isSelected
                      ? 'rgba(255, 107, 53, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isSelected
                      ? '1px solid rgba(255, 107, 53, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected
                      ? '#FF6B35'
                      : 'rgba(255, 255, 255, 0.55)',
                    fontWeight: isSelected ? 500 : 400,
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
          <p
            className="mb-1"
            style={{
              fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            Region
          </p>
          <div className="flex flex-wrap gap-1">
            {REGION_FILTERS.map((filter) => {
              const isSelected = selectedRegions.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleRegionToggle(filter.id)}
                  className="px-2 py-0.5 rounded-full text-[11px] transition-all"
                  style={{
                    background: isSelected
                      ? 'rgba(255, 107, 53, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isSelected
                      ? '1px solid rgba(255, 107, 53, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected
                      ? '#FF6B35'
                      : 'rgba(255, 255, 255, 0.55)',
                    fontWeight: isSelected ? 500 : 400,
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
      <div className="px-3 pb-1.5 flex items-center justify-between flex-shrink-0">
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {filteredRoutes.length} route{filteredRoutes.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' found'}
        </p>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-[11px] font-medium"
            style={{ color: '#FF6B35' }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Route Grid - 2 columns, tight spacing */}
      <div className="px-3 pb-4 flex-1">
        {filteredRoutes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
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
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {/* Empty state icon */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="1.5"
              className="mb-2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {DISCOVERY_ROUTES.length === 0
                ? 'Routes coming soon to this area'
                : 'No routes match your search'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-xs font-medium"
                style={{ color: '#FF6B35' }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Route Detail View */}
      {selectedRoute && (
        <RouteDetailView
          route={selectedRoute}
          onClose={() => setSelectedRoute(null)}
        />
      )}
    </div>
  )
}
