import { useState } from 'react'
import useStore from '../store'
import { useSpeech } from '../hooks/useSpeech'

// Highway mode settings component
import HighwayModeSettings from './HighwayModeSettings'

// ================================
// Settings Panel - Tramo Brand Design
// Only working settings, clean styling
// ================================

export default function SettingsPanel({ isFullScreen = false }) {
  const { showSettings, toggleSettings, settings, updateSettings } = useStore()
  const { speak } = useSpeech()
  const [testPlaying, setTestPlaying] = useState(false)

  // If not full-screen mode, only show when showSettings is true
  if (!isFullScreen && !showSettings) return null

  const handleTestVoice = async () => {
    setTestPlaying(true)
    const isMetric = settings.units === 'metric'
    const testPhrase = isMetric
      ? 'Left 4 tightens, 50 kilometers per hour'
      : 'Left 4 tightens, 35 miles per hour'
    await speak(testPhrase, 'high')
    setTimeout(() => setTestPlaying(false), 2500)
  }

  // Full-screen mode for tab display
  if (isFullScreen) {
    return (
      <div style={styles.fullScreenContainer}>
        {/* Header */}
        <div style={styles.fullScreenHeader}>
          <h1 style={styles.fullScreenTitle}>Settings</h1>
        </div>

        {/* Content */}
        <div style={styles.fullScreenContent}>

          {/* Units Section */}
          <Section title="UNITS">
            <div style={styles.buttonGrid}>
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
          </Section>

          {/* Voice Section */}
          <Section title="VOICE CALLOUTS">
            <SettingRow label="Enable Voice" description="Announce upcoming curves">
              <Toggle
                enabled={settings.voiceEnabled}
                onChange={(v) => updateSettings({ voiceEnabled: v })}
              />
            </SettingRow>

            {settings.voiceEnabled && (
              <>
                <SettingRow label="Volume">
                  <div style={styles.volumeRow}>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.volume || 1}
                      onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                      style={{
                        ...styles.volumeSlider,
                        background: `linear-gradient(to right, #E8622C 0%, #E8622C ${(settings.volume || 1) * 100}%, #333333 ${(settings.volume || 1) * 100}%, #333333 100%)`
                      }}
                    />
                    <span style={styles.volumeValue}>
                      {Math.round((settings.volume || 1) * 100)}%
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Test Voice">
                  <button
                    onClick={handleTestVoice}
                    disabled={testPlaying}
                    style={{
                      ...styles.testButton,
                      background: testPlaying ? 'rgba(232,98,44,0.15)' : '#1A1A1A',
                      color: testPlaying ? '#E8622C' : '#FFFFFF',
                    }}
                  >
                    {testPlaying ? (
                      <>
                        <div style={styles.spinner} />
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
          <Section title="DISPLAY">
            <SettingRow label="HUD Style" description="Amount of info on screen">
              <SegmentedControl
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'minimal', label: 'Minimal' },
                ]}
                value={settings.hudStyle || 'full'}
                onChange={(v) => updateSettings({ hudStyle: v })}
              />
            </SettingRow>

            <SettingRow label="Show Speedometer" description="Display current speed">
              <Toggle
                enabled={settings.showSpeedometer !== false}
                onChange={(v) => updateSettings({ showSpeedometer: v })}
              />
            </SettingRow>

            <SettingRow label="Show Elevation" description="Display altitude profile">
              <Toggle
                enabled={settings.showElevation !== false}
                onChange={(v) => updateSettings({ showElevation: v })}
              />
            </SettingRow>
          </Section>

          {/* Feedback Section */}
          <Section title="FEEDBACK">
            <SettingRow label="Haptic Feedback" description="Vibrate on curve warnings">
              <Toggle
                enabled={settings.hapticFeedback || false}
                onChange={(v) => updateSettings({ hapticFeedback: v })}
              />
            </SettingRow>
          </Section>

          {/* Footer */}
          <div style={styles.footer}>
            TRAMO v1.0
          </div>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={styles.overlay}>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={toggleSettings} />

      {/* Panel */}
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>Settings</h2>
          <button onClick={toggleSettings} style={styles.closeButton}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>

          {/* Units Section */}
          <Section title="UNITS">
            <div style={styles.buttonGrid}>
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
          </Section>

          {/* Voice Section */}
          <Section title="VOICE CALLOUTS">
            <SettingRow label="Enable Voice" description="Announce upcoming curves">
              <Toggle
                enabled={settings.voiceEnabled}
                onChange={(v) => updateSettings({ voiceEnabled: v })}
              />
            </SettingRow>

            {settings.voiceEnabled && (
              <>
                <SettingRow label="Volume">
                  <div style={styles.volumeRow}>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.volume || 1}
                      onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
                      style={{
                        ...styles.volumeSlider,
                        background: `linear-gradient(to right, #E8622C 0%, #E8622C ${(settings.volume || 1) * 100}%, #333333 ${(settings.volume || 1) * 100}%, #333333 100%)`
                      }}
                    />
                    <span style={styles.volumeValue}>
                      {Math.round((settings.volume || 1) * 100)}%
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Test Voice">
                  <button
                    onClick={handleTestVoice}
                    disabled={testPlaying}
                    style={{
                      ...styles.testButton,
                      background: testPlaying ? 'rgba(232,98,44,0.15)' : '#1A1A1A',
                      color: testPlaying ? '#E8622C' : '#FFFFFF',
                    }}
                  >
                    {testPlaying ? (
                      <>
                        <div style={styles.spinner} />
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
          <Section title="DISPLAY">
            <SettingRow label="HUD Style" description="Amount of info on screen">
              <SegmentedControl
                options={[
                  { value: 'full', label: 'Full' },
                  { value: 'minimal', label: 'Minimal' },
                ]}
                value={settings.hudStyle || 'full'}
                onChange={(v) => updateSettings({ hudStyle: v })}
              />
            </SettingRow>

            <SettingRow label="Show Speedometer" description="Display current speed">
              <Toggle
                enabled={settings.showSpeedometer !== false}
                onChange={(v) => updateSettings({ showSpeedometer: v })}
              />
            </SettingRow>

            <SettingRow label="Show Elevation" description="Display altitude profile">
              <Toggle
                enabled={settings.showElevation !== false}
                onChange={(v) => updateSettings({ showElevation: v })}
              />
            </SettingRow>
          </Section>

          {/* Feedback Section */}
          <Section title="FEEDBACK">
            <SettingRow label="Haptic Feedback" description="Vibrate on curve warnings">
              <Toggle
                enabled={settings.hapticFeedback || false}
                onChange={(v) => updateSettings({ hapticFeedback: v })}
              />
            </SettingRow>
          </Section>

          {/* Footer */}
          <div style={styles.footer}>
            TRAMO v1.0
          </div>
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// Section component
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <span style={styles.sectionTitle}>{title}</span>
      {children}
    </div>
  )
}

// Setting row component
function SettingRow({ label, description, children }) {
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingInfo}>
        <span style={styles.settingLabel}>{label}</span>
        {description && <span style={styles.settingDescription}>{description}</span>}
      </div>
      {children}
    </div>
  )
}

// Toggle component
function Toggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      style={{
        ...styles.toggle,
        background: enabled ? '#E8622C' : '#333333',
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        style={{
          ...styles.toggleThumb,
          left: enabled ? '22px' : '2px',
        }}
      />
    </button>
  )
}

// Segmented control component
function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={styles.segmentedControl}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            ...styles.segmentButton,
            background: value === opt.value ? '#E8622C' : 'transparent',
            color: value === opt.value ? '#FFFFFF' : '#888888',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Selection button (for units)
function SelectionButton({ active, onClick, title, subtitle }) {
  return (
    <button onClick={onClick} style={{
      ...styles.selectionButton,
      border: active ? '2px solid #E8622C' : '2px solid #1A1A1A',
      boxShadow: active ? '0 0 16px rgba(232,98,44,0.15)' : 'none',
    }}>
      <span style={{
        ...styles.selectionTitle,
        color: active ? '#E8622C' : '#888888',
      }}>
        {title}
      </span>
      {subtitle && (
        <span style={styles.selectionSubtitle}>{subtitle}</span>
      )}
    </button>
  )
}

const styles = {
  // Full-screen mode styles
  fullScreenContainer: {
    minHeight: '100%',
    background: 'transparent',
  },
  fullScreenHeader: {
    padding: '16px',
    paddingTop: 'calc(env(safe-area-inset-top, 20px) + 8px)',
  },
  fullScreenTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '28px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
  },
  fullScreenContent: {
    padding: '0 16px',
  },

  // Overlay mode styles
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
  },
  panel: {
    position: 'relative',
    width: '100%',
    maxWidth: '480px',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    background: '#0A0A0A',
    borderTop: '1px solid #1A1A1A',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #1A1A1A',
  },
  headerTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '18px',
    fontWeight: 600,
    color: '#FFFFFF',
    margin: 0,
  },
  closeButton: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    background: '#111111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  content: {
    padding: '16px 20px',
    maxHeight: '65vh',
    overflowY: 'auto',
  },

  // Section
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    display: 'block',
    marginBottom: '12px',
  },

  // Button grid
  buttonGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },

  // Selection button
  selectionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px 12px',
    borderRadius: '12px',
    background: '#111111',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  selectionTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
  },
  selectionSubtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
    marginTop: '4px',
  },

  // Setting row
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid #1A1A1A',
  },
  settingInfo: {
    flex: 1,
    marginRight: '16px',
  },
  settingLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'block',
  },
  settingDescription: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    color: '#888888',
    display: 'block',
    marginTop: '2px',
  },

  // Toggle
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    padding: 0,
    transition: 'background 0.2s ease',
  },
  toggleThumb: {
    position: 'absolute',
    top: '2px',
    width: '20px',
    height: '20px',
    background: '#FFFFFF',
    borderRadius: '50%',
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    transition: 'left 0.2s ease',
  },

  // Segmented control
  segmentedControl: {
    display: 'flex',
    borderRadius: '8px',
    background: '#1A1A1A',
    padding: '2px',
  },
  segmentButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Volume
  volumeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '140px',
  },
  volumeSlider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    WebkitAppearance: 'none',
    appearance: 'none',
    cursor: 'pointer',
  },
  volumeValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#888888',
    width: '36px',
    textAlign: 'right',
  },

  // Test button
  testButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.15s ease',
  },
  spinner: {
    width: '12px',
    height: '12px',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  // Footer
  footer: {
    textAlign: 'center',
    padding: '16px 0',
    marginTop: '8px',
    borderTop: '1px solid #1A1A1A',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#444444',
  },
}
