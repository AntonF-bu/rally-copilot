import { useState, useEffect } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'
import { geocodeAddress } from '../services/routeService'

export default function RouteSelector() {
  const { setRouteMode, setShowRouteSelector, setShowRoutePreview, startDrive, position, setPosition, clearRouteData } = useStore()
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
        (pos) => { setPosition([pos.coords.longitude, pos.coords.latitude]); setHasLocation(true) },
        () => setHasLocation(false),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [setPosition])

  useEffect(() => {
    if (!destination || destination.length < 3) { setSearchResults([]); return }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const results = await geocodeAddress(destination)
      setSearchResults(results || [])
      setIsSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [destination])

  const handleSelectDestination = async (dest) => {
    setError(null); setIsLoading(true)
    if (!hasLocation) { setError('Cannot get your current location.'); setIsLoading(false); return }
    try {
      clearRouteData(); setRouteMode('destination')
      const success = await initDestinationRoute(dest.name)
      if (success) { setShowDestination(false); setShowRouteSelector(false); setShowRoutePreview(true) }
      else setError('Could not find route.')
    } catch (err) { setError('Error getting route.') }
    finally { setIsLoading(false) }
  }

  const handleLookAhead = () => {
    if (!hasLocation) { setError('Cannot get your current location.'); return }
    clearRouteData(); setRouteMode('lookahead'); setShowRouteSelector(false); startDrive()
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    setError(null); setIsLoading(true)
    try {
      clearRouteData(); setRouteMode('imported')
      const result = await initImportedRoute(importUrl)
      if (result === true) { setShowImport(false); setShowRouteSelector(false); setShowRoutePreview(true) }
      else if (result?.error === 'SHORT_URL') setError(result.message)
      else setError('Could not parse route.')
    } catch (err) { setError('Error importing route.') }
    finally { setIsLoading(false) }
  }

  const handleDemo = async () => { 
    clearRouteData()
    setRouteMode('demo')
    // Go to preview first so route loads properly
    setShowRouteSelector(false)
    setShowRoutePreview(true)
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      <div className="p-6 pt-12 safe-top">
        <h1 className="text-3xl font-bold text-white tracking-tight">Rally Co-Pilot</h1>
        <p className="text-white/40 text-sm mt-1">{hasLocation ? '📍 Location ready' : '⏳ Getting location...'}</p>
      </div>

      {error && <div className="mx-4 mb-2 p-3 bg-red-500/20 border border-red-500/30 rounded-xl"><p className="text-red-400 text-sm">{error}</p></div>}

      <div className="flex-1 px-4 pb-4 flex flex-col gap-3 overflow-auto">
        <RouteOption onClick={() => setShowDestination(true)} disabled={!hasLocation} icon="📍" color="#00d4ff" title="Set Destination" desc="Enter address, get full route analysis" />
        <RouteOption onClick={handleLookAhead} disabled={!hasLocation} icon="🎯" color="#ffd500" title="Look-Ahead Mode" desc="Analyze road ahead as you drive" />
        <RouteOption onClick={() => setShowImport(true)} icon="📤" color="#a855f7" title="Import Route" desc="Paste Google Maps link" />
        <div className="flex items-center gap-3 py-2"><div className="flex-1 h-px bg-white/10"/><span className="text-white/20 text-xs tracking-wider">OR TRY</span><div className="flex-1 h-px bg-white/10"/></div>
        <RouteOption onClick={handleDemo} icon="▶️" color="#666" title="Demo Mode" desc="Mohawk Trail simulation" dashed />
      </div>

      {showDestination && <SearchModal title="Set Destination" value={destination} onChange={setDestination} results={searchResults}
        isSearching={isSearching} isLoading={isLoading} onSelect={handleSelectDestination} onClose={() => setShowDestination(false)} color="cyan" />}

      {showImport && <ImportModal value={importUrl} onChange={setImportUrl} isLoading={isLoading} onImport={handleImport} onClose={() => setShowImport(false)} />}
    </div>
  )
}

function RouteOption({ onClick, disabled, icon, color, title, desc, dashed }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`p-4 flex items-center gap-4 active:scale-[0.98] transition-transform disabled:opacity-50 ${dashed ? 'border-dashed' : ''}`}
      style={{ background: 'linear-gradient(135deg, rgba(20,20,28,0.9), rgba(15,15,22,0.95))', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="flex-1 text-left">
        <div className="text-white font-semibold">{title}</div>
        <div className="text-white/40 text-sm">{desc}</div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  )
}

function SearchModal({ title, value, onChange, results, isSearching, isLoading, onSelect, onClose, color }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <button onClick={onClose} className="text-white/40 p-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Enter address or place..."
          className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-${color}-500/50`} autoFocus />
        <div className="flex-1 overflow-auto mt-3">
          {isSearching && <div className="text-white/40 text-sm text-center py-4">Searching...</div>}
          {!isSearching && results.length > 0 && <div className="space-y-2">
            {results.map((result, idx) => (
              <button key={idx} onClick={() => onSelect(result)} disabled={isLoading}
                className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50">
                <div className="text-white text-sm">{result.name}</div>
              </button>
            ))}
          </div>}
          {!isSearching && value.length >= 3 && results.length === 0 && <div className="text-white/40 text-sm text-center py-4">No results found</div>}
        </div>
        {isLoading && <div className="flex items-center justify-center gap-2 py-4">
          <div className={`w-5 h-5 border-2 border-${color}-500/30 border-t-${color}-500 rounded-full animate-spin`} />
          <span className="text-white/40 text-sm">Getting route...</span>
        </div>}
      </div>
    </div>
  )
}

function ImportModal({ value, onChange, isLoading, onImport, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col">
      <div className="flex-1" onClick={onClose} />
      <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Import Route</h2>
          <button onClick={onClose} className="text-white/40 p-2"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-3">
          <p className="text-yellow-400/80 text-xs"><strong>How to get the URL:</strong><br/>1. Open Google Maps and create your route<br/>2. Click Share → Copy link<br/>3. Open the link in your browser<br/>4. Copy the full URL from the address bar</p>
        </div>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste the full Google Maps URL..."
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 text-sm" autoFocus />
        <button onClick={onImport} disabled={!value.trim() || isLoading}
          className="w-full mt-3 bg-purple-500 text-white font-semibold py-3 rounded-xl disabled:opacity-30 flex items-center justify-center gap-2">
          {isLoading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Importing...</span></> : 'Import Route'}
        </button>
      </div>
    </div>
  )
}
