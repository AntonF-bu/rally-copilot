import { useState, useEffect, useRef } from 'react'

// ================================
// Free Drive Sim Controls - v1
// Compact corner overlay for play/pause,
// speed slider, and position readout.
// ================================

export default function FreeDriveSimControls({ sim, onInitAudio }) {
  const audioInitedRef = useRef(false)
  const [state, setState] = useState({
    paused: true,
    speedMph: 40,
    position: null,
    heading: 0,
    progressPercent: 0,
    ready: false,
  })

  const intervalRef = useRef(null)

  // Poll sim state at 2Hz for UI updates
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (sim?.getSimState) {
        setState(sim.getSimState())
      }
    }, 500)
    return () => clearInterval(intervalRef.current)
  }, [sim])

  const handleSpeedChange = (e) => {
    const mph = parseInt(e.target.value, 10)
    sim.setSimSpeed(mph)
    setState(prev => ({ ...prev, speedMph: mph }))
  }

  if (!state.ready) {
    return (
      <div style={styles.container}>
        <div style={styles.label}>SIM</div>
        <div style={{ ...styles.value, color: '#666' }}>Loading route...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.label}>SIM</div>
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${state.progressPercent}%` }} />
        </div>
        <div style={styles.percent}>{state.progressPercent.toFixed(0)}%</div>
      </div>

      {/* Play/Pause */}
      <button
        onClick={() => {
          if (!audioInitedRef.current && onInitAudio) {
            onInitAudio()
            audioInitedRef.current = true
          }
          sim.togglePause()
        }}
        style={styles.playBtn}
      >
        {state.paused ? '▶' : '⏸'}
      </button>

      {/* Speed slider */}
      <div style={styles.speedRow}>
        <span style={styles.speedLabel}>{state.speedMph}</span>
        <input
          type="range"
          min="10"
          max="80"
          step="5"
          value={state.speedMph}
          onChange={handleSpeedChange}
          style={styles.slider}
        />
        <span style={styles.speedUnit}>mph</span>
      </div>

      {/* Position info */}
      {state.position && (
        <div style={styles.posRow}>
          <span style={styles.posText}>
            {state.position[1].toFixed(4)}, {state.position[0].toFixed(4)}
          </span>
          <span style={styles.posText}>
            {state.heading.toFixed(0)}°
          </span>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    top: '12px',
    right: '12px',
    zIndex: 9999,
    background: 'rgba(8, 11, 18, 0.92)',
    border: '1px solid rgba(232, 98, 44, 0.4)',
    borderRadius: '10px',
    padding: '10px 12px',
    minWidth: '180px',
    backdropFilter: 'blur(12px)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  label: {
    fontSize: '9px',
    fontWeight: 700,
    color: '#E8622C',
    letterSpacing: '1px',
    fontFamily: "'JetBrains Mono', monospace",
  },
  progressBar: {
    flex: 1,
    height: '3px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#E8622C',
    borderRadius: '2px',
    transition: 'width 0.5s ease',
  },
  percent: {
    fontSize: '9px',
    color: '#666',
    minWidth: '24px',
    textAlign: 'right',
  },
  playBtn: {
    width: '100%',
    padding: '6px',
    marginBottom: '8px',
    background: 'rgba(232, 98, 44, 0.15)',
    border: '1px solid rgba(232, 98, 44, 0.3)',
    borderRadius: '6px',
    color: '#E8622C',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  speedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  speedLabel: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#fff',
    minWidth: '24px',
    textAlign: 'right',
  },
  slider: {
    flex: 1,
    height: '4px',
    accentColor: '#E8622C',
    cursor: 'pointer',
  },
  speedUnit: {
    fontSize: '9px',
    color: '#666',
  },
  posRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '4px',
  },
  posText: {
    fontSize: '9px',
    color: '#555',
  },
  value: {
    fontSize: '11px',
    color: '#888',
    marginTop: '4px',
  },
}
