import { useState, useEffect, useMemo } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { BottomNav } from './BottomNav'
import { HomeTab } from './tabs/HomeTab'
import { DiscoverTab } from './tabs/DiscoverTab'
import { ProfileTab } from './tabs/ProfileTab'
import SettingsPanel from './SettingsPanel'

// ================================
// Route Selection Screen - v7
// Tab-based navigation: Home, Discover, Profile
// Tramo Brand Design
// ================================

// Tramo brand colors and layout
const BG_DEEP = '#0A0A0A'
const layout = {
  maxWidth: '480px',
  contentPadding: '16px',
  navHeight: '70px',
}

// Atmospheric Background Component (shared across all tabs)
function AtmosphericBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {/* Warm glow - top right */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        top: '-200px',
        right: '-150px',
        background: 'radial-gradient(circle, rgba(255, 107, 53, 0.12) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }} />
      {/* Cool glow - bottom left */}
      <div style={{
        position: 'absolute',
        width: '500px',
        height: '500px',
        bottom: '20%',
        left: '-150px',
        background: 'radial-gradient(circle, rgba(0, 212, 255, 0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />
      {/* Topographic texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.025,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='600' height='600' viewBox='0 0 600 600' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1'%3E%3Cellipse cx='300' cy='300' rx='280' ry='200'/%3E%3Cellipse cx='300' cy='300' rx='240' ry='170'/%3E%3Cellipse cx='300' cy='300' rx='200' ry='140'/%3E%3Cellipse cx='300' cy='300' rx='160' ry='110'/%3E%3Cellipse cx='300' cy='300' rx='120' ry='80'/%3E%3Cellipse cx='300' cy='300' rx='80' ry='50'/%3E%3Cellipse cx='300' cy='300' rx='40' ry='25'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '600px 600px',
      }} />
      {/* Film grain noise */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.015,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />
    </div>
  )
}

export default function RouteSelector() {
  const {
    setRouteMode,
    setShowRouteSelector,
    setShowRoutePreview,
    toggleSettings,
    position,
    setPosition,
    clearRouteData,
    recentRoutes,
    favoriteRoutes,
    removeRecentRoute,
    removeFavoriteRoute,
    clearRecentRoutes,
  } = useStore()

  const { initDestinationRoute, initRouteFromCoordinates } = useRouteAnalysis()

  // Tab state
  const [activeTab, setActiveTab] = useState('home')

  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasLocation, setHasLocation] = useState(false)

  // Compute real logbook stats from recentRoutes
  const logbookStats = useMemo(() => {
    const totalMiles = recentRoutes?.reduce((acc, route) => {
      return acc + (route.distance ? route.distance / 1609.34 : 0)
    }, 0) || 0

    const totalCurves = recentRoutes?.reduce((acc, route) => {
      return acc + (route.curveCount || 0)
    }, 0) || 0

    const routeCount = recentRoutes?.length || 0

    // Calculate week stats (routes from last 7 days)
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const weekRoutes = recentRoutes?.filter(r => r.timestamp && r.timestamp > oneWeekAgo) || []
    const weekMiles = weekRoutes.reduce((acc, route) => {
      return acc + (route.distance ? route.distance / 1609.34 : 0)
    }, 0)

    // Determine rank based on total miles
    let rank = 'Rookie'
    let nextRank = 'Road Scout'
    let nextRankMiles = 100
    if (totalMiles >= 100) { rank = 'Road Scout'; nextRank = 'Pace Setter'; nextRankMiles = 500 }
    if (totalMiles >= 500) { rank = 'Pace Setter'; nextRank = 'Road Master'; nextRankMiles = 1000 }
    if (totalMiles >= 1000) { rank = 'Road Master'; nextRank = 'Rally Legend'; nextRankMiles = 2500 }
    if (totalMiles >= 2500) { rank = 'Rally Legend'; nextRank = 'Achieved'; nextRankMiles = totalMiles }

    return {
      rank,
      totalMiles: Math.round(totalMiles),
      nextRank,
      nextRankMiles,
      routeCount,
      totalCurves,
      weekMiles: Math.round(weekMiles),
      weekChange: null, // Would need historical data to calculate
    }
  }, [recentRoutes])

  // Get location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.longitude, pos.coords.latitude])
          setHasLocation(true)
        },
        (err) => {
          console.warn('Could not get location:', err.message)
          setHasLocation(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [setPosition])

  // Route handlers
  const handleStartDrive = async (dest) => {
    setError(null)
    setIsLoading(true)

    if (!hasLocation) {
      setError('Cannot get your current location. Please enable location services.')
      setIsLoading(false)
      return
    }

    try {
      clearRouteData()
      setRouteMode('destination')
      const success = await initDestinationRoute(dest.name)

      if (success) {
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      } else {
        setError('Could not find route. Try a different destination.')
      }
    } catch (err) {
      setError('Error getting route. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Handler for discovery routes with coordinates
  const handleStartDiscoveryRoute = async (route) => {
    setError(null)
    setIsLoading(true)

    try {
      clearRouteData()
      setRouteMode('destination')

      // Get start coords - use current position or route's start
      const startCoords = position || (route.start ? [route.start.lng, route.start.lat] : null)
      // Get end coords from route
      const endCoords = route.endCoords || (route.end ? [route.end.lng, route.end.lat] : null)

      if (!startCoords) {
        setError('Cannot get your current location.')
        setIsLoading(false)
        return
      }

      if (!endCoords) {
        setError('Route has no destination coordinates.')
        setIsLoading(false)
        return
      }

      const success = await initRouteFromCoordinates(
        startCoords,
        endCoords,
        route.waypoints,
        route.end?.label || route.destination || route.name
      )

      if (success) {
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      } else {
        setError('Could not load route. Try again.')
      }
    } catch (err) {
      setError('Error loading route.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectSavedRoute = async (route) => {
    // If route has discoveryData (saved from RouteDetailPage), use it
    if (route.discoveryData) {
      return handleStartDiscoveryRoute({
        ...route.discoveryData,
        startCoords: route.startCoords,
        endCoords: route.endCoords,
        waypoints: route.waypoints,
      })
    }

    // If route has start/end coordinates (discovery or saved with coords), use direct routing
    if ((route.start?.lng && route.end?.lng) || (route.startCoords && route.endCoords)) {
      return handleStartDiscoveryRoute(route)
    }

    // Try to look up by discoveryId in DISCOVERY_ROUTES
    if (route.discoveryId) {
      const { DISCOVERY_ROUTES } = require('../data/discoveryRoutes')
      const fullRoute = DISCOVERY_ROUTES.find(r => r.id === route.discoveryId)
      if (fullRoute) {
        return handleStartDiscoveryRoute({
          ...fullRoute,
          startCoords: route.startCoords || [fullRoute.start.lng, fullRoute.start.lat],
          endCoords: route.endCoords || [fullRoute.end.lng, fullRoute.end.lat],
          waypoints: route.waypoints || fullRoute.waypoints,
        })
      }
    }

    // Otherwise fall back to geocoding
    setError(null)
    setIsLoading(true)

    try {
      clearRouteData()
      setRouteMode('destination')
      const success = await initDestinationRoute(route.destination || route.name)

      if (success) {
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      } else {
        setError('Could not load route. It may no longer be available.')
      }
    } catch (err) {
      setError('Error loading route.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleNavigateToSettings = () => {
    toggleSettings()
  }

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{
        background: BG_DEEP,
      }}
    >
      {/* Global Atmospheric Background */}
      <AtmosphericBackground />

      {/* Max-width Container */}
      <div
        style={{
          maxWidth: layout.maxWidth,
          margin: '0 auto',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tab Content */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            paddingBottom: `calc(${layout.navHeight} + env(safe-area-inset-bottom, 16px))`,
          }}
        >
          {activeTab === 'home' && (
            <HomeTab
              hasLocation={hasLocation}
              recentRoutes={recentRoutes}
              favoriteRoutes={favoriteRoutes}
              onStartDrive={handleStartDrive}
              onSelectSavedRoute={handleSelectSavedRoute}
              onStartDiscoveryRoute={handleStartDiscoveryRoute}
              onRemoveRecent={removeRecentRoute}
              onRemoveFavorite={removeFavoriteRoute}
              onClearRecentRoutes={clearRecentRoutes}
              isLoading={isLoading}
              error={error}
              onClearError={() => setError(null)}
              onNavigateToSettings={handleNavigateToSettings}
              onTabChange={setActiveTab}
            />
          )}
          {activeTab === 'discover' && (
            <DiscoverTab
              onStartRoute={handleStartDiscoveryRoute}
              onTabChange={setActiveTab}
            />
          )}
          {activeTab === 'profile' && (
            <ProfileTab
              onNavigateToSettings={handleNavigateToSettings}
              logbookStats={logbookStats}
              recentRoutes={recentRoutes}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Settings Panel - overlays everything when open */}
      <SettingsPanel />
    </div>
  )
}
