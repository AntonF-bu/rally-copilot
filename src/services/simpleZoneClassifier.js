// ================================
// Simple Zone Classifier v2.0
// 
// Primary: Road names are AUTHORITATIVE
// - "I 90" = highway/transit (always)
// - "Center Street" = technical (always)
// - State routes = check curves
//
// Secondary: Curve analysis fills gaps
// - Gaps < 0.5mi = inherit from previous zone
// - Gaps with dense curves = technical
// - Otherwise = transit
//
// ADDED: reassignEventZones for RoutePreview compatibility
// ================================

/**
 * Configuration
 */
const CONFIG = {
  // Gap handling
  maxGapToInherit: 0.5,        // Gaps smaller than this inherit from previous zone
  
  // Curve analysis for state routes and gaps
  curveLookAheadMiles: 1.0,    // Window to analyze curves
  minCurvesForTechnical: 3,    // Need this many curves in window
  minAvgAngleForTechnical: 18, // Average angle must be meaningful
  minAngleToCount: 12,         // Ignore tiny angles
  
  // Urban detection
  maxUrbanMiles: 1.0,          // Urban zones only at route edges, max this length
  
  // Zone cleanup
  minZoneLengthMiles: 0.3,     // Don't create tiny zones
}

/**
 * Classify road type from ref and name
 * Returns: 'interstate' | 'us_highway' | 'state_route' | 'local' | 'unknown'
 */
function classifyRoad(ref, name) {
  const refUpper = (ref || '').toUpperCase()
  const nameUpper = (name || '').toUpperCase()
  
  // Interstate: I-90, I 90, I90
  if (refUpper.match(/^I[\s-]?\d+/)) {
    return 'interstate'
  }
  
  // US Highway: US-9, US 9, US9
  if (refUpper.match(/^US[\s-]?\d+/)) {
    return 'us_highway'
  }
  
  // State Route: MA-9, MA 9, NY-17
  if (refUpper.match(/^[A-Z]{2}[\s-]?\d+/)) {
    return 'state_route'
  }
  
  // Turnpikes/Parkways = highway-like
  if (nameUpper.includes('TURNPIKE') || 
      nameUpper.includes('PARKWAY') || 
      nameUpper.includes('EXPRESSWAY') ||
      nameUpper.includes('FREEWAY') ||
      nameUpper.includes('THRUWAY')) {
    return 'us_highway'
  }
  
  // If has a name but no ref, it's local
  if (name && !ref) {
    return 'local'
  }
  
  return 'unknown'
}

/**
 * Check if a mile range has dense curves (technical characteristics)
 */
function hasDenseCurves(startMile, endMile, curves) {
  if (!curves || curves.length === 0) return false
  
  const curvesInRange = curves.filter(c => {
    const mile = c.mile ?? c.apexMile ?? 0
    const angle = c.angle ?? c.totalAngle ?? 0
    return mile >= startMile && mile <= endMile && angle >= CONFIG.minAngleToCount
  })
  
  if (curvesInRange.length < CONFIG.minCurvesForTechnical) {
    return false
  }
  
  const avgAngle = curvesInRange.reduce((sum, c) => sum + (c.angle ?? c.totalAngle ?? 0), 0) / curvesInRange.length
  return avgAngle >= CONFIG.minAvgAngleForTechnical
}

/**
 * Get zone character for state routes based on curves
 */
function classifyStateRoute(startMile, endMile, curves) {
  // Look at curves in this segment + a bit beyond
  const lookEnd = endMile + CONFIG.curveLookAheadMiles
  
  if (hasDenseCurves(startMile, lookEnd, curves)) {
    return 'technical'
  }
  
  // No dense curves = treat as transit (boring state highway)
  return 'transit'
}

/**
 * Determine zone character from road classification
 */
function roadToZone(roadClass, startMile, endMile, curves) {
  switch (roadClass) {
    case 'interstate':
      return 'transit'    // Interstates are ALWAYS transit
    case 'us_highway':
      return 'transit'    // US highways are almost always transit
    case 'state_route':
      return classifyStateRoute(startMile, endMile, curves)
    case 'local':
      return 'technical'  // Local roads = technical
    case 'unknown':
      // Unknown roads - check curves
      return hasDenseCurves(startMile, endMile, curves) ? 'technical' : 'transit'
    default:
      return 'transit'    // Default safe
  }
}

