import useStore from '../store'

// ================================
// Bottom Bar - v5
// Uses goToMenu and goToPreview actions
// ================================

export default function BottomBar() {
  const {
    mode,
    setMode,
    toggleSettings,
    settings,
    updateSettings,
    gpsAccuracy,
    simulationProgress,
    routeData,
    routeMode,
    // Navigation actions
    goToMenu,
    goToPreview
  } = useStore()

  const modes = [
    { id: 'cruise', label: 'CRUISE', color: '#00d4ff' },
    { id: 'fast', label: 'FAST', color: '#ffd500' },
    { id: 'race', label: 'RACE', color: '#ff3366' },
  ]

  // Toggle voice on/off
  const handleToggleVoice = () => {
    updateSettings({ voiceEnabled: !settings.voiceEnabled })
  }

  // STOP - go to preview
  const handleStop = () => {
    console.log('STOP button clicked')
    goToPreview()
  }

  // BACK - go to menu
  const handleBack = () => {
    console.log('BACK button clicked')
    goToMenu()
  }

  // Calculate route progress
  const getRouteProgress = () => {
    if (!routeData?.distance) return null
    const progressPercent = Math.round(simulationProgress * 100)
    const distanceRemaining = ((1 - simulationProgress) * routeData.distance / 1609.34).toFixed(1)
    return { percent: progressPercent, remaining: distanceRemaining }
  }

  const progress = getRouteProgress()

  // GPS/Mode indicator
  const getGpsStatus = () => {
    if (routeMode === 'demo') return { color: '#ffd500', label: 'DEMO', accuracy: null }
    if (routeMode === 'lookahead') return { color: '#00d4ff', label: 'LIVE', accuracy: gpsAccuracy }
    if (!gpsAccuracy) return { color: '#22c55e', label: 'GPS', accuracy: null }
    if (gpsAccuracy <= 10) return { color: '#22c55e', label: 'GPS', accuracy: gpsAccuracy }
    if (gpsAccuracy <= 30) return { color: '#ffd500', label: 'GPS', accuracy: gpsAccuracy }
    return { color: '#ff3366', label: 'WEAK', accuracy: gpsAccuracy }
  }

  const gpsStatus = getGpsStatus()

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 safe-bottom">
      {/* Mode Selector */}
      <div className="flex justify-center mb-3">
        <div className="bg-black/60 backdrop-blur-xl rounded-full p-1 flex gap-1 border border-white/10">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-5 py-2 rounded-full text-xs font-bold tracking-wider transition-colors ${
                mode === m.id 
                  ? 'text-black' 
                  : 'text-white/40 hover:text-white/60'
              }`}
              style={{ 
                backgroundColor: mode === m.id ? m.color : 'transparent',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Controls Bar */}
      <div className="mx-3 mb-2">
        <div className="flex items-center gap-2">
          {/* Back Button - Goes to MENU */}
          <button
            onClick={handleBack}
            className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
            </svg>
          </button>

          {/* Stop Button - Goes to PREVIEW */}
          <button
            onClick={handleStop}
            className="flex-1 h-12 rounded-xl font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2 bg-red-500/90 hover:bg-red-500 active:scale-[0.98]"
          >
            <span className="w-3 h-3 bg-white rounded-sm" />
            STOP
          </button>

          {/* Voice Toggle Button */}
          <button
            onClick={handleToggleVoice}
            className={`w-12 h-12 rounded-xl backdrop-blur-xl border flex items-center justify-center transition-all active:scale-95 ${
              settings.voiceEnabled 
                ? 'bg-cyan-500/20 border-cyan-500/50' 
                : 'bg-black/60 border-white/10'
            }`}
          >
            {settings.voiceEnabled ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff3366" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={toggleSettings}
            className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="mx-3 mb-3">
        <div className="flex items-center justify-between px-3 py-2 bg-black/40 backdrop-blur rounded-xl">
          {/* GPS/Mode Status */}
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: gpsStatus.color }}
            />
            <span className="text-[10px] font-semibold tracking-wider" style={{ color: gpsStatus.color }}>
              {gpsStatus.label}
            </span>
            {gpsStatus.accuracy && (
              <span className="text-[10px] text-white/30">±{Math.round(gpsStatus.accuracy)}m</span>
            )}
          </div>

          {/* Navigating Status */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-semibold text-white/50 tracking-wider">NAVIGATING</span>
          </div>

          {/* Route Progress */}
          {progress && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">{progress.remaining} mi</span>
              <span className="text-[10px] font-semibold text-cyan-400">{progress.percent}%</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .safe-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>
    </div>
  )
}
