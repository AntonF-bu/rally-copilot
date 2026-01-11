import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { geocodeAddress } from '../services/routeService'

// ================================
// Route Selection Screen
// Updated: Goes to Preview instead of Navigation
// ================================

export default function RouteSelector() {
  const { 
    setRouteMode, 
    setShowRouteSelector, 
    setShowRoutePreview,
    startDrive,
    position,
    setPosition,
    clearRouteData
  } = useStore()
  
  const { initDestinationRoute, initImportedRoute } = useRouteAnalysis()

  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [showDestination, setShowDestination] = useState(false)
  const [destination, setDestination] = useState('')
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

  // *** KEY CHANGE: Go to preview instead of starting navigation ***
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

  // Look-ahead starts immediately (no route to preview)
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

  // *** KEY CHANGE: Go to preview instead of starting navigation ***
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

  // Demo goes to preview first so route loads properly
  const handleDemo = () => {
    console.log('Demo clicked')
    clearRouteData()
    setRouteMode('demo')
    setShowRouteSelector(false)
    setShowRoutePreview(true)
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      <div className="p-6 pt-12 safe-top">
        <h1 className="text-3xl font-bold text-white tracking-tight">Rally Co-Pilot</h1>
        <p className="text-white/40 text-sm mt-1">
          {hasLocation ? '📍 Location ready' : '⏳ Getting location...'}
        </p>
      </div>

      {error && (
        <div className="mx-4 mb-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-auto">
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
            <div className="text-white/40 text-sm">Enter address, get full route analysis</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <button
          onClick={handleLookAhead}
          disabled={!hasLocation}
          className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffd500" strokeWidth="2">
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="6"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-white font-semibold">Look-Ahead Mode</div>
            <div className="text-white/40 text-sm">Analyze road ahead as you drive</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        <button
          onClick={() => setShowImport(true)}
          className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-white font-semibold">Import Route</div>
            <div className="text-white/40 text-sm">Paste Google Maps link</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20"><path d="M9 18l6-6-6-6"/></svg>
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-white/60 font-semibold">Demo Mode</div>
            <div className="text-white/30 text-sm">Boston → Weston simulation</div>
          </div>
        </button>
      </div>

      {showDestination && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
          <div className="flex-1" onClick={() => setShowDestination(false)} />
          <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Set Destination</h2>
              <button onClick={() => setShowDestination(false)} className="text-white/40 p-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter address or place..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
              autoFocus
            />
            <div className="flex-1 overflow-auto mt-3">
              {isSearching && <div className="text-white/40 text-sm text-center py-4">Searching...</div>}
              {!isSearching && searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectDestination(result)}
                      disabled={isLoading}
                      className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <div className="text-white text-sm">{result.name}</div>
                    </button>
                  ))}
                </div>
              )}
              {!isSearching && destination.length >= 3 && searchResults.length === 0 && (
                <div className="text-white/40 text-sm text-center py-4">No results found</div>
              )}
            </div>
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4">
                <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                <span className="text-white/40 text-sm">Getting route...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
          <div className="flex-1" onClick={() => setShowImport(false)} />
          <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Import Route</h2>
              <button onClick={() => setShowImport(false)} className="text-white/40 p-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-3">
              <p className="text-yellow-400/80 text-xs">
                <strong>How to get the URL:</strong><br/>
                1. Open Google Maps and create your route<br/>
                2. Click Share → Copy link<br/>
                3. Open the link in your browser<br/>
                4. Copy the full URL from the address bar
              </p>
            </div>
            <input
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste the full Google Maps URL..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 text-sm"
              autoFocus
            />
            <button
              onClick={handleImport}
              disabled={!importUrl.trim() || isLoading}
              className="w-full mt-3 bg-purple-500 text-white font-semibold py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Importing...</span></>
              ) : 'Import Route'}
            </button>
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
      `}</style>
    </div>
  )
}
