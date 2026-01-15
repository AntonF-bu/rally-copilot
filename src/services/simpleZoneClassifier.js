// ================================
// Simple Zone Classifier v5.0
// 
// SIMPLE RULES:
// 1. Interstate/US Highway → TRANSIT (always, regardless of urban context)
// 2. State Route → TECHNICAL  
// 3. Local Road → TECHNICAL
// 4. Gaps after/before highways → TECHNICAL (ramps)
// 5. Tiny transit segments (<0.5mi) surrounded by non-transit → absorb
// 6. POST-PROCESS: Urban overlay - TECHNICAL in major cities → URBAN
//
// Key principle: TRANSIT (highway) is NEVER changed to URBAN
// Only TECHNICAL zones can become URBAN based on city context
// ================================

import { detectUrbanSections, applyUrbanOverlay } from './urbanDetectionService'

/**
 * Main entry: Classify zones from road segments
 * Now ASYNC because it calls urban detection
 * 
 * @param {Array} roadSegments - From extractRoadRefs() in routeService
 *   Each segment: { startMile, endMile, ref, name, roadClass }
 * @param {number} totalMiles - Total route length in miles
 * @param {Array} coordinates - Route coordinates for urban detection
 * @param {number} totalDistanceMeters - Total route distance in meters
 * @returns {Promise<Array>} Zones: [{ start, end, character, road, ... }]
 */
export async function classifyZones(roadSegments, totalMiles, coordinates, totalDistanceMeters) {
  console.log('🛣️ Simple Zone Classifier v5.0')
  console.log(`   Road segments: ${roadSegments?.length || 0}`)
  console.log(`   Total miles: ${totalMiles?.toFixed(1)}`)
  
  // Step 1: Classify by road name (sync)
  const roadBasedZones = classifyByRoadName(roadSegments, totalMiles)
  
  // Step 2: Apply urban overlay (async - queries Mapbox)
  let finalZones = roadBasedZones
  
  if (coordinates?.length > 0 && totalDistanceMeters > 0) {
    try {
      console.log('\n🏙️ Detecting urban sections...')
      const urbanSections = await detectUrbanSections(
        coordinates,
        totalDistanceMeters,
        1  // Sample every 1 mile
      )
      
      // Apply urban overlay (only changes TECHNICAL → URBAN, never TRANSIT)
      finalZones = applyUrbanOverlay(roadBasedZones, urbanSections)
    } catch (urbanErr) {
      console.warn('⚠️ Urban detection failed, using road-based zones:', urbanErr.message)
    }
  }
  
  // Step 3: Convert to standard format
  return convertToStandardFormat(finalZones, totalDistanceMeters)
}

/**
 * Synchronous version - classifies by road name only (no urban detection)
 * Use this if you need sync behavior or will apply urban overlay separately
 * 
 * @param {Array} roadSegments - From extractRoadRefs() in routeService
 * @param {number} totalMiles - Total route length in miles
 * @param {Array} curves - Optional curves for gap analysis (legacy, not used in v5)
 * @returns {Array} Zones in mile format: [{ startMile, endMile, character, road }]
 */
