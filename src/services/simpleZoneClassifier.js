// ================================
// Simple Zone Classifier v4.0
// 
// SIMPLE RULES:
// 1. Interstate/US Highway → TRANSIT
// 2. State Route → TECHNICAL  
// 3. Local Road → check symbolrank:
//      - symbolrank 1-10 (city/town) → URBAN
//      - symbolrank 11-19 (rural) → TECHNICAL
// 4. Gaps after/before highways → TECHNICAL (ramps)
// 5. Tiny transit segments (<0.5mi) surrounded by non-transit → absorb
//
// That's it. No curve analysis. No census data.
// ================================

/**
 * Main entry: Classify zones from road segments
 * 
 * @param {Array} roadSegments - From extractRoadRefs() in routeService
 *   Each segment: { startMile, endMile, ref, name, roadClass, symbolrank? }
 * @param {number} totalMiles - Total route length in miles
 * @returns {Array} Zones: [{ startMile, endMile, character, road }]
 */
export function classifyByRoadName(roadSegments, totalMiles) {
  console.log('🛣️ Simple Zone Classifier v4.0')
  console.log(`   Road segments: ${roadSegments?.length || 0}`)
  console.log(`   Total miles: ${totalMiles?.toFixed(1)}`)
  
  if (!roadSegments || roadSegments.length === 0) {
    console.log('   ⚠️ No road segments - defaulting to technical')
    return [{
      startMile: 0,
      endMile: totalMiles,
      character: 'technical',
      road: 'unknown'
    }]
  }
  
  // Log input segments
  console.log('   Road segments:')
  roadSegments.forEach(seg => {
    const roadName = seg.ref || seg.name || 'unnamed'
    const rankInfo = seg.symbolrank ? ` [rank:${seg.symbolrank}]` : ''
    console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${roadName} (${seg.roadClass})${rankInfo}`)
  })
  
  // ========================================
  // STEP 1: Classify each road segment
  // ========================================
  const classifiedSegments = roadSegments.map(seg => ({
    ...seg,
    zone: classifyRoad(seg)
  }))
  
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
      const gapZone = classifyGap(prevSeg, seg, currentMile, seg.startMile)
      zones.push({
        startMile: currentMile,
        endMile: seg.startMile,
        character: gapZone,
        road: '[gap]',
        isGap: true
      })
    }
    
    // Add this segment
    zones.push({
      startMile: seg.startMile,
      endMile: seg.endMile,
      character: seg.zone,
      road: seg.ref || seg.name || 'unnamed',
      roadClass: seg.roadClass
    })
    
    currentMile = seg.endMile
  }
  
  // Check for gap at end of route
  if (currentMile < totalMiles - 0.01) {
    const lastSeg = classifiedSegments[classifiedSegments.length - 1]
    const endZone = isHighway(lastSeg?.roadClass) ? 'technical' : (lastSeg?.zone || 'technical')
    zones.push({
      startMile: currentMile,
      endMile: totalMiles,
      character: endZone,
      road: '[end]',
      isGap: true
    })
  }
  
  // ========================================
  // STEP 3: Merge adjacent zones with same character
  // ========================================
  let mergedZones = mergeAdjacentZones(zones)
  
  // ========================================
  // STEP 4: Absorb tiny transit segments
  // ========================================
  mergedZones = absorbTinyTransit(mergedZones, 0.5)
  
  // ========================================
  // STEP 5: Final merge after absorption
  // ========================================
  mergedZones = mergeAdjacentZones(mergedZones)
  
  // Log final result
  console.log('   Final zones:')
  mergedZones.forEach((z, i) => {
    const length = (z.endMile - z.startMile).toFixed(1)
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.road}) [${length}mi]`)
  })
  
  return mergedZones
}

/**
 * Classify a single road segment
 */
