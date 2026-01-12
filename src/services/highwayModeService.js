// ================================
// Highway Mode Service v2.0
// NEW: Independent highway bend detection (Option A)
// 
// This is an ADDITIVE service - it does NOT modify existing curve detection.
// It independently analyzes highway segments to catch bends that would
// otherwise be merged/filtered by the main detection system.
// ================================

// ================================
// CONSTANTS & CONFIGURATION
// ================================

export const HIGHWAY_MODE = {
  BASIC: 'basic',      // Clean co-driver: sweepers, elevation, milestones
  COMPANION: 'companion' // Full engagement: chatter, stats, gamification
}

// Highway bend detection thresholds - tuned to catch meaningful bends only
const HIGHWAY_BEND_CONFIG = {
  sampleInterval: 10,       // meters - fine granularity
  slidingWindow: 200,       // meters - window for detecting gradual bends
  minAngle: 8,              // degrees - lowered from 10 to catch more subtle bends
  maxAngle: 45,             // degrees - above this it's a real curve
  minLength: 60,            // meters - minimum bend length (lowered from 80)
  minSpacing: 300,          // meters - minimum distance between markers (was 400)
  noMerge: true,            // Never merge highway bends
  noChicane: true           // Don't combine into chicanes - keep each bend separate
}

// Sweeper thresholds (subset of highway bends)
const SWEEPER_CONFIG = {
  minAngle: 8,        // Minimum degrees to qualify as sweeper
  maxAngle: 25,       // Above this, it's a real curve, not a sweeper
  minLength: 150,     // Minimum curve length in meters
  maxSeverity: 2      // Sweepers are severity 1-2 max
}

