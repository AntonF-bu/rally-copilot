// ================================
// Route Service - v2.0
// NOW INCLUDES: steps=true for road ref data
// ================================

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(query) {
  if (!query || !MAPBOX_TOKEN) return null

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
    )
    const data = await response.json()
    
    if (data.features && data.features.length > 0) {
      return data.features.map(f => ({
        name: f.place_name,
        coordinates: f.center,
      }))
    }
    return []
  } catch (error) {
    console.error('Geocoding error:', error)
    return []
  }
}

/**
 * Get route between two points
 * NOW RETURNS: legs with step-by-step road info including refs
 */
export async function getRoute(start, end) {
  if (!start || !end || !MAPBOX_TOKEN) return null

  try {
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`
    // ADDED: steps=true to get road refs (I-90, US-9, etc.)
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        // NEW: Include legs for road ref extraction
        legs: route.legs || [],
      }
    }
    return null
  } catch (error) {
    console.error('Routing error:', error)
    return null
  }
}

/**
 * Get route with multiple waypoints
 * NOW RETURNS: legs with step-by-step road info
 */
export async function getRouteWithWaypoints(waypoints) {
  if (!waypoints || waypoints.length < 2 || !MAPBOX_TOKEN) return null

  try {
    const coords = waypoints.map(w => `${w[0]},${w[1]}`).join(';')
    // ADDED: steps=true to get road refs
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
        // NEW: Include legs for road ref extraction
        legs: route.legs || [],
      }
    }
    return null
  } catch (error) {
    console.error('Routing error:', error)
    return null
  }
}

/**
 * Extract road refs from route legs
 * Maps each step's ref to its mile position along the route
 * 
 * @param {Array} legs - Route legs from Mapbox Directions API
 * @param {number} totalDistanceMeters - Total route distance
 * @returns {Array} Array of { startMile, endMile, ref, name, roadClass }
 */
export function extractRoadRefs(legs, totalDistanceMeters) {
  if (!legs || !legs.length) return []
  
  const roadSegments = []
  let cumulativeDistance = 0
  const totalMiles = totalDistanceMeters / 1609.34
  
  for (const leg of legs) {
    if (!leg.steps) continue
    
    for (const step of leg.steps) {
      const stepDistanceMeters = step.distance || 0
      const startMile = cumulativeDistance / 1609.34
      const endMile = (cumulativeDistance + stepDistanceMeters) / 1609.34
      
      // Extract ref (e.g., "I-90", "US-9", "MA-66")
      const ref = step.ref || null
      const name = step.name || null
      
      // Classify road type from ref
      const roadClass = classifyRoadRef(ref, name)
      
      if (ref || name) {
        roadSegments.push({
          startMile,
          endMile,
          ref,
          name,
          roadClass,
          distance: stepDistanceMeters,
        })
      }
      
      cumulativeDistance += stepDistanceMeters
    }
  }
  
  console.log(`🛣️ Extracted ${roadSegments.length} road segments from ${legs.length} leg(s)`)
  
  // Log sample for debugging
  if (roadSegments.length > 0) {
    console.log('   Sample segments:')
    roadSegments.slice(0, 5).forEach(seg => {
      console.log(`      Mile ${seg.startMile.toFixed(1)}-${seg.endMile.toFixed(1)}: ${seg.ref || seg.name} (${seg.roadClass})`)
    })
  }
  
  return roadSegments
}

/**
 * Classify road type from ref string
 * 
 * @param {string} ref - Road ref (e.g., "I-90", "US-9", "MA-66")
 * @param {string} name - Road name fallback
 * @returns {string} Road class: 'interstate', 'us_highway', 'state_route', 'local', 'unknown'
 */
function classifyRoadRef(ref, name) {
  if (!ref && !name) return 'unknown'
  
  const refUpper = (ref || '').toUpperCase()
  const nameUpper = (name || '').toUpperCase()
  
  // Interstate highways: I-90, I-95, etc.
  if (refUpper.match(/^I-\d+/) || nameUpper.includes('INTERSTATE')) {
    return 'interstate'
  }
  
  // US highways: US-1, US-9, US-20, etc.
  if (refUpper.match(/^US-?\d+/) || nameUpper.includes('US ROUTE') || nameUpper.includes('US HIGHWAY')) {
    return 'us_highway'
  }
  
  // State routes: MA-9, NY-17, etc. (2-letter prefix followed by dash and number)
  if (refUpper.match(/^[A-Z]{2}-?\d+/)) {
    return 'state_route'
  }
  
  // Named routes without ref (often state or county roads)
  if (nameUpper.includes('ROUTE') || nameUpper.includes('HIGHWAY') || nameUpper.includes('PIKE') || nameUpper.includes('TURNPIKE')) {
    return 'state_route'
  }
  
  // Local roads (no ref, or common local road names)
  if (!ref || nameUpper.includes('STREET') || nameUpper.includes('AVENUE') || nameUpper.includes('ROAD') || nameUpper.includes('DRIVE') || nameUpper.includes('LANE')) {
    return 'local'
  }
  
  return 'unknown'
}

/**
 * Get road class at a specific mile position
 * 
 * @param {number} mile - Mile position along route
 * @param {Array} roadSegments - From extractRoadRefs()
 * @returns {object|null} { ref, name, roadClass } or null
 */
export function getRoadAtMile(mile, roadSegments) {
  if (!roadSegments || !roadSegments.length) return null
  
  const segment = roadSegments.find(seg => mile >= seg.startMile && mile < seg.endMile)
  return segment || null
}

/**
 * Expand a shortened Google Maps URL via our API endpoint
 */
export async function expandShortUrl(shortUrl) {
  try {
    const response = await fetch('/api/expand-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: shortUrl })
    })
    
    if (!response.ok) {
      console.error('Failed to expand URL:', response.status)
      return null
    }
    
    const data = await response.json()
    return data.expandedUrl
  } catch (error) {
    console.error('Error expanding URL:', error)
    return null
  }
}

/**
 * Parse Google Maps URL and extract waypoints
 */
export function parseGoogleMapsUrl(url) {
  if (!url) return null

  try {
    console.log('Parsing Google Maps URL:', url)
    
    // Decode URL
    let decodedUrl = url
    try {
      decodedUrl = decodeURIComponent(url)
    } catch (e) {
      // URL might not be encoded
    }
    
    console.log('Decoded URL:', decodedUrl)

    // Format 0: saddr/daddr format (older Google Maps format)
    const saddrMatch = decodedUrl.match(/[?&]saddr=([^&]+)/)
    const daddrMatch = decodedUrl.match(/[?&]daddr=([^&]+)/)
    
    if (saddrMatch || daddrMatch) {
      console.log('Found saddr/daddr format')
      
      const originStr = saddrMatch ? decodeURIComponent(saddrMatch[1]).replace(/\+/g, ' ') : null
      const daddrStr = daddrMatch ? decodeURIComponent(daddrMatch[1]).replace(/\+/g, ' ') : null
      
      // Parse daddr which may have multiple destinations
      if (daddrStr) {
        const destinations = daddrStr.split(' to:').map(d => d.trim())
        const allPoints = originStr ? [originStr, ...destinations] : destinations
        
        const coordinates = []
        const needsGeocoding = []
        
        for (const point of allPoints) {
          const coords = parseCoordinateString(point)
          if (coords) {
            coordinates.push(coords)
          } else {
            needsGeocoding.push(point)
          }
        }
        
        if (coordinates.length >= 2 && needsGeocoding.length === 0) {
          return { coordinates }
        }
        
        if (coordinates.length >= 1) {
          return { 
            coordinates, 
            needsGeocoding: true,
            placesToGeocode: needsGeocoding
          }
        }
        
        return {
          needsGeocoding: true,
          origin: originStr,
          destination: destinations[destinations.length - 1],
          viaPoints: destinations.slice(0, -1)
        }
      }
    }

    // Format 1: /dir/ format
    const dirMatch = decodedUrl.match(/\/dir\/([^/]+)\/([^/@]+)/)
    if (dirMatch) {
      const originStr = dirMatch[1].replace(/\+/g, ' ')
      const destStr = dirMatch[2].replace(/\+/g, ' ')
      
      console.log('Parsed /dir/ format - Origin:', originStr, 'Dest:', destStr)
      
      const originCoords = parseCoordinateString(originStr)
      const destCoords = parseCoordinateString(destStr)
      
      if (originCoords && destCoords) {
        return { coordinates: [originCoords, destCoords] }
      }
      
      if (originCoords && !destCoords) {
        return {
          originCoordinates: originCoords,
          needsGeocoding: true,
          destination: destStr
        }
      }
      
      if (!originCoords && destCoords) {
        return {
          destinationCoordinates: destCoords,
          needsGeocoding: true,
          origin: originStr
        }
      }
      
      return {
        needsGeocoding: true,
        origin: originStr,
        destination: destStr
      }
    }

    // Format 2: @lat,lng in path
    const atMatch = decodedUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (atMatch) {
      const lat = parseFloat(atMatch[1])
      const lng = parseFloat(atMatch[2])
      if (isValidCoordinate(lat, lng)) {
        return { 
          coordinates: [[lng, lat]],
          needsOrigin: true
        }
      }
    }

    // Format 3: !3d and !4d markers
    const dMatches = decodedUrl.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g)
    if (dMatches && dMatches.length > 0) {
      const waypoints = []
      for (const match of dMatches) {
        const parts = match.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/)
        if (parts) {
          const lat = parseFloat(parts[1])
          const lng = parseFloat(parts[2])
          if (isValidCoordinate(lat, lng)) {
            waypoints.push([lng, lat])
          }
        }
      }
      if (waypoints.length >= 2) {
        return { coordinates: waypoints }
      }
      if (waypoints.length === 1) {
        return { coordinates: waypoints, needsOrigin: true }
      }
    }

    // Format 4: /place/ URL
    const placeMatch = decodedUrl.match(/\/place\/([^/@]+)/)
    if (placeMatch) {
      const placeName = placeMatch[1].replace(/\+/g, ' ')
      return {
        needsGeocoding: true,
        destination: placeName
      }
    }

    // Format 5: ?q= parameter
    const qMatch = decodedUrl.match(/[?&]q=([^&]+)/)
    if (qMatch) {
      const qValue = qMatch[1].replace(/\+/g, ' ')
      const coords = parseCoordinateString(qValue)
      if (coords) {
        return { coordinates: [coords], needsOrigin: true }
      }
      return {
        needsGeocoding: true,
        destination: qValue
      }
    }

    // Format 6: destination= parameter
    const destParam = decodedUrl.match(/destination=([^&]+)/)
    if (destParam) {
      const destValue = destParam[1].replace(/\+/g, ' ')
      const coords = parseCoordinateString(destValue)
      if (coords) {
        return { coordinates: [coords], needsOrigin: true }
      }
      return {
        needsGeocoding: true,
        destination: destValue
      }
    }

    console.warn('Could not parse URL with any known format')
    return null

  } catch (error) {
    console.error('Error parsing Google Maps URL:', error)
    return null
  }
}

/**
 * Parse coordinate string in various formats
 */
function parseCoordinateString(str) {
  if (!str) return null
  
  const cleaned = str.trim()
  
  let parts = cleaned.split(',')
  if (parts.length < 2) {
    parts = cleaned.split(/\s+/)
  }
  
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0].trim())
    const lng = parseFloat(parts[1].trim())
    
    if (isValidCoordinate(lat, lng)) {
      return [lng, lat]
    }
  }
  
  return null
}

function isValidCoordinate(lat, lng) {
  return !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180
}

/**
 * Get road geometry for look-ahead mode
 */
export async function getRoadAhead(position, heading, distance = 2000) {
  if (!position || !MAPBOX_TOKEN) return null

  try {
    const aheadPoint = getPointAtDistance(position, heading, distance)
    const route = await getRoute(position, aheadPoint)
    return route
  } catch (error) {
    console.error('Look-ahead error:', error)
    return null
  }
}

function getPointAtDistance(start, bearingDeg, distanceM) {
  const R = 6371e3
  const bearing = (bearingDeg || 0) * Math.PI / 180
  const lat1 = start[1] * Math.PI / 180
  const lon1 = start[0] * Math.PI / 180
  
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
    Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(bearing)
  )
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(distanceM / R) * Math.cos(lat1),
    Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2)
  )
  
  return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI]
}

export default {
  geocodeAddress,
  getRoute,
  getRouteWithWaypoints,
  parseGoogleMapsUrl,
  expandShortUrl,
  getRoadAhead,
  extractRoadRefs,
  getRoadAtMile,
}