function classifyRoad(segment) {
  const roadClass = segment.roadClass || 'unknown'
  
  switch (roadClass) {
    case 'interstate':
      return 'transit'
    
    case 'us_highway':
      return 'transit'
    
    case 'state_route':
      return 'technical'
    
    case 'local':
      // Check symbolrank for urban vs technical
      // 1-10 = city/town = urban
      // 11-19 or missing = rural = technical
      if (segment.symbolrank && segment.symbolrank <= 10) {
        return 'urban'
      }
      return 'technical'
    
    default:
      return 'technical'
  }
}

/**
 * Check if road class is highway
 */
function isHighway(roadClass) {
  return roadClass === 'interstate' || roadClass === 'us_highway'
}

/**
 * Classify a gap based on surrounding segments
 */
function classifyGap(prevSeg, nextSeg, gapStart, gapEnd) {
  const prevClass = prevSeg?.roadClass || 'unknown'
  const nextClass = nextSeg?.roadClass || 'unknown'
  
  // Gap after highway = off-ramp = technical
  if (isHighway(prevClass)) {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (off-ramp)`)
    return 'technical'
  }
  
  // Gap before highway = on-ramp = technical
  if (isHighway(nextClass)) {
    console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (on-ramp)`)
    return 'technical'
  }
  
  // Any other gap = technical (safe default)
  console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: TECHNICAL (default)`)
  return 'technical'
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
      // Keep better road name (prefer non-gap names)
      if (current.road === '[gap]' || current.road === '[end]') {
        current.road = next.road
      }
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  
  merged.push(current)
  return merged
}

/**
 * Absorb tiny transit segments surrounded by non-transit
 * e.g., 0.1mi of US-202 in the middle of local roads
 */
function absorbTinyTransit(zones, minLength) {
  if (zones.length < 3) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const prev = result.length > 0 ? result[result.length - 1] : null
    const next = i < zones.length - 1 ? zones[i + 1] : null
    
    const length = zone.endMile - zone.startMile
    
    // Check if tiny transit surrounded by non-transit
    if (zone.character === 'transit' && length < minLength) {
      const prevIsNonTransit = prev && prev.character !== 'transit'
      const nextIsNonTransit = next && next.character !== 'transit'
      
      if (prevIsNonTransit && nextIsNonTransit) {
        // Absorb into previous zone
        console.log(`   🔀 Absorbing tiny transit ${zone.startMile.toFixed(1)}-${zone.endMile.toFixed(1)}mi (${length.toFixed(2)}mi)`)
        prev.endMile = zone.endMile
        continue
      }
    }
    
    result.push({ ...zone })
  }
  
  return result
}

/**
 * Convert zones to standard format for the rest of the app
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
    lengthMiles: z.endMile - z.startMile,
    road: z.road
  }))
}

/**
 * Reassign zone labels to events based on classified zones
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
    
    if (!zone) return event
    
    if (event.zone !== zone.character) {
      reassigned++
    }
    
    return {
      ...event,
      zone: zone.character,
      zoneType: zone.character
    }
  })
  
  console.log(`📍 Reassigned zones to ${reassigned} of ${events.length} events`)
  return updatedEvents
}

/**
 * Get zone at a specific distance (meters)
 */
export function getZoneAtDistance(distance, zones) {
  return zones.find(z => distance >= z.start && distance < z.end) || null
}

/**
 * Extract curve-like events for analysis (legacy compatibility)
 * Not used by v4 classifier but may be needed by other components
 */
export function extractCurvesFromEvents(events) {
  if (!events || events.length === 0) return []
  
  return events
    .filter(e => (e.angle ?? e.totalAngle ?? 0) >= 10)
    .map(e => ({
      mile: e.mile ?? (e.distance / 1609.34) ?? 0,
      angle: e.angle ?? e.totalAngle ?? 0,
      direction: e.direction || 'unknown',
      type: e.type || 'curve'
    }))
}

export default {
  classifyByRoadName,
  convertToStandardFormat,
  reassignEventZones,
  getZoneAtDistance,
  extractCurvesFromEvents
}