// Coaching callout templates
const COACHING_TEMPLATES = {
  // Gentle sweep (4-12°)
  gentleSweep: (dir, angle, length) => {
    const lengthDesc = length > 400 ? 'very long' : length > 200 ? 'long' : ''
    return `${lengthDesc} gentle ${dir} sweep, ${angle} degrees`.trim().replace(/\s+/g, ' ')
  },
  
  // Moderate sweep (12-25°)
  moderateSweep: (dir, angle, speed) => 
    `${dir} sweep, ${angle} degrees. Target ${speed}.`,
  
  // S-sweep (two bends in sequence)
  sSweep: (dir1, angle1, dir2, angle2, gap) => 
    `S sweep: ${dir1} ${angle1}, then ${dir2} ${angle2}. ${gap < 100 ? 'Quick transition.' : ''}`.trim(),
  
  // Detailed coaching (Companion mode)
  detailed: (bend) => {
    const parts = []
    const lengthDesc = bend.length > 400 ? 'Very long' : bend.length > 200 ? 'Long' : ''
    const angleDesc = bend.angle < 10 ? 'soft' : bend.angle < 20 ? 'moderate' : 'firm'
    
    parts.push(`${lengthDesc} ${angleDesc} ${bend.direction.toLowerCase()}, ${bend.angle} degrees`.trim())
    
    if (bend.optimalSpeed) {
      parts.push(`Target ${bend.optimalSpeed}`)
    }
    
    if (bend.throttleAdvice) {
      parts.push(bend.throttleAdvice)
    }
    
    return parts.join('. ').replace(/\s+/g, ' ') + '.'
  }
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


// ================================
// HIGHWAY BEND DETECTION (Option A)
// Independent analysis that doesn't touch curveDetection.js
// ================================

/**
 * Analyze highway segments independently for all bends
 * This runs AFTER main curve detection and finds bends that were merged/filtered
 * 
 * @param {Array} coordinates - Full route coordinates
 * @param {Array} segments - Route character segments from zoneService.js
 * @returns {Array} - Highway bends with full detail
 */
export function analyzeHighwayBends(coordinates, segments) {
  if (!coordinates?.length || !segments?.length) return []
  
  console.log('🛣️ Highway Bend Analysis - Starting')
  
  // Find highway (transit) segments
  const highwaySegments = segments.filter(s => s.character === 'transit')
  
  if (!highwaySegments.length) {
    console.log('   No highway segments found')
    return []
  }
  
  console.log(`   Found ${highwaySegments.length} transit segments`)
  
  const allBends = []
  
  highwaySegments.forEach((segment, segIdx) => {
    console.log(`   Analyzing highway segment ${segIdx + 1}: ${Math.round(segment.startDistance)}m - ${Math.round(segment.endDistance)}m`)
    
    // Extract coordinates for this segment
    const extraction = extractSegmentCoordinates(coordinates, segment)
    const segmentCoords = extraction.coords
    const actualStartDistance = extraction.startDistance
    
    if (segmentCoords.length < 10) {
      console.log(`   Skipping - too few points (${segmentCoords.length})`)
      return
    }
    
    // Run independent bend detection on this segment
    // Use the ACTUAL start distance from coordinate lookup, not segment.startDistance
    const bends = detectHighwayBends(segmentCoords, actualStartDistance)
    
    console.log(`   Found ${bends.length} bends in segment`)
    allBends.push(...bends)
  })
  
  // Post-process: detect S-sweeps (two opposite bends in sequence)
  const processedBends = detectSSweeps(allBends)
  
  // STRICT zone validation - ensure each bend is actually within a transit zone
  const validatedBends = processedBends.filter(bend => {
    const isInTransit = highwaySegments.some(seg => 
      bend.distanceFromStart >= seg.startDistance && 
      bend.distanceFromStart <= seg.endDistance
    )
    if (!isInTransit) {
      console.log(`   ⚠️ Filtered bend at ${Math.round(bend.distanceFromStart)}m - outside transit zone`)
    }
    return isInTransit
  })
  
  // Consolidate dense clusters into section markers FIRST (before spacing)
  // This combines 3+ close bends into a single "sweeping section" marker
  const consolidatedBends = consolidateBendClusters(validatedBends, 400)
  
  // Then apply minimum spacing to the consolidated result
  const spacedBends = enforceMinimumSpacing(consolidatedBends, HIGHWAY_BEND_CONFIG.minSpacing)
  
  // Add coaching data
  const coachedBends = addCoachingData(spacedBends)
  
  console.log(`🛣️ Highway Analysis Complete: ${coachedBends.length} markers`)
  
  return coachedBends
}

/**
 * Extract coordinates for a specific segment using distance-based lookup
 * This is more accurate than percentage-based index slicing
 */
function extractSegmentCoordinates(coordinates, segment) {
  if (!coordinates?.length) return []
  
  // Calculate cumulative distances for each coordinate
  const distances = [0]
  for (let i = 1; i < coordinates.length; i++) {
    distances.push(distances[i-1] + getDistance(coordinates[i-1], coordinates[i]))
  }
  const totalLength = distances[distances.length - 1]
  
  // Find start and end indices based on actual distances
  let startIdx = 0
  let endIdx = coordinates.length - 1
  
  for (let i = 0; i < distances.length; i++) {
    if (distances[i] >= segment.startDistance) {
      startIdx = Math.max(0, i - 1)  // Include point just before
      break
    }
  }
  
  for (let i = startIdx; i < distances.length; i++) {
    if (distances[i] >= segment.endDistance) {
      endIdx = Math.min(i + 1, coordinates.length - 1)  // Include point just after
      break
    }
  }
  
  console.log(`   📐 Extracting coords for segment ${Math.round(segment.startDistance)}m-${Math.round(segment.endDistance)}m:`)
  console.log(`      Total route length: ${Math.round(totalLength)}m`)
  console.log(`      Coord indices: ${startIdx} - ${endIdx} (of ${coordinates.length})`)
  console.log(`      Actual distances at indices: ${Math.round(distances[startIdx])}m - ${Math.round(distances[endIdx])}m`)
  
  return {
    coords: coordinates.slice(startIdx, endIdx + 1),
    startDistance: distances[startIdx]  // Return actual start distance for offset correction
  }
}

/**
 * Estimate total route length from coordinates
 */
function estimateRouteLength(coordinates) {
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += getDistance(coordinates[i-1], coordinates[i])
  }
  return total
}

/**
 * Core highway bend detection - simplified, no merging
 */
