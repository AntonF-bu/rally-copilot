// ================================
// Callout Grouping Service v1.0
// 
// Generates TWO callout sets:
// - Fast: For high-speed driving (120mph highway, 70mph technical)
// - Standard: For normal spirited driving (90mph highway, 50mph technical)
// 
// Uses rally terminology for grouped callouts
// Runtime selects appropriate set based on actual GPS speed
// ================================

// Speed thresholds for grouping calculations
const SPEED_PROFILES = {
  fast: {
    highway: 120,    // mph
    technical: 70,   // mph
    minSeconds: 6    // minimum gap between callouts
  },
  standard: {
    highway: 90,
    technical: 50,
    minSeconds: 6
  }
}

// Runtime speed thresholds for set selection
export const SPEED_THRESHOLDS = {
  highway: 95,     // Above this → use fast set
  technical: 55    // Above this → use fast set
}

/**
 * Main export: Generate grouped callout sets
 * @param {Array} callouts - Raw callouts from rule-based filter
 * @param {Object} routeInfo - Route metadata
 * @returns {Object} - { fast: [...], standard: [...] }
 */
export function generateGroupedCalloutSets(callouts, routeInfo) {
  console.log('🎯 Callout Grouping Service v1.0')
  console.log(`   Input callouts: ${callouts.length}`)
  
  // Separate callouts by zone
  const byZone = {
    urban: callouts.filter(c => c.zone === 'urban'),
    transit: callouts.filter(c => c.zone === 'transit'),
    technical: callouts.filter(c => c.zone === 'technical')
  }
  
  // Generate both sets
  const fastSet = generateGroupedSet(byZone, 'fast')
  const standardSet = generateGroupedSet(byZone, 'standard')
  
  console.log(`   Fast set: ${fastSet.length} callouts`)
  console.log(`   Standard set: ${standardSet.length} callouts`)
  
  return {
    fast: fastSet,
    standard: standardSet,
    stats: {
      original: callouts.length,
      fastGrouped: fastSet.length,
      standardGrouped: standardSet.length,
      fastReduction: Math.round((1 - fastSet.length / callouts.length) * 100),
      standardReduction: Math.round((1 - standardSet.length / callouts.length) * 100)
    }
  }
}

/**
 * Generate a grouped callout set for a speed profile
 */
function generateGroupedSet(byZone, profile) {
  const speeds = SPEED_PROFILES[profile]
  
  // Calculate min gaps in miles
  const minGapHighway = (speeds.highway / 3600) * speeds.minSeconds
  const minGapTechnical = (speeds.technical / 3600) * speeds.minSeconds
  
  console.log(`   ${profile}: Highway gap=${minGapHighway.toFixed(3)}mi, Technical gap=${minGapTechnical.toFixed(3)}mi`)
  
  // Group each zone
  const groupedUrban = byZone.urban // Urban stays as-is (already minimal)
  const groupedHighway = groupCallouts(byZone.transit, minGapHighway, 'highway')
  const groupedTechnical = groupCallouts(byZone.technical, minGapTechnical, 'technical')
  
  // Combine and sort by mile
  const combined = [...groupedUrban, ...groupedHighway, ...groupedTechnical]
  combined.sort((a, b) => a.mile - b.mile)
  
  return combined
}

/**
 * Group callouts that are too close together
 */
