// ================================
// Curve Detection Algorithm v8
// ULTRA sensitive for subtle road bends
// ================================

const SAMPLE_INTERVAL = 8 // meters - fine granularity
const SLIDING_WINDOW_DISTANCE = 250 // meters - very long window for gradual bends
const MIN_CURVE_SEPARATION = 30 // meters - allow close curves
const CHICANE_MAX_DISTANCE = 150 // meters

/**
 * Main entry point - detect all curves with full analysis
 */
export function detectCurves(coordinates) {
  if (!coordinates || coordinates.length < 3) return []

  console.log(`🛣️ Curve Detection v7 - MAXIMUM Sensitivity for Long Curves`)
  console.log(`Original route has ${coordinates.length} points`)

  // Step 1: Interpolate to fixed intervals
  const interpolatedPoints = interpolateRoute(coordinates, SAMPLE_INTERVAL)
  console.log(`Interpolated to ${interpolatedPoints.length} points at ${SAMPLE_INTERVAL}m intervals`)

  // Step 2: Calculate heading at each point
  const headings = calculateHeadings(interpolatedPoints)

  // Step 3: Detect curves using both immediate and sliding window
  let curves = detectAllCurves(interpolatedPoints, headings)
  console.log(`Initial detection: ${curves.length} curves`)

  // Step 4: Analyze tightening/opening for each curve
  curves = analyzeCurveShape(curves, interpolatedPoints, headings)

  // Step 5: Detect S-curves and chicanes
  curves = detectChicanes(curves)

  // Step 6: Merge curves that are too close
  curves = mergeCurves(curves)

  // Step 7: Assign final IDs
  curves = curves.map((curve, idx) => ({ ...curve, id: idx + 1 }))

  // Log results
  logResults(curves)
  
  return curves
}

/**
 * Interpolate route to fixed-interval points
 */
function interpolateRoute(coordinates, intervalMeters) {
  const result = []
  let cumulativeDistance = 0
  
  result.push({ coord: coordinates[0], distance: 0 })
  
  let nextTargetDistance = intervalMeters
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentStart = coordinates[i]
    const segmentEnd = coordinates[i + 1]
    const segmentLength = getDistance(segmentStart, segmentEnd)
    const segmentEndDistance = cumulativeDistance + segmentLength
    
    while (nextTargetDistance <= segmentEndDistance) {
      const distanceIntoSegment = nextTargetDistance - cumulativeDistance
      const fraction = distanceIntoSegment / segmentLength
      
      const interpolatedCoord = [
        segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * fraction,
        segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * fraction
      ]
      
      result.push({ coord: interpolatedCoord, distance: nextTargetDistance })
      nextTargetDistance += intervalMeters
    }
    
    cumulativeDistance = segmentEndDistance
  }
  
  const lastPoint = coordinates[coordinates.length - 1]
  const lastResultPoint = result[result.length - 1]
  if (getDistance(lastResultPoint.coord, lastPoint) > 1) {
    result.push({ coord: lastPoint, distance: cumulativeDistance })
  }
  
  return result
}

/**
 * Calculate headings between consecutive points
 */
function calculateHeadings(points) {
  const headings = []
  for (let i = 0; i < points.length - 1; i++) {
    headings.push(getBearing(points[i].coord, points[i + 1].coord))
  }
  return headings
}

/**
 * Detect curves using both immediate changes and sliding window
 */
function detectAllCurves(points, headings) {
  const curves = []
  let curveId = 1
  
  // Track which points are already part of a curve
  const usedPoints = new Set()
  
  // Method 1: Immediate heading change detection (sharp curves)
  const sharpCurves = detectSharpCurves(points, headings, usedPoints)
  sharpCurves.forEach(c => {
    curves.push(c)
    for (let i = c.startIndex; i <= c.endIndex; i++) usedPoints.add(i)
  })
  
  // Method 2: Sliding window detection (gradual curves)
  const gradualCurves = detectGradualCurves(points, headings, usedPoints)
  gradualCurves.forEach(c => curves.push(c))
  
  // Sort by distance from start
  curves.sort((a, b) => a.distanceFromStart - b.distanceFromStart)
  
  return curves
}

