import { useState } from 'react'
import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Settings Panel - Complete Overhaul
// ================================

export default function SettingsPanel() {
  const { 
    showSettings, 
    toggleSettings, 
    settings, 
    updateSettings,
    mode,
    setMode
  } = useStore()
  
  const { speak } = useSpeech()
  const [testPlaying, setTestPlaying] = useState(false)

  if (!showSettings) return null

  const handleTestVoice = async () => {
    setTestPlaying(true)
    await speak('Left 4 tightens into right 3', 'high')
    setTimeout(() => setTestPlaying(false), 2000)
  }

  const timingOptions = [
    { value: 4, label: '4s (Early)' },
    { value: 6, label: '6s (Normal)' },
    { value: 8, label: '8s (Late)' },
    { value: 10, label: '10s (Very Early)' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={toggleSettings}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[#0d0d12] rounded-t-3xl border-t border-white/10 overflow-hidden safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button 
            onClick={toggleSettings}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          
          {/* Voice Section */}
          <div className="mb-6">
            <div className="text-[11px] font-semibold text-white/40 tracking-wider mb-3">VOICE</div>
            
            {/* Voice Enabled */}
            <SettingRow 
              label="Voice Callouts"
              description="Announce upcoming curves"
            >
              <Toggle 
                enabled={settings.voiceEnabled} 
                onChange={(v) => updateSettings({ voiceEnabled: v })}
              />
            </SettingRow>

            {/* Volume Slider */}
            {settings.voiceEnabled && (
              <SettingRow label="Volume">
                <div className="flex items-center gap-3 w-40">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={settings.volume || 1}
                    onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                    className="flex-1 accent-cyan-500"
                  />
                  <span className="text-white/60 text-sm w-8">
                    {Math.round((settings.volume || 1) * 100)}%
                  </span>
                </div>
              </SettingRow>
            )}

            {/* Test Voice */}
            {settings.voiceEnabled && (
              <SettingRow label="Test Voice">
                <button
                  onClick={handleTestVoice}
                  disabled={testPlaying}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    testPlaying 
                      ? 'bg-cyan-500/20 text-cyan-400' 
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {testPlaying ? 'Playing...' : 'Play Sample'}
                </button>
              </SettingRow>
            )}
          </div>

          {/* Timing Section */}
          <div className="mb-6">
            <div className="text-[11px] font-semibold text-white/40 tracking-wider mb-3">TIMING</div>
            
            <SettingRow 
              label="Callout Timing"
              description="How far ahead to announce curves"
            >
              <select
                value={settings.calloutTiming || 6}
                onChange={(e) => updateSettings({ calloutTiming: parseInt(e.target.value) })}
                className="bg-white/10 text-white rounded-lg px-3 py-2 text-sm border border-white/10 focus:outline-none focus:border-cyan-500"
              >
                {timingOptions.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-[#1a1a1f]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </SettingRow>
          </div>

          {/* Display Section */}
          <div className="mb-6">
            <div className="text-[11px] font-semibold text-white/40 tracking-wider mb-3">DISPLAY</div>
            
            {/* Speed Unit */}
            <SettingRow label="Speed Unit">
              <div className="flex bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => updateSettings({ speedUnit: 'mph' })}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    settings.speedUnit === 'mph' 
                      ? 'bg-cyan-500 text-black' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  MPH
                </button>
                <button
                  onClick={() => updateSettings({ speedUnit: 'kmh' })}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    settings.speedUnit === 'kmh' 
                      ? 'bg-cyan-500 text-black' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  KMH
                </button>
              </div>
            </SettingRow>

            {/* Map Style */}
            <SettingRow label="Map Style">
              <div className="flex bg-white/10 rounded-lg p-1">
                <button
                  onClick={() => updateSettings({ mapStyle: 'dark' })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    (settings.mapStyle || 'dark') === 'dark' 
                      ? 'bg-cyan-500 text-black' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => updateSettings({ mapStyle: 'satellite' })}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    settings.mapStyle === 'satellite' 
                      ? 'bg-cyan-500 text-black' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  Satellite
                </button>
              </div>
            </SettingRow>

            {/* Keep Screen On */}
            <SettingRow 
              label="Keep Screen On"
              description="Prevent display from sleeping"
            >
              <Toggle 
                enabled={settings.keepScreenOn !== false} 
                onChange={(v) => updateSettings({ keepScreenOn: v })}
              />
            </SettingRow>
          </div>

          {/* Feedback Section */}
          <div className="mb-6">
            <div className="text-[11px] font-semibold text-white/40 tracking-wider mb-3">FEEDBACK</div>
            
            {/* Haptic Feedback */}
            <SettingRow 
              label="Haptic Feedback"
              description="Vibrate on curve callouts"
            >
              <Toggle 
                enabled={settings.hapticFeedback || false} 
                onChange={(v) => updateSettings({ hapticFeedback: v })}
              />
            </SettingRow>
          </div>

          {/* Driving Mode Section */}
          <div className="mb-6">
            <div className="text-[11px] font-semibold text-white/40 tracking-wider mb-3">DRIVING MODE</div>
            
            <div className="grid grid-cols-3 gap-2">
              <ModeButton 
                mode="cruise" 
                currentMode={mode} 
                setMode={setMode}
                icon="🛣️"
                label="Cruise"
                color="#00d4ff"
              />
              <ModeButton 
                mode="fast" 
                currentMode={mode} 
                setMode={setMode}
                icon="🏁"
                label="Fast"
                color="#ffd500"
              />
              <ModeButton 
                mode="race" 
                currentMode={mode} 
                setMode={setMode}
                icon="🔥"
                label="Race"
                color="#ff3366"
              />
            </div>
            <p className="text-white/30 text-xs mt-2">
              {mode === 'cruise' && 'Relaxed driving with conservative speed recommendations'}
              {mode === 'fast' && 'Spirited driving with moderate speed recommendations'}
              {mode === 'race' && 'Aggressive driving with maximum speed recommendations'}
            </p>
          </div>

          {/* Info */}
          <div className="text-center text-white/20 text-xs py-4 border-t border-white/5">
            Rally Co-Pilot v1.0 • Use responsibly
          </div>
        </div>
      </div>
    </div>
  )
}

// Setting Row Component
function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 mr-4">
        <div className="text-white text-sm font-medium">{label}</div>
        {description && (
          <div className="text-white/40 text-xs mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  )
}

// Toggle Component
function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-7 rounded-full transition-colors ${
        enabled ? 'bg-cyan-500' : 'bg-white/20'
      }`}
    >
      <div 
        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
          enabled ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  )
}

// Mode Button Component
function ModeButton({ mode, currentMode, setMode, icon, label, color }) {
  const isActive = currentMode === mode
  
  return (
    <button
      onClick={() => setMode(mode)}
      className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
        isActive 
          ? 'bg-white/10' 
          : 'bg-transparent border-transparent hover:bg-white/5'
      }`}
      style={{ 
        borderColor: isActive ? color : 'transparent',
        boxShadow: isActive ? `0 0 20px ${color}30` : 'none'
      }}
    >
      <span className="text-xl">{icon}</span>
      <span 
        className="text-xs font-semibold"
        style={{ color: isActive ? color : 'rgba(255,255,255,0.5)' }}
      >
        {label}
      </span>
    </button>
  )
}