function detectHighwayBends(coordinates, segmentStartDistance) {
  const bends = []
  
  // Interpolate to fixed intervals
  const points = interpolatePoints(coordinates, HIGHWAY_BEND_CONFIG.sampleInterval)
  
  if (points.length < 5) return bends
  
  // Calculate headings
  const headings = []
  for (let i = 0; i < points.length - 1; i++) {
    headings.push(getBearing(points[i].coord, points[i + 1].coord))
  }
  
  // Sliding window detection
  const windowSize = Math.floor(HIGHWAY_BEND_CONFIG.slidingWindow / HIGHWAY_BEND_CONFIG.sampleInterval)
  const usedPoints = new Set()
  
  let i = 0
  while (i < headings.length - windowSize) {
    // Skip if already part of a bend
    let skip = false
    for (let j = i; j < i + windowSize && !skip; j++) {
      if (usedPoints.has(j)) skip = true
    }
    if (skip) { i++; continue }
    
    // Calculate heading change over window
    let windowChange = 0
    for (let j = i; j < i + windowSize - 1; j++) {
      windowChange += getHeadingChange(headings[j], headings[j + 1])
    }
    
    const absChange = Math.abs(windowChange)
    
    // Check if this qualifies as a bend
    if (absChange >= HIGHWAY_BEND_CONFIG.minAngle) {
      // Expand to find full extent of bend
      let bendStart = i
      let bendEnd = i + windowSize - 1
      let totalChange = windowChange
      const direction = Math.sign(windowChange)
      
      // Expand backwards
      while (bendStart > 0 && !usedPoints.has(bendStart - 1)) {
        const change = getHeadingChange(headings[bendStart - 1], headings[bendStart])
        if (Math.sign(change) === direction && Math.abs(change) > 0.2) {
          totalChange += change
          bendStart--
        } else break
      }
      
      // Expand forwards
      while (bendEnd < headings.length - 1 && !usedPoints.has(bendEnd + 1)) {
        const change = getHeadingChange(headings[bendEnd], headings[bendEnd + 1])
        if (Math.sign(change) === direction && Math.abs(change) > 0.2) {
          totalChange += change
          bendEnd++
        } else break
      }
      
      // Create bend object
      const bendLength = points[bendEnd].distance - points[bendStart].distance
      const angle = Math.abs(Math.round(totalChange))
      
      if (angle >= HIGHWAY_BEND_CONFIG.minAngle && angle <= HIGHWAY_BEND_CONFIG.maxAngle) {
        const bend = {
          id: `hwy-${bends.length + 1}`,
          type: 'highway_bend',
          direction: totalChange > 0 ? 'RIGHT' : 'LEFT',
          angle: angle,
          length: Math.round(bendLength),
          distanceFromStart: Math.round(segmentStartDistance + points[bendStart].distance),
          position: points[Math.floor((bendStart + bendEnd) / 2)].coord,
          entryPosition: points[bendStart].coord,
          exitPosition: points[Math.min(bendEnd + 1, points.length - 1)].coord,
          startIndex: bendStart,
          endIndex: bendEnd,
          // Sweeper classification
          isSweeper: angle >= SWEEPER_CONFIG.minAngle && 
                     angle <= SWEEPER_CONFIG.maxAngle && 
                     bendLength >= SWEEPER_CONFIG.minLength,
          isHighwayBend: true
        }
        
        bends.push(bend)
        
        // Mark points as used
        for (let j = bendStart; j <= bendEnd; j++) {
          usedPoints.add(j)
        }
      }
      
      i = bendEnd + 1
    } else {
      i++
    }
  }
  
  return bends
}

/**
 * Detect and consolidate dense bend clusters into section markers
 * Combines 3+ close bends into a single "sweeping section" marker
 */
