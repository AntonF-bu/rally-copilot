// =============================================
// FreeDriveHUD — Minimal Free Drive overlay
// Only shows what's DIFFERENT from Route Mode:
// - FREE DRIVE badge (replaces zone badge)
// - Road name
// - STOP button
// - Speed display
// - Paused indicator
//
// Curve callouts, flash overlay, markers — all handled
// by the same CalloutOverlay + speech planner as Route Mode.
// =============================================

const RALLY_ORANGE = '#E8622C'

export default function FreeDriveHUD({
  speed = 0,
  roadName = '',
  paused = false,
  onStop,
}) {
  return (
    <>
      <style>{hudCSS}</style>

      {/* ── Top HUD: FREE DRIVE badge + road name + STOP ── */}
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="hud-glass rounded-2xl overflow-hidden">
          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
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

      {/* ── Bottom HUD: Speed display ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="px-3 pb-2">
          <div className="hud-glass rounded-2xl overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-end justify-between">
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

                {paused && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: RALLY_ORANGE }} />
                    <span className="text-white/30 text-sm tracking-wider">PAUSED</span>
                  </div>
                )}
              </div>
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
`
