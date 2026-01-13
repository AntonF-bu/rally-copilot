// ================================
// Road Flow Analyzer v1.0
// 
// Continuous sampling approach:
// 1. Sample heading at regular intervals
// 2. Detect patterns (sweepers, tight bends, chicanes)
// 3. Generate meaningful events with accurate positions
// ================================

// Sampling intervals by zone type (in meters)
export const SAMPLE_INTERVALS = {
  highway: 50,    // Sparse - we want big picture
  transit: 50,    // Same as highway
  urban: 25,      // Denser - more turns to track  
  technical: 15   // Dense - need to catch everything
}

// Thresholds for what counts as a "turn" by zone
// These are DETECTION thresholds - LLM decides what to actually call out
export const TURN_THRESHOLDS = {
  highway: {
    minAngle: 12,        // Lowered - catch more, let LLM filter
    sweeper: 18,         // 18°+ = notable sweeper
    significant: 30,     // 30°+ = significant curve
    danger: 45           // 45°+ = serious, warn early
  },
  transit: {
    minAngle: 12,        // Same as highway - catch gentle curves too
    sweeper: 18,
    significant: 30,
    danger: 45
  },
  urban: {
    minAngle: 40,        // Urban still high - lots of turns expected
    sweeper: 50,
    significant: 70,
    danger: 90
  },
  technical: {
    minAngle: 8,         // Technical - catch everything
    sweeper: 12,
    significant: 20,
    danger: 35
  }
}

/**
 * Main export: Analyze route and return flow events
 */
export function analyzeRoadFlow(coordinates, zones, totalDistance) {
  console.log('🌊 Road Flow Analyzer v1.0')
  console.log(`   Coordinates: ${coordinates?.length}`)
  console.log(`   Total distance: ${(totalDistance/1609.34).toFixed(1)} miles`)
  
  if (!coordinates?.length || !totalDistance) {
    console.warn('⚠️ Insufficient data for flow analysis')
    return { samples: [], events: [] }
  }
  
  // Step 1: Sample the road at appropriate intervals
  const samples = sampleRoad(coordinates, zones, totalDistance)
  console.log(`   Sampled ${samples.length} points`)
  
  // Step 2: Detect patterns/events from samples
  const events = detectEvents(samples, zones)
  console.log(`   Detected ${events.length} events`)
  
  // Step 3: Debug output
  dumpFlowData(samples, events, totalDistance)
  
  return { samples, events }
}

/**
 * Sample the road at regular intervals, recording heading changes
 */
function sampleRoad(coordinates, zones, totalDistance) {
  const samples = []
  
  // Build a distance lookup for coordinates
  const distances = buildDistanceLookup(coordinates)
  
  // Figure out sampling points
  let currentDistance = 0
  let sampleIndex = 0
  
  while (currentDistance < totalDistance) {
    // What zone are we in?
    const zone = getZoneAtDistance(zones, currentDistance)
    const zoneType = zone?.character || 'transit'
    const interval = SAMPLE_INTERVALS[zoneType] || SAMPLE_INTERVALS.transit
    
    // Get position and heading at this distance
    const position = getPositionAtDistance(coordinates, distances, currentDistance, totalDistance)
    const heading = getHeadingAtDistance(coordinates, distances, currentDistance, totalDistance)
    const prevHeading = samples.length > 0 ? samples[samples.length - 1].heading : heading
    
    // Calculate heading change from previous sample
    let headingChange = heading - prevHeading
    // Normalize to -180 to 180
    while (headingChange > 180) headingChange -= 360
    while (headingChange < -180) headingChange += 360
    
    samples.push({
      index: sampleIndex++,
      distance: currentDistance,
      mile: currentDistance / 1609.34,
      position,
      heading,
      headingChange,
      direction: headingChange > 0.5 ? 'RIGHT' : headingChange < -0.5 ? 'LEFT' : 'STRAIGHT',
      zoneType,
      interval
    })
    
    // Move to next sample point
    currentDistance += interval
  }
  
  return samples
}

/**
 * Build cumulative distance array for coordinates
 */
