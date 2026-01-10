// ================================
// Curve Detection Algorithm
// Improved: Lower thresholds, better sensitivity
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

  // Calculate cumulative distance at each point
  const distances = [0]
  for (let i = 1; i < coordinates.length; i++) {
    distances.push(distances[i - 1] + getDistance(coordinates[i - 1], coordinates[i]))
  }

  // Analyze heading changes to find curves
  // LOWERED THRESHOLD: 8 degrees instead of 15
  const CURVE_START_THRESHOLD = 8
  const CURVE_CONTINUE_THRESHOLD = 5

  let i = 0
  while (i < headings.length - 1) {
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    // If heading change is significant, we're entering a curve
    if (Math.abs(headingChange) > CURVE_START_THRESHOLD) {
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      
      // Keep going while still turning in same direction
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        // Same direction turn and still significant
        if (Math.sign(nextChange) === Math.sign(headingChange) && Math.abs(nextChange) > CURVE_CONTINUE_THRESHOLD) {
          totalHeadingChange += nextChange
          curveEnd++
        } else if (Math.abs(nextChange) <= CURVE_CONTINUE_THRESHOLD) {
          // Small change, might be mid-curve - check if we continue turning after
          const lookAhead = curveEnd + 2 < headings.length ? 
            getHeadingChange(headings[curveEnd + 1], headings[curveEnd + 2]) : 0
          
          if (Math.sign(lookAhead) === Math.sign(headingChange) && Math.abs(lookAhead) > CURVE_CONTINUE_THRESHOLD) {
            totalHeadingChange += nextChange
            curveEnd++
          } else {
            break
          }
        } else {
          break
        }
      }

      // Calculate curve properties
      const curveCoords = coordinates.slice(curveStart, curveEnd + 2)
      const curveLength = calculatePathLength(curveCoords)
      const radius = estimateRadius(curveLength, Math.abs(totalHeadingChange))
      const severity = getSeverityFromRadius(radius, Math.abs(totalHeadingChange))
      const direction = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
      
      // Get the apex (middle) of the curve
      const apexIndex = Math.floor((curveStart + curveEnd) / 2)
      const position = coordinates[Math.min(apexIndex, coordinates.length - 1)]

      // Calculate distance from start
      const distanceFromStart = distances[curveStart]

      // Determine modifier
      const modifier = getModifier(totalHeadingChange, severity, curveLength)

      // Only add if it's a meaningful curve (skip very gentle ones)
      if (severity >= 1 && Math.abs(totalHeadingChange) >= 15) {
        curves.push({
          id: curveId++,
          position,
          direction,
          severity,
          modifier,
          radius: Math.round(radius),
          totalAngle: Math.round(Math.abs(totalHeadingChange)),
          distanceFromStart: Math.round(distanceFromStart),
          ...getSpeedRecommendations(severity, radius)
        })
      }

      // Skip past this curve
      i = curveEnd + 1
    } else {
      i++
    }
  }

  console.log(`Curve detection: Found ${curves.length} curves from ${coordinates.length} points`)
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
 * Convert radius and angle to severity (1-6 scale)
 * IMPROVED: Also considers total angle for better classification
 */
function getSeverityFromRadius(radius, totalAngle) {
  // Base severity on radius
  let severity
  if (radius > 200) severity = 1       // Very gentle
  else if (radius > 120) severity = 2  // Easy
  else if (radius > 70) severity = 3   // Medium
  else if (radius > 40) severity = 4   // Tight
  else if (radius > 20) severity = 5   // Very tight
  else severity = 6                     // Hairpin

  // Increase severity for high-angle turns even if radius is large
  if (totalAngle > 120 && severity < 5) severity = Math.min(6, severity + 1)
  if (totalAngle > 90 && severity < 4) severity = Math.min(5, severity + 1)
  
  return severity
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
  
  return null
}

/**
 * Get speed recommendations based on severity and radius
 */
function getSpeedRecommendations(severity, radius) {
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