function groupCallouts(callouts, minGap, zoneType) {
  if (!callouts.length) return []
  
  const result = []
  let currentGroup = [callouts[0]]
  let groupsFormed = 0
  
  for (let i = 1; i < callouts.length; i++) {
    const current = callouts[i]
    const prev = callouts[i - 1]
    
    // Use triggerMile or mile - callouts from RoutePreview use triggerMile
    const currentMile = current.triggerMile ?? current.mile ?? 0
    const prevMile = prev.triggerMile ?? prev.mile ?? 0
    const gap = currentMile - prevMile
    
    if (gap < minGap && gap >= 0) {
      // Too close - add to current group
      currentGroup.push(current)
    } else {
      // Gap is sufficient - process current group and start new one
      if (currentGroup.length > 1) {
        groupsFormed++
      }
      result.push(...processGroup(currentGroup, zoneType))
      currentGroup = [current]
    }
  }
  
  // Don't forget last group
  if (currentGroup.length > 1) {
    groupsFormed++
  }
  result.push(...processGroup(currentGroup, zoneType))
  
  if (groupsFormed > 0) {
    console.log(`   ${zoneType}: Formed ${groupsFormed} groups from ${callouts.length} callouts → ${result.length} output`)
  }
  
  return result
}

/**
 * Process a group of close callouts
 */
function processGroup(group, zoneType) {
  if (group.length === 1) {
    // Single callout - return as-is
    return [group[0]]
  }
  
  // Multiple callouts in group - need to merge intelligently
  const dangers = group.filter(c => c.type === 'danger' || (c.angle && c.angle >= 70))
  const nonDangers = group.filter(c => c.type !== 'danger' && (!c.angle || c.angle < 70))
  
  // Strategy depends on danger curve count
  if (dangers.length === 0) {
    // No danger curves - simple grouping
    return [createSimpleGroup(group, zoneType)]
  }
  
  if (dangers.length === 1) {
    // One danger curve - it gets priority, others become context
    return [createDangerWithContext(group, dangers[0], zoneType)]
  }
  
  // Multiple danger curves - create sequence callout
  return [createDangerSequence(group, dangers, zoneType)]
}

/**
 * Create a simple grouped callout (no danger curves)
 */
function createSimpleGroup(group, zoneType) {
  const directions = group.map(c => c.direction?.[0]?.toUpperCase() || 'R')
  const angles = group.map(c => c.angle || 20)
  const maxAngle = Math.max(...angles)
  const pattern = detectPattern(directions, angles)
  
  // Get mile from triggerMile or mile
  const firstMile = group[0].triggerMile ?? group[0].mile ?? 0
  const lastMile = group[group.length - 1].triggerMile ?? group[group.length - 1].mile ?? 0
  
  // Generate rally-style text
  const text = generateRallyText(pattern, directions, maxAngle, group.length)
  
  return {
    id: `group-${firstMile.toFixed(2)}`,
    mile: firstMile,
    triggerMile: Math.max(firstMile - 0.3, 0),
    triggerDistance: Math.max(firstMile - 0.3, 0) * 1609.34,
    type: 'grouped',
    text: text,
    reason: `${group.length} curves grouped (${pattern})`,
    zone: group[0].zone,
    position: group[0].position,
    priority: maxAngle >= 40 ? 'high' : 'medium',
    groupedFrom: group.map(c => ({ mile: c.triggerMile ?? c.mile, text: c.text, angle: c.angle })),
    coversUntilMile: lastMile
  }
}

/**
 * Create callout for danger curve with context from surrounding curves
 */
