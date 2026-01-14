// ================================
// Curve-Density Zone Classifier v1.1
// 
// PRIMARY: Use curve density to classify zones
// SECONDARY: Use Census data only as tie-breaker
// 
// Philosophy: The ROAD tells us what type of driving it is,
// not the population density around it.
// ================================

/**
 * Classification thresholds
 * Based on curves per mile and curve severity
 */
const ZONE_THRESHOLDS = {
  // Technical: High curve density OR significant angles
  technical: {
    minCurvesPerMile: 2.0,      // 2+ curves/mile = likely technical
    minAvgAngle: 12,            // Average angle should be meaningful (lowered from 15)
    orDangerCount: 1,           // OR 1+ danger curves in window = technical (lowered from 2)
    orMaxAngle: 45,             // OR any curve 45°+ = technical segment (lowered from 60)
    orSignificantCount: 2       // OR 2+ significant curves in 0.5mi window
  },
  
  // Highway/Transit: Low curve density, gentle curves
  highway: {
    maxCurvesPerMile: 1.0,      // Less than 1 curve/mile (lowered from 1.5)
    maxAvgAngle: 20,            // Gentle sweepers only (lowered from 25)
  },
  
  // Urban: First/last segments in populated areas
  urban: {
    maxLength: 1.0,             // Urban segments are short (< 1 mile)
    typicallyFirstOrLast: true  // Usually at start/end of route
  }
}

/**
 * Minimum segment length to consider merging (in miles)
 */
const MIN_SEGMENT_LENGTH = 0.3

/**
 * Main export: Classify zones based on curve density
 * 
 * @param {Array} coordinates - Route coordinates
 * @param {Array} flowEvents - Events from Road Flow Analyzer
 * @param {number} totalDistance - Total route distance in meters
 * @param {Array} censusSegments - Optional census-based segments as fallback
 * @returns {Array} Classified zone segments
 */
export function classifyZonesByCurveDensity(coordinates, flowEvents, totalDistance, censusSegments = []) {
  console.log('🎯 Curve-Density Zone Classifier v1.1')
  
  const totalMiles = totalDistance / 1609.34
  
  // Step 1: Divide route into analysis windows (0.5 mile windows)
  const windowSize = 0.5 // miles
  const windows = createAnalysisWindows(flowEvents, totalMiles, windowSize)
  
  console.log(`   Total distance: ${totalMiles.toFixed(1)} miles`)
  console.log(`   Total events: ${flowEvents.length}`)
  console.log(`   Analysis windows: ${windows.length}`)
  
  // Debug: Show some window stats
  const windowsWithCurves = windows.filter(w => w.curveCount > 0)
  const windowsWithDanger = windows.filter(w => w.dangerCount > 0)
  const windowsWithSignificant = windows.filter(w => w.significantCount >= 2)
  console.log(`   Windows with curves: ${windowsWithCurves.length}`)
  console.log(`   Windows with danger curves: ${windowsWithDanger.length}`)
  console.log(`   Windows with 2+ significant: ${windowsWithSignificant.length}`)
  
  // Step 2: Classify each window based on curve density
  const classifiedWindows = windows.map(w => classifyWindow(w))
  
  // Debug: Count classifications
  const technicalWindows = classifiedWindows.filter(w => w.character === 'technical')
  const transitWindows = classifiedWindows.filter(w => w.character === 'transit')
  console.log(`   Classified: ${technicalWindows.length} technical, ${transitWindows.length} transit`)
  
  // Step 3: Merge adjacent windows with same classification
  const rawSegments = mergeAdjacentWindows(classifiedWindows)
  console.log(`   After merging: ${rawSegments.length} segments`)
  
  // Step 4: Apply urban detection for first/last segments
  const withUrban = applyUrbanDetection(rawSegments, censusSegments, totalMiles)
  
  // Step 5: Merge small segments into neighbors
  const finalSegments = mergeSmallSegments(withUrban, MIN_SEGMENT_LENGTH)
  
  // Step 6: Convert to standard segment format
  const output = formatSegments(finalSegments, totalDistance)
  
  console.log(`   Final segments: ${output.length}`)
  output.forEach((s, i) => {
    console.log(`   ${i + 1}. [${s.startMile.toFixed(1)} - ${s.endMile.toFixed(1)} mi] ${s.character.toUpperCase()} (${(s.endMile - s.startMile).toFixed(1)} mi) - ${s.reason || 'merged'}`)
  })
  
  return output
}

/**
 * Create analysis windows along the route
 */
