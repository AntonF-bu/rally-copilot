// ================================
// Zone Service v3 - Census-Based Route Character Detection
// Uses TIGERweb + Census Data API for reliable population density
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Route character types (what actually matters for driving)
export const ROUTE_CHARACTER = {
  TECHNICAL: 'technical',   // Twisty fun roads - full co-pilot mode
  SPIRITED: 'spirited',     // Fun roads but some interruptions
  TRANSIT: 'transit',       // Highway cruising - minimal callouts (highway)
  URBAN: 'urban'            // City driving - only important stuff
}

// SLEEVE colors for UI (distinct from route line warm colors)
// These show WHERE you are (context/mode) - BOLD and visible
export const CHARACTER_COLORS = {
  technical: { primary: '#22d3ee', bg: 'rgba(34, 211, 238, 0.2)', label: 'Technical' },  // Bright Cyan
  spirited: { primary: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)', label: 'Spirited' },    // Amber
  transit: { primary: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)', label: 'Highway' },      // Blue
  urban: { primary: '#f472b6', bg: 'rgba(244, 114, 182, 0.2)', label: 'Urban' }          // Pink
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

// Population density thresholds (people per square mile)
const DENSITY_THRESHOLDS = {
  HIGH: 8000,     // Urban: > 8k/sq mi (dense city cores)
  MEDIUM: 2500,   // Suburban: 2.5k - 8k/sq mi
  LOW: 2500       // Rural: < 2.5k/sq mi (Weston ~1.5k, should be rural/technical)
}

// ================================
// CENSUS API INTEGRATION
// ================================

/**
 * Fetch census tract data for a route corridor
 * Called ONCE when route is loaded, returns cached tract data
 * Uses our API proxy to avoid CORS issues
 */
export async function fetchCensusCorridorData(routeCoordinates) {
  if (!routeCoordinates?.length || routeCoordinates.length < 2) {
    console.warn('⚠️ No route coordinates for census lookup')
    return { tracts: [], success: false }
  }

  console.log('🏛️ Fetching Census corridor data...')

  try {
    // Use our API proxy to fetch census data (avoids CORS)
    const response = await fetch('/api/census', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: routeCoordinates })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `API error: ${response.status}`)
    }

    const data = await response.json()

    if (!data.success || !data.tracts?.length) {
      console.warn('⚠️ No census tracts found for route')
      return { tracts: [], success: false }
    }

    console.log(`✅ Census data loaded: ${data.tracts.length} tracts`)
    console.log('  ', data.tracts.map(t => `${t.geoid?.slice(-4)}:${t.densityCategory}`).join(', '))

    return { 
      tracts: data.tracts, 
      success: true 
    }

  } catch (err) {
    console.error('❌ Census data fetch error:', err)
    return { tracts: [], success: false, error: err.message }
  }
}

/**
 * Step 1: Query TIGERweb for tract geometries intersecting route
 */
async function fetchTractGeometries(coordinates) {
  // Convert route to Esri polyline format
  const polyline = {
    paths: [coordinates],
    spatialReference: { wkid: 4326 }
  }

  const params = new URLSearchParams({
    geometry: JSON.stringify(polyline),
    geometryType: 'esriGeometryPolyline',
    spatialRel: 'esriSpatialRelIntersects',
    distance: 500,  // 500m buffer around route
    units: 'esriSRUnit_Meter',
    outFields: 'GEOID,STATE,COUNTY,TRACT,AREALAND',
    returnGeometry: 'true',
    f: 'geojson'
  })

  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/4/query?${params}`
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`TIGERweb error: ${response.status}`)
  }

  const data = await response.json()
  
  if (!data.features?.length) {
    return []
  }

  return data.features.map(feature => ({
    geoid: feature.properties.GEOID,
    state: feature.properties.STATE,
    county: feature.properties.COUNTY,
    tract: feature.properties.TRACT,
    areaLand: feature.properties.AREALAND, // Square meters
    geometry: feature.geometry
  }))
}

/**
 * Step 2: Fetch population for tracts from Census Data API
 */
async function fetchTractPopulations(tracts) {
  // Group tracts by state+county for efficient API calls
  const byStateCounty = {}
  
  tracts.forEach(tract => {
    const key = `${tract.state}-${tract.county}`
    if (!byStateCounty[key]) {
      byStateCounty[key] = {
        state: tract.state,
        county: tract.county,
        tracts: []
      }
    }
    byStateCounty[key].tracts.push(tract)
  })

  // Fetch population for each state+county group
  const results = await Promise.all(
    Object.values(byStateCounty).map(group => 
      fetchPopulationForCounty(group.state, group.county, group.tracts)
    )
  )

  return results.flat()
}

/**
 * Fetch population for all tracts in a county
 */
async function fetchPopulationForCounty(state, county, tracts) {
  // B01001_001E = Total Population from ACS 5-Year estimates
  const url = `https://api.census.gov/data/2023/acs/acs5?get=B01001_001E&for=tract:*&in=state:${state}&in=county:${county}`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      console.warn(`Census API error for ${state}-${county}: ${response.status}`)
      return tracts.map(t => ({ ...t, population: null }))
    }

    const data = await response.json()
    
    // First row is headers: ["B01001_001E", "state", "county", "tract"]
    // Subsequent rows are data
    const populationMap = {}
    for (let i = 1; i < data.length; i++) {
      const [pop, st, co, tr] = data[i]
      const geoid = `${st}${co}${tr}`
      populationMap[geoid] = parseInt(pop) || 0
    }

    // Match populations to our tracts
    return tracts.map(tract => ({
      ...tract,
      population: populationMap[tract.geoid] ?? null
    }))

  } catch (err) {
    console.warn(`Census API error for ${state}-${county}:`, err.message)
    return tracts.map(t => ({ ...t, population: null }))
  }
}

