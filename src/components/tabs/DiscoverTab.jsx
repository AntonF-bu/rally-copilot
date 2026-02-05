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
    <div className="flex flex-col min-h-full" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-xl font-bold text-white">Discover</h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Browse curated routes near you
        </p>
      </div>

      {/* Search Bar */}
      <div className="px-4 pb-3 flex-shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Search icon */}
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
            className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none"
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

      {/* Filter Chips */}
      <div className="px-4 pb-3 flex-shrink-0">
        {/* Vibes */}
        <div className="mb-2.5">
          <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            What are you looking for?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VIBE_FILTERS.map((filter) => {
              const isSelected = selectedVibes.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleVibeToggle(filter.id)}
                  className="px-2.5 py-1 rounded-full text-xs transition-all"
                  style={{
                    background: isSelected
                      ? 'rgba(0, 212, 255, 0.25)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isSelected
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    color: isSelected
                      ? '#00d4ff'
                      : 'rgba(255, 255, 255, 0.6)',
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
          <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Where?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REGION_FILTERS.map((filter) => {
              const isSelected = selectedRegions.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  onClick={() => handleRegionToggle(filter.id)}
                  className="px-2.5 py-1 rounded-full text-xs transition-all"
                  style={{
                    background: isSelected
                      ? 'rgba(0, 212, 255, 0.25)'
                      : 'rgba(255, 255, 255, 0.05)',
                    border: isSelected
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    color: isSelected
                      ? '#00d4ff'
                      : 'rgba(255, 255, 255, 0.6)',
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
      <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {filteredRoutes.length} route{filteredRoutes.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' found'}
        </p>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-medium"
            style={{ color: '#00d4ff' }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Route Grid */}
      <div className="px-4 pb-4 flex-1">
        {filteredRoutes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
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
                style={{ color: '#00d4ff' }}
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
