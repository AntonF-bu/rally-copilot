// ================================
// Voting Zone Classifier v1.0
// 
// Multiple signals vote on zone classification
// No single point of failure - consensus wins
//
// Lessons learned baked in:
// - ONE canonical format throughout
// - Multiple window sizes (0.5mi clusters, 2mi sustained)
// - Log the WHY with reasons array
// - Minimum zone length to avoid fragmentation
// - Fail safe to transit
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
  
  // Road class signals (from Mapbox) - STRONG signals
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
  minZoneLengthMiles: 0.5,     // Minimum zone length (reduced from 1.0)
  analysisWindowMiles: 0.5,    // Sliding window for analysis
  
  // Urban limits
  maxUrbanMiles: 1.0,          // Urban only at route edges
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
    // Computed helpers
    lengthMiles: endMile - startMile,
  }
}

/**
 * Main entry point
 * Now accepts coordinates and mapboxToken for road class lookups
 */
export async function classifyWithVoting(flowEvents, totalDistanceMeters, censusSegments = [], coordinates = [], mapboxToken = null) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🗳️ Voting Zone Classifier v1.1 (with road class)')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  
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
  
  // Step 1b: Fetch road class data (if we have coordinates and token)
  let roadClasses = new Map()
  if (coordinates && Array.isArray(coordinates) && coordinates.length > 0 && mapboxToken) {
    try {
      roadClasses = await fetchRoadClasses(coordinates, totalMiles, mapboxToken)
    } catch (err) {
      console.log('   ⚠️ Road class fetch failed:', err.message)
    }
  } else {
    console.log('   ⚠️ Road class lookup skipped (no coords/token)')
  }
  
  // Step 2: Build voting windows along the route
  const windows = buildVotingWindows(curves, totalMiles, censusSegments)
  console.log(`   Analysis windows: ${windows.length}`)
  
  // Step 3: Score each window (now with road classes)
  const scoredWindows = windows.map(w => scoreWindow(w, curves, censusSegments, totalMiles, roadClasses))
  
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
  // Debug: log first event to see full structure
  if (flowEvents.length > 0) {
    console.log('   Sample event FULL:', JSON.stringify(flowEvents[0], null, 2))
  }
  
  const curves = flowEvents
    .filter(e => {
      // Handle angle as number or string (might have ° symbol)
      let angle = e.angle ?? e.totalAngle ?? e.maxAngle ?? 0
      if (typeof angle === 'string') {
        angle = parseFloat(angle.replace('°', '')) || 0
      }
      return angle >= THRESHOLDS.minAngleToCount
    })
    .map(e => {
      // Parse angle, handling string with ° symbol
      let angle = e.angle ?? e.totalAngle ?? e.maxAngle ?? 0
      if (typeof angle === 'string') {
        angle = parseFloat(angle.replace('°', '')) || 0
      }
      
      // Try multiple property names for mile position
      let mile = e.mile ?? e.triggerMile ?? e.startMile ?? e.distance ?? 0
      if (typeof mile === 'string') {
        mile = parseFloat(mile) || 0
      }
      // Convert meters to miles if needed (if value > 100, it's probably meters)
      if (mile > 100) {
        mile = mile / 1609.34
      }
      
      return {
        mile: mile,
        angle: angle,
        length: e.length ?? e.curveLength ?? 0,
        direction: e.direction ?? 'UNKNOWN',
        type: e.type ?? 'curve',
        shape: e.shape ?? 'medium'
      }
    })
    .sort((a, b) => a.mile - b.mile)
  
  console.log(`   Extracted ${curves.length} curves from ${flowEvents.length} events`)
  if (curves.length > 0) {
    console.log(`   First 3 curves:`, curves.slice(0, 3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', '))
    console.log(`   Last 3 curves:`, curves.slice(-3).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', '))
  }
  
  return curves
}

/**
 * Fetch road class data from Mapbox for sample points along route
 * Returns a Map of mile -> roadClass
 */
