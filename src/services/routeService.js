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
    // Example: ?saddr=42.3528913,-71.0756559&daddr=Campion+Center+to:42.123,-71.456+to:Place2
    const saddrMatch = decodedUrl.match(/[?&]saddr=([^&]+)/)
    const daddrMatch = decodedUrl.match(/[?&]daddr=([^&]+)/)
    
    if (saddrMatch || daddrMatch) {
      console.log('Found saddr/daddr format')
      
      const originStr = saddrMatch ? decodeURIComponent(saddrMatch[1]).replace(/\+/g, ' ') : null
      const daddrStr = daddrMatch ? decodeURIComponent(daddrMatch[1]).replace(/\+/g, ' ') : null
      
      console.log('saddr:', originStr)
      console.log('daddr:', daddrStr)
      
      // Parse all waypoints from daddr (can have "to:" separators)
      const allWaypoints = []
      
      // Add origin first
      if (originStr) {
        const originCoords = parseCoordinateString(originStr)
        if (originCoords) {
          allWaypoints.push({ coords: originCoords, name: null })
        } else {
          allWaypoints.push({ coords: null, name: originStr })
        }
      }
      
      // Parse destinations (split by " to:" pattern)
      if (daddrStr) {
        // Split by "to:" but be careful with spaces
        const destParts = daddrStr.split(/\s+to:/)
        console.log('Destination parts:', destParts)
        
        for (const part of destParts) {
          const trimmed = part.trim()
          if (!trimmed) continue
          
          const coords = parseCoordinateString(trimmed)
          if (coords) {
            allWaypoints.push({ coords, name: null })
          } else {
            allWaypoints.push({ coords: null, name: trimmed })
          }
        }
      }
      
      console.log('All waypoints:', allWaypoints)
      
      // If we have waypoints that need geocoding
      const needsGeocoding = allWaypoints.some(w => w.coords === null)
      const hasCoords = allWaypoints.filter(w => w.coords !== null)
      
      if (allWaypoints.length >= 2) {
        // Check if all have coordinates
        if (!needsGeocoding) {
          return { 
            coordinates: allWaypoints.map(w => w.coords),
            isMultiStop: allWaypoints.length > 2
          }
        }
        
        // Need to geocode some waypoints
        return {
          needsGeocoding: true,
          waypoints: allWaypoints,
          isMultiStop: allWaypoints.length > 2
        }
      }
      
      // Single destination
      if (allWaypoints.length === 1) {
        const wp = allWaypoints[0]
        if (wp.coords) {
          return { coordinates: [wp.coords], needsOrigin: true }
        }
        return { needsGeocoding: true, destination: wp.name }
      }
    }

    // Format 1: /dir/origin/destination (most common from sharing)
    // Example: /dir/42.3528330,-71.0755902/Campion+Center,+319+Concord+Rd,+Weston,+MA+02493
    const dirMatch = decodedUrl.match(/\/dir\/([^/]+)\/([^/@?]+)/)
    if (dirMatch) {
      const originStr = dirMatch[1].replace(/\+/g, ' ')
      const destStr = dirMatch[2].replace(/\+/g, ' ')
      
      console.log('Parsed /dir/ format - Origin:', originStr, 'Dest:', destStr)
      
      const originCoords = parseCoordinateString(originStr)
      const destCoords = parseCoordinateString(destStr)
      
      // Both are coordinates
      if (originCoords && destCoords) {
        console.log('Both are coordinates')
        return { coordinates: [originCoords, destCoords] }
      }
      
      // Origin is coordinates, destination needs geocoding
      if (originCoords && !destCoords) {
        console.log('Origin is coords, dest needs geocoding')
        return {
          originCoordinates: originCoords,
          needsGeocoding: true,
          destination: destStr
        }
      }
      
      // Destination is coordinates, origin needs geocoding
      if (!originCoords && destCoords) {
        console.log('Dest is coords, origin needs geocoding')
        return {
          destinationCoordinates: destCoords,
          needsGeocoding: true,
          origin: originStr
        }
      }
      
      // Both need geocoding
      console.log('Both need geocoding')
      return {
        needsGeocoding: true,
        origin: originStr,
        destination: destStr
      }
    }

    // Format 2: @lat,lng in path (viewing a location)
    const atMatch = decodedUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (atMatch) {
      const lat = parseFloat(atMatch[1])
      const lng = parseFloat(atMatch[2])
      if (isValidCoordinate(lat, lng)) {
        console.log('Found @lat,lng format')
        return { 
          coordinates: [[lng, lat]],
          needsOrigin: true
        }
      }
    }

    // Format 3: !3d and !4d markers (embedded in data parameter)
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
        console.log('Found !3d!4d format with', waypoints.length, 'waypoints')
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
      console.log('Found /place/ format:', placeName)
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
 * Supports: "lat,lng" or "lat, lng" or "lat lng"
 */
function parseCoordinateString(str) {
  if (!str) return null
  
  // Clean up the string
  const cleaned = str.trim()
  
  // Try comma-separated (most common)
  let parts = cleaned.split(',')
  
  // Try space-separated if comma didn't work
  if (parts.length < 2) {
    parts = cleaned.split(/\s+/)
  }
  
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0].trim())
    const lng = parseFloat(parts[1].trim())
    
    if (isValidCoordinate(lat, lng)) {
      return [lng, lat] // Return as [lng, lat] for Mapbox
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
  getRoadAhead
}