function createAnalysisWindows(events, totalMiles, windowSize) {
  const windows = []
  
  for (let start = 0; start < totalMiles; start += windowSize) {
    const end = Math.min(start + windowSize, totalMiles)
    const length = end - start
    
    // Find events in this window
    const windowEvents = events.filter(e => {
      const eventMile = e.distance / 1609.34
      return eventMile >= start && eventMile < end
    })
    
    // Calculate metrics
    const curveCount = windowEvents.length
    const curvesPerMile = length > 0 ? curveCount / length : 0
    const angles = windowEvents.map(e => e.angle || 0)
    const avgAngle = angles.length > 0 ? angles.reduce((a, b) => a + b, 0) / angles.length : 0
    const maxAngle = angles.length > 0 ? Math.max(...angles) : 0
    const dangerCount = windowEvents.filter(e => e.type === 'danger').length
    const significantCount = windowEvents.filter(e => e.type === 'significant' || e.type === 'danger').length
    
    windows.push({
      startMile: start,
      endMile: end,
      length,
      curveCount,
      curvesPerMile,
      avgAngle,
      maxAngle,
      dangerCount,
      significantCount,
      events: windowEvents
    })
  }
  
  return windows
}

/**
 * Classify a single analysis window
 */
function classifyWindow(window) {
  const { curvesPerMile, avgAngle, maxAngle, dangerCount, significantCount } = window
  const t = ZONE_THRESHOLDS
  
  // Technical classification (highest priority)
  
  // Any danger curve = technical
  if (dangerCount >= t.technical.orDangerCount) {
    return { ...window, character: 'technical', reason: `${dangerCount} danger curve(s)` }
  }
  
  // Any very sharp curve = technical
  if (maxAngle >= t.technical.orMaxAngle) {
    return { ...window, character: 'technical', reason: `max angle ${maxAngle}°` }
  }
  
  // Multiple significant curves = technical
  if (significantCount >= t.technical.orSignificantCount) {
    return { ...window, character: 'technical', reason: `${significantCount} significant curves` }
  }
  
  // High curve density with meaningful angles = technical
  if (curvesPerMile >= t.technical.minCurvesPerMile && avgAngle >= t.technical.minAvgAngle) {
    return { ...window, character: 'technical', reason: `${curvesPerMile.toFixed(1)} curves/mi, avg ${avgAngle.toFixed(0)}°` }
  }
  
  // Highway classification - must have LOW curve density AND gentle angles
  if (curvesPerMile <= t.highway.maxCurvesPerMile && avgAngle <= t.highway.maxAvgAngle) {
    return { ...window, character: 'transit', reason: `${curvesPerMile.toFixed(1)} curves/mi, avg ${avgAngle.toFixed(0)}°` }
  }
  
  // In-between cases: if we have curves but not super dense, still call it technical
  // Better to be conservative and give technical callouts than miss curves
  if (curvesPerMile > 0) {
    return { ...window, character: 'technical', reason: `${curvesPerMile.toFixed(1)} curves/mi (in-between)` }
  }
  
  // Default: transit (no curves)
  return { ...window, character: 'transit', reason: 'no curves' }
}

/**
 * Merge adjacent windows with same classification
 */
function mergeAdjacentWindows(windows) {
  if (!windows.length) return []
  
  const segments = []
  let current = { ...windows[0] }
  
  for (let i = 1; i < windows.length; i++) {
    const w = windows[i]
    
    if (w.character === current.character) {
      // Merge: extend end, accumulate stats
      current.endMile = w.endMile
      current.length = current.endMile - current.startMile
      current.curveCount += w.curveCount
      current.dangerCount += w.dangerCount
      current.significantCount += w.significantCount
      current.events = [...current.events, ...w.events]
      // Recalculate averages
      const allAngles = current.events.map(e => e.angle || 0)
      current.avgAngle = allAngles.length > 0 ? allAngles.reduce((a, b) => a + b, 0) / allAngles.length : 0
      current.maxAngle = allAngles.length > 0 ? Math.max(...allAngles) : 0
      current.curvesPerMile = current.length > 0 ? current.curveCount / current.length : 0
    } else {
      // Different character - save current and start new
      segments.push(current)
      current = { ...w }
    }
  }
  
  // Don't forget the last segment
  segments.push(current)
  
  return segments
}

/**
 * Apply urban detection for first/last segments
 * Uses census data as a hint for urban areas
 */