function buildDistanceLookup(coordinates) {
  const distances = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const d = haversineDistance(
      coordinates[i-1][1], coordinates[i-1][0],
      coordinates[i][1], coordinates[i][0]
    )
    distances.push(distances[i-1] + d)
  }
  return distances
}

/**
 * Get position at a specific distance along route
 */
function getPositionAtDistance(coordinates, distances, targetDistance, totalDistance) {
  if (targetDistance <= 0) return coordinates[0]
  if (targetDistance >= totalDistance) return coordinates[coordinates.length - 1]
  
  // Binary search for the segment
  let low = 0, high = distances.length - 1
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (distances[mid] <= targetDistance) low = mid
    else high = mid
  }
  
  // Interpolate within segment
  const segmentStart = distances[low]
  const segmentEnd = distances[high]
  const segmentLength = segmentEnd - segmentStart
  const ratio = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0
  
  const lng = coordinates[low][0] + (coordinates[high][0] - coordinates[low][0]) * ratio
  const lat = coordinates[low][1] + (coordinates[high][1] - coordinates[low][1]) * ratio
  
  return [lng, lat]
}

/**
 * Get heading at a specific distance along route
 */
function getHeadingAtDistance(coordinates, distances, targetDistance, totalDistance) {
  if (targetDistance <= 0) {
    return bearing(coordinates[0][1], coordinates[0][0], coordinates[1][1], coordinates[1][0])
  }
  if (targetDistance >= totalDistance - 50) {
    const n = coordinates.length
    return bearing(coordinates[n-2][1], coordinates[n-2][0], coordinates[n-1][1], coordinates[n-1][0])
  }
  
  // Find segment at target distance
  let low = 0, high = distances.length - 1
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (distances[mid] <= targetDistance) low = mid
    else high = mid
  }
  
  // Use a few points ahead for smoother heading
  const lookAhead = Math.min(high + 3, coordinates.length - 1)
  return bearing(
    coordinates[low][1], coordinates[low][0],
    coordinates[lookAhead][1], coordinates[lookAhead][0]
  )
}

/**
 * Get zone at specific distance
 */
function getZoneAtDistance(zones, distance) {
  if (!zones?.length) return null
  return zones.find(z => distance >= z.startDistance && distance < z.endDistance)
}

/**
 * Detect events (curves, sweepers, etc) from samples
 */
function detectEvents(samples, zones) {
  const events = []
  
  if (samples.length < 3) return events
  
  // Find runs of consecutive same-direction turns
  let runStart = null
  let runDirection = null
  let runTotalAngle = 0
  
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    const isturning = Math.abs(sample.headingChange) > 0.5
    const direction = sample.direction
    
    if (isturning && (direction === runDirection || runDirection === null)) {
      // Continue or start a run
      if (runStart === null) {
        runStart = i
        runDirection = direction
        runTotalAngle = 0
      }
      runTotalAngle += sample.headingChange
    } else {
      // End of run - evaluate if it's significant
      if (runStart !== null && Math.abs(runTotalAngle) >= 5) {
        const event = createEventFromRun(samples, runStart, i - 1, runTotalAngle, runDirection, zones)
        if (event) events.push(event)
      }
      
      // Start new run if this is a turn in different direction
      if (isturning && direction !== 'STRAIGHT') {
        runStart = i
        runDirection = direction
        runTotalAngle = sample.headingChange
      } else {
        runStart = null
        runDirection = null
        runTotalAngle = 0
      }
    }
  }
  
  // Don't forget last run
  if (runStart !== null && Math.abs(runTotalAngle) >= 5) {
    const event = createEventFromRun(samples, runStart, samples.length - 1, runTotalAngle, runDirection, zones)
    if (event) events.push(event)
  }
  
  return events
}

/**
 * Create an event from a run of samples
 */
