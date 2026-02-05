// Home Tab - Hero, Start Drive, Recent, Favorites
// Refactored to use theme system

import { useState, useEffect } from 'react'
import { geocodeAddress } from '../../services/routeService'
import { colors, fonts, glass, glassPanel, transitions } from '../../styles/theme'

export function HomeTab({
  hasLocation,
  recentRoutes,
  favoriteRoutes,
  onStartDrive,
  onSelectSavedRoute,
  onRemoveRecent,
  onRemoveFavorite,
  onClearRecentRoutes,
  isLoading,
  error,
  onClearError,
}) {
  const [showDestination, setShowDestination] = useState(false)
  const [showRecentList, setShowRecentList] = useState(false)
  const [showFavoritesList, setShowFavoritesList] = useState(false)
  const [heroMounted, setHeroMounted] = useState(false)

  // Search state
  const [destination, setDestination] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  // Hero mount animation
  useEffect(() => {
    const timer = setTimeout(() => setHeroMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

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

  const handleStartDrive = () => {
    setShowDestination(true)
  }

  const handleSelectDestination = async (dest) => {
    setShowDestination(false)
    setDestination('')
    setSearchResults([])
    onStartDrive(dest)
  }

  const formatDist = (meters) => {
    if (!meters) return '--'
    const miles = meters / 1609.34
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
  }

  return (
    <div className="flex flex-col">
      {/* ================================ */}
      {/* HERO SECTION */}
      {/* ================================ */}
      <div
        className={`relative flex-shrink-0 min-h-[50vh] flex flex-col items-center justify-center px-6 ${
          heroMounted ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transition: 'opacity 0.7s ease-out' }}
      >
        {/* Hero background image (falls back to gradient if image not found) */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(to bottom, rgba(6,10,19,0.3) 0%, rgba(6,10,19,0.85) 100%),
              url('/images/hero-road.jpg')
            `,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: colors.bgDeep
          }}
        />

        {/* Fallback gradient (shows through if image not loaded) */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 50% 0%, ${colors.accentGlow} 0%, transparent 50%),
              linear-gradient(135deg, ${colors.bgDeep} 0%, ${colors.bgPrimary} 40%, ${colors.bgDeep} 100%)
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
            background: `linear-gradient(to bottom, transparent 60%, ${colors.bgDeep}cc 85%, ${colors.bgDeep} 100%)`
          }}
        />

        {/* Hero Content */}
        <div
          className={`relative z-10 text-center ${
            heroMounted ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transition: 'all 0.7s ease-out',
            transform: heroMounted ? 'translateY(0)' : 'translateY(20px)'
          }}
        >
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: '32px',
              fontWeight: 600,
              color: colors.textPrimary,
              letterSpacing: '0.15em',
              marginBottom: '12px',
              textTransform: 'uppercase',
            }}
          >
            RALLY CO-PILOT
          </h1>
          <p
            style={{
              color: colors.textSecondary,
              fontSize: '14px',
              fontWeight: 300,
              letterSpacing: '0.05em',
              marginBottom: '32px',
              fontFamily: fonts.body,
            }}
          >
            Know the road before you see it
          </p>

          <button
            onClick={handleStartDrive}
            disabled={!hasLocation}
            className="group flex items-center gap-3 mx-auto disabled:opacity-50"
            style={{
              padding: '16px 32px',
              borderRadius: '16px',
              background: `linear-gradient(135deg, ${colors.accent} 0%, #E85A2A 100%)`,
              boxShadow: `0 4px 20px ${colors.accentGlow}, 0 0 40px ${colors.accentDim}`,
              color: colors.bgDeep,
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: '16px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              transition: transitions.smooth,
              border: 'none',
              cursor: hasLocation ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => {
              if (hasLocation) {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = `0 6px 25px ${colors.accentGlow}, 0 0 50px ${colors.accentGlow}`
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = `0 4px 20px ${colors.accentGlow}, 0 0 40px ${colors.accentDim}`
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21"/>
            </svg>
            START DRIVE
          </button>

          {/* GPS Status */}
          <div className="flex items-center justify-center gap-2 mt-4">
            <div
              className={`w-2 h-2 rounded-full ${!hasLocation ? 'animate-pulse' : ''}`}
              style={{ background: hasLocation ? '#22c55e' : '#f59e0b' }}
            />
            <span style={{ color: colors.textMuted, fontSize: '12px' }}>
              {hasLocation ? 'GPS ready' : 'Acquiring GPS...'}
            </span>
          </div>
        </div>
      </div>

      {/* ================================ */}
      {/* ROUTE CARDS ROW */}
      {/* ================================ */}
      <div
        className={`px-4 -mt-6 relative z-10 ${heroMounted ? 'opacity-100' : 'opacity-0'}`}
        style={{
          transition: 'all 0.7s ease-out',
          transitionDelay: '100ms',
          transform: heroMounted ? 'translateY(0)' : 'translateY(20px)'
        }}
      >
        <div className="flex gap-3">
          {/* Recent Card */}
          <button
            onClick={() => recentRoutes?.length > 0 ? setShowRecentList(true) : handleStartDrive()}
            className="flex-1 p-4 rounded-2xl"
            style={{
              ...glass,
              transition: transitions.smooth,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bgCard
              e.currentTarget.style.borderColor = `${colors.accent}20`
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = glass.background
              e.currentTarget.style.borderColor = colors.glassBorder
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <span style={{
                fontFamily: fonts.heading,
                fontSize: '10px',
                fontWeight: 500,
                color: colors.textMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>RECENT</span>
            </div>
            <div className="text-left">
              {recentRoutes?.length > 0 ? (
                <>
                  <p style={{ color: colors.textPrimary, fontWeight: 500, fontSize: '14px' }} className="truncate">
                    {recentRoutes[0].name || recentRoutes[0].destination || 'Unknown route'}
                  </p>
                  <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>
                    {recentRoutes.length} drive{recentRoutes.length !== 1 ? 's' : ''}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ color: colors.textSecondary, fontSize: '14px' }}>No recent drives</p>
                  <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>Start your first route</p>
                </>
              )}
            </div>
          </button>

          {/* Favorites Card */}
          <button
            onClick={() => favoriteRoutes?.length > 0 ? setShowFavoritesList(true) : null}
            disabled={!favoriteRoutes?.length}
            className="flex-1 p-4 rounded-2xl disabled:opacity-60"
            style={{
              ...glass,
              transition: transitions.smooth,
              cursor: favoriteRoutes?.length ? 'pointer' : 'not-allowed',
            }}
            onMouseEnter={(e) => {
              if (favoriteRoutes?.length) {
                e.currentTarget.style.background = colors.bgCard
                e.currentTarget.style.borderColor = `${colors.accent}20`
                e.currentTarget.style.transform = 'translateY(-2px)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = glass.background
              e.currentTarget.style.borderColor = colors.glassBorder
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={{
                fontFamily: fonts.heading,
                fontSize: '10px',
                fontWeight: 500,
                color: colors.textMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>FAVORITES</span>
            </div>
            <div className="text-left">
              {favoriteRoutes?.length > 0 ? (
                <>
                  <p style={{ color: colors.textPrimary, fontWeight: 500, fontSize: '14px' }}>
                    {favoriteRoutes.length} saved
                  </p>
                  <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>Tap to view</p>
                </>
              ) : (
                <>
                  <p style={{ color: colors.textSecondary, fontSize: '14px' }}>No favorites yet</p>
                  <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>Save routes to access here</p>
                </>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="fixed top-12 left-4 right-4 z-50 p-3 rounded-xl flex items-center justify-between"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <p style={{ color: '#f87171', fontSize: '14px', flex: 1 }}>{error}</p>
          <button onClick={onClearError} className="p-1 ml-2" style={{ color: 'rgba(248, 113, 113, 0.6)' }}>
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

      {/* Recent Routes List Modal */}
      {showRecentList && (
        <RouteListModal
          title="Recent Drives"
          routes={recentRoutes}
          onSelect={onSelectSavedRoute}
          onRemove={onRemoveRecent}
          onClearAll={onClearRecentRoutes}
          onClose={() => setShowRecentList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          accentColor={colors.accent}
        />
      )}

      {/* Favorites List Modal */}
      {showFavoritesList && (
        <RouteListModal
          title="Favorites"
          routes={favoriteRoutes}
          onSelect={onSelectSavedRoute}
          onRemove={onRemoveFavorite}
          onClose={() => setShowFavoritesList(false)}
          isLoading={isLoading}
          formatDist={formatDist}
          accentColor="#f59e0b"
          isFavorites
        />
      )}
    </div>
  )
}


// ================================
// Search Modal Component
// ================================
function SearchModal({ title, placeholder, value, onChange, onClose, results, isSearching, isLoading, onSelect }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0"
        style={{
          background: `${colors.bgDeep}f5`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      <div className="relative flex-1 flex flex-col p-4 pt-14" style={{ paddingTop: 'max(56px, env(safe-area-inset-top))' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onClose} className="p-2 -ml-2" style={{ color: colors.textSecondary }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
            </svg>
          </button>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body }}>{title}</h2>
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: colors.textMuted }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            style={{
              width: '100%',
              background: colors.bgGlass,
              border: `1px solid ${colors.glassBorder}`,
              borderRadius: '12px',
              paddingLeft: '48px',
              paddingRight: '16px',
              paddingTop: '14px',
              paddingBottom: '14px',
              color: colors.textPrimary,
              fontSize: '16px',
              outline: 'none',
              fontFamily: fonts.body,
            }}
            onFocus={(e) => { e.target.style.borderColor = `${colors.accent}50` }}
            onBlur={(e) => { e.target.style.borderColor = colors.glassBorder }}
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div
                className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
              />
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
                  className="p-4 rounded-xl text-left flex items-start gap-3 disabled:opacity-50"
                  style={{ transition: transitions.snappy }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgGlass }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: colors.accentGlow }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: colors.textPrimary, fontWeight: 500 }} className="truncate">{result.name}</div>
                    {result.address && (
                      <div style={{ color: colors.textMuted, fontSize: '14px' }} className="truncate mt-0.5">{result.address}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : value.length >= 3 && !isSearching ? (
            <div className="text-center py-12">
              <p style={{ color: colors.textMuted, fontSize: '14px' }}>No results found</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p style={{ color: colors.textMuted, fontSize: '14px' }}>Start typing to search</p>
            </div>
          )}
        </div>
      </div>
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
      <div
        className="absolute inset-0"
        style={{
          background: `${colors.bgDeep}f5`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      <div className="relative flex-1 flex flex-col p-4 pt-14" style={{ paddingTop: 'max(56px, env(safe-area-inset-top))' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 -ml-2" style={{ color: colors.textSecondary }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
              </svg>
            </button>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, fontFamily: fonts.body }}>{title}</h2>
          </div>
          {onClearAll && routes?.length >= 5 && (
            <button
              onClick={onClearAll}
              style={{ fontSize: '12px', color: 'rgba(248, 113, 113, 0.6)', padding: '4px 12px' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(248, 113, 113, 0.6)' }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Routes */}
        <div className="flex-1 overflow-auto">
          <div className="flex flex-col gap-2">
            {routes?.map((route) => (
              <div
                key={route.id}
                className="p-3 rounded-xl flex items-center gap-3"
                style={{
                  background: colors.bgGlass,
                  border: `1px solid ${colors.glassBorder}`,
                  transition: transitions.snappy,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgCard }}
                onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgGlass }}
              >
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
                    <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 500 }} className="truncate">
                      {route.name || route.destination || 'Unknown'}
                    </div>
                    <div className="flex items-center gap-2" style={{ color: colors.textMuted, fontSize: '12px' }}>
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
                  className="p-2"
                  style={{ color: colors.textMuted, transition: transitions.snappy }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.textSecondary }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted }}
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
    </div>
  )
}
