// ================================
// Curve Pattern Zone Classifier v1.0
// 
// Simple, robust zone classification based on PATTERNS of curves
// NOT density averages or LLM decisions
// 
// Philosophy: 
// - Technical = clusters of 3+ curves within 0.5 miles with meaningful angles
// - Highway/Transit = everything else (long straights, sparse curves)
// - Urban = start/end of route (from Census, short segments only)
//
// This is intentionally SIMPLE and deterministic.
// ================================

/**
 * Configuration - these are the ONLY tuning parameters
 */
const CONFIG = {
  // What counts as a "curve"
  minAngleToCount: 12,           // Ignore tiny angle changes below this
  
  // What makes a "cluster" (technical section)
  clusterLookAheadMiles: 0.5,    // Look this far ahead to find clustered curves
  minCurvesForCluster: 3,        // Need at least this many curves in the window
  minAvgAngleForCluster: 18,     // Average angle must be meaningful
  
  // Danger curve override (single curve can trigger technical)
  dangerAngle: 50,               // Any curve >= this angle triggers technical zone
  dangerBufferMiles: 0.15,       // Buffer around danger curve
  
  // Zone cleanup
  mergeGapMiles: 0.3,            // Merge technical zones that are close
  minTechnicalLengthMiles: 0.25, // Don't create tiny technical zones
  
  // Urban detection (from Census)
  maxUrbanMiles: 1.5,            // Urban zones only at start/end, max this length
}

/**
 * Main entry point: Classify route zones by curve patterns
 * 
 * @param {Array} flowEvents - Events from Road Flow Analyzer (with mile, angle, direction)
 * @param {number} totalDistanceMeters - Total route distance in meters
 * @param {Array} censusSegments - Optional Census segments for urban detection
 * @returns {Array} Zone segments [{startMile, endMile, character, reason}]
 */