export function classifyByRoadName(roadSegments, totalMiles, curves = []) {
  console.log('🛣️ Simple Zone Classifier v5.0 (road-based)')
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
    console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${roadName} (${seg.roadClass})`)
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
    const nextSeg = i < classifiedSegments.length - 1 ? classifiedSegments[i + 1] : null
    
    // Check for gap before this segment
    if (seg.startMile > currentMile + 0.01) {
      const gapZone = classifyGap(prevSeg, seg, currentMile, seg.startMile)
      zones.push({
        startMile: currentMile,
        endMile: seg.startMile,
        character: gapZone,
        road: '[gap]'
      })
    }
    
    // Add this segment's zone
    zones.push({
      startMile: Math.max(seg.startMile, currentMile),
      endMile: seg.endMile,
      character: seg.zone,
      road: seg.ref || seg.name || 'unnamed'
    })
    
    currentMile = seg.endMile
  }
  
  // Fill gap at end if needed
  if (currentMile < totalMiles - 0.01) {
    const lastSeg = classifiedSegments[classifiedSegments.length - 1]
    zones.push({
      startMile: currentMile,
      endMile: totalMiles,
      character: 'technical',  // Default to technical at route end
      road: '[end]'
    })
  }
  
  // ========================================
  // STEP 3: Merge adjacent zones with same character
  // ========================================
  const mergedZones = mergeAdjacentZones(zones)
  
  // ========================================
  // STEP 4: Absorb tiny transit segments
  // ========================================
  const finalZones = absorbTinyTransit(mergedZones, 0.5)
  
  // Log final zones
  console.log('   Final zones:')
  finalZones.forEach((z, i) => {
    const length = (z.endMile - z.startMile).toFixed(1)
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.road}) [${length}mi]`)
  })
  
  return finalZones
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
function absorbTinyTransit(zones, minLength = 0.5) {
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
 * Adds both mile and meter measurements
 */
export function convertToStandardFormat(zones, totalDistanceMeters) {
  return zones.map(z => ({
    // Meter-based (primary for distance calculations)
    start: z.startMile * 1609.34,
    end: z.endMile * 1609.34,
    startDistance: z.startMile * 1609.34,
    endDistance: z.endMile * 1609.34,
    // Mile-based (for display)
    startMile: z.startMile,
    endMile: z.endMile,
    lengthMiles: z.endMile - z.startMile,
    // Classification
    character: z.character,
    road: z.road,
    // Urban context (if set by applyUrbanOverlay)
    urbanPlace: z.urbanPlace || null,
    urbanNeighborhood: z.urbanNeighborhood || null
  }))
}

/**
 * Reassign zone labels to events based on classified zones
 */
export function reassignEventZones(events, zones) {
  if (!zones || zones.length === 0) {
    console.log('📍 reassignEventZones: No zones provided')
    return events
  }
  if (!events || events.length === 0) {
    console.log('📍 reassignEventZones: No events provided')
    return events
  }
  
  // Debug: log zone ranges
  console.log('📍 reassignEventZones: Zone ranges (meters):')
  zones.forEach((z, i) => {
    console.log(`   ${i + 1}. ${z.character}: ${z.start?.toFixed(0) || 'N/A'}-${z.end?.toFixed(0) || 'N/A'}m (${z.startMile?.toFixed(1)}-${z.endMile?.toFixed(1)}mi)`)
  })
  
  // Debug: log sample event to see its structure
  const sampleEvent = events[Math.floor(events.length / 2)]
  console.log(`📍 Sample event keys: ${Object.keys(sampleEvent).join(', ')}`)
  console.log(`📍 Sample event: mile=${sampleEvent.mile}, apexMile=${sampleEvent.apexMile}, distance=${sampleEvent.distance}`)
  
  let reassigned = 0
  let notFound = 0
  
  const updatedEvents = events.map(event => {
    // Road Flow Analyzer uses 'apexMile' for the mile position
    // Try multiple property names for compatibility
    const eventMile = event.mile ?? event.apexMile ?? event.triggerMile ?? 0
    const eventDistance = event.distance ?? (eventMile * 1609.34)
    
    // Find which zone this event falls into - try BOTH mile and meter lookups
    let zone = null
    
    // First try meter-based lookup
    if (zones[0]?.start !== undefined) {
      zone = zones.find(z => eventDistance >= z.start && eventDistance < z.end)
    }
    
    // If that fails, try mile-based lookup
    if (!zone && zones[0]?.startMile !== undefined) {
      zone = zones.find(z => eventMile >= z.startMile && eventMile < z.endMile)
    }
    
    if (!zone) {
      notFound++
      return event
    }
    
    if (event.zone !== zone.character) {
      reassigned++
    }
    
    return {
      ...event,
      zone: zone.character,
      zoneType: zone.character
    }
  })
  
  console.log(`📍 Reassigned zones: ${reassigned} changed, ${notFound} not found, ${events.length} total`)
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
 */
export function extractCurvesFromEvents(events) {
  if (!events || events.length === 0) return []
  
  return events
    .filter(e => (e.angle ?? e.totalAngle ?? 0) >= 10)
    .map(e => ({
      mile: e.mile ?? e.apexMile ?? (e.distance / 1609.34) ?? 0,
      angle: e.angle ?? e.totalAngle ?? 0,
      direction: e.direction || 'unknown',
      type: e.type || 'curve'
    }))
}

export default {
  classifyZones,
  classifyByRoadName,
  convertToStandardFormat,
  reassignEventZones,
  getZoneAtDistance,
  extractCurvesFromEvents
}