/**
 * Main entry: Classify zones from road segments
 * 
 * @param {Array} roadSegments - From extractRoadRefs() in routeService
 *   Each segment: { startMile, endMile, ref, name, roadClass }
 * @param {number} totalMiles - Total route length
 * @param {Array} curves - Optional curve data for gap filling (from flow events or curve detection)
 * @returns {Array} Zones: [{ startMile, endMile, character, road }]
 */
export function classifyByRoadName(roadSegments, totalMiles, curves = []) {
  console.log('🛣️ Simple Zone Classifier v2.0')
  console.log(`   Road segments: ${roadSegments?.length || 0}`)
  console.log(`   Total miles: ${totalMiles?.toFixed(1)}`)
  console.log(`   Curves for gap analysis: ${curves?.length || 0}`)
  
  if (!roadSegments || roadSegments.length === 0) {
    console.log('   ⚠️ No road segments - using curve analysis only')
    const character = hasDenseCurves(0, totalMiles, curves) ? 'technical' : 'transit'
    return [{
      startMile: 0,
      endMile: totalMiles,
      character,
      road: 'unknown'
    }]
  }
  
  // Log what we got
  console.log('   Road segments:')
  roadSegments.forEach(seg => {
    const roadName = seg.ref || seg.name || 'unnamed'
    console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${roadName} (${seg.roadClass})`)
  })
  
  // Step 1: Convert each road segment to a zone with curve analysis for state routes
  const rawZones = roadSegments.map(seg => {
    const character = roadToZone(seg.roadClass, seg.startMile, seg.endMile, curves)
    return {
      startMile: seg.startMile,
      endMile: seg.endMile,
      character,
      road: seg.ref || seg.name || 'unnamed',
      roadClass: seg.roadClass
    }
  })
  
  // Step 2: Fill gaps between segments
  const zonesWithGaps = fillGaps(rawZones, totalMiles, curves)
  
  // Step 3: Merge adjacent zones with same character
  const mergedZones = mergeAdjacentZones(zonesWithGaps)
  
  // Step 4: Clean up tiny zones
  const cleanedZones = cleanupTinyZones(mergedZones)
  
  // Step 5: Apply urban at route edges
  const finalZones = applyUrbanEdges(cleanedZones, totalMiles)
  
  // Log results
  console.log('   Final zones:')
  finalZones.forEach((z, i) => {
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.road})`)
  })
  
  return finalZones
}

/**
 * Fill gaps between road segments
 */
