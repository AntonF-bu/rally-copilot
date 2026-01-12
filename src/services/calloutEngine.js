// ================================
// Callout Engine v2.1
// FIXED: Clear callouts only for technical mode
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
    baseDistance: 450,      // meters
    minReactionTime: 6,     // seconds
    earlyWarningMult: 1.8,  // early = base * this
    finalWarningDist: 150,  // meters
  },
  spirited: {
    baseDistance: 250,
    minReactionTime: 5,
    earlyWarningMult: 1.6,
    finalWarningDist: 80,
  },
  technical: {
    baseDistance: 120,
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
    speed: 0.9,           // Slower speech
    stability: 0.85,      // Smooth, consistent
    minPauseBetween: 1500, // ms between callouts
    style: 'relaxed'
  },
  spirited: {
    speed: 1.0,
    stability: 0.75,
    minPauseBetween: 1200,
    style: 'alert'
  },
  technical: {
    speed: 1.15,          // Faster speech
    stability: 0.65,      // More urgent variation
    minPauseBetween: 800,
    style: 'rapid'
  },
  urban: {
    speed: 0.9,
    stability: 0.85,
    minPauseBetween: 1500,
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
      return `${dir} ${sev}${mod ? ', ' + mod : ''}`
    },
    exit: (dir, sev) => `Exit ahead, ${dir} ${sev}`,
    straight: (dist) => dist > 1500 ? `Straight for ${Math.round(dist/1000)} kilometers` : null,
    terrain: {
      bridge: 'Bridge',
      tunnel: 'Tunnel ahead', 
      climbing: 'Climbing',
      descending: 'Downhill section'
    },
    engagement: [
      'Smooth road ahead',
      'Nice stretch',
      'Enjoy the drive'
    ]
  },
  spirited: {
    curve: (dir, sev, mod) => `${dir} ${sev}${mod ? ', ' + mod : ''}`,
    // NO straight/clear callouts for spirited - just announce curves
    straight: () => null
  },
  technical: {
    curve: (dir, sev, mod, speed) => {
      let call = `${dir} ${sev}`
      if (mod) call += ` ${mod}`
      if (sev >= 5 && speed) call += `, ${speed}`
      return call
    },
    sequence: (curves) => {
      // Link multiple curves: "Left 4 into right 2"
      return curves.map((c, i) => {
        const dir = c.direction === 'LEFT' ? 'left' : 'right'
        if (i === 0) return `${dir.charAt(0).toUpperCase() + dir.slice(1)} ${c.severity}`
        return `into ${dir} ${c.severity}`
      }).join(' ')
    },
    clear: (dist) => {
      if (dist > 300) return `Clear, ${Math.round(dist/50)*50} meters`
      if (dist > 150) return 'Clear ahead'
      return null // Don't say anything for short straights
    },
    push: 'Opens, push',
    breathe: 'Breathe'
  },
  urban: {
    curve: (dir, sev) => sev >= 4 ? `Sharp ${dir.toLowerCase()}` : null,
    uturn: 'U-turn ahead'
  }
}

// ================================
// MODE DETECTION
// ================================

/**
 * Determine driving mode from multiple signals
 * Priority: Road data > User speed > Census density
 */
