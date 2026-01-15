// ================================
// Urban Detection Service v1.0
// Uses Mapbox place_label + symbolrank to detect urban areas
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Symbolrank thresholds (lower = bigger city)
// 1-4 = major metros (Boston, NYC, Chicago, etc.)
// 5-8 = large cities (Worcester, Springfield, etc.)
// 9-12 = medium cities/large towns
// 13-15 = small towns
// 16-19 = neighborhoods/hamlets (Back Bay, Fenway, etc.)
const URBAN_THRESHOLD = 8       // symbolrank <= 8 = urban (cities)
const SUBURBAN_THRESHOLD = 12   // symbolrank 9-12 = suburban (towns)
// Note: 13+ are neighborhoods/hamlets - we need to look PAST these to find the city

/**
 * Query Mapbox Vector Tiles for nearby place labels
 * Uses a LARGE radius to find city-level labels (not just neighborhoods)
 * 
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude  
 * @param {number} radiusKm - Search radius in kilometers (default 15km to catch cities)
 * @returns {Object|null} Most significant place found, or null
 */
async function queryPlaceLabel(lng, lat, radiusKm = 15) {
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json?` +
    `layers=place_label&` +
    `radius=${radiusKm * 1000}&` +
    `limit=50&` +  // Get more results to find city-level labels
    `access_token=${MAPBOX_TOKEN}`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      console.warn(`🏙️ Place query failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    if (!data.features?.length) {
      return null
    }
    
    // Filter to only place labels with symbolrank
    const places = data.features
      .filter(f => f.properties?.symbolrank !== undefined)
    
    if (!places.length) {
      return null
    }
    
    // Find the most significant place (lowest symbolrank)
    // This should give us cities over neighborhoods
    const sortedByRank = [...places].sort((a, b) => 
      a.properties.symbolrank - b.properties.symbolrank
    )
    
    const best = sortedByRank[0]
    
    // Also find the nearest place for context
    const sortedByDistance = [...places].sort((a, b) => 
      (a.properties.tilequery?.distance || 0) - (b.properties.tilequery?.distance || 0)
    )
    const nearest = sortedByDistance[0]
    
    // Log what we found for debugging
    const cityLevel = sortedByRank.filter(p => p.properties.symbolrank <= 8)
    if (cityLevel.length > 0) {
      console.log(`      Found city: ${cityLevel[0].properties.name} (rank ${cityLevel[0].properties.symbolrank})`)
    }
    
    return {
      name: best.properties.name || 'Unknown',
      symbolrank: best.properties.symbolrank,
      type: best.properties.type || 'place',
      distance: best.properties.tilequery?.distance || 0,
      filterrank: best.properties.filterrank,
      // Also include nearest for context
      nearestName: nearest?.properties?.name,
      nearestRank: nearest?.properties?.symbolrank
    }
  } catch (err) {
    console.warn('🏙️ Place label query error:', err.message)
    return null
  }
}

/**
 * Classify urban density based on symbolrank
 * 
 * KEY INSIGHT: Mapbox symbolrank correlates with city SIZE, not density.
 * - rank 1-4: Major metros (Boston, NYC) → URBAN
 * - rank 5-8: Large cities (Worcester, Springfield) → URBAN  
 * - rank 9-12: Medium towns (Auburn, Ludlow) → SUBURBAN
 * - rank 13+: Small towns, neighborhoods → RURAL (for our purposes)
 * 
 * @param {number} symbolrank - Mapbox symbolrank (1-19)
 * @returns {string} 'urban', 'suburban', or 'rural'
 */
function classifyDensity(symbolrank) {
  if (symbolrank === null || symbolrank === undefined) return 'rural'
  if (symbolrank <= URBAN_THRESHOLD) return 'urban'      // Cities (rank 1-8)
  if (symbolrank <= SUBURBAN_THRESHOLD) return 'suburban' // Towns (rank 9-12)
  return 'rural'  // Neighborhoods/hamlets (rank 13+)
}

/**
 * Calculate cumulative distances for route coordinates
 * (Same as in buildSleeveSegments for accuracy)
 * @param {Array} coordinates - Route coordinates [[lng, lat], ...]
 * @returns {Array} Cumulative distance at each coordinate in meters
 */
