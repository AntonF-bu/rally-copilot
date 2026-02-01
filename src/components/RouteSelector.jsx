import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { geocodeAddress } from '../services/routeService'

// ================================
// Route Selection Screen - v4
// Premium redesign: Hero + Cards + Logbook
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

  const { initDestinationRoute, initImportedRoute, initMultiStopRoute } = useRouteAnalysis()

  // UI State
  const [showDestination, setShowDestination] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showTripBuilder, setShowTripBuilder] = useState(false)
  const [showRecentList, setShowRecentList] = useState(false)
  const [showFavoritesList, setShowFavoritesList] = useState(false)
  const [logbookExpanded, setLogbookExpanded] = useState(false)
  const [heroMounted, setHeroMounted] = useState(false)

  // Search/Loading state
  const [destination, setDestination] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasLocation, setHasLocation] = useState(false)

  // Hero mount animation
  useEffect(() => {
    const timer = setTimeout(() => setHeroMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

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

  // Route handlers
  const handleSelectDestination = async (dest) => {
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
        setShowDestination(false)
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

  const handleImport = async () => {
    if (!importUrl.trim()) return

    setError(null)
    setIsLoading(true)

    try {
      clearRouteData()
      setRouteMode('imported')
      const result = await initImportedRoute(importUrl)

      if (result === true) {
        setShowImport(false)
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      } else if (result && result.error === 'SHORT_URL') {
        setError(result.message)
      } else {
        setError('Could not parse route. Please use the full URL from your browser address bar.')
      }
    } catch (err) {
      setError('Error importing route. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMultiStopRoute = async (coords) => {
    if (!coords || coords.length < 2) return
    setError(null)
    setIsLoading(true)
    setShowTripBuilder(false)

    try {
      clearRouteData()
      setRouteMode('multistop')
      const success = await initMultiStopRoute(coords)

      if (success) {
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      } else {
        setError('Could not create route. Try different locations.')
      }
    } catch (err) {
      setError('Error creating route.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartDrive = () => {
    setShowDestination(true)
  }

  const formatDist = (meters) => {
    if (!meters) return '--'
    const miles = meters / 1609.34
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
  }

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

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-y-auto">

      {/* ================================ */}
      {/* HERO SECTION */}
      {/* ================================ */}
      <div
        className={`relative flex-shrink-0 min-h-[50vh] flex flex-col items-center justify-center px-6 transition-all duration-700 ease-out ${
          heroMounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Hero background image (falls back to gradient if image not found) */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to bottom, rgba(10,10,20,0.3) 0%, rgba(10,10,20,0.85) 100%),
              url('/images/hero-road.jpg')
            `,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: '#0a0a1a'
          }}
        />

        {/* Fallback gradient (shows through if image not loaded) */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 50% 0%, rgba(0, 212, 255, 0.15) 0%, transparent 50%),
              linear-gradient(135deg, #0a0a1a 0%, #0f1a2e 40%, #0a1628 70%, #0a0a1a 100%)
            `,
            mixBlendMode: 'multiply'
          }}
        />

        {/* Vignette overlay (darker edges) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)'
          }}
        />

        {/* Bottom fade to content */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 60%, rgba(10,10,15,0.8) 85%, #0a0a0f 100%)'
          }}
        />

        {/* Hero Content */}
        <div
          className={`relative z-10 text-center transition-all duration-700 ease-out ${
            heroMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
          }`}
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ letterSpacing: '0.15em' }}>
            RALLY CO-PILOT
          </h1>
          <p className="text-white/50 text-sm sm:text-base font-light mb-8" style={{ letterSpacing: '0.05em' }}>
            Know the road before you see it
          </p>

          <button
            onClick={handleStartDrive}
            disabled={!hasLocation}
            className="group px-8 py-4 rounded-2xl text-black font-bold text-lg flex items-center gap-3 mx-auto transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)',
              boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)',
              letterSpacing: '0.1em'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 25px rgba(0, 212, 255, 0.4), 0 0 50px rgba(0, 212, 255, 0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.3), 0 0 40px rgba(0, 212, 255, 0.1)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21"/>
            </svg>
            START DRIVE
          </button>

          {/* GPS Status */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`w-2 h-2 rounded-full transition-colors ${hasLocation ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
            <span className="text-white/40 text-xs">
              {hasLocation ? 'GPS ready' : 'Acquiring GPS...'}
            </span>
          </div>
        </div>
      </div>

      {/* ================================ */}
      {/* ROUTE CARDS ROW */}
      {/* ================================ */}
      <div
        className={`px-4 -mt-6 relative z-10 transition-all duration-700 ease-out ${
          heroMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ transitionDelay: '100ms' }}
      >
        <div className="flex gap-3">
          {/* Recent Card */}
          <button
            onClick={() => recentRoutes?.length > 0 ? setShowRecentList(true) : handleStartDrive()}
            className="glass-card flex-1 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <span className="text-[10px] font-semibold text-white/50" style={{ letterSpacing: '0.1em' }}>RECENT</span>
            </div>
            <div className="text-left">
              {recentRoutes?.length > 0 ? (
                <>
                  <p className="text-white font-medium text-sm truncate">
                    {recentRoutes[0].name || recentRoutes[0].destination || 'Unknown route'}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">{recentRoutes.length} drive{recentRoutes.length !== 1 ? 's' : ''}</p>
                </>
              ) : (
                <>
                  <p className="text-white/50 text-sm">No recent drives</p>
                  <p className="text-white/30 text-xs mt-0.5">Start your first route</p>
                </>
              )}
            </div>
          </button>

          {/* Favorites Card */}
          <button
            onClick={() => favoriteRoutes?.length > 0 ? setShowFavoritesList(true) : null}
            disabled={!favoriteRoutes?.length}
            className="glass-card flex-1 p-4 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-[10px] font-semibold text-white/50" style={{ letterSpacing: '0.1em' }}>FAVORITES</span>
            </div>
            <div className="text-left">
              {favoriteRoutes?.length > 0 ? (
                <>
                  <p className="text-white font-medium text-sm">{favoriteRoutes.length} saved</p>
                  <p className="text-white/40 text-xs mt-0.5">Tap to view</p>
                </>
              ) : (
                <>
                  <p className="text-white/50 text-sm">No favorites yet</p>
                  <p className="text-white/30 text-xs mt-0.5">Save routes to access here</p>
                </>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ================================ */}
      {/* LOGBOOK BAR */}
      {/* ================================ */}
      <div
        className={`px-4 mt-4 transition-all duration-700 ease-out ${
          heroMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ transitionDelay: '200ms' }}
      >
        <div
          className={`glass-card rounded-2xl overflow-hidden transition-all duration-200 ${
            logbookExpanded ? 'border-l-[3px] border-l-[#00d4ff]' : ''
          }`}
        >
          {/* Collapsed header */}
          <button
            onClick={() => setLogbookExpanded(!logbookExpanded)}
            className="w-full p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" className="opacity-70">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <div className="flex-1 text-left">
              <span className="text-white/80 text-sm font-medium">{logbookStats.rank}</span>
              <span className="text-white/30 mx-2">·</span>
              <span className="text-white/50 text-sm">{logbookStats.totalMiles} mi</span>
              <span className="text-white/30 mx-2">·</span>
              <span className="text-white/50 text-sm">{logbookStats.routeCount} routes</span>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-white/30 transition-transform duration-300 ${logbookExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {/* Expanded content */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              logbookExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pb-4 border-t border-white/5">
              {/* Rank progress */}
              <div className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-semibold">{logbookStats.rank}</span>
                  <span className="text-white/40 text-xs">
                    {logbookStats.totalMiles} / {logbookStats.nextRankMiles} mi to {logbookStats.nextRank}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(logbookStats.totalMiles / logbookStats.nextRankMiles) * 100}%`,
                      background: 'linear-gradient(90deg, #00d4ff 0%, #00a8cc 100%)'
                    }}
                  />
                </div>
              </div>

              {/* Stats boxes */}
              <div className="flex gap-3 mb-3">
                <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-white/40 text-[10px] uppercase mb-1" style={{ letterSpacing: '0.1em' }}>This Week</p>
                  <p className="text-white font-bold text-lg">{logbookStats.weekMiles} mi</p>
                  <p className="text-emerald-400 text-xs">{logbookStats.weekChange}</p>
                </div>
                <div className="flex-1 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-white/40 text-[10px] uppercase mb-1" style={{ letterSpacing: '0.1em' }}>All Time</p>
                  <p className="text-white font-bold text-lg">{logbookStats.totalMiles} mi</p>
                  <p className="text-white/40 text-xs">{logbookStats.routeCount} routes</p>
                </div>
              </div>

              {/* Badges placeholder */}
              <div className="pt-2 border-t border-white/5">
                <p className="text-white/30 text-[10px] uppercase mb-2" style={{ letterSpacing: '0.1em' }}>Recent Badges</p>
                <div className="flex gap-2 text-xs text-white/60">
                  <span className="px-2 py-1 bg-white/[0.03] border border-white/5 rounded-lg flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                    Night Owl
                  </span>
                  <span className="px-2 py-1 bg-white/[0.03] border border-white/5 rounded-lg flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                    Repeat Driver
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================ */}
      {/* QUICK ACTIONS (Import, Plan Trip) */}
      {/* ================================ */}
      <div
        className={`px-4 mt-4 flex gap-3 transition-all duration-700 ease-out ${
          heroMounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
        }`}
        style={{ transitionDelay: '300ms' }}
      >
        <button
          onClick={() => setShowImport(true)}
          className="glass-card flex-1 p-3 rounded-xl flex items-center justify-center gap-2 text-white/50 hover:text-white/70 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span className="text-sm font-medium">Import</span>
        </button>
        <button
          onClick={() => setShowTripBuilder(true)}
          disabled={!hasLocation}
          className="glass-card flex-1 p-3 rounded-xl flex items-center justify-center gap-2 text-white/50 hover:text-white/70 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>
            <path d="M6 8v8a2 2 0 0 0 2 2h8"/><path d="M8 6h8"/>
          </svg>
          <span className="text-sm font-medium">Plan Trip</span>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ================================ */}
      {/* SETTINGS BUTTON (fixed bottom-right) */}
      {/* ================================ */}
      <button
        onClick={toggleSettings}
        className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white/70 hover:border-white/15 transition-all duration-200 z-20 safe-bottom"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Error Banner */}
      {error && (
        <div className="fixed top-12 left-4 right-4 z-50 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between backdrop-blur-sm">
          <p className="text-red-400 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400/60 p-1 ml-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      {/* ================================ */}
      {/* MODALS */}
      {/* ================================ */}

      {/* Destination Search Modal */}
      {showDestination && (
        <SearchModal
          title="Set Destination"
          placeholder="Search for a place..."
          value={destination}
          onChange={setDestination}
          onClose={() => { setShowDestination(false); setDestination(''); setSearchResults([]) }}
          results={searchResults}
          isSearching={isSearching}
          isLoading={isLoading}
          onSelect={handleSelectDestination}
        />
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowImport(false)} />
          <div className="relative w-full max-w-lg bg-[#12121a] rounded-t-3xl border-t border-white/10 p-6 pb-8 safe-bottom">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Import Route</h2>
              <button onClick={() => setShowImport(false)} className="p-2 text-white/40 hover:text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <p className="text-white/50 text-sm mb-4">
              Paste a Google Maps URL to import that route. Use the full URL from your browser's address bar.
            </p>

            <input
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://www.google.com/maps/dir/..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 mb-4"
            />

            <button
              onClick={handleImport}
              disabled={!importUrl.trim() || isLoading}
              className="w-full py-3 rounded-xl bg-purple-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Importing...</>
              ) : (
                'Import Route'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Trip Builder Modal */}
      {showTripBuilder && (
        <TripBuilderModal
          onClose={() => setShowTripBuilder(false)}
          onCreateRoute={handleMultiStopRoute}
          isLoading={isLoading}
          currentPosition={position}
        />
      )}

      {/* Recent Routes List Modal */}
      {showRecentList && (
        <RouteListModal
          title="Recent Drives"
          routes={recentRoutes}
          onSelect={handleSelectSavedRoute}
          onRemove={removeRecentRoute}
          onClearAll={clearRecentRoutes}
          onClose={() => setShowRecentList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          accentColor="#00d4ff"
        />
      )}

      {/* Favorites List Modal */}
      {showFavoritesList && (
        <RouteListModal
          title="Favorites"
          routes={favoriteRoutes}
          onSelect={handleSelectSavedRoute}
          onRemove={removeFavoriteRoute}
          onClose={() => setShowFavoritesList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          accentColor="#f59e0b"
          isFavorites
        />
      )}

      <style>{`
        .safe-bottom { margin-bottom: env(safe-area-inset-bottom, 0px); }

        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .glass-card:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.12);
        }
      `}</style>
    </div>
  )
}


// ================================
// Search Modal Component
// ================================
function SearchModal({ title, placeholder, value, onChange, onClose, results, isSearching, isLoading, onSelect }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-[#0a0a0f]/95 backdrop-blur-md" />

      <div className="relative flex-1 flex flex-col p-4 pt-14 safe-top">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onClose} className="p-2 -ml-2 text-white/60 hover:text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
            </svg>
          </button>
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {results.length > 0 ? (
            <div className="flex flex-col gap-1">
              {results.map((result, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(result)}
                  disabled={isLoading}
                  className="p-4 rounded-xl text-left hover:bg-white/5 transition-colors disabled:opacity-50 flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{result.name}</div>
                    {result.address && (
                      <div className="text-white/40 text-sm truncate mt-0.5">{result.address}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : value.length >= 3 && !isSearching ? (
            <div className="text-center py-12">
              <p className="text-white/40 text-sm">No results found</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/30 text-sm">Start typing to search</p>
            </div>
          )}
        </div>
      </div>
      <style>{`.safe-top { padding-top: env(safe-area-inset-top, 20px); }`}</style>
    </div>
  )
}


// ================================
// Route List Modal Component
// ================================
function RouteListModal({ title, routes, onSelect, onRemove, onClearAll, onClose, isLoading, formatDist, accentColor, isFavorites }) {
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
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-[#0a0a0f]/95 backdrop-blur-md" />

      <div className="relative flex-1 flex flex-col p-4 pt-14 safe-top">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 text-white/60 hover:text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
              </svg>
            </button>
            <h2 className="text-xl font-bold text-white">{title}</h2>
          </div>
          {onClearAll && routes?.length >= 5 && (
            <button
              onClick={onClearAll}
              className="text-xs text-red-400/60 hover:text-red-400 transition-colors px-3 py-1"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Routes */}
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col gap-2">
            {routes?.map((route) => (
              <div key={route.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-3 hover:bg-white/[0.05] transition-colors">
                <button
                  onClick={() => onSelect(route)}
                  disabled={isLoading}
                  className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${accentColor}15` }}
                  >
                    {isFavorites ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={accentColor} stroke={accentColor} strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2">
                        <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium truncate">{route.name || route.destination || 'Unknown'}</div>
                    <div className="flex items-center gap-2 text-white/30 text-xs">
                      <span>{formatDist(route.distance)}</span>
                      <span>•</span>
                      <span>{route.curveCount || 0} curves</span>
                      {route.timestamp && !isFavorites && (
                        <>
                          <span>•</span>
                          <span>{timeAgo(route.timestamp)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => onRemove(route.id)}
                  className="p-2 text-white/20 hover:text-white/50 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <style>{`.safe-top { padding-top: env(safe-area-inset-top, 20px); }`}</style>
    </div>
  )
}


// ================================
// Trip Builder Modal Component
// ================================
function TripBuilderModal({ onClose, onCreateRoute, isLoading, currentPosition }) {
  const [waypoints, setWaypoints] = useState([])
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!searchValue || searchValue.length < 3) {
      setSearchResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const results = await geocodeAddress(searchValue)
      setSearchResults(results || [])
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchValue])

  const addWaypoint = (result) => {
    setWaypoints([...waypoints, { name: result.name, coordinates: result.coordinates }])
    setSearchValue('')
    setSearchResults([])
  }

  const removeWaypoint = (index) => {
    setWaypoints(waypoints.filter((_, i) => i !== index))
  }

  const handleCreate = () => {
    if (waypoints.length < 1) return
    const coords = waypoints.map(w => w.coordinates)
    onCreateRoute(coords)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div className="absolute inset-0 bg-[#0a0a0f]/95 backdrop-blur-md" />

      <div className="relative flex-1 flex flex-col p-4 pt-14 safe-top">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2 text-white/60 hover:text-white">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
              </svg>
            </button>
            <h2 className="text-xl font-bold text-white">Plan Trip</h2>
          </div>
        </div>

        {/* Current Location */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-emerald-400"/>
          </div>
          <div className="flex-1">
            <div className="text-emerald-400 text-sm font-medium">Starting from current location</div>
          </div>
        </div>

        {/* Waypoints */}
        {waypoints.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {waypoints.map((wp, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{wp.name}</div>
                </div>
                <button onClick={() => removeWaypoint(i)} className="p-1.5 text-white/30 hover:text-white/60">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Stop */}
        <div className="relative mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Add a stop..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="flex-1 overflow-auto mb-4">
            {searchResults.map((result, i) => (
              <button
                key={i}
                onClick={() => addWaypoint(result)}
                className="w-full p-3 text-left hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{result.name}</div>
                  {result.address && <div className="text-white/40 text-xs truncate">{result.address}</div>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create Button */}
        <div className="mt-auto">
          <button
            onClick={handleCreate}
            disabled={waypoints.length < 1 || isLoading}
            className="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>Creating...</>
            ) : (
              `Create Route${waypoints.length > 0 ? ` (${waypoints.length} stop${waypoints.length > 1 ? 's' : ''})` : ''}`
            )}
          </button>
        </div>
      </div>
      <style>{`.safe-top { padding-top: env(safe-area-inset-top, 20px); }`}</style>
    </div>
  )
}
