// ================================
// Simple Zone Classifier v3.0
// 
// Core insight: Road names tell you everything, gaps tell you transitions
// 
// Rules:
// 1. Road names are AUTHORITATIVE (I-90 = transit, West Street = technical)
// 2. Gaps after highways = OFF-RAMPS = TECHNICAL (always!)
// 3. Gaps after technical = still TECHNICAL
// 4. State routes: check curve density to decide
// 5. Urban only at route edges (from census)
// ================================

/**
 * Classify road type from ref and name
 * Returns: 'interstate' | 'us_highway' | 'state_route' | 'local' | 'unknown'
 */
function classifyRoadType(ref, name) {
  const refUpper = (ref || '').toUpperCase().trim()
  const nameUpper = (name || '').toUpperCase().trim()
  
  // Interstate: I-90, I 90, I90
  if (refUpper.match(/^I[\s-]?\d+/)) {
    return 'interstate'
  }
  
  // US Highway: US-9, US 9, US9, U.S. 9
  if (refUpper.match(/^U\.?S\.?[\s-]?\d+/)) {
    return 'us_highway'
  }
  
  // State Route: MA-9, MA 9, NY-17, Route 66
  if (refUpper.match(/^[A-Z]{2}[\s-]?\d+/) || refUpper.match(/^(ROUTE|RT\.?|RTE\.?)[\s-]?\d+/i)) {
    return 'state_route'
  }
  
  // Highway-like names
  if (nameUpper.includes('TURNPIKE') || 
      nameUpper.includes('PARKWAY') || 
      nameUpper.includes('EXPRESSWAY') ||
      nameUpper.includes('FREEWAY') ||
      nameUpper.includes('THRUWAY') ||
      nameUpper.includes('INTERSTATE')) {
    return 'us_highway'
  }
  
  // Has a name = local road
  if (name && name.length > 0) {
    return 'local'
  }
  
  // No ref, no name = unknown (probably ramp or connector)
  return 'unknown'
}

/**
 * Check if road class is highway-like
 */
function isHighwayClass(roadClass) {
  return roadClass === 'interstate' || roadClass === 'us_highway'
}

/**
 * Analyze curves in a mile range to determine if it's technical
 * Used for state routes and ambiguous sections
 */
function analyzeCurvesInRange(curves, startMile, endMile) {
  if (!curves || curves.length === 0) {
    return { curveCount: 0, curvesPerMile: 0, avgAngle: 0, maxAngle: 0, hasDanger: false }
  }
  
  const curvesInRange = curves.filter(c => {
    const mile = c.mile ?? c.triggerMile ?? (c.distance / 1609.34) ?? 0
    return mile >= startMile && mile < endMile
  })
  
  const length = endMile - startMile
  const curveCount = curvesInRange.length
  const curvesPerMile = length > 0 ? curveCount / length : 0
  
  const angles = curvesInRange.map(c => c.angle ?? c.totalAngle ?? 0)
  const avgAngle = angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : 0
  const maxAngle = angles.length > 0 ? Math.max(...angles) : 0
  const hasDanger = maxAngle >= 45
  
  return { curveCount, curvesPerMile, avgAngle, maxAngle, hasDanger }
}

/**
 * Determine zone for a state route based on curve characteristics
 */
function classifyStateRoute(startMile, endMile, curves) {
  const stats = analyzeCurvesInRange(curves, startMile, endMile)
  
  // If very few curves and gentle = highway-like state route
  if (stats.curvesPerMile < 1.5 && stats.avgAngle < 25 && !stats.hasDanger) {
    return 'transit'
  }
  
  // Otherwise = fun twisty state route
  return 'technical'
}

/**
 * Classify a gap based on what's before and after it
 * 
 * Key insight: Gap after highway = OFF-RAMP = always technical!
 */