function consolidateBendClusters(bends, clusterDistance = 400) {
  if (bends.length < 3) return bends  // Need 3+ to consider clustering
  
  const result = []
  let i = 0
  
  while (i < bends.length) {
    // Look ahead to see how many bends are within clusterDistance
    const clusterStart = i
    let clusterEnd = i
    let lastDist = bends[i].distanceFromStart
    
    for (let j = i + 1; j < bends.length; j++) {
      const gap = bends[j].distanceFromStart - lastDist
      if (gap <= clusterDistance) {
        clusterEnd = j
        lastDist = bends[j].distanceFromStart
      } else {
        break
      }
    }
    
    const clusterSize = clusterEnd - clusterStart + 1
    
    // Consolidate if 3+ bends are truly clustered
    if (clusterSize >= 3) {
      // Consolidate into a section marker
      const clusterBends = bends.slice(clusterStart, clusterEnd + 1)
      const firstBend = clusterBends[0]
      const lastBend = clusterBends[clusterBends.length - 1]
      
      const totalAngle = clusterBends.reduce((sum, b) => sum + (b.isSSweep ? b.combinedAngle : b.angle), 0)
      const sectionLength = lastBend.distanceFromStart - firstBend.distanceFromStart + (lastBend.length || 100)
      const maxAngle = Math.max(...clusterBends.map(b => b.isSSweep ? b.combinedAngle : b.angle))
      
      // Always call it "active" - no scary names
      const character = 'active'
      
      const section = {
        id: `hwy-section-${result.length + 1}`,
        type: 'highway_section',
        isSection: true,
        bendCount: clusterSize,
        totalAngle: Math.round(totalAngle),
        maxAngle: Math.round(maxAngle),
        length: Math.round(sectionLength),
        distanceFromStart: firstBend.distanceFromStart,
        position: firstBend.position,  // Mark at start of section
        entryPosition: firstBend.entryPosition,
        exitPosition: lastBend.exitPosition,
        character: character,
        // Include individual bends for detailed callouts
        bends: clusterBends,
        // Generate callout text
        calloutBasic: `Active section, ${clusterSize} bends`,
        calloutDetailed: generateSectionCallout(clusterBends, character, sectionLength),
        // For UI compatibility
        direction: firstBend.direction,
        angle: maxAngle,
        isSweeper: true,
        isHighwayBend: true
      }
      
      result.push(section)
      i = clusterEnd + 1
    } else {
      // Keep individual bend(s)
      result.push(bends[i])
      i++
    }
  }
  
  console.log(`   Cluster consolidation: ${bends.length} bends → ${result.length} markers (${bends.length - result.length} consolidated)`)
  return result
}

/**
 * Generate detailed callout for a section
 * Rhythmic pace notes style - short, punchy, each bend called out
 */
function generateSectionCallout(bends, character, length) {
  if (!bends?.length) return 'Active section ahead.'
  
  const parts = []
  
  // Opening with bend count
  parts.push(`Active section, ${bends.length} bends`)
  
  // Narrate each bend - short and rhythmic
  bends.forEach((bend, idx) => {
    const dir = bend.direction?.toLowerCase() || 'bend'
    const angle = bend.angle || 10
    const speed = bend.optimalSpeed || calculateOptimalSpeed(bend)
    
    if (idx === 0) {
      // First bend - "Entry"
      if (bend.isSSweep) {
        const dir1 = bend.firstBend?.direction?.toLowerCase() || 'right'
        const dir2 = bend.secondBend?.direction?.toLowerCase() || 'left'
        parts.push(`${capitalize(dir1)} entry, S-sweep ${dir1}-${dir2}`)
      } else {
        parts.push(`${capitalize(dir)} entry ${speed}`)
      }
    } else {
      // Subsequent bends - rhythmic style
      if (bend.isSSweep) {
        const dir1 = bend.firstBend?.direction?.toLowerCase() || 'right'
        const dir2 = bend.secondBend?.direction?.toLowerCase() || 'left'
        parts.push(`S-sweep ${dir1}-${dir2}`)
      } else if (bend.angle > 20) {
        // Tighter bend - mention character
        if (bend.tightens) {
          parts.push(`${capitalize(dir)} tightening, ${speed}`)
        } else if (bend.opens) {
          parts.push(`${capitalize(dir)} opens, ${speed}`)
        } else {
          parts.push(`${capitalize(dir)} ${angle}, ${speed}`)
        }
      } else if (bend.angle > 12) {
        // Moderate - just direction and speed
        parts.push(`${capitalize(dir)} sweep, ${speed}`)
      } else {
        // Gentle - just direction
        parts.push(`Gentle ${dir}`)
      }
    }
  })
  
  // Exit clear
  parts.push('Exit clear')
  
  return parts.join('. ') + '.'
}

function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Detect S-sweeps - two opposite direction bends in sequence
 */
