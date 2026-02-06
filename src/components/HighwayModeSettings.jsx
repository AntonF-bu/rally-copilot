// ================================
// Highway Mode Settings Component
// Tramo Brand Design
// ================================

import useHighwayStore from '../services/highwayStore'
import { HIGHWAY_MODE } from '../services/highwayModeService'

export default function HighwayModeSettings() {
  const {
    highwayMode,
    highwayFeatures,
    setHighwayMode,
    toggleFeature  // Fixed: store exports 'toggleFeature' not 'toggleHighwayFeature'
  } = useHighwayStore()

  const isCompanion = highwayMode === HIGHWAY_MODE.COMPANION
  const companionColor = '#f59e0b' // Amber for companion mode

  return (
    <div style={styles.section}>
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        <span style={styles.sectionTitle}>HIGHWAY MODE</span>
      </div>

      {/* Mode Toggle - Basic vs Companion */}
      <div style={styles.modeGrid}>
        <ModeButton
          active={highwayMode === HIGHWAY_MODE.BASIC}
          onClick={() => setHighwayMode(HIGHWAY_MODE.BASIC)}
          color="#E8622C"
          title="Basic"
          subtitle="Clean co-driver"
        />
        <ModeButton
          active={highwayMode === HIGHWAY_MODE.COMPANION}
          onClick={() => setHighwayMode(HIGHWAY_MODE.COMPANION)}
          color={companionColor}
          title="Companion"
          subtitle="Full engagement"
        />
      </div>

      {/* Feature Description */}
      <div style={styles.descriptionCard}>
        {isCompanion ? (
          <p style={styles.descriptionText}>
            <span style={{ color: companionColor, fontWeight: 600 }}>Companion Mode:</span> Full co-driver experience with chatter,
            apex timing, stats, and feedback. Makes highway driving engaging.
          </p>
        ) : (
          <p style={styles.descriptionText}>
            <span style={{ color: '#E8622C', fontWeight: 600 }}>Basic Mode:</span> Clean,
            professional callouts. Sweepers, elevation changes, and progress milestones.
          </p>
        )}
      </div>

      {/* Feature Toggles */}
      <div style={styles.featureList}>
        {/* Companion-only feature: Chatter (the only toggle that's actually used during navigation) */}
        {isCompanion && (
          <FeatureRow
            label="Silence Breaker"
            description="AI chatter during quiet highway stretches"
            enabled={highwayFeatures.chatter}
            onChange={() => toggleFeature('chatter')}
          />
        )}

        {/* Note: Removed non-functional toggles per bug fix requirements
            - Sweeper Callouts: always enabled, no toggle needed (callouts happen automatically)
            - Progress Updates: always enabled, no toggle needed
            - Apex Timing: feature not yet implemented
            - Stats Callouts: feature not yet implemented
            - Sweeper Feedback: feature not yet implemented
        */}
      </div>
    </div>
  )
}

// Mode selection button
function ModeButton({ active, onClick, color, title, subtitle }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.modeButton,
        border: active ? `2px solid ${color}` : '2px solid #1A1A1A',
        boxShadow: active ? `0 0 16px ${color}30` : 'none',
      }}
    >
      <div
        style={{
          ...styles.modeIcon,
          background: `${color}20`,
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: color,
          }}
        />
      </div>
      <span style={{
        ...styles.modeTitle,
        color: active ? color : '#888888',
      }}>
        {title}
      </span>
      <span style={styles.modeSubtitle}>{subtitle}</span>
    </button>
  )
}

// Feature toggle row
function FeatureRow({ label, description, enabled, onChange, disabled = false }) {
  return (
    <div style={styles.featureRow}>
      <div style={styles.featureInfo}>
        <span style={{
          ...styles.featureLabel,
          opacity: disabled ? 0.5 : 1,
        }}>
          {label}
        </span>
        <span style={styles.featureDescription}>{description}</span>
      </div>
      <Toggle enabled={enabled} onChange={onChange} disabled={disabled} />
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

const styles = {
  section: {
    marginBottom: '24px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#666666',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
  },

  // Mode grid
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
    marginBottom: '16px',
  },
  modeButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px 12px',
    borderRadius: '12px',
    background: '#111111',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modeIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  modeTitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
  },
  modeSubtitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
    marginTop: '2px',
  },

  // Description card
  descriptionCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '16px',
  },
  descriptionText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    color: '#888888',
    margin: 0,
    lineHeight: 1.5,
  },

  // Feature list
  featureList: {},
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 0',
    borderBottom: '1px solid #1A1A1A',
  },
  featureInfo: {
    flex: 1,
    marginRight: '16px',
  },
  featureLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#FFFFFF',
    display: 'block',
  },
  featureDescription: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    color: '#666666',
    display: 'block',
    marginTop: '2px',
  },

  // Companion header
  companionHeader: {
    marginTop: '12px',
    marginBottom: '8px',
  },
  companionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
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
}
