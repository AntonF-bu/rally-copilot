import React, { useState } from 'react'
import { getCurveColor } from '../../../data/routes'

/**
 * Modal showing list of all curves and highway bends
 */
export function CurveListModal({
  curves = [],
  highwayBends = [],
  mode,
  settings,
  onSelect,
  onSelectBend,
  onClose
}) {
  const [showTab, setShowTab] = useState('curves')

  const getSpd = (s) => {
    const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
    const m = { cruise: 1, fast: 1.15, race: 1.3 }
    let v = Math.round((b[s] || 40) * (m[mode] || 1))
    return settings.units === 'metric' ? Math.round(v * 1.6) : v
  }

  return (
    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 pt-12 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">{curves.length} Curves</h2>
          {highwayBends.length > 0 && (
            <div className="flex bg-white/10 rounded-full p-0.5">
              <button
                onClick={() => setShowTab('curves')}
                className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'curves' ? 'bg-white/20 text-white' : 'text-white/50'}`}
              >
                Curves
              </button>
              <button
                onClick={() => setShowTab('highway')}
                className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'highway' ? 'bg-blue-500/30 text-blue-400' : 'text-white/50'}`}
              >
                Highway ({highwayBends.length})
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-2">
        {showTab === 'curves' ? (
          curves.map((curve, i) => (
            <button
              key={curve.id || i}
              onClick={() => onSelect(curve)}
              className="w-full p-3 mb-1 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-3"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: getCurveColor(curve.severity), color: '#000' }}
              >
                {curve.severity}
              </div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">
                  {curve.isChicane ? `${curve.chicaneType} ${curve.startDirection}` : `${curve.direction} ${curve.severity}`}
                  {curve.modifier && <span className="text-white/50 ml-1">{curve.modifier}</span>}
                </div>
                <div className="text-white/40 text-xs">
                  {((curve.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-white/80 text-sm font-mono">{getSpd(curve.severity)}</div>
                <div className="text-white/40 text-[10px]">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
              </div>
            </button>
          ))
        ) : (
          highwayBends.map((bend, i) => (
            <button
              key={bend.id || i}
              onClick={() => onSelectBend(bend)}
              className={`w-full p-3 mb-1 rounded-lg flex items-center gap-3 border ${
                bend.isSection
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20'
                  : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: bend.isSection ? '#f59e0b' : '#3b82f6', color: '#fff' }}
              >
                {bend.isSection ? bend.bendCount : bend.isSSweep ? 'S' : 'SW'}
              </div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">
                  {bend.isSection
                    ? `Active Section: ${bend.bendCount} bends`
                    : bend.isSSweep
                      ? `S-Sweep: ${bend.firstBend.direction} ${bend.firstBend.angle}° → ${bend.secondBend.direction} ${bend.secondBend.angle}°`
                      : `${bend.direction} ${bend.angle}°`
                  }
                </div>
                <div className="text-white/40 text-xs">
                  {((bend.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-mono ${bend.isSection ? 'text-amber-400' : 'text-blue-400'}`}>
                  {bend.optimalSpeed || 70}
                </div>
                <div className="text-white/40 text-[10px]">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default CurveListModal
