// ================================
// Callout Engine v3.1
// FIXED: Announce ALL curves (including sev 1), proper chicane direction
// ================================

export const DRIVING_MODE = {
  HIGHWAY: 'highway',
  SPIRITED: 'spirited', 
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
  spirited: {
    early: 300,
    main: 180,
    final: 60,
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
// MINIMUM SEVERITY - NOW ANNOUNCES ALL!
// ================================

const MIN_SEVERITY = {
  highway: 1,     // FIXED: Announce ALL curves on highway
  spirited: 1,    // Announce all
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
  const base = BASE_DISTANCES[mode] || BASE_DISTANCES.spirited
  
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
 * FIXED: Now announces severity 1 curves too!
 */
export function shouldAnnounceCurve(mode, curve) {
  if (!curve) return false
  
  // Always announce chicanes and S-curves
  if (curve.isChicane) return true
  
  // Check minimum severity for mode
  const minSev = MIN_SEVERITY[mode] || 1
  return curve.severity >= minSev
}

/**
 * Generate main callout
 * FIXED: Use correct direction for chicanes
 */
export function generateCallout(mode, curve) {
  if (!curve) return null
  
  // CHICANE - use the FIRST turn direction
  if (curve.isChicane) {
    // The startDirection tells us which way we turn FIRST
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${firstDir} ${curve.severitySequence || ''}`
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

export function getSeverityColor(severity) {
  return SEVERITY_COLORS[severity] || '#22c55e'
}

// Voice timing
export const VOICE_CONFIG = {
  highway: { minPauseBetween: 1500 },
  spirited: { minPauseBetween: 1200 },
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
  VOICE_CONFIG
}
