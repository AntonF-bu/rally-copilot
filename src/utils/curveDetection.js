// ================================
// Curve Detection Algorithm v10
// NEW: Highway Sweeper Detection (8-25° gentle curves)
// ================================

const SAMPLE_INTERVAL = 8 // meters - fine granularity
const SLIDING_WINDOW_DISTANCE = 250 // meters - very long window for gradual bends
const MIN_CURVE_SEPARATION = 30 // meters - allow close curves
const CHICANE_MAX_DISTANCE = 150 // meters
const TECHNICAL_SECTION_MIN_CURVES = 3
const TECHNICAL_SECTION_MAX_GAP = 200 // meters between curves to be considered part of section

// NEW: Sweeper detection thresholds for highways
const SWEEPER_CONFIG = {
  minAngle: 5,        // Detect curves as low as 5 degrees
  maxAngle: 25,       // Above this, it's a regular curve not a "sweeper"
  minLength: 150,     // Sweepers are long, gradual curves (meters)
  windowSize: 400,    // Look over longer distance for sweepers (meters)
}

/**
 * Main entry point - detect all curves with full analysis
 */
export function detectCurves(coordinates) {
  if (!coordinates || coordinates.length < 3) return []

  console.log(`🛣️ Curve Detection v10 - Highway Sweepers + Technical Sections`)
  console.log(`Original route has ${coordinates.length} points`)

  // Step 1: Interpolate to fixed intervals
  const interpolatedPoints = interpolateRoute(coordinates, SAMPLE_INTERVAL)
  console.log(`Interpolated to ${interpolatedPoints.length} points at ${SAMPLE_INTERVAL}m intervals`)

  // Step 2: Calculate heading at each point
  const headings = calculateHeadings(interpolatedPoints)

  // Step 3: Detect road characteristics (speed context)
  const roadCharacteristics = analyzeRoadCharacteristics(interpolatedPoints, headings)
  console.log(`Road analysis: avgStraightLength=${roadCharacteristics.avgStraightLength.toFixed(0)}m, isHighway=${roadCharacteristics.isHighway}`)

  // Step 4: Detect curves using both immediate and sliding window
  let curves = detectAllCurves(interpolatedPoints, headings, roadCharacteristics)
  console.log(`Initial detection: ${curves.length} curves`)

  // Step 4.5 NEW: Detect highway sweepers (very gentle curves)
  if (roadCharacteristics.isHighway) {
    const sweepers = detectHighwaySweepers(interpolatedPoints, headings, curves)
    curves = [...curves, ...sweepers]
    curves.sort((a, b) => a.distanceFromStart - b.distanceFromStart)
    console.log(`After sweeper detection: ${curves.length} curves (added ${sweepers.length} sweepers)`)
  }

  // Step 5: Analyze tightening/opening for each curve
  curves = analyzeCurveShape(curves, interpolatedPoints, headings)

  // Step 6: Detect S-curves and chicanes
  curves = detectChicanes(curves, interpolatedPoints)

  // Step 7: Detect technical sections (sustained windy stretches)
  curves = detectTechnicalSections(curves, interpolatedPoints)

  // Step 8: Merge curves that are too close
  curves = mergeCurves(curves)

  // Step 9: Apply road-type speed adjustments
  curves = applyRoadTypeSpeedAdjustments(curves, roadCharacteristics)

  // Step 10: Assign final IDs
  curves = curves.map((curve, idx) => ({ ...curve, id: idx + 1 }))

  // Log results
  logResults(curves)
  
  return curves
}

/**
 * NEW: Detect highway sweepers - very gentle curves that regular detection misses
 * These are 5-25 degree curves spread over 150+ meters
 */