function applyUrbanDetection(segments, censusSegments, totalMiles) {
  if (!segments.length) return segments
  
  const result = [...segments]
  
  // Check if census says first segment is urban
  const firstCensus = censusSegments[0]
  if (firstCensus?.character === 'urban' && result[0].startMile === 0) {
    // Only apply if the segment is short and has low curve density
    if (result[0].length <= 1.0 && result[0].curvesPerMile < 4) {
      result[0] = { ...result[0], character: 'urban', reason: 'route start (census: urban)' }
    }
  }
  
  // Check if census says last segment is urban
  const lastCensus = censusSegments[censusSegments.length - 1]
  const lastIdx = result.length - 1
  if (lastCensus?.character === 'urban' && result[lastIdx].endMile >= totalMiles - 0.1) {
    // Only apply if the segment is short
    if (result[lastIdx].length <= 1.0 && result[lastIdx].curvesPerMile < 4) {
      result[lastIdx] = { ...result[lastIdx], character: 'urban', reason: 'route end (census: urban)' }
    }
  }
  
  return result
}

/**
 * Merge small segments into their neighbors
 */
function mergeSmallSegments(segments, minLength) {
  if (segments.length <= 1) return segments
  
  const result = []
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    
    // If segment is too small, merge with neighbor
    if (seg.length < minLength && result.length > 0) {
      const prev = result[result.length - 1]
      const next = segments[i + 1]
      
      // Decide which neighbor to merge with
      // Prefer merging into technical (more conservative for callouts)
      if (prev.character === 'technical' || !next) {
        // Merge into previous
        prev.endMile = seg.endMile
        prev.length = prev.endMile - prev.startMile
        prev.curveCount += seg.curveCount
        prev.events = [...prev.events, ...seg.events]
      } else if (next?.character === 'technical') {
        // Let the next iteration handle merging into next
        result.push(seg)
      } else {
        // Merge into previous by default
        prev.endMile = seg.endMile
        prev.length = prev.endMile - prev.startMile
        prev.curveCount += seg.curveCount
        prev.events = [...prev.events, ...seg.events]
      }
    } else {
      result.push(seg)
    }
  }
  
  // Second pass: merge any remaining tiny segments
  const final = []
  for (let i = 0; i < result.length; i++) {
    const seg = result[i]
    if (seg.length < minLength && final.length > 0) {
      const prev = final[final.length - 1]
      prev.endMile = seg.endMile
      prev.length = prev.endMile - prev.startMile
    } else {
      final.push(seg)
    }
  }
  
  return final
}

/**
 * Format segments for output
 */
function formatSegments(segments, totalDistance) {
  return segments.map(seg => ({
    startMile: seg.startMile,
    endMile: seg.endMile,
    startDistance: seg.startMile * 1609.34,
    endDistance: seg.endMile * 1609.34,
    character: seg.character,
    curveCount: seg.curveCount,
    curvesPerMile: seg.curvesPerMile?.toFixed(1) || '0.0',
    avgAngle: seg.avgAngle?.toFixed(0) || '0',
    maxAngle: seg.maxAngle || 0,
    dangerCount: seg.dangerCount || 0,
    reason: seg.reason || ''
  }))
}

/**
 * Utility: Convert segments to the format expected by other services
 * NOTE: This function receives output from formatSegments which already has startDistance/endDistance
 */
export function convertToZoneFormat(densitySegments) {
  return densitySegments.map(seg => ({
    // Use startDistance/endDistance if available, otherwise calculate from miles
    start: seg.startDistance ?? (seg.startMile * 1609.34),
    end: seg.endDistance ?? (seg.endMile * 1609.34),
    startMile: seg.startMile,
    endMile: seg.endMile,
    character: seg.character,
    lengthMiles: seg.endMile - seg.startMile,
    // Include density stats for debugging
    stats: {
      curveCount: seg.curveCount,
      curvesPerMile: seg.curvesPerMile,
      avgAngle: seg.avgAngle,
      maxAngle: seg.maxAngle,
      dangerCount: seg.dangerCount
    }
  }))
}

/**
 * Reassign zone types to events based on new zone classification
 * Call this after classifying zones to update event.zone values
 * 
 * @param {Array} events - Events from Road Flow Analyzer
 * @param {Array} zones - New zone classification (from convertToZoneFormat)
 * @returns {Array} Events with updated zone assignments
 */
export function reassignEventZones(events, zones) {
  return events.map(event => {
    const eventDistance = event.distance
    
    // Find which zone this event falls into
    const zone = zones.find(z => eventDistance >= z.start && eventDistance < z.end)
    
    return {
      ...event,
      zone: zone?.character || 'transit',
      zoneType: zone?.character || 'transit'  // Some code uses zoneType
    }
  })
}
