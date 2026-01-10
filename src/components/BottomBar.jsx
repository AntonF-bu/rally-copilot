import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Bottom Bar - Premium Minimal Design
// ================================

export default function BottomBar() {
  const { isRunning, mode, setMode, startDrive, stopDrive, toggleSettings } = useStore()
  const { test: testVoice } = useSpeech()

  const modes = [
    { id: 'cruise', label: 'C', color: '#00d4ff' },
    { id: 'fast', label: 'F', color: '#ffd500' },
    { id: 'race', label: 'R', color: '#ff3366' },
  ]

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom z-20 pointer-events-none">
      {/* Mode selector */}
      <div className="flex justify-center mb-3 pointer-events-auto">
        <div className="flex bg-black/60 backdrop-blur-sm rounded-lg p-1 border border-white/[0.06]">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="relative w-10 h-8 rounded-md text-xs font-semibold transition-all"
              style={{ 
                fontFamily: '-apple-system, system-ui',
                color: mode === m.id ? m.color : 'rgba(255,255,255,0.3)',
                background: mode === m.id ? `${m.color}15` : 'transparent'
              }}
            >
              {m.label}
              {mode === m.id && (
                <div 
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full"
                  style={{ background: m.color }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main controls */}
      <div className="flex gap-2 pointer-events-auto">
        {/* Start/Stop button */}
        <button
          onClick={isRunning ? stopDrive : startDrive}
          className="flex-1 h-12 rounded-xl font-medium text-sm tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ 
            fontFamily: '-apple-system, system-ui',
            background: isRunning 
              ? 'linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))' 
              : 'linear-gradient(135deg, rgba(34,197,94,0.9), rgba(22,163,74,0.9))',
            border: `1px solid ${isRunning ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
          }}
        >
          {isRunning ? (
            <>
              <div className="w-2.5 h-2.5 bg-white rounded-sm" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>Start</span>
            </>
          )}
        </button>
        
        {/* Voice test */}
        <button
          onClick={testVoice}
          className="w-12 h-12 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl border border-white/[0.06] hover:bg-white/10 active:scale-95 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
            <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={toggleSettings}
          className="w-12 h-12 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl border border-white/[0.06] hover:bg-white/10 active:scale-95 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Status */}
      {isRunning && (
        <div className="flex justify-center mt-2.5 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[10px] text-white/30 font-medium tracking-wide">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>DEMO MODE</span>
          </div>
        </div>
      )}
    </div>
  )
}
