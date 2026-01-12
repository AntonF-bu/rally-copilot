import { useState } from 'react'
import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// NEW: Highway mode settings component
import HighwayModeSettings from './HighwayModeSettings'

// ================================
// Settings Panel - v2
// NEW: Highway Mode section added
// ================================

export default function SettingsPanel() {
  const { showSettings, toggleSettings, settings, updateSettings, mode, setMode } = useStore()
  const { speak } = useSpeech()
  const [testPlaying, setTestPlaying] = useState(false)

  if (!showSettings) return null

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  const handleTestVoice = async () => {
    setTestPlaying(true)
    const isMetric = settings.units === 'metric'
    const testPhrase = isMetric 
      ? 'Left 4 tightens, 50 kilometers per hour'
      : 'Left 4 tightens, 35 miles per hour'
    await speak(testPhrase, 'high')
    setTimeout(() => setTestPlaying(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={toggleSettings} 
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[#0c0c10] rounded-t-3xl border-t border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${modeColor}20` }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Settings</h2>
          </div>
          <button 
            onClick={toggleSettings} 
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">
          
          {/* Units Section */}
          <Section title="UNITS" icon="units">
            <div className="grid grid-cols-2 gap-2">
              <UnitButton
                active={settings.units === 'imperial'}
                onClick={() => updateSettings({ units: 'imperial' })}
                color={modeColor}
                title="Imperial"
                subtitle="MPH, feet"
              />
              <UnitButton
                active={settings.units === 'metric'}
                onClick={() => updateSettings({ units: 'metric' })}
                color={modeColor}
                title="Metric"
                subtitle="KM/H, meters"
              />
            </div>
            <p className="text-white/30 text-xs mt-2">
              Affects speedometer, callouts, and all distances
            </p>
          </Section>

          {/* Voice Section */}
          <Section title="VOICE CALLOUTS" icon="voice">
            <SettingRow 
              label="Enable Voice" 
              description="Announce upcoming curves"
            >
              <Toggle 
                enabled={settings.voiceEnabled} 
                onChange={(v) => updateSettings({ voiceEnabled: v })}
                color={modeColor}
              />
            </SettingRow>

            {settings.voiceEnabled && (
              <>
                <SettingRow label="Volume">
                  <div className="flex items-center gap-3 w-36">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      value={settings.volume || 1}
                      onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                      className="flex-1 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${modeColor} 0%, ${modeColor} ${(settings.volume || 1) * 100}%, rgba(255,255,255,0.2) ${(settings.volume || 1) * 100}%, rgba(255,255,255,0.2) 100%)`
                      }}
                    />
                    <span className="text-white/50 text-xs w-8 text-right">
                      {Math.round((settings.volume || 1) * 100)}%
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Timing" description="When to announce curves">
                  <div className="flex bg-white/5 rounded-lg p-0.5">
                    {[
                      { value: 'early', label: 'Early' },
                      { value: 'normal', label: 'Normal' },
                      { value: 'late', label: 'Late' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => updateSettings({ calloutTiming: opt.value })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          settings.calloutTiming === opt.value 
                            ? 'text-black' 
                            : 'text-white/50 hover:text-white/70'
                        }`}
                        style={{
                          background: settings.calloutTiming === opt.value ? modeColor : 'transparent'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Test Voice">
                  <button
                    onClick={handleTestVoice}
                    disabled={testPlaying}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2"
                    style={{
                      background: testPlaying ? `${modeColor}30` : 'rgba(255,255,255,0.1)',
                      color: testPlaying ? modeColor : 'white'
                    }}
                  >
                    {testPlaying ? (
                      <>
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        Playing...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                        Play Sample
                      </>
                    )}
                  </button>
                </SettingRow>
              </>
            )}
          </Section>

          {/* NEW: Highway Mode Section */}
          <HighwayModeSettings modeColor={modeColor} />

          {/* Display Section */}
          <Section title="DISPLAY" icon="display">
            <SettingRow 
              label="HUD Style"
              description="Amount of info on screen"
            >
              <div className="flex bg-white/5 rounded-lg p-0.5">
                {[
                  { value: 'full', label: 'Full' },
                  { value: 'minimal', label: 'Minimal' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateSettings({ hudStyle: opt.value })}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      (settings.hudStyle || 'full') === opt.value 
                        ? 'text-black' 
                        : 'text-white/50 hover:text-white/70'
                    }`}
                    style={{
                      background: (settings.hudStyle || 'full') === opt.value ? modeColor : 'transparent'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow 
              label="Show Speedometer" 
              description="Display current speed"
            >
              <Toggle 
                enabled={settings.showSpeedometer !== false} 
                onChange={(v) => updateSettings({ showSpeedometer: v })}
                color={modeColor}
              />
            </SettingRow>

            <SettingRow 
              label="Show Elevation" 
              description="Display altitude profile"
            >
              <Toggle 
                enabled={settings.showElevation !== false} 
                onChange={(v) => updateSettings({ showElevation: v })}
                color={modeColor}
              />
            </SettingRow>

            <SettingRow 
              label="Keep Screen On" 
              description="Prevent display from sleeping"
            >
              <Toggle 
                enabled={settings.keepScreenOn !== false} 
                onChange={(v) => updateSettings({ keepScreenOn: v })}
                color={modeColor}
              />
            </SettingRow>
          </Section>

          {/* Feedback Section */}
          <Section title="FEEDBACK" icon="feedback">
            <SettingRow 
              label="Haptic Feedback" 
              description="Vibrate on curve warnings"
            >
              <Toggle 
                enabled={settings.hapticFeedback || false} 
                onChange={(v) => updateSettings({ hapticFeedback: v })}
                color={modeColor}
              />
            </SettingRow>
          </Section>

          {/* Driving Mode Section */}
          <Section title="DRIVING MODE" icon="mode">
            <div className="grid grid-cols-3 gap-2">
              {[
                { m: 'cruise', label: 'Cruise', desc: 'Relaxed', color: '#00d4ff' },
                { m: 'fast', label: 'Fast', desc: 'Spirited', color: '#ffd500' },
                { m: 'race', label: 'Race', desc: 'Aggressive', color: '#ff3366' },
              ].map(({ m, label, desc, color }) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl transition-all ${
                    mode === m ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
                  }`}
                  style={{
                    border: mode === m ? `2px solid ${color}` : '2px solid transparent',
                    boxShadow: mode === m ? `0 0 20px ${color}30` : 'none'
                  }}
                >
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
                    style={{ background: `${color}20` }}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ background: color }}
                    />
                  </div>
                  <span 
                    className="text-sm font-semibold"
                    style={{ color: mode === m ? color : 'rgba(255,255,255,0.6)' }}
                  >
                    {label}
                  </span>
                  <span className="text-[10px] text-white/30">{desc}</span>
                </button>
              ))}
            </div>
            <p className="text-white/30 text-xs mt-3 text-center">
              {mode === 'cruise' && 'Conservative speed targets for comfortable driving'}
              {mode === 'fast' && 'Moderate speed targets for spirited driving'}
              {mode === 'race' && 'Aggressive speed targets for experienced drivers'}
            </p>
          </Section>

          {/* Footer */}
          <div className="text-center text-white/20 text-xs py-4 mt-2 border-t border-white/5">
            Rally Co-Pilot v1.0
          </div>
        </div>

        {/* Safe area padding */}
        <div className="h-safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  )
}

// Section component with SVG icons
function Section({ title, icon, children }) {
  const icons = {
    units: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    voice: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    ),
    display: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    feedback: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    mode: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
      </svg>
    ),
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 text-white/40">
        {icons[icon] || null}
        <span className="text-[11px] font-semibold tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  )
}

// Setting row component
function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 mr-4">
        <div className="text-white text-sm font-medium">{label}</div>
        {description && <div className="text-white/40 text-xs mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  )
}

// Toggle component
function Toggle({ enabled, onChange, color = '#00d4ff' }) {
  return (
    <button 
      onClick={() => onChange(!enabled)} 
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{ background: enabled ? color : 'rgba(255,255,255,0.2)' }}
    >
      <div 
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
          enabled ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  )
}

// Unit selection button
function UnitButton({ active, onClick, color, title, subtitle }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center py-4 px-3 rounded-xl transition-all ${
        active ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
      }`}
      style={{
        border: active ? `2px solid ${color}` : '2px solid transparent',
      }}
    >
      <span 
        className="text-lg font-bold"
        style={{ color: active ? color : 'rgba(255,255,255,0.6)' }}
      >
        {title}
      </span>
      <span className="text-xs text-white/40 mt-1">{subtitle}</span>
    </button>
  )
}