function detectHighwaySweepers(points, headings, existingCurves) {
  const sweepers = []
  const windowSize = Math.floor(SWEEPER_CONFIG.windowSize / SAMPLE_INTERVAL)
  
  // Track which points are already part of existing curves
  const usedPoints = new Set()
  existingCurves.forEach(curve => {
    for (let i = curve.startIndex; i <= curve.endIndex; i++) {
      usedPoints.add(i)
    }
  })
  
  let i = 0
  while (i < headings.length - windowSize) {
    // Skip if any point in window is already used
    let hasUsedPoint = false
    for (let j = i; j < i + windowSize && !hasUsedPoint; j++) {
      if (usedPoints.has(j)) hasUsedPoint = true
    }
    if (hasUsedPoint) {
      i += Math.floor(windowSize / 4)
      continue
    }
    
    // Calculate total heading change over the window
    let windowHeadingChange = 0
    for (let j = i; j < i + windowSize - 1; j++) {
      windowHeadingChange += getHeadingChange(headings[j], headings[j + 1])
    }
    
    const absChange = Math.abs(windowHeadingChange)
    const curveLength = points[i + windowSize - 1].distance - points[i].distance
    
    // Check if this qualifies as a sweeper
    if (absChange >= SWEEPER_CONFIG.minAngle && 
        absChange <= SWEEPER_CONFIG.maxAngle &&
        curveLength >= SWEEPER_CONFIG.minLength) {
      
      // Expand to find full extent of the sweeper
      let sweeperStart = i
      let sweeperEnd = i + windowSize - 1
      let totalChange = windowHeadingChange
      const direction = Math.sign(windowHeadingChange)
      
      // Expand backwards
      while (sweeperStart > 0 && !usedPoints.has(sweeperStart - 1)) {
        const change = getHeadingChange(headings[sweeperStart - 1], headings[sweeperStart])
        if (Math.sign(change) === direction && Math.abs(change) > 0.05) {
          totalChange += change
          sweeperStart--
        } else {
          break
        }
      }
      
      // Expand forwards
      while (sweeperEnd < headings.length - 1 && !usedPoints.has(sweeperEnd + 1)) {
        const change = getHeadingChange(headings[sweeperEnd], headings[sweeperEnd + 1])
        if (Math.sign(change) === direction && Math.abs(change) > 0.05) {
          totalChange += change
          sweeperEnd++
        } else {
          break
        }
      }
      
      const finalAbsChange = Math.abs(totalChange)
      const finalLength = points[sweeperEnd].distance - points[sweeperStart].distance
      
      // Only keep if still within sweeper bounds (not too sharp)
      if (finalAbsChange >= SWEEPER_CONFIG.minAngle && 
          finalAbsChange <= 35 && // Allow slightly more after expansion
          finalLength >= SWEEPER_CONFIG.minLength) {
        
        const sweeper = createSweeperObject(
          points, 
          headings, 
          sweeperStart, 
          sweeperEnd, 
          totalChange
        )
        sweepers.push(sweeper)
        
        // Mark points as used
        for (let j = sweeperStart; j <= sweeperEnd; j++) {
          usedPoints.add(j)
        }
        
        console.log(`  🌊 Sweeper detected: ${sweeper.direction} ${sweeper.sweeperAngle}° over ${sweeper.length}m`)
      }
      
      i = sweeperEnd + 1
    } else {
      i++
    }
  }
  
  return sweepers
}

/**
 * Create a sweeper curve object
 */
function createSweeperObject(points, headings, startIndex, endIndex, totalHeadingChange) {
  const startDist = points[startIndex].distance
  const endDist = points[Math.min(endIndex + 1, points.length - 1)].distance
  const curveLength = endDist - startDist
  const absAngle = Math.abs(totalHeadingChange)
  
  // Direction from heading change
  const direction = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
  
  // Apex position (middle of curve)
  const apexIndex = Math.floor((startIndex + endIndex + 1) / 2)
  const position = points[Math.min(apexIndex, points.length - 1)].coord
  
  // Entry and exit positions
  const entryPosition = points[startIndex].coord
  const exitPosition = points[Math.min(endIndex + 1, points.length - 1)].coord
  
  // Sweepers are always severity 1 (gentle) but we track the actual angle
  return {
    id: 0,
    position,
    entryPosition,
    exitPosition,
    direction,
    severity: 1,
    modifier: null,
    radius: Math.round(curveLength / (absAngle * Math.PI / 180)), // Estimate radius
    totalAngle: Math.round(absAngle),
    length: Math.round(curveLength),
    distanceFromStart: Math.round(startDist),
    startIndex,
    endIndex,
    entryHeading: headings[startIndex] || 0,
    exitHeading: headings[Math.min(endIndex, headings.length - 1)] || 0,
    
    // NEW: Sweeper-specific properties
    isSweeper: true,
    sweeperAngle: Math.round(absAngle), // The actual angle for callouts
    
    // Higher speeds for sweepers since they're gentle
    speedCruise: 70,
    speedFast: 75,
    speedRace: 80,
  }
}

