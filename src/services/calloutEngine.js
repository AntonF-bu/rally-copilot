// ================================
// Callout Engine v2.3
// FIXED: More lenient curve filtering, disabled clear callouts
// ================================

import { ROUTE_CHARACTER, CHARACTER_BEHAVIORS } from './zoneService'

// ================================
// MODE DEFINITIONS
// ================================

export const DRIVING_MODE = {
  HIGHWAY: 'highway',
  SPIRITED: 'spirited', 
  TECHNICAL: 'technical',
  URBAN: 'urban'
}

// ================================
// TIMING CONFIGURATION
// ================================

const TIMING_CONFIG = {
  highway: {
    baseDistance: 450,
    minReactionTime: 6,
    earlyWarningMult: 1.8,
    finalWarningDist: 150,
  },
  spirited: {
    baseDistance: 250,
    minReactionTime: 5,
    earlyWarningMult: 1.6,
    finalWarningDist: 80,
  },
  technical: {
    baseDistance: 150,      // Increased from 120 for earlier warnings
    minReactionTime: 3,
    earlyWarningMult: 1.5,
    finalWarningDist: 40,
  },
  urban: {
    baseDistance: 80,
    minReactionTime: 3,
    earlyWarningMult: 1.4,
    finalWarningDist: 30,
  }
}

// ================================
// VOICE/PACING CONFIGURATION  
// ================================

export const VOICE_CONFIG = {
  highway: {
    speed: 0.9,
    stability: 0.85,
    minPauseBetween: 2500,
    style: 'relaxed'
  },
  spirited: {
    speed: 1.0,
    stability: 0.75,
    minPauseBetween: 2000,
    style: 'alert'
  },
  technical: {
    speed: 1.05,
    stability: 0.80,
    minPauseBetween: 1500,  // 1.5 seconds minimum between callouts
    style: 'rapid'
  },
  urban: {
    speed: 0.9,
    stability: 0.85,
    minPauseBetween: 2500,
    style: 'casual'
  }
}

// ================================
// CONTENT TEMPLATES
// ================================

const CALLOUT_TEMPLATES = {
  highway: {
    curve: (dir, sev, mod) => {
      if (sev <= 2) return `${mod ? mod + ' ' : ''}${dir}`
      return `${dir} ${sev}${mod ? ' ' + mod : ''}`
    },
    exit: (dir, sev) => `Exit ahead, ${dir} ${sev}`,
    straight: (dist) => dist > 1500 ? `Straight for ${Math.round(dist/1000)} kilometers` : null,
    terrain: {
      bridge: 'Bridge',
      tunnel: 'Tunnel ahead', 
      climbing: 'Climbing',
      descending: 'Downhill section'
    }
  },
  spirited: {
    curve: (dir, sev, mod) => `${dir} ${sev}${mod ? ' ' + mod : ''}`,
    straight: () => null
  },
  technical: {
    curve: (dir, sev, mod, speed) => {
      let call = `${dir} ${sev}`
      if (mod) call += ` ${mod}`
      return call
    },
    sequence: (curves) => {
      return curves.map((c, i) => {
        const dir = c.direction === 'LEFT' ? 'left' : 'right'
        if (i === 0) return `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${c.severity}`
        return `into ${dir} ${c.severity}`
      }).join(' ')
    },
    clear: (dist) => null, // DISABLED - clear callouts were causing issues
    push: 'Opens, push',
    breathe: 'Breathe'
  },
  urban: {
    curve: (dir, sev) => sev >= 4 ? `Sharp ${dir.toLowerCase()}` : null,
    uturn: 'U-turn ahead'
  }
}

// ================================
// MINIMUM SEVERITY BY MODE
// ================================

export const MIN_SEVERITY_BY_MODE = {
  highway: 3,
  spirited: 2,
  technical: 2,  // Announce severity 2+ in technical
  urban: 4
}

// ================================
// MODE DETECTION
// ================================

