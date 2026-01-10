// ================================
// Curve Detection Algorithm
// Analyzes road geometry to find curves
// ================================

/**
 * Detect curves from an array of coordinates
 * @param {Array} coordinates - Array of [lng, lat] points
 * @returns {Array} - Array of detected curves
 */
export function detectCurves(coordinates) {
  if (!coordinates || coordinates.length < 3) return []

  const curves = []
  let curveId = 1

  // Calculate heading at each point
  const headings = []
  for (let i = 0; i < coordinates.length - 1; i++) {
    headings.push(getBearing(coordinates[i], coordinates[i + 1]))
  }

  // Analyze heading changes to find curves
  let i = 0
  while (i < headings.length - 1) {
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    // If heading change is significant, we're entering a curve
    if (Math.abs(headingChange) > 15) {
      // Find the extent of this curve
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      
      // Keep going while still turning
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        // Same direction turn and still significant
        if (Math.sign(nextChange) === Math.sign(headingChange) && Math.abs(nextChange) > 8) {
          totalHeadingChange += nextChange
          curveEnd++
        } else {
          break
        }
      }

      // Calculate curve properties
      const curveCoords = coordinates.slice(curveStart, curveEnd + 2)
      const curveLength = calculatePathLength(curveCoords)
      const radius = estimateRadius(curveLength, Math.abs(totalHeadingChange))
      const severity = getSeverityFromRadius(radius)
      const direction = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
      
      // Get the apex (middle) of the curve
      const apexIndex = Math.floor((curveStart + curveEnd) / 2)
      const position = coordinates[Math.min(apexIndex, coordinates.length - 1)]

      // Determine modifier
      const modifier = getModifier(totalHeadingChange, severity, curveLength)

      curves.push({
        id: curveId++,
        position,
        direction,
        severity,
        modifier,
        radius: Math.round(radius),
        totalAngle: Math.round(Math.abs(totalHeadingChange)),
        ...getSpeedRecommendations(severity, radius)
      })

      // Skip past this curve
      i = curveEnd + 1
    } else {
      i++
    }
  }

  return curves
}

/**
 * Calculate bearing between two points
 */
function getBearing(from, to) {
  const dLon = (to[0] - from[0]) * Math.PI / 180
  const lat1 = from[1] * Math.PI / 180
  const lat2 = to[1] * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

/**
 * Calculate the heading change between two bearings
 * Returns positive for right turn, negative for left turn
 */
function getHeadingChange(heading1, heading2) {
  let diff = heading2 - heading1
  
  // Normalize to -180 to 180
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  
  return diff
}

/**
 * Calculate path length in meters
 */
function calculatePathLength(coordinates) {
  let length = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    length += getDistance(coordinates[i], coordinates[i + 1])
  }
  return length
}

/**
 * Estimate curve radius from arc length and angle
 */
function estimateRadius(arcLength, angleDegrees) {
  if (angleDegrees === 0) return Infinity
  const angleRadians = angleDegrees * Math.PI / 180
  return arcLength / angleRadians
}

/**
 * Convert radius to severity (1-6 scale)
 */
function getSeverityFromRadius(radius) {
  if (radius > 200) return 1  // Flat out
  if (radius > 120) return 2  // Easy
  if (radius > 70) return 3   // Medium
  if (radius > 40) return 4   // Tight
  if (radius > 20) return 5   // Very tight
  return 6                     // Hairpin
}

/**
 * Determine curve modifier
 */
function getModifier(totalAngle, severity, length) {
  const absAngle = Math.abs(totalAngle)
  
  if (absAngle > 150) return 'HAIRPIN'
  if (absAngle > 120) return 'SHARP'
  if (severity >= 5 && length > 100) return 'LONG'
  if (length > 150 && severity <= 3) return 'LONG'
  
  // TODO: Could detect TIGHTENS/OPENS by analyzing radius change through curve
  
  return null
}

/**
 * Get speed recommendations based on severity and radius
 */
function getSpeedRecommendations(severity, radius) {
  // Base speeds for each severity level (in mph)
  const baseSpeeds = {
    1: { cruise: 65, fast: 75, race: 85 },
    2: { cruise: 55, fast: 65, race: 75 },
    3: { cruise: 45, fast: 55, race: 65 },
    4: { cruise: 35, fast: 45, race: 55 },
    5: { cruise: 25, fast: 35, race: 45 },
    6: { cruise: 20, fast: 25, race: 35 }
  }

  const speeds = baseSpeeds[severity] || baseSpeeds[3]
  
  return {
    speedCruise: speeds.cruise,
    speedFast: speeds.fast,
    speedRace: speeds.race
  }
}

/**
 * Calculate distance between two points in meters
 */
function getDistance(pos1, pos2) {
  const R = 6371e3
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

/**
 * Filter curves to only those ahead of current position
 * @param {Array} curves - All detected curves
 * @param {Array} currentPosition - [lng, lat]
 * @param {number} heading - Current heading in degrees
 * @param {number} maxDistance - Max distance to consider (meters)
 */
export function getUpcomingCurves(curves, currentPosition, heading, maxDistance = 1000) {
  if (!curves || !currentPosition) return []

  return curves
    .map(curve => {
      const distance = getDistance(currentPosition, curve.position)
      const bearingToCurve = getBearing(currentPosition, curve.position)
      
      // Check if curve is ahead (within 90 degrees of current heading)
      let angleDiff = Math.abs(bearingToCurve - heading)
      if (angleDiff > 180) angleDiff = 360 - angleDiff
      
      const isAhead = angleDiff < 90
      
      return {
        ...curve,
        distance: Math.round(distance),
        isAhead
      }
    })
    .filter(curve => curve.isAhead && curve.distance < maxDistance && curve.distance > 10)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
}

export default { detectCurves, getUpcomingCurves }