export function detectDrivingMode(signals) {
  const { 
    roadClass, 
    speedLimit, 
    userSpeed, 
    curveDensity, 
    censusCategory,
    curveAvgSeverity 
  } = signals

  // HIGHWAY: Strong signals from road data
  const isHighwayRoad = ['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadClass)
  const isHighwaySpeed = speedLimit >= 55 || userSpeed >= 55
  
  if (isHighwayRoad || (isHighwaySpeed && roadClass !== 'residential')) {
    return DRIVING_MODE.HIGHWAY
  }

  // TECHNICAL: Curve-heavy sections
  const isTechnicalCurves = curveDensity >= 3 || (curveDensity >= 2 && curveAvgSeverity >= 3.5)
  const isRuralArea = censusCategory === 'rural'
  const isSlowRoad = speedLimit <= 35 || userSpeed <= 35
  
  if (isTechnicalCurves || (isRuralArea && isSlowRoad)) {
    return DRIVING_MODE.TECHNICAL
  }

  // URBAN: Dense area + low speeds + sparse curves
  const isUrbanArea = censusCategory === 'urban'
  const isLowSpeed = speedLimit <= 30 && userSpeed <= 30
  const isSparseCurves = curveDensity < 2
  
  if (isUrbanArea && isLowSpeed && isSparseCurves) {
    return DRIVING_MODE.URBAN
  }

  // Default: SPIRITED
  return DRIVING_MODE.SPIRITED
}

/**
 * Adjust mode parameters based on user speed vs expected
 */
export function adjustForUserSpeed(mode, userSpeed, expectedSpeed) {
  const config = { ...TIMING_CONFIG[mode] }
  const voice = { ...VOICE_CONFIG[mode] }
  
  if (!userSpeed || !expectedSpeed || expectedSpeed === 0) {
    return { timing: config, voice }
  }

  const speedRatio = userSpeed / expectedSpeed

  // User pushing hard - tighten everything
  if (speedRatio > 1.15) {
    config.baseDistance *= 1.2  // Earlier warnings
    voice.speed *= 1.1          // Faster speech
    voice.minPauseBetween *= 0.8  // Less gap between calls
  }
  
  // User going slower - relax
  if (speedRatio < 0.85) {
    config.baseDistance *= 0.9
    voice.minPauseBetween *= 1.2
  }

  return { timing: config, voice }
}

// ================================
// TIMING CALCULATIONS
// ================================

/**
 * Calculate warning distances for a curve
 */
export function getWarningDistances(mode, userSpeedMph, expectedSpeedMph) {
  const { timing } = adjustForUserSpeed(mode, userSpeedMph, expectedSpeedMph)
  
  const userSpeedMps = (userSpeedMph * 1609.34) / 3600  // Convert to m/s
  const minDistance = userSpeedMps * timing.minReactionTime
  
  return {
    early: Math.max(timing.baseDistance * timing.earlyWarningMult, minDistance * 1.5),
    main: Math.max(timing.baseDistance, minDistance),
    final: Math.max(timing.finalWarningDist, minDistance * 0.5)
  }
}

/**
 * Check if it's time for a "clear" callout
 * FIXED: Only enable for TECHNICAL mode, and with stricter conditions
 */
export function shouldCallClear(mode, timeSinceLastCallout, distanceToNextCurve) {
  // ONLY technical mode gets clear callouts
  if (mode !== DRIVING_MODE.TECHNICAL) {
    return false
  }
  
  // Must have significant distance to next curve (> 400m = real straight)
  if (distanceToNextCurve < 400) {
    return false
  }
  
  // Must have been silent for a while (> 8 seconds)
  if (timeSinceLastCallout < 8000) {
    return false
  }
  
  return true
}

// ================================
// CALLOUT GENERATION
// ================================

/**
 * Generate callout text based on mode and curve
 */
export function generateModeCallout(mode, curve, phase, options = {}) {
  const { speedUnit = 'mph', nextCurve = null, distanceToNext = null } = options
  
  const templates = CALLOUT_TEMPLATES[mode]
  if (!templates) return null

  const dir = curve.isChicane 
    ? (curve.startDirection === 'LEFT' ? 'Left' : 'Right')
    : (curve.direction === 'LEFT' ? 'Left' : 'Right')
  
  const modifier = getModifierText(curve)
  const speed = getSpeedText(curve.severity, speedUnit)

  // Phase-specific callouts
  switch (phase) {
    case 'early':
      if (mode === DRIVING_MODE.HIGHWAY) {
        return curve.isExitRamp 
          ? templates.exit(dir.toLowerCase(), curve.severity)
          : templates.curve(dir.toLowerCase(), curve.severity, modifier)
      }
      return `${dir} ${curve.severity} ahead${modifier ? ', ' + modifier : ''}`
    
    case 'main':
      if (mode === DRIVING_MODE.TECHNICAL) {
        return templates.curve(dir, curve.severity, modifier, curve.severity >= 5 ? speed : null)
      }
      return templates.curve(dir.toLowerCase(), curve.severity, modifier)
    
    case 'final':
      if (curve.severity >= 5) {
        return `${dir} ${curve.severity} now!`
      }
      return `${dir} now`
    
    case 'clear':
      // Only technical mode has clear template
      if (mode === DRIVING_MODE.TECHNICAL && templates.clear) {
        return templates.clear(distanceToNext)
      }
      return null
    
    default:
      return templates.curve(dir.toLowerCase(), curve.severity, modifier)
  }
}

/**
 * Generate chicane/sequence callout
 */
export function generateChicaneCallout(mode, chicane, phase) {
  const startDir = chicane.startDirection === 'LEFT' ? 'left' : 'right'
  const endDir = chicane.endDirection === 'LEFT' ? 'left' : 'right'
  const type = chicane.chicaneType === 'CHICANE' ? 'Chicane' : 'S-curve'
  
  if (mode === DRIVING_MODE.TECHNICAL) {
    if (phase === 'final') {
      return `${type} ${startDir} now!`
    }
    return `${type} ${startDir}-${endDir} ${chicane.severitySequence}`
  }
  
  if (mode === DRIVING_MODE.HIGHWAY) {
    return `${type} ahead`
  }
  
  return `${type} ${startDir}-${endDir} ${chicane.severitySequence}`
}

/**
 * Generate straight/clear callout
 * FIXED: Only for technical mode, with reasonable distances
 */
export function generateClearCallout(mode, distanceMeters, nextCurve, speedUnit) {
  // ONLY technical mode gets clear callouts
  if (mode !== DRIVING_MODE.TECHNICAL) {
    return null
  }
  
  // Only announce if there's a real straight (> 400m)
  if (distanceMeters < 400) {
    return null
  }
  
  // Format distance
  const distText = speedUnit === 'kmh' 
    ? `${Math.round(distanceMeters/100)*100} meters`
    : `${Math.round(distanceMeters * 3.28084 / 500) * 500} feet` // Round to 500ft
  
  return `Clear, ${distText}`
}

/**
 * Generate terrain/POI callout (highway mode)
 */
export function generateTerrainCallout(terrainType) {
  const terrain = CALLOUT_TEMPLATES.highway.terrain
  return terrain[terrainType] || null
}

/**
 * Generate engagement callout (highway mode, prevent boredom)
 */
export function generateEngagementCallout() {
  const options = CALLOUT_TEMPLATES.highway.engagement
  return options[Math.floor(Math.random() * options.length)]
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
// SEVERITY COLORS (for route line)
// ================================

export const SEVERITY_COLORS = {
  clear: '#22c55e',     // Green - straight/easy
  severity1: '#22c55e', // Green
  severity2: '#84cc16', // Lime
  severity3: '#eab308', // Yellow
  severity4: '#f97316', // Orange
  severity5: '#ef4444', // Red
  severity6: '#dc2626', // Dark red
}

/**
 * Get color for a severity level
 */
export function getSeverityColor(severity) {
  if (!severity || severity < 1) return SEVERITY_COLORS.clear
  if (severity === 1) return SEVERITY_COLORS.severity1
  if (severity === 2) return SEVERITY_COLORS.severity2
  if (severity === 3) return SEVERITY_COLORS.severity3
  if (severity === 4) return SEVERITY_COLORS.severity4
  if (severity === 5) return SEVERITY_COLORS.severity5
  return SEVERITY_COLORS.severity6
}

/**
 * Get gradient warning distance based on mode
 */
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
  detectDrivingMode,
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
