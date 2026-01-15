// ================================
// Urban Detection Service v1.0
// Uses Mapbox place_label + symbolrank to detect urban areas
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Known major cities and their population (for urban classification)
// This is a fallback - we primarily use Mapbox's place type
const MAJOR_CITIES = new Set([
  'boston', 'new york', 'chicago', 'los angeles', 'philadelphia',
  'san francisco', 'seattle', 'denver', 'atlanta', 'miami',
  'washington', 'baltimore', 'pittsburgh', 'cleveland', 'detroit',
  'minneapolis', 'st. louis', 'dallas', 'houston', 'phoenix',
  'san diego', 'portland', 'las vegas', 'austin', 'san antonio',
  // Add MA cities
  'worcester', 'springfield', 'cambridge', 'lowell', 'brockton',
  'new bedford', 'quincy', 'lynn', 'fall river', 'newton',
  'somerville', 'lawrence', 'framingham', 'haverhill', 'waltham'
])

// Medium cities/large towns - suburban classification
const MEDIUM_CITIES = new Set([
  'auburn', 'ludlow', 'amherst', 'northampton', 'westfield',
  'chicopee', 'holyoke', 'agawam', 'palmer', 'ware',
  'natick', 'wellesley', 'needham', 'dedham', 'brookline'
])

/**
 * Query Mapbox Geocoding API for reverse geocoding
 * This gives us the full place hierarchy: neighborhood → city → state
 * 
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude  
 * @returns {Object|null} Place info with city context
 */
async function queryPlaceLabel(lng, lat) {
  // Use reverse geocoding to get place hierarchy
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?` +
    `types=neighborhood,locality,place&` +
    `access_token=${MAPBOX_TOKEN}`
  
  try {
    const response = await fetch(url)
    
    if (!response.ok) {
      console.warn(`🏙️ Geocoding failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    if (!data.features?.length) {
      return null
    }
    
    // Parse the response to extract place hierarchy
    const feature = data.features[0]
    const context = feature.context || []
    
    // Find the city/place from context
    // Context items have ids like "place.123456" or "locality.789"
    let cityName = null
    let neighborhood = null
    let placeType = feature.place_type?.[0] || 'unknown'
    
    // The main feature might be neighborhood, locality, or place
    if (placeType === 'neighborhood') {
      neighborhood = feature.text
      // Look in context for the city
      const placeContext = context.find(c => c.id?.startsWith('place.'))
      const localityContext = context.find(c => c.id?.startsWith('locality.'))
      cityName = placeContext?.text || localityContext?.text || null
    } else if (placeType === 'locality' || placeType === 'place') {
      cityName = feature.text
    }
    
    // Determine urban classification based on city name
    const cityLower = (cityName || '').toLowerCase()
    const isUrban = MAJOR_CITIES.has(cityLower)
    const isSuburban = MEDIUM_CITIES.has(cityLower) || 
                       (cityName && !isUrban && placeType === 'place')
    
    return {
      name: cityName || neighborhood || 'Unknown',
      neighborhood: neighborhood,
      cityName: cityName,
      placeType: placeType,
      isUrban: isUrban,
      isSuburban: isSuburban,
      fullPlaceName: feature.place_name
    }
  } catch (err) {
    console.warn('🏙️ Geocoding error:', err.message)
    return null
  }
}

/**
 * Classify urban density based on place info from geocoding
 * 
 * @param {Object} placeInfo - Place info from queryPlaceLabel
 * @returns {string} 'urban', 'suburban', or 'rural'
 */
function classifyDensity(placeInfo) {
  if (!placeInfo) return 'rural'
  
  // Use the flags we set during geocoding
  if (placeInfo.isUrban) return 'urban'
  if (placeInfo.isSuburban) return 'suburban'
  
  return 'rural'
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
    
    const density = classifyDensity(place)
    
    results.push({
      mile: sample.mile,
      place: place?.cityName || place?.name || null,
      neighborhood: place?.neighborhood || null,
      density: density,
      fullPlaceName: place?.fullPlaceName || null
    })
    
    // Rate limiting - 50ms delay between requests
    if (i < samples.length - 1) {
      await new Promise(r => setTimeout(r, 50))
    }
  }
  
  // Log sample results - show city and neighborhood context
  console.log(`   Sample results:`)
  results.forEach(r => {
    const icon = r.density === 'urban' ? '🏙️' : r.density === 'suburban' ? '🏘️' : '🌲'
    const cityInfo = r.place || ''
    const neighborhoodInfo = r.neighborhood ? ` [${r.neighborhood}]` : ''
    console.log(`      Mile ${r.mile.toFixed(1)}: ${icon} ${r.density.toUpperCase()} - ${cityInfo}${neighborhoodInfo}`)
  })
  
  // Consolidate consecutive samples with same density into sections
  const sections = []
  let currentSection = { 
    startMile: 0, 
    density: results[0]?.density || 'rural',
    placeName: results[0]?.place,
    neighborhood: results[0]?.neighborhood
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
        neighborhood: results[i].neighborhood
      }
    } else if (results[i].place && !currentSection.placeName) {
      // Update place name if we found one
      currentSection.placeName = results[i].place
      currentSection.neighborhood = results[i].neighborhood
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
    const placeInfo = s.placeName ? ` - ${s.placeName}` : ''
    console.log(`      ${i + 1}. ${icon} ${s.density.toUpperCase()} (${s.startMile.toFixed(1)}-${s.endMile.toFixed(1)}mi, ${length}mi)${placeInfo}`)
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
    
    // Get zone bounds in MILES (zones may have startMile/endMile or just start/end in meters)
    const zoneStartMile = zone.startMile ?? (zone.start / 1609.34)
    const zoneEndMile = zone.endMile ?? (zone.end / 1609.34)
    const zoneMidpointMile = (zoneStartMile + zoneEndMile) / 2
    
    // Debug: Log what we're comparing
    console.log(`   Checking zone ${zoneStartMile.toFixed(1)}-${zoneEndMile.toFixed(1)}mi (midpoint: ${zoneMidpointMile.toFixed(2)}mi)`)
    
    // Find urban section that contains this zone's midpoint
    const urbanSection = urbanSections.find(u => 
      zoneMidpointMile >= u.startMile && zoneMidpointMile < u.endMile
    )
    
    if (urbanSection) {
      console.log(`      Found urban section: ${urbanSection.startMile.toFixed(1)}-${urbanSection.endMile.toFixed(1)}mi (${urbanSection.density}) - ${urbanSection.placeName || 'unknown'}`)
    }
    
    if (urbanSection?.density === 'urban') {
      console.log(`   ✓ Mile ${zoneStartMile.toFixed(1)}-${zoneEndMile.toFixed(1)}: TECHNICAL → URBAN (in ${urbanSection.placeName || 'urban area'})`)
      result.push({ 
        ...zone, 
        character: 'urban',
        urbanPlace: urbanSection.placeName,
        urbanNeighborhood: urbanSection.neighborhood
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
 * @returns {Promise<Object>} { isUrban, density, placeName, neighborhood }
 */
export async function isPointUrban(lng, lat) {
  const place = await queryPlaceLabel(lng, lat)
  
  if (!place) {
    return { isUrban: false, density: 'rural', placeName: null, neighborhood: null }
  }
  
  const density = classifyDensity(place)
  
  return {
    isUrban: density === 'urban',
    density,
    placeName: place.cityName || place.name,
    neighborhood: place.neighborhood
  }
}

// Export city lists for reference/extension
export const CITIES = {
  MAJOR: MAJOR_CITIES,
  MEDIUM: MEDIUM_CITIES
}
