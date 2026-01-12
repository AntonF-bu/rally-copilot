// ================================
// Zone Service v3
// UPDATED: Removed SPIRITED - now only HIGHWAY, TECHNICAL, URBAN
// ================================

// Route character types - SIMPLIFIED to 3 zones
export const ROUTE_CHARACTER = {
  TRANSIT: 'transit',      // Highway - gentle sweepers, high speed
  TECHNICAL: 'technical',  // Winding roads - full attention required
  URBAN: 'urban'           // City driving - traffic, stops
}

// Character colors for map display
export const CHARACTER_COLORS = {
  transit: {
    primary: '#3b82f6',    // Blue
    secondary: '#1d4ed8',
    label: 'Highway'
  },
  technical: {
    primary: '#f59e0b',    // Amber/Orange
    secondary: '#d97706',
    label: 'Technical'
  },
  urban: {
    primary: '#8b5cf6',    // Purple
    secondary: '#7c3aed',
    label: 'Urban'
  }
}

// Thresholds for classification
const CLASSIFICATION_THRESHOLDS = {
  // High speed = likely highway
  highwayMinSpeed: 45,        // mph - roads with speed >= this tend to be highways
  
  // Curve density thresholds (curves per km)
  highCurveDensity: 3,        // More than this = technical
  lowCurveDensity: 1,         // Less than this on fast road = highway
  
  // Curve angle thresholds
  tightCurveAngle: 25,        // Degrees - curves sharper than this = technical indicator
  
  // Urban indicators
  urbanIntersectionDensity: 4, // Intersections per km
  urbanMaxSpeed: 35,           // mph - speed limit suggesting urban
  
  // Minimum segment length
  minSegmentLength: 500        // meters - don't create tiny segments
}

/**
 * Analyze route and determine character zones
 * @param {Array} coordinates - Route coordinates [[lng, lat], ...]
 * @param {Array} curves - Detected curves with severity, angle, etc.
 * @returns {Object} { segments: [...], summary: {...} }
 */
export async function analyzeRouteCharacter(coordinates, curves = []) {
  if (!coordinates?.length) {
    return { segments: [], summary: null }
  }

  // Calculate total route distance
  const totalDistance = calculateTotalDistance(coordinates)
  
  // Analyze segments
  const segments = analyzeSegments(coordinates, curves, totalDistance)
  
  // Generate summary
  const summary = generateSummary(segments, totalDistance)
  
  return { segments, summary }
}

/**
 * Analyze route segments and classify each
 */
function analyzeSegments(coordinates, curves, totalDistance) {
  const segments = []
  const segmentLength = 2000 // Analyze in 2km chunks
  
  let currentStart = 0
  let segmentIndex = 0
  
  while (currentStart < totalDistance) {
    const segmentEnd = Math.min(currentStart + segmentLength, totalDistance)
    
    // Get curves in this segment
    const segmentCurves = curves.filter(c => 
      c.distanceFromStart >= currentStart && 
      c.distanceFromStart < segmentEnd
    )
    
    // Calculate segment metrics
    const segmentLengthActual = segmentEnd - currentStart
    const curveDensity = (segmentCurves.length / segmentLengthActual) * 1000 // per km
    const avgCurveAngle = segmentCurves.length > 0 
      ? segmentCurves.reduce((sum, c) => sum + (c.angle || 15), 0) / segmentCurves.length 
      : 0
    const maxSeverity = segmentCurves.length > 0
      ? Math.max(...segmentCurves.map(c => c.severity || 1))
      : 0
    
    // Classify segment
    const character = classifySegment({
      curveDensity,
      avgCurveAngle,
      maxSeverity,
      curveCount: segmentCurves.length
    })
    
    // Get coordinate indices for this segment
    const startProgress = currentStart / totalDistance
    const endProgress = segmentEnd / totalDistance
    const startIndex = Math.floor(startProgress * coordinates.length)
    const endIndex = Math.min(Math.ceil(endProgress * coordinates.length), coordinates.length - 1)
    
    segments.push({
      id: `segment-${segmentIndex}`,
      startDistance: currentStart,
      endDistance: segmentEnd,
      startIndex,
      endIndex,
      character,
      curveCount: segmentCurves.length,
      curveDensity: Math.round(curveDensity * 10) / 10,
      avgCurveAngle: Math.round(avgCurveAngle),
      maxSeverity,
      coordinates: coordinates.slice(startIndex, endIndex + 1)
    })
    
    currentStart = segmentEnd
    segmentIndex++
  }
  
  // Merge adjacent segments with same character
  return mergeAdjacentSegments(segments)
}