export function detectDrivingMode(signals) {
  const { 
    roadClass, 
    speedLimit, 
    userSpeed, 
    curveDensity, 
    censusCategory,
    curveAvgSeverity 
  } = signals

  const isHighwayRoad = ['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadClass)
  const isHighwaySpeed = speedLimit >= 55 || userSpeed >= 55
  
  if (isHighwayRoad || (isHighwaySpeed && roadClass !== 'residential')) {
    return DRIVING_MODE.HIGHWAY
  }

  const isTechnicalCurves = curveDensity >= 3 || (curveDensity >= 2 && curveAvgSeverity >= 3.5)
  const isRuralArea = censusCategory === 'rural'
  const isSlowRoad = speedLimit <= 35 || userSpeed <= 35
  
  if (isTechnicalCurves || (isRuralArea && isSlowRoad)) {
    return DRIVING_MODE.TECHNICAL
  }

  const isUrbanArea = censusCategory === 'urban'
  const isLowSpeed = speedLimit <= 30 && userSpeed <= 30
  const isSparseCurves = curveDensity < 2
  
  if (isUrbanArea && isLowSpeed && isSparseCurves) {
    return DRIVING_MODE.URBAN
  }

  return DRIVING_MODE.SPIRITED
}

/**
 * Check if a curve should be announced based on mode
 */
export function shouldAnnounceCurveInMode(mode, curve) {
  // Always announce chicanes
  if (curve.isChicane) return true
  
  // Always announce severity 3+ regardless of mode
  if (curve.severity >= 3) return true
  
  // In technical mode, also announce severity 2
  if (mode === DRIVING_MODE.TECHNICAL && curve.severity >= 2) return true
  
  // In spirited mode, announce severity 2+
  if (mode === DRIVING_MODE.SPIRITED && curve.severity >= 2) return true
  
  // Skip severity 1 in all modes (too gentle to matter)
  return false
}

/**
 * Adjust mode parameters based on user speed
 */
export function adjustForUserSpeed(mode, userSpeed, expectedSpeed) {
  const config = { ...TIMING_CONFIG[mode] }
  const voice = { ...VOICE_CONFIG[mode] }
  
  if (!userSpeed || !expectedSpeed || expectedSpeed === 0) {
    return { timing: config, voice }
  }

  const speedRatio = userSpeed / expectedSpeed

  if (speedRatio > 1.15) {
    config.baseDistance *= 1.3  // Even earlier warnings when fast
    voice.minPauseBetween *= 0.9
  }
  
  if (speedRatio < 0.85) {
    config.baseDistance *= 0.9
    voice.minPauseBetween *= 1.1
  }

  return { timing: config, voice }
}

// ================================
// TIMING CALCULATIONS
// ================================

export function getWarningDistances(mode, userSpeedMph, expectedSpeedMph) {
  const { timing } = adjustForUserSpeed(mode, userSpeedMph, expectedSpeedMph)
  
  const userSpeedMps = (userSpeedMph * 1609.34) / 3600
  const minDistance = userSpeedMps * timing.minReactionTime
  
  return {
    early: Math.max(timing.baseDistance * timing.earlyWarningMult, minDistance * 1.5),
    main: Math.max(timing.baseDistance, minDistance),
    final: Math.max(timing.finalWarningDist, minDistance * 0.5)
  }
}

/**
 * Check if it's time for a "clear" callout
 * DISABLED - was causing issues
 */
export function shouldCallClear(mode, timeSinceLastCallout, distanceToNextCurve) {
  // Clear callouts disabled for now
  return false
}

// ================================
// CALLOUT GENERATION
// ================================

export function generateModeCallout(mode, curve, phase, options = {}) {
  const { speedUnit = 'mph', nextCurve = null, distanceToNext = null } = options
  
  const templates = CALLOUT_TEMPLATES[mode]
  if (!templates) return null

  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  const modifier = getModifierText(curve)

  switch (phase) {
    case 'early':
      if (mode === DRIVING_MODE.HIGHWAY) {
        return curve.isExitRamp 
          ? templates.exit(dir.toLowerCase(), curve.severity)
          : templates.curve(dir.toLowerCase(), curve.severity, modifier)
      }
      return `${dir} ${curve.severity} ahead${modifier ? ', ' + modifier : ''}`
    
    case 'main':
      return `${dir} ${curve.severity}${modifier ? ' ' + modifier : ''}`
    
    case 'final':
      if (curve.severity >= 5) {
        return `${dir} ${curve.severity} now!`
      }
      return `${dir} now`
    
    default:
      return `${dir} ${curve.severity}${modifier ? ' ' + modifier : ''}`
  }
}

export function generateChicaneCallout(mode, chicane, phase) {
  const startDir = chicane.startDirection === 'LEFT' ? 'left' : 'right'
  const endDir = chicane.endDirection === 'LEFT' ? 'left' : 'right'
  const type = chicane.chicaneType === 'CHICANE' ? 'Chicane' : 'S-curve'
  
  if (phase === 'final') {
    return `${type} ${startDir} now!`
  }
  return `${type} ${startDir}-${endDir} ${chicane.severitySequence}`
}

/**
 * Generate clear callout - DISABLED
 */
export function generateClearCallout(mode, distanceMeters, nextCurve, speedUnit) {
  // Clear callouts disabled
  return null
}

export function generateTerrainCallout(terrainType) {
  const terrain = CALLOUT_TEMPLATES.highway.terrain
  return terrain[terrainType] || null
}

export function generateEngagementCallout() {
  return null // Disabled
}

// ================================
// HELPER FUNCTIONS
// ================================

function getModifierText(curve) {
  if (!curve.modifier) return null
  
  const modMap = {
    'TIGHTENS': 'tightens',
    'OPENS': 'opens',
    'LONG': 'long',
    'HAIRPIN': 'hairpin',
    'OVER_CREST': 'over crest',
    'LATE_APEX': 'late apex',
    'DONT_CUT': "don't cut"
  }
  
  return modMap[curve.modifier] || curve.modifier.toLowerCase()
}

function getSpeedText(severity, speedUnit) {
  const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 24, 6: 18 }
  let speed = speeds[severity] || 40
  
  if (speedUnit === 'kmh') {
    speed = Math.round(speed * 1.609)
  }
  
  return speed.toString()
}

