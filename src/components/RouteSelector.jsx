import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { BottomNav } from './BottomNav'
import { HomeTab } from './tabs/HomeTab'
import { DiscoverTab } from './tabs/DiscoverTab'
import { ProfileTab } from './tabs/ProfileTab'
import { colors } from '../styles/theme'

// ================================
// Route Selection Screen - v5
// Tab-based navigation: Home, Discover, Profile
// ================================

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

  // Calculate nav height including safe area
  const navHeight = 'calc(70px + env(safe-area-inset-bottom, 0px))'

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        background: colors.bgDeep,
        // Use 100dvh for mobile Safari dynamic viewport
        height: '100dvh',
        minHeight: '-webkit-fill-available',
      }}
    >
      {/* Tab Content */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: navHeight,
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
  )
}