/**
 * Classify a segment based on its metrics
 * SIMPLIFIED: Only returns transit, technical, or urban
 */
function classifySegment({ curveDensity, avgCurveAngle, maxSeverity, curveCount }) {
  // High curve density with tight angles = TECHNICAL
  if (curveDensity >= CLASSIFICATION_THRESHOLDS.highCurveDensity) {
    return ROUTE_CHARACTER.TECHNICAL
  }
  
  // Sharp curves = TECHNICAL
  if (avgCurveAngle >= CLASSIFICATION_THRESHOLDS.tightCurveAngle) {
    return ROUTE_CHARACTER.TECHNICAL
  }
  
  // High severity curves = TECHNICAL
  if (maxSeverity >= 4) {
    return ROUTE_CHARACTER.TECHNICAL
  }
  
  // Low curve density = HIGHWAY
  if (curveDensity < CLASSIFICATION_THRESHOLDS.lowCurveDensity) {
    return ROUTE_CHARACTER.TRANSIT
  }
  
  // Moderate curves with gentle angles = HIGHWAY
  if (avgCurveAngle < 15 && maxSeverity <= 2) {
    return ROUTE_CHARACTER.TRANSIT
  }
  
  // Default to TECHNICAL for safety (better to over-call than under-call)
  return ROUTE_CHARACTER.TECHNICAL
}

/**
 * Merge adjacent segments with the same character
 */
function mergeAdjacentSegments(segments) {
  if (segments.length <= 1) return segments
  
  const merged = []
  let current = { ...segments[0] }
  
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]
    
    if (next.character === current.character) {
      // Merge segments
      current.endDistance = next.endDistance
      current.endIndex = next.endIndex
      current.curveCount += next.curveCount
      current.coordinates = [...current.coordinates, ...next.coordinates.slice(1)]
      
      // Recalculate averages
      const totalLength = current.endDistance - current.startDistance
      current.curveDensity = Math.round((current.curveCount / totalLength) * 1000 * 10) / 10
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  
  merged.push(current)
  return merged
}

/**
 * Generate summary statistics
 */
function generateSummary(segments, totalDistance) {
  const byCharacter = {}
  
  // Initialize all characters
  Object.values(ROUTE_CHARACTER).forEach(char => {
    byCharacter[char] = { distance: 0, percentage: 0, segments: 0 }
  })
  
  // Calculate stats per character
  segments.forEach(seg => {
    const length = seg.endDistance - seg.startDistance
    if (byCharacter[seg.character]) {
      byCharacter[seg.character].distance += length
      byCharacter[seg.character].segments++
    }
  })
  
  // Calculate percentages
  Object.keys(byCharacter).forEach(char => {
    byCharacter[char].percentage = Math.round((byCharacter[char].distance / totalDistance) * 100)
  })
  
  // Fun percentage = technical (engaging driving)
  const funPercentage = byCharacter[ROUTE_CHARACTER.TECHNICAL]?.percentage || 0
  
  return {
    totalDistance,
    segmentCount: segments.length,
    byCharacter,
    funPercentage,
    // Dominant character
    dominant: Object.entries(byCharacter)
      .sort((a, b) => b[1].distance - a[1].distance)[0]?.[0] || ROUTE_CHARACTER.TECHNICAL
  }
}

/**
 * Calculate total distance from coordinates
 */
function calculateTotalDistance(coordinates) {
  let total = 0
  for (let i = 1; i < coordinates.length; i++) {
    total += haversineDistance(coordinates[i - 1], coordinates[i])
  }
  return total
}

/**
 * Haversine distance between two points
 */
function haversineDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Get zone at a specific distance
 */
export function getZoneAtDistance(segments, distance) {
  if (!segments?.length) return null
  return segments.find(seg => 
    distance >= seg.startDistance && distance <= seg.endDistance
  )
}

/**
 * Check if distance is in a specific zone type
 */
export function isInZoneType(segments, distance, zoneType) {
  const zone = getZoneAtDistance(segments, distance)
  return zone?.character === zoneType
}

export default {
  ROUTE_CHARACTER,
  CHARACTER_COLORS,
  analyzeRouteCharacter,
  getZoneAtDistance,
  isInZoneType
}
