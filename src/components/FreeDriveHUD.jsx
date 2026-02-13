// =============================================
// FreeDriveHUD — Route Mode HUD adapted for Free Drive
// Same glass styling, same speed display, same callout flash.
// Differences: no progress bar, no zone badge → "FREE DRIVE" badge
// =============================================

import { useMemo, useState, useEffect, useRef } from 'react'

// Zone colors (same as CalloutOverlay)
const ZONE_COLORS = {
  technical: '#00E68A',
  transit: '#66B3FF',
  urban: '#FF668C',
}

const RALLY_ORANGE = '#E8622C'

// Rally scale: same thresholds as useSpeech.js cleanForSpeech
function rallyScale(angle) {
  if (angle >= 180) return 'H'
  if (angle >= 120) return '1'
  if (angle >= 80) return '2'
  if (angle >= 60) return '3'
  if (angle >= 40) return '4'
  if (angle >= 20) return '5'
  return '6'
}

// Color based on angle severity (same as calloutMarkers.js)
function curveColor(angle) {
  if (angle >= 70) return '#ef4444'
  if (angle >= 45) return '#E8622C'
  return '#22c55e'
}

function formatDist(meters) {
  const ft = Math.round(meters * 3.28084)
  if (ft < 1000) return `${ft}ft`
  return `${(meters / 1609.34).toFixed(1)}mi`
}

export default function FreeDriveHUD({
  speed = 0,
  roadName = '',
  curves = [],
  paused = false,
  lastSpokenCallout = null,
  onStop,
}) {
  // Flash state — shows when a callout is spoken
  const [flash, setFlash] = useState(null)
  const lastFlashTimeRef = useRef(0)

  useEffect(() => {
    if (!lastSpokenCallout || lastSpokenCallout.time === lastFlashTimeRef.current) return
    lastFlashTimeRef.current = lastSpokenCallout.time
    setFlash(lastSpokenCallout)
    const timer = setTimeout(() => setFlash(null), 2500)
    return () => clearTimeout(timer)
  }, [lastSpokenCallout])

  // Next 3 curves
  const upcomingCurves = useMemo(() =>
    curves
      .filter(c => c.distanceFromDriver > 0)
      .sort((a, b) => a.distanceFromDriver - b.distanceFromDriver)
      .slice(0, 3),
    [curves]
  )

  const nextCurve = upcomingCurves[0]

  return (
    <>
      {/* HUD glass CSS */}
      <style>{hudCSS}</style>

      {/* ── Callout Flash Overlay ── */}
      {flash && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center"
          style={{ animation: 'flashIn 0.15s ease-out, flashOut 0.5s 2s ease-in forwards' }}>
          <div style={{
            textAlign: 'center',
            textShadow: `0 0 60px ${curveColor(flash.angle)}80, 0 4px 20px rgba(0,0,0,0.8)`,
          }}>
            <div style={{
              fontSize: '72px',
              fontWeight: 800,
              color: curveColor(flash.angle),
              fontFamily: "'Sora', sans-serif",
              lineHeight: 1,
              letterSpacing: '-2px',
            }}>
              {flash.direction === 'Left' ? '←' : '→'} {rallyScale(flash.angle)}
            </div>
          </div>
        </div>
      )}

      {/* ── Top HUD: FREE DRIVE badge + road name ── */}
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="hud-glass rounded-2xl overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* FREE DRIVE badge — where zone badge would be */}
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
              {roadName && (
                <span className="text-white/40 text-xs truncate max-w-[180px]">
                  {roadName}
                </span>
              )}
            </div>
            <button
              className="pointer-events-auto px-3 py-1 rounded text-[10px] font-bold tracking-wider"
              style={{
                background: 'rgba(200, 40, 40, 0.6)',
                color: '#fff',
                border: '1px solid rgba(200, 40, 40, 0.4)',
              }}
              onClick={onStop}
            >
              STOP
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom HUD: Speed + next curve ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="px-3 pb-2">
          <div className="hud-glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-end justify-between">
                {/* Speed display — same style as CalloutOverlay */}
                <div>
                  <div className="flex items-baseline gap-1">
                    <div
                      className="text-5xl font-bold tracking-tight leading-none"
                      style={{
                        color: 'white',
                        fontFamily: "'JetBrains Mono', monospace",
                        textShadow: '0 0 20px rgba(255,255,255,0.3)',
                      }}
                    >
                      {Math.round(speed)}
                    </div>
                    <span className="text-xs text-white/40">MPH</span>
                  </div>
                </div>

                {/* Next curve preview */}
                <div className="text-right">
                  {nextCurve ? (
                    <>
                      <div className="flex items-baseline gap-2 justify-end">
                        <span style={{ color: curveColor(nextCurve.angle), fontSize: '28px', fontWeight: 700, lineHeight: 1 }}>
                          {nextCurve.direction === 'Left' ? '←' : '→'} {rallyScale(nextCurve.angle)}
                        </span>
                      </div>
                      <div className="text-white/50 text-sm mt-0.5">
                        {formatDist(nextCurve.distanceFromDriver)}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: ZONE_COLORS.technical }} />
                      <span className="text-white/30 text-sm tracking-wider">
                        {paused ? 'PAUSED' : 'CLEAR'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Upcoming curve queue */}
              {upcomingCurves.length > 1 && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-3">
                  {upcomingCurves.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-1.5" style={{ opacity: i === 0 ? 1 : 0.5 }}>
                      <span className="text-xs font-bold" style={{ color: curveColor(c.angle) }}>
                        {c.direction === 'Left' ? 'L' : 'R'}{rallyScale(c.angle)}
                      </span>
                      <span className="text-[10px] text-white/30">{formatDist(c.distanceFromDriver)}</span>
                      {i < upcomingCurves.length - 1 && (
                        <span className="text-white/15 text-[10px] ml-1">→</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

const hudCSS = `
  .hud-glass {
    background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .safe-top {
    padding-top: max(12px, env(safe-area-inset-top, 12px));
  }
  @keyframes flashIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes flashOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`
