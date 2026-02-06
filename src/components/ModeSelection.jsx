import { useState } from 'react'
import useHighwayStore from '../services/highwayStore'
import { HIGHWAY_MODE } from '../services/highwayModeService'

// ================================
// Mode Selection Screen
// Shown after address selection, before loading
// Tramo Brand Design
// ================================

// Simple SVG icons to replace emojis
const CrosshairIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8622C" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
  </svg>
)

const WaveformIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2">
    <path d="M4 12h2v4H4zm4-4h2v12H8zm4-4h2v16h-2zm4 4h2v8h-2zm4 2h2v4h-2z" />
  </svg>
)

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
    <div className="absolute inset-0 flex flex-col" style={{ background: 'rgba(10,10,15,0.85)' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
          </svg>
          Back
        </button>
        <div style={{ fontFamily: "'DM Sans', sans-serif", color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
          {routeMiles.toFixed(0)} miles
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 600,
          fontSize: '24px',
          color: 'white',
          marginBottom: '8px'
        }}>
          Choose Your Co-Driver
        </h1>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 400,
          color: 'rgba(255,255,255,0.5)',
          fontSize: '14px',
          marginBottom: '32px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          Both modes include curve warnings, zone transitions, and sweeper callouts
        </p>

        {/* Mode Cards */}
        <div className="flex gap-4 w-full max-w-lg">
          {/* Basic Mode */}
          <button
            onClick={() => handleSelect(HIGHWAY_MODE.BASIC)}
            className="flex-1 p-6 rounded-2xl border-2 transition-all duration-200"
            style={{
              borderColor: selected === HIGHWAY_MODE.BASIC ? '#E8622C' : 'rgba(255,255,255,0.2)',
              background: selected === HIGHWAY_MODE.BASIC ? 'rgba(232,98,44,0.1)' : 'rgba(255,255,255,0.05)',
              transform: selected === HIGHWAY_MODE.BASIC ? 'scale(1.02)' : 'scale(1)',
              boxShadow: selected === HIGHWAY_MODE.BASIC ? '0 0 30px rgba(232,98,44,0.3)' : 'none'
            }}
          >
            <div className="mb-3 flex justify-center">
              <CrosshairIcon />
            </div>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: '20px', color: 'white', marginBottom: '4px' }}>
              Basic
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '16px' }}>
              Professional co-driver
            </p>

            <div className="space-y-2 text-left mb-4">
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Curve warnings
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Zone transitions
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Highway sweepers
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>○</span> Witty commentary
              </div>
            </div>

            <div className="pt-3 border-t border-white/10">
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: '#E8622C' }}>{formatTime(basicTime)}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>load time</div>
            </div>
          </button>

          {/* Companion Mode */}
          <button
            onClick={() => handleSelect(HIGHWAY_MODE.COMPANION)}
            className="flex-1 p-6 rounded-2xl border-2 transition-all duration-200"
            style={{
              borderColor: selected === HIGHWAY_MODE.COMPANION ? '#FBBF24' : 'rgba(255,255,255,0.2)',
              background: selected === HIGHWAY_MODE.COMPANION ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.05)',
              transform: selected === HIGHWAY_MODE.COMPANION ? 'scale(1.02)' : 'scale(1)',
              boxShadow: selected === HIGHWAY_MODE.COMPANION ? '0 0 30px rgba(251,191,36,0.3)' : 'none'
            }}
          >
            <div className="mb-3 flex justify-center">
              <WaveformIcon />
            </div>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: '20px', color: 'white', marginBottom: '4px' }}>
              Companion
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 400, color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '16px' }}>
              Jeremy Clarkson style
            </p>

            <div className="space-y-2 text-left mb-4">
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Curve warnings
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Zone transitions
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Highway sweepers
              </div>
              <div className="flex items-center gap-2" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#FBBF24' }}>
                <span style={{ color: '#FBBF24' }}>✓</span> Witty commentary
              </div>
            </div>

            <div className="pt-3 border-t border-white/10">
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: '#FBBF24' }}>{formatTime(companionTime)}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>load time</div>
            </div>
          </button>
        </div>

        {/* Info Text */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '32px', textAlign: 'center', maxWidth: '400px' }}>
          Companion mode generates personalized commentary for highway sections.
          Longer routes take more time to prepare.
        </p>
      </div>

      {/* Route Summary Footer */}
      <div className="p-4 border-t border-white/10 bg-white/5">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, color: 'white', maxWidth: '200px' }} className="truncate">
              {routeData?.name || 'Your Route'}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              {routeMiles.toFixed(1)} mi • {Math.round((routeData?.duration || 0) / 60)} min
            </div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            {routeData?.curves?.length || '?'} curves detected
          </div>
        </div>
      </div>
    </div>
  )
}
