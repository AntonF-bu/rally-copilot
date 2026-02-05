import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { BottomNav } from './BottomNav'
import { HomeTab } from './tabs/HomeTab'
import { DiscoverTab } from './tabs/DiscoverTab'
import { ProfileTab } from './tabs/ProfileTab'
import { colors, layout } from '../styles/theme'

// ================================
// Route Selection Screen - v6
// Tab-based navigation: Home, Discover, Profile
// Night Stage design with atmospheric background
// ================================

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

  const { initDestinationRoute } = useRouteAnalysis()

  // Tab state
  const [activeTab, setActiveTab] = useState('home')

  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasLocation, setHasLocation] = useState(false)

  // Placeholder logbook stats (will wire up real data later)
  const logbookStats = {
    rank: 'Road Scout',
    totalMiles: 847,
    nextRank: 'Pace Setter',
    nextRankMiles: 1000,
    routeCount: 23,
    weekMiles: 124,
    weekChange: '+18%',
  }

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

  const handleSelectSavedRoute = async (route) => {
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
      className="fixed inset-0 flex flex-col"
      style={{
        background: colors.bgDeep,
        height: '100dvh',
        minHeight: '-webkit-fill-available',
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
              onRemoveRecent={removeRecentRoute}
              onRemoveFavorite={removeFavoriteRoute}
              onClearRecentRoutes={clearRecentRoutes}
              isLoading={isLoading}
              error={error}
              onClearError={() => setError(null)}
            />
          )}
          {activeTab === 'discover' && (
            <DiscoverTab />
          )}
          {activeTab === 'profile' && (
            <ProfileTab
              onNavigateToSettings={handleNavigateToSettings}
              logbookStats={logbookStats}
            />
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  )
}
