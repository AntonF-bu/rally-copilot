// =============================================
// FreeDriveHUD — Simplified HUD for Free Drive mode
// Shows: speed, road name, next curve, curve queue, lookahead status
// =============================================

import { useMemo } from 'react'

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

function curveLabel(c) {
  const dir = c.direction === 'Left' ? 'L' : 'R'
  return `${dir}${rallyScale(c.angle)}`
}

function formatDist(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1609.34).toFixed(1)}mi`
}

export default function FreeDriveHUD({
  speed = 0,
  roadName = '',
  curves = [],
  junctionAhead = null,
  paused = false,
  onStop,
}) {
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
    <div style={styles.container}>
      {/* Top bar: road name + stop button */}
      <div style={styles.topBar}>
        <div style={styles.roadName}>
          {roadName || 'Scanning...'}
        </div>
        <button style={styles.stopBtn} onClick={onStop}>
          STOP
        </button>
      </div>

      {/* Speed + next curve */}
      <div style={styles.mainRow}>
        {/* Speed display */}
        <div style={styles.speedBlock}>
          <div style={styles.speedValue}>{Math.round(speed)}</div>
          <div style={styles.speedUnit}>MPH</div>
        </div>

        {/* Next curve */}
        <div style={styles.curveBlock}>
          {nextCurve ? (
            <>
              <div style={{
                ...styles.curveDir,
                color: nextCurve.angle >= 80 ? '#ff4444' : nextCurve.angle >= 40 ? '#ffcc00' : '#66ff66'
              }}>
                {nextCurve.direction === 'Left' ? '←' : '→'} {rallyScale(nextCurve.angle)}
              </div>
              <div style={styles.curveDist}>
                {formatDist(nextCurve.distanceFromDriver)}
              </div>
            </>
          ) : (
            <div style={styles.curveEmpty}>
              {paused ? 'PAUSED' : 'CLEAR'}
            </div>
          )}
        </div>
      </div>

      {/* Curve queue */}
      {upcomingCurves.length > 0 && (
        <div style={styles.queueRow}>
          {upcomingCurves.map((c, i) => (
            <span key={c.id} style={{
              ...styles.queueItem,
              opacity: i === 0 ? 1 : 0.6,
              color: c.angle >= 80 ? '#ff4444' : c.angle >= 40 ? '#ffcc00' : '#66ff66'
            }}>
              {curveLabel(c)}
              {i < upcomingCurves.length - 1 && (
                <span style={styles.queueArrow}> → </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Junction warning */}
      {junctionAhead && junctionAhead.distanceFromDriver < 500 && (
        <div style={styles.junction}>
          JUNCTION {formatDist(junctionAhead.distanceFromDriver)}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(transparent, rgba(8, 11, 18, 0.95) 30%)',
    padding: '40px 16px 24px',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    fontFamily: "'JetBrains Mono', monospace",
    zIndex: 10,
    pointerEvents: 'none',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    pointerEvents: 'auto',
  },
  roadName: {
    fontSize: '13px',
    color: '#999',
    letterSpacing: '0.5px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '70%',
  },
  stopBtn: {
    background: 'rgba(200, 40, 40, 0.8)',
    color: '#fff',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1px',
    fontFamily: "'Sora', sans-serif",
    cursor: 'pointer',
  },
  mainRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  speedBlock: {
    textAlign: 'left',
  },
  speedValue: {
    fontSize: '56px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
  speedUnit: {
    fontSize: '11px',
    color: '#666',
    letterSpacing: '2px',
    marginTop: '2px',
  },
  curveBlock: {
    textAlign: 'right',
  },
  curveDir: {
    fontSize: '36px',
    fontWeight: 700,
    lineHeight: 1,
  },
  curveDist: {
    fontSize: '13px',
    color: '#888',
    marginTop: '2px',
  },
  curveEmpty: {
    fontSize: '14px',
    color: '#555',
    letterSpacing: '2px',
  },
  queueRow: {
    marginTop: '10px',
    fontSize: '14px',
    fontWeight: 600,
  },
  queueItem: {
    display: 'inline',
  },
  queueArrow: {
    color: '#444',
  },
  junction: {
    marginTop: '8px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#ffcc00',
    letterSpacing: '1px',
    textAlign: 'center',
  },
}