// ================================
// SEVERITY COLORS
// ================================

export const SEVERITY_COLORS = {
  clear: '#22c55e',
  severity1: '#22c55e',
  severity2: '#84cc16',
  severity3: '#eab308',
  severity4: '#f97316',
  severity5: '#ef4444',
  severity6: '#dc2626',
}

export function getSeverityColor(severity) {
  if (!severity || severity < 1) return SEVERITY_COLORS.clear
  if (severity === 1) return SEVERITY_COLORS.severity1
  if (severity === 2) return SEVERITY_COLORS.severity2
  if (severity === 3) return SEVERITY_COLORS.severity3
  if (severity === 4) return SEVERITY_COLORS.severity4
  if (severity === 5) return SEVERITY_COLORS.severity5
  return SEVERITY_COLORS.severity6
}

export function getGradientDistance(mode) {
  const distances = {
    highway: 300,
    spirited: 200,
    technical: 100,
    urban: 50
  }
  return distances[mode] || 150
}

// ================================
// EXPORTS
// ================================

export default {
  DRIVING_MODE,
  TIMING_CONFIG,
  VOICE_CONFIG,
  MIN_SEVERITY_BY_MODE,
  detectDrivingMode,
  shouldAnnounceCurveInMode,
  adjustForUserSpeed,
  getWarningDistances,
  shouldCallClear,
  generateModeCallout,
  generateChicaneCallout,
  generateClearCallout,
  generateTerrainCallout,
  generateEngagementCallout,
  getSeverityColor,
  getGradientDistance,
  SEVERITY_COLORS
}