async function fetchRoadClasses(coordinates, totalMiles, mapboxToken) {
  const roadClasses = new Map()
  
  if (!mapboxToken || !coordinates || coordinates.length < 2) {
    console.log('   ⚠️ No Mapbox token or coordinates for road class lookup')
    return roadClasses
  }
  
  // Sample every 2 miles (to limit API calls)
  const sampleInterval = 2 // miles
  const numSamples = Math.ceil(totalMiles / sampleInterval) + 1
  const coordsPerMile = coordinates.length / totalMiles
  
  console.log(`   🛣️ Fetching road classes for ${numSamples} sample points...`)
  
  // Batch requests to avoid rate limiting
  const batchSize = 10
  const batches = []
  
  for (let i = 0; i < numSamples; i++) {
    const mile = i * sampleInterval
    const coordIndex = Math.min(Math.floor(mile * coordsPerMile), coordinates.length - 1)
    const coord = coordinates[coordIndex]
    
    if (coord && coord.length >= 2) {
      batches.push({ mile, lng: coord[0], lat: coord[1] })
    }
  }
  
  // Process in batches
  for (let b = 0; b < batches.length; b += batchSize) {
    const batch = batches.slice(b, b + batchSize)
    
    await Promise.all(batch.map(async ({ mile, lng, lat }) => {
      try {
        const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?layers=road&limit=1&access_token=${mapboxToken}`
        const response = await fetch(url)
        
        if (response.ok) {
          const data = await response.json()
          if (data.features && data.features.length > 0) {
            const props = data.features[0].properties
            const roadClass = props.class || 'unknown'
            roadClasses.set(mile, roadClass)
          }
        }
      } catch (err) {
        // Silently fail for individual points
      }
    }))
    
    // Small delay between batches
    if (b + batchSize < batches.length) {
      await new Promise(r => setTimeout(r, 100))
    }
  }
  
  console.log(`   ✅ Road class data: ${roadClasses.size} samples`)
  if (roadClasses.size > 0) {
    const sample = Array.from(roadClasses.entries()).slice(0, 5)
    console.log(`   Sample: ${sample.map(([m, c]) => `${m}mi:${c}`).join(', ')}`)
  }
  
  return roadClasses
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
 * Score a window with all voting signals
 */
function scoreWindow(window, allCurves, censusSegments, totalMiles, roadClasses = new Map()) {
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
  
  // === ROAD CLASS SIGNALS (strongest!) ===
  
  // Find the nearest road class sample for this window
  let nearestRoadClass = null
  let nearestDist = Infinity
  
  // Defensive: ensure roadClasses is iterable (Map or array of [key, value])
  if (roadClasses && typeof roadClasses.entries === 'function') {
    for (const [mile, roadClass] of roadClasses.entries()) {
      const dist = Math.abs(mile - midMile)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestRoadClass = roadClass
      }
    }
  } else if (roadClasses && roadClasses.size === undefined && typeof roadClasses === 'object') {
    // Handle plain object {mile: roadClass}
    for (const [mileStr, roadClass] of Object.entries(roadClasses)) {
      const mile = parseFloat(mileStr)
      const dist = Math.abs(mile - midMile)
      if (dist < nearestDist) {
        nearestDist = dist
        nearestRoadClass = roadClass
      }
    }
  }
  
  if (nearestRoadClass && nearestDist < 3) { // Within 3 miles of sample
    switch (nearestRoadClass) {
      case 'motorway':
      case 'motorway_link':
      case 'trunk':
      case 'trunk_link':
        score.transit += WEIGHTS.roadClassMotorway
        reasons.push(`road: ${nearestRoadClass}`)
        break
      case 'primary':
      case 'primary_link':
        score.transit += WEIGHTS.roadClassPrimary
        reasons.push(`road: ${nearestRoadClass}`)
        break
      case 'secondary':
      case 'secondary_link':
        score.technical += Math.abs(WEIGHTS.roadClassSecondary)
        reasons.push(`road: ${nearestRoadClass}`)
        break
      case 'tertiary':
      case 'tertiary_link':
        score.technical += Math.abs(WEIGHTS.roadClassTertiary)
        reasons.push(`road: ${nearestRoadClass}`)
        break
      case 'residential':
      case 'service':
        score.technical += Math.abs(WEIGHTS.roadClassResidential)
        reasons.push(`road: ${nearestRoadClass}`)
        break
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
  
  // Signal 6: Long gap (check if we're in a gap)
  const gapInfo = findGapAtMile(midMile, allCurves)
  if (gapInfo && gapInfo.length >= THRESHOLDS.gapThresholdMiles) {
    score.transit += WEIGHTS.longGap
    reasons.push(`gap: ${gapInfo.length.toFixed(1)}mi without curves`)
  }
  
  // Signal 7: Sparse window (very few curves in 2mi)
  if (curvesInSustainedWindow.length < 2) {
    score.transit += WEIGHTS.sparseWindow
    reasons.push(`sparse: only ${curvesInSustainedWindow.length} curve(s) in ${THRESHOLDS.sustainedWindowMiles}mi`)
  }
  
  // Signal 8: Census says rural (weak transit signal)
  const censusChar = getCensusCharacterAtMile(midMile, censusSegments)
  if (censusChar === 'rural') {
    score.transit += WEIGHTS.censusSaysRural
    reasons.push(`census: rural`)
  }
  
  // === URBAN SIGNALS (only at edges) ===
  
  // Signal 9: Census says urban at route edges
  if (censusChar === 'urban') {
    if (midMile < THRESHOLDS.maxUrbanMiles || midMile > totalMiles - THRESHOLDS.maxUrbanMiles) {
      score.urban += WEIGHTS.censusSaysUrban
      reasons.push(`census: urban at route edge`)
    }
  }
  
  return {
    ...window,
    score,
    reasons,
    curvesInWindow: curvesInWindow.length,
  }
}

/**
 * Find if a mile position is within a gap between curves
 */
function findGapAtMile(mile, allCurves) {
  if (allCurves.length === 0) return { length: Infinity }
  
  // Find the curve before and after this mile
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
  
  // Calculate gap
  const gapStart = prevCurve ? prevCurve.mile : 0
  const gapEnd = nextCurve ? nextCurve.mile : mile + 10  // Assume gap continues
  
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
  // Urban overrides technical because dense urban 90° turns != rally technical
  if (score.urban > 0) {
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
  
  // Check start
  const startCensus = getCensusCharacterAtMile(0.1, censusSegments)
  if (startCensus === 'urban' && result[0].character !== 'urban') {
    const urbanEnd = Math.min(maxUrban, result[0].endMile)
    
    if (urbanEnd > 0.2) {
      // Split first zone if needed
      if (result[0].startMile < urbanEnd && result[0].endMile > urbanEnd) {
        const remainder = { ...result[0], startMile: urbanEnd, lengthMiles: result[0].endMile - urbanEnd }
        result[0] = createZone(0, urbanEnd, 'urban', { technical: 0, transit: 0, urban: WEIGHTS.censusSaysUrban }, ['census: urban at start'])
        result.splice(1, 0, remainder)
      }
    }
  }
  
  // Check end
  const endCensus = getCensusCharacterAtMile(totalMiles - 0.1, censusSegments)
  if (endCensus === 'urban' && result[result.length - 1].character !== 'urban') {
    const urbanStart = Math.max(totalMiles - maxUrban, result[result.length - 1].startMile)
    
    if (totalMiles - urbanStart > 0.2) {
      const lastIdx = result.length - 1
      if (result[lastIdx].startMile < urbanStart && result[lastIdx].endMile > urbanStart) {
        const remainder = { ...result[lastIdx], endMile: urbanStart, lengthMiles: urbanStart - result[lastIdx].startMile }
        result[lastIdx] = remainder
        result.push(createZone(urbanStart, totalMiles, 'urban', { technical: 0, transit: 0, urban: WEIGHTS.censusSaysUrban }, ['census: urban at end']))
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
    const eventMile = event.mile ?? event.triggerMile ?? 0
    
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
    // Add meter-based distances for compatibility
    start: z.startMile * 1609.34,
    end: z.endMile * 1609.34,
    startDistance: z.startMile * 1609.34,
    endDistance: z.endMile * 1609.34,
  }))
}
