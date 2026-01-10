import { useState } from 'react'
import useStore from '../store'

// ================================
// Route Selection Screen
// ================================

export default function RouteSelector({ onStartRoute }) {
  const { setRouteMode } = useStore()
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [showDestination, setShowDestination] = useState(false)
  const [destination, setDestination] = useState('')

  const handleDestination = () => {
    if (!destination.trim()) return
    setRouteMode('destination')
    onStartRoute({ type: 'destination', query: destination })
  }

  const handleLookAhead = () => {
    setRouteMode('lookahead')
    onStartRoute({ type: 'lookahead' })
  }

  const handleImport = () => {
    if (!importUrl.trim()) return
    setRouteMode('imported')
    onStartRoute({ type: 'import', url: importUrl })
  }

  const handleDemo = () => {
    setRouteMode('demo')
    onStartRoute({ type: 'demo' })
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      
      {/* Header */}
      <div className="p-6 pt-12 safe-top">
        <h1 
          className="text-3xl font-bold text-white tracking-tight"
          style={{ fontFamily: 'SF Pro Display, -apple-system, system-ui' }}
        >
          Rally Co-Pilot
        </h1>
        <p className="text-white/40 text-sm mt-1">Choose how to start</p>
      </div>

      {/* Main Options */}
      <div className="flex-1 px-4 pb-4 flex flex-col gap-3">
        
        {/* Set Destination */}
        <button
          onClick={() => setShowDestination(true)}
          className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
              <circle cx="12" cy="10" r="3"/>
              <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
            </svg>
          </div>
          <div className="flex-1 text-left">
            <div className="text-white font-semibold">Set Destination</div>
            <div className="text-white/40 text-sm">Enter address, get full route analysis</div>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/20">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>

        {/* Look-Ahead Mode */}
        <button
          onClick={handleLookAhead}
          className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffd500" strokeWidth="2">
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
              <circle cx="12" cy="12" r="6"/>
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

        {/* Import Route */}
        <button
          onClick={() => setShowImport(true)}
          className="hud-card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
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

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-white/10"/>
          <span className="text-white/20 text-xs tracking-wider">OR TRY</span>
          <div className="flex-1 h-px bg-white/10"/>
        </div>

        {/* Demo Mode */}
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
            <div className="text-white/30 text-sm">Mohawk Trail simulation</div>
          </div>
        </button>

        {/* Recent Routes */}
        <div className="mt-4">
          <h3 className="text-white/30 text-xs font-semibold tracking-wider mb-2 px-1">RECENT ROUTES</h3>
          <div className="hud-card p-3 opacity-50">
            <p className="text-white/30 text-sm text-center">No recent routes</p>
          </div>
        </div>
      </div>

      {/* Destination Modal */}
      {showDestination && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Set Destination</h2>
              <button onClick={() => setShowDestination(false)} className="text-white/40 p-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
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
            <button
              onClick={handleDestination}
              disabled={!destination.trim()}
              className="w-full mt-3 bg-cyan-500 text-black font-semibold py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Get Route
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end">
          <div className="w-full bg-[#12121a] rounded-t-3xl p-4 pb-8 safe-bottom">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-lg">Import Route</h2>
              <button onClick={() => setShowImport(false)} className="text-white/40 p-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <p className="text-white/40 text-sm mb-3">
              Open Google Maps → Plan a route → Share → Copy link
            </p>
            <input
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste Google Maps link..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
              autoFocus
            />
            <button
              onClick={handleImport}
              disabled={!importUrl.trim()}
              className="w-full mt-3 bg-purple-500 text-white font-semibold py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Import Route
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
        .hud-card:hover {
          border-color: rgba(255,255,255,0.1);
        }
        .border-dashed {
          border-style: dashed;
        }
      `}</style>
    </div>
  )
}