function detectSSweeps(bends) {
  if (bends.length < 2) return bends
  
  const result = []
  let i = 0
  
  while (i < bends.length) {
    const current = bends[i]
    const next = bends[i + 1]
    
    if (next) {
      const gap = next.distanceFromStart - (current.distanceFromStart + current.length)
      const oppositeDirection = current.direction !== next.direction
      
      // S-sweep: opposite directions, close together
      if (oppositeDirection && gap >= 0 && gap < 200) {
        // Combine into S-sweep
        const sSweep = {
          ...current,
          id: `hwy-s-${result.length + 1}`,
          type: 'highway_s_sweep',
          isSSweep: true,
          firstBend: {
            direction: current.direction,
            angle: current.angle,
            length: current.length
          },
          secondBend: {
            direction: next.direction,
            angle: next.angle,
            length: next.length
          },
          gapDistance: Math.round(gap),
          totalLength: (next.distanceFromStart + next.length) - current.distanceFromStart,
          exitPosition: next.exitPosition,
          combinedAngle: current.angle + next.angle
        }
        
        result.push(sSweep)
        i += 2
        continue
      }
    }
    
    result.push(current)
    i++
  }
  
  return result
}

/**
 * Enforce minimum spacing between markers
 * Keeps the most significant bend when multiple are close together
 */
function enforceMinimumSpacing(bends, minSpacing) {
  if (bends.length < 2) return bends
  
  const result = []
  let lastKeptDistance = -Infinity
  
  // Sort by distance first
  const sorted = [...bends].sort((a, b) => a.distanceFromStart - b.distanceFromStart)
  
  for (const bend of sorted) {
    const distanceFromLast = bend.distanceFromStart - lastKeptDistance
    
    if (distanceFromLast >= minSpacing) {
      // Far enough from last marker, keep it
      result.push(bend)
      lastKeptDistance = bend.distanceFromStart
    } else {
      // Too close - check if this one is more significant
      const lastKept = result[result.length - 1]
      if (lastKept) {
        const currentSignificance = bend.isSSweep ? bend.combinedAngle * 1.5 : bend.angle
        const lastSignificance = lastKept.isSSweep ? lastKept.combinedAngle * 1.5 : lastKept.angle
        
        if (currentSignificance > lastSignificance * 1.3) {
          // Current is significantly more important, replace the last one
          result[result.length - 1] = bend
          lastKeptDistance = bend.distanceFromStart
        }
        // Otherwise skip this one (keep the previous)
      }
    }
  }
  
  return result
}

/**
 * Add coaching data to bends
 */
function addCoachingData(bends) {
  return bends.map(bend => {
    // Calculate optimal speed based on angle and length
    const optimalSpeed = calculateOptimalSpeed(bend)
    
    // Generate throttle advice
    const throttleAdvice = generateThrottleAdvice(bend)
    
    return {
      ...bend,
      optimalSpeed,
      throttleAdvice,
      // Severity equivalent (for compatibility with existing UI)
      severity: angleToSeverity(bend.angle),
      // Modifier for display
      modifier: bend.isSSweep ? 'S-SWEEP' : 
                bend.length > 300 ? 'LONG' : 
                bend.angle < 10 ? 'GENTLE' : null
    }
  })
}

/**
 * Calculate optimal speed for a highway bend
 */
function calculateOptimalSpeed(bend) {
  // Base speed for highway (75 mph)
  const baseSpeed = 75
  
  // Reduce based on angle
  let reduction = 0
  if (bend.angle > 30) reduction = 15
  else if (bend.angle > 20) reduction = 10
  else if (bend.angle > 15) reduction = 5
  else if (bend.angle > 10) reduction = 3
  
  // S-sweeps need more reduction due to transition
  if (bend.isSSweep) {
    reduction += 5
  }
  
  return Math.round(baseSpeed - reduction)
}

/**
 * Generate throttle advice for coaching callouts
 */
function generateThrottleAdvice(bend) {
  if (bend.isSSweep) {
    return 'Lift through transition, power out of second bend'
  }
  
  if (bend.angle < 10) {
    return 'Maintain throttle'
  } else if (bend.angle < 15) {
    return 'Light lift, smooth through'
  } else if (bend.angle < 25) {
    return 'Ease off entry, progressive throttle from apex'
  } else {
    return 'Brake before entry, accelerate from apex'
  }
}

/**
 * Convert angle to severity equivalent
 */
