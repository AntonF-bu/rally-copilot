// ================================
// Callout Engine v4
// NEW: Sweeper callouts with angle ("Sweeper right, 15 degrees")
// ================================

export const DRIVING_MODE = {
  HIGHWAY: 'highway',
  TECHNICAL: 'technical',
  URBAN: 'urban'
}

// ================================
// WARNING DISTANCES (meters)
// Based on reaction time, not just distance
// ================================

const BASE_DISTANCES = {
  highway: {
    early: 400,     // ~12 seconds at 75mph for hard curves
    main: 250,      // ~7 seconds at 75mph
    final: 100,     // ~3 seconds
  },
  technical: {
    early: 200,
    main: 120,
    final: 40,
  },
  urban: {
    early: 100,
    main: 60,
    final: 25,
  }
}

// ================================
// MINIMUM SEVERITY
// ================================

const MIN_SEVERITY = {
  highway: 1,     // Announce ALL curves on highway (including sweepers)
  technical: 1,   // Announce all
  urban: 2        // Skip sev 1 only in urban (too many tiny turns)
}

// ================================
// FUNCTIONS
// ================================

/**
 * Get warning distances scaled by speed
 */
export function getWarningDistances(mode, speedMph) {
  const base = BASE_DISTANCES[mode] || BASE_DISTANCES.technical
  
  // Scale by speed: at 30mph use base, at 60mph use 1.5x, at 90mph use 2x
  const speedFactor = Math.max(1, Math.min(2, speedMph / 45))
  
  return {
    early: Math.round(base.early * speedFactor),
    main: Math.round(base.main * speedFactor),
    final: Math.round(base.final * speedFactor)
  }
}

/**
 * Check if curve should be announced
 */
export function shouldAnnounceCurve(mode, curve) {
  if (!curve) return false
  
  // Always announce sweepers on highway
  if (curve.isSweeper && mode === DRIVING_MODE.HIGHWAY) return true
  
  // Always announce chicanes and S-curves
  if (curve.isChicane) return true
  
  // Check minimum severity for mode
  const minSev = MIN_SEVERITY[mode] || 1
  return curve.severity >= minSev
}

/**
 * Generate main callout
 * NEW: Sweeper callouts with angle
 */
export function generateCallout(mode, curve) {
  if (!curve) return null
  
  // NEW: SWEEPER - "Sweeper right, 15 degrees"
  if (curve.isSweeper) {
    const dir = curve.direction === 'LEFT' ? 'left' : 'right'
    const angle = curve.sweeperAngle || curve.totalAngle || 10
    return `Sweeper ${dir}, ${angle} degrees`
  }
  
  // CHICANE - use the FIRST turn direction
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${firstDir} ${curve.severitySequence || ''}`
  }
  
  // TECHNICAL SECTION
  if (curve.isTechnicalSection) {
    const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
    return `Technical section ${dir}, ${curve.curveCount} curves`
  }
  
  // Regular curve
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let text = `${dir} ${curve.severity}`
  
  if (curve.modifier) {
    const mods = {
      'TIGHTENS': 'tightens',
      'OPENS': 'opens', 
      'LONG': 'long',
      'HAIRPIN': 'hairpin'
    }
    text += ` ${mods[curve.modifier] || curve.modifier.toLowerCase()}`
  }
  
  return text
}

/**
 * Generate early warning (for hard curves)
 */
export function generateEarlyWarning(mode, curve) {
  if (!curve) return null
  
  // Sweepers don't need early warnings - they're gentle
  if (curve.isSweeper) return null
  
  // Only early warning for severity 4+
  if (curve.severity < 4) return null
  
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    return `Chicane ${firstDir} ahead`
  }
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return `${dir} ${curve.severity} ahead`
}

/**
 * Generate final warning (for very hard curves)
 */
export function generateFinalWarning(mode, curve) {
  if (!curve || curve.severity < 5) return null
  
  // Sweepers don't need final warnings
  if (curve.isSweeper) return null
  
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    return `${firstDir} now`
  }
  
  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  return `${dir} now`
}

// Clear callouts disabled
export function shouldCallClear() { return false }
export function generateClearCallout() { return null }

// Severity colors
export const SEVERITY_COLORS = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
  6: '#dc2626',
}

// Sweeper color (distinct from regular severity 1)
export const SWEEPER_COLOR = '#3b82f6' // Blue for sweepers

export function getSeverityColor(severity, isSweeper = false) {
  if (isSweeper) return SWEEPER_COLOR
  return SEVERITY_COLORS[severity] || '#22c55e'
}

// Voice timing
export const VOICE_CONFIG = {
  highway: { minPauseBetween: 1500 },
  technical: { minPauseBetween: 1000 },
  urban: { minPauseBetween: 1500 }
}

export default {
  DRIVING_MODE,
  getWarningDistances,
  shouldAnnounceCurve,
  generateCallout,
  generateEarlyWarning,
  generateFinalWarning,
  shouldCallClear,
  generateClearCallout,
  getSeverityColor,
  SEVERITY_COLORS,
  SWEEPER_COLOR,
  VOICE_CONFIG
}
