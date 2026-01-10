import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Settings Panel
// ================================

export default function SettingsPanel() {
  const {
    showSettings,
    settings,
    updateSettings,
    toggleSettings
  } = useStore()

  const { test: testVoice, isReady: voiceReady, error: voiceError } = useSpeech()

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={toggleSettings}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-lg bg-rally-dark border-t border-white/10 rounded-t-3xl p-6 safe-bottom animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button 
            onClick={toggleSettings}
            className="p-2 rounded-lg hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {/* Voice Section */}
        <div className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">VOICE</h3>
          
          {voiceError && (
            <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-sm text-red-400">
              ⚠️ {voiceError}
            </div>
          )}

          <button 
            onClick={testVoice}
            className="w-full py-3 bg-green-500/20 text-green-400 rounded-xl font-medium hover:bg-green-500/30 transition-colors mb-4"
          >
            🔊 Test Voice
          </button>

          <ToggleSetting
            label="Voice Callouts"
            value={settings.voiceEnabled}
            onChange={(v) => updateSettings({ voiceEnabled: v })}
          />
        </div>

        {/* Timing Section */}
        <div className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">TIMING</h3>
          
          <SliderSetting
            label="Callout Timing"
            value={settings.calloutTiming}
            min={2}
            max={10}
            unit="s before curve"
            onChange={(v) => updateSettings({ calloutTiming: v })}
          />

          <SliderSetting
            label="GPS Lag Offset"
            value={settings.gpsLagOffset}
            min={-3}
            max={3}
            step={0.5}
            unit="s"
            showSign
            onChange={(v) => updateSettings({ gpsLagOffset: v })}
            hint="Positive = earlier callouts"
          />
        </div>

        {/* Display Section */}
        <div className="mb-6">
          <h3 className="text-sm text-gray-400 mb-3">DISPLAY</h3>
          
          <SegmentedSetting
            label="Speed Unit"
            value={settings.speedUnit}
            options={[
              { id: 'mph', label: 'MPH' },
              { id: 'kmh', label: 'KM/H' }
            ]}
            onChange={(v) => updateSettings({ speedUnit: v })}
          />

          <ToggleSetting
            label="Haptic Feedback"
            value={settings.hapticFeedback}
            onChange={(v) => updateSettings({ hapticFeedback: v })}
          />
        </div>

        {/* About */}
        <div className="text-center text-xs text-gray-600 pt-4 border-t border-white/10">
          Rally Co-Pilot v0.1.0 — Demo Build
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

// ================================
// Setting Components
// ================================

function ToggleSetting({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{label}</span>
      <button 
        onClick={() => onChange(!value)}
        className={`w-12 h-6 rounded-full transition-colors relative ${
          value ? 'bg-green-500' : 'bg-gray-600'
        }`}
      >
        <div 
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            value ? 'left-6' : 'left-0.5'
          }`} 
        />
      </button>
    </div>
  )
}

function SliderSetting({ label, value, min, max, step = 1, unit, showSign, onChange, hint }) {
  const displayValue = showSign && value > 0 ? `+${value}` : value
  
  return (
    <div className="py-3">
      <div className="flex justify-between text-sm mb-2">
        <span>{label}</span>
        <span className="text-gray-400">{displayValue}{unit}</span>
      </div>
      <input 
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-rally-cyan"
      />
      {hint && (
        <p className="text-xs text-gray-600 mt-1">{hint}</p>
      )}
    </div>
  )
}

function SegmentedSetting({ label, value, options, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{label}</span>
      <div className="flex gap-1 bg-white/5 rounded-lg p-1">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              value === opt.id 
                ? 'bg-rally-cyan/20 text-rally-cyan' 
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
