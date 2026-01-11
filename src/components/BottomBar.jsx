import { useState } from 'react'
import useStore from '../store'
import { useRouteAnalysis } from '../hooks/useRouteAnalysis'

// ================================
// Bottom Bar - Navigation Controls
// With manual reroute button
// ================================

export default function BottomBar() {
  const { 
    isRunning,
    mode, 
    setMode, 
    settings,
    updateSettings,
    toggleSettings,
    goToMenu,
    goToPreview,
    routeMode,
    gpsAccuracy
  } = useStore()
  
  const { reroute } = useRouteAnalysis()
  const [isRerouting, setIsRerouting] = useState(false)

  const modeColors = {
    cruise: '#00d4ff',
    fast: '#ffd500', 
    race: '#ff3366'
  }

  const handleStop = () => {
    console.log('STOP button clicked')
    goToPreview()
  }

  const handleBack = () => {
    console.log('BACK button clicked')
    goToMenu()
  }

  const handleReroute = async () => {
    if (isRerouting) return
    
    setIsRerouting(true)
    console.log('🔄 Manual reroute triggered')
    
    try {
      const success = await reroute()
      if (success) {
        console.log('✅ Reroute successful')
      } else {
        console.log('❌ Reroute failed')
      }
    } catch (err) {
      console.error('Reroute error:', err)
    } finally {
      setIsRerouting(false)
    }
  }

  // Only show reroute for destination/imported modes (not demo/lookahead)
  const showReroute = routeMode === 'destination' || routeMode === 'imported'

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 safe-bottom">
      {/* Mode Selector */}
      <div className="flex justify-center mb-2">
        <div className="inline-flex bg-black/60 backdrop-blur-xl rounded-full p-1 border border-white/10">
          {['cruise', 'fast', 'race'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-5 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all"
              style={{
                background: mode === m ? modeColors[m] : 'transparent',
                color: mode === m ? (m === 'fast' ? 'black' : 'white') : 'rgba(255,255,255,0.5)'
              }}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Controls */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2">
          {/* Back Button */}
          <button
            onClick={handleBack}
            className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
            </svg>
          </button>

          {/* Reroute Button - Only show when relevant */}
          {showReroute && (
            <button
              onClick={handleReroute}
              disabled={isRerouting}
              className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center disabled:opacity-50"
              title="Reroute"
            >
              {isRerouting ? (
                <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-9-9"/>
                  <polyline points="21 3 21 9 15 9"/>
                </svg>
              )}
            </button>
          )}

          {/* Stop Button */}
          <button
            onClick={handleStop}
            className="flex-1 h-12 rounded-xl bg-red-500/80 backdrop-blur-xl flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
            <span className="text-white font-bold text-sm tracking-wider">STOP</span>
          </button>

          {/* Voice Toggle */}
          <button
            onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
            className="w-12 h-12 rounded-xl backdrop-blur-xl border flex items-center justify-center transition-all"
            style={{
              background: settings.voiceEnabled ? 'rgba(0,212,255,0.2)' : 'rgba(0,0,0,0.6)',
              borderColor: settings.voiceEnabled ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'
            }}
          >
            {settings.voiceEnabled ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={toggleSettings}
            className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${gpsAccuracy && gpsAccuracy < 20 ? 'bg-green-500' : gpsAccuracy && gpsAccuracy < 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-white/50">GPS</span>
            {gpsAccuracy && <span className="text-white/30">±{Math.round(gpsAccuracy)}m</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-white/50">
              {routeMode === 'demo' ? 'DEMO' : 
               routeMode === 'lookahead' ? 'LOOK-AHEAD' : 
               'NAVIGATING'}
            </span>
          </div>
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