/**
 * Calculate population density (people per square mile)
 */
function calculateDensity(population, areaLandSqMeters) {
  if (!population || !areaLandSqMeters || areaLandSqMeters === 0) {
    return 0
  }
  // Convert sq meters to sq miles: 1 sq mile = 2,589,988 sq meters
  const areaSquareMiles = areaLandSqMeters / 2589988
  return Math.round(population / areaSquareMiles)
}

/**
 * Categorize density into urban/suburban/rural
 */
function categorizeDensity(density) {
  if (density >= DENSITY_THRESHOLDS.HIGH) return 'urban'
  if (density >= DENSITY_THRESHOLDS.MEDIUM) return 'suburban'
  return 'rural'
}

// ================================
// ZONE DETECTION AT RUNTIME
// ================================

/**
 * Get the zone/character at a specific position using cached census data
 * Called during navigation - NO API calls, just point-in-polygon lookup
 */
export function getZoneAtPosition(position, cachedTracts, roadInfo = null) {
  if (!position || !cachedTracts?.length) {
    return {
      character: ROUTE_CHARACTER.SPIRITED,
      density: null,
      densityCategory: 'unknown',
      tractId: null
    }
  }

  // Find which tract contains this position
  const tract = cachedTracts.find(t => 
    pointInPolygon(position, t.geometry)
  )

  if (!tract) {
    // Position not in any cached tract - use road info fallback
    return classifyByRoadInfo(roadInfo)
  }

  // Determine character based on density + road type
  const character = determineCharacter(tract.densityCategory, roadInfo)

  return {
    character,
    density: tract.density,
    densityCategory: tract.densityCategory,
    tractId: tract.geoid,
    tractGeometry: tract.geometry
  }
}

/**
 * Determine route character based on density and road type
 */