function calculateCumulativeDistances(coordinates) {
  const distances = [0]
  
  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1]
    const [lng2, lat2] = coordinates[i]
    
    // Haversine distance
    const R = 6371000 // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    const dist = R * c
    
    distances.push(distances[i-1] + dist)
  }
  
  return distances
}

/**
 * Find coordinate index at a specific distance along the route
 * @param {Array} cumulativeDistances - Cumulative distances array
 * @param {number} targetDistance - Target distance in meters
 * @returns {number} Coordinate index
 */
function findCoordIndexAtDistance(cumulativeDistances, targetDistance) {
  for (let i = 0; i < cumulativeDistances.length; i++) {
    if (cumulativeDistances[i] >= targetDistance) {
      return Math.max(0, i - 1)
    }
  }
  return cumulativeDistances.length - 1
}

/**
 * Detect urban sections along a route using Mapbox place labels
 * 
 * @param {Array} coordinates - Route coordinates [[lng, lat], ...]
 * @param {number} totalDistance - Total route distance in meters
 * @param {number} sampleIntervalMiles - How often to sample (default 1 mile for accuracy)
 * @returns {Promise<Array>} Array of { startMile, endMile, density, placeName, symbolrank }
 */
export async function detectUrbanSections(coordinates, totalDistance, sampleIntervalMiles = 1) {
  const totalMiles = totalDistance / 1609.34
  const numSamples = Math.ceil(totalMiles / sampleIntervalMiles) + 1
  
  console.log(`\n🏙️ Urban Detection Service v1.0`)
  console.log(`   Route: ${totalMiles.toFixed(1)} miles`)
  console.log(`   Sampling every ${sampleIntervalMiles} mile(s) = ${numSamples} samples`)
  
  // Calculate cumulative distances for accurate coordinate lookup
  const cumulativeDistances = calculateCumulativeDistances(coordinates)
  const calculatedTotal = cumulativeDistances[cumulativeDistances.length - 1]
  
  // Build sample points
  const samples = []
  for (let i = 0; i < numSamples; i++) {
    const mile = Math.min(i * sampleIntervalMiles, totalMiles)
    const targetDistance = mile * 1609.34
    
    // Scale if there's a distance mismatch
    const scaledTarget = targetDistance * (calculatedTotal / totalDistance)
    const coordIndex = findCoordIndexAtDistance(cumulativeDistances, scaledTarget)
    const coord = coordinates[coordIndex]
    
    samples.push({ mile, coord, coordIndex })
  }
  
  // Query place labels for each sample
  console.log(`   Querying Mapbox place labels...`)
  const results = []
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    const place = await queryPlaceLabel(sample.coord[0], sample.coord[1])
    
    results.push({
      mile: sample.mile,
      place: place?.name || null,
      symbolrank: place?.symbolrank ?? 99,
      density: place ? classifyDensity(place.symbolrank) : 'rural',
      nearestName: place?.nearestName || null,
      nearestRank: place?.nearestRank || null
    })
    
    // Rate limiting - 50ms delay between requests
    if (i < samples.length - 1) {
      await new Promise(r => setTimeout(r, 50))
    }
  }
  
  // Log sample results - show both city-level and neighborhood
  console.log(`   Sample results:`)
  results.forEach(r => {
    const icon = r.density === 'urban' ? '🏙️' : r.density === 'suburban' ? '🏘️' : '🌲'
    const cityInfo = r.place ? `${r.place} (rank ${r.symbolrank})` : ''
    const neighborhoodInfo = r.nearestName && r.nearestName !== r.place 
      ? ` [near ${r.nearestName}]` 
      : ''
    console.log(`      Mile ${r.mile.toFixed(1)}: ${icon} ${r.density}${cityInfo ? ` - ${cityInfo}` : ''}${neighborhoodInfo}`)
  })
  
  // Consolidate consecutive samples with same density into sections
  const sections = []
  let currentSection = { 
    startMile: 0, 
    density: results[0]?.density || 'rural',
    placeName: results[0]?.place,
    symbolrank: results[0]?.symbolrank
  }
  
  for (let i = 1; i < results.length; i++) {
    const prevDensity = currentSection.density
    const currDensity = results[i].density
    
    // Check if density changed
    if (currDensity !== prevDensity) {
      // End current section
      currentSection.endMile = results[i].mile
      sections.push(currentSection)
      
      // Start new section
      currentSection = {
        startMile: results[i].mile,
        density: currDensity,
        placeName: results[i].place,
        symbolrank: results[i].symbolrank
      }
    } else if (results[i].place && !currentSection.placeName) {
      // Update place name if we found one
      currentSection.placeName = results[i].place
      currentSection.symbolrank = results[i].symbolrank
    }
  }
  
  // Close final section
  currentSection.endMile = totalMiles
  sections.push(currentSection)
  
  // Log consolidated sections
  console.log(`   Consolidated sections:`)
  sections.forEach((s, i) => {
    const icon = s.density === 'urban' ? '🏙️' : s.density === 'suburban' ? '🏘️' : '🌲'
    const length = (s.endMile - s.startMile).toFixed(1)
    console.log(`      ${i + 1}. ${icon} ${s.density.toUpperCase()} (${s.startMile.toFixed(1)}-${s.endMile.toFixed(1)}mi, ${length}mi)${s.placeName ? ` near ${s.placeName}` : ''}`)
  })
  
  return sections
}

