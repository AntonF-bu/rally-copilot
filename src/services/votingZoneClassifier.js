// ================================
// Voting Zone Classifier v1.3
// 
// NEW: Road ref as PRIMARY override (Approach A)
// - Interstates ALWAYS = transit (no curve voting)
// - US Highways STRONGLY favor transit
// - State routes use curve-based voting
// - Local roads favor technical
//
// FIXED: Interstate regex handles "I 90" with space
// FIXED: Zone boundary overlaps removed
// ================================

/**
 * Point weights for each signal
 */
const WEIGHTS = {
  // Pro-Technical signals
  curveCluster: 4,        // 3+ curves in 0.5mi
  sustainedCurves: 3,     // 4+ curves in 2mi
  dangerCurve: 3,         // Single curve ≥50° nearby
  highAngleAvg: 2,        // Average angle ≥25° in window
  tightCurves: 2,         // Multiple tight curves
  
  // Pro-Transit signals
  longGap: 4,             // 2mi+ with no curves
  censusSaysRural: 1,     // Census rural (weak)
  sparseWindow: 2,        // <2 curves in 2mi
  
  // Pro-Urban signals
  censusSaysUrban: 10,    // Census urban at edges
  
  // Road REF signals (from route legs - NOT tilequery)
  // These are STRONG because they come from actual road data
  roadRefInterstate: 15,  // I-xx = definitely transit
  roadRefUSHighway: 8,    // US-xx = likely transit  
  roadRefStateRoute: 0,   // MA-xx = neutral (curves decide)
  roadRefLocal: 4,        // Local roads = favor technical
  
  // Road CLASS signals (from Mapbox tilequery - expensive)
  roadClassMotorway: 8,
  roadClassPrimary: 4,
  roadClassSecondary: -2,
  roadClassTertiary: -4,
  roadClassResidential: -3,
}

/**
 * Detection thresholds
 */
const THRESHOLDS = {
  minAngleToCount: 12,
  dangerAngle: 50,
  highAngleAvg: 25,
  clusterWindowMiles: 0.5,
  clusterMinCurves: 3,
  clusterMinAvgAngle: 18,
  sustainedWindowMiles: 2.0,
  sustainedMinCurves: 4,
  sustainedMinAvgAngle: 20,
  gapThresholdMiles: 2.0,
  minZoneLengthMiles: 0.5,
  analysisWindowMiles: 0.5,
  maxUrbanMiles: 1.0,
}

/**
 * Main entry point - v1.3 with road refs
 * @param {Array} flowEvents - Events from road flow analyzer
 * @param {number} totalDistanceMeters - Total route distance
 * @param {Array} censusSegments - Census-based segments (for urban detection)
 * @param {Array} roadSegmentsOrCoords - Road ref segments from extractRoadRefs() OR coordinates (backwards compat)
 * @param {string} mapboxTokenUnused - Unused (backwards compat)
 */