export function classifyByPattern(flowEvents, totalDistanceMeters, censusSegments = []) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🎯 Curve Pattern Zone Classifier v1.0')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  
  // Step 1: Extract meaningful curves
  const curves = extractMeaningfulCurves(flowEvents)
  console.log(`   Meaningful curves (≥${CONFIG.minAngleToCount}°): ${curves.length}`)
  
  if (curves.length === 0) {
    console.log('   No curves found - entire route is transit/highway')
    const zone = createZone(0, totalMiles, 'transit', 'no curves detected')
    console.log(`   Created transit zone: ${JSON.stringify(zone)}`)
    return [zone]
  }
  
  // Step 2: Find technical zones from clusters
  const technicalZones = findTechnicalZones(curves, totalMiles)
  console.log(`   Technical zones found: ${technicalZones.length}`)
  
  // Step 3: Build complete segment list (fill gaps with transit)
  const allZones = buildZoneList(technicalZones, totalMiles)
  
  // Step 4: Apply urban from Census (only at start/end)
  const finalZones = applyUrbanZones(allZones, censusSegments, totalMiles)
  
  // Log results
  console.log('   Final zones:')
  finalZones.forEach((z, i) => {
    const len = (z.endMile - z.startMile).toFixed(1)
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${len}mi) - ${z.reason}`)
  })
  
  return finalZones
}

/**
 * Extract curves that are meaningful (above minimum angle threshold)
 */
function extractMeaningfulCurves(events) {
  const curves = events
    .filter(e => {
      // Road Flow Analyzer uses 'totalAngle', rule-based filter uses 'angle'
      const angle = e.totalAngle ?? e.angle ?? 0
      return angle >= CONFIG.minAngleToCount
    })
    .map(e => ({
      // Road Flow uses apexMile, startMile, endMile - prefer apexMile
      mile: e.apexMile ?? e.mile ?? e.triggerMile ?? e.startMile ?? 0,
      angle: e.totalAngle ?? e.angle ?? 0,
      direction: e.direction || 'unknown',
      type: e.type || 'curve'
    }))
    .sort((a, b) => a.mile - b.mile)
  
  console.log(`   Sample curves: ${curves.slice(0, 5).map(c => `${c.mile.toFixed(1)}mi/${c.angle}°`).join(', ')}`)
  
  return curves
}

/**
 * Find technical zones by looking for curve clusters
 */
function findTechnicalZones(curves, totalMiles) {
  // First: Find danger curve zones (single severe curves)
  const dangerZones = findDangerCurveZones(curves)
  
  // Second: Find cluster-based zones
  const clusterZones = findClusterZones(curves)
  
  // Combine and merge
  const allZones = [...dangerZones, ...clusterZones]
  const merged = mergeOverlappingZones(allZones, totalMiles)
  
  // Filter out tiny zones
  return merged.filter(z => (z.endMile - z.startMile) >= CONFIG.minTechnicalLengthMiles)
}

/**
 * Find zones around danger curves (severe single curves)
 */
function findDangerCurveZones(curves) {
  const dangerCurves = curves.filter(c => c.angle >= CONFIG.dangerAngle)
  
  console.log(`   Danger curves (≥${CONFIG.dangerAngle}°): ${dangerCurves.length}`)
  
  return dangerCurves.map(c => ({
    startMile: Math.max(0, c.mile - CONFIG.dangerBufferMiles),
    endMile: c.mile + CONFIG.dangerBufferMiles,
    reason: `danger curve ${c.angle}°`,
    curveCount: 1,
    maxAngle: c.angle
  }))
}

/**
 * Find cluster zones using sliding window
 */
function findClusterZones(curves) {
  const zones = []
  const windowMiles = CONFIG.clusterLookAheadMiles
  const minCurves = CONFIG.minCurvesForCluster
  const minAvg = CONFIG.minAvgAngleForCluster
  
  let i = 0
  while (i < curves.length) {
    const startMile = curves[i].mile
    const windowEnd = startMile + windowMiles
    
    // Collect curves in this window
    const curvesInWindow = []
    let j = i
    while (j < curves.length && curves[j].mile <= windowEnd) {
      curvesInWindow.push(curves[j])
      j++
    }
    
    // Check if this is a valid cluster
    if (curvesInWindow.length >= minCurves) {
      const avgAngle = curvesInWindow.reduce((sum, c) => sum + c.angle, 0) / curvesInWindow.length
      
      if (avgAngle >= minAvg) {
        // Found a cluster! 
        const lastCurveMile = curvesInWindow[curvesInWindow.length - 1].mile
        
        zones.push({
          startMile: startMile,
          endMile: lastCurveMile,
          reason: `cluster: ${curvesInWindow.length} curves, avg ${Math.round(avgAngle)}°`,
          curveCount: curvesInWindow.length,
          maxAngle: Math.max(...curvesInWindow.map(c => c.angle))
        })
        
        // Skip to after this cluster to avoid overlapping clusters
        i = j
        continue
      }
    }
    
    i++
  }
  
  return zones
}

/**
 * Find SUSTAINED ACTIVITY zones (spread out curves like Weston)
 * This catches technical sections where curves are 0.5-1 mile apart
 * but still represent active, engaged driving
 */
function findSustainedActivityZones(curves) {
  const zones = []
  const windowMiles = CONFIG.sustainedLookAheadMiles
  const minCurves = CONFIG.minCurvesForSustained
  const minAvg = CONFIG.minAvgAngleForSustained
  
  let i = 0
  while (i < curves.length) {
    const startMile = curves[i].mile
    const windowEnd = startMile + windowMiles
    
    // Collect curves in this larger window
    const curvesInWindow = []
    let j = i
    while (j < curves.length && curves[j].mile <= windowEnd) {
      curvesInWindow.push(curves[j])
      j++
    }
    
    // Check if this is a valid sustained activity zone
    // Needs more curves AND higher average angle than cluster detection
    if (curvesInWindow.length >= minCurves) {
      const avgAngle = curvesInWindow.reduce((sum, c) => sum + c.angle, 0) / curvesInWindow.length
      
      if (avgAngle >= minAvg) {
        // Found sustained activity!
        const lastCurveMile = curvesInWindow[curvesInWindow.length - 1].mile
        
        zones.push({
          startMile: startMile,
          endMile: lastCurveMile,
          reason: `sustained: ${curvesInWindow.length} curves over ${(lastCurveMile - startMile).toFixed(1)}mi, avg ${Math.round(avgAngle)}°`,
          curveCount: curvesInWindow.length,
          maxAngle: Math.max(...curvesInWindow.map(c => c.angle))
        })
        
        // Skip to after this zone
        i = j
        continue
      }
    }
    
    i++
  }
  
  return zones
}

/**
 * Merge overlapping or adjacent zones
 */
function mergeOverlappingZones(zones, totalMiles) {
  if (zones.length === 0) return []
  
  // Sort by start mile
  const sorted = [...zones].sort((a, b) => a.startMile - b.startMile)
  
  const merged = [{...sorted[0]}]
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    
    // Merge if overlapping or within gap threshold
    if (current.startMile <= last.endMile + CONFIG.mergeGapMiles) {
      last.endMile = Math.max(last.endMile, current.endMile)
      last.curveCount = (last.curveCount || 0) + (current.curveCount || 0)
      last.maxAngle = Math.max(last.maxAngle || 0, current.maxAngle || 0)
      last.reason = `merged: ${last.curveCount} curves, max ${last.maxAngle}°`
    } else {
      merged.push({...current})
    }
  }
  
  // Clamp to route bounds
  return merged.map(z => ({
    ...z,
    startMile: Math.max(0, z.startMile),
    endMile: Math.min(totalMiles, z.endMile)
  }))
}

/**
 * Build complete zone list (fill gaps between technical zones with transit)
 */
function buildZoneList(technicalZones, totalMiles) {
  if (technicalZones.length === 0) {
    return [createZone(0, totalMiles, 'transit', 'no technical sections')]
  }
  
  const zones = []
  let currentMile = 0
  
  for (const tech of technicalZones) {
    // Add transit gap before this technical zone
    if (tech.startMile > currentMile + 0.1) {
      zones.push(createZone(currentMile, tech.startMile, 'transit', 'between technical'))
    }
    
    // Add the technical zone
    zones.push(createZone(
      Math.max(currentMile, tech.startMile), 
      tech.endMile, 
      'technical', 
      tech.reason
    ))
    
    currentMile = tech.endMile
  }
  
  // Add final transit zone if needed
  if (currentMile < totalMiles - 0.1) {
    zones.push(createZone(currentMile, totalMiles, 'transit', 'after technical'))
  }
  
  return zones
}

/**
 * Apply urban zones from Census data (only at route start/end)
 * Urban OVERRIDES technical at route start/end since city turns != rally technical
 */
function applyUrbanZones(zones, censusSegments, totalMiles) {
  if (!censusSegments.length) return zones
  
  const result = [...zones]
  
  // Check first Census segment for urban
  const firstCensus = censusSegments[0]
  if (firstCensus?.character === 'urban') {
    const urbanEndMile = Math.min(
      (firstCensus.end || firstCensus.endDistance) / 1609.34,
      CONFIG.maxUrbanMiles
    )
    
    // Urban OVERRIDES technical at route start (city turns != rally technical)
    // Only skip if it's genuinely transit/highway
    if (result[0].startMile === 0 && urbanEndMile > 0.1) {
      console.log(`   Applying urban override at route start: 0-${urbanEndMile.toFixed(1)}mi`)
      
      // Find all zones that fall within urban range and merge them
      let insertIdx = 0
      while (insertIdx < result.length && result[insertIdx].endMile <= urbanEndMile) {
        insertIdx++
      }
      
      if (insertIdx > 0) {
        // Remove zones fully within urban range
        result.splice(0, insertIdx)
      }
      
      // If next zone starts before urban end, trim it
      if (result.length > 0 && result[0].startMile < urbanEndMile) {
        // Update ALL start properties to keep them in sync
        const newStartMeters = urbanEndMile * 1609.34
        result[0].startMile = urbanEndMile
        result[0].start = newStartMeters
        result[0].startDistance = newStartMeters
      }
      
      // Insert urban zone at start
      result.unshift(createZone(0, urbanEndMile, 'urban', 'route start (census)'))
    }
  }
  
  // Check last Census segment for urban
  const lastCensus = censusSegments[censusSegments.length - 1]
  if (lastCensus?.character === 'urban') {
    const urbanStartMile = Math.max(
      (lastCensus.start || lastCensus.startDistance) / 1609.34,
      totalMiles - CONFIG.maxUrbanMiles
    )
    
    if (urbanStartMile < totalMiles - 0.1) {
      console.log(`   Applying urban override at route end: ${urbanStartMile.toFixed(1)}-${totalMiles.toFixed(1)}mi`)
      
      const lastIdx = result.length - 1
      
      // Find zones that overlap with urban end range
      while (result.length > 0 && result[result.length - 1].startMile >= urbanStartMile) {
        result.pop()
      }
      
      // If last remaining zone extends past urban start, trim it
      if (result.length > 0 && result[result.length - 1].endMile > urbanStartMile) {
        result[result.length - 1].endMile = urbanStartMile
      }
      
      // Add urban zone at end
      result.push(createZone(urbanStartMile, totalMiles, 'urban', 'route end (census)'))
    }
  }
  
  return result
}

/**
 * Helper: Create a zone object
 */
function createZone(startMile, endMile, character, reason) {
  return {
    startMile,
    endMile,
    start: startMile * 1609.34,
    end: endMile * 1609.34,
    startDistance: startMile * 1609.34,
    endDistance: endMile * 1609.34,
    character,
    reason
  }
}

/**
 * Reassign zone labels to flow events based on our classification
 */
export function reassignEventZones(events, zones) {
  return events.map(event => {
    const eventMile = event.mile ?? event.triggerMile ?? 0
    
    // Find which zone this event falls into
    const zone = zones.find(z => eventMile >= z.startMile && eventMile < z.endMile)
    
    return {
      ...event,
      zone: zone?.character || 'transit'
    }
  })
}

/**
 * Convert to standard zone format (for compatibility)
 * Includes both start/end AND startDistance/endDistance for compatibility
 */
export function convertToZoneFormat(zones) {
  console.log('   Converting zones to standard format...')
  return zones.map((z, i) => {
    // Calculate meters from miles if not already present
    const startMeters = z.start ?? z.startDistance ?? (z.startMile * 1609.34)
    const endMeters = z.end ?? z.endDistance ?? (z.endMile * 1609.34)
    
    const converted = {
      // Both property naming conventions for compatibility
      start: startMeters,
      end: endMeters,
      startDistance: startMeters,
      endDistance: endMeters,
      // Also keep mile values for convenience
      startMile: z.startMile,
      endMile: z.endMile,
      character: z.character,
      reason: z.reason
    }
    console.log(`      Zone ${i + 1}: ${converted.character} [${z.startMile?.toFixed(1)}-${z.endMile?.toFixed(1)}mi] = ${startMeters?.toFixed(0)}-${endMeters?.toFixed(0)}m`)
    return converted
  })
}

export default {
  classifyByPattern,
  reassignEventZones,
  convertToZoneFormat
}