/**
 * Apply urban overlay to zones - converts TECHNICAL → URBAN where appropriate
 * 
 * RULES:
 * - Only TECHNICAL zones can become URBAN
 * - TRANSIT (highway) zones are NEVER changed (highway is highway regardless of location)
 * - A technical zone becomes urban if it's in an urban-density area
 * 
 * @param {Array} zones - Zones from classifyByRoadName: [{ start, end, character, roadName }, ...]
 * @param {Array} urbanSections - From detectUrbanSections: [{ startMile, endMile, density, placeName }, ...]
 * @returns {Array} Updated zones with urban classification applied
 */
export function applyUrbanOverlay(zones, urbanSections) {
  console.log(`\n🏙️ Applying urban overlay to ${zones.length} zones...`)
  
  const result = []
  let changesCount = 0
  
  for (const zone of zones) {
    // RULE: Only technical zones can become urban
    if (zone.character !== 'technical') {
      result.push(zone)
      continue
    }
    
    // Check urban density at zone midpoint
    const zoneMidpoint = (zone.start + zone.end) / 2
    const urbanSection = urbanSections.find(u => 
      zoneMidpoint >= u.startMile && zoneMidpoint < u.endMile
    )
    
    if (urbanSection?.density === 'urban') {
      console.log(`   ✓ Mile ${zone.start.toFixed(1)}-${zone.end.toFixed(1)}: TECHNICAL → URBAN (${urbanSection.placeName || 'urban area'}, rank ${urbanSection.symbolrank})`)
      result.push({ 
        ...zone, 
        character: 'urban',
        urbanPlace: urbanSection.placeName,
        urbanRank: urbanSection.symbolrank
      })
      changesCount++
    } else {
      result.push(zone)
    }
  }
  
  if (changesCount === 0) {
    console.log(`   No changes - no technical zones in urban areas`)
  } else {
    console.log(`   Applied ${changesCount} urban override(s)`)
  }
  
  return result
}

/**
 * Quick check if a single point is in an urban area
 * Useful for spot-checking without full route analysis
 * 
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @returns {Promise<Object>} { isUrban, density, placeName, symbolrank }
 */
export async function isPointUrban(lng, lat) {
  const place = await queryPlaceLabel(lng, lat)
  
  if (!place) {
    return { isUrban: false, density: 'rural', placeName: null, symbolrank: null }
  }
  
  const density = classifyDensity(place.symbolrank)
  
  return {
    isUrban: density === 'urban',
    density,
    placeName: place.name,
    symbolrank: place.symbolrank
  }
}

// Export thresholds for reference
export const THRESHOLDS = {
  URBAN: URBAN_THRESHOLD,
  SUBURBAN: SUBURBAN_THRESHOLD
}
