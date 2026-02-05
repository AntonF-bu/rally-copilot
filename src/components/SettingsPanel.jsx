import { useState } from 'react'
import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'
import { colors, fonts, glassPanel, transitions } from '../styles/theme'
import { Toggle } from './ui'

// Highway mode settings component
import HighwayModeSettings from './HighwayModeSettings'

// ================================
// Settings Panel - v3
// Refactored to use theme system
// ================================

export default function SettingsPanel() {
  const { showSettings, toggleSettings, settings, updateSettings, mode, setMode, theme, setTheme } = useStore()
  const { speak } = useSpeech()
  const [testPlaying, setTestPlaying] = useState(false)

  if (!showSettings) return null

  // Mode colors only used for driving mode selector
  const modeColors = { cruise: colors.cyan, fast: '#ffd500', race: '#ff3366' }
  const currentModeColor = modeColors[mode] || modeColors.cruise

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
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={toggleSettings}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{
          background: colors.bgPrimary,
          borderTop: `1px solid ${colors.glassBorder}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.glassBorder}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: colors.accentGlow }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>
              </svg>
            </div>
            <h2
              className="text-lg font-semibold"
              style={{ color: colors.textPrimary, fontFamily: fonts.body }}
            >
              Settings
            </h2>
          </div>
          <button
            onClick={toggleSettings}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              background: colors.bgGlass,
              transition: transitions.snappy,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[65vh] overflow-y-auto">

          {/* Appearance Section */}
          <Section title="APPEARANCE" icon="appearance">
            <div className="grid grid-cols-2 gap-2">
              <SelectionButton
                active={theme === 'dark'}
                onClick={() => setTheme('dark')}
                title="Dark"
                icon="moon"
              />
              <SelectionButton
                active={theme === 'light'}
                onClick={() => setTheme('light')}
                title="Light"
                icon="sun"
              />
            </div>
            <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '8px' }}>
              Navigation HUD always uses dark mode for visibility
            </p>
          </Section>

          {/* Units Section */}
          <Section title="UNITS" icon="units">
            <div className="grid grid-cols-2 gap-2">
              <SelectionButton
                active={settings.units === 'imperial'}
                onClick={() => updateSettings({ units: 'imperial' })}
                title="Imperial"
                subtitle="MPH, feet"
              />
              <SelectionButton
                active={settings.units === 'metric'}
                onClick={() => updateSettings({ units: 'metric' })}
                title="Metric"
                subtitle="KM/H, meters"
              />
            </div>
            <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '8px' }}>
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
                      className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${colors.accent} 0%, ${colors.accent} ${(settings.volume || 1) * 100}%, rgba(255,255,255,0.15) ${(settings.volume || 1) * 100}%, rgba(255,255,255,0.15) 100%)`
                      }}
                    />
                    <span style={{ color: colors.textSecondary, fontSize: '12px', width: '32px', textAlign: 'right' }}>
                      {Math.round((settings.volume || 1) * 100)}%
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Timing" description="When to announce curves">
                  <SegmentedControl
                    options={[
                      { value: 'early', label: 'Early' },
                      { value: 'normal', label: 'Normal' },
                      { value: 'late', label: 'Late' },
                    ]}
                    value={settings.calloutTiming}
                    onChange={(v) => updateSettings({ calloutTiming: v })}
                  />
                </SettingRow>

                <SettingRow label="Test Voice">
                  <button
                    onClick={handleTestVoice}
                    disabled={testPlaying}
                    className="px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2"
                    style={{
                      background: testPlaying ? colors.accentGlow : colors.bgGlass,
                      color: testPlaying ? colors.accent : colors.textPrimary,
                      border: `1px solid ${colors.glassBorder}`,
                      transition: transitions.snappy,
                      fontFamily: fonts.heading,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {testPlaying ? (
                      <>
                        <span
                          className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                          style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
                        />
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

          {/* Highway Mode Section */}
          <HighwayModeSettings />

          {/* Display Section */}
          <Section title="DISPLAY" icon="display">
            <SettingRow
              label="HUD Style"
              description="Amount of info on screen"
            >
              <SegmentedControl
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'minimal', label: 'Minimal' },
                ]}
                value={settings.hudStyle || 'full'}
                onChange={(v) => updateSettings({ hudStyle: v })}
              />
            </SettingRow>

            <SettingRow
              label="Show Speedometer"
              description="Display current speed"
            >
              <Toggle
                enabled={settings.showSpeedometer !== false}
                onChange={(v) => updateSettings({ showSpeedometer: v })}
              />
            </SettingRow>

            <SettingRow
              label="Show Elevation"
              description="Display altitude profile"
            >
              <Toggle
                enabled={settings.showElevation !== false}
                onChange={(v) => updateSettings({ showElevation: v })}
              />
            </SettingRow>

            <SettingRow
              label="Keep Screen On"
              description="Prevent display from sleeping"
            >
              <Toggle
                enabled={settings.keepScreenOn !== false}
                onChange={(v) => updateSettings({ keepScreenOn: v })}
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
              />
            </SettingRow>
          </Section>

          {/* Driving Mode Section */}
          <Section title="DRIVING MODE" icon="mode">
            <div className="grid grid-cols-3 gap-2">
              {[
                { m: 'cruise', label: 'Cruise', desc: 'Relaxed', color: colors.cyan },
                { m: 'fast', label: 'Fast', desc: 'Enthusiast', color: '#ffd500' },
                { m: 'race', label: 'Race', desc: 'Aggressive', color: '#ff3366' },
              ].map(({ m, label, desc, color }) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl"
                  style={{
                    ...glassPanel,
                    border: mode === m ? `2px solid ${color}` : `2px solid ${colors.glassBorder}`,
                    boxShadow: mode === m ? `0 0 20px ${color}30` : 'none',
                    transition: transitions.smooth,
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
                    style={{
                      color: mode === m ? color : colors.textSecondary,
                      fontFamily: fonts.heading,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ fontSize: '10px', color: colors.textMuted }}>{desc}</span>
                </button>
              ))}
            </div>
            <p style={{ color: colors.textMuted, fontSize: '12px', marginTop: '12px', textAlign: 'center' }}>
              {mode === 'cruise' && 'Conservative speed targets for comfortable driving'}
              {mode === 'fast' && 'Moderate speed targets for enthusiast driving'}
              {mode === 'race' && 'Aggressive speed targets for experienced drivers'}
            </p>
          </Section>

          {/* Footer */}
          <div
            className="text-center py-4 mt-2"
            style={{
              color: colors.textMuted,
              fontSize: '12px',
              borderTop: `1px solid ${colors.glassBorder}`,
              fontFamily: fonts.heading,
              letterSpacing: '0.1em',
            }}
          >
            RALLY CO-PILOT v1.0
          </div>
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>
  )
}

