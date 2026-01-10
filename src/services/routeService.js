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
 */
export function parseGoogleMapsUrl(url) {
  if (!url) return null

  try {
    // Handle different Google Maps URL formats
    
    // Format 1: https://www.google.com/maps/dir/origin/destination/@lat,lng,zoom
    // Format 2: https://goo.gl/maps/xxxxx (short URL)
    // Format 3: https://www.google.com/maps?q=lat,lng
    // Format 4: https://www.google.com/maps/place/.../@lat,lng,zoom

    const waypoints = []

    // Try to extract coordinates from URL
    // Pattern for @lat,lng
    const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/g
    let match
    while ((match = atPattern.exec(url)) !== null) {
      const lat = parseFloat(match[1])
      const lng = parseFloat(match[2])
      if (lat && lng && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        waypoints.push([lng, lat])
      }
    }

    // Pattern for /dir/lat,lng/lat,lng
    const dirPattern = /\/dir\/([^/]+)\/([^/@]+)/
    const dirMatch = url.match(dirPattern)
    if (dirMatch) {
      // These might be place names or coordinates
      // For now, we'll need to geocode them
      return {
        needsGeocoding: true,
        origin: dirMatch[1],
        destination: dirMatch[2]
      }
    }

    if (waypoints.length >= 1) {
      return { coordinates: waypoints }
    }

    // If we can't parse it, return the URL for manual handling
    return { 
      needsGeocoding: true, 
      rawUrl: url 
    }
  } catch (error) {
    console.error('Error parsing Google Maps URL:', error)
    return null
  }
}

/**
 * Get road geometry for look-ahead mode
 * This gets the road network around a point
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
  const bearing = bearingDeg * Math.PI / 180
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
