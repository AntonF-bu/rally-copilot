import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Racing HUD Bottom Bar
// ================================

export default function BottomBar() {
  const { 
    isRunning, 
    mode, 
    setMode, 
    startDrive, 
    stopDrive, 
    toggleSettings, 
    speed, 
    settings,
    routeMode,
    resetToRouteSelector
  } = useStore()
  const { test: testVoice } = useSpeech()

  const modes = [
    { id: 'cruise', label: 'CRUISE', color: '#00d4ff' },
    { id: 'fast', label: 'FAST', color: '#ffd500' },
    { id: 'race', label: 'RACE', color: '#ff3366' },
  ]

  const currentMode = modes.find(m => m.id === mode) || modes[0]
  const displaySpeed = settings?.speedUnit === 'kmh' ? Math.round((speed || 0) * 1.609) : Math.round(speed || 0)

  // Get status text based on mode
  const getStatusText = () => {
    switch (routeMode) {
      case 'demo': return 'DEMO MODE'
      case 'destination': return 'NAVIGATING'
      case 'lookahead': return 'LOOK-AHEAD'
      case 'imported': return 'IMPORTED ROUTE'
      default: return 'ACTIVE'
    }
  }

  // Handle stop - go back to menu
  const handleStop = () => {
    stopDrive()
    resetToRouteSelector()
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 p-3 safe-bottom z-20 pointer-events-none">
      
      {/* Speed Display */}
      {isRunning && (
        <div className="flex justify-center mb-3 pointer-events-none">
          <div className="hud-glass rounded-2xl px-6 py-3 flex items-baseline gap-2">
            <span 
              className="text-5xl font-bold tracking-tighter"
              style={{ 
                fontFamily: 'SF Pro Display, -apple-system, system-ui',
                color: currentMode.color,
                textShadow: `0 0 40px ${currentMode.color}40`
              }}
            >
              {displaySpeed}
            </span>
            <span className="text-sm font-semibold text-white/30 tracking-wider">
              {(settings?.speedUnit || 'mph').toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Mode Selector */}
      <div className="flex justify-center mb-3 pointer-events-auto">
        <div className="hud-glass rounded-2xl p-1.5 flex gap-1">
          {modes.map(m => {
            const isActive = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="relative px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-200"
                style={{ 
                  fontFamily: 'SF Pro Text, -apple-system, system-ui',
                  color: isActive ? (m.id === 'race' ? '#fff' : '#000') : 'rgba(255,255,255,0.35)',
                  background: isActive 
                    ? `linear-gradient(135deg, ${m.color}, ${m.color}dd)`
                    : 'transparent',
                  boxShadow: isActive 
                    ? `0 4px 20px ${m.color}50, inset 0 1px 0 rgba(255,255,255,0.2)` 
                    : 'none'
                }}
              >
                {m.label}
                {isActive && (
                  <div 
                    className="absolute inset-0 rounded-xl opacity-50 blur-xl -z-10"
                    style={{ background: m.color }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex gap-2 pointer-events-auto">
        
        {/* Back to Menu Button */}
        <button
          onClick={handleStop}
          className="hud-glass w-14 h-14 flex items-center justify-center rounded-2xl hover:bg-white/[0.08] active:scale-95 transition-all duration-200 group"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white/40 group-hover:text-white/60 transition-colors">
            <path d="M19 12H5m0 0l7 7m-7-7l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Start/Stop Button */}
        <button
          onClick={isRunning ? stopDrive : startDrive}
          className="flex-1 h-14 rounded-2xl font-semibold text-sm tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98]"
          style={{ 
            fontFamily: 'SF Pro Text, -apple-system, system-ui',
            background: isRunning 
              ? 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(185,28,28,0.9))' 
              : 'linear-gradient(135deg, rgba(34,197,94,0.9), rgba(22,163,74,0.9))',
            boxShadow: isRunning
              ? '0 4px 25px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
              : '0 4px 25px rgba(34,197,94,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
            border: `1px solid ${isRunning ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
          }}
        >
          {isRunning ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
              <span>STOP</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>START</span>
            </>
          )}
        </button>
        
        {/* Voice Button */}
        <button
          onClick={testVoice}
          className="hud-glass w-14 h-14 flex items-center justify-center rounded-2xl hover:bg-white/[0.08] active:scale-95 transition-all duration-200 group"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white/40 group-hover:text-white/60 transition-colors">
            <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Settings Button */}
        <button
          onClick={toggleSettings}
          className="hud-glass w-14 h-14 flex items-center justify-center rounded-2xl hover:bg-white/[0.08] active:scale-95 transition-all duration-200 group"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white/40 group-hover:text-white/60 transition-colors">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Status */}
      {isRunning && (
        <div className="flex justify-center mt-3 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03]">
            <div className="relative">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-[10px] font-semibold text-white/30 tracking-widest" style={{ fontFamily: 'SF Pro Text, -apple-system, system-ui' }}>
              {getStatusText()}
            </span>
          </div>
        </div>
      )}

      <style>{`
        .hud-glass {
          background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  )
}