function fillGaps(zones, totalMiles, curves) {
  if (zones.length === 0) return zones
  
  const result = []
  let currentMile = 0
  
  // Sort zones by start mile
  const sorted = [...zones].sort((a, b) => a.startMile - b.startMile)
  
  for (const zone of sorted) {
    // Check for gap before this zone
    if (zone.startMile > currentMile + 0.01) {
      const gapStart = currentMile
      const gapEnd = zone.startMile
      const gapLength = gapEnd - gapStart
      
      let gapCharacter
      let gapReason
      
      if (gapLength <= CONFIG.maxGapToInherit && result.length > 0) {
        // Small gap - inherit from previous zone
        gapCharacter = result[result.length - 1].character
        gapReason = 'inherited from previous'
      } else if (result.length > 0 && zone.character === result[result.length - 1].character) {
        // Gap between same-type zones - inherit
        gapCharacter = zone.character
        gapReason = 'same neighbors'
      } else {
        // Use curve analysis
        gapCharacter = hasDenseCurves(gapStart, gapEnd, curves) ? 'technical' : 'transit'
        gapReason = gapCharacter === 'technical' ? 'dense curves in gap' : 'no curves in gap'
      }
      
      console.log(`   📍 Gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: ${gapCharacter.toUpperCase()} (${gapReason})`)
      
      result.push({
        startMile: gapStart,
        endMile: gapEnd,
        character: gapCharacter,
        road: 'gap',
        roadClass: 'gap'
      })
    }
    
    result.push(zone)
    currentMile = zone.endMile
  }
  
  // Check for gap at end
  if (currentMile < totalMiles - 0.01) {
    const gapStart = currentMile
    const gapEnd = totalMiles
    const gapCharacter = hasDenseCurves(gapStart, gapEnd, curves) ? 'technical' : 'transit'
    
    console.log(`   📍 End gap ${gapStart.toFixed(1)}-${gapEnd.toFixed(1)}mi: ${gapCharacter.toUpperCase()}`)
    
    result.push({
      startMile: gapStart,
      endMile: gapEnd,
      character: gapCharacter,
      road: 'end',
      roadClass: 'unknown'
    })
  }
  
  return result
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
      // Keep the more significant road name (prefer refs over gap markers)
      if (next.road !== 'gap' && next.road !== 'end' && (current.road === 'gap' || current.road === 'end')) {
        current.road = next.road
        current.roadClass = next.roadClass
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
 * Clean up tiny zones by merging with neighbors
 */
function cleanupTinyZones(zones) {
  if (zones.length <= 1) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const length = zone.endMile - zone.startMile
    
    if (length < CONFIG.minZoneLengthMiles) {
      // Zone is too small
      if (result.length > 0) {
        // Merge with previous
        result[result.length - 1].endMile = zone.endMile
      } else if (i < zones.length - 1) {
        // Merge with next
        zones[i + 1].startMile = zone.startMile
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
 * Apply urban zone at route edges if appropriate
 */
function applyUrbanEdges(zones, totalMiles) {
  if (zones.length === 0) return zones
  
  const result = [...zones]
  const first = result[0]
  
  // If route starts with local/technical roads, call it urban for first mile
  if (first.roadClass === 'local' && first.startMile === 0 && first.character === 'technical') {
    const urbanEnd = Math.min(CONFIG.maxUrbanMiles, first.endMile)
    
    if (urbanEnd < first.endMile) {
      // Split: urban + rest of first zone
      result.splice(0, 1,
        {
          startMile: 0,
          endMile: urbanEnd,
          character: 'urban',
          road: first.road,
          roadClass: first.roadClass
        },
        {
          ...first,
          startMile: urbanEnd
        }
      )
    } else {
      // Entire first zone is urban
      result[0] = { ...first, character: 'urban' }
    }
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
 * Get zone at a specific mile
 */
export function getZoneAtMile(mile, zones) {
  return zones.find(z => mile >= z.startMile && mile < z.endMile) || null
}

/**
 * Reassign zone character to flow events based on classified zones
 * This is needed for RoutePreview to update event zones after classification
 * 
 * @param {Array} events - Events from Road Flow Analyzer (with mile, angle, direction)
 * @param {Array} zones - Classified zones from classifyByRoadName or convertToStandardFormat
 * @returns {Array} Events with updated zone assignments
 */
export function reassignEventZones(events, zones) {
  if (!events || !events.length) return events
  if (!zones || !zones.length) return events
  
  let reassigned = 0
  
  const updatedEvents = events.map(event => {
    // Get mile position from event (different properties depending on source)
    const mile = event.mile ?? event.triggerMile ?? event.apexMile ?? 
                 (event.distance ? event.distance / 1609.34 : 0)
    
    // Find which zone this event falls into
    const zone = zones.find(z => {
      const start = z.startMile ?? (z.start / 1609.34) ?? (z.startDistance / 1609.34) ?? 0
      const end = z.endMile ?? (z.end / 1609.34) ?? (z.endDistance / 1609.34) ?? 0
      return mile >= start && mile < end
    })
    
    const newZone = zone?.character || 'transit'
    
    if (event.zone !== newZone) {
      reassigned++
      return { ...event, zone: newZone }
    }
    
    return event
  })
  
  console.log(`📍 Reassigned zones to ${reassigned} of ${events.length} events`)
  return updatedEvents
}

/**
 * Extract curves from flow events for gap analysis
 * Normalizes different event formats
 */
export function extractCurvesFromEvents(flowEvents) {
  if (!flowEvents || !flowEvents.length) return []
  
  return flowEvents.map(e => ({
    mile: e.mile ?? e.apexMile ?? e.startMile ?? (e.distance ? e.distance / 1609.34 : 0),
    angle: e.angle ?? e.totalAngle ?? 0,
    direction: e.direction || 'UNKNOWN'
  })).filter(c => c.angle >= CONFIG.minAngleToCount)
}

export default {
  classifyByRoadName,
  convertToStandardFormat,
  getZoneAtMile,
  reassignEventZones,
  extractCurvesFromEvents
}
