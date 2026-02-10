import { useRef, useCallback } from 'react'

// ========================================
// Diagnostic Overlay — view captured drive logs
// Extracted for use by CalloutOverlay (triple-tap) and TripSummary (button)
// ========================================

export function DiagnosticOverlay({ entries, onClose }) {
  const formatTime = (ts) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }

  const text = entries.map(e => `[${formatTime(e.timestamp)}] [${e.category}] ${e.message}`).join('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!')
    }).catch(() => {
      // Fallback for iOS
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      alert('Copied to clipboard!')
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex', flexDirection: 'column',
      padding: 'env(safe-area-inset-top, 12px) 12px 12px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={handleCopy} style={{
          background: '#E8622C', color: 'white', border: 'none',
          borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', fontSize: 14,
        }}>Copy All ({entries.length})</button>
        <button onClick={onClose} style={{
          background: '#333', color: 'white', border: 'none',
          borderRadius: 8, padding: '8px 16px', fontWeight: 'bold', fontSize: 14,
        }}>Close</button>
      </div>
      <div style={{
        flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.5,
      }}>
        {entries.length === 0
          ? 'No diagnostic entries. Only collected during real driving.'
          : text
        }
      </div>
    </div>
  )
}

// Triple-tap hook for speed display
export function useTripleTap(callback, delay = 500) {
  const tapsRef = useRef([])
  return useCallback(() => {
    const now = Date.now()
    tapsRef.current.push(now)
    // Keep only taps within the delay window
    tapsRef.current = tapsRef.current.filter(t => now - t < delay)
    if (tapsRef.current.length >= 3) {
      tapsRef.current = []
      callback()
    }
  }, [callback, delay])
}

export default DiagnosticOverlay
