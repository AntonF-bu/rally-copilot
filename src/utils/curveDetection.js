// ================================
// Curve Detection Algorithm v3
// VERY sensitive - catches all meaningful turns
// ================================

/**
 * Detect curves from an array of coordinates
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

  // VERY LOW THRESHOLDS to catch more curves
  const CURVE_START_THRESHOLD = 5  // Start detecting at just 5 degrees
  const CURVE_CONTINUE_THRESHOLD = 3
  const MIN_CURVE_ANGLE = 12  // Minimum total angle to be considered a curve

  let i = 0
  while (i < headings.length - 1) {
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    if (Math.abs(headingChange) > CURVE_START_THRESHOLD) {
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      let direction = Math.sign(headingChange)
      
      // Keep going while still turning
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        // Same direction and significant
        if (Math.sign(nextChange) === direction && Math.abs(nextChange) > CURVE_CONTINUE_THRESHOLD) {
          totalHeadingChange += nextChange
          curveEnd++
        } 
        // Small change - might be mid-curve wobble
        else if (Math.abs(nextChange) <= CURVE_CONTINUE_THRESHOLD) {
          // Look ahead to see if curve continues
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

      // Calculate curve properties
      const curveCoords = coordinates.slice(curveStart, curveEnd + 2)
      const curveLength = calculatePathLength(curveCoords)
      const absAngle = Math.abs(totalHeadingChange)
      const radius = estimateRadius(curveLength, absAngle)
      const severity = getSeverityFromRadius(radius, absAngle)
      const curveDirection = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
      
      // Get the apex (middle) of the curve
      const apexIndex = Math.floor((curveStart + curveEnd + 1) / 2)
      const position = coordinates[Math.min(apexIndex, coordinates.length - 1)]
      const distanceFromStart = distances[curveStart]
      const modifier = getModifier(totalHeadingChange, severity, curveLength)

      // Include if meaningful angle
      if (absAngle >= MIN_CURVE_ANGLE) {
        curves.push({
          id: curveId++,
          position,
          direction: curveDirection,
          severity,
          modifier,
          radius: Math.round(radius),
          totalAngle: Math.round(absAngle),
          length: Math.round(curveLength),
          distanceFromStart: Math.round(distanceFromStart),
          ...getSpeedRecommendations(severity, radius)
        })
      }

      i = curveEnd + 1
    } else {
      i++
    }
  }

  console.log(`Curve detection: Found ${curves.length} curves from ${coordinates.length} points`)
  
  // Log breakdown
  const breakdown = {
    easy: curves.filter(c => c.severity <= 2).length,
    medium: curves.filter(c => c.severity === 3 || c.severity === 4).length,
    hard: curves.filter(c => c.severity >= 5).length
  }
  console.log(`Breakdown: ${breakdown.easy} easy, ${breakdown.medium} medium, ${breakdown.hard} hard`)
  
  return curves
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

function calculatePathLength(coordinates) {
  let length = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    length += getDistance(coordinates[i], coordinates[i + 1])
  }
  return length
}

function estimateRadius(arcLength, angleDegrees) {
  if (angleDegrees === 0) return Infinity
  const angleRadians = angleDegrees * Math.PI / 180
  return arcLength / angleRadians
}

/**
 * Severity based on BOTH radius AND angle
 */
function getSeverityFromRadius(radius, totalAngle) {
  // Primary: radius-based
  let severity
  if (radius > 250) severity = 1
  else if (radius > 150) severity = 2
  else if (radius > 80) severity = 3
  else if (radius > 45) severity = 4
  else if (radius > 25) severity = 5
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
