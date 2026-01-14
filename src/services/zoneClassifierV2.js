// ================================
// Zone Classifier v2.1
// 
// Classification based on TIGHTNESS SCORE (angle ÷ curve length)
// This captures how a curve FEELS at speed:
// - URBAN: Very tight (>300) = sharp intersection corners
// - HIGHWAY: Sweeping (<100) = gentle highway bends
// - TECHNICAL: Winding (100-300) = backroad curves
//
// Formula: Tightness = Angle (degrees) ÷ Length (miles)
//
// Three factors:
// 1. Tightness Score (PRIMARY) - angle relative to curve length
// 2. Average Angle (SECONDARY) - for edge cases
// 3. Census (VALIDATOR)
// ================================

/**
 * Configuration
 */
const CONFIG = {
  // Tightness Score thresholds (degrees per mile)
  urbanMinTightness: 300,      // Very sharp corners (intersections)
  technicalMinTightness: 100,  // Winding backroads
  // Below 100 = Highway sweepers
  
  // Fallback angle thresholds (when tightness is ambiguous)
  urbanMinAngle: 70,           // Clear intersection turns
  highwayMaxAngle: 18,         // Clear highway sweepers
  
  // Analysis window
  windowSizeMiles: 0.5,        // Analyze in half-mile windows
  minCurvesForClassification: 2,  // Need at least 2 curves to classify
  
  // Urban override at route edges
  maxUrbanMiles: 1.5,          // Urban zones only at start/end
  
  // Minimum curve length for tightness calc (avoid division issues)
  minCurveLengthMiles: 0.02,   // ~30 meters minimum
}

/**
 * Main entry: Classify zones based on tightness score
 * 
 * @param {Array} flowEvents - Events from Road Flow Analyzer
 * @param {number} totalDistanceMeters - Total route distance
 * @param {Array} censusSegments - Census data for validation
 * @returns {Array} Zone segments
 */
