// ================================
// Highway Mode Settings Component
// Refactored to use theme system
// ================================

import useHighwayStore from '../services/highwayStore'
import { HIGHWAY_MODE } from '../services/highwayModeService'
import { colors, fonts, glassPanel, transitions } from '../styles/theme'
import { Toggle } from './ui'

export default function HighwayModeSettings() {
  const {
    highwayMode,
    highwayFeatures,
    setHighwayMode,
    toggleHighwayFeature
  } = useHighwayStore()

  const isCompanion = highwayMode === HIGHWAY_MODE.COMPANION
  const companionColor = '#f59e0b' // Amber for companion mode

  return (
    <div className="mb-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-3" style={{ color: colors.textMuted }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        <span style={{
          fontFamily: fonts.heading,
          fontSize: '10px',
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}>
          HIGHWAY MODE
        </span>
      </div>

      {/* Mode Toggle - Basic vs Companion */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <ModeButton
          active={highwayMode === HIGHWAY_MODE.BASIC}
          onClick={() => setHighwayMode(HIGHWAY_MODE.BASIC)}
          color={colors.accent}
          title="Basic"
          subtitle="Clean co-driver"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          }
        />
        <ModeButton
          active={highwayMode === HIGHWAY_MODE.COMPANION}
          onClick={() => setHighwayMode(HIGHWAY_MODE.COMPANION)}
          color={companionColor}
          title="Companion"
          subtitle="Full engagement"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          }
        />
      </div>

      {/* Feature Description */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{
          ...glassPanel,
        }}
      >
        {isCompanion ? (
          <p style={{ color: colors.textSecondary, fontSize: '12px' }}>
            <span style={{ color: companionColor, fontWeight: 600 }}>Companion Mode:</span> Full co-driver experience with chatter,
            apex timing, stats, and feedback. Makes highway driving engaging.
          </p>
        ) : (
          <p style={{ color: colors.textSecondary, fontSize: '12px' }}>
            <span style={{ color: colors.accent, fontWeight: 600 }}>Basic Mode:</span> Clean,
            professional callouts. Sweepers, elevation changes, and progress milestones.
          </p>
        )}
      </div>

      {/* Feature Toggles */}
      <div className="space-y-0">
        {/* Always-available features */}
        <FeatureRow
          label="Sweeper Callouts"
          description="Gentle highway curves (8-25°)"
          enabled={highwayFeatures.sweepers}
          onChange={() => toggleHighwayFeature('sweepers')}
        />

        <FeatureRow
          label="Elevation Callouts"
          description="Crests, dips, grades"
          enabled={highwayFeatures.elevation}
          onChange={() => toggleHighwayFeature('elevation')}
          disabled={true}
          disabledReason="Coming soon"
        />

        <FeatureRow
          label="Progress Updates"
          description="Halfway, 10 miles to go..."
          enabled={highwayFeatures.progress}
          onChange={() => toggleHighwayFeature('progress')}
        />

        {/* Companion-only features */}
        {isCompanion && (
          <>
            <div className="mt-3 mb-2">
              <span style={{
                fontFamily: fonts.heading,
                fontSize: '10px',
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: `${companionColor}99`,
              }}>
                COMPANION EXTRAS
              </span>
            </div>

            <FeatureRow
              label="Apex Timing"
              description={'"Apex... now" on sweepers'}
              enabled={highwayFeatures.apex}
              onChange={() => toggleHighwayFeature('apex')}
            />

            <FeatureRow
              label="Silence Breaker"
              description="Random chatter after 45-60s"
              enabled={highwayFeatures.chatter}
              onChange={() => toggleHighwayFeature('chatter')}
            />

            <FeatureRow
              label="Stats Callouts"
              description='"15 sweepers cleared", avg speed'
              enabled={highwayFeatures.stats}
              onChange={() => toggleHighwayFeature('stats')}
            />

            <FeatureRow
              label="Sweeper Feedback"
              description='"Clean line", "Smooth" after sweepers'
              enabled={highwayFeatures.feedback}
              onChange={() => toggleHighwayFeature('feedback')}
            />
          </>
        )}
      </div>
    </div>
  )
}

// Mode selection button
function ModeButton({ active, onClick, color, title, subtitle, icon }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center py-4 px-3 rounded-xl"
      style={{
        ...glassPanel,
        border: active ? `2px solid ${color}` : `2px solid ${colors.glassBorder}`,
        boxShadow: active ? `0 0 16px ${color}30` : 'none',
        transition: transitions.smooth,
      }}
    >
      <div
        className="mb-2"
        style={{ color: active ? color : colors.textMuted }}
      >
        {icon}
      </div>
      <span
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: active ? color : colors.textSecondary,
          fontFamily: fonts.heading,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px' }}>
        {subtitle}
      </span>
    </button>
  )
}

// Feature toggle row
function FeatureRow({ label, description, enabled, onChange, disabled = false, disabledReason }) {
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: `1px solid ${colors.glassBorder}` }}
    >
      <div className="flex-1 mr-4">
        <div style={{
          color: colors.textPrimary,
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: fonts.body,
          opacity: disabled ? 0.5 : 1,
        }}>
          {label}
        </div>
        <div style={{ color: colors.textMuted, fontSize: '12px', marginTop: '2px' }}>
          {disabled ? disabledReason : description}
        </div>
      </div>
      <Toggle
        enabled={enabled}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  )
}
