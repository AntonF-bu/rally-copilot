// ================================
// Zone Classifier v2.0
// 
// Simple, intuitive classification based on DRIVING FEEL:
// - URBAN: High angles (60°+) + tight curves = intersection turns
// - HIGHWAY: Low angles (<20°) + wide curves = gentle sweepers  
// - TECHNICAL: Medium angles (20-60°) = winding backroads
//
// Three factors:
// 1. Average Angle (PRIMARY)
// 2. Curve Length/Shape (SECONDARY)
// 3. Census (VALIDATOR)
// ================================

/**
 * Configuration
 */
const CONFIG = {
  // Angle thresholds (degrees)
  urbanMinAngle: 60,        // Urban intersections are typically 60°+
  highwayMaxAngle: 20,      // Highway sweepers are gentle, under 20°
  // Between 20-60° = Technical
  
  // Analysis window
  windowSizeMiles: 0.5,     // Analyze in half-mile windows
  minCurvesForClassification: 2,  // Need at least 2 curves to classify
  
  // Urban override at route edges
  maxUrbanMiles: 1.5,       // Urban zones only at start/end
}

/**
 * Main entry: Classify zones based on driving feel
 * 
 * @param {Array} flowEvents - Events from Road Flow Analyzer
 * @param {number} totalDistanceMeters - Total route distance
 * @param {Array} censusSegments - Census data for validation
 * @returns {Array} Zone segments
 */
export function classifyZonesV2(flowEvents, totalDistanceMeters, censusSegments = []) {
  const totalMiles = totalDistanceMeters / 1609.34
  
  console.log('🎯 Zone Classifier v2.0 (Driving Feel)')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles, ${flowEvents.length} events`)
  
  // Step 1: Extract curve data with angle and shape
  const curves = extractCurveData(flowEvents)
  console.log(`   Curves extracted: ${curves.length}`)
  
  if (curves.length === 0) {
    console.log('   No curves - entire route is highway')
    return [createZone(0, totalMiles, 'transit', 'no curves detected')]
  }
  
  // Step 2: Analyze windows and classify each
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
 * Extract curve data with angle and shape info
 */
function extractCurveData(events) {
  return events
    .filter(e => {
      const angle = e.totalAngle ?? e.angle ?? 0
      return angle >= 10  // Ignore very small angle changes
    })
    .map(e => ({
      mile: e.apexMile ?? e.mile ?? e.triggerMile ?? e.startMile ?? 0,
      angle: e.totalAngle ?? e.angle ?? 0,
      shape: e.shape || categorizeShape(e),
      lengthMiles: e.lengthMiles ?? ((e.endMile ?? 0) - (e.startMile ?? 0)) ?? 0.05,
      direction: e.direction || 'unknown'
    }))
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
 * Analyze route in windows and classify each
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
        avgAngle: 0,
        avgShape: 'none',
        curveCount: windowCurves.length,
        reason: 'sparse curves'
      })
      continue
    }
    
    // Calculate average angle
    const avgAngle = windowCurves.reduce((sum, c) => sum + c.angle, 0) / windowCurves.length
    
    // Calculate predominant shape
    const shapeCounts = { tight: 0, medium: 0, sweeper: 0 }
    windowCurves.forEach(c => {
      shapeCounts[c.shape] = (shapeCounts[c.shape] || 0) + 1
    })
    const avgShape = Object.entries(shapeCounts)
      .sort((a, b) => b[1] - a[1])[0][0]
    
    // Classify based on average angle + shape
    const classification = classifyWindow(avgAngle, avgShape, windowCurves.length)
    
    windows.push({
      startMile,
      endMile,
      character: classification.character,
      avgAngle: Math.round(avgAngle),
      avgShape,
      curveCount: windowCurves.length,
      reason: classification.reason
    })
  }
  
  return windows
}

/**
 * Classify a single window based on average angle and shape
 */
function classifyWindow(avgAngle, avgShape, curveCount) {
  // HIGH angle (60°+) + TIGHT curves = URBAN (intersection turns)
  if (avgAngle >= CONFIG.urbanMinAngle && avgShape === 'tight') {
    return { 
      character: 'urban', 
      reason: `avg ${Math.round(avgAngle)}° + tight = intersections` 
    }
  }
  
  // LOW angle (<20°) + WIDE curves = HIGHWAY (gentle sweepers)
  if (avgAngle < CONFIG.highwayMaxAngle && (avgShape === 'sweeper' || avgShape === 'medium')) {
    return { 
      character: 'transit', 
      reason: `avg ${Math.round(avgAngle)}° + ${avgShape} = highway` 
    }
  }
  
  // LOW angle but TIGHT curves - could be urban with gentle turns
  if (avgAngle < CONFIG.highwayMaxAngle && avgShape === 'tight') {
    return { 
      character: 'transit', 
      reason: `avg ${Math.round(avgAngle)}° gentle turns` 
    }
  }
  
  // MEDIUM angle (20-60°) = TECHNICAL (winding roads)
  if (avgAngle >= CONFIG.highwayMaxAngle && avgAngle < CONFIG.urbanMinAngle) {
    return { 
      character: 'technical', 
      reason: `avg ${Math.round(avgAngle)}° = winding` 
    }
  }
  
  // HIGH angle but not tight - unusual, default to technical
  if (avgAngle >= CONFIG.urbanMinAngle && avgShape !== 'tight') {
    return { 
      character: 'technical', 
      reason: `avg ${Math.round(avgAngle)}° ${avgShape} curves` 
    }
  }
  
  // Default fallback
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
        summarizeReasons(currentZone.reasons, currentZone.angles)
      ))
      
      currentZone = {
        startMile: window.startMile,
        character: window.character,
        reasons: [window.reason],
        angles: [window.avgAngle]
      }
    } else {
      // Same zone - accumulate
      currentZone.reasons.push(window.reason)
      currentZone.angles.push(window.avgAngle)
    }
  }
  
  // Don't forget the last zone
  zones.push(createZone(
    currentZone.startMile,
    totalMiles,
    currentZone.character,
    summarizeReasons(currentZone.reasons, currentZone.angles)
  ))
  
  return zones
}

/**
 * Summarize reasons for a zone
 */
function summarizeReasons(reasons, angles) {
  const validAngles = angles.filter(a => a > 0)
  if (validAngles.length === 0) return reasons[0] || 'classified'
  
  const avgAngle = Math.round(validAngles.reduce((a, b) => a + b, 0) / validAngles.length)
  return `avg angle ${avgAngle}°`
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
        // Extend previous zone
        result[result.length - 1].endMile = zone.endMile
        result[result.length - 1].reason += ' (merged)'
      } else if (i + 1 < zones.length) {
        // Will be absorbed by next zone
        zones[i + 1].startMile = zone.startMile
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
          // Split first zone
          const newUrban = createZone(0, urbanEndMile, 'urban', 'Census urban (route start)')
          result[0].startMile = urbanEndMile
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
          // Split last zone
          const newUrban = createZone(urbanStartMile, totalMiles, 'urban', 'Census urban (route end)')
          result[lastIdx].endMile = urbanStartMile
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