// Section component with SVG icons
function Section({ title, icon, children }) {
  const icons = {
    appearance: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
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
      <div className="flex items-center gap-2 mb-3" style={{ color: colors.textMuted }}>
        {icons[icon] || null}
        <span style={{
          fontFamily: fonts.heading,
          fontSize: '10px',
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

// Setting row component
function SettingRow({ label, description, children }) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: `1px solid ${colors.glassBorder}` }}
    >
      <div className="flex-1 mr-4">
        <div style={{ color: colors.textPrimary, fontSize: '14px', fontWeight: 500, fontFamily: fonts.body }}>
          {label}
        </div>
        {description && (
          <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

// Segmented control component
function SegmentedControl({ options, value, onChange }) {
  return (
    <div
      className="flex rounded-lg p-0.5"
      style={{ background: colors.bgGlass }}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: value === opt.value ? colors.accent : 'transparent',
            color: value === opt.value ? colors.bgDeep : colors.textSecondary,
            fontFamily: fonts.heading,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            transition: transitions.snappy,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Selection button (for theme/units)
function SelectionButton({ active, onClick, title, subtitle, icon }) {
  const icons = {
    moon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    ),
    sun: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
    ),
  }

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center py-4 px-3 rounded-xl"
      style={{
        ...glassPanel,
        border: active ? `2px solid ${colors.accent}` : `2px solid ${colors.glassBorder}`,
        boxShadow: active ? `0 0 16px ${colors.accentDim}` : 'none',
        transition: transitions.smooth,
      }}
    >
      {icon && (
        <div className="mb-2" style={{ color: active ? colors.accent : colors.textMuted }}>
          {icons[icon]}
        </div>
      )}
      <span
        style={{
          fontSize: icon ? '14px' : '18px',
          fontWeight: 600,
          color: active ? colors.accent : colors.textSecondary,
          fontFamily: fonts.heading,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </span>
      {subtitle && (
        <span style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
          {subtitle}
        </span>
      )}
    </button>
  )
}
