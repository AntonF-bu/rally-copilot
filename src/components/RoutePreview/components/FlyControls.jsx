import React from 'react'

/**
 * Controls shown during fly-through animation
 */
export function FlyControls({
  isFlying,
  isPaused,
  flySpeed,
  onTogglePause,
  onStop,
  onSetSpeed
}) {
  if (!isFlying) return null

  return (
    <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ top: '200px' }}>
      <div className="flex items-center gap-2 bg-black/90 rounded-full px-3 py-2 border border-white/20 shadow-lg">
        {/* Pause/Play button */}
        <button
          onClick={onTogglePause}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20"
        >
          {isPaused ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          )}
        </button>

        {/* Speed controls */}
        <div className="flex items-center gap-1 border-l border-white/20 pl-2">
          {[0.5, 1, 2].map(s => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                flySpeed === s
                  ? 'bg-cyan-500 text-black'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Stop button */}
        <button
          onClick={onStop}
          className="w-9 h-9 rounded-full bg-red-500/30 flex items-center justify-center hover:bg-red-500/50 border-l border-white/20 ml-1"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#f87171">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default FlyControls
