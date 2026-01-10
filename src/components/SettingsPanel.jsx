import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Settings Panel - Slide-up Modal
// ================================

export default function SettingsPanel() {
  const {
    showSettings,
    settings,
    updateSettings,
    toggleSettings
  } = useStore()

  const { 
    test: testVoice, 
    error: voiceError,
    useElevenLabs,
    toggleVoiceType
  } = useSpeech()

  if (!showSettings) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={toggleSettings}
      />
      
      {/* Panel */}
      <div 
        className="absolute bottom-0 left-0 right-0 bg-[#0a0a0f] border-t border-white/10 rounded-t-3xl safe-bottom"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Handle */}
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 bg-white/20 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Settings</h2>
            <button 
              onClick={toggleSettings}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Voice Section */}
          <Section title="VOICE">
            {voiceError && (
              <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-sm text-red-400">
                ⚠️ {voiceError}
              </div>
            )}

            <button 
              onClick={testVoice}
              className="w-full py-3 bg-green-500/20 text-green-400 rounded-xl font-medium hover:bg-green-500/30 transition-colors mb-4 border border-green-500/30"
            >
              🔊 Test Voice
            </button>

            <div className="flex items-center justify-between py-3 mb-2">
              <div>
                <span className="text-sm text-gray-200">Premium Voice</span>
                <p className="text-xs text-gray-500">ElevenLabs AI voice</p>
              </div>
              <button 
                onClick={toggleVoiceType}
                className={`w-12 h-7 rounded-full transition-all relative ${
                  useElevenLabs ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <div 
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    useElevenLabs ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <Toggle
              label="Voice Callouts"
              value={settings.voiceEnabled}
              onChange={(v) => updateSettings({ voiceEnabled: v })}
            />
          </Section>

          {/* Timing Section */}
          <Section title="TIMING">
            <Slider
              label="Callout Timing"
              value={settings.calloutTiming}
              min={2}
              max={10}
              suffix="s before"
              onChange={(v) => updateSettings({ calloutTiming: v })}
            />

            <Slider
              label="GPS Lag Offset"
              value={settings.gpsLagOffset}
              min={-3}
              max={3}
              step={0.5}
              suffix="s"
              showSign
              onChange={(v) => updateSettings({ gpsLagOffset: v })}
            />
            <p className="text-xs text-gray-600 -mt-2 mb-4">
              Positive = earlier callouts, Negative = later
            </p>
          </Section>

          {/* Display Section */}
          <Section title="DISPLAY">
            <SegmentPicker
              label="Speed Unit"
              value={settings.speedUnit}
              options={[
                { id: 'mph', label: 'MPH' },
                { id: 'kmh', label: 'KM/H' }
              ]}
              onChange={(v) => updateSettings({ speedUnit: v })}
            />

            <Toggle
              label="Haptic Feedback"
              value={settings.hapticFeedback}
              onChange={(v) => updateSettings({ hapticFeedback: v })}
            />
          </Section>

          {/* Version */}
          <div className="text-center text-xs text-gray-600 pt-4 border-t border-white/10">
            Rally Co-Pilot v0.2.0
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ================================
// Helper Components
// ================================

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs text-gray-500 tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-200">{label}</span>
      <button 
        onClick={() => onChange(!value)}
        className={`w-12 h-7 rounded-full transition-all relative ${
          value ? 'bg-green-500' : 'bg-gray-600'
        }`}
      >
        <div 
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
            value ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, suffix = '', showSign, onChange }) {
  const display = showSign && value > 0 ? `+${value}` : value
  
  return (
    <div className="py-3">
      <div className="flex justify-between text-sm mb-2">
        <span className="text-gray-200">{label}</span>
        <span className="text-gray-400">{display}{suffix}</span>
      </div>
      <input 
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-cyan-500
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  )
}

function SegmentPicker({ label, value, options, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-200">{label}</span>
      <div className="flex bg-white/5 rounded-lg p-1">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              value === opt.id 
                ? 'bg-cyan-500/30 text-cyan-400' 
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
