import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { geocodeAddress } from '../services/routeService'

// ================================
// Route Selection Screen - v3
// Clean redesign, fixed recent routes
// Removed: Demo mode, Look-ahead mode
// ================================

export default function RouteSelector() {
  const { 
    setRouteMode, 
    setShowRouteSelector, 
    setShowRoutePreview,
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

  const [activeTab, setActiveTab] = useState('new')
  const [showDestination, setShowDestination] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showTripBuilder, setShowTripBuilder] = useState(false)
  const [destination, setDestination] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasLocation, setHasLocation] = useState(false)

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

  const formatDist = (meters) => {
    if (!meters) return '--'
    const miles = meters / 1609.34
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      
      {/* Header - New Clean Design */}
      <div className="relative pt-20 pb-8 px-6 safe-top">
        {/* Background accent */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[300px] rounded-full opacity-20 blur-[80px]"
            style={{ background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)' }}
          />
        </div>
        
        {/* Logo and Title */}
        <div className="relative flex items-center gap-4">
          {/* Logo Icon */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              {/* Steering wheel / road icon */}
              <circle cx="12" cy="12" r="9" stroke="#00d4ff" strokeWidth="1.5" fill="none"/>
              <circle cx="12" cy="12" r="3" stroke="#00d4ff" strokeWidth="1.5" fill="none"/>
              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Rally Co-Pilot</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full transition-colors ${hasLocation ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <p className="text-white/50 text-sm">
                {hasLocation ? 'Ready to navigate' : 'Acquiring GPS...'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between">
          <p className="text-red-400 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400/60 p-1 ml-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="px-4 mb-4">
        <div className="flex bg-white/5 rounded-2xl p-1.5">
          {[
            { id: 'new', label: 'New Route', icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            )},
            { id: 'recent', label: 'Recent', count: recentRoutes?.length || 0, icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
            )},
            { id: 'favorites', label: 'Saved', count: favoriteRoutes?.length || 0, icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            )},
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                activeTab === tab.id 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <span className={activeTab === tab.id ? 'text-cyan-400' : ''}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/10 text-white/40'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 px-4 pb-4 overflow-auto">
        
        {/* NEW ROUTE TAB */}
        {activeTab === 'new' && (
          <div className="flex flex-col gap-3">
            {/* Set Destination */}
            <button
              onClick={() => setShowDestination(true)}
              disabled={!hasLocation}
              className="group p-4 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 flex items-center gap-4 active:scale-[0.98] transition-all disabled:opacity-50 hover:border-cyan-500/30"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center group-hover:bg-cyan-500/25 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                  <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Set Destination</div>
                <div className="text-white/40 text-sm">Search for a place to navigate to</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-cyan-500/50 transition-colors">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            {/* Plan Trip */}
            <button
              onClick={() => setShowTripBuilder(true)}
              disabled={!hasLocation}
              className="group p-4 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 flex items-center gap-4 active:scale-[0.98] transition-all disabled:opacity-50 hover:border-emerald-500/30"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>
                  <path d="M6 8v8a2 2 0 0 0 2 2h8"/><path d="M8 6h8"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Plan Trip</div>
                <div className="text-white/40 text-sm">Multiple stops, custom route</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-emerald-500/50 transition-colors">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            {/* Import Route */}
            <button
              onClick={() => setShowImport(true)}
              className="group p-4 rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] border border-white/10 flex items-center gap-4 active:scale-[0.98] transition-all hover:border-purple-500/30"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center group-hover:bg-purple-500/25 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Import Route</div>
                <div className="text-white/40 text-sm">Paste Google Maps link</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20 group-hover:text-purple-500/50 transition-colors">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        )}

        {/* RECENT ROUTES TAB */}
        {activeTab === 'recent' && (
          <div className="flex flex-col gap-2">
            {(!recentRoutes || recentRoutes.length === 0) ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="opacity-20">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <p className="text-white/40 text-sm font-medium">No recent routes</p>
                <p className="text-white/20 text-xs mt-1">Routes you navigate will appear here</p>
              </div>
            ) : (
              <>
                {/* Clear all button when at max */}
                {recentRoutes.length >= 10 && (
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-white/30 text-xs">{recentRoutes.length} routes (max)</span>
                    <button 
                      onClick={clearRecentRoutes}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
                
                {recentRoutes.map((route) => (
                  <div key={route.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-3 hover:bg-white/[0.05] transition-colors">
                    <button
                      onClick={() => handleSelectSavedRoute(route)}
                      disabled={isLoading}
                      className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                    >
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                          <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{route.name || route.destination || 'Unknown'}</div>
                        <div className="flex items-center gap-2 text-white/30 text-xs">
                          <span>{formatDist(route.distance)}</span>
                          <span>•</span>
                          <span>{route.curveCount || 0} curves</span>
                          {route.timestamp && (
                            <>
                              <span>•</span>
                              <span>{timeAgo(route.timestamp)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeRecentRoute(route.id)}
                      className="p-2 text-white/20 hover:text-white/50 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* FAVORITES TAB */}
        {activeTab === 'favorites' && (
          <div className="flex flex-col gap-2">
            {(!favoriteRoutes || favoriteRoutes.length === 0) ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="opacity-20">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-white/40 text-sm font-medium">No saved routes</p>
                <p className="text-white/20 text-xs mt-1">Tap the bookmark icon to save routes</p>
              </div>
            ) : (
              favoriteRoutes.map((route) => (
                <div key={route.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-center gap-3 hover:bg-white/[0.05] transition-colors">
                  <button
                    onClick={() => handleSelectSavedRoute(route)}
                    disabled={isLoading}
                    className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{route.name}</div>
                      <div className="flex items-center gap-2 text-white/30 text-xs">
                        <span>{formatDist(route.distance)}</span>
                        <span>•</span>
                        <span>{route.curveCount || 0} curves</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => removeFavoriteRoute(route.id)}
                    className="p-2 text-amber-500/50 hover:text-amber-500 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

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

      <style>{`
        .safe-top { padding-top: env(safe-area-inset-top, 20px); }
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 20px); }
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
    </div>
  )
}