function createEventFromRun(samples, startIdx, endIdx, totalAngle, direction, zones) {
  const startSample = samples[startIdx]
  const endSample = samples[endIdx]
  
  // Calculate metrics
  const lengthMeters = endSample.distance - startSample.distance
  const lengthMiles = lengthMeters / 1609.34
  const absAngle = Math.abs(totalAngle)
  const zoneType = startSample.zoneType
  
  // Get thresholds for this zone
  const thresholds = TURN_THRESHOLDS[zoneType] || TURN_THRESHOLDS.transit
  
  // Skip if below minimum threshold
  if (absAngle < thresholds.minAngle) {
    return null
  }
  
  // Classify the event
  let eventType = 'sweeper'
  let severity = 'low'
  
  if (absAngle >= thresholds.danger) {
    eventType = 'danger'
    severity = 'critical'
  } else if (absAngle >= thresholds.significant) {
    eventType = 'significant'
    severity = 'high'
  } else if (absAngle >= thresholds.sweeper) {
    eventType = 'sweeper'
    severity = 'medium'
  }
  
  // Determine shape based on angle per distance
  const anglePerMeter = absAngle / Math.max(lengthMeters, 1)
  let shape = 'sweeper'
  if (anglePerMeter > 0.15) shape = 'tight'
  else if (anglePerMeter > 0.08) shape = 'medium'
  else shape = 'sweeper'
  
  // Find the apex (point of maximum curvature)
  let maxCurvature = 0
  let apexIdx = startIdx
  for (let i = startIdx; i <= endIdx; i++) {
    const curvature = Math.abs(samples[i].headingChange)
    if (curvature > maxCurvature) {
      maxCurvature = curvature
      apexIdx = i
    }
  }
  const apexSample = samples[apexIdx]
  
  return {
    id: `event-${startSample.mile.toFixed(2)}`,
    type: eventType,
    shape,
    direction: direction === 'RIGHT' ? 'RIGHT' : 'LEFT',
    
    // Position info - use apex for accurate placement
    startDistance: startSample.distance,
    endDistance: endSample.distance,
    apexDistance: apexSample.distance,
    startMile: startSample.mile,
    endMile: endSample.mile,
    apexMile: apexSample.mile,
    position: apexSample.position, // This is where the curve actually is!
    
    // Metrics
    totalAngle: Math.round(absAngle),
    lengthMeters: Math.round(lengthMeters),
    lengthMiles: parseFloat(lengthMiles.toFixed(2)),
    anglePerMeter: parseFloat(anglePerMeter.toFixed(3)),
    
    // Classification
    severity,
    zoneType,
    
    // Sample count (for debugging)
    sampleCount: endIdx - startIdx + 1
  }
}

/**
 * Haversine distance between two points
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

/**
 * Calculate bearing between two points
 */
function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  
  const y = Math.sin(dLon) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon)
  
  let brng = Math.atan2(y, x) * 180 / Math.PI
  return (brng + 360) % 360
}

/**
 * Debug output
 */
function dumpFlowData(samples, events, totalDistance) {
  const totalMiles = totalDistance / 1609.34
  
  console.log('\n' + '='.repeat(80))
  console.log('🌊 ROAD FLOW ANALYSIS')
  console.log('='.repeat(80))
  
  console.log(`\n📊 SUMMARY`)
  console.log(`   Total distance: ${totalMiles.toFixed(1)} miles`)
  console.log(`   Samples: ${samples.length}`)
  console.log(`   Events detected: ${events.length}`)
  
  console.log(`\n🎯 EVENTS DETECTED`)
  console.log('-'.repeat(70))
  console.log('Mile  | Dir   | Angle | Length | Shape    | Type        | Zone')
  console.log('-'.repeat(70))
  
  events.forEach(e => {
    const mile = e.apexMile.toFixed(1).padStart(5)
    const dir = e.direction.padEnd(5)
    const angle = `${e.totalAngle}°`.padStart(5)
    const length = `${e.lengthMiles.toFixed(2)}mi`.padStart(7)
    const shape = e.shape.padEnd(8)
    const type = e.type.padEnd(11)
    const zone = e.zoneType
    
    console.log(`${mile} | ${dir} | ${angle} | ${length} | ${shape} | ${type} | ${zone}`)
  })
  
  console.log('\n' + '='.repeat(80))
  
  // Store for console access
  window.__roadFlowData = { samples, events }
  console.log('💡 Access with: window.__roadFlowData')
}