function createDangerWithContext(group, danger, zoneType) {
  const dangerIndex = group.indexOf(danger)
  const before = group.slice(0, dangerIndex)
  const after = group.slice(dangerIndex + 1)
  
  const dir = danger.direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
  const angle = danger.angle || 90
  
  // Get mile from triggerMile or mile
  const firstMile = group[0].triggerMile ?? group[0].mile ?? 0
  const lastMile = group[group.length - 1].triggerMile ?? group[group.length - 1].mile ?? 0
  
  let text = ''
  
  // Build contextual callout
  if (before.length > 0 && after.length > 0) {
    // Danger in the middle
    const beforeDir = before[0].direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    const afterDir = after[0].direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    
    if (angle >= 90) {
      text = `${capitalizeFirst(beforeDir)} tightens, HAIRPIN ${dir.toUpperCase()}, ${afterDir} out`
    } else {
      text = `${capitalizeFirst(beforeDir)}, then HARD ${dir.toUpperCase()} ${angle}°, ${afterDir}`
    }
  } else if (before.length > 0) {
    // Danger at end
    const beforeDir = before[0].direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    if (angle >= 90) {
      text = `${capitalizeFirst(beforeDir)} into HAIRPIN ${dir.toUpperCase()}`
    } else {
      text = `${capitalizeFirst(beforeDir)} into HARD ${dir.toUpperCase()} ${angle}°`
    }
  } else if (after.length > 0) {
    // Danger at start
    const afterDir = after[0].direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    if (angle >= 90) {
      text = `HAIRPIN ${dir.toUpperCase()}, exits ${afterDir}`
    } else {
      text = `HARD ${dir.toUpperCase()} ${angle}°, exits ${afterDir}`
    }
  } else {
    // Just danger (shouldn't happen but handle it)
    text = angle >= 90 ? `HAIRPIN ${dir.toUpperCase()}` : `HARD ${dir.toUpperCase()} ${angle}°`
  }
  
  return {
    id: `danger-group-${firstMile.toFixed(2)}`,
    mile: firstMile,
    triggerMile: Math.max(firstMile - 0.3, 0),
    triggerDistance: Math.max(firstMile - 0.3, 0) * 1609.34,
    type: 'danger',
    text: text,
    reason: `Danger curve ${angle}° with ${group.length - 1} surrounding curves`,
    zone: danger.zone,
    position: group[0].position,
    priority: 'critical',
    angle: angle,
    direction: danger.direction,
    groupedFrom: group.map(c => ({ mile: c.triggerMile ?? c.mile, text: c.text, angle: c.angle })),
    coversUntilMile: lastMile
  }
}

/**
 * Create callout for multiple danger curves in sequence
 */
function createDangerSequence(group, dangers, zoneType) {
  const angles = dangers.map(c => c.angle || 90)
  const directions = dangers.map(c => c.direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right')
  
  // Get mile from triggerMile or mile
  const firstMile = group[0].triggerMile ?? group[0].mile ?? 0
  const lastMile = group[group.length - 1].triggerMile ?? group[group.length - 1].mile ?? 0
  
  let text = ''
  
  // Check for double/triple hairpin
  const hairpinCount = angles.filter(a => a >= 90).length
  
  if (hairpinCount >= 2) {
    // Multiple hairpins!
    if (hairpinCount === 2) {
      if (directions[0] !== directions[1]) {
        text = `DOUBLE HAIRPIN ${directions[0]}-${directions[1]}`
      } else {
        text = `TWO HAIRPINS ${directions[0]}`
      }
    } else {
      text = `${hairpinCount} HAIRPINS ahead, stay focused`
    }
  } else if (dangers.length === 2) {
    // Two danger curves
    const d1 = dangers[0]
    const d2 = dangers[1]
    const dir1 = d1.direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    const dir2 = d2.direction?.[0]?.toUpperCase() === 'L' ? 'left' : 'right'
    
    if (dir1 !== dir2) {
      // S-type danger sequence
      text = `HARD ${dir1.toUpperCase()} ${d1.angle}° into HARD ${dir2.toUpperCase()} ${d2.angle}°`
    } else {
      // Same direction
      text = `Two HARD ${dir1}s, ${d1.angle}° then ${d2.angle}°`
    }
  } else {
    // 3+ danger curves - keep it simple
    text = `DANGER - ${dangers.length} hard curves ahead, max ${Math.max(...angles)}°`
  }
  
  return {
    id: `danger-seq-${firstMile.toFixed(2)}`,
    mile: firstMile,
    triggerMile: Math.max(firstMile - 0.4, 0), // Extra warning for multiple dangers
    triggerDistance: Math.max(firstMile - 0.4, 0) * 1609.34,
    type: 'danger',
    text: text,
    reason: `${dangers.length} danger curves in ${(lastMile - firstMile).toFixed(2)} miles`,
    zone: dangers[0].zone,
    position: group[0].position,
    priority: 'critical',
    angle: Math.max(...angles),
    groupedFrom: group.map(c => ({ mile: c.triggerMile ?? c.mile, text: c.text, angle: c.angle })),
    coversUntilMile: lastMile
  }
}

/**
 * Detect pattern type from directions and angles
 */
function detectPattern(directions, angles) {
  const unique = [...new Set(directions)]
  const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length
  
  // Check for alternating pattern (chicane/esses)
  let isAlternating = true
  for (let i = 1; i < directions.length; i++) {
    if (directions[i] === directions[i - 1]) {
      isAlternating = false
      break
    }
  }
  
  // Check for tightening/opening
  let isTightening = true
  let isOpening = true
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] <= angles[i - 1]) isTightening = false
    if (angles[i] >= angles[i - 1]) isOpening = false
  }
  
  // Determine pattern
  if (isAlternating && directions.length === 2) {
    return 'chicane'
  }
  if (isAlternating && directions.length >= 3) {
    return 'esses'
  }
  if (isTightening) {
    return 'tightens'
  }
  if (isOpening) {
    return 'opens'
  }
  if (unique.length === 1) {
    return 'series'
  }
  
  return 'sequence'
}

