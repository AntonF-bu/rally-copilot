/**
 * Shared route geometry utilities
 * Used by both RoutePreview and Navigation for consistent rendering
 */

/**
 * Calculate Haversine distance between two coordinates
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Build cumulative distances for route coordinates
 * @param {Array} coordinates - [[lng, lat], ...]
 * @returns {Array} Cumulative distances in meters
 */
export function buildCumulativeDistances(coordinates) {
  const distances = [0]

  for (let i = 1; i < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i - 1]
    const [lng2, lat2] = coordinates[i]
    const segmentDist = haversineDistance(lat1, lng1, lat2, lng2)
    distances.push(distances[i - 1] + segmentDist)
  }

  return distances
}

/**
 * Find coordinate index at a specific distance along route
 * @param {Array} cumulativeDistances
 * @param {number} targetDistance - in meters
 * @returns {number} Index into coordinates array
 */
export function findCoordIndexAtDistance(cumulativeDistances, targetDistance) {
  for (let i = 0; i < cumulativeDistances.length; i++) {
    if (cumulativeDistances[i] >= targetDistance) {
      return Math.max(0, i - 1)
    }
  }
  return cumulativeDistances.length - 1
}

/**
 * Build zone-colored segments from route coordinates and zones
 * This is the SINGLE SOURCE OF TRUTH for zone segment building
 *
 * @param {Array} coordinates - Route coordinates [[lng, lat], ...]
 * @param {Array} zones - Zone segments with startDistance, endDistance, character
 * @param {number} totalDistance - Total route distance in meters
 * @param {Object} zoneColors - Color map { technical: '#xxx', transit: '#xxx', urban: '#xxx' }
 * @returns {Array} Segments with { coordinates, color }
 */
export function buildZoneSegments(coordinates, zones, totalDistance, zoneColors) {
  if (!coordinates?.length || !zones?.length) {
    return [{
      coordinates,
      color: zoneColors.technical || '#22d3ee'
    }]
  }

  // Build cumulative distances using Haversine (accurate)
  const cumulativeDistances = buildCumulativeDistances(coordinates)
  const calculatedTotal = cumulativeDistances[cumulativeDistances.length - 1]

  // Scale factor to match route's known distance
  const scaleFactor = calculatedTotal > 0 ? (totalDistance || calculatedTotal) / calculatedTotal : 1

  const segments = []

  // Sort zones by start distance
  const sortedZones = [...zones].sort((a, b) =>
    (a.startDistance || 0) - (b.startDistance || 0)
  )

  for (const zone of sortedZones) {
    const startDist = zone.startDistance ?? (zone.start * 1609.34) ?? 0
    const endDist = zone.endDistance ?? (zone.end * 1609.34) ?? totalDistance
    const color = zoneColors[zone.character] || zoneColors.technical

    // Scale target distances
    const scaledStart = startDist / scaleFactor
    const scaledEnd = endDist / scaleFactor

    // Find coordinate indices
    const startIdx = findCoordIndexAtDistance(cumulativeDistances, scaledStart)
    const endIdx = findCoordIndexAtDistance(cumulativeDistances, scaledEnd)

    // Extract segment coordinates
    if (endIdx > startIdx) {
      const segmentCoords = coordinates.slice(startIdx, endIdx + 1)
      if (segmentCoords.length >= 2) {
        segments.push({
          coordinates: segmentCoords,
          color,
          character: zone.character
        })
      }
    }
  }

  // Fallback if no segments created
  if (segments.length === 0) {
    return [{
      coordinates,
      color: zoneColors.technical || '#22d3ee'
    }]
  }

  return segments
}
