// ================================
// Zone Detection Service
// Auto-detects urban/highway/rural zones from Mapbox road data
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Zone types
export const ZONE_TYPES = {
  URBAN: 'urban',
  HIGHWAY: 'highway', 
  RURAL: 'rural',
  EXCEPTION: 'exception'
}

// Zone colors (for map overlay)
export const ZONE_COLORS = {
  urban: { fill: 'rgba(255, 100, 100, 0.08)', border: 'rgba(255, 100, 100, 0.4)', label: '#ff6464' },
  highway: { fill: 'rgba(100, 180, 255, 0.08)', border: 'rgba(100, 180, 255, 0.4)', label: '#64b4ff' },
  rural: { fill: 'rgba(100, 255, 150, 0.08)', border: 'rgba(100, 255, 150, 0.4)', label: '#64ff96' },
  exception: { fill: 'rgba(255, 215, 0, 0.12)', border: 'rgba(255, 215, 0, 0.5)', label: '#ffd700' }
}

// Zone behavior defaults
export const ZONE_BEHAVIORS = {
  urban: {
    minSeverity: 4,        // Only announce 4+ curves
    speedMultiplier: 0.7,  // Lower speed recommendations
    calloutVerbosity: 'minimal',
    showTrafficWarnings: true
  },
  highway: {
    minSeverity: 1,        // Announce all curves
    speedMultiplier: 1.2,  // Higher speeds
    calloutVerbosity: 'standard',
    showTrafficWarnings: false
  },
  rural: {
    minSeverity: 2,        // Skip very easy curves
    speedMultiplier: 1.0,  // Standard speeds
    calloutVerbosity: 'standard',
    showTrafficWarnings: false
  },
  exception: {
    minSeverity: 1,        // Full callouts
    speedMultiplier: 1.1,  // Slightly higher
    calloutVerbosity: 'detailed',
    showTrafficWarnings: false
  }
}

// Road class to zone type mapping
const ROAD_CLASS_MAP = {
  'motorway': ZONE_TYPES.HIGHWAY,
  'motorway_link': ZONE_TYPES.HIGHWAY,
  'trunk': ZONE_TYPES.HIGHWAY,
  'trunk_link': ZONE_TYPES.HIGHWAY,
  'primary': ZONE_TYPES.RURAL,      // Could be either, use speed to refine
  'primary_link': ZONE_TYPES.RURAL,
  'secondary': ZONE_TYPES.RURAL,
  'secondary_link': ZONE_TYPES.RURAL,
  'tertiary': ZONE_TYPES.RURAL,
  'tertiary_link': ZONE_TYPES.RURAL,
  'residential': ZONE_TYPES.URBAN,
  'service': ZONE_TYPES.URBAN,
  'living_street': ZONE_TYPES.URBAN,
  'unclassified': ZONE_TYPES.RURAL
}

/**
 * Detect zones along a route using Mapbox road data
 * Returns array of zone segments with start/end indices and coordinates
 */
export async function detectZones(coordinates, existingOverrides = []) {
  if (!coordinates?.length || coordinates.length < 2) return []
  
  // Sample points along route (every ~500m to limit API calls)
  const samplePoints = sampleRoute(coordinates, 500)
  
  // Fetch road class for each sample point
  const roadData = await Promise.all(
    samplePoints.map(async (point) => {
      try {
        const roadClass = await fetchRoadClass(point.coord)
        return { ...point, roadClass }
      } catch {
        return { ...point, roadClass: 'unclassified' }
      }
    })
  )
  
  // Segment into zones based on road class
  const zones = segmentIntoZones(roadData, coordinates)
  
  // Apply any existing overrides (global or per-route)
  const zonesWithOverrides = applyOverrides(zones, existingOverrides)
  
  return zonesWithOverrides
}

/**
 * Sample points along route at regular intervals
 */
function sampleRoute(coordinates, intervalMeters) {
  const samples = []
  let accumulatedDistance = 0
  let lastSampleDistance = 0
  
  samples.push({ coord: coordinates[0], index: 0, distance: 0 })
  
  for (let i = 1; i < coordinates.length; i++) {
    const segmentDist = getDistance(coordinates[i-1], coordinates[i])
    accumulatedDistance += segmentDist
    
    if (accumulatedDistance - lastSampleDistance >= intervalMeters) {
      samples.push({ coord: coordinates[i], index: i, distance: accumulatedDistance })
      lastSampleDistance = accumulatedDistance
    }
  }
  
  // Always include last point
  if (samples[samples.length - 1].index !== coordinates.length - 1) {
    samples.push({ coord: coordinates[coordinates.length - 1], index: coordinates.length - 1, distance: accumulatedDistance })
  }
  
  return samples
}

/**
 * Fetch road class from Mapbox Tilequery API
 */
async function fetchRoadClass(coord) {
  if (!MAPBOX_TOKEN) return 'unclassified'
  
  try {
    const response = await fetch(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coord[0]},${coord[1]}.json?layers=road&radius=50&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.features?.length > 0) {
      // Find the closest/most relevant road feature
      const roadFeature = data.features.find(f => f.properties?.class) || data.features[0]
      return roadFeature.properties?.class || 'unclassified'
    }
    return 'unclassified'
  } catch (err) {
    console.error('Road class fetch error:', err)
    return 'unclassified'
  }
}

