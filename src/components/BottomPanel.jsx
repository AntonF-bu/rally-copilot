import { useState } from 'react'
import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Bottom Panel - Controls & Info
// ================================

export default function BottomPanel() {
  const {
    isRunning,
    mode,
    settings,
    upcomingCurves,
    bottomPanelMinimized,
    startDrive,
    stopDrive,
    setMode,
    toggleBottomPanel,
    toggleSettings,
    getDisplaySpeed,
    getRecommendedSpeed
  } = useStore()

  const { test: testVoice, isReady: voiceReady } = useSpeech()
  const displaySpeed = getDisplaySpeed()

  const modes = [
    { id: 'cruise', name: 'Cruise', icon: '🛣️', color: '#00d4ff' },
    { id: 'fast', name: 'Fast', icon: '🏁', color: '#ffd500' },
    { id: 'race', name: 'Race', icon: '🔥', color: '#ff3366' },
  ]

  const currentMode = modes.find(m => m.id === mode)

  return (
    <div className={`bottom-panel ${bottomPanelMinimized ? 'minimized' : ''}`}>
      {/* Drag Handle */}
      <div 
        className="flex justify-center mb-3 cursor-pointer"
        onClick={toggleBottomPanel}
      >
        <div className="w-10 h-1 bg-white/20 rounded-full" />
      </div>

      {/* Minimized View */}
      {bottomPanelMinimized ? (
        <MinimizedView 
          isRunning={isRunning}
          mode={currentMode}
          onStart={startDrive}
          onStop={stopDrive}
        />
      ) : (
        <>
          {/* Mode Selector */}
          <div className="flex gap-2 mb-4">
            {modes.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm tracking-wider transition-all border ${
                  mode === m.id ? 'border-2' : 'border-white/10 opacity-50'
                }`}
                style={{ 
                  borderColor: mode === m.id ? m.color : undefined,
                  background: mode === m.id ? `${m.color}15` : 'transparent',
                  color: mode === m.id ? m.color : '#888'
                }}
              >
                {m.icon} {m.name.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <StatCard 
              value={displaySpeed} 
              label={settings.speedUnit.toUpperCase()} 
              color={currentMode?.color}
              pulse={isRunning}
            />
            <StatCard 
              value={upcomingCurves.length} 
              label="AHEAD" 
            />
            <StatCard 
              value={upcomingCurves[0]?.distance || '—'} 
              label="METERS" 
            />
          </div>

          {/* Upcoming Curves List */}
          {upcomingCurves.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs text-gray-500 tracking-widest mb-2">UPCOMING</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {upcomingCurves.slice(0, 3).map((curve, i) => {
                  const speed = getRecommendedSpeed(curve)
                  return (
                    <CurveRow 
                      key={curve.id}
                      curve={curve}
                      speed={speed}
                      speedUnit={settings.speedUnit}
                      isActive={i === 0}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={isRunning ? stopDrive : startDrive}
              className={`flex-1 py-4 rounded-xl font-bold text-lg tracking-wider transition-all ${
                isRunning 
                  ? 'bg-red-500 hover:bg-red-400' 
                  : 'bg-green-500 hover:bg-green-400'
              }`}
            >
              {isRunning ? '■ STOP' : '▶ START'}
            </button>
            
            <button
              onClick={toggleSettings}
              className="px-5 py-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
            >
              ⚙️
            </button>
          </div>

          {/* Voice Test (small) */}
          <button
            onClick={testVoice}
            className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            🔊 Test Voice
          </button>

          {/* Demo Mode Label */}
          <div className="text-center mt-2 text-xs text-gray-600">
            🎮 Demo Mode — Mohawk Trail Simulation
          </div>
        </>
      )}
    </div>
  )
}

// ================================
// Sub-components
// ================================

function MinimizedView({ isRunning, mode, onStart, onStop }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div 
          className={`w-3 h-3 rounded-full ${isRunning ? 'animate-pulse' : ''}`}
          style={{ background: isRunning ? '#00ff88' : '#666' }}
        />
        <span className="font-semibold" style={{ color: mode?.color }}>
          {mode?.icon} {mode?.name}
        </span>
      </div>
      <button
        onClick={isRunning ? onStop : onStart}
        className={`px-6 py-2 rounded-lg font-semibold text-sm ${
          isRunning 
            ? 'bg-red-500/20 text-red-400' 
            : 'bg-green-500/20 text-green-400'
        }`}
      >
        {isRunning ? 'STOP' : 'START'}
      </button>
    </div>
  )
}

function StatCard({ value, label, color, pulse }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
      <div 
        className={`text-2xl font-bold font-display ${pulse ? 'animate-pulse' : ''}`}
        style={{ color: color || 'white' }}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}

function CurveRow({ curve, speed, speedUnit, isActive }) {
  return (
    <div 
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isActive ? 'bg-white/10 border border-white/10' : 'opacity-60'
      }`}
    >
      <div 
        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm font-display"
        style={{
          background: curve.direction === 'LEFT' ? '#00d4ff20' : '#ff6b3520',
          color: curve.direction === 'LEFT' ? '#00d4ff' : '#ff6b35'
        }}
      >
        {curve.direction[0]}{curve.severity}
      </div>
      <div className="flex-1">
        <div className="font-medium text-sm">
          {curve.direction} {curve.severity}
          {curve.modifier && (
            <span className="text-yellow-500 ml-2 text-xs">{curve.modifier}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">{speed} {speedUnit}</div>
      </div>
      <div className="text-sm text-gray-400 font-mono">{curve.distance}m</div>
    </div>
  )
}
