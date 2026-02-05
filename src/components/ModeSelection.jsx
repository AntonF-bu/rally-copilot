import { useState } from 'react'
import useHighwayStore from '../services/highwayStore'
import { HIGHWAY_MODE } from '../services/highwayModeService'

// ================================
// Mode Selection Screen
// Shown after address selection, before loading
// ================================

export default function ModeSelection({ routeData, onSelect, onBack }) {
  const { setHighwayMode } = useHighwayStore()
  const [selected, setSelected] = useState(null)
  
  // Calculate estimated load time based on route length
  const routeMiles = routeData?.distance ? routeData.distance / 1609.34 : 0
  const basicTime = Math.max(15, Math.round(routeMiles * 0.3)) // ~15-30 sec
  const companionTime = Math.max(60, Math.round(routeMiles * 1.5)) // ~1-3 min
  
  const formatTime = (seconds) => {
    if (seconds < 60) return `~${seconds} sec`
    const mins = Math.round(seconds / 60)
    return `~${mins} min`
  }

  const handleSelect = (mode) => {
    setSelected(mode)
    setHighwayMode(mode)
    
    // Small delay for visual feedback
    setTimeout(() => {
      onSelect(mode)
    }, 300)
  }

  return (
    <div className="absolute inset-0 bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button 
          onClick={onBack}
          className="text-white/60 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div className="text-white/40 text-sm">
          {routeMiles.toFixed(0)} miles
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-light text-white mb-2">
          Choose Your Co-Driver
        </h1>
        <p className="text-white/50 text-sm mb-8 text-center max-w-md">
          Both modes include curve warnings, zone transitions, and sweeper callouts
        </p>

        {/* Mode Cards */}
        <div className="flex gap-4 w-full max-w-lg">
          {/* Basic Mode */}
          <button
            onClick={() => handleSelect(HIGHWAY_MODE.BASIC)}
            className={`flex-1 p-6 rounded-2xl border-2 transition-all duration-200 ${
              selected === HIGHWAY_MODE.BASIC
                ? 'border-cyan-400 bg-cyan-400/10 scale-[1.02]'
                : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
            }`}
          >
            <div className="text-4xl mb-3">🎯</div>
            <h2 className="text-xl font-medium text-white mb-1">Basic</h2>
            <p className="text-white/50 text-sm mb-4">
              Professional co-driver
            </p>
            
            <div className="space-y-2 text-left mb-4">
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Curve warnings
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Zone transitions
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Highway sweepers
              </div>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <span className="text-white/30">○</span> Witty commentary
              </div>
            </div>
            
            <div className="pt-3 border-t border-white/10">
              <div className="text-cyan-400 font-medium">{formatTime(basicTime)}</div>
              <div className="text-white/40 text-xs">load time</div>
            </div>
          </button>

          {/* Companion Mode */}
          <button
            onClick={() => handleSelect(HIGHWAY_MODE.COMPANION)}
            className={`flex-1 p-6 rounded-2xl border-2 transition-all duration-200 ${
              selected === HIGHWAY_MODE.COMPANION
                ? 'border-amber-400 bg-amber-400/10 scale-[1.02]'
                : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
            }`}
          >
            <div className="text-4xl mb-3">🎙️</div>
            <h2 className="text-xl font-medium text-white mb-1">Companion</h2>
            <p className="text-white/50 text-sm mb-4">
              Jeremy Clarkson style
            </p>
            
            <div className="space-y-2 text-left mb-4">
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Curve warnings
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Zone transitions
              </div>
              <div className="flex items-center gap-2 text-white/70 text-sm">
                <span className="text-green-400">✓</span> Highway sweepers
              </div>
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <span className="text-amber-400">✓</span> Witty commentary
              </div>
            </div>
            
            <div className="pt-3 border-t border-white/10">
              <div className="text-amber-400 font-medium">{formatTime(companionTime)}</div>
              <div className="text-white/40 text-xs">load time</div>
            </div>
          </button>
        </div>

        {/* Info Text */}
        <p className="text-white/30 text-xs mt-8 text-center max-w-md">
          Companion mode generates personalized commentary for highway sections.
          Longer routes take more time to prepare.
        </p>
      </div>

      {/* Route Summary Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div className="text-white font-medium truncate max-w-[200px]">
              {routeData?.name || 'Your Route'}
            </div>
            <div className="text-white/50 text-sm">
              {routeMiles.toFixed(1)} miles • {Math.round((routeData?.duration || 0) / 60)} min
            </div>
          </div>
          <div className="text-right text-white/40 text-sm">
            {routeData?.curves?.length || '?'} curves detected
          </div>
        </div>
      </div>
    </div>
  )
}