function angleToSeverity(angle) {
  if (angle < 10) return 1
  if (angle < 20) return 2
  if (angle < 30) return 3
  if (angle < 40) return 4
  return 5
}


// ================================
// INTERPOLATION & GEOMETRY HELPERS
// ================================

function interpolatePoints(coordinates, intervalMeters) {
  const result = []
  let cumulativeDistance = 0
  
  result.push({ coord: coordinates[0], distance: 0 })
  
  for (let i = 1; i < coordinates.length; i++) {
    const segmentDist = getDistance(coordinates[i-1], coordinates[i])
    const prevDist = cumulativeDistance
    cumulativeDistance += segmentDist
    
    // Add intermediate points
    const numPoints = Math.floor(segmentDist / intervalMeters)
    for (let j = 1; j <= numPoints; j++) {
      const ratio = j / (numPoints + 1)
      const interpCoord = [
        coordinates[i-1][0] + (coordinates[i][0] - coordinates[i-1][0]) * ratio,
        coordinates[i-1][1] + (coordinates[i][1] - coordinates[i-1][1]) * ratio
      ]
      result.push({ 
        coord: interpCoord, 
        distance: prevDist + segmentDist * ratio 
      })
    }
    
    result.push({ coord: coordinates[i], distance: cumulativeDistance })
  }
  
  return result
}

function getDistance(coord1, coord2) {
  const R = 6371e3 // Earth radius in meters
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

function getBearing(coord1, coord2) {
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function getHeadingChange(heading1, heading2) {
  let diff = heading2 - heading1
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return diff
}


// ================================
// SWEEPER DETECTION (Original - works with main curve data)
// ================================

/**
 * Analyze curves and tag sweepers for highway zones
 * This works with the EXISTING curve data from curveDetection.js
 */
export function identifySweepers(curves, segments) {
  if (!curves?.length) return []
  
  const highwaySegments = segments?.filter(s => s.character === 'transit') || []
  
  return curves.map(curve => {
    const inHighway = isInHighwaySegment(curve, highwaySegments)
    
    if (!inHighway) return curve
    
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
    
    return { ...curve, inHighwayZone: true }
  })
}

function isInHighwaySegment(curve, highwaySegments) {
  if (!highwaySegments?.length) return false
  const curveDistance = curve.distanceFromStart || 0
  return highwaySegments.some(seg => 
    curveDistance >= seg.startDistance && curveDistance <= seg.endDistance
  )
}

function checkIfSweeper(curve) {
  if (curve.severity > SWEEPER_CONFIG.maxSeverity) return false
  
  const angle = curve.angle || curve.totalAngle || Math.abs(curve.totalHeadingChange) || 0
  if (angle < SWEEPER_CONFIG.minAngle || angle > SWEEPER_CONFIG.maxAngle) return false
  
  const length = curve.length || 0
  if (length > 0 && length < SWEEPER_CONFIG.minLength * 0.5) return false
  
  return true
}

function estimateAngle(curve) {
  const severityToAngle = { 1: 12, 2: 20 }
  return severityToAngle[curve.severity] || 15
}


// ================================
// CALLOUT GENERATION
// ================================

/**
 * Generate highway-specific callout for a bend
 * Supports both basic and coaching (companion) modes
 */
export function generateHighwayCallout(bend, highwayMode = HIGHWAY_MODE.BASIC) {
  if (!bend) return null
  
  // S-sweep
  if (bend.isSSweep) {
    const text = COACHING_TEMPLATES.sSweep(
      bend.firstBend.direction.toLowerCase(),
      bend.firstBend.angle,
      bend.secondBend.direction.toLowerCase(),
      bend.secondBend.angle,
      bend.gapDistance
    )
    return { text, type: 's_sweep', priority: 1, bend }
  }
  
  // Highway bend with coaching
  if (bend.isHighwayBend) {
    if (highwayMode === HIGHWAY_MODE.COMPANION) {
      return {
        text: COACHING_TEMPLATES.detailed(bend),
        type: 'highway_bend',
        priority: 1,
        bend
      }
    } else {
      // Basic mode - simpler callout
      const text = bend.angle < 12 
        ? COACHING_TEMPLATES.gentleSweep(bend.direction.toLowerCase(), bend.angle, bend.length)
        : COACHING_TEMPLATES.moderateSweep(bend.direction.toLowerCase(), bend.angle, bend.optimalSpeed)
      return { text, type: 'highway_bend', priority: 1, bend }
    }
  }
  
  // Legacy sweeper (from main curve data)
  if (bend.isSweeper) {
    const direction = bend.sweeperDirection || (bend.direction === 'LEFT' ? 'left' : 'right')
    const angle = bend.sweeperAngle || estimateAngle(bend)
    return {
      text: `Sweeper ${direction}, ${Math.round(angle)} degrees`,
      type: 'sweeper',
      priority: 2,
      bend
    }
  }
  
  return null
}

/**
 * Generate apex timing callout (Companion mode only)
 */
export function generateApexCallout(bend, currentSpeed) {
  if (!bend?.isHighwayBend && !bend?.isSweeper) return null
  
  const bendLength = bend.length || 200
  const speedMetersPerSec = (currentSpeed * 1609.34) / 3600
  const timeToApex = (bendLength / 2) / speedMetersPerSec
  
  return {
    text: 'Apex... now',
    type: 'apex',
    priority: 1,
    delayMs: Math.max(500, timeToApex * 1000 - 500),
    bend
  }
}


// ================================
// COMPANION MODE: CHATTER SYSTEM
// ================================

export function getSilenceBreaker(lastCalloutTime, lastChatterTime) {
  const now = Date.now()
  const timeSinceCallout = now - lastCalloutTime
  const timeSinceChatter = now - lastChatterTime
  
  const silenceThreshold = 45000 + Math.random() * 15000
  
  if (timeSinceCallout < silenceThreshold) return null
  if (timeSinceChatter < 30000) return null
  
  const text = SILENCE_BREAKERS[Math.floor(Math.random() * SILENCE_BREAKERS.length)]
  
  return { text, type: 'chatter', priority: 3 }
}

export function getSweeperFeedback() {
  const text = SWEEPER_FEEDBACK[Math.floor(Math.random() * SWEEPER_FEEDBACK.length)]
  return { text, type: 'feedback', priority: 3, delayMs: 1500 }
}


// ================================
// PROGRESS & STATS TRACKING
// ================================

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
      return { text: milestone.text, type: 'progress', priority: 2 }
    }
  }
  
  return null
}

