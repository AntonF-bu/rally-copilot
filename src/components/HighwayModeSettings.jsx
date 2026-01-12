// ================================
// Highway Mode Settings Component
// Drop-in section for SettingsPanel.jsx
// 
// Usage in SettingsPanel.jsx:
//   import HighwayModeSettings from './HighwayModeSettings'
//   ...
//   <HighwayModeSettings modeColor={modeColor} />
// ================================

import useHighwayStore from '../services/highwayStore'
import { HIGHWAY_MODE } from '../services/highwayModeService'

export default function HighwayModeSettings({ modeColor = '#3b82f6' }) {
  const { 
    highwayMode, 
    highwayFeatures,
    setHighwayMode,
    toggleHighwayFeature
  } = useHighwayStore()

  const isCompanion = highwayMode === HIGHWAY_MODE.COMPANION

  return (
    <div className="mb-6">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-3 text-white/40">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        <span className="text-[11px] font-semibold tracking-wider">HIGHWAY MODE</span>
      </div>

      {/* Mode Toggle - Basic vs Companion */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <ModeButton
          active={highwayMode === HIGHWAY_MODE.BASIC}
          onClick={() => setHighwayMode(HIGHWAY_MODE.BASIC)}
          color={modeColor}
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
          color="#f59e0b" // Amber for companion
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
      <div className="bg-white/5 rounded-lg p-3 mb-4">
        {isCompanion ? (
          <div className="space-y-1">
            <p className="text-white/80 text-xs">
              <span className="text-amber-400 font-semibold">Companion Mode:</span> Full co-driver experience with chatter, 
              apex timing, stats, and feedback. Makes highway driving engaging.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-white/80 text-xs">
              <span className="font-semibold" style={{ color: modeColor }}>Basic Mode:</span> Clean, 
              professional callouts. Sweepers, elevation changes, and progress milestones.
            </p>
          </div>
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
          color={modeColor}
        />
        
        <FeatureRow
          label="Elevation Callouts"
          description="Crests, dips, grades"
          enabled={highwayFeatures.elevation}
          onChange={() => toggleHighwayFeature('elevation')}
          color={modeColor}
          disabled={true}
          disabledReason="Coming soon"
        />
        
        <FeatureRow
          label="Progress Updates"
          description="Halfway, 10 miles to go..."
          enabled={highwayFeatures.progress}
          onChange={() => toggleHighwayFeature('progress')}
          color={modeColor}
        />

        {/* Companion-only features */}
        {isCompanion && (
          <>
            <div className="mt-3 mb-2">
              <span className="text-[10px] font-semibold tracking-wider text-amber-400/60">
                COMPANION EXTRAS
              </span>
            </div>
            
            <FeatureRow
              label="Apex Timing"
              description={'"Apex... now" on sweepers'}
              enabled={highwayFeatures.apex}
              onChange={() => toggleHighwayFeature('apex')}
              color="#f59e0b"
            />
            
            <FeatureRow
              label="Silence Breaker"
              description="Random chatter after 45-60s"
              enabled={highwayFeatures.chatter}
              onChange={() => toggleHighwayFeature('chatter')}
              color="#f59e0b"
            />
            
            <FeatureRow
              label="Stats Callouts"
              description='"15 sweepers cleared", avg speed'
              enabled={highwayFeatures.stats}
              onChange={() => toggleHighwayFeature('stats')}
              color="#f59e0b"
            />
            
            <FeatureRow
              label="Sweeper Feedback"
              description='"Clean line", "Smooth" after sweepers'
              enabled={highwayFeatures.feedback}
              onChange={() => toggleHighwayFeature('feedback')}
              color="#f59e0b"
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
      className={`flex flex-col items-center py-4 px-3 rounded-xl transition-all ${
        active ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'
      }`}
      style={{
        border: active ? `2px solid ${color}` : '2px solid transparent',
      }}
    >
      <div 
        className="mb-2"
        style={{ color: active ? color : 'rgba(255,255,255,0.4)' }}
      >
        {icon}
      </div>
      <span 
        className="text-sm font-bold"
        style={{ color: active ? color : 'rgba(255,255,255,0.6)' }}
      >
        {title}
      </span>
      <span className="text-[10px] text-white/40 mt-0.5">{subtitle}</span>
    </button>
  )
}

// Feature toggle row
function FeatureRow({ label, description, enabled, onChange, color, disabled = false, disabledReason }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <div className="flex-1 mr-4">
        <div className={`text-white text-sm font-medium ${disabled ? 'opacity-50' : ''}`}>
          {label}
        </div>
        <div className="text-white/40 text-xs mt-0.5">
          {disabled ? disabledReason : description}
        </div>
      </div>
      <FeatureToggle 
        enabled={enabled} 
        onChange={onChange}
        color={color}
        disabled={disabled}
      />
    </div>
  )
}

// Small toggle for features
function FeatureToggle({ enabled, onChange, color = '#00d4ff', disabled = false }) {
  return (
    <button 
      onClick={() => !disabled && onChange(!enabled)} 
      className={`relative w-10 h-5 rounded-full transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
      style={{ background: enabled ? color : 'rgba(255,255,255,0.2)' }}
      disabled={disabled}
    >
      <div 
        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
          enabled ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  )
}