function classifyGap(prevSegment, nextSegment, gapStart, gapEnd, curves) {
  const prevClass = prevSegment?.roadClass || 'unknown'
  const nextClass = nextSegment?.roadClass || 'unknown'
  const prevZone = prevSegment?.zone || 'technical'
  const nextZone = nextSegment?.zone || 'technical'
  
  const gapLength = gapEnd - gapStart
  
  // Coming OFF a highway → OFF-RAMP → TECHNICAL
  if (isHighwayClass(prevClass)) {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (off-ramp from ${prevClass})`)
    return { zone: 'technical', reason: 'off-ramp' }
  }
  
  // Going ONTO a highway → ON-RAMP → TECHNICAL  
  if (isHighwayClass(nextClass)) {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (on-ramp to ${nextClass})`)
    return { zone: 'technical', reason: 'on-ramp' }
  }
  
  // Between two technical zones → TECHNICAL
  if (prevZone === 'technical' && nextZone === 'technical') {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (between technical zones)`)
    return { zone: 'technical', reason: 'inherited' }
  }
  
  // Between two transit zones → TRANSIT
  if (prevZone === 'transit' && nextZone === 'transit') {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TRANSIT (between transit zones)`)
    return { zone: 'transit', reason: 'inherited' }
  }
  
  // Mixed - default to technical (safer to over-warn)
  console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (default for mixed transition)`)
  return { zone: 'technical', reason: 'default' }
}

/**
 * Main entry: Classify zones from road segments
 * 
 * @param {Array} roadSegments - From extractRoadRefs() in routeService
 * @param {number} totalMiles - Total route length in miles
 * @param {Array} curves - Optional curve data for state route analysis
 * @returns {Array} Zones: [{ startMile, endMile, character, road, reason }]
 */
export function classifyByRoadName(roadSegments, totalMiles, curves = []) {
  console.log('🛣️ Simple Zone Classifier v3.0')
  console.log(`   Road segments: ${roadSegments?.length || 0}`)
  console.log(`   Total miles: ${totalMiles?.toFixed(1)}`)
  console.log(`   Curves for analysis: ${curves?.length || 0}`)
  
  if (!roadSegments || roadSegments.length === 0) {
    console.log('   ⚠️ No road segments - defaulting to technical')
    return [{
      startMile: 0,
      endMile: totalMiles,
      character: 'technical',
      road: 'unknown',
      reason: 'no road data'
    }]
  }
  
  // Log input segments
  console.log('   Road segments:')
  roadSegments.forEach(seg => {
    const roadName = seg.ref || seg.name || 'unnamed'
    console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${roadName} (${seg.roadClass})`)
  })
  
  // ========================================
  // STEP 1: Classify each road segment
  // ========================================
  const classifiedSegments = roadSegments.map(seg => {
    const roadClass = seg.roadClass || classifyRoadType(seg.ref, seg.name)
    let zone
    let reason
    
    switch (roadClass) {
      case 'interstate':
        zone = 'transit'
        reason = 'interstate'
        break
      case 'us_highway':
        zone = 'transit'
        reason = 'US highway'
        break
      case 'state_route':
        // State routes need curve analysis
        zone = classifyStateRoute(seg.startMile, seg.endMile, curves)
        reason = zone === 'transit' ? 'state route (highway-like)' : 'state route (twisty)'
        break
      case 'local':
        zone = 'technical'
        reason = 'local road'
        break
      default:
        zone = 'technical'
        reason = 'unknown road type'
    }
    
    return {
      ...seg,
      roadClass,
      zone,
      reason
    }
  })
  
  // ========================================
  // STEP 2: Build complete zone coverage (fill gaps)
  // ========================================
  const zones = []
  let currentMile = 0
  
  for (let i = 0; i < classifiedSegments.length; i++) {
    const seg = classifiedSegments[i]
    const prevSeg = i > 0 ? classifiedSegments[i - 1] : null
    
    // Check for gap before this segment
    if (seg.startMile > currentMile + 0.01) {
      // There's a gap - classify it
      const gapResult = classifyGap(prevSeg, seg, currentMile, seg.startMile, curves)
      zones.push({
        startMile: currentMile,
        endMile: seg.startMile,
        character: gapResult.zone,
        road: `[gap: ${gapResult.reason}]`,
        reason: gapResult.reason,
        isGap: true
      })
    }
    
    // Add this segment
    zones.push({
      startMile: seg.startMile,
      endMile: seg.endMile,
      character: seg.zone,
      road: seg.ref || seg.name || 'unnamed',
      reason: seg.reason,
      roadClass: seg.roadClass
    })
    
    currentMile = seg.endMile
  }
  
  // Check for gap at end of route
  if (currentMile < totalMiles - 0.01) {
    const lastSeg = classifiedSegments[classifiedSegments.length - 1]
    // End gap - inherit from last segment, unless it was highway (then it's an off-ramp scenario)
    const endZone = isHighwayClass(lastSeg?.roadClass) ? 'technical' : (lastSeg?.zone || 'technical')
    console.log(`   📍 End gap ${currentMile.toFixed(1)}-${totalMiles.toFixed(1)}mi: ${endZone.toUpperCase()}`)
    zones.push({
      startMile: currentMile,
      endMile: totalMiles,
      character: endZone,
      road: '[end of route]',
      reason: 'end gap',
      isGap: true
    })
  }
  
  // ========================================
  // STEP 3: Merge adjacent zones with same character
  // ========================================
  const mergedZones = mergeAdjacentZones(zones)
  
  // ========================================
  // STEP 4: Log final result
  // ========================================
  console.log('   Final zones:')
  mergedZones.forEach((z, i) => {
    const length = (z.endMile - z.startMile).toFixed(1)
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.road}) [${length}mi]`)
  })
  
  return mergedZones
}

/**
 * Merge adjacent zones with same character
 */
function mergeAdjacentZones(zones) {
  if (zones.length <= 1) return zones
  
  const merged = []
  let current = { ...zones[0] }
  
  for (let i = 1; i < zones.length; i++) {
    const next = zones[i]
    
    if (next.character === current.character) {
      // Extend current zone
      current.endMile = next.endMile
      // Keep the more descriptive road name (prefer actual names over gap markers)
      if (!current.road.startsWith('[') && next.road.startsWith('[')) {
        // Keep current road name
      } else if (current.road.startsWith('[') && !next.road.startsWith('[')) {
        current.road = next.road
      }
    } else {
      // Save current, start new
      merged.push(current)
      current = { ...next }
    }
  }
  
  merged.push(current)
  return merged
}

/**
 * Convert zones to standard format for the rest of the app
 * Includes both mile and meter values for compatibility
 */
export function convertToStandardFormat(zones, totalDistanceMeters) {
  return zones.map(z => ({
    // Meter values (for distance calculations)
    start: z.startMile * 1609.34,
    end: z.endMile * 1609.34,
    startDistance: z.startMile * 1609.34,
    endDistance: z.endMile * 1609.34,
    // Mile values (for display and mile-based lookups)
    startMile: z.startMile,
    endMile: z.endMile,
    // Zone info
    character: z.character,
    lengthMiles: z.endMile - z.startMile,
    road: z.road,
    reason: z.reason
  }))
}

/**
 * Reassign zone labels to events based on classified zones
 * Call this after zone classification to update all event.zone values
 * 
 * @param {Array} events - Events from Road Flow Analyzer (have .distance in meters or .mile)
 * @param {Array} zones - Classified zones (from convertToStandardFormat, have .start/.end in meters)
 * @returns {Array} Events with corrected zone assignments
 */
export function reassignEventZones(events, zones) {
  if (!zones || zones.length === 0) return events
  if (!events || events.length === 0) return events
  
  let reassigned = 0
  
  const updatedEvents = events.map(event => {
    // Get event position in meters
    const eventDistance = event.distance ?? (event.mile * 1609.34) ?? 0
    
    // Find which zone this event falls into
    const zone = zones.find(z => eventDistance >= z.start && eventDistance < z.end)
    
    if (!zone) {
      // Event outside all zones - keep original or default to technical
      return event
    }
    
    if (event.zone !== zone.character) {
      reassigned++
    }
    
    return {
      ...event,
      zone: zone.character,
      zoneType: zone.character  // Some code uses zoneType
    }
  })
  
  console.log(`📍 Reassigned zones to ${reassigned} of ${events.length} events`)
  return updatedEvents
}

/**
 * Extract curve-like events for analysis
 * Converts Road Flow events to simple curve format for state route classification
 */
export function extractCurvesFromEvents(events) {
  if (!events || events.length === 0) return []
  
  return events
    .filter(e => (e.angle ?? e.totalAngle ?? 0) >= 10)  // Only meaningful curves
    .map(e => ({
      mile: e.mile ?? (e.distance / 1609.34) ?? 0,
      angle: e.angle ?? e.totalAngle ?? 0,
      direction: e.direction || 'unknown',
      type: e.type || 'curve'
    }))
}

/**
 * Get zone at a specific mile
 */
export function getZoneAtMile(mile, zones) {
  return zones.find(z => mile >= z.startMile && mile < z.endMile) || null
}

/**
 * Get zone at a specific distance (meters)
 */
export function getZoneAtDistance(distance, zones) {
  return zones.find(z => distance >= z.start && distance < z.end) || null
}

export default {
  classifyByRoadName,
  convertToStandardFormat,
  reassignEventZones,
  extractCurvesFromEvents,
  getZoneAtMile,
  getZoneAtDistance
}
