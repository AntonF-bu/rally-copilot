// Discover Tab - Browse and save curated routes
// Filter by vibe and region, save to favorites

import { useState, useMemo } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES, VIBE_FILTERS, REGION_FILTERS } from '../../data/discoveryRoutes'
import { DiscoverFilters } from '../discover/DiscoverFilters'
import { DiscoverRouteCard } from '../discover/DiscoverRouteCard'
import { RouteDetailView } from '../discover/RouteDetailView'

export function DiscoverTab() {
  const [selectedVibes, setSelectedVibes] = useState([])
  const [selectedRegions, setSelectedRegions] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)

  // Get favorites from store (for showing saved indicator on cards)
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

  // Filter routes based on selections
  const filteredRoutes = useMemo(() => {
    return DISCOVERY_ROUTES.filter((route) => {
      // If no vibes selected, show all. Otherwise filter.
      const vibeMatch =
        selectedVibes.length === 0 ||
        selectedVibes.some((vibe) => route.tags.includes(vibe))

      // If no regions selected, show all. Otherwise filter.
      const regionMatch =
        selectedRegions.length === 0 ||
        selectedRegions.includes(route.region)

      return vibeMatch && regionMatch
    })
  }, [selectedVibes, selectedRegions])

  // Check if a route is saved by matching on the discovery route ID
  const isRouteSaved = (routeId) => {
    return favoriteRoutes.some((fav) => fav.discoveryId === routeId || fav.id === routeId)
  }

  const handleSelectRoute = (route) => {
    setSelectedRoute(route)
  }

  const clearFilters = () => {
    setSelectedVibes([])
    setSelectedRegions([])
  }

  const hasActiveFilters = selectedVibes.length > 0 || selectedRegions.length > 0

  return (
    <div className="flex flex-col" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white">Discover</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Browse curated routes near you
        </p>
      </div>

      {/* Filters */}
      <DiscoverFilters
        vibeFilters={VIBE_FILTERS}
        regionFilters={REGION_FILTERS}
        selectedVibes={selectedVibes}
        selectedRegions={selectedRegions}
        onVibeToggle={handleVibeToggle}
        onRegionToggle={handleRegionToggle}
      />

      {/* Results count */}
      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {filteredRoutes.length} route{filteredRoutes.length !== 1 ? 's' : ''}
          {hasActiveFilters && ' matching'}
        </p>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm"
            style={{ color: '#00d4ff' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Routes List */}
      <div className="px-4 py-2">
        {filteredRoutes.length > 0 ? (
          <div className="flex flex-col gap-4">
            {filteredRoutes.map((route) => (
              <DiscoverRouteCard
                key={route.id}
                route={route}
                isSaved={isRouteSaved(route.id)}
                onSelect={handleSelectRoute}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {/* Compass icon */}
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.5"
              className="mb-3"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <p style={{ color: 'rgba(255,255,255,0.4)' }}>
              No routes match your filters
            </p>
            <button
              onClick={clearFilters}
              className="mt-3 text-sm"
              style={{ color: '#00d4ff' }}
            >
              Clear filters
            </button>
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
