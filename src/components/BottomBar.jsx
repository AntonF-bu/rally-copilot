import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Bottom Bar - Minimal Controls
// Stays out of the way of the map
// ================================

export default function BottomBar() {
  const {
    isRunning,
    mode,
    setMode,
    startDrive,
    stopDrive,
    toggleSettings
  } = useStore()

  const { test: testVoice } = useSpeech()

  const modes = [
    { id: 'cruise', icon: '🛣️', color: '#00d4ff' },
    { id: 'fast', icon: '🏁', color: '#ffd500' },
    { id: 'race', icon: '🔥', color: '#ff3366' },
  ]

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom z-20 pointer-events-none">
      {/* Mode Selector - Pill style */}
      <div className="flex justify-center mb-3 pointer-events-auto">
        <div className="bg-black/70 backdrop-blur-xl rounded-full p-1.5 flex gap-1 border border-white/10">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`w-12 h-10 rounded-full text-lg transition-all ${
                mode === m.id 
                  ? 'bg-white/20 scale-110' 
                  : 'opacity-50 hover:opacity-80'
              }`}
            >
              {m.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex gap-3 pointer-events-auto">
        <button
          onClick={isRunning ? stopDrive : startDrive}
          className={`flex-1 py-4 rounded-2xl font-bold text-base tracking-wider transition-all flex items-center justify-center gap-2 border ${
            isRunning 
              ? 'bg-red-500/80 border-red-400/30 hover:bg-red-500' 
              : 'bg-green-500/80 border-green-400/30 hover:bg-green-500'
          }`}
          style={{ backdropFilter: 'blur(20px)' }}
        >
          {isRunning ? (
            <>
              <span className="w-3 h-3 bg-white rounded-sm" />
              STOP
            </>
          ) : (
            <>
              <span className="text-xl">▶</span>
              START
            </>
          )}
        </button>
        
        <button
          onClick={testVoice}
          className="px-4 py-4 rounded-2xl bg-black/70 backdrop-blur-xl hover:bg-black/90 transition-colors border border-white/10"
          title="Test Voice"
        >
          🔊
        </button>

        <button
          onClick={toggleSettings}
          className="px-4 py-4 rounded-2xl bg-black/70 backdrop-blur-xl hover:bg-black/90 transition-colors border border-white/10"
        >
          ⚙️
        </button>
      </div>

      {/* Status indicator when running */}
      {isRunning && (
        <div className="flex justify-center mt-3 pointer-events-auto">
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-black/50 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Mohawk Trail Simulation</span>
          </div>
        </div>
      )}
    </div>
  )
}