/**
 * Generate callouts from events
 */
export function generateCalloutsFromEvents(events, zones, totalDistance) {
  const callouts = []
  const totalMiles = totalDistance / 1609.34
  
  // Find gaps (long straights)
  const gaps = findGapsBetweenEvents(events, totalMiles)
  
  // Generate callout for each significant event
  events.forEach(event => {
    // Skip low severity unless it's after a long straight
    const afterLongStraight = gaps.some(g => 
      g.endMile <= event.apexMile && g.endMile >= event.apexMile - 2 && g.length >= 5
    )
    
    if (event.severity === 'low' && !afterLongStraight) {
      return // Skip minor events
    }
    
    // Build callout text based on event
    let text = ''
    const dir = event.direction.toLowerCase()
    
    if (event.type === 'danger') {
      text = `${event.direction} ${event.totalAngle}°, ${event.shape}`
    } else if (event.type === 'significant') {
      text = `${event.direction} ${event.totalAngle}° ${event.shape}`
    } else {
      text = `${event.direction} ${event.shape}, ${event.totalAngle}°`
    }
    
    // Trigger 0.3-0.5 miles before apex depending on severity
    const leadDistance = event.severity === 'critical' ? 0.5 : 0.3
    const triggerDistance = Math.max(event.apexDistance - (leadDistance * 1609.34), 0)
    
    callouts.push({
      id: event.id,
      type: event.type,
      text,
      direction: event.direction,
      totalAngle: event.totalAngle,
      shape: event.shape,
      severity: event.severity,
      triggerDistance,
      triggerMile: triggerDistance / 1609.34,
      apexDistance: event.apexDistance,
      apexMile: event.apexMile,
      position: event.position, // Actual curve position!
      lengthMiles: event.lengthMiles,
      zoneType: event.zoneType
    })
  })
  
  // Add wake-up calls after long straights
  gaps.forEach(gap => {
    if (gap.length >= 8) {
      const triggerDistance = gap.endDistance - (0.5 * 1609.34)
      callouts.push({
        id: `wakeup-${gap.endMile.toFixed(1)}`,
        type: 'wake_up',
        text: 'Curves ahead',
        severity: 'medium',
        triggerDistance,
        triggerMile: triggerDistance / 1609.34,
        position: null, // Will be interpolated
        gapLength: gap.length
      })
    }
  })
  
  // Sort by trigger distance
  callouts.sort((a, b) => a.triggerDistance - b.triggerDistance)
  
  // Dedupe - remove callouts too close together
  const deduped = []
  callouts.forEach(c => {
    const tooClose = deduped.some(existing => 
      Math.abs(existing.triggerDistance - c.triggerDistance) < 1000 // 1km min gap
    )
    if (!tooClose) {
      deduped.push(c)
    }
  })
  
  console.log(`\n📢 CALLOUTS GENERATED: ${deduped.length}`)
  deduped.forEach(c => {
    console.log(`   Mile ${c.triggerMile.toFixed(1)}: ${c.text} [${c.type}]`)
  })
  
  return deduped
}

/**
 * Find gaps between events
 */
function findGapsBetweenEvents(events, totalMiles) {
  const gaps = []
  let lastMile = 0
  
  events.forEach(event => {
    const gapLength = event.startMile - lastMile
    if (gapLength >= 3) {
      gaps.push({
        startMile: lastMile,
        endMile: event.startMile,
        startDistance: lastMile * 1609.34,
        endDistance: event.startMile * 1609.34,
        length: gapLength
      })
    }
    lastMile = event.endMile
  })
  
  // Gap to end
  if (totalMiles - lastMile >= 3) {
    gaps.push({
      startMile: lastMile,
      endMile: totalMiles,
      startDistance: lastMile * 1609.34,
      endDistance: totalMiles * 1609.34,
      length: totalMiles - lastMile
    })
  }
  
  return gaps.sort((a, b) => b.length - a.length)
}