export function classifyZonesV2(flowEvents, totalDistanceMeters, censusSegments = []) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🎯 Zone Classifier v2.1 (Tightness Score)')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  
  // Step 1: Extract curve data with tightness score
  const curves = extractCurveData(flowEvents)
  console.log(`   Curves extracted: ${curves.length}`)
  
  // Log sample tightness values
  if (curves.length > 0) {
    const samples = curves.slice(0, 5).map(c => `${c.angle}°/${c.lengthMiles.toFixed(2)}mi=T${c.tightness}`)
    console.log(`   Sample tightness: ${samples.join(', ')}`)
  }
  
  if (curves.length === 0) {
    console.log('   No curves - entire route is highway')
    return [createZone(0, totalMiles, 'transit', 'no curves detected')]
  }
  
  // Step 2: Analyze windows and classify each by tightness
  const windows = analyzeWindows(curves, totalMiles)
  console.log(`   Windows analyzed: ${windows.length}`)
  
  // Step 3: Build zones from window classifications
  const rawZones = buildZonesFromWindows(windows, totalMiles)
  console.log(`   Raw zones: ${rawZones.length}`)
  
  // Step 4: Apply Census validation
  const validatedZones = applyCensusValidation(rawZones, censusSegments, totalMiles)
  
  // Step 5: Clean up (merge small zones, apply urban at edges)
  const finalZones = cleanupZones(validatedZones, totalMiles, censusSegments)
  
  // Log results
  console.log('   Final zones:')
  finalZones.forEach((z, i) => {
    const len = (z.endMile - z.startMile).toFixed(1)
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${len}mi) - ${z.reason}`)
  })
  
  return finalZones
}

/**
 * Extract curve data with tightness score
 */
function extractCurveData(events) {
  return events
    .filter(e => {
      const angle = e.totalAngle ?? e.angle ?? 0
      return angle >= 10  // Ignore very small angle changes
    })
    .map(e => {
      const angle = e.totalAngle ?? e.angle ?? 0
      const lengthMiles = e.lengthMiles ?? ((e.endMile ?? 0) - (e.startMile ?? 0)) ?? 0.05
      const safeLengthMiles = Math.max(lengthMiles, CONFIG.minCurveLengthMiles)
      
      // TIGHTNESS SCORE = angle / length
      // High score = tight corner, Low score = sweeping bend
      const tightness = angle / safeLengthMiles
      
      return {
        mile: e.apexMile ?? e.mile ?? e.triggerMile ?? e.startMile ?? 0,
        angle,
        lengthMiles: safeLengthMiles,
        tightness: Math.round(tightness),
        shape: e.shape || categorizeShape(e),
        direction: e.direction || 'unknown'
      }
    })
    .sort((a, b) => a.mile - b.mile)
}

/**
 * Categorize curve shape based on available data
 */
function categorizeShape(event) {
  // If shape is already set, use it
  if (event.shape) return event.shape
  
  // Otherwise estimate from angle per distance
  const lengthMiles = event.lengthMiles ?? ((event.endMile ?? 0) - (event.startMile ?? 0)) ?? 0.05
  const angle = event.totalAngle ?? event.angle ?? 0
  
  if (lengthMiles <= 0.03) return 'tight'      // Very short = tight corner
  if (lengthMiles >= 0.15) return 'sweeper'    // Long = sweeping
  return 'medium'
}

/**
 * Analyze route in windows and classify each by tightness
 */
function analyzeWindows(curves, totalMiles) {
  const windows = []
  const windowSize = CONFIG.windowSizeMiles
  
  for (let startMile = 0; startMile < totalMiles; startMile += windowSize / 2) {
    const endMile = Math.min(startMile + windowSize, totalMiles)
    
    // Get curves in this window
    const windowCurves = curves.filter(c => c.mile >= startMile && c.mile < endMile)
    
    if (windowCurves.length < CONFIG.minCurvesForClassification) {
      // Not enough curves - likely highway
      windows.push({
        startMile,
        endMile,
        character: 'transit',
        avgTightness: 0,
        avgAngle: 0,
        curveCount: windowCurves.length,
        reason: 'sparse curves'
      })
      continue
    }
    
    // Calculate average tightness score
    const avgTightness = windowCurves.reduce((sum, c) => sum + c.tightness, 0) / windowCurves.length
    const avgAngle = windowCurves.reduce((sum, c) => sum + c.angle, 0) / windowCurves.length
    
    // Classify based on tightness score
    const classification = classifyByTightness(avgTightness, avgAngle, windowCurves)
    
    windows.push({
      startMile,
      endMile,
      character: classification.character,
      avgTightness: Math.round(avgTightness),
      avgAngle: Math.round(avgAngle),
      curveCount: windowCurves.length,
      reason: classification.reason
    })
  }
  
  return windows
}

/**
 * Classify a window based on tightness score
 * 
 * Tightness = Angle / Length (degrees per mile)
 * - > 300: URBAN (sharp intersection corners)
 * - 100-300: TECHNICAL (winding backroads)
 * - < 100: HIGHWAY (gentle sweepers)
 */
function classifyByTightness(avgTightness, avgAngle, curves) {
  // Log sample tightness values for debugging
  const sampleCurves = curves.slice(0, 3).map(c => `${c.angle}°/${c.lengthMiles.toFixed(2)}mi=${c.tightness}`).join(', ')
  
  // URBAN: Very tight corners (tightness > 300)
  // Also check angle > 70° as sanity check for intersections
  if (avgTightness >= CONFIG.urbanMinTightness && avgAngle >= CONFIG.urbanMinAngle) {
    return {
      character: 'urban',
      reason: `tightness ${Math.round(avgTightness)} (urban corners)`
    }
  }
  
  // HIGHWAY: Gentle sweepers (tightness < 100)
  if (avgTightness < CONFIG.technicalMinTightness) {
    return {
      character: 'transit',
      reason: `tightness ${Math.round(avgTightness)} (sweepers)`
    }
  }
  
  // TECHNICAL: Winding roads (tightness 100-300)
  if (avgTightness >= CONFIG.technicalMinTightness) {
    return {
      character: 'technical',
      reason: `tightness ${Math.round(avgTightness)} (winding)`
    }
  }
  
  // Fallback based on angle alone
  if (avgAngle < CONFIG.highwayMaxAngle) {
    return {
      character: 'transit',
      reason: `avg angle ${Math.round(avgAngle)}° (gentle)`
    }
  }
  
  return {
    character: 'transit',
    reason: 'default'
  }
}

/**
 * Build zones from window classifications
 */
function buildZonesFromWindows(windows, totalMiles) {
  if (windows.length === 0) {
    return [createZone(0, totalMiles, 'transit', 'no data')]
  }
  
  const zones = []
  let currentZone = {
    startMile: 0,
    character: windows[0].character,
    reasons: [windows[0].reason],
    tightnesses: [windows[0].avgTightness],
    angles: [windows[0].avgAngle]
  }
  
  for (let i = 1; i < windows.length; i++) {
    const window = windows[i]
    
    if (window.character !== currentZone.character) {
      // Zone change - save current and start new
      zones.push(createZone(
        currentZone.startMile,
        window.startMile,
        currentZone.character,
        summarizeReasons(currentZone.reasons, currentZone.tightnesses, currentZone.angles)
      ))
      
      currentZone = {
        startMile: window.startMile,
        character: window.character,
        reasons: [window.reason],
        tightnesses: [window.avgTightness],
        angles: [window.avgAngle]
      }
    } else {
      // Same zone - accumulate
      currentZone.reasons.push(window.reason)
      currentZone.tightnesses.push(window.avgTightness)
      currentZone.angles.push(window.avgAngle)
    }
  }
  
  // Don't forget the last zone
  zones.push(createZone(
    currentZone.startMile,
    totalMiles,
    currentZone.character,
    summarizeReasons(currentZone.reasons, currentZone.tightnesses, currentZone.angles)
  ))
  
  return zones
}

/**
 * Summarize reasons for a zone
 */
function summarizeReasons(reasons, tightnesses, angles) {
  const validTightnesses = tightnesses.filter(t => t > 0)
  const validAngles = angles.filter(a => a > 0)
  
  if (validTightnesses.length === 0 && validAngles.length === 0) {
    return reasons[0] || 'classified'
  }
  
  const avgTightness = validTightnesses.length > 0 
    ? Math.round(validTightnesses.reduce((a, b) => a + b, 0) / validTightnesses.length)
    : 0
  const avgAngle = validAngles.length > 0
    ? Math.round(validAngles.reduce((a, b) => a + b, 0) / validAngles.length)
    : 0
  
  if (avgTightness > 0) {
    return `tightness ${avgTightness}, avg ${avgAngle}°`
  }
  return `avg ${avgAngle}°`
}

/**
 * Apply Census validation
 */
function applyCensusValidation(zones, censusSegments, totalMiles) {
  if (!censusSegments || censusSegments.length === 0) {
    console.log('   No Census data for validation')
    return zones
  }
  
  // Check if Census strongly disagrees with our classification
  const validated = zones.map(zone => {
    const zoneMidpoint = (zone.startMile + zone.endMile) / 2
    const zoneMidpointMeters = zoneMidpoint * 1609.34
    
    // Find Census segment at this point
    const censusAtPoint = censusSegments.find(c => {
      const start = (c.start ?? c.startDistance ?? 0)
      const end = (c.end ?? c.endDistance ?? 0)
      return zoneMidpointMeters >= start && zoneMidpointMeters < end
    })
    
    if (!censusAtPoint) return zone
    
    const censusChar = censusAtPoint.character
    
    // Log conflicts for debugging
    if (zone.character !== censusChar && zone.character !== 'transit') {
      console.log(`   ⚠️ Census conflict at mile ${zoneMidpoint.toFixed(1)}: we say ${zone.character}, Census says ${censusChar}`)
    }
    
    return zone  // For now, trust our classification but log conflicts
  })
  
  return validated
}

/**
 * Clean up zones - merge small ones, apply urban at edges
 */
function cleanupZones(zones, totalMiles, censusSegments) {
  let result = [...zones]
  
  // Merge very small zones (< 0.3 miles) into neighbors
  result = mergeSmallZones(result, 0.3)
  
  // Apply urban at route start if Census agrees
  result = applyUrbanAtEdges(result, totalMiles, censusSegments)
  
  return result
}

/**
 * Merge zones smaller than threshold
 */
function mergeSmallZones(zones, minLengthMiles) {
  if (zones.length <= 1) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const length = zone.endMile - zone.startMile
    
    if (length >= minLengthMiles) {
      result.push(zone)
    } else {
      // Merge into previous or next zone
      if (result.length > 0) {
        // Extend previous zone - update ALL properties
        result[result.length - 1].endMile = zone.endMile
        result[result.length - 1].end = zone.endMile * 1609.34
        result[result.length - 1].endDistance = zone.endMile * 1609.34
        result[result.length - 1].reason += ' (merged)'
      } else if (i + 1 < zones.length) {
        // Will be absorbed by next zone - update ALL properties
        zones[i + 1].startMile = zone.startMile
        zones[i + 1].start = zone.startMile * 1609.34
        zones[i + 1].startDistance = zone.startMile * 1609.34
      }
    }
  }
  
  return result.length > 0 ? result : zones
}

/**
 * Apply urban zones at route start/end based on Census
 */
function applyUrbanAtEdges(zones, totalMiles, censusSegments) {
  if (!censusSegments || censusSegments.length === 0) return zones
  
  const result = [...zones]
  
  // Check start
  const firstCensus = censusSegments[0]
  if (firstCensus?.character === 'urban') {
    const urbanEndMile = Math.min(
      (firstCensus.end ?? firstCensus.endDistance ?? 0) / 1609.34,
      CONFIG.maxUrbanMiles
    )
    
    if (urbanEndMile > 0.2 && result.length > 0) {
      console.log(`   Applying Census urban at start: 0-${urbanEndMile.toFixed(1)}mi`)
      
      // Find and modify zones that fall within urban range
      if (result[0].startMile === 0) {
        if (result[0].endMile <= urbanEndMile) {
          // First zone is entirely within urban range
          result[0].character = 'urban'
          result[0].reason = 'Census urban (route start)'
        } else {
          // Split first zone - update ALL properties
          const newUrban = createZone(0, urbanEndMile, 'urban', 'Census urban (route start)')
          result[0].startMile = urbanEndMile
          result[0].start = urbanEndMile * 1609.34
          result[0].startDistance = urbanEndMile * 1609.34
          result.unshift(newUrban)
        }
      }
    }
  }
  
  // Check end
  const lastCensus = censusSegments[censusSegments.length - 1]
  if (lastCensus?.character === 'urban') {
    const urbanStartMile = Math.max(
      (lastCensus.start ?? lastCensus.startDistance ?? 0) / 1609.34,
      totalMiles - CONFIG.maxUrbanMiles
    )
    
    if (urbanStartMile < totalMiles - 0.2 && result.length > 0) {
      console.log(`   Applying Census urban at end: ${urbanStartMile.toFixed(1)}-${totalMiles.toFixed(1)}mi`)
      
      const lastIdx = result.length - 1
      if (Math.abs(result[lastIdx].endMile - totalMiles) < 0.1) {
        if (result[lastIdx].startMile >= urbanStartMile) {
          // Last zone is entirely within urban range
          result[lastIdx].character = 'urban'
          result[lastIdx].reason = 'Census urban (route end)'
        } else {
          // Split last zone - update ALL properties
          const newUrban = createZone(urbanStartMile, totalMiles, 'urban', 'Census urban (route end)')
          result[lastIdx].endMile = urbanStartMile
          result[lastIdx].end = urbanStartMile * 1609.34
          result[lastIdx].endDistance = urbanStartMile * 1609.34
          result.push(newUrban)
        }
      }
    }
  }
  
  return result
}

/**
 * Create a zone object with all required properties
 */
function createZone(startMile, endMile, character, reason) {
  const startMeters = startMile * 1609.34
  const endMeters = endMile * 1609.34
  
  return {
    startMile,
    endMile,
    start: startMeters,
    end: endMeters,
    startDistance: startMeters,
    endDistance: endMeters,
    character,
    reason
  }
}

/**
 * Convert zones to standard format (for compatibility)
 */
export function convertToZoneFormat(zones) {
  // Zones already have all properties from createZone
  return zones
}

export default {
  classifyZonesV2,
  convertToZoneFormat
}