/**
 * Detect sharp curves (immediate heading changes)
 */
function detectSharpCurves(points, headings, usedPoints) {
  const curves = []
  
  // ULTRA sensitive - detect even slight direction changes
  const CURVE_START_THRESHOLD = 1.5  // Start detecting at 1.5 degrees
  const CURVE_CONTINUE_THRESHOLD = 0.5  // Continue tracking at 0.5 degrees
  const MIN_CURVE_ANGLE = 5  // Minimum 5 degrees total to count as curve

  let i = 0
  while (i < headings.length - 1) {
    if (usedPoints.has(i)) { i++; continue }
    
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    if (Math.abs(headingChange) > CURVE_START_THRESHOLD) {
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      let direction = Math.sign(headingChange)
      
      // Track heading changes at different points for tightening analysis
      const segmentChanges = [{ index: i, change: headingChange }]
      
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        if (Math.sign(nextChange) === direction && Math.abs(nextChange) > CURVE_CONTINUE_THRESHOLD) {
          totalHeadingChange += nextChange
          segmentChanges.push({ index: curveEnd, change: nextChange })
          curveEnd++
        } else if (Math.abs(nextChange) <= CURVE_CONTINUE_THRESHOLD) {
          // Look ahead even further to bridge gaps in very wide bends
          let lookAhead = 0
          for (let j = 1; j <= 10 && curveEnd + j < headings.length; j++) {  // Look ahead 10 samples
            lookAhead += getHeadingChange(headings[curveEnd + j - 1], headings[curveEnd + j])
          }
          if (Math.sign(lookAhead) === direction && Math.abs(lookAhead) > CURVE_START_THRESHOLD) {
            totalHeadingChange += nextChange
            segmentChanges.push({ index: curveEnd, change: nextChange })
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
        const curve = createCurveObject(points, curveStart, curveEnd, totalHeadingChange, segmentChanges)
        curve.detectionMethod = 'sharp'
        curves.push(curve)
      }

      i = curveEnd + 1
    } else {
      i++
    }
  }
  
  return curves
}

/**
 * Detect gradual curves using sliding window
 * ULTRA sensitive for subtle road bends
 */
function detectGradualCurves(points, headings, usedPoints) {
  const curves = []
  const windowSize = Math.floor(SLIDING_WINDOW_DISTANCE / SAMPLE_INTERVAL) // ~31 samples at 8m = 250m window
  const MIN_GRADUAL_ANGLE = 4 // Detect even 4 degree changes over 250m - very subtle bends
  
  let i = 0
  while (i < headings.length - windowSize) {
    // Skip if this area already has a curve
    let hasUsedPoint = false
    for (let j = i; j < i + windowSize && !hasUsedPoint; j++) {
      if (usedPoints.has(j)) hasUsedPoint = true
    }
    if (hasUsedPoint) { i += Math.floor(windowSize / 6); continue } // Small skip to not miss curves
    
    // Calculate total heading change over window
    let windowHeadingChange = 0
    for (let j = i; j < i + windowSize - 1; j++) {
      windowHeadingChange += getHeadingChange(headings[j], headings[j + 1])
    }
    
    const absChange = Math.abs(windowHeadingChange)
    
    if (absChange >= MIN_GRADUAL_ANGLE) {
      // Found a gradual curve - expand to find full extent
      let curveStart = i
      let curveEnd = i + windowSize - 1
      let totalChange = windowHeadingChange
      const direction = Math.sign(windowHeadingChange)
      
      // Expand backwards - very sensitive
      while (curveStart > 0 && !usedPoints.has(curveStart - 1)) {
        const change = getHeadingChange(headings[curveStart - 1], headings[curveStart])
        if (Math.sign(change) === direction && Math.abs(change) > 0.1) {
          totalChange += change
          curveStart--
        } else {
          break
        }
      }
      
      // Expand forwards - very sensitive
      while (curveEnd < headings.length - 1 && !usedPoints.has(curveEnd + 1)) {
        const change = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        if (Math.sign(change) === direction && Math.abs(change) > 0.1) {
          totalChange += change
          curveEnd++
        } else {
          break
        }
      }
      
      const segmentChanges = []
      for (let j = curveStart; j <= curveEnd; j++) {
        if (j < headings.length - 1) {
          segmentChanges.push({ index: j, change: getHeadingChange(headings[j], headings[j + 1]) })
        }
      }
      
      const curve = createCurveObject(points, curveStart, curveEnd, totalChange, segmentChanges)
      curve.detectionMethod = 'gradual'
      curves.push(curve)
      
      // Mark points as used
      for (let j = curveStart; j <= curveEnd; j++) usedPoints.add(j)
      
      i = curveEnd + 1
    } else {
      i++
    }
  }
  
  return curves
}

/**
 * Create a curve object with all properties
 */
function createCurveObject(points, startIndex, endIndex, totalHeadingChange, segmentChanges) {
  const startDist = points[startIndex].distance
  const endDist = points[Math.min(endIndex + 1, points.length - 1)].distance
  const curveLength = endDist - startDist
  const absAngle = Math.abs(totalHeadingChange)
  const radius = estimateRadius(curveLength, absAngle)
  const severity = getSeverityFromRadius(radius, absAngle)
  const direction = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
  
  // Apex position (middle of curve)
  const apexIndex = Math.floor((startIndex + endIndex + 1) / 2)
  const position = points[Math.min(apexIndex, points.length - 1)].coord
  
  // Entry and exit positions for direction accuracy
  const entryPosition = points[startIndex].coord
  const exitPosition = points[Math.min(endIndex + 1, points.length - 1)].coord
  
  return {
    id: 0, // Will be assigned later
    position,
    entryPosition,
    exitPosition,
    direction,
    severity,
    modifier: null, // Will be set by shape analysis
    radius: Math.round(radius),
    totalAngle: Math.round(absAngle),
    length: Math.round(curveLength),
    distanceFromStart: Math.round(startDist),
    startIndex,
    endIndex,
    segmentChanges,
    ...getSpeedRecommendations(severity)
  }
}

/**
 * Analyze curve shape - detect tightening/opening
 */
function analyzeCurveShape(curves, points, headings) {
  return curves.map(curve => {
    const { segmentChanges, severity, totalAngle, length } = curve
    
    if (!segmentChanges || segmentChanges.length < 3) {
      curve.modifier = getBasicModifier(totalAngle, severity, length)
      return curve
    }
    
    // Divide curve into thirds and compare heading change rates
    const third = Math.floor(segmentChanges.length / 3)
    if (third < 1) {
      curve.modifier = getBasicModifier(totalAngle, severity, length)
      return curve
    }
    
    const firstThird = segmentChanges.slice(0, third)
    const lastThird = segmentChanges.slice(-third)
    
    const firstThirdAvg = firstThird.reduce((sum, s) => sum + Math.abs(s.change), 0) / firstThird.length
    const lastThirdAvg = lastThird.reduce((sum, s) => sum + Math.abs(s.change), 0) / lastThird.length
    
    const ratio = lastThirdAvg / firstThirdAvg
    
    // Determine shape
    if (ratio > 1.5 && lastThirdAvg > 3) {
      curve.modifier = 'TIGHTENS'
      curve.shape = 'tightening'
    } else if (ratio < 0.65 && firstThirdAvg > 3) {
      curve.modifier = 'OPENS'
      curve.shape = 'opening'
    } else {
      curve.modifier = getBasicModifier(totalAngle, severity, length)
      curve.shape = 'constant'
    }
    
    return curve
  })
}

/**
 * Detect S-curves and chicanes (opposite direction curves in quick succession)
 */
function detectChicanes(curves) {
  if (curves.length < 2) return curves
  
  const result = []
  let i = 0
  
  while (i < curves.length) {
    const current = curves[i]
    const next = curves[i + 1]
    
    if (next) {
      const distanceBetween = next.distanceFromStart - (current.distanceFromStart + current.length)
      const oppositeDirection = current.direction !== next.direction
      
      if (oppositeDirection && distanceBetween < CHICANE_MAX_DISTANCE && distanceBetween >= 0) {
        // Check for triple chicane (S-curve with third element)
        const third = curves[i + 2]
        let isTripleChicane = false
        
        if (third) {
          const distToThird = third.distanceFromStart - (next.distanceFromStart + next.length)
          const thirdOpposite = next.direction !== third.direction
          
          if (thirdOpposite && distToThird < CHICANE_MAX_DISTANCE && distToThird >= 0) {
            isTripleChicane = true
          }
        }
        
        if (isTripleChicane) {
          // Create triple chicane
          const chicane = createChicane([current, next, third])
          result.push(chicane)
          i += 3
        } else {
          // Create double chicane/S-curve
          const chicane = createChicane([current, next])
          result.push(chicane)
          i += 2
        }
      } else {
        result.push(current)
        i++
      }
    } else {
      result.push(current)
      i++
    }
  }
  
  return result
}

/**
 * Create a chicane/S-curve from multiple curves
 */
function createChicane(curves) {
  const first = curves[0]
  const last = curves[curves.length - 1]
  
  // Use highest severity among the curves
  const maxSeverity = Math.max(...curves.map(c => c.severity))
  
  // Chicane type based on first curve direction
  const type = curves.length === 3 ? 'CHICANE' : 'S-CURVE'
  const directionLabel = first.direction === 'LEFT' ? 'L' : 'R'
  
  // Build severity sequence (e.g., "3-4" or "3-4-3")
  const severitySequence = curves.map(c => c.severity).join('-')
  
  return {
    id: 0,
    position: first.position, // Announce at entry
    entryPosition: first.entryPosition,
    exitPosition: last.exitPosition,
    direction: first.direction, // First turn direction
    severity: maxSeverity,
    modifier: type,
    isChicane: true,
    chicaneType: type,
    startDirection: first.direction,
    severitySequence,
    curves: curves, // Keep reference to original curves
    radius: Math.min(...curves.map(c => c.radius)),
    totalAngle: curves.reduce((sum, c) => sum + c.totalAngle, 0),
    length: (last.distanceFromStart + last.length) - first.distanceFromStart,
    distanceFromStart: first.distanceFromStart,
    ...getSpeedRecommendations(maxSeverity)
  }
}

/**
 * Merge curves that are too close together
 */
function mergeCurves(curves) {
  if (curves.length < 2) return curves
  
  const result = []
  let i = 0
  
  while (i < curves.length) {
    const current = curves[i]
    
    // Skip chicanes - they're already merged
    if (current.isChicane) {
      result.push(current)
      i++
      continue
    }
    
    const next = curves[i + 1]
    
    if (next && !next.isChicane) {
      const distanceBetween = next.distanceFromStart - (current.distanceFromStart + current.length)
      const sameDirection = current.direction === next.direction
      
      // Merge same-direction curves that are very close
      if (sameDirection && distanceBetween < MIN_CURVE_SEPARATION && distanceBetween >= 0) {
        const merged = mergeTwoCurves(current, next)
        
        // Check if we should merge more
        let j = i + 2
        while (j < curves.length) {
          const another = curves[j]
          if (another.isChicane) break
          
          const distToAnother = another.distanceFromStart - (merged.distanceFromStart + merged.length)
          if (another.direction === merged.direction && distToAnother < MIN_CURVE_SEPARATION && distToAnother >= 0) {
            Object.assign(merged, mergeTwoCurves(merged, another))
            j++
          } else {
            break
          }
        }
        
        result.push(merged)
        i = j
      } else {
        result.push(current)
        i++
      }
    } else {
      result.push(current)
      i++
    }
  }
  
  return result
}

/**
 * Merge two curves into one
 */
function mergeTwoCurves(a, b) {
  const combinedAngle = a.totalAngle + b.totalAngle
  const combinedLength = (b.distanceFromStart + b.length) - a.distanceFromStart
  const radius = estimateRadius(combinedLength, combinedAngle)
  const severity = Math.max(a.severity, b.severity, getSeverityFromRadius(radius, combinedAngle))
  
  return {
    ...a,
    severity,
    totalAngle: Math.round(combinedAngle),
    length: Math.round(combinedLength),
    radius: Math.round(radius),
    exitPosition: b.exitPosition,
    endIndex: b.endIndex,
    modifier: combinedAngle > 150 ? 'LONG' : (severity >= 5 ? 'SHARP' : a.modifier),
    isMerged: true,
    ...getSpeedRecommendations(severity)
  }
}

/**
 * Get basic modifier without shape analysis
 */
function getBasicModifier(totalAngle, severity, length) {
  const absAngle = Math.abs(totalAngle)
  
  if (absAngle > 150) return 'HAIRPIN'
  if (absAngle > 120 || severity >= 5) return 'SHARP'
  if (length > 100 && severity >= 3) return 'LONG'  // was length > 120 && severity >= 4
  if (length > 120) return 'LONG'  // was 150
  
  return null
}

// ================================
// Helper Functions
// ================================

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
  // Extended thresholds to capture very wide bends
  if (radius > 400) severity = 1  // Very gentle sweeper
  else if (radius > 250) severity = 1  // Gentle sweeper
  else if (radius > 150) severity = 2  // Easy curve
  else if (radius > 90) severity = 3   // Moderate
  else if (radius > 50) severity = 4   // Tight
  else if (radius > 25) severity = 5   // Very tight
  else severity = 6                     // Extreme

  // Adjust severity based on total angle (longer curves need more attention)
  if (totalAngle > 150) severity = Math.max(severity, 5)
  else if (totalAngle > 120) severity = Math.max(severity, 4)
  else if (totalAngle > 90) severity = Math.max(severity, Math.min(6, severity + 1))
  else if (totalAngle > 60) severity = Math.max(severity, Math.min(5, severity + 1))
  
  return Math.min(6, severity)
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

function logResults(curves) {
  console.log(`Final curve count: ${curves.length}`)
  
  const chicanes = curves.filter(c => c.isChicane)
  const merged = curves.filter(c => c.isMerged)
  const tightening = curves.filter(c => c.modifier === 'TIGHTENS')
  const opening = curves.filter(c => c.modifier === 'OPENS')
  
  console.log(`  - Chicanes/S-curves: ${chicanes.length}`)
  console.log(`  - Merged curves: ${merged.length}`)
  console.log(`  - Tightening: ${tightening.length}`)
  console.log(`  - Opening: ${opening.length}`)
  
  const breakdown = {
    easy: curves.filter(c => c.severity <= 2).length,
    medium: curves.filter(c => c.severity === 3 || c.severity === 4).length,
    hard: curves.filter(c => c.severity >= 5).length
  }
  console.log(`Severity: ${breakdown.easy} easy, ${breakdown.medium} medium, ${breakdown.hard} hard`)
}

/**
 * Filter curves to only those ahead of current position
 * Improved: better angle calculation and distance filtering
 */
export function getUpcomingCurves(curves, currentPosition, heading, maxDistance = 1000) {
  if (!curves || !currentPosition) return []

  return curves
    .map(curve => {
      const distance = getDistance(currentPosition, curve.position)
      const bearingToCurve = getBearing(currentPosition, curve.position)
      
      // Calculate angle difference properly (-180 to 180)
      let angleDiff = bearingToCurve - heading
      while (angleDiff > 180) angleDiff -= 360
      while (angleDiff < -180) angleDiff += 360
      
      const absAngleDiff = Math.abs(angleDiff)
      
      // Curve is "ahead" if within 100° of heading (wider cone for turns)
      // But stricter (70°) when very close to avoid announcing passed curves
      const isAhead = distance < 30 
        ? absAngleDiff < 70 
        : absAngleDiff < 100
      
      // Filter out curves we're basically on top of unless directly ahead
      const tooClose = distance < 20 && absAngleDiff > 50
      
      return { 
        ...curve, 
        distance: Math.round(distance), 
        isAhead: isAhead && !tooClose,
        bearingToCurve: Math.round(bearingToCurve),
        angleDiff: Math.round(absAngleDiff)
      }
    })
    .filter(curve => curve.isAhead && curve.distance < maxDistance && curve.distance > 15)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
}

export default { detectCurves, getUpcomingCurves }
