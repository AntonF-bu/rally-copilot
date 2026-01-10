// ================================
// Curve Detection Algorithm v4
// Fixed-interval sampling for consistent curve detection
// ================================

const SAMPLE_INTERVAL = 25 // meters between samples

/**
 * Detect curves from an array of coordinates
 * Uses fixed-interval interpolation for consistent detection
 */
export function detectCurves(coordinates) {
  if (!coordinates || coordinates.length < 3) return []

  console.log(`Original route has ${coordinates.length} points`)

  // Step 1: Interpolate to fixed intervals
  const interpolatedPoints = interpolateRoute(coordinates, SAMPLE_INTERVAL)
  console.log(`Interpolated to ${interpolatedPoints.length} points at ${SAMPLE_INTERVAL}m intervals`)

  // Step 2: Calculate heading at each point
  const headings = []
  for (let i = 0; i < interpolatedPoints.length - 1; i++) {
    headings.push(getBearing(interpolatedPoints[i].coord, interpolatedPoints[i + 1].coord))
  }

  // Step 3: Detect curves from heading changes
  const curves = []
  let curveId = 1

  const CURVE_START_THRESHOLD = 6  // degrees to start detecting
  const CURVE_CONTINUE_THRESHOLD = 3
  const MIN_CURVE_ANGLE = 15  // minimum total angle

  let i = 0
  while (i < headings.length - 1) {
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    if (Math.abs(headingChange) > CURVE_START_THRESHOLD) {
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      let direction = Math.sign(headingChange)
      
      // Continue while still turning same direction
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        if (Math.sign(nextChange) === direction && Math.abs(nextChange) > CURVE_CONTINUE_THRESHOLD) {
          totalHeadingChange += nextChange
          curveEnd++
        } else if (Math.abs(nextChange) <= CURVE_CONTINUE_THRESHOLD) {
          // Small change - look ahead
          let lookAhead = 0
          for (let j = 1; j <= 3 && curveEnd + j < headings.length; j++) {
            lookAhead += getHeadingChange(headings[curveEnd + j - 1], headings[curveEnd + j])
          }
          if (Math.sign(lookAhead) === direction && Math.abs(lookAhead) > CURVE_START_THRESHOLD) {
            totalHeadingChange += nextChange
            curveEnd++
          } else {
            break
          }
        } else {
          break
        }
      }

      const absAngle = Math.abs(totalHeadingChange)
      
      if (absAngle >= MIN_CURVE_ANGLE) {
        // Calculate curve properties
        const startDist = interpolatedPoints[curveStart].distance
        const endDist = interpolatedPoints[Math.min(curveEnd + 1, interpolatedPoints.length - 1)].distance
        const curveLength = endDist - startDist
        const radius = estimateRadius(curveLength, absAngle)
        const severity = getSeverityFromRadius(radius, absAngle)
        const curveDirection = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
        
        // Apex position
        const apexIndex = Math.floor((curveStart + curveEnd + 1) / 2)
        const position = interpolatedPoints[Math.min(apexIndex, interpolatedPoints.length - 1)].coord
        
        const modifier = getModifier(totalHeadingChange, severity, curveLength)

        curves.push({
          id: curveId++,
          position,
          direction: curveDirection,
          severity,
          modifier,
          radius: Math.round(radius),
          totalAngle: Math.round(absAngle),
          length: Math.round(curveLength),
          distanceFromStart: Math.round(startDist),
          ...getSpeedRecommendations(severity)
        })
      }

      i = curveEnd + 1
    } else {
      i++
    }
  }

  // Log results
  console.log(`Curve detection: Found ${curves.length} curves`)
  const breakdown = {
    easy: curves.filter(c => c.severity <= 2).length,
    medium: curves.filter(c => c.severity === 3 || c.severity === 4).length,
    hard: curves.filter(c => c.severity >= 5).length
  }
  console.log(`Breakdown: ${breakdown.easy} easy, ${breakdown.medium} medium, ${breakdown.hard} hard`)
  
  return curves
}

/**
 * Interpolate route to fixed-interval points
 * This ensures consistent sampling regardless of original point density
 */
function interpolateRoute(coordinates, intervalMeters) {
  const result = []
  let cumulativeDistance = 0
  
  // Add first point
  result.push({ coord: coordinates[0], distance: 0 })
  
  let nextTargetDistance = intervalMeters
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentStart = coordinates[i]
    const segmentEnd = coordinates[i + 1]
    const segmentLength = getDistance(segmentStart, segmentEnd)
    const segmentEndDistance = cumulativeDistance + segmentLength
    
    // Add interpolated points within this segment
    while (nextTargetDistance <= segmentEndDistance) {
      const distanceIntoSegment = nextTargetDistance - cumulativeDistance
      const fraction = distanceIntoSegment / segmentLength
      
      // Linear interpolation
      const interpolatedCoord = [
        segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * fraction,
        segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * fraction
      ]
      
      result.push({ coord: interpolatedCoord, distance: nextTargetDistance })
      nextTargetDistance += intervalMeters
    }
    
    cumulativeDistance = segmentEndDistance
  }
  
  // Add last point if not already added
  const lastPoint = coordinates[coordinates.length - 1]
  const lastResultPoint = result[result.length - 1]
  if (getDistance(lastResultPoint.coord, lastPoint) > 1) {
    result.push({ coord: lastPoint, distance: cumulativeDistance })
  }
  
  return result
}

function getBearing(from, to) {
  const dLon = (to[0] - from[0]) * Math.PI / 180
  const lat1 = from[1] * Math.PI / 180
  const lat2 = to[1] * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

function getHeadingChange(heading1, heading2) {
  let diff = heading2 - heading1
  while (diff > 180) diff -= 360
  while (diff < -180) diff += 360
  return diff
}

function estimateRadius(arcLength, angleDegrees) {
  if (angleDegrees === 0) return Infinity
  const angleRadians = angleDegrees * Math.PI / 180
  return arcLength / angleRadians
}

function getSeverityFromRadius(radius, totalAngle) {
  let severity
  if (radius > 200) severity = 1
  else if (radius > 120) severity = 2
  else if (radius > 70) severity = 3
  else if (radius > 40) severity = 4
  else if (radius > 20) severity = 5
  else severity = 6

  // Boost for high angles
  if (totalAngle > 150) severity = Math.max(severity, 5)
  else if (totalAngle > 120) severity = Math.max(severity, 4)
  else if (totalAngle > 90) severity = Math.min(6, Math.max(severity, severity + 1))
  
  return Math.min(6, severity)
}

function getModifier(totalAngle, severity, length) {
  const absAngle = Math.abs(totalAngle)
  
  if (absAngle > 150) return 'HAIRPIN'
  if (absAngle > 120 || severity >= 5) return 'SHARP'
  if (length > 120 && severity >= 4) return 'LONG'
  if (length > 150) return 'LONG'
  
  return null
}

function getSpeedRecommendations(severity) {
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
 */
export function getUpcomingCurves(curves, currentPosition, heading, maxDistance = 1000) {
  if (!curves || !currentPosition) return []

  return curves
    .map(curve => {
      const distance = getDistance(currentPosition, curve.position)
      const bearingToCurve = getBearing(currentPosition, curve.position)
      
      let angleDiff = Math.abs(bearingToCurve - heading)
      if (angleDiff > 180) angleDiff = 360 - angleDiff
      
      const isAhead = angleDiff < 90
      
      return { ...curve, distance: Math.round(distance), isAhead }
    })
    .filter(curve => curve.isAhead && curve.distance < maxDistance && curve.distance > 10)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
}

export default { detectCurves, getUpcomingCurves }
