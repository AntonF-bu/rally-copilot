// ================================
// Voting Zone Classifier v1.2
// 
// NEW: Road ref integration from Mapbox Directions API
// Uses step.ref (I-90, US-9, MA-66) as strong signal
//
// Multiple signals vote on zone classification
// No single point of failure - consensus wins
// ================================

/**
 * Point weights for each signal
 * Tunable based on real-world testing
 */
const WEIGHTS = {
  // Pro-Technical signals
  curveCluster: 4,        // 3+ curves in 0.5mi - strong signal
  sustainedCurves: 3,     // 4+ curves in 2mi - good signal
  dangerCurve: 3,         // Single curve ≥50° nearby
  highAngleAvg: 2,        // Average angle ≥25° in window
  tightCurves: 2,         // Multiple tight (<0.1mi) curves
  
  // Pro-Transit signals
  longGap: 4,             // 2mi+ with no significant curves
  censusSaysRural: 1,     // Census rural (weak signal alone)
  sparseWindow: 2,        // <2 curves in 2mi window
  
  // Pro-Urban signals (only at route start/end)
  censusSaysUrban: 10,    // Census urban at route edges - STRONG override
  
  // Road class signals (from Mapbox Directions step.ref) - STRONG signals
  roadRefInterstate: 10,  // I-90, I-95 = definitely highway/transit
  roadRefUSHighway: 6,    // US-1, US-9 = likely highway
  roadRefStateRoute: 0,   // MA-9, NY-17 = neutral (could be either)
  roadRefLocal: -4,       // Local roads = likely technical (negative = pro-technical)
  
  // Legacy road class signals (from Mapbox Tilequery - may not be used)
  roadClassMotorway: 8,   // motorway/trunk = definitely highway/transit
  roadClassPrimary: 4,    // primary = likely highway
  roadClassSecondary: -2, // secondary = could be technical (negative = pro-technical)
  roadClassTertiary: -4,  // tertiary/residential = likely technical
  roadClassResidential: -3, // residential in urban areas
}

/**
 * Detection thresholds
 */
const THRESHOLDS = {
  // Curve detection
  minAngleToCount: 12,         // Ignore tiny angles
  dangerAngle: 50,             // Danger curve threshold
  highAngleAvg: 25,            // "High angle" average threshold
  
  // Cluster detection (dense sections)
  clusterWindowMiles: 0.5,
  clusterMinCurves: 3,
  clusterMinAvgAngle: 18,
  
  // Sustained detection (spread sections)  
  sustainedWindowMiles: 2.0,
  sustainedMinCurves: 4,
  sustainedMinAvgAngle: 20,
  
  // Gap detection
  gapThresholdMiles: 2.0,      // Gap this long = transit signal
  
  // Zone cleanup
  minZoneLengthMiles: 0.5,     // Minimum zone length
  analysisWindowMiles: 0.5,    // Sliding window for analysis
  
  // Urban limits
  maxUrbanMiles: 2.0,          // Urban only at route edges (increased from 1.0)
}

/**
 * THE canonical zone format - used everywhere
 */
function createZone(startMile, endMile, character, score, reasons) {
  return {
    startMile,
    endMile,
    character,
    score: { ...score },
    reasons: [...reasons],
    lengthMiles: endMile - startMile,
  }
}

/**
 * Main entry point - UPDATED to accept road segments
 * 
 * @param {Array} flowEvents - Events from Road Flow Analyzer
 * @param {number} totalDistanceMeters - Total route distance
 * @param {Array} censusSegments - Census data for urban detection
 * @param {Array} roadSegments - Road refs from extractRoadRefs() - NEW!
 * @returns {Array} Zone segments
 */
