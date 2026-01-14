// ================================
// Simple Zone Classifier v1.0
// 
// The simple truth: road names tell you everything
// - "I 90" = highway/transit
// - "Center Street" = not highway
// 
// No curve analysis, no census data, no voting systems.
// Just read the road name.
// ================================

/**
 * Classify road type from ref and name
 * Returns: 'interstate' | 'us_highway' | 'state_route' | 'local'
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
  
  // Everything else with a street-type name = local
  // This catches: Street, Avenue, Road, Drive, Lane, Court, Circle, Way, Boulevard, Place, Terrace
  return 'local'
}

/**
 * Determine zone character from road classification
 */
function roadToZone(roadClass) {
  switch (roadClass) {
    case 'interstate':
      return 'transit'
    case 'us_highway':
      return 'transit'
    case 'state_route':
      return 'technical'  // State routes are usually the fun roads
    case 'local':
      return 'technical'  // Local roads = technical (or urban at edges)
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
 * @returns {Array} Zones: [{ startMile, endMile, character, road }]
 */
export function classifyByRoadName(roadSegments, totalMiles) {
  console.log('🛣️ Simple Zone Classifier v1.0')
  console.log(`   Road segments: ${roadSegments?.length || 0}`)
  console.log(`   Total miles: ${totalMiles?.toFixed(1)}`)
  
  if (!roadSegments || roadSegments.length === 0) {
    console.log('   ⚠️ No road segments - defaulting to transit')
    return [{
      startMile: 0,
      endMile: totalMiles,
      character: 'transit',
      road: 'unknown'
    }]
  }
  
  // Log what we got
  console.log('   Road segments:')
  roadSegments.forEach(seg => {
    const roadName = seg.ref || seg.name || 'unnamed'
    console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${roadName} (${seg.roadClass})`)
  })
  
  // Step 1: Convert each road segment to a zone
  const rawZones = roadSegments.map(seg => {
    const character = roadToZone(seg.roadClass)
    return {
      startMile: seg.startMile,
      endMile: seg.endMile,
      character,
      road: seg.ref || seg.name || 'unnamed',
      roadClass: seg.roadClass
    }
  })
  
  // Step 2: Merge adjacent zones with same character
  const mergedZones = mergeAdjacentZones(rawZones)
  
  // Step 3: Apply urban at route start (first mile in city)
  const finalZones = applyUrbanStart(mergedZones, totalMiles)
  
  // Log results
  console.log('   Final zones:')
  finalZones.forEach((z, i) => {
    console.log(`      ${i + 1}. Mile ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}: ${z.character.toUpperCase()} (${z.road})`)
  })
  
  return finalZones
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
      // Keep the more significant road name (prefer refs over names)
      if (next.ref && !current.ref) {
        current.road = next.ref
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
 * Apply urban zone at route start if it begins in a city
 * (First mile of local roads = urban)
 */
function applyUrbanStart(zones, totalMiles) {
  if (zones.length === 0) return zones
  
  const first = zones[0]
  
  // If route starts with local roads (not highway), call it urban for first mile
  if (first.roadClass === 'local' && first.startMile === 0) {
    const urbanEnd = Math.min(1.0, first.endMile)
    
    if (urbanEnd < first.endMile) {
      // Split: urban + rest of first zone
      return [
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
        },
        ...zones.slice(1)
      ]
    } else {
      // Entire first zone is urban
      return [
        { ...first, character: 'urban' },
        ...zones.slice(1)
      ]
    }
  }
  
  return zones
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

export default {
  classifyByRoadName,
  convertToStandardFormat,
  getZoneAtMile
}