export function generateStatsCallout(stats, type = 'sweepers') {
  switch (type) {
    case 'sweepers':
      if (stats.sweepersCleared > 0 && stats.sweepersCleared % 10 === 0) {
        return { text: `${stats.sweepersCleared} sweepers cleared`, type: 'stats', priority: 3 }
      }
      break
    case 'speed':
      if (stats.averageSpeed > 0) {
        return { text: `Averaging ${Math.round(stats.averageSpeed)}, solid pace`, type: 'stats', priority: 3 }
      }
      break
    case 'section_complete':
      return {
        text: `Highway section complete. ${stats.sweepersCleared} sweepers, ${Math.round(stats.highwayMiles)} miles, averaging ${Math.round(stats.averageSpeed)}.`,
        type: 'stats',
        priority: 2
      }
  }
  return null
}


// ================================
// HIGHWAY STATS STATE
// ================================

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

export function updateHighwayStats(stats, event) {
  switch (event.type) {
    case 'sweeper_cleared':
      return { ...stats, sweepersCleared: stats.sweepersCleared + 1 }
    case 'enter_highway':
      return { ...stats, highwayStartTime: Date.now(), speedSamples: [] }
    case 'speed_sample':
      const newSamples = [...stats.speedSamples, event.speed].slice(-50)
      const avg = newSamples.reduce((a, b) => a + b, 0) / newSamples.length
      return { ...stats, speedSamples: newSamples, averageSpeed: avg }
    case 'distance_update':
      return { ...stats, highwayMiles: event.miles }
    default:
      return stats
  }
}


// ================================
// INTEGRATION HELPERS
// ================================

export function shouldUseHighwayMode(currentCharacter) {
  return currentCharacter === 'transit'
}

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
  HIGHWAY_BEND_CONFIG,
  
  // NEW: Independent highway bend detection
  analyzeHighwayBends,
  
  // Sweeper detection (works with main curve data)
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
