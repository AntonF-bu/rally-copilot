import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { geocodeAddress } from '../services/routeService'

// ================================
// Route Selection Screen - v2
// With Recent Routes, Favorites, Multi-stop
// ================================

export default function RouteSelector() {
  const { 
    setRouteMode, 
    setShowRouteSelector, 
    setShowRoutePreview,
    startDrive,
    position,
    setPosition,
    clearRouteData,
    recentRoutes,
    favoriteRoutes,
    removeRecentRoute,
    removeFavoriteRoute,
  } = useStore()
  
  const { initDestinationRoute, initImportedRoute } = useRouteAnalysis()

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
      const success = await initDestinationRoute(route.name)
      
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

  const handleLookAhead = () => {
    if (!hasLocation) {
      setError('Cannot get your current location. Please enable location services.')
      return
    }
    clearRouteData()
    setRouteMode('lookahead')
    setShowRouteSelector(false)
    startDrive()
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

  const handleDemo = () => {
    clearRouteData()
    setRouteMode('demo')
    setShowRouteSelector(false)
    setShowRoutePreview(true)
  }

  const timeAgo = (timestamp) => {
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
      <div className="p-4 pt-12 safe-top">
        <h1 className="text-2xl font-bold text-white tracking-tight">Rally Co-Pilot</h1>
        <div className="flex items-center gap-2 mt-1">
          <div className={`w-2 h-2 rounded-full ${hasLocation ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
          <p className="text-white/40 text-sm">
            {hasLocation ? 'Location ready' : 'Getting location...'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center justify-between">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400/60 p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 mb-3">
        <div className="flex bg-white/5 rounded-xl p-1">
          {[
            { id: 'new', label: 'New Route' },
            { id: 'recent', label: 'Recent', count: recentRoutes?.length || 0 },
            { id: 'favorites', label: 'Saved', count: favoriteRoutes?.length || 0 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                activeTab === tab.id 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-cyan-500/30 text-cyan-400' : 'bg-white/10'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-4 overflow-auto">
        
        {activeTab === 'new' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowDestination(true)}
              disabled={!hasLocation}
              className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                  <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Set Destination</div>
                <div className="text-white/40 text-sm">Quick route to one location</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            <button
              onClick={() => setShowTripBuilder(true)}
              disabled={!hasLocation}
              className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/>
                  <path d="M6 8v8a2 2 0 0 0 2 2h8"/><path d="M8 6h8"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Plan Trip</div>
                <div className="text-white/40 text-sm">Multiple stops, custom route</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            <button
              onClick={handleLookAhead}
              disabled={!hasLocation}
              className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffd500" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Look-Ahead Mode</div>
                <div className="text-white/40 text-sm">Analyze road ahead as you drive</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            <button
              onClick={() => setShowImport(true)}
              className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-semibold">Import Route</div>
                <div className="text-white/40 text-sm">Paste Google Maps link</div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-white/10"/>
              <span className="text-white/20 text-xs tracking-wider">OR TRY</span>
              <div className="flex-1 h-px bg-white/10"/>
            </div>

            <button
              onClick={handleDemo}
              className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform border-dashed"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white/60 font-semibold">Demo Mode</div>
                <div className="text-white/30 text-sm">Try with a sample route</div>
              </div>
            </button>
          </div>
        )}

        {activeTab === 'recent' && (
          <div className="flex flex-col gap-2">
            {(!recentRoutes || recentRoutes.length === 0) ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="opacity-30">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <p className="text-white/40 text-sm">No recent routes</p>
                <p className="text-white/20 text-xs mt-1">Your routes will appear here</p>
              </div>
            ) : (
              recentRoutes.map((route) => (
                <div key={route.id} className="hud-card p-3 flex items-center gap-3">
                  <button
                    onClick={() => handleSelectSavedRoute(route)}
                    disabled={isLoading}
                    className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                        <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{route.name}</div>
                      <div className="flex items-center gap-2 text-white/30 text-xs">
                        <span>{formatDist(route.distance)}</span>
                        <span>•</span>
                        <span>{route.curveCount} curves</span>
                        <span>•</span>
                        <span>{timeAgo(route.timestamp)}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => removeRecentRoute(route.id)}
                    className="p-2 text-white/20 hover:text-white/40 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'favorites' && (
          <div className="flex flex-col gap-2">
            {(!favoriteRoutes || favoriteRoutes.length === 0) ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="opacity-30">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <p className="text-white/40 text-sm">No saved routes</p>
                <p className="text-white/20 text-xs mt-1">Tap the bookmark icon to save routes</p>
              </div>
            ) : (
              favoriteRoutes.map((route) => (
                <div key={route.id} className="hud-card p-3 flex items-center gap-3">
                  <button
                    onClick={() => handleSelectSavedRoute(route)}
                    disabled={isLoading}
                    className="flex-1 flex items-center gap-3 text-left disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-sm font-medium truncate">{route.name}</div>
                      <div className="flex items-center gap-2 text-white/30 text-xs">
                        <span>{formatDist(route.distance)}</span>
                        <span>•</span>
                        <span>{route.curveCount} curves</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => removeFavoriteRoute(route.id)}
                    className="p-2 text-amber-500/60 hover:text-amber-500 transition-colors"
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

      {showDestination && (
        <SearchModal
          title="Set Destination"
          placeholder="Enter address or place..."
          value={destination}
          onChange={setDestination}
          results={searchResults}
          isSearching={isSearching}
          isLoading={isLoading}
          onSelect={handleSelectDestination}
          onClose={() => { setShowDestination(false); setDestination(''); setSearchResults([]) }}
        />
      )}

      {showImport && (
        <ImportModal
          value={importUrl}
          onChange={setImportUrl}
          isLoading={isLoading}
          onImport={handleImport}
          onClose={() => { setShowImport(false); setImportUrl('') }}
        />
      )}

      {showTripBuilder && (
        <TripBuilderModal
          position={position}
          onClose={() => setShowTripBuilder(false)}
        />
      )}

      {isLoading && !showDestination && !showImport && !showTripBuilder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-[#12121a] rounded-2xl p-6 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Loading route...</p>
          </div>
        </div>
      )}

      <style>{`
        .hud-card {
          background: linear-gradient(135deg, rgba(20,20,28,0.9) 0%, rgba(15,15,22,0.95) 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          transition: all 0.2s ease;
        }
        .hud-card:hover { border-color: rgba(255,255,255,0.1); }
        .border-dashed { border-style: dashed; }
        .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
        .safe-bottom { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  )
}

// Search Modal
function SearchModal({ title, placeholder, value, onChange, results, isSearching, isLoading, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-white/40 p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <div className="relative mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-10 py-3 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
            autoFocus
          />
          {value && (
            <button onClick={() => onChange('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}
          
          {!isSearching && results.length > 0 && (
            <div className="space-y-2">
              {results.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelect(result)}
                  disabled={isLoading}
                  className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">{result.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {!isSearching && value.length >= 3 && results.length === 0 && (
            <div className="text-white/40 text-sm text-center py-8">No results found</div>
          )}
          
          {!isSearching && value.length < 3 && (
            <div className="text-white/30 text-sm text-center py-8">Type at least 3 characters to search</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Import Modal
function ImportModal({ value, onChange, isLoading, onImport, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Import Route</h2>
          <button onClick={onClose} className="text-white/40 p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
          <p className="text-white/50 text-xs">
            <strong className="text-white/70">How to get the URL:</strong><br/>
            1. Open Google Maps and create your route<br/>
            2. Click Share, then Copy link<br/>
            3. Open the link in your browser<br/>
            4. Copy the full URL from the address bar
          </p>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste the full Google Maps URL..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 text-sm"
          autoFocus
        />
        <button
          onClick={onImport}
          disabled={!value.trim() || isLoading}
          className="w-full mt-3 bg-purple-500 text-white font-semibold py-3 rounded-xl disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Importing...</span>
            </>
          ) : 'Import Route'}
        </button>
      </div>
    </div>
  )
}

// Trip Builder Modal
function TripBuilderModal({ position, onClose }) {
  const { setShowRouteSelector, setShowRoutePreview, setRouteMode, clearRouteData } = useStore()
  const { initMultiStopRoute } = useRouteAnalysis()
  
  const [waypoints, setWaypoints] = useState([
    { id: 1, type: 'start', name: 'Current Location', coordinates: position },
  ])
  const [showAddStop, setShowAddStop] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 3) {
      setSearchResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const results = await geocodeAddress(searchQuery)
      setSearchResults(results || [])
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const addStop = (result) => {
    const newWaypoint = {
      id: Date.now(),
      type: waypoints.length === 1 ? 'end' : 'stop',
      name: result.name,
      coordinates: result.coordinates,
    }
    setWaypoints([...waypoints, newWaypoint])
    setShowAddStop(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const removeStop = (id) => {
    const updated = waypoints.filter(w => w.id !== id)
    if (updated.length > 1) {
      updated[updated.length - 1].type = 'end'
    }
    setWaypoints(updated)
  }

  const handleStartRoute = async () => {
    if (waypoints.length < 2) return
    
    setIsLoading(true)
    try {
      clearRouteData()
      setRouteMode('multistop')
      
      const coords = waypoints.map(w => w.coordinates).filter(Boolean)
      const success = await initMultiStopRoute(coords)
      
      if (success) {
        onClose()
        setShowRouteSelector(false)
        setShowRoutePreview(true)
      }
    } catch (err) {
      console.error('Multi-stop route error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const canStartRoute = waypoints.length >= 2 && waypoints.every(w => w.coordinates)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Plan Trip</h2>
          <button onClick={onClose} className="text-white/40 p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto mb-4">
          <div className="space-y-2">
            {waypoints.map((waypoint, index) => (
              <div key={waypoint.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center w-6">
                  <div className={`w-3 h-3 rounded-full ${
                    waypoint.type === 'start' ? 'bg-green-500' :
                    waypoint.type === 'end' ? 'bg-red-500' : 'bg-cyan-500'
                  }`} />
                  {index < waypoints.length - 1 && (
                    <div className="w-0.5 h-8 bg-white/20 mt-1" />
                  )}
                </div>
                
                <div className="flex-1 bg-white/5 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-white/40 uppercase tracking-wider">
                      {waypoint.type === 'start' ? 'Start' : waypoint.type === 'end' ? 'Destination' : `Stop ${index}`}
                    </div>
                    <div className="text-white text-sm truncate">{waypoint.name}</div>
                  </div>
                  {waypoint.type !== 'start' && (
                    <button onClick={() => removeStop(waypoint.id)} className="p-1.5 text-white/30 hover:text-white/50">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!showAddStop && (
            <button
              onClick={() => setShowAddStop(true)}
              className="w-full mt-3 py-3 border-2 border-dashed border-white/10 rounded-xl text-white/40 text-sm hover:border-white/20 hover:text-white/50 transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Stop
            </button>
          )}

          {showAddStop && (
            <div className="mt-3 bg-white/5 rounded-xl p-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a place..."
                className="w-full bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-cyan-500/50 mb-2"
                autoFocus
              />
              
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                </div>
              )}
              
              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => addStop(result)}
                      className="w-full text-left p-2 hover:bg-white/10 rounded-lg text-white text-sm truncate"
                    >
                      {result.name}
                    </button>
                  ))}
                </div>
              )}
              
              <button
                onClick={() => { setShowAddStop(false); setSearchQuery(''); setSearchResults([]) }}
                className="w-full mt-2 text-white/40 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleStartRoute}
          disabled={!canStartRoute || isLoading}
          className="w-full bg-cyan-500 text-white font-semibold py-3 rounded-xl disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Planning route...</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Preview Route
            </>
          )}
        </button>
      </div>
    </div>
  )
}