export function classifyWithVoting(flowEvents, totalDistanceMeters, censusSegments = [], roadSegmentsOrCoords = [], mapboxTokenUnused = null) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🗳️ Voting Zone Classifier v1.3 (road ref primary)')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  
  if (!flowEvents || !Array.isArray(flowEvents)) {
    console.error('   ❌ Invalid flowEvents')
    return []
  }
  
  if (!totalDistanceMeters || totalDistanceMeters <= 0) {
    console.error('   ❌ Invalid totalDistanceMeters')
    return []
  }
  
  // Auto-detect: is 4th param roadSegments or coordinates?
  // roadSegments have .roadClass, coordinates are [lng, lat] arrays
  let roadSegments = []
  if (roadSegmentsOrCoords && roadSegmentsOrCoords.length > 0) {
    const first = roadSegmentsOrCoords[0]
    if (first && typeof first === 'object' && 'roadClass' in first) {
      // It's roadSegments
      roadSegments = roadSegmentsOrCoords
    } else if (Array.isArray(first) && first.length === 2 && typeof first[0] === 'number') {
      // It's coordinates - legacy mode, no road ref support
      console.log('   ⚠️ Received coordinates instead of roadSegments (legacy mode)')
    }
  }
  
  // Step 1: Extract meaningful curves
  const curves = extractCurves(flowEvents)
  console.log(`   First 3 curves: ${curves.slice(0, 3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', ')}`)
  console.log(`   Last 3 curves: ${curves.slice(-3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', ')}`)
  console.log(`   Meaningful curves (≥${THRESHOLDS.minAngleToCount}°): ${curves.length}`)
  
  // Step 2: Log road segment info
  if (roadSegments && roadSegments.length > 0) {
    const counts = { interstate: 0, us_highway: 0, state_route: 0, local: 0, unknown: 0 }
    roadSegments.forEach(seg => {
      counts[seg.roadClass] = (counts[seg.roadClass] || 0) + 1
    })
    console.log(`   Road refs: ${counts.interstate} interstate, ${counts.us_highway} US hwy, ${counts.state_route} state, ${counts.local} local`)
  } else {
    console.log('   ⚠️ No road ref data available')
  }
  
  // Step 3: Build voting windows
  const windows = buildVotingWindows(curves, totalMiles, censusSegments)
  console.log(`   Analysis windows: ${windows.length}`)
  
  // Step 4: Score each window WITH road refs
  const scoredWindows = windows.map(w => scoreWindowWithRoadRefs(w, curves, censusSegments, totalMiles, roadSegments))
  
  // Step 5: Classify windows
  const classifiedWindows = scoredWindows.map(classifyWindow)
  
  // Step 6: Merge into zones
  const rawZones = mergeWindowsToZones(classifiedWindows)
  console.log(`   Raw zones: ${rawZones.length}`)
  
  // Step 7: Clean up tiny zones
  const cleanedZones = cleanupZones(rawZones, totalMiles)
  console.log(`   After cleanup: ${cleanedZones.length}`)
  
  // Step 8: Remove zone overlaps
  const nonOverlappingZones = removeZoneOverlaps(cleanedZones)
  
  // Step 9: Apply urban at edges
  const finalZones = applyUrbanEdges(nonOverlappingZones, censusSegments, totalMiles)
  
  // Log results
  console.log(`   Final zones:`)
  finalZones.forEach((z, i) => {
    const reasonStr = z.reasons.slice(0, 3).join(', ')
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.lengthMiles.toFixed(1)}mi) [T:${z.score.technical} H:${z.score.transit}] - ${reasonStr}`)
  })
  
  return finalZones
}

/**
 * Score a window - WITH road ref primary override
 */
function scoreWindowWithRoadRefs(window, allCurves, censusSegments, totalMiles, roadSegments = []) {
  const { startMile, endMile, midMile } = window
  const score = { technical: 0, transit: 0, urban: 0 }
  const reasons = []
  
  // Get curves in windows
  const curvesInWindow = allCurves.filter(c => c.mile >= startMile && c.mile < endMile)
  const clusterEnd = startMile + THRESHOLDS.clusterWindowMiles
  const sustainedEnd = startMile + THRESHOLDS.sustainedWindowMiles
  const curvesInClusterWindow = allCurves.filter(c => c.mile >= startMile && c.mile < clusterEnd)
  const curvesInSustainedWindow = allCurves.filter(c => c.mile >= startMile && c.mile < sustainedEnd)
  
  // ================================================================
  // ROAD REF SIGNALS - PRIMARY OVERRIDE (Approach A)
  // ================================================================
  
  const roadAtMile = getRoadRefAtMile(midMile, roadSegments)
  let isInterstateOverride = false
  
  if (roadAtMile) {
    const { roadClass, ref, name } = roadAtMile
    
    switch (roadClass) {
      case 'interstate':
        // INTERSTATE = ALWAYS TRANSIT (no voting, just override)
        score.transit += WEIGHTS.roadRefInterstate
        reasons.push(`road: ${ref || name} (interstate override)`)
        isInterstateOverride = true
        break
        
      case 'us_highway':
        // US HIGHWAY = STRONG transit signal, but curves CAN override
        score.transit += WEIGHTS.roadRefUSHighway
        reasons.push(`road: ${ref || name}`)
        break
        
      case 'state_route':
        // STATE ROUTE = Neutral, let curves decide
        // No points added
        reasons.push(`road: ${ref || name}`)
        break
        
      case 'local':
        // LOCAL = Favor technical
        score.technical += WEIGHTS.roadRefLocal
        reasons.push(`road: ${ref || name} (local)`)
        break
    }
  }
  
  // If interstate override, skip curve-based voting entirely
  if (isInterstateOverride) {
    return { ...window, score, reasons, curvesInWindow: curvesInWindow.length, isOverride: true }
  }
  
  // ================================================================
  // CURVE-BASED SIGNALS (only if not interstate override)
  // ================================================================
  
  // Signal 1: Curve cluster
  if (curvesInClusterWindow.length >= THRESHOLDS.clusterMinCurves) {
    const avgAngle = curvesInClusterWindow.reduce((s, c) => s + c.angle, 0) / curvesInClusterWindow.length
    if (avgAngle >= THRESHOLDS.clusterMinAvgAngle) {
      score.technical += WEIGHTS.curveCluster
      reasons.push(`cluster: ${curvesInClusterWindow.length} curves, avg ${avgAngle.toFixed(0)}°`)
    }
  }
  
  // Signal 2: Sustained curves
  if (curvesInSustainedWindow.length >= THRESHOLDS.sustainedMinCurves) {
    const avgAngle = curvesInSustainedWindow.reduce((s, c) => s + c.angle, 0) / curvesInSustainedWindow.length
    if (avgAngle >= THRESHOLDS.sustainedMinAvgAngle) {
      score.technical += WEIGHTS.sustainedCurves
      reasons.push(`sustained: ${curvesInSustainedWindow.length} curves in ${THRESHOLDS.sustainedWindowMiles}mi, avg ${avgAngle.toFixed(0)}°`)
    }
  }
  
  // Signal 3: Danger curves
  const dangerCurves = curvesInSustainedWindow.filter(c => c.angle >= THRESHOLDS.dangerAngle)
  if (dangerCurves.length > 0) {
    score.technical += WEIGHTS.dangerCurve
    reasons.push(`danger: ${dangerCurves.length} curve(s) ≥${THRESHOLDS.dangerAngle}° nearby`)
  }
  
  // Signal 4: High average angle
  if (curvesInWindow.length >= 2) {
    const avgAngle = curvesInWindow.reduce((s, c) => s + c.angle, 0) / curvesInWindow.length
    if (avgAngle >= THRESHOLDS.highAngleAvg) {
      score.technical += WEIGHTS.highAngleAvg
      reasons.push(`high avg: ${avgAngle.toFixed(0)}° in window`)
    }
  }
  
  // Signal 5: Tight curves
  const tightCurves = curvesInWindow.filter(c => c.shape === 'tight' || (c.length && c.length < 0.1))
  if (tightCurves.length >= 2) {
    score.technical += WEIGHTS.tightCurves
    reasons.push(`tight: ${tightCurves.length} tight curves`)
  }
  
  // ================================================================
  // TRANSIT SIGNALS
  // ================================================================
  
  // Signal 6: Long gap
  const gapInfo = findGapAtMile(midMile, allCurves)
  if (gapInfo && gapInfo.length >= THRESHOLDS.gapThresholdMiles) {
    score.transit += WEIGHTS.longGap
    reasons.push(`gap: ${gapInfo.length.toFixed(1)}mi without curves`)
  }
  
  // Signal 7: Sparse window
  if (curvesInSustainedWindow.length < 2) {
    score.transit += WEIGHTS.sparseWindow
    reasons.push(`sparse: only ${curvesInSustainedWindow.length} curve(s) in ${THRESHOLDS.sustainedWindowMiles}mi`)
  }
  
  // Signal 8: Census rural
  const censusChar = getCensusCharacterAtMile(midMile, censusSegments)
  if (censusChar === 'rural') {
    score.transit += WEIGHTS.censusSaysRural
    reasons.push(`census: rural`)
  }
  
  // ================================================================
  // URBAN SIGNALS (edges only)
  // ================================================================
  
  if (censusChar === 'urban') {
    if (midMile < THRESHOLDS.maxUrbanMiles || midMile > totalMiles - THRESHOLDS.maxUrbanMiles) {
      score.urban += WEIGHTS.censusSaysUrban
      reasons.push(`census: urban at route edge`)
    }
  }
  
  return { ...window, score, reasons, curvesInWindow: curvesInWindow.length }
}

/**
 * Get road ref at a specific mile
 */
function getRoadRefAtMile(mile, roadSegments) {
  if (!roadSegments || !roadSegments.length) return null
  
  const segment = roadSegments.find(seg => mile >= seg.startMile && mile < seg.endMile)
  return segment || null
}

/**
 * Remove zone overlaps - ensures clean boundaries
 */
function removeZoneOverlaps(zones) {
  if (zones.length <= 1) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = { ...zones[i] }
    
    if (i > 0) {
      const prevZone = result[result.length - 1]
      // If this zone overlaps with previous, adjust start
      if (zone.startMile < prevZone.endMile) {
        zone.startMile = prevZone.endMile
      }
    }
    
    // Recalculate length
    zone.lengthMiles = zone.endMile - zone.startMile
    
    // Only add if zone still has length
    if (zone.lengthMiles > 0.1) {
      result.push(zone)
    }
  }
  
  return result
}

/**
 * Extract meaningful curves from flow events
 * Road Flow Analyzer outputs: mile, angle, direction, shape, type, length
 */
function extractCurves(flowEvents) {
  if (!flowEvents || flowEvents.length === 0) {
    console.log('   ⚠️ No flow events to extract curves from')
    return []
  }
  
  // Debug: show first event structure
  const first = flowEvents[0]
  console.log(`   Event sample: mile=${first.mile}, angle=${first.angle}, dir=${first.direction}`)
  
  const curves = flowEvents
    .filter(e => {
      // Road flow analyzer uses 'angle' directly
      const angle = e.angle ?? e.totalAngle ?? 0
      return angle >= THRESHOLDS.minAngleToCount
    })
    .map(e => {
      const mile = e.mile ?? e.apexMile ?? e.startMile ?? 0
      const angle = e.angle ?? e.totalAngle ?? 0
      
      return {
        mile,
        angle,
        direction: e.direction || 'UNKNOWN',
        shape: e.shape || 'medium',
        length: e.length ?? 0,
        type: e.type || 'curve',
      }
    })
    .sort((a, b) => a.mile - b.mile)
  
  console.log(`   Extracted ${curves.length} curves ≥${THRESHOLDS.minAngleToCount}° from ${flowEvents.length} events`)
  
  return curves
}

/**
 * Build sliding windows along route
 */
function buildVotingWindows(curves, totalMiles, censusSegments) {
  const windows = []
  const windowSize = THRESHOLDS.analysisWindowMiles
  const step = windowSize / 2
  
  for (let start = 0; start < totalMiles; start += step) {
    const end = Math.min(start + windowSize, totalMiles)
    windows.push({
      startMile: start,
      endMile: end,
      midMile: (start + end) / 2,
    })
  }
  
  return windows
}

/**
 * Find gap at mile position
 */
function findGapAtMile(mile, allCurves) {
  if (allCurves.length === 0) return { length: Infinity }
  
  let prevCurve = null
  let nextCurve = null
  
  for (const curve of allCurves) {
    if (curve.mile <= mile) {
      prevCurve = curve
    } else if (!nextCurve) {
      nextCurve = curve
      break
    }
  }
  
  const gapStart = prevCurve ? prevCurve.mile : 0
  const gapEnd = nextCurve ? nextCurve.mile : mile + 10
  
  if (mile >= gapStart && mile <= gapEnd) {
    return { start: gapStart, end: gapEnd, length: gapEnd - gapStart }
  }
  
  return null
}

/**
 * Get census character at mile
 */
function getCensusCharacterAtMile(mile, censusSegments) {
  if (!censusSegments.length) return null
  
  const meters = mile * 1609.34
  const segment = censusSegments.find(s => {
    const start = s.startDistance ?? s.start ?? 0
    const end = s.endDistance ?? s.end ?? 0
    return meters >= start && meters < end
  })
  
  return segment?.character || null
}

/**
 * Classify window based on scores
 */
function classifyWindow(window) {
  const { score, isOverride } = window
  
  // If interstate override, force transit
  if (isOverride) {
    return { ...window, character: 'transit' }
  }
  
  // Urban wins if it has points
  if (score.urban > 0) {
    return { ...window, character: 'urban' }
  }
  
  // Technical vs Transit
  if (score.technical > score.transit) {
    return { ...window, character: 'technical' }
  }
  
  // Transit wins or tie
  return { ...window, character: 'transit' }
}

/**
 * Merge adjacent windows with same character
 */
function mergeWindowsToZones(windows) {
  if (windows.length === 0) return []
  
  const zones = []
  let currentZone = {
    startMile: windows[0].startMile,
    endMile: windows[0].endMile,
    character: windows[0].character,
    score: { ...windows[0].score },
    reasons: [...windows[0].reasons],
  }
  
  for (let i = 1; i < windows.length; i++) {
    const w = windows[i]
    
    if (w.character === currentZone.character) {
      currentZone.endMile = w.endMile
      currentZone.score.technical += w.score.technical
      currentZone.score.transit += w.score.transit
      currentZone.score.urban += w.score.urban
      w.reasons.forEach(r => {
        if (!currentZone.reasons.includes(r)) {
          currentZone.reasons.push(r)
        }
      })
    } else {
      currentZone.lengthMiles = currentZone.endMile - currentZone.startMile
      zones.push(currentZone)
      currentZone = {
        startMile: w.startMile,
        endMile: w.endMile,
        character: w.character,
        score: { ...w.score },
        reasons: [...w.reasons],
      }
    }
  }
  
  currentZone.lengthMiles = currentZone.endMile - currentZone.startMile
  zones.push(currentZone)
  
  return zones
}

/**
 * Clean up tiny zones
 */
function cleanupZones(zones, totalMiles) {
  if (zones.length <= 1) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    
    // If zone is too short, merge with neighbor
    if (zone.lengthMiles < THRESHOLDS.minZoneLengthMiles) {
      if (result.length > 0) {
        // Merge with previous
        result[result.length - 1].endMile = zone.endMile
        result[result.length - 1].lengthMiles = result[result.length - 1].endMile - result[result.length - 1].startMile
      } else if (i < zones.length - 1) {
        // Merge with next
        zones[i + 1].startMile = zone.startMile
        zones[i + 1].lengthMiles = zones[i + 1].endMile - zones[i + 1].startMile
      } else {
        // Only zone, keep it
        result.push(zone)
      }
    } else {
      result.push(zone)
    }
  }
  
  return result
}

/**
 * Apply urban at route edges
 */
function applyUrbanEdges(zones, censusSegments, totalMiles) {
  if (zones.length === 0) return zones
  
  const result = [...zones]
  
  // Check start of route
  const startCensus = getCensusCharacterAtMile(0.5, censusSegments)
  if (startCensus === 'urban' && result[0].character !== 'urban') {
    // Insert urban zone at start
    const urbanEnd = Math.min(THRESHOLDS.maxUrbanMiles, result[0].endMile)
    if (urbanEnd > 0.3) {
      const urbanZone = {
        startMile: 0,
        endMile: urbanEnd,
        character: 'urban',
        score: { technical: 0, transit: 0, urban: WEIGHTS.censusSaysUrban },
        reasons: ['census: urban at route start'],
        lengthMiles: urbanEnd,
      }
      result[0].startMile = urbanEnd
      result[0].lengthMiles = result[0].endMile - result[0].startMile
      result.unshift(urbanZone)
    }
  }
  
  return result
}

/**
 * Reassign zone to each event based on classified zones
 */
export function reassignEventZones(events, zones) {
  if (!zones || zones.length === 0) return events
  
  let reassigned = 0
  
  const updatedEvents = events.map(event => {
    const mile = event.mile
    const zone = zones.find(z => mile >= z.startMile && mile < z.endMile)
    
    if (zone && event.zone !== zone.character) {
      reassigned++
      return { ...event, zone: zone.character }
    }
    
    return event
  })
  
  console.log(`📍 Reassigned zones to ${reassigned} events`)
  return updatedEvents
}

/**
 * Convert zones to standard format
 */
export function convertToStandardFormat(zones, totalDistanceMeters) {
  return zones.map(z => ({
    start: z.startMile * 1609.34,
    end: z.endMile * 1609.34,
    startDistance: z.startMile * 1609.34,
    endDistance: z.endMile * 1609.34,
    startMile: z.startMile,
    endMile: z.endMile,
    character: z.character,
    lengthMiles: z.lengthMiles,
    score: z.score,
    reasons: z.reasons,
  }))
}

export default {
  classifyWithVoting,
  reassignEventZones,
  convertToStandardFormat,
}
