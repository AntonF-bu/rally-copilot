import React from 'react'
import { getCurveColor } from '../../../data/routes'

/**
 * Popup showing details for a selected curve or callout
 */
export function CurvePopupModal({
  curve,
  mode,
  settings,
  onClose
}) {
  if (!curve) return null

  const getSpd = (s) => {
    const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
    const m = { cruise: 1, fast: 1.15, race: 1.3 }
    let v = Math.round((b[s] || 40) * (m[mode] || 1))
    return settings.units === 'metric' ? Math.round(v * 1.6) : v
  }

  const isCurated = curve.isCuratedCallout || curve.isLLMCurated || curve.isFlowBased

  // Curated callout popup
  if (isCurated) {
    const colors = {
      danger: '#ef4444',
      significant: '#f59e0b',
      sweeper: '#3b82f6',
      wake_up: '#10b981',
      section: '#8b5cf6',
      sequence: '#ec4899'
    }
    const color = colors[curve.type] || '#3b82f6'

    return (
      <div
        className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-black/90 rounded-xl p-4 border border-white/20 min-w-[280px] max-w-[340px]"
        style={{ borderColor: `${color}40` }}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: color, color: '#fff' }}
          >
            {curve.type === 'wake_up' ? '!' : curve.type === 'sequence' ? 'S' : curve.type?.[0]?.toUpperCase() || '•'}
          </div>
          <div>
            <div className="text-white font-bold text-sm">{curve.text || 'Callout'}</div>
            <div className="text-white/50 text-xs">
              Mile {curve.triggerMile?.toFixed(1) || '?'} • {curve.type || 'info'}
            </div>
          </div>
        </div>

        {curve.reason && (
          <div className="mb-3 p-2 bg-white/5 rounded-lg border border-white/10">
            <div className="text-[10px] text-white/40 mb-1">WHY</div>
            <div className="text-white/80 text-xs leading-relaxed">{curve.reason}</div>
          </div>
        )}

        <div className="flex justify-between text-sm border-t border-white/10 pt-2">
          <span className="text-white/50">Target</span>
          <span className="text-white font-mono">
            {curve.type === 'danger' ? getSpd(5) : curve.type === 'significant' ? getSpd(4) : getSpd(3)}{' '}
            {settings.units === 'metric' ? 'km/h' : 'mph'}
          </span>
        </div>
      </div>
    )
  }

  // Standard curve/highway bend popup
  const color = curve.isSection
    ? '#f59e0b'
    : curve.isHighwayBend
      ? '#3b82f6'
      : getCurveColor(curve.severity)

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-black/90 rounded-xl p-4 border border-white/20 min-w-[280px] max-w-[340px]">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ background: color, color: '#fff' }}
        >
          {curve.isSection ? curve.bendCount : curve.isSSweep ? 'S' : curve.isHighwayBend ? 'SW' : curve.severity}
        </div>
        <div>
          <div className="text-white font-bold">
            {curve.isSection
              ? 'Active Section'
              : curve.isSSweep
                ? 'S-Sweep'
                : curve.isHighwayBend
                  ? `${curve.direction} Sweep`
                  : `${curve.direction} ${curve.severity}`
            }
          </div>
          {curve.angle && (
            <div className="text-white/50 text-sm">
              {curve.angle}°{curve.length ? ` • ${curve.length}m` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
        <span className="text-white/50">Target</span>
        <span className="text-white font-mono">
          {curve.optimalSpeed || getSpd(curve.severity)} {settings.units === 'metric' ? 'km/h' : 'mph'}
        </span>
      </div>
    </div>
  )
}

export default CurvePopupModal
