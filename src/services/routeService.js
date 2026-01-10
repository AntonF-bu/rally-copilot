// ================================
// Route Service
// Handles Mapbox API calls
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
        coordinates: f.center, // [lng, lat]
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
 */
export async function getRoute(start, end) {
  if (!start || !end || !MAPBOX_TOKEN) return null

  try {
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance, // meters
        duration: route.duration, // seconds
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
 */
export async function getRouteWithWaypoints(waypoints) {
  if (!waypoints || waypoints.length < 2 || !MAPBOX_TOKEN) return null

  try {
    const coords = waypoints.map(w => `${w[0]},${w[1]}`).join(';')
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
    )
    const data = await response.json()
    
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0]
      return {
        coordinates: route.geometry.coordinates,
        distance: route.distance,
        duration: route.duration,
      }
    }
    return null
  } catch (error) {
    console.error('Routing error:', error)
    return null
  }
}

/**
 * Parse Google Maps URL and extract waypoints
 * Supports multiple URL formats
 */
export function parseGoogleMapsUrl(url) {
  if (!url) return null

  try {
    console.log('Parsing Google Maps URL:', url)
    
    const waypoints = []

    // Decode URL if needed
    const decodedUrl = decodeURIComponent(url)

    // Format 1: Standard directions URL with /dir/
    // https://www.google.com/maps/dir/origin/destination/
    // https://www.google.com/maps/dir/42.3601,-71.0589/42.3501,-71.0789/
    const dirMatch = decodedUrl.match(/\/dir\/([^/]+)\/([^/@]+)/)
    if (dirMatch) {
      const origin = dirMatch[1]
      const dest = dirMatch[2]
      
      // Check if they're coordinates
      const originCoords = parseCoordinateString(origin)
      const destCoords = parseCoordinateString(dest)
      
      if (originCoords && destCoords) {
        return { coordinates: [originCoords, destCoords] }
      }
      
      // They're place names, need geocoding
      return {
        needsGeocoding: true,
        origin: origin.replace(/\+/g, ' '),
        destination: dest.replace(/\+/g, ' ')
      }
    }

    // Format 2: URL with @lat,lng in the path
    // https://www.google.com/maps/@42.3601,-71.0589,15z
    const atMatches = decodedUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/g)
    if (atMatches) {
      for (const match of atMatches) {
        const coords = match.replace('@', '').split(',')
        const lat = parseFloat(coords[0])
        const lng = parseFloat(coords[1])
        if (isValidCoordinate(lat, lng)) {
          waypoints.push([lng, lat])
        }
      }
    }

    // Format 3: URL with !3d and !4d markers (common in shared links)
    // ...!3d42.3601!4d-71.0589...
    const dMatches = decodedUrl.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g)
    if (dMatches) {
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
    }

    // Format 4: Place URL
    // https://www.google.com/maps/place/Boston,+MA/
    const placeMatch = decodedUrl.match(/\/place\/([^/@]+)/)
    if (placeMatch && waypoints.length === 0) {
      return {
        needsGeocoding: true,
        destination: placeMatch[1].replace(/\+/g, ' ')
      }
    }

    // Format 5: Query parameter
    // https://www.google.com/maps?q=42.3601,-71.0589
    const qMatch = decodedUrl.match(/[?&]q=([^&]+)/)
    if (qMatch) {
      const qValue = qMatch[1]
      const coords = parseCoordinateString(qValue)
      if (coords) {
        waypoints.push(coords)
      } else {
        return {
          needsGeocoding: true,
          destination: qValue.replace(/\+/g, ' ')
        }
      }
    }

    // Format 6: Destination parameter
    // https://www.google.com/maps/dir/?api=1&destination=lat,lng
    const destParam = decodedUrl.match(/destination=([^&]+)/)
    if (destParam) {
      const destValue = destParam[1]
      const coords = parseCoordinateString(destValue)
      if (coords) {
        waypoints.push(coords)
      } else {
        return {
          needsGeocoding: true,
          destination: destValue.replace(/\+/g, ' ')
        }
      }
    }

    // Format 7: Origin parameter
    const originParam = decodedUrl.match(/origin=([^&]+)/)
    if (originParam) {
      const originValue = originParam[1]
      const coords = parseCoordinateString(originValue)
      if (coords) {
        waypoints.unshift(coords) // Add to beginning
      }
    }

    console.log('Parsed waypoints:', waypoints)

    if (waypoints.length >= 2) {
      return { coordinates: waypoints }
    }

    if (waypoints.length === 1) {
      // Only have destination, will use current location as origin
      return { 
        coordinates: waypoints,
        needsOrigin: true
      }
    }

    // If we couldn't parse anything useful
    console.warn('Could not parse coordinates from URL')
    return null

  } catch (error) {
    console.error('Error parsing Google Maps URL:', error)
    return null
  }
}

/**
 * Parse a string that might contain coordinates
 */
function parseCoordinateString(str) {
  if (!str) return null
  
  // Try "lat,lng" format
  const parts = str.split(',')
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0])
    const lng = parseFloat(parts[1])
    if (isValidCoordinate(lat, lng)) {
      return [lng, lat] // Return as [lng, lat] for Mapbox
    }
  }
  
  return null
}

/**
 * Check if coordinates are valid
 */
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
    // Calculate a point ahead in the direction of travel
    const aheadPoint = getPointAtDistance(position, heading, distance)
    
    // Get route from current position to point ahead
    const route = await getRoute(position, aheadPoint)
    return route
  } catch (error) {
    console.error('Look-ahead error:', error)
    return null
  }
}

/**
 * Calculate a point at a given distance and bearing from start
 */
function getPointAtDistance(start, bearingDeg, distanceM) {
  const R = 6371e3 // Earth radius in meters
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
  getRoadAhead
}