export function classifyWithVoting(flowEvents, totalDistanceMeters, censusSegments = [], roadSegments = []) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🗳️ Voting Zone Classifier v1.2 (with road refs)')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  console.log(`   Road segments: ${roadSegments.length}`)
  
  // Validate inputs
  if (!flowEvents || !Array.isArray(flowEvents)) {
    console.error('   ❌ Invalid flowEvents - must be array')
    return []
  }
  
  if (!totalDistanceMeters || totalDistanceMeters <= 0) {
    console.error('   ❌ Invalid totalDistanceMeters')
    return []
  }
  
  // Step 1: Extract meaningful curves
  const curves = extractCurves(flowEvents)
  console.log(`   Meaningful curves (≥${THRESHOLDS.minAngleToCount}°): ${curves.length}`)
  
  // Step 1b: Log road ref coverage
  if (roadSegments.length > 0) {
    const interstates = roadSegments.filter(s => s.roadClass === 'interstate')
    const usHighways = roadSegments.filter(s => s.roadClass === 'us_highway')
    const stateRoutes = roadSegments.filter(s => s.roadClass === 'state_route')
    const localRoads = roadSegments.filter(s => s.roadClass === 'local')
    console.log(`   Road refs: ${interstates.length} interstate, ${usHighways.length} US hwy, ${stateRoutes.length} state, ${localRoads.length} local`)
  } else {
    console.log('   ⚠️ No road ref data available')
  }
  
  // Step 2: Build voting windows along the route
  const windows = buildVotingWindows(curves, totalMiles, censusSegments)
  console.log(`   Analysis windows: ${windows.length}`)
  
  // Step 3: Score each window (now with road refs!)
  const scoredWindows = windows.map(w => scoreWindow(w, curves, censusSegments, totalMiles, roadSegments))
  
  // Step 4: Determine character for each window
  const classifiedWindows = scoredWindows.map(classifyWindow)
  
  // Step 5: Merge adjacent windows with same character into zones
  const rawZones = mergeWindowsToZones(classifiedWindows)
  console.log(`   Raw zones: ${rawZones.length}`)
  
  // Step 6: Clean up tiny zones
  const cleanedZones = cleanupZones(rawZones, totalMiles)
  console.log(`   After cleanup: ${cleanedZones.length}`)
  
  // Step 7: Apply urban at route edges if Census supports it
  const finalZones = applyUrbanEdges(cleanedZones, censusSegments, totalMiles)
  
  // Log results
  console.log(`   Final zones:`)
  finalZones.forEach((z, i) => {
    const reasonStr = z.reasons.slice(0, 3).join(', ')
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.lengthMiles.toFixed(1)}mi) [T:${z.score.technical} H:${z.score.transit}] - ${reasonStr}`)
  })
  
  return finalZones
}

/**
 * Extract curves from flow events
 */
function extractCurves(flowEvents) {
  const curves = flowEvents
    .filter(e => {
      let angle = e.angle ?? e.totalAngle ?? e.maxAngle ?? 0
      if (typeof angle === 'string') {
        angle = parseFloat(angle.replace('°', '')) || 0
      }
      return angle >= THRESHOLDS.minAngleToCount
    })
    .map(e => {
      let angle = e.angle ?? e.totalAngle ?? e.maxAngle ?? 0
      if (typeof angle === 'string') {
        angle = parseFloat(angle.replace('°', '')) || 0
      }
      
      let mile = e.mile ?? e.triggerMile ?? e.startMile ?? e.apexMile ?? 0
      if (typeof mile === 'string') {
        mile = parseFloat(mile) || 0
      }
      if (mile > 100) {
        mile = mile / 1609.34
      }
      
      return {
        mile,
        angle,
        length: e.length ?? e.curveLength ?? 0,
        direction: e.direction ?? 'UNKNOWN',
        type: e.type ?? 'curve',
        shape: e.shape ?? 'medium'
      }
    })
    .sort((a, b) => a.mile - b.mile)
  
  if (curves.length > 0) {
    console.log(`   First 3 curves:`, curves.slice(0, 3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', '))
    console.log(`   Last 3 curves:`, curves.slice(-3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', '))
  }
  
  return curves
}

/**
 * Build sliding windows along the route
 */
function buildVotingWindows(curves, totalMiles, censusSegments) {
  const windows = []
  const windowSize = THRESHOLDS.analysisWindowMiles
  const step = windowSize / 2  // 50% overlap for smoother transitions
  
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
 * Score a window with all voting signals - UPDATED with road refs
 */
function scoreWindow(window, allCurves, censusSegments, totalMiles, roadSegments = []) {
  const { startMile, endMile, midMile } = window
  const score = { technical: 0, transit: 0, urban: 0 }
  const reasons = []
  
  // Get curves in this window
  const curvesInWindow = allCurves.filter(c => c.mile >= startMile && c.mile < endMile)
  
  // Get curves in extended windows for cluster/sustained detection
  const clusterEnd = startMile + THRESHOLDS.clusterWindowMiles
  const sustainedEnd = startMile + THRESHOLDS.sustainedWindowMiles
  
  const curvesInClusterWindow = allCurves.filter(c => c.mile >= startMile && c.mile < clusterEnd)
  const curvesInSustainedWindow = allCurves.filter(c => c.mile >= startMile && c.mile < sustainedEnd)
  
  // === ROAD REF SIGNALS (strongest - from Mapbox Directions API) ===
  if (roadSegments && roadSegments.length > 0) {
    // Find the road segment(s) that cover this window
    const roadsInWindow = roadSegments.filter(seg => 
      (seg.startMile <= endMile && seg.endMile >= startMile)
    )
    
    if (roadsInWindow.length > 0) {
      // Use the dominant road class in this window (by distance covered)
      const roadClassCoverage = {}
      for (const seg of roadsInWindow) {
        const overlapStart = Math.max(seg.startMile, startMile)
        const overlapEnd = Math.min(seg.endMile, endMile)
        const coverage = overlapEnd - overlapStart
        roadClassCoverage[seg.roadClass] = (roadClassCoverage[seg.roadClass] || 0) + coverage
      }
      
      // Find dominant road class
      let dominantClass = 'unknown'
      let maxCoverage = 0
      for (const [roadClass, coverage] of Object.entries(roadClassCoverage)) {
        if (coverage > maxCoverage) {
          maxCoverage = coverage
          dominantClass = roadClass
        }
      }
      
      // Apply road ref signal
      switch (dominantClass) {
        case 'interstate':
          score.transit += WEIGHTS.roadRefInterstate
          const interstateRef = roadsInWindow.find(r => r.roadClass === 'interstate')?.ref
          reasons.push(`road: ${interstateRef || 'Interstate'}`)
          break
        case 'us_highway':
          score.transit += WEIGHTS.roadRefUSHighway
          const usRef = roadsInWindow.find(r => r.roadClass === 'us_highway')?.ref
          reasons.push(`road: ${usRef || 'US Highway'}`)
          break
        case 'state_route':
          // Neutral - state routes can be either highway or technical
          // Don't add points, but log it
          const stateRef = roadsInWindow.find(r => r.roadClass === 'state_route')?.ref
          if (stateRef) reasons.push(`road: ${stateRef}`)
          break
        case 'local':
          score.technical += Math.abs(WEIGHTS.roadRefLocal)
          reasons.push(`road: local`)
          break
      }
    }
  }
  
  // === TECHNICAL SIGNALS ===
  
  // Signal 1: Curve cluster (3+ in 0.5mi)
  if (curvesInClusterWindow.length >= THRESHOLDS.clusterMinCurves) {
    const avgAngle = curvesInClusterWindow.reduce((s, c) => s + c.angle, 0) / curvesInClusterWindow.length
    if (avgAngle >= THRESHOLDS.clusterMinAvgAngle) {
      score.technical += WEIGHTS.curveCluster
      reasons.push(`cluster: ${curvesInClusterWindow.length} curves, avg ${avgAngle.toFixed(0)}°`)
    }
  }
  
  // Signal 2: Sustained curves (4+ in 2mi)
  if (curvesInSustainedWindow.length >= THRESHOLDS.sustainedMinCurves) {
    const avgAngle = curvesInSustainedWindow.reduce((s, c) => s + c.angle, 0) / curvesInSustainedWindow.length
    if (avgAngle >= THRESHOLDS.sustainedMinAvgAngle) {
      score.technical += WEIGHTS.sustainedCurves
      reasons.push(`sustained: ${curvesInSustainedWindow.length} curves in ${THRESHOLDS.sustainedWindowMiles}mi, avg ${avgAngle.toFixed(0)}°`)
    }
  }
  
  // Signal 3: Danger curve nearby
  const dangerCurves = curvesInSustainedWindow.filter(c => c.angle >= THRESHOLDS.dangerAngle)
  if (dangerCurves.length > 0) {
    score.technical += WEIGHTS.dangerCurve
    reasons.push(`danger: ${dangerCurves.length} curve(s) ≥${THRESHOLDS.dangerAngle}° nearby`)
  }
  
  // Signal 4: High average angle in window
  if (curvesInWindow.length >= 2) {
    const avgAngle = curvesInWindow.reduce((s, c) => s + c.angle, 0) / curvesInWindow.length
    if (avgAngle >= THRESHOLDS.highAngleAvg) {
      score.technical += WEIGHTS.highAngleAvg
      reasons.push(`high avg: ${avgAngle.toFixed(0)}° in window`)
    }
  }
  
  // Signal 5: Tight curves (multiple short-radius curves)
  const tightCurves = curvesInWindow.filter(c => c.shape === 'tight' || (c.length && c.length < 0.1))
  if (tightCurves.length >= 2) {
    score.technical += WEIGHTS.tightCurves
    reasons.push(`tight: ${tightCurves.length} tight curves`)
  }
  
  // === TRANSIT SIGNALS ===
  
  // Signal 6: Long gap (2mi+ without curves)
  const gapInfo = findGapAtMile(midMile, allCurves)
  if (gapInfo && gapInfo.length >= THRESHOLDS.gapThresholdMiles) {
    score.transit += WEIGHTS.longGap
    reasons.push(`gap: ${gapInfo.length.toFixed(1)}mi without curves`)
  }
  
  // Signal 7: Sparse window (<2 curves in 2mi)
  if (curvesInSustainedWindow.length < 2) {
    score.transit += WEIGHTS.sparseWindow
    reasons.push(`sparse: only ${curvesInSustainedWindow.length} curve(s) in 2mi`)
  }
  
  // Signal 8: Census rural (weak signal)
  const censusChar = getCensusCharacterAtMile(midMile, censusSegments)
  if (censusChar === 'rural') {
    score.transit += WEIGHTS.censusSaysRural
    reasons.push(`census: rural`)
  }
  
  // === URBAN SIGNALS (only at route edges) ===
  const isNearStart = midMile <= THRESHOLDS.maxUrbanMiles
  const isNearEnd = midMile >= (totalMiles - THRESHOLDS.maxUrbanMiles)
  
  if ((isNearStart || isNearEnd) && censusChar === 'urban') {
    score.urban += WEIGHTS.censusSaysUrban
    reasons.push(`census: urban at route ${isNearStart ? 'start' : 'end'}`)
  }
  
  return { ...window, score, reasons }
}

/**
 * Find if there's a gap (no curves) at a given mile
 */
function findGapAtMile(mile, allCurves) {
  if (!allCurves.length) return { start: 0, end: 1000, length: 1000 }
  
  const sortedCurves = [...allCurves].sort((a, b) => a.mile - b.mile)
  
  // Find curves before and after this mile
  let prevCurve = null
  let nextCurve = null
  
  for (let i = 0; i < sortedCurves.length; i++) {
    if (sortedCurves[i].mile <= mile) {
      prevCurve = sortedCurves[i]
    }
    if (sortedCurves[i].mile > mile && !nextCurve) {
      nextCurve = sortedCurves[i]
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
 * Get Census character at a specific mile
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
 * Classify a window based on scores
 */
function classifyWindow(window) {
  const { score } = window
  
  // Urban wins if it has points (only given at route edges when Census says urban)
  if (score.urban > 0 && score.urban >= score.technical) {
    return { ...window, character: 'urban' }
  }
  
  // Technical vs Transit - higher score wins
  if (score.technical > score.transit) {
    return { ...window, character: 'technical' }
  }
  
  // Transit wins or tie (fail safe to transit)
  return { ...window, character: 'transit' }
}

/**
 * Merge adjacent windows with same character into zones
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
      // Extend current zone
      currentZone.endMile = w.endMile
      // Accumulate scores
      currentZone.score.technical += w.score.technical
      currentZone.score.transit += w.score.transit
      currentZone.score.urban += w.score.urban
      // Add unique reasons
      w.reasons.forEach(r => {
        if (!currentZone.reasons.includes(r)) {
          currentZone.reasons.push(r)
        }
      })
    } else {
      // Save current zone and start new one
      zones.push(createZone(
        currentZone.startMile,
        currentZone.endMile,
        currentZone.character,
        currentZone.score,
        currentZone.reasons
      ))
      
      currentZone = {
        startMile: w.startMile,
        endMile: w.endMile,
        character: w.character,
        score: { ...w.score },
        reasons: [...w.reasons],
      }
    }
  }
  
  // Don't forget the last zone
  zones.push(createZone(
    currentZone.startMile,
    currentZone.endMile,
    currentZone.character,
    currentZone.score,
    currentZone.reasons
  ))
  
  return zones
}

/**
 * Clean up tiny zones by absorbing them into neighbors
 */
function cleanupZones(zones, totalMiles) {
  if (zones.length <= 1) return zones
  
  const minLength = THRESHOLDS.minZoneLengthMiles
  let result = [...zones]
  let changed = true
  
  // Iterate until no more changes
  while (changed) {
    changed = false
    const newResult = []
    
    for (let i = 0; i < result.length; i++) {
      const zone = result[i]
      
      // If zone is too small, absorb into neighbor
      if (zone.lengthMiles < minLength && result.length > 1) {
        const prevZone = newResult[newResult.length - 1]
        const nextZone = result[i + 1]
        
        // Prefer absorbing into same-type neighbor, else larger neighbor
        if (prevZone && prevZone.character === zone.character) {
          // Extend previous zone
          prevZone.endMile = zone.endMile
          prevZone.lengthMiles = prevZone.endMile - prevZone.startMile
          prevZone.reasons.push(`absorbed ${zone.lengthMiles.toFixed(1)}mi ${zone.character}`)
          changed = true
          continue
        } else if (nextZone && nextZone.character === zone.character) {
          // Extend next zone backwards
          nextZone.startMile = zone.startMile
          nextZone.lengthMiles = nextZone.endMile - nextZone.startMile
          nextZone.reasons.push(`absorbed ${zone.lengthMiles.toFixed(1)}mi ${zone.character}`)
          changed = true
          continue
        } else if (prevZone) {
          // Absorb into previous (different type)
          prevZone.endMile = zone.endMile
          prevZone.lengthMiles = prevZone.endMile - prevZone.startMile
          prevZone.reasons.push(`absorbed ${zone.lengthMiles.toFixed(1)}mi ${zone.character}`)
          changed = true
          continue
        }
      }
      
      newResult.push(zone)
    }
    
    result = newResult
  }
  
  return result
}

/**
 * Apply urban zones at route edges if Census supports it
 */
function applyUrbanEdges(zones, censusSegments, totalMiles) {
  if (!censusSegments.length || zones.length === 0) return zones
  
  const result = [...zones]
  const maxUrban = THRESHOLDS.maxUrbanMiles
  
  // Check start - FORCE urban if census says urban in first 2 miles
  const startCensus = getCensusCharacterAtMile(0.5, censusSegments)
  if (startCensus === 'urban' && result[0].character !== 'urban') {
    // Find where urban should end (either maxUrban or where census stops saying urban)
    let urbanEndMile = maxUrban
    for (let mile = 0.5; mile <= maxUrban; mile += 0.5) {
      if (getCensusCharacterAtMile(mile, censusSegments) !== 'urban') {
        urbanEndMile = mile
        break
      }
    }
    
    if (urbanEndMile > 0.3) {
      // Split/replace first zone
      if (result[0].endMile <= urbanEndMile) {
        // First zone is entirely within urban range - just change its character
        result[0].character = 'urban'
        result[0].reasons.unshift('census: urban at start (forced)')
      } else {
        // Split first zone
        const remainder = { 
          ...result[0], 
          startMile: urbanEndMile, 
          lengthMiles: result[0].endMile - urbanEndMile 
        }
        result[0] = createZone(
          0, 
          urbanEndMile, 
          'urban', 
          { technical: 0, transit: 0, urban: WEIGHTS.censusSaysUrban }, 
          ['census: urban at start (forced)']
        )
        result.splice(1, 0, remainder)
      }
    }
  }
  
  // Check end
  const endCensus = getCensusCharacterAtMile(totalMiles - 0.5, censusSegments)
  if (endCensus === 'urban' && result[result.length - 1].character !== 'urban') {
    const urbanStart = Math.max(totalMiles - maxUrban, result[result.length - 1].startMile)
    
    if (totalMiles - urbanStart > 0.3) {
      const lastIdx = result.length - 1
      if (result[lastIdx].startMile >= urbanStart) {
        // Last zone is entirely within urban range
        result[lastIdx].character = 'urban'
        result[lastIdx].reasons.unshift('census: urban at end (forced)')
      } else if (result[lastIdx].startMile < urbanStart && result[lastIdx].endMile > urbanStart) {
        // Split last zone
        const remainder = { 
          ...result[lastIdx], 
          endMile: urbanStart, 
          lengthMiles: urbanStart - result[lastIdx].startMile 
        }
        result[lastIdx] = remainder
        result.push(createZone(
          urbanStart, 
          totalMiles, 
          'urban', 
          { technical: 0, transit: 0, urban: WEIGHTS.censusSaysUrban }, 
          ['census: urban at end (forced)']
        ))
      }
    }
  }
  
  return result
}

/**
 * Reassign zones to events - uses THE canonical format
 */
export function reassignEventZones(events, zones) {
  return events.map(event => {
    const eventMile = event.mile ?? event.triggerMile ?? event.apexMile ?? 0
    
    // Find which zone this event falls into
    const zone = zones.find(z => eventMile >= z.startMile && eventMile < z.endMile)
    
    return {
      ...event,
      zone: zone?.character || 'transit',
      zoneReason: zone?.reasons?.[0] || 'default'
    }
  })
}

/**
 * Convert to standard format for compatibility with existing code
 * Adds startDistance/endDistance in meters
 */
export function convertToStandardFormat(zones) {
  return zones.map(z => ({
    ...z,
    start: z.startMile * 1609.34,
    end: z.endMile * 1609.34,
    startDistance: z.startMile * 1609.34,
    endDistance: z.endMile * 1609.34,
  }))
}

// Export for use in RoutePreview
export default {
  classifyWithVoting,
  reassignEventZones,
  convertToStandardFormat,
}
