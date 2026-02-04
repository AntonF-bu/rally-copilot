// Discover Tab - Browse and save curated routes
// Filter by vibe and region, save to favorites

import { useState, useMemo } from 'react'
import useStore from '../../store'
import { DISCOVERY_ROUTES, VIBE_FILTERS, REGION_FILTERS } from '../../data/discoveryRoutes'
import { DiscoverFilters } from '../discover/DiscoverFilters'
import { DiscoverRouteCard } from '../discover/DiscoverRouteCard'

export function DiscoverTab() {
  const [selectedVibes, setSelectedVibes] = useState([])
  const [selectedRegions, setSelectedRegions] = useState([])
  const [savingRouteId, setSavingRouteId] = useState(null)

  // Get favorites from store
  const favoriteRoutes = useStore((state) => state.favoriteRoutes) || []
  const addFavoriteRoute = useStore((state) => state.addFavoriteRoute)
  const removeFavoriteRoute = useStore((state) => state.removeFavoriteRoute)

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

  const handleSaveRoute = async (route) => {
    if (isRouteSaved(route.id)) {
      // Find and remove from favorites
      const existing = favoriteRoutes.find(
        (fav) => fav.discoveryId === route.id || fav.id === route.id
      )
      if (existing) {
        removeFavoriteRoute(existing.id)
      }
    } else {
      // Show saving indicator
      setSavingRouteId(route.id)

      // Fetch route geometry from Mapbox if not already present
      let geometry = route.geometry
      let fetchedDistance = null
      let fetchedDuration = null

      if (!geometry) {
        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
        if (mapboxToken) {
          try {
            // Build coordinates: start -> waypoints -> end
            const coords = [
              `${route.start.lng},${route.start.lat}`,
              ...(route.waypoints || []).map(wp => `${wp.lng},${wp.lat}`),
              `${route.end.lng},${route.end.lat}`,
            ].join(';')

            const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxToken}`
            const response = await fetch(url)
            const data = await response.json()

            if (data.routes?.[0]) {
              geometry = data.routes[0].geometry
              fetchedDistance = data.routes[0].distance // in meters
              fetchedDuration = data.routes[0].duration // in seconds
            }
          } catch (err) {
            console.error('Failed to fetch route geometry:', err)
          }
        }
      }

      // Add to favorites with geometry
      const favoriteRoute = {
        name: route.name,
        destination: route.end.label,
        origin: route.start.label,
        distance: fetchedDistance || route.distance * 1609.34,
        duration: fetchedDuration || route.duration * 60,
        discoveryId: route.id,
        isDiscoveryRoute: true,
        // Store route geometry for consistent routing
        geometry: geometry,
        // Store coordinates for re-routing
        startCoords: [route.start.lng, route.start.lat],
        endCoords: [route.end.lng, route.end.lat],
        waypoints: route.waypoints || [],
        // Store original route data
        discoveryData: route,
      }
      addFavoriteRoute(favoriteRoute)
      setSavingRouteId(null)
    }
  }

  const handleSelectRoute = (route) => {
    // TODO: Navigate to route preview with this route
    console.log('Selected route:', route)
  }

  const clearFilters = () => {
    setSelectedVibes([])
    setSelectedRegions([])
  }

  const hasActiveFilters = selectedVibes.length > 0 || selectedRegions.length > 0

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
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
                isSaving={savingRouteId === route.id}
                onSave={handleSaveRoute}
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
    </div>
  )
}
