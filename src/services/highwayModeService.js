// ================================
// Highway Mode Service v1.0
// Enhances highway driving with sweeper detection and mode-specific features
// 
// This is an ADDITIVE service - it does NOT modify existing curve detection.
// It post-processes existing curve data to add highway-specific features.
// ================================

// ================================
// CONSTANTS & CONFIGURATION
// ================================

export const HIGHWAY_MODE = {
  BASIC: 'basic',      // Clean co-driver: sweepers, elevation, milestones
  COMPANION: 'companion' // Full engagement: chatter, stats, gamification
}

// Sweeper thresholds - these are GENTLE curves the normal system might skip
const SWEEPER_CONFIG = {
  minAngle: 8,        // Minimum degrees to qualify as sweeper (already detected)
  maxAngle: 25,       // Above this, it's a real curve, not a sweeper
  minLength: 150,     // Minimum curve length in meters (sweepers are long and gentle)
  maxSeverity: 2      // Sweepers are severity 1-2 max
}

// Callout templates
const SWEEPER_CALLOUTS = {
  basic: (direction, angle) => `Sweeper ${direction}, ${Math.round(angle)} degrees`,
  companion: (direction, angle) => `Sweeper ${direction}, ${Math.round(angle)} degrees`
}

// Silence breaker chatter pool (for Companion mode)
const SILENCE_BREAKERS = [
  'All clear ahead',
  'Smooth stretch coming up',
  'Road\'s looking good',
  'Nice and easy here',
  'Straight shot for a bit',
  'Open road ahead',
  'Cruising',
  'Highway\'s clear',
  'Smooth sailing'
]

// After-sweeper feedback (Companion mode)
const SWEEPER_FEEDBACK = [
  'Clean line',
  'Smooth',
  'Nice and steady',
  'Good carry',
  'Nailed it'
]

// Progress callout templates
const PROGRESS_TEMPLATES = {
  quarterWay: 'Quarter of the way there',
  halfway: 'Halfway',
  threeQuarters: 'Three quarters done',
  tenMiles: '10 miles to go',
  fiveMiles: '5 miles to go',
  oneMile: '1 mile to destination'
}

// Stats callout templates
const STATS_TEMPLATES = {
  sweepersCleared: (count) => `${count} sweepers cleared`,
  averageSpeed: (speed) => `Averaging ${Math.round(speed)}, solid pace`,
  sectionComplete: (sweepers, miles, avgSpeed) => 
    `Highway section complete. ${sweepers} sweepers, ${Math.round(miles)} miles, averaging ${Math.round(avgSpeed)}.`
}


// ================================
// SWEEPER DETECTION
// Post-processes existing curve data to identify sweepers
// ================================

/**
 * Analyze curves and tag sweepers for highway zones
 * Does NOT modify original curves - returns enhanced copy
 * 
 * @param {Array} curves - Existing curve data from curveDetection.js
 * @param {Array} segments - Route character segments from zoneService.js
 * @returns {Array} - Curves with added sweeper metadata
 */
export function identifySweepers(curves, segments) {
  if (!curves?.length) return []
  
  // Find highway (transit) segments
  const highwaySegments = segments?.filter(s => s.character === 'transit') || []
  
  return curves.map(curve => {
    // Check if curve is in a highway segment
    const inHighway = isInHighwaySegment(curve, highwaySegments)
    
    if (!inHighway) {
      return curve // Not on highway, return unchanged
    }
    
    // Check if this qualifies as a sweeper
    const isSweeper = checkIfSweeper(curve)
    
    if (isSweeper) {
      return {
        ...curve,
        isSweeper: true,
        sweeperAngle: curve.angle || curve.totalAngle || estimateAngle(curve),
        sweeperDirection: curve.direction === 'LEFT' ? 'left' : 'right',
        inHighwayZone: true
      }
    }
    
    // Regular curve on highway
    return {
      ...curve,
      inHighwayZone: true
    }
  })
}

/**
 * Check if a curve falls within a highway segment
 */
function isInHighwaySegment(curve, highwaySegments) {
  if (!highwaySegments?.length) return false
  
  const curveDistance = curve.distanceFromStart || 0
  
  return highwaySegments.some(seg => 
    curveDistance >= seg.startDistance && curveDistance <= seg.endDistance
  )
}

/**
 * Determine if a curve qualifies as a sweeper
 */