/**
 * Generate rally-style text for grouped callouts
 */
function generateRallyText(pattern, directions, maxAngle, count) {
  const firstDir = directions[0] === 'L' ? 'left' : 'right'
  const lastDir = directions[directions.length - 1] === 'L' ? 'left' : 'right'
  
  switch (pattern) {
    case 'chicane':
      return `Chicane ${firstDir}-${lastDir}`
    
    case 'esses':
      return `Esses, ${count} curves, max ${maxAngle}°`
    
    case 'tightens':
      return `${capitalizeFirst(firstDir)} tightens to ${maxAngle}°`
    
    case 'opens':
      return `${capitalizeFirst(firstDir)} ${maxAngle}°, opens up`
    
    case 'series':
      return `${count} ${firstDir}s, max ${maxAngle}°`
    
    case 'sequence':
    default:
      if (count <= 3) {
        const dirs = directions.map(d => d === 'L' ? 'left' : 'right')
        return `${dirs.join('-')}, max ${maxAngle}°`
      }
      return `${count} curves, max ${maxAngle}°, stay focused`
  }
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Runtime: Select appropriate callout set based on current speed
 * @param {Object} calloutSets - { fast: [...], standard: [...] }
 * @param {number} currentSpeed - Current GPS speed in mph
 * @param {string} currentZone - 'transit', 'technical', or 'urban'
 * @returns {Array} - The appropriate callout set
 */
export function selectCalloutSet(calloutSets, currentSpeed, currentZone) {
  const threshold = currentZone === 'technical' 
    ? SPEED_THRESHOLDS.technical 
    : SPEED_THRESHOLDS.highway
  
  if (currentSpeed > threshold) {
    return calloutSets.fast
  }
  return calloutSets.standard
}

/**
 * Runtime: Get next callout considering speed-based set selection
 * @param {Object} calloutSets - { fast: [...], standard: [...] }
 * @param {number} currentMile - Current position in miles
 * @param {number} currentSpeed - Current GPS speed in mph
 * @param {string} currentZone - Current zone type
 * @returns {Object|null} - Next callout or null
 */
export function getNextCallout(calloutSets, currentMile, currentSpeed, currentZone) {
  const activeSet = selectCalloutSet(calloutSets, currentSpeed, currentZone)
  
  // Find next callout ahead of current position
  for (const callout of activeSet) {
    if (callout.triggerMile > currentMile) {
      return callout
    }
  }
  
  return null
}

export default { 
  generateGroupedCalloutSets, 
  selectCalloutSet, 
  getNextCallout,
  SPEED_THRESHOLDS 
}
