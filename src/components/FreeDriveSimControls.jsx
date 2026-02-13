import { useState, useEffect, useRef } from 'react'

// ================================
// Free Drive Sim Controls - v2
// Compact corner overlay for play/pause,
// speed slider, position readout, and log panel.
// Intercepts console.log for [FreeDrive] messages.
// ================================

// Capture [FreeDrive] logs into a shared buffer
const LOG_BUFFER = []
const MAX_LOGS = 60
const LOG_LISTENERS = new Set()

// Monkey-patch console.log once to capture [FreeDrive] messages
const _origLog = console.log
const _origWarn = console.warn
let _patched = false

function patchConsole() {
  if (_patched) return
  _patched = true

  console.log = function (...args) {
    _origLog.apply(console, args)
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (msg.includes('[FreeDrive]')) {
      const entry = { time: Date.now(), msg: msg.replace('[FreeDrive] ', '') }
      LOG_BUFFER.push(entry)
      if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.shift()
      LOG_LISTENERS.forEach(fn => fn())
    }
  }

  console.warn = function (...args) {
    _origWarn.apply(console, args)
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    if (msg.includes('[FreeDrive]')) {
      const entry = { time: Date.now(), msg: '⚠️ ' + msg.replace('[FreeDrive] ', '') }
      LOG_BUFFER.push(entry)
      if (LOG_BUFFER.length > MAX_LOGS) LOG_BUFFER.shift()
      LOG_LISTENERS.forEach(fn => fn())
    }
  }
}

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
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(true)
  const logEndRef = useRef(null)

  const intervalRef = useRef(null)

  // Start log capture
  useEffect(() => {
    patchConsole()

    const listener = () => {
      setLogs([...LOG_BUFFER])
    }
    LOG_LISTENERS.add(listener)
    return () => LOG_LISTENERS.delete(listener)
  }, [])

  // Auto-scroll log panel
  useEffect(() => {
    if (logEndRef.current && showLogs) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

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

  const formatTime = (ts) => {
    const d = new Date(ts)
    return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  }

  // Color code log lines
  const getLogColor = (msg) => {
    if (msg.includes('Speech')) return '#E8622C'
    if (msg.includes('Curve')) return '#00E68A'
    if (msg.includes('API')) return '#66B3FF'
    if (msg.includes('Road')) return '#eab308'
    if (msg.includes('🗺️')) return '#a855f7'
    if (msg.includes('⚠️')) return '#ff6b6b'
    if (msg.includes('Tick')) return '#555'
    return '#888'
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
        {state.paused ? '▶  PLAY' : '⏸  PAUSE'}
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

      {/* Log panel toggle */}
      <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
        <button
          onClick={() => setShowLogs(!showLogs)}
          style={{ ...styles.logToggle, color: showLogs ? '#E8622C' : '#555' }}
        >
          {showLogs ? '▼' : '▶'} LOGS ({logs.length})
        </button>
      </div>

      {/* Log panel */}
      {showLogs && (
        <div style={styles.logPanel}>
          {logs.length === 0 && (
            <div style={{ color: '#444', fontSize: '9px', padding: '4px 0' }}>
              Waiting for [FreeDrive] logs...
            </div>
          )}
          {logs.slice(-30).map((entry, i) => (
            <div key={i} style={{ ...styles.logLine, color: getLogColor(entry.msg) }}>
              <span style={styles.logTime}>{formatTime(entry.time)}</span>
              {entry.msg}
            </div>
          ))}
          <div ref={logEndRef} />
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
    background: 'rgba(8, 11, 18, 0.95)',
    border: '1px solid rgba(232, 98, 44, 0.4)',
    borderRadius: '10px',
    padding: '10px 12px',
    minWidth: '200px',
    maxWidth: '340px',
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
    padding: '8px',
    marginBottom: '8px',
    background: 'rgba(232, 98, 44, 0.15)',
    border: '1px solid rgba(232, 98, 44, 0.3)',
    borderRadius: '6px',
    color: '#E8622C',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.5px',
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
  logToggle: {
    background: 'none',
    border: 'none',
    fontSize: '8px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    padding: 0,
  },
  logPanel: {
    marginTop: '4px',
    maxHeight: '200px',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarWidth: 'thin',
  },
  logLine: {
    fontSize: '8px',
    lineHeight: '13px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  logTime: {
    color: '#333',
    marginRight: '4px',
  },
}