function determineCharacter(densityCategory, roadInfo) {
  const isHighway = roadInfo && 
    (['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadInfo.roadClass) ||
     roadInfo.speedLimit >= 55)

  // Highways are TRANSIT even in urban areas
  if (isHighway) {
    return ROUTE_CHARACTER.TRANSIT
  }

  // Map density to character
  switch (densityCategory) {
    case 'urban':
      return ROUTE_CHARACTER.URBAN
    case 'suburban':
      return ROUTE_CHARACTER.SPIRITED
    case 'rural':
    default:
      return ROUTE_CHARACTER.TECHNICAL
  }
}

/**
 * Fallback classification when no census data available
 */
function classifyByRoadInfo(roadInfo) {
  if (!roadInfo) {
    return {
      character: ROUTE_CHARACTER.SPIRITED,
      density: null,
      densityCategory: 'unknown',
      tractId: null
    }
  }

  const isHighway = ['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadInfo.roadClass)
  
  let character
  if (isHighway || roadInfo.speedLimit >= 55) {
    character = ROUTE_CHARACTER.TRANSIT
  } else if (roadInfo.speedLimit <= 25) {
    character = ROUTE_CHARACTER.URBAN
  } else if (roadInfo.speedLimit >= 45) {
    character = ROUTE_CHARACTER.SPIRITED
  } else {
    character = ROUTE_CHARACTER.SPIRITED
  }

  return {
    character,
    density: null,
    densityCategory: 'unknown',
    tractId: null
  }
}

// ================================
// MAIN ROUTE ANALYSIS
// ================================

/**
 * Main entry: Analyze route and return character segments
 * Now uses Census data for density classification
 */
export async function analyzeRouteCharacter(coordinates, curves = []) {
  if (!coordinates?.length || coordinates.length < 2) {
    return { segments: [], summary: null, censusTracts: [] }
  }

  console.log('🛣️ Analyzing route character with Census data...')
  
  // Fetch census corridor data (one-time API call)
  const { tracts: censusTracts, success } = await fetchCensusCorridorData(coordinates)

  // Sample points along route
  const samplePoints = sampleRoute(coordinates, 300)
  console.log(`  Sampled ${samplePoints.length} points`)

  // Fetch road info for each sample point (parallel)
  const pointData = await Promise.all(
    samplePoints.map(async (point) => {
      const roadInfo = await fetchRoadInfo(point.coord)
      const zoneInfo = success 
        ? getZoneAtPosition(point.coord, censusTracts, roadInfo)
        : classifyByRoadInfo(roadInfo)
      
      return {
        ...point,
        ...roadInfo,
        ...zoneInfo
      }
    })
  )

  // Add curve density metrics
  const pointsWithCurveDensity = addCurveDensity(pointData, curves)

  // Final classification considering all factors
  const classifiedPoints = pointsWithCurveDensity.map(point => ({
    ...point,
    character: finalClassifyPoint(point)
  }))

  // Segment into contiguous character zones
  const segments = segmentByCharacter(classifiedPoints, coordinates)
  
  // Generate summary
  const summary = generateSummary(segments, coordinates)

  console.log(`  Found ${segments.length} segments:`, 
    segments.map(s => `${s.character}(${((s.endDistance - s.startDistance)/1609).toFixed(1)}mi)`).join(' → '))

  return { segments, summary, censusTracts }
}

/**
 * Final classification considering census density + road characteristics + curves
 */
function finalClassifyPoint(point) {
  const { densityCategory, roadInfo, roadClass, speedLimit, curveDensity, curveAvgSeverity, curveMaxSeverity } = point
  
  // CRITICAL: Sharp curves (severity 4+) CANNOT be on a highway
  // No highway in the world has a 90 degree turn
  // This overrides all other classification
  if (curveMaxSeverity >= 4) {
    console.log(`  🚨 Sharp curve detected (severity ${curveMaxSeverity}) - NOT highway`)
    // If there's a sharp curve, classify based on density
    if (densityCategory === 'urban') {
      return ROUTE_CHARACTER.URBAN
    }
    if (densityCategory === 'rural' || curveDensity >= 2) {
      return ROUTE_CHARACTER.TECHNICAL
    }
    return ROUTE_CHARACTER.SPIRITED
  }
  
  // Highway classification: only if no sharp curves
  const isHighway = ['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(roadClass)
  if (isHighway || speedLimit >= 55) {
    // But if highway has lots of curves (mountain road), bump to SPIRITED
    if (curveDensity >= 3) {
      return ROUTE_CHARACTER.SPIRITED
    }
    return ROUTE_CHARACTER.TRANSIT
  }

  // TECHNICAL: Rural/low-density areas = the fun twisty roads
  if (densityCategory === 'rural') {
    // Rural areas default to TECHNICAL (like Weston, Concord, etc.)
    return ROUTE_CHARACTER.TECHNICAL
  }

  // Suburban with good curves could upgrade to TECHNICAL
  if (densityCategory === 'suburban') {
    if (curveDensity >= 3 && (curveAvgSeverity || 0) >= 3) {
      return ROUTE_CHARACTER.TECHNICAL
    }
    return ROUTE_CHARACTER.SPIRITED
  }

  // Urban density = URBAN (unless highway, handled above)
  if (densityCategory === 'urban') {
    return ROUTE_CHARACTER.URBAN
  }

  // Fallback to SPIRITED
  return point.character || ROUTE_CHARACTER.SPIRITED
}

// ================================
// ROAD INFO (unchanged from v2)
// ================================

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
      
      let speedLimit = props.maxspeed
      if (typeof speedLimit === 'string') {
        speedLimit = parseInt(speedLimit.replace(/[^0-9]/g, '')) || 35
      }
      if (!speedLimit || speedLimit < 5 || speedLimit > 85) {
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

// ================================
// GEOMETRY HELPERS
// ================================

/**
 * Point-in-polygon test for GeoJSON geometry
 */
function pointInPolygon(point, geometry) {
  if (!geometry) return false
  
  const [lng, lat] = point
  
  // Handle both Polygon and MultiPolygon
  const polygons = geometry.type === 'MultiPolygon' 
    ? geometry.coordinates 
    : [geometry.coordinates]
  
  for (const polygon of polygons) {
    // First ring is exterior, rest are holes
    const exterior = polygon[0]
    if (isPointInRing(lng, lat, exterior)) {
      // Check if inside any hole
      let inHole = false
      for (let i = 1; i < polygon.length; i++) {
        if (isPointInRing(lng, lat, polygon[i])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  
  return false
}

/**
 * Ray casting algorithm for point in ring
 */
function isPointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    
    if (intersect) inside = !inside
  }
  return inside
}

// ================================
// SEGMENTATION HELPERS
// ================================

function addCurveDensity(points, curves) {
  if (!curves?.length) {
    return points.map(p => ({ ...p, curveDensity: 0, curveAvgSeverity: 0 }))
  }

  return points.map(point => {
    const windowStart = point.distance - 804
    const windowEnd = point.distance + 804
    
    const nearbyCurves = curves.filter(c => {
      const curveDist = c.distanceFromStart || 0
      return curveDist >= windowStart && curveDist <= windowEnd
    })
    
    const curveDensity = nearbyCurves.length
    const curveAvgSeverity = nearbyCurves.length > 0
      ? nearbyCurves.reduce((sum, c) => sum + c.severity, 0) / nearbyCurves.length
      : 0
    
    // Track max severity - critical for highway override
    const curveMaxSeverity = nearbyCurves.length > 0
      ? Math.max(...nearbyCurves.map(c => c.severity))
      : 0
    
    return { ...point, curveDensity, curveAvgSeverity, curveMaxSeverity }
  })
}

function segmentByCharacter(classifiedPoints, fullCoordinates) {
  if (!classifiedPoints?.length) return []

  const segments = []
  let currentSegment = null

  classifiedPoints.forEach((point, i) => {
    if (!currentSegment || currentSegment.character !== point.character) {
      if (currentSegment) {
        currentSegment.endIndex = point.index
        currentSegment.endDistance = point.distance
        currentSegment.coordinates = fullCoordinates.slice(
          currentSegment.startIndex, 
          Math.min(point.index + 1, fullCoordinates.length)
        )
        segments.push(currentSegment)
      }
      
      currentSegment = {
        id: `seg-${segments.length}`,
        character: point.character,
        startIndex: point.index,
        startDistance: point.distance,
        behavior: CHARACTER_BEHAVIORS[point.character],
        details: {
          avgSpeedLimit: point.speedLimit,
          density: point.density,
          densityCategory: point.densityCategory,
          avgCurveDensity: point.curveDensity
        }
      }
    } else {
      // Update running averages
      const count = i - classifiedPoints.findIndex(p => p.index === currentSegment.startIndex) + 1
      currentSegment.details.avgSpeedLimit = 
        (currentSegment.details.avgSpeedLimit * (count - 1) + point.speedLimit) / count
      currentSegment.details.avgCurveDensity = 
        (currentSegment.details.avgCurveDensity * (count - 1) + point.curveDensity) / count
    }
  })

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

  return mergeShortSegments(segments, 500)
}

function mergeShortSegments(segments, minLengthMeters) {
  if (segments.length <= 1) return segments

  const merged = []
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const segLength = seg.endDistance - seg.startDistance
    
    if (segLength < minLengthMeters && merged.length > 0) {
      const prev = merged[merged.length - 1]
      prev.endIndex = seg.endIndex
      prev.endDistance = seg.endDistance
      prev.coordinates = [...prev.coordinates, ...seg.coordinates.slice(1)]
    } else if (segLength < minLengthMeters && i < segments.length - 1) {
      segments[i + 1].startIndex = seg.startIndex
      segments[i + 1].startDistance = seg.startDistance
      segments[i + 1].coordinates = [...seg.coordinates, ...segments[i + 1].coordinates.slice(1)]
    } else {
      merged.push(seg)
    }
  }

  return merged
}

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

// ================================
// HELPER FUNCTIONS
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
    'motorway': 65, 'motorway_link': 45,
    'trunk': 55, 'trunk_link': 40,
    'primary': 45, 'primary_link': 35,
    'secondary': 40, 'secondary_link': 30,
    'tertiary': 35, 'tertiary_link': 25,
    'residential': 25, 'service': 20,
    'living_street': 15, 'unclassified': 35
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

// ================================
// PUBLIC API
// ================================

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

export function shouldAnnounceCurve(segments, curve) {
  const behavior = getBehaviorForCurve(segments, curve)
  return curve.severity >= behavior.minSeverity
}

export default {
  analyzeRouteCharacter,
  fetchCensusCorridorData,
  getZoneAtPosition,
  getBehaviorForCurve,
  shouldAnnounceCurve,
  ROUTE_CHARACTER,
  CHARACTER_COLORS,
  CHARACTER_BEHAVIORS
}