function checkIfSweeper(curve) {
  // Must be low severity
  if (curve.severity > SWEEPER_CONFIG.maxSeverity) return false
  
  // Get angle (different curve objects store this differently)
  const angle = curve.angle || curve.totalAngle || Math.abs(curve.totalHeadingChange) || 0
  
  // Must be within sweeper angle range
  if (angle < SWEEPER_CONFIG.minAngle || angle > SWEEPER_CONFIG.maxAngle) return false
  
  // Prefer longer curves (sweepers are gentle and extended)
  const length = curve.length || 0
  if (length > 0 && length < SWEEPER_CONFIG.minLength * 0.5) return false
  
  return true
}

/**
 * Estimate angle from severity if not directly available
 */
function estimateAngle(curve) {
  // Rough mapping: severity 1 ≈ 10-15°, severity 2 ≈ 15-25°
  const severityToAngle = {
    1: 12,
    2: 20
  }
  return severityToAngle[curve.severity] || 15
}


// ================================
// CALLOUT GENERATION
// ================================

/**
 * Generate highway-specific callout for a curve
 * 
 * @param {Object} curve - Curve with sweeper metadata
 * @param {string} highwayMode - 'basic' or 'companion'
 * @returns {Object} - Callout config { text, type, priority }
 */
export function generateHighwayCallout(curve, highwayMode = HIGHWAY_MODE.BASIC) {
  if (!curve) return null
  
  // Check if it's a sweeper
  if (curve.isSweeper) {
    const direction = curve.sweeperDirection || (curve.direction === 'LEFT' ? 'left' : 'right')
    const angle = curve.sweeperAngle || estimateAngle(curve)
    
    return {
      text: SWEEPER_CALLOUTS[highwayMode](direction, angle),
      type: 'sweeper',
      priority: 2,
      curve: curve
    }
  }
  
  // Regular curve on highway - use standard callout
  // (The existing calloutEngine handles this)
  return null
}

/**
 * Generate apex timing callout (Companion mode only)
 * Returns a delayed callout to be queued
 */
export function generateApexCallout(curve, currentSpeed) {
  if (!curve?.isSweeper) return null
  
  // Calculate time to apex (middle of curve)
  const curveLength = curve.length || 200 // Default estimate
  const speedMetersPerSec = (currentSpeed * 1609.34) / 3600 // mph to m/s
  const timeToApex = (curveLength / 2) / speedMetersPerSec
  
  return {
    text: 'Apex... now',
    type: 'apex',
    priority: 1,
    delayMs: Math.max(500, timeToApex * 1000 - 500), // Slightly early
    curve: curve
  }
}


// ================================
// COMPANION MODE: CHATTER SYSTEM
// ================================

/**
 * Get silence breaker if enough time has passed
 * 
 * @param {number} lastCalloutTime - Timestamp of last callout
 * @param {number} lastChatterTime - Timestamp of last chatter
 * @returns {Object|null} - Chatter callout or null
 */
export function getSilenceBreaker(lastCalloutTime, lastChatterTime) {
  const now = Date.now()
  const timeSinceCallout = now - lastCalloutTime
  const timeSinceChatter = now - lastChatterTime
  
  // Random threshold between 45-60 seconds
  const silenceThreshold = 45000 + Math.random() * 15000
  
  // Don't break silence if we just had a callout or chatter
  if (timeSinceCallout < silenceThreshold) return null
  if (timeSinceChatter < 30000) return null // At least 30s between chatter
  
  // Pick random silence breaker
  const text = SILENCE_BREAKERS[Math.floor(Math.random() * SILENCE_BREAKERS.length)]
  
  return {
    text,
    type: 'chatter',
    priority: 3 // Low priority - can be skipped if curve coming
  }
}

/**
 * Get sweeper completion feedback (Companion mode)
 */
export function getSweeperFeedback() {
  const text = SWEEPER_FEEDBACK[Math.floor(Math.random() * SWEEPER_FEEDBACK.length)]
  return {
    text,
    type: 'feedback',
    priority: 3,
    delayMs: 1500 // Slight delay after sweeper
  }
}


// ================================
// PROGRESS & STATS TRACKING
// ================================

/**
 * Check for progress milestone callouts
 * 
 * @param {number} distanceTraveled - Distance traveled in meters
 * @param {number} totalDistance - Total route distance in meters
 * @param {Set} announcedMilestones - Set of already announced milestones
 * @returns {Object|null} - Progress callout or null
 */