/**
 * Segment route into zones based on road class changes
 */
function segmentIntoZones(roadData, fullCoordinates) {
  if (!roadData?.length) return []
  
  const zones = []
  let currentZone = null
  
  roadData.forEach((point, i) => {
    const zoneType = ROAD_CLASS_MAP[point.roadClass] || ZONE_TYPES.RURAL
    
    if (!currentZone || currentZone.type !== zoneType) {
      // End previous zone
      if (currentZone) {
        currentZone.endIndex = point.index
        currentZone.endDistance = point.distance
        // Extract coordinates for this zone
        currentZone.coordinates = fullCoordinates.slice(currentZone.startIndex, currentZone.endIndex + 1)
        zones.push(currentZone)
      }
      
      // Start new zone
      currentZone = {
        id: `zone-${zones.length}`,
        type: zoneType,
        roadClass: point.roadClass,
        startIndex: point.index,
        startDistance: point.distance,
        behavior: { ...ZONE_BEHAVIORS[zoneType] },
        isOverride: false
      }
    }
  })
  
  // Close final zone
  if (currentZone) {
    const lastPoint = roadData[roadData.length - 1]
    currentZone.endIndex = lastPoint.index
    currentZone.endDistance = lastPoint.distance
    currentZone.coordinates = fullCoordinates.slice(currentZone.startIndex, currentZone.endIndex + 1)
    zones.push(currentZone)
  }
  
  // Merge very short zones (< 200m) into neighbors
  return mergeShortZones(zones, 200)
}

/**
 * Merge zones shorter than minLength into adjacent zones
 */
function mergeShortZones(zones, minLength) {
  if (zones.length <= 1) return zones
  
  const merged = []
  let i = 0
  
  while (i < zones.length) {
    const zone = zones[i]
    const zoneLength = zone.endDistance - zone.startDistance
    
    if (zoneLength < minLength && merged.length > 0) {
      // Merge into previous zone
      const prev = merged[merged.length - 1]
      prev.endIndex = zone.endIndex
      prev.endDistance = zone.endDistance
      prev.coordinates = [...prev.coordinates, ...zone.coordinates.slice(1)]
    } else if (zoneLength < minLength && i < zones.length - 1) {
      // Merge into next zone (will be handled when we process next)
      zones[i + 1].startIndex = zone.startIndex
      zones[i + 1].startDistance = zone.startDistance
      zones[i + 1].coordinates = [...zone.coordinates, ...zones[i + 1].coordinates.slice(1)]
    } else {
      merged.push(zone)
    }
    i++
  }
  
  return merged
}

/**
 * Apply user overrides (global exceptions or per-route)
 */
function applyOverrides(zones, overrides) {
  if (!overrides?.length) return zones
  
  return zones.map(zone => {
    // Check if any override applies to this zone
    const override = overrides.find(o => {
      // Check if override covers this zone's area
      if (o.coordinates) {
        return zonesOverlap(zone, o)
      }
      // Check by zone ID
      return o.zoneId === zone.id
    })
    
    if (override) {
      return {
        ...zone,
        type: override.type || zone.type,
        behavior: { ...ZONE_BEHAVIORS[override.type || zone.type], ...override.behavior },
        isOverride: true,
        overrideName: override.name
      }
    }
    
    return zone
  })
}

/**
 * Check if two zones overlap geographically
 */
function zonesOverlap(zone1, zone2) {
  // Simple check: do any coordinates fall within range?
  const z1Start = zone1.startDistance
  const z1End = zone1.endDistance
  const z2Start = zone2.startDistance || 0
  const z2End = zone2.endDistance || Infinity
  
  return !(z1End < z2Start || z1Start > z2End)
}

/**
 * Create a zone override for a specific segment
 */
export function createZoneOverride(zone, newType, customBehavior = {}) {
  return {
    id: `override-${Date.now()}`,
    zoneId: zone.id,
    type: newType,
    originalType: zone.type,
    startIndex: zone.startIndex,
    endIndex: zone.endIndex,
    startDistance: zone.startDistance,
    endDistance: zone.endDistance,
    behavior: { ...ZONE_BEHAVIORS[newType], ...customBehavior },
    coordinates: zone.coordinates,
    createdAt: new Date().toISOString()
  }
}

/**
 * Get zone at a specific distance along route
 */
export function getZoneAtDistance(zones, distance) {
  return zones.find(z => distance >= z.startDistance && distance <= z.endDistance)
}

/**
 * Get zone behavior for a curve based on its position
 */
export function getZoneBehaviorForCurve(zones, curve) {
  const zone = getZoneAtDistance(zones, curve.distanceFromStart || 0)
  return zone?.behavior || ZONE_BEHAVIORS.rural
}

// Helper: Calculate distance between two coordinates
function getDistance(coord1, coord2) {
  const R = 6371e3
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

export default {
  detectZones,
  createZoneOverride,
  getZoneAtDistance,
  getZoneBehaviorForCurve,
  ZONE_TYPES,
  ZONE_COLORS,
  ZONE_BEHAVIORS
}