/**
 * Analyze road characteristics to determine context (highway vs local road)
 */
function analyzeRoadCharacteristics(points, headings) {
  const totalDistance = points[points.length - 1].distance
  
  // Count significant direction changes
  let significantChanges = 0
  let straightSegmentLengths = []
  let currentStraightLength = 0
  
  for (let i = 0; i < headings.length - 1; i++) {
    const change = Math.abs(getHeadingChange(headings[i], headings[i + 1]))
    
    if (change > 2) {
      significantChanges++
      if (currentStraightLength > 50) {
        straightSegmentLengths.push(currentStraightLength)
      }
      currentStraightLength = 0
    } else {
      currentStraightLength += SAMPLE_INTERVAL
    }
  }
  
  if (currentStraightLength > 50) {
    straightSegmentLengths.push(currentStraightLength)
  }
  
  const avgStraightLength = straightSegmentLengths.length > 0
    ? straightSegmentLengths.reduce((a, b) => a + b, 0) / straightSegmentLengths.length
    : 0
  
  // Highway detection: long straights, few sharp turns
  const changesPerKm = (significantChanges / totalDistance) * 1000
  const isHighway = avgStraightLength > 300 || changesPerKm < 15
  
  return {
    totalDistance,
    significantChanges,
    avgStraightLength,
    changesPerKm,
    isHighway
  }
}

/**
 * Interpolate route to fixed intervals
 */
