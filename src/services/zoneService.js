// ================================
// Zone Service v2 - Route Character Detection
// Multi-factor: speed limits, traffic signals, city boundaries, curve density
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Route character types (what actually matters for driving)
export const ROUTE_CHARACTER = {
  TECHNICAL: 'technical',   // Twisty fun roads - full co-pilot mode
  SPIRITED: 'spirited',     // Fun roads but some interruptions
  TRANSIT: 'transit',       // Highway cruising - minimal callouts
  URBAN: 'urban'            // City driving - only important stuff
}

// Character colors for UI
export const CHARACTER_COLORS = {
  technical: { primary: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', label: 'Technical' },
  spirited: { primary: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', label: 'Spirited' },
  transit: { primary: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)', label: 'Transit' },
  urban: { primary: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', label: 'Urban' }
}

// Callout behavior per character
export const CHARACTER_BEHAVIORS = {
  technical: {
    minSeverity: 1,           // Announce ALL curves
    speedMultiplier: 1.0,     // Standard speeds
    calloutStyle: 'detailed', // Full pace notes with modifiers
    announceStraights: true,  // "Clear ahead" callouts
    hapticOnHard: true
  },
  spirited: {
    minSeverity: 2,           // Skip severity 1
    speedMultiplier: 1.0,
    calloutStyle: 'standard',
    announceStraights: false,
    hapticOnHard: true
  },
  transit: {
    minSeverity: 3,           // Only medium+ curves (highway ramps etc)
    speedMultiplier: 1.15,    // Can go a bit faster
    calloutStyle: 'minimal',  // Just direction + severity
    announceStraights: false,
    hapticOnHard: false
  },
  urban: {
    minSeverity: 4,           // Only announce sharp turns
    speedMultiplier: 0.75,    // Conservative speeds
    calloutStyle: 'severe_only',
    announceStraights: false,
    hapticOnHard: false
  }
}

// Major urban area bounding boxes (rough approximations)
// Format: [west, south, east, north]
const URBAN_AREAS = {
  'Boston Metro': [-71.19, 42.23, -70.95, 42.42],
  'Cambridge': [-71.16, 42.35, -71.07, 42.40],
  'Newton': [-71.27, 42.28, -71.15, 42.37],
  'Brookline': [-71.18, 42.31, -71.10, 42.35],
  'Somerville': [-71.13, 42.38, -71.07, 42.42],
  // Add more as needed
}

/**
 * Main entry: Analyze route and return character segments
 */
export async function analyzeRouteCharacter(coordinates, curves = []) {
  if (!coordinates?.length || coordinates.length < 2) {
    return { segments: [], summary: null }
  }

  console.log('🛣️ Analyzing route character...')
  
  // Sample points along route (every ~300m for better resolution)
  const samplePoints = sampleRoute(coordinates, 300)
  console.log(`  Sampled ${samplePoints.length} points`)

  // Fetch data for each sample point in parallel
  const pointData = await Promise.all(
    samplePoints.map(async (point) => {
      const [roadInfo, signalCount, isUrban] = await Promise.all([
        fetchRoadInfo(point.coord),
        countNearbySignals(point.coord),
        checkUrbanArea(point.coord)
      ])
      
      return {
        ...point,
        ...roadInfo,
        signalCount,
        isUrban
      }
    })
  )

  // Calculate curve density for each segment
  const pointsWithCurveDensity = addCurveDensity(pointData, curves)

  // Classify each point
  const classifiedPoints = pointsWithCurveDensity.map(point => ({
    ...point,
    character: classifyPoint(point)
  }))

  // Segment into contiguous character zones
  const segments = segmentByCharacter(classifiedPoints, coordinates)
  
  // Generate summary
  const summary = generateSummary(segments, coordinates)

  console.log(`  Found ${segments.length} segments:`, 
    segments.map(s => `${s.character}(${((s.endDistance - s.startDistance)/1609).toFixed(1)}mi)`).join(' → '))

  return { segments, summary }
}

/**
 * Fetch road info (speed limit, road class) from Mapbox
 */
async function fetchRoadInfo(coord) {
  if (!MAPBOX_TOKEN) {
    return { speedLimit: 35, roadClass: 'secondary' }
  }

  try {
    const response = await fetch(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coord[0]},${coord[1]}.json?layers=road&radius=30&limit=1&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.features?.length > 0) {
      const props = data.features[0].properties || {}
      
      // Extract speed limit (Mapbox stores as number or string)
      let speedLimit = props.maxspeed
      if (typeof speedLimit === 'string') {
        speedLimit = parseInt(speedLimit.replace(/[^0-9]/g, '')) || 35
      }
      if (!speedLimit || speedLimit < 5 || speedLimit > 85) {
        // Estimate from road class if missing
        speedLimit = estimateSpeedFromClass(props.class)
      }
      
      return {
        speedLimit,
        roadClass: props.class || 'secondary',
        roadName: props.name || null,
        oneway: props.oneway === 'true' || props.oneway === true
      }
    }
    
    return { speedLimit: 35, roadClass: 'secondary' }
  } catch (err) {
    console.warn('Road info fetch error:', err.message)
    return { speedLimit: 35, roadClass: 'secondary' }
  }
}

/**
 * Count traffic signals within radius of point
 */
async function countNearbySignals(coord, radiusMeters = 400) {
  if (!MAPBOX_TOKEN) return 0

  try {
    // Query for traffic_signal POIs
    const response = await fetch(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coord[0]},${coord[1]}.json?layers=poi_label&radius=${radiusMeters}&limit=50&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.features?.length > 0) {
      // Count features that are traffic signals
      const signals = data.features.filter(f => {
        const type = f.properties?.type?.toLowerCase() || ''
        const maki = f.properties?.maki || ''
        return type.includes('signal') || type.includes('traffic') || 
               maki === 'traffic-signal' || type.includes('stoplight')
      })
      return signals.length
    }
    
    return 0
  } catch (err) {
    return 0
  }
}

/**
 * Check if point is in a known urban area
 */
async function checkUrbanArea(coord) {
  // First check our predefined bounding boxes (fast)
  for (const [name, bbox] of Object.entries(URBAN_AREAS)) {
    if (coord[0] >= bbox[0] && coord[0] <= bbox[2] &&
        coord[1] >= bbox[1] && coord[1] <= bbox[3]) {
      return { isUrban: true, areaName: name }
    }
  }
  
  // Fallback: query Mapbox for place type
  if (MAPBOX_TOKEN) {
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${coord[0]},${coord[1]}.json?types=place,locality,neighborhood&access_token=${MAPBOX_TOKEN}`
      )
      const data = await response.json()
      
      if (data.features?.length > 0) {
        const place = data.features[0]
        const placeType = place.place_type?.[0]
        const population = place.properties?.population
        
        // Urban if it's a city/town with decent population or specific place types
        if (placeType === 'place' && population > 20000) {
          return { isUrban: true, areaName: place.text }
        }
        if (placeType === 'neighborhood' || placeType === 'locality') {
          return { isUrban: true, areaName: place.text }
        }
      }
    } catch (err) {
      // Ignore errors, default to non-urban
    }
  }
  
  return { isUrban: false, areaName: null }
}

/**
 * Add curve density metric to each point
 */
function addCurveDensity(points, curves) {
  if (!curves?.length) {
    return points.map(p => ({ ...p, curveDensity: 0, curveAvgSeverity: 0 }))
  }

  // For each point, count curves within 1 mile (1609m) window
  return points.map(point => {
    const windowStart = point.distance - 804  // 0.5mi before
    const windowEnd = point.distance + 804    // 0.5mi after
    
    const nearbyCurves = curves.filter(c => {
      const curveDist = c.distanceFromStart || 0
      return curveDist >= windowStart && curveDist <= windowEnd
    })
    
    const curveDensity = nearbyCurves.length  // curves per mile
    const curveAvgSeverity = nearbyCurves.length > 0
      ? nearbyCurves.reduce((sum, c) => sum + c.severity, 0) / nearbyCurves.length
      : 0
    
    return { ...point, curveDensity, curveAvgSeverity }
  })
}

/**
 * Classify a single point based on all factors
 */
function classifyPoint(point) {
  const { speedLimit, roadClass, signalCount, isUrban, curveDensity, curveAvgSeverity } = point
  
  // Signals per mile (our sample is ~0.5mi window, so multiply by 2)
  const signalsPerMile = signalCount * 2
  
  // Highway classification
  const isHighway = ['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadClass)
  
  // Decision tree for route character
  
  // TECHNICAL: Twisty roads with few interruptions
  if (curveDensity >= 3 && signalsPerMile < 1 && !isUrban?.isUrban) {
    return ROUTE_CHARACTER.TECHNICAL
  }
  
  // TECHNICAL: High curve severity even with fewer curves
  if (curveAvgSeverity >= 4 && signalsPerMile < 2) {
    return ROUTE_CHARACTER.TECHNICAL
  }
  
  // URBAN: City driving conditions
  if (isUrban?.isUrban && signalsPerMile >= 3) {
    return ROUTE_CHARACTER.URBAN
  }
  if (speedLimit <= 30 && signalsPerMile >= 2) {
    return ROUTE_CHARACTER.URBAN
  }
  if (signalsPerMile >= 4) {
    return ROUTE_CHARACTER.URBAN
  }
  
  // TRANSIT: Highway cruising
  if (isHighway && curveDensity < 2) {
    return ROUTE_CHARACTER.TRANSIT
  }
  if (speedLimit >= 55 && curveDensity < 2 && signalsPerMile < 1) {
    return ROUTE_CHARACTER.TRANSIT
  }
  
  // SPIRITED: Fun roads with some urban elements OR faster roads in/near cities
  if (speedLimit >= 40 && signalsPerMile < 2) {
    return ROUTE_CHARACTER.SPIRITED
  }
  if (curveDensity >= 2 && !isUrban?.isUrban) {
    return ROUTE_CHARACTER.SPIRITED
  }
  
  // Default based on speed limit
  if (speedLimit >= 45) return ROUTE_CHARACTER.SPIRITED
  if (speedLimit <= 30) return ROUTE_CHARACTER.URBAN
  
  return ROUTE_CHARACTER.SPIRITED
}

/**
 * Segment route into contiguous character zones
 */
function segmentByCharacter(classifiedPoints, fullCoordinates) {
  if (!classifiedPoints?.length) return []

  const segments = []
  let currentSegment = null

  classifiedPoints.forEach((point, i) => {
    if (!currentSegment || currentSegment.character !== point.character) {
      // Close previous segment
      if (currentSegment) {
        currentSegment.endIndex = point.index
        currentSegment.endDistance = point.distance
        currentSegment.coordinates = fullCoordinates.slice(
          currentSegment.startIndex, 
          Math.min(point.index + 1, fullCoordinates.length)
        )
        segments.push(currentSegment)
      }
      
      // Start new segment
      currentSegment = {
        id: `seg-${segments.length}`,
        character: point.character,
        startIndex: point.index,
        startDistance: point.distance,
        behavior: CHARACTER_BEHAVIORS[point.character],
        details: {
          avgSpeedLimit: point.speedLimit,
          avgSignalDensity: point.signalCount * 2,
          avgCurveDensity: point.curveDensity,
          isUrban: point.isUrban?.isUrban || false,
          areaName: point.isUrban?.areaName || null
        }
      }
    } else {
      // Update running averages
      const count = i - classifiedPoints.findIndex(p => p.index === currentSegment.startIndex) + 1
      currentSegment.details.avgSpeedLimit = 
        (currentSegment.details.avgSpeedLimit * (count - 1) + point.speedLimit) / count
      currentSegment.details.avgSignalDensity = 
        (currentSegment.details.avgSignalDensity * (count - 1) + point.signalCount * 2) / count
      currentSegment.details.avgCurveDensity = 
        (currentSegment.details.avgCurveDensity * (count - 1) + point.curveDensity) / count
    }
  })

  // Close final segment
  if (currentSegment) {
    const lastPoint = classifiedPoints[classifiedPoints.length - 1]
    currentSegment.endIndex = lastPoint.index
    currentSegment.endDistance = lastPoint.distance
    currentSegment.coordinates = fullCoordinates.slice(
      currentSegment.startIndex,
      fullCoordinates.length
    )
    segments.push(currentSegment)
  }

  // Merge very short segments (< 0.3 miles) into neighbors
  return mergeShortSegments(segments, 500)
}

/**
 * Merge segments shorter than minLength into adjacent segments
 */
function mergeShortSegments(segments, minLengthMeters) {
  if (segments.length <= 1) return segments

  const merged = []
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const segLength = seg.endDistance - seg.startDistance
    
    if (segLength < minLengthMeters && merged.length > 0) {
      // Merge into previous segment
      const prev = merged[merged.length - 1]
      prev.endIndex = seg.endIndex
      prev.endDistance = seg.endDistance
      prev.coordinates = [...prev.coordinates, ...seg.coordinates.slice(1)]
    } else if (segLength < minLengthMeters && i < segments.length - 1) {
      // Merge into next segment
      segments[i + 1].startIndex = seg.startIndex
      segments[i + 1].startDistance = seg.startDistance
      segments[i + 1].coordinates = [...seg.coordinates, ...segments[i + 1].coordinates.slice(1)]
    } else {
      merged.push(seg)
    }
  }

  return merged
}

/**
 * Generate summary statistics
 */
function generateSummary(segments, coordinates) {
  if (!segments?.length) return null

  const totalDistance = segments.reduce((sum, s) => sum + (s.endDistance - s.startDistance), 0)
  
  const byCharacter = {}
  for (const char of Object.values(ROUTE_CHARACTER)) {
    const segs = segments.filter(s => s.character === char)
    const distance = segs.reduce((sum, s) => sum + (s.endDistance - s.startDistance), 0)
    byCharacter[char] = {
      count: segs.length,
      distance,
      percentage: Math.round((distance / totalDistance) * 100)
    }
  }

  // Find "best" section (longest technical or spirited segment)
  const funSegments = segments.filter(s => 
    s.character === ROUTE_CHARACTER.TECHNICAL || s.character === ROUTE_CHARACTER.SPIRITED
  )
  const bestSection = funSegments.sort((a, b) => 
    (b.endDistance - b.startDistance) - (a.endDistance - a.startDistance)
  )[0] || null

  return {
    totalDistance,
    totalDistanceMiles: totalDistance / 1609.34,
    segmentCount: segments.length,
    byCharacter,
    bestSection: bestSection ? {
      character: bestSection.character,
      distanceMiles: (bestSection.endDistance - bestSection.startDistance) / 1609.34,
      startMile: bestSection.startDistance / 1609.34,
      endMile: bestSection.endDistance / 1609.34
    } : null,
    funPercentage: (byCharacter.technical?.percentage || 0) + (byCharacter.spirited?.percentage || 0)
  }
}

/**
 * Get behavior for a specific curve based on route character
 */
export function getBehaviorForCurve(segments, curve) {
  if (!segments?.length || !curve) {
    return CHARACTER_BEHAVIORS.spirited
  }

  const curveDistance = curve.distanceFromStart || 0
  const segment = segments.find(s => 
    curveDistance >= s.startDistance && curveDistance <= s.endDistance
  )

  return segment?.behavior || CHARACTER_BEHAVIORS.spirited
}

/**
 * Check if a curve should be announced based on current segment
 */
export function shouldAnnounceCurve(segments, curve) {
  const behavior = getBehaviorForCurve(segments, curve)
  return curve.severity >= behavior.minSeverity
}

// ================================
// Helper functions
// ================================

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
    samples.push({ 
      coord: coordinates[coordinates.length - 1], 
      index: coordinates.length - 1, 
      distance: accumulatedDistance 
    })
  }
  
  return samples
}

function estimateSpeedFromClass(roadClass) {
  const speeds = {
    'motorway': 65,
    'motorway_link': 45,
    'trunk': 55,
    'trunk_link': 40,
    'primary': 45,
    'primary_link': 35,
    'secondary': 40,
    'secondary_link': 30,
    'tertiary': 35,
    'tertiary_link': 25,
    'residential': 25,
    'service': 20,
    'living_street': 15,
    'unclassified': 35
  }
  return speeds[roadClass] || 35
}

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
  analyzeRouteCharacter,
  getBehaviorForCurve,
  shouldAnnounceCurve,
  ROUTE_CHARACTER,
  CHARACTER_COLORS,
  CHARACTER_BEHAVIORS
}
