// =============================================
// FreeDriveHUD — Self-contained Free Drive overlay v2
//
// Reads curatedHighwayCallouts + routeZones from Zustand.
// Does NOT call useHighwayMode() — avoids cascading
// state updates that caused stack overflow in v1.
//
// Three states:
//   1. Scanning (no callouts yet)
//   2. Curated callout HUD (next callout + upcoming list)
//   3. Clear ahead (callouts exist but none nearby)
// =============================================

import { useMemo, useState } from 'react'
import useStore from '../store'
import { DiagnosticOverlay, useTripleTap } from './DiagnosticOverlay'

const RALLY_ORANGE = '#E8622C'

// Zone colors for the rare case we show zone info
const ZONE_COLORS = {
  technical: '#00E68A',
  transit: '#66B3FF',
  urban: '#FF668C',
}

function getCalloutColor(callout) {
  if (callout.type === 'danger' || callout.text?.toLowerCase().includes('caution')) return '#ef4444'
  if (callout.type === 'significant') return RALLY_ORANGE
  if (callout.type === 'sequence') return '#ec4899'
  if (callout.type === 'wake_up') return '#10b981'
  return ZONE_COLORS[callout.zone] || '#22c55e'
}

export default function FreeDriveHUD({ userDistance = 0, onStop, diagnosticLog, isSimulating }) {
  const {
    isRunning,
    settings,
    speed,
    curatedHighwayCallouts,
  } = useStore()

  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const handleTripleTap = useTripleTap(() => {
    if (!isSimulating && diagnosticLog?.current?.length > 0) {
      setShowDiagnostics(true)
    }
  })

  const isMetric = settings.units === 'metric'
  const speedUnit = isMetric ? 'KM/H' : 'MPH'
  const distanceUnit = isMetric ? 'm' : 'ft'

  const currentSpeedDisplay = isMetric
    ? Math.round((speed || 0) * 1.609)
    : Math.round(speed || 0)

  // Get upcoming curated callouts ahead of the car
  const upcomingCallouts = useMemo(() => {
    if (!curatedHighwayCallouts?.length) return []

    const currentSpeedMph = speed || 30
    const lookaheadMeters = Math.max(80, currentSpeedMph * 2)
    const hudPreviewDistance = lookaheadMeters * 3

    return curatedHighwayCallouts
      .filter(callout => {
        const calloutDist = callout.triggerDistance > 0
          ? callout.triggerDistance
          : (callout.triggerMile * 1609.34)
        const distanceToCallout = calloutDist - userDistance
        return distanceToCallout > 0 && distanceToCallout <= hudPreviewDistance
      })
      .sort((a, b) => {
        const distA = a.triggerDistance > 0 ? a.triggerDistance : (a.triggerMile * 1609.34)
        const distB = b.triggerDistance > 0 ? b.triggerDistance : (b.triggerMile * 1609.34)
        return distA - distB
      })
      .slice(0, 5)
  }, [curatedHighwayCallouts, userDistance, speed])

  const nextCallout = upcomingCallouts[0] || null

  // Diagnostic overlay
  if (showDiagnostics) {
    return <DiagnosticOverlay entries={diagnosticLog?.current || []} onClose={() => setShowDiagnostics(false)} />
  }

  if (!isRunning) return null

  // ── STATE 1: Scanning (no callouts yet) ──
  if (!curatedHighwayCallouts?.length || (!nextCallout && !curatedHighwayCallouts.length)) {
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="fd-hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FDBadge />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: RALLY_ORANGE }} />
              <span className="text-white/50 text-sm">Scanning road...</span>
            </div>
            <div className="flex items-center gap-3">
              {onStop && <StopButton onClick={onStop} />}
              {settings.showSpeedometer !== false && (
                <SpeedDisplay speed={currentSpeedDisplay} unit={speedUnit} color={RALLY_ORANGE} onClick={handleTripleTap} />
              )}
            </div>
          </div>
        </div>
        <style>{hudStyles}</style>
      </div>
    )
  }

  // ── STATE 2: Curated callout HUD ──
  if (nextCallout) {
    const calloutDist = nextCallout.triggerDistance > 0 ? nextCallout.triggerDistance : (nextCallout.triggerMile * 1609.34)
    const distanceToCallout = calloutDist - userDistance
    const distanceDisplay = isMetric
      ? Math.round(distanceToCallout)
      : Math.round(distanceToCallout * 3.28084)

    const calloutColor = getCalloutColor(nextCallout)
    const maxDistance = 500
    const progress = Math.min(100, Math.max(0, ((maxDistance - distanceToCallout) / maxDistance) * 100))
    const isAnnouncing = distanceToCallout > 0 && distanceToCallout < 150

    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="fd-hud-glass rounded-2xl overflow-hidden">
          {/* Top row: FREE DRIVE badge + STOP */}
          <div className="px-4 pt-2 pb-1 flex items-center justify-between border-b border-white/5">
            <FDBadge />
            {onStop && <StopButton onClick={onStop} />}
          </div>

          {/* Main callout info */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              {/* Direction icon */}
              <CalloutIcon callout={nextCallout} color={calloutColor} />

              {/* Callout text + distance + progress bar */}
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-bold transition-all duration-300 ${isAnnouncing ? 'text-3xl fd-callout-flash' : 'text-xl'}`}
                    style={{
                      color: calloutColor,
                      textShadow: isAnnouncing ? `0 0 20px ${calloutColor}, 0 0 40px ${calloutColor}60` : 'none',
                    }}
                  >
                    {nextCallout.text}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white/50 text-sm">DISTANCE</span>
                  <span className="text-white font-bold">{distanceDisplay}</span>
                  <span className="text-white/40 text-xs">{distanceUnit}</span>
                </div>
                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: calloutColor }}
                  />
                </div>
              </div>

              {/* Speed display */}
              {settings.showSpeedometer !== false && (
                <div className="text-right pl-2 flex flex-col items-end pointer-events-auto" onClick={handleTripleTap}>
                  <div className="flex items-baseline gap-1">
                    <div
                      className="text-4xl font-bold tracking-tight leading-none"
                      style={{ color: 'white', textShadow: '0 0 20px rgba(255,255,255,0.3)' }}
                    >
                      {currentSpeedDisplay}
                    </div>
                    <span className="text-xs text-white/40">{speedUnit}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upcoming callouts list */}
        {upcomingCallouts.length > 1 && (
          <div className="mt-2 fd-hud-glass rounded-xl px-3 py-2 inline-block">
            <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
            <div className="flex flex-col gap-1">
              {upcomingCallouts.slice(1, 4).map((callout, i) => {
                const cDist = callout.triggerDistance > 0 ? callout.triggerDistance : (callout.triggerMile * 1609.34)
                const dist = isMetric ? Math.round(cDist - userDistance) : Math.round((cDist - userDistance) * 3.28084)
                const unit = isMetric ? 'm' : 'ft'
                const color = getCalloutColor(callout)
                const displayText = callout.text?.length > 25 ? callout.text.substring(0, 22) + '...' : callout.text
                return (
                  <div key={callout.id || i} className="flex items-center gap-2">
                    <span className="text-xs font-bold truncate max-w-[150px]" style={{ color }}>{displayText}</span>
                    <span className="text-[10px] text-white/40 whitespace-nowrap">{dist}{unit}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <style>{hudStyles}</style>
      </div>
    )
  }

  // ── STATE 3: Clear ahead ──
  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
      <div className="fd-hud-glass rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FDBadge />
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: RALLY_ORANGE }} />
            <span className="text-white/50 text-sm">Clear ahead</span>
          </div>
          <div className="flex items-center gap-3">
            {onStop && <StopButton onClick={onStop} />}
            {settings.showSpeedometer !== false && (
              <SpeedDisplay speed={currentSpeedDisplay} unit={speedUnit} color={RALLY_ORANGE} onClick={handleTripleTap} />
            )}
          </div>
        </div>
      </div>
      <style>{hudStyles}</style>
    </div>
  )
}

// ── Sub-components ──

function FDBadge() {
  return (
    <span
      className="px-2 py-1 rounded text-[10px] font-bold tracking-wider"
      style={{
        background: `${RALLY_ORANGE}25`,
        color: RALLY_ORANGE,
        border: `1px solid ${RALLY_ORANGE}50`,
      }}
    >
      FREE DRIVE
    </span>
  )
}

function StopButton({ onClick }) {
  return (
    <button
      className="pointer-events-auto px-3 py-1 rounded text-[10px] font-bold tracking-wider"
      style={{ background: 'rgba(200,40,40,0.6)', color: '#fff', border: '1px solid rgba(200,40,40,0.4)' }}
      onClick={onClick}
    >
      STOP
    </button>
  )
}

function SpeedDisplay({ speed, unit, color, onClick }) {
  return (
    <div className="text-right pointer-events-auto" onClick={onClick}>
      <span className="text-2xl font-bold" style={{ color }}>{speed}</span>
      <span className="text-xs text-white/40 ml-1">{unit}</span>
    </div>
  )
}

function CalloutIcon({ callout, color }) {
  const text = callout.text || ''
  const leftMatch = text.match(/\bleft\b/i)
  const rightMatch = text.match(/\bright\b/i)
  let icon = '•'
  if (callout.type === 'danger') icon = '⚠'
  else if (callout.type === 'sequence') icon = 'SEQ'
  else if (callout.type === 'wake_up') icon = '!'
  else if (leftMatch) icon = '←'
  else if (rightMatch) icon = '→'

  return (
    <div
      className="w-14 h-14 rounded-xl flex flex-col items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
        border: `2px solid ${color}60`,
        boxShadow: `0 0 25px ${color}40`,
      }}
    >
      <span className="text-2xl font-bold" style={{ color }}>{icon}</span>
    </div>
  )
}

const hudStyles = `
  .fd-hud-glass {
    background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .safe-top {
    padding-top: env(safe-area-inset-top, 0px);
  }
  @keyframes fdCalloutPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.9; transform: scale(1.05); }
  }
  .fd-callout-flash {
    animation: fdCalloutPulse 0.8s ease-in-out infinite;
  }
`
