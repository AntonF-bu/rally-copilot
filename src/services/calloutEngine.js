// ================================
// Callout Engine v3.0
// FIXED: Proper warning distances for highway speeds
// Simplified and reliable
// ================================

export const DRIVING_MODE = {
  HIGHWAY: 'highway',
  SPIRITED: 'spirited', 
  TECHNICAL: 'technical',
  URBAN: 'urban'
}

// ================================
// WARNING DISTANCES - FIXED FOR HIGH SPEED
// At 75 MPH (33.5 m/s), you travel 500m in 15 seconds
// ================================

const TIMING_CONFIG = {
  highway: {
    earlyDistance: 800,    // ~24 seconds at 75mph - announce hard curves early
    mainDistance: 500,     // ~15 seconds at 75mph - main callout
    finalDistance: 200,    // ~6 seconds at 75mph - final warning
  },
  spirited: {
    earlyDistance: 400,
    mainDistance: 250,
    finalDistance: 100,
  },
  technical: {
    earlyDistance: 250,
    mainDistance: 150,
    finalDistance: 50,
  },
  urban: {
    earlyDistance: 150,
    mainDistance: 80,
    finalDistance: 30,
  }
}

// Minimum severity to announce per mode
const MIN_SEVERITY = {
  highway: 2,     // Announce sev 2+ on highway
  spirited: 2,    // Announce sev 2+
  technical: 2,   // Announce sev 2+
  urban: 3        // Only sev 3+ in urban
}

// ================================
// EXPORTS
// ================================

/**
 * Get warning distances for a mode and speed
 */
export function getWarningDistances(mode, speedMph) {
  const config = TIMING_CONFIG[mode] || TIMING_CONFIG.spirited
  
  // Scale distances based on speed
  // At 30 mph, use base distances
  // At 60 mph, use 1.5x distances
  // At 90 mph, use 2x distances
  const speedFactor = Math.max(1, speedMph / 40)
  
  return {
    early: Math.round(config.earlyDistance * speedFactor),
    main: Math.round(config.mainDistance * speedFactor),
    final: Math.round(config.finalDistance * speedFactor)
  }
}

/**
 * Check if curve should be announced
 */
export function shouldAnnounceCurve(mode, curve) {
  if (!curve) return false
  
  // Always announce chicanes
  if (curve.isChicane) return true
  
  // Always announce severity 3+
  if (curve.severity >= 3) return true
  
  // Check mode-specific minimum
  const minSev = MIN_SEVERITY[mode] || 2
  return curve.severity >= minSev
}

/**
 * Generate main callout text
 */
export function generateCallout(mode, curve) {
  if (!curve) return null
  
  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  // Chicane
  if (curve.isChicane) {
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${curve.severitySequence}`
  }
  
  // Regular curve
  let text = `${dir} ${curve.severity}`
  
  // Add modifier
  if (curve.modifier) {
    const mods = {
      'TIGHTENS': 'tightens',
      'OPENS': 'opens', 
      'LONG': 'long',
      'HAIRPIN': 'hairpin'
    }
    const mod = mods[curve.modifier] || curve.modifier.toLowerCase()
    text += ` ${mod}`
  }
  
  return text
}

/**
 * Generate early warning callout
 */
export function generateEarlyWarning(mode, curve) {
  if (!curve) return null
  
  const dir = curve.isChicane
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  if (curve.isChicane) {
    return `Chicane ahead`
  }
  
  return `${dir} ${curve.severity} ahead`
}

/**
 * Generate final warning callout
 */
export function generateFinalWarning(mode, curve) {
  if (!curve) return null
  
  const dir = curve.isChicane
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  if (curve.severity >= 5) {
    return `${dir} now`
  }
  return null // No final warning for easier curves
}

// No clear callouts - disabled
export function shouldCallClear() { return false }
export function generateClearCallout() { return null }

// Severity colors for route display
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

// Voice config (simplified)
export const VOICE_CONFIG = {
  highway: { minPauseBetween: 2000 },
  spirited: { minPauseBetween: 1500 },
  technical: { minPauseBetween: 1200 },
  urban: { minPauseBetween: 2000 }
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