export function checkProgressMilestone(distanceTraveled, totalDistance, announcedMilestones) {
  if (!totalDistance) return null
  
  const progress = distanceTraveled / totalDistance
  const remainingMiles = (totalDistance - distanceTraveled) / 1609.34
  
  const milestones = [
    { id: 'quarter', check: () => progress >= 0.25 && progress < 0.3, text: PROGRESS_TEMPLATES.quarterWay },
    { id: 'half', check: () => progress >= 0.50 && progress < 0.55, text: PROGRESS_TEMPLATES.halfway },
    { id: 'three_quarter', check: () => progress >= 0.75 && progress < 0.8, text: PROGRESS_TEMPLATES.threeQuarters },
    { id: 'ten_miles', check: () => remainingMiles <= 10 && remainingMiles > 9, text: PROGRESS_TEMPLATES.tenMiles },
    { id: 'five_miles', check: () => remainingMiles <= 5 && remainingMiles > 4, text: PROGRESS_TEMPLATES.fiveMiles },
    { id: 'one_mile', check: () => remainingMiles <= 1 && remainingMiles > 0.8, text: PROGRESS_TEMPLATES.oneMile }
  ]
  
  for (const milestone of milestones) {
    if (!announcedMilestones.has(milestone.id) && milestone.check()) {
      announcedMilestones.add(milestone.id)
      return {
        text: milestone.text,
        type: 'progress',
        priority: 2
      }
    }
  }
  
  return null
}

/**
 * Generate stats callout (periodic in Companion mode)
 */
export function generateStatsCallout(stats, type = 'sweepers') {
  switch (type) {
    case 'sweepers':
      if (stats.sweepersCleared > 0 && stats.sweepersCleared % 10 === 0) {
        return {
          text: STATS_TEMPLATES.sweepersCleared(stats.sweepersCleared),
          type: 'stats',
          priority: 3
        }
      }
      break
      
    case 'speed':
      if (stats.averageSpeed > 0) {
        return {
          text: STATS_TEMPLATES.averageSpeed(stats.averageSpeed),
          type: 'stats',
          priority: 3
        }
      }
      break
      
    case 'section_complete':
      return {
        text: STATS_TEMPLATES.sectionComplete(
          stats.sweepersCleared,
          stats.highwayMiles,
          stats.averageSpeed
        ),
        type: 'stats',
        priority: 2
      }
  }
  
  return null
}


// ================================
// HIGHWAY STATS STATE
// ================================

/**
 * Create initial highway stats state
 */
export function createHighwayStats() {
  return {
    sweepersCleared: 0,
    sweepersTotal: 0,
    highwayMiles: 0,
    highwayStartTime: null,
    speedSamples: [],
    averageSpeed: 0,
    lastStatsCalloutTime: 0
  }
}

/**
 * Update highway stats
 */
export function updateHighwayStats(stats, event) {
  switch (event.type) {
    case 'sweeper_cleared':
      return {
        ...stats,
        sweepersCleared: stats.sweepersCleared + 1
      }
      
    case 'enter_highway':
      return {
        ...stats,
        highwayStartTime: Date.now(),
        speedSamples: []
      }
      
    case 'speed_sample':
      const newSamples = [...stats.speedSamples, event.speed].slice(-50)
      const avg = newSamples.reduce((a, b) => a + b, 0) / newSamples.length
      return {
        ...stats,
        speedSamples: newSamples,
        averageSpeed: avg
      }
      
    case 'distance_update':
      return {
        ...stats,
        highwayMiles: event.miles
      }
      
    default:
      return stats
  }
}


// ================================
// INTEGRATION HELPERS
// ================================

/**
 * Check if highway mode features should be active
 */
export function shouldUseHighwayMode(currentCharacter) {
  return currentCharacter === 'transit'
}

/**
 * Get highway mode config based on setting
 */
export function getHighwayModeConfig(modeSetting) {
  const configs = {
    [HIGHWAY_MODE.BASIC]: {
      enableSweepers: true,
      enableElevation: true,
      enableProgress: true,
      enableChatter: false,
      enableApex: false,
      enableStats: false,
      enableFeedback: false
    },
    [HIGHWAY_MODE.COMPANION]: {
      enableSweepers: true,
      enableElevation: true,
      enableProgress: true,
      enableChatter: true,
      enableApex: true,
      enableStats: true,
      enableFeedback: true
    }
  }
  
  return configs[modeSetting] || configs[HIGHWAY_MODE.BASIC]
}


// ================================
// EXPORTS
// ================================

export default {
  // Constants
  HIGHWAY_MODE,
  SWEEPER_CONFIG,
  
  // Sweeper detection
  identifySweepers,
  
  // Callout generation
  generateHighwayCallout,
  generateApexCallout,
  
  // Companion features
  getSilenceBreaker,
  getSweeperFeedback,
  
  // Progress & stats
  checkProgressMilestone,
  generateStatsCallout,
  createHighwayStats,
  updateHighwayStats,
  
  // Helpers
  shouldUseHighwayMode,
  getHighwayModeConfig
}