function interpolateRoute(coordinates, intervalMeters) {
  const result = []
  let cumulativeDistance = 0
  let nextTargetDistance = 0
  
  result.push({ coord: coordinates[0], distance: 0 })
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const segmentStart = coordinates[i]
    const segmentEnd = coordinates[i + 1]
    const segmentLength = getDistance(segmentStart, segmentEnd)
    const segmentEndDistance = cumulativeDistance + segmentLength
    
    while (nextTargetDistance <= segmentEndDistance && nextTargetDistance > cumulativeDistance) {
      const t = (nextTargetDistance - cumulativeDistance) / segmentLength
      const interpolated = [
        segmentStart[0] + t * (segmentEnd[0] - segmentStart[0]),
        segmentStart[1] + t * (segmentEnd[1] - segmentStart[1])
      ]
      result.push({ coord: interpolated, distance: nextTargetDistance })
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
function detectAllCurves(points, headings, roadCharacteristics) {
  const curves = []
  
  // Track which points are already part of a curve
  const usedPoints = new Set()
  
  // Method 1: Immediate heading change detection (sharp curves)
  const sharpCurves = detectSharpCurves(points, headings, usedPoints, roadCharacteristics)
  sharpCurves.forEach(c => {
    curves.push(c)
    for (let i = c.startIndex; i <= c.endIndex; i++) usedPoints.add(i)
  })
  
  // Method 2: Sliding window detection (gradual curves)
  const gradualCurves = detectGradualCurves(points, headings, usedPoints, roadCharacteristics)
  gradualCurves.forEach(c => curves.push(c))
  
  // Sort by distance from start
  curves.sort((a, b) => a.distanceFromStart - b.distanceFromStart)
  
  return curves
}

/**
 * Detect sharp curves (immediate heading changes)
 */
function detectSharpCurves(points, headings, usedPoints, roadCharacteristics) {
  const curves = []
  
  // Adjust thresholds based on road type
  const CURVE_START_THRESHOLD = roadCharacteristics.isHighway ? 2.0 : 1.5
  const CURVE_CONTINUE_THRESHOLD = 0.5
  const MIN_CURVE_ANGLE = roadCharacteristics.isHighway ? 8 : 5

  let i = 0
  while (i < headings.length - 1) {
    if (usedPoints.has(i)) { i++; continue }
    
    const headingChange = getHeadingChange(headings[i], headings[i + 1])
    
    if (Math.abs(headingChange) > CURVE_START_THRESHOLD) {
      let curveStart = i
      let curveEnd = i + 1
      let totalHeadingChange = headingChange
      let direction = Math.sign(headingChange)
      
      const segmentChanges = [{ index: i, change: headingChange }]
      
      while (curveEnd < headings.length - 1) {
        const nextChange = getHeadingChange(headings[curveEnd], headings[curveEnd + 1])
        
        if (Math.sign(nextChange) === direction && Math.abs(nextChange) > CURVE_CONTINUE_THRESHOLD) {
          totalHeadingChange += nextChange
          segmentChanges.push({ index: curveEnd, change: nextChange })
          curveEnd++
        } else if (Math.abs(nextChange) <= CURVE_CONTINUE_THRESHOLD) {
          // Look ahead to bridge gaps
          let lookAhead = 0
          for (let j = 1; j <= 10 && curveEnd + j < headings.length; j++) {
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
        const curve = createCurveObject(points, headings, curveStart, curveEnd, totalHeadingChange, segmentChanges)
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
 */
function detectGradualCurves(points, headings, usedPoints, roadCharacteristics) {
  const curves = []
  const windowSize = Math.floor(SLIDING_WINDOW_DISTANCE / SAMPLE_INTERVAL)
  const MIN_GRADUAL_ANGLE = roadCharacteristics.isHighway ? 6 : 4
  
  let i = 0
  while (i < headings.length - windowSize) {
    let hasUsedPoint = false
    for (let j = i; j < i + windowSize && !hasUsedPoint; j++) {
      if (usedPoints.has(j)) hasUsedPoint = true
    }
    if (hasUsedPoint) { i += Math.floor(windowSize / 6); continue }
    
    let windowHeadingChange = 0
    for (let j = i; j < i + windowSize - 1; j++) {
      windowHeadingChange += getHeadingChange(headings[j], headings[j + 1])
    }
    
    const absChange = Math.abs(windowHeadingChange)
    
    if (absChange >= MIN_GRADUAL_ANGLE) {
      let curveStart = i
      let curveEnd = i + windowSize - 1
      let totalChange = windowHeadingChange
      const direction = Math.sign(windowHeadingChange)
      
      // Expand backwards
      while (curveStart > 0 && !usedPoints.has(curveStart - 1)) {
        const change = getHeadingChange(headings[curveStart - 1], headings[curveStart])
        if (Math.sign(change) === direction && Math.abs(change) > 0.1) {
          totalChange += change
          curveStart--
        } else {
          break
        }
      }
      
      // Expand forwards
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
      
      const curve = createCurveObject(points, headings, curveStart, curveEnd, totalChange, segmentChanges)
      curve.detectionMethod = 'gradual'
      curves.push(curve)
      
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
function createCurveObject(points, headings, startIndex, endIndex, totalHeadingChange, segmentChanges) {
  const startDist = points[startIndex].distance
  const endDist = points[Math.min(endIndex + 1, points.length - 1)].distance
  const curveLength = endDist - startDist
  const absAngle = Math.abs(totalHeadingChange)
  const radius = estimateRadius(curveLength, absAngle)
  const severity = getSeverityFromRadius(radius, absAngle)
  
  // Determine direction from the FIRST significant heading change
  let entryDirection = 'RIGHT'
  if (segmentChanges && segmentChanges.length > 0) {
    for (const seg of segmentChanges) {
      if (Math.abs(seg.change) > 1) {
        entryDirection = seg.change > 0 ? 'RIGHT' : 'LEFT'
        break
      }
    }
  } else {
    entryDirection = totalHeadingChange > 0 ? 'RIGHT' : 'LEFT'
  }
  
  // Apex position (middle of curve)
  const apexIndex = Math.floor((startIndex + endIndex + 1) / 2)
  const position = points[Math.min(apexIndex, points.length - 1)].coord
  
  // Entry and exit positions
  const entryPosition = points[startIndex].coord
  const exitPosition = points[Math.min(endIndex + 1, points.length - 1)].coord
  
  return {
    id: 0,
    position,
    entryPosition,
    exitPosition,
    direction: entryDirection,
    severity,
    modifier: null,
    radius: Math.round(radius),
    totalAngle: Math.round(absAngle),
    length: Math.round(curveLength),
    distanceFromStart: Math.round(startDist),
    startIndex,
    endIndex,
    segmentChanges,
    entryHeading: headings[startIndex] || 0,
    exitHeading: headings[Math.min(endIndex, headings.length - 1)] || 0,
    ...getSpeedRecommendations(severity)
  }
}

/**
 * Analyze curve shape - detect tightening/opening
 */
function analyzeCurveShape(curves, points, headings) {
  return curves.map(curve => {
    // Skip sweepers - they don't tighten/open
    if (curve.isSweeper) return curve
    
    const { segmentChanges, severity, totalAngle, length } = curve
    
    if (!segmentChanges || segmentChanges.length < 3) {
      curve.modifier = getBasicModifier(totalAngle, severity, length)
      return curve
    }
    
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
 * Detect S-curves and chicanes
 */
function detectChicanes(curves, points) {
  if (curves.length < 2) return curves
  
  const result = []
  let i = 0
  
  while (i < curves.length) {
    const current = curves[i]
    const next = curves[i + 1]
    
    // Skip sweepers from chicane detection
    if (current.isSweeper) {
      result.push(current)
      i++
      continue
    }
    
    if (next && !next.isSweeper) {
      const distanceBetween = next.distanceFromStart - (current.distanceFromStart + current.length)
      const oppositeDirection = current.direction !== next.direction
      
      if (oppositeDirection && distanceBetween < CHICANE_MAX_DISTANCE && distanceBetween >= 0) {
        const chicane = createChicane(current, next, points)
        result.push(chicane)
        i += 2
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
 * Create a chicane from two curves
 */
function createChicane(curve1, curve2, points) {
  const maxSeverity = Math.max(curve1.severity, curve2.severity)
  const totalLength = (curve2.distanceFromStart + curve2.length) - curve1.distanceFromStart
  
  return {
    ...curve1,
    isChicane: true,
    chicaneType: maxSeverity >= 3 ? 'CHICANE' : 'S_CURVE',
    startDirection: curve1.direction,
    severity: maxSeverity,
    severitySequence: `${curve1.severity}-${curve2.severity}`,
    length: Math.round(totalLength),
    exitPosition: curve2.exitPosition,
    containedCurves: [curve1, curve2],
    ...getSpeedRecommendations(maxSeverity)
  }
}

/**
 * Detect technical sections
 */
function detectTechnicalSections(curves, interpolatedPoints) {
  if (curves.length < TECHNICAL_SECTION_MIN_CURVES) return curves
  
  const result = []
  let i = 0
  
  while (i < curves.length) {
    const current = curves[i]
    
    // Skip chicanes and sweepers from technical section detection
    if (current.isChicane || current.isSweeper) {
      result.push(current)
      i++
      continue
    }
    
    // Look for cluster of curves
    const cluster = [curves[i]]
    let j = i + 1
    
    while (j < curves.length) {
      const prev = cluster[cluster.length - 1]
      const curr = curves[j]
      
      if (curr.isChicane || curr.isSweeper) {
        j++
        continue
      }
      
      const gap = curr.distanceFromStart - (prev.distanceFromStart + prev.length)
      
      if (gap <= TECHNICAL_SECTION_MAX_GAP) {
        cluster.push(curr)
        j++
      } else {
        break
      }
    }
    
    if (cluster.length >= TECHNICAL_SECTION_MIN_CURVES) {
      let directionChanges = 0
      for (let k = 1; k < cluster.length; k++) {
        if (cluster[k].direction !== cluster[k-1].direction) {
          directionChanges++
        }
      }
      
      if (directionChanges >= 2) {
        const technicalSection = createTechnicalSection(cluster, interpolatedPoints)
        result.push(technicalSection)
        i = j
        continue
      }
    }
    
    result.push(curves[i])
    i++
  }
  
  return result
}

/**
 * Create a technical section from a cluster of curves
 */
function createTechnicalSection(curves, points) {
  const first = curves[0]
  const last = curves[curves.length - 1]
  
  const totalLength = (last.distanceFromStart + last.length) - first.distanceFromStart
  const maxSeverity = Math.max(...curves.map(c => c.severity))
  const avgSeverity = curves.reduce((sum, c) => sum + c.severity, 0) / curves.length
  
  let directionChanges = 0
  for (let i = 1; i < curves.length; i++) {
    if (curves[i].direction !== curves[i-1].direction) {
      directionChanges++
    }
  }
  
  let character = 'windy'
  if (directionChanges >= curves.length - 1) {
    character = 'switchbacks'
  } else if (avgSeverity <= 2) {
    character = 'sweeping'
  } else if (maxSeverity >= 5) {
    character = 'technical'
  }
  
  const severitySequence = curves.map(c => c.severity).join('-')
  const directionSequence = curves.map(c => c.direction === 'LEFT' ? 'L' : 'R').join('')
  
  const baseSpeed = getSpeedRecommendations(maxSeverity)
  
  return {
    id: 0,
    position: first.position,
    entryPosition: first.entryPosition,
    exitPosition: last.exitPosition,
    direction: first.direction,
    severity: maxSeverity,
    avgSeverity: Math.round(avgSeverity * 10) / 10,
    modifier: character.toUpperCase(),
    isTechnicalSection: true,
    sectionCharacter: character,
    curveCount: curves.length,
    directionChanges,
    severitySequence,
    directionSequence,
    containedCurves: curves,
    length: Math.round(totalLength),
    distanceFromStart: first.distanceFromStart,
    speedCruise: Math.round(baseSpeed.speedCruise * 1.05),
    speedFast: Math.round(baseSpeed.speedFast * 1.05),
    speedRace: Math.round(baseSpeed.speedRace * 1.05)
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
    
    // Skip chicanes, technical sections, and sweepers
    if (current.isChicane || current.isTechnicalSection || current.isSweeper) {
      result.push(current)
      i++
      continue
    }
    
    const next = curves[i + 1]
    
    if (next && !next.isChicane && !next.isTechnicalSection && !next.isSweeper) {
      const distanceBetween = next.distanceFromStart - (current.distanceFromStart + current.length)
      const sameDirection = current.direction === next.direction
      
      if (sameDirection && distanceBetween < MIN_CURVE_SEPARATION && distanceBetween >= 0) {
        const merged = mergeTwoCurves(current, next)
        
        let j = i + 2
        while (j < curves.length) {
          const another = curves[j]
          if (another.isChicane || another.isTechnicalSection || another.isSweeper) break
          
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
 * Apply road-type specific speed adjustments
 */
function applyRoadTypeSpeedAdjustments(curves, roadCharacteristics) {
  return curves.map(curve => {
    const adjusted = { ...curve }
    
    // Sweepers already have their speeds set
    if (curve.isSweeper) return adjusted
    
    if (roadCharacteristics.isHighway) {
      if (curve.severity <= 2) {
        adjusted.speedCruise = Math.min(70, curve.speedCruise + 15)
        adjusted.speedFast = Math.min(80, curve.speedFast + 15)
        adjusted.speedRace = Math.min(90, curve.speedRace + 15)
      } else if (curve.severity === 3) {
        adjusted.speedCruise = Math.min(60, curve.speedCruise + 8)
        adjusted.speedFast = Math.min(70, curve.speedFast + 8)
        adjusted.speedRace = Math.min(80, curve.speedRace + 8)
      }
    }
    
    return adjusted
  })
}

/**
 * Get basic modifier without shape analysis
 */
function getBasicModifier(totalAngle, severity, length) {
  const absAngle = Math.abs(totalAngle)
  
  if (absAngle > 150) return 'HAIRPIN'
  if (absAngle > 120 || severity >= 5) return 'SHARP'
  if (length > 100 && severity >= 3) return 'LONG'
  if (length > 120) return 'LONG'
  
  return null
}

/**
 * Get speed recommendations based on severity
 */
function getSpeedRecommendations(severity) {
  const speeds = {
    1: { speedCruise: 55, speedFast: 65, speedRace: 75 },
    2: { speedCruise: 50, speedFast: 60, speedRace: 70 },
    3: { speedCruise: 45, speedFast: 55, speedRace: 65 },
    4: { speedCruise: 35, speedFast: 45, speedRace: 55 },
    5: { speedCruise: 25, speedFast: 35, speedRace: 45 },
    6: { speedCruise: 20, speedFast: 30, speedRace: 40 },
  }
  return speeds[severity] || speeds[3]
}

/**
 * Log results
 */
function logResults(curves) {
  console.log(`📊 Final: ${curves.length} curves`)
  
  const sweepers = curves.filter(c => c.isSweeper)
  const chicanes = curves.filter(c => c.isChicane)
  const technical = curves.filter(c => c.isTechnicalSection)
  const regular = curves.filter(c => !c.isSweeper && !c.isChicane && !c.isTechnicalSection)
  
  console.log(`  🌊 Sweepers: ${sweepers.length}`)
  if (sweepers.length > 0) {
    sweepers.forEach(s => console.log(`    - ${s.direction} ${s.sweeperAngle}° @ ${s.distanceFromStart}m`))
  }
  
  console.log(`  🔀 Chicanes: ${chicanes.length}`)
  console.log(`  🏔️ Technical sections: ${technical.length}`)
  console.log(`  🔄 Regular curves: ${regular.length}`)
  
  const breakdown = {
    easy: curves.filter(c => c.severity <= 2).length,
    medium: curves.filter(c => c.severity === 3 || c.severity === 4).length,
    hard: curves.filter(c => c.severity >= 5).length
  }
  console.log(`Severity: ${breakdown.easy} easy, ${breakdown.medium} medium, ${breakdown.hard} hard`)
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
  if (radius > 400) severity = 1
  else if (radius > 250) severity = 1
  else if (radius > 150) severity = 2
  else if (radius > 90) severity = 3
  else if (radius > 50) severity = 4
  else if (radius > 25) severity = 5
  else severity = 6

  if (totalAngle > 150) severity = Math.max(severity, 5)
  else if (totalAngle > 120) severity = Math.max(severity, 4)
  else if (totalAngle > 90) severity = Math.max(severity, Math.min(6, severity + 1))
  else if (totalAngle > 60) severity = Math.max(severity, Math.min(5, severity + 1))

  return Math.min(6, Math.max(1, severity))
}

function getDistance(coord1, coord2) {
  const R = 6371e3
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

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
      const targetPoint = curve.entryPosition || curve.position
      const distance = getDistance(currentPosition, targetPoint)
      const bearingToCurve = getBearing(currentPosition, targetPoint)
      
      let angleDiff = bearingToCurve - heading
      while (angleDiff > 180) angleDiff -= 360
      while (angleDiff < -180) angleDiff += 360
      
      const absAngleDiff = Math.abs(angleDiff)
      const isPassed = distance < 50 && absAngleDiff > 70
      const isAhead = absAngleDiff < 100 && !isPassed
      
      return { 
        ...curve, 
        distance: Math.round(distance), 
        isAhead,
        isPassed,
        bearingToCurve: Math.round(bearingToCurve),
        angleDiff: Math.round(absAngleDiff)
      }
    })
    .filter(curve => curve.isAhead && curve.distance < maxDistance && curve.distance > 10)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
}

export default { detectCurves, getUpcomingCurves }
