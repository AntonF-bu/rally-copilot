// ================================
// Curve Cluster Zone Classifier v2.0
// 
// Uses CLUSTER detection instead of density windows
// 
// Philosophy: Technical sections are defined by CLUSTERS of curves
// that require active driving, not by curves-per-mile averages.
// 
// A technical zone is where you have 3+ curves within 0.5 miles
// with meaningful angles (avg 15°+)
// ================================

/**
 * Cluster detection parameters
 */
const CLUSTER_CONFIG = {
  // Cluster formation
  clusterWindowMiles: 0.5,       // Look ahead window for finding curve groups
  minCurvesInCluster: 3,         // Minimum curves to form a cluster
  minAvgAngleForCluster: 15,     // Minimum average angle for cluster (lowered for sensitivity)
  minSingleAngle: 8,             // Minimum angle to count as a meaningful curve
  
  // Cluster merging
  mergeGapMiles: 0.4,            // Merge clusters that are close together
  extendBufferMiles: 0.15,       // Extend zone boundaries slightly for safety
  
  // Override rules (these always trigger technical regardless of cluster)
  dangerAngleThreshold: 45,      // Any curve 45°+ = technical zone
  multiDangerThreshold: 2,       // 2+ danger curves nearby = technical
  
  // Minimum zone size
  minTechnicalZoneMiles: 0.3     // Don't create tiny technical zones
}

/**
 * Main export: Classify zones based on curve clusters
 * 
 * @param {Array} coordinates - Route coordinates
 * @param {Array} flowEvents - Events from Road Flow Analyzer
 * @param {number} totalDistance - Total route distance in meters
 * @param {Array} censusSegments - Optional census-based segments for urban detection
 * @returns {Array} Classified zone segments
 */
export function classifyZonesByCurveDensity(coordinates, flowEvents, totalDistance, censusSegments = []) {
  console.log('🎯 Curve Cluster Zone Classifier v2.0')
  
  const totalMiles = totalDistance / 1609.34
  const config = CLUSTER_CONFIG
  
  console.log(`   Total distance: ${totalMiles.toFixed(1)} miles`)
  console.log(`   Total events: ${flowEvents.length}`)
  console.log(`   Cluster config: ${config.minCurvesInCluster}+ curves in ${config.clusterWindowMiles}mi, avg ${config.minAvgAngleForCluster}°+`)
  
  // Filter to meaningful curves
  const meaningfulCurves = flowEvents.filter(e => (e.angle || 0) >= config.minSingleAngle)
  console.log(`   Meaningful curves (≥${config.minSingleAngle}°): ${meaningfulCurves.length}`)
  
  // Step 1: Find danger curve zones (always technical)
  const dangerZones = findDangerZones(flowEvents, config)
  console.log(`   Danger zones: ${dangerZones.length}`)
  
  // Step 2: Find curve clusters
  const clusters = findCurveClusters(meaningfulCurves, config)
  console.log(`   Raw clusters: ${clusters.length}`)
  
  // Step 3: Merge clusters with danger zones
  const allTechnicalZones = mergeZones([...dangerZones, ...clusters], config.mergeGapMiles)
  console.log(`   Merged technical zones: ${allTechnicalZones.length}`)
  
  // Step 4: Extend zone boundaries
  const extendedZones = allTechnicalZones.map(zone => ({
    ...zone,
    startMile: Math.max(0, zone.startMile - config.extendBufferMiles),
    endMile: Math.min(totalMiles, zone.endMile + config.extendBufferMiles)
  }))
  
  // Step 5: Filter out tiny zones
  const validZones = extendedZones.filter(z => 
    (z.endMile - z.startMile) >= config.minTechnicalZoneMiles
  )
  console.log(`   Valid technical zones (≥${config.minTechnicalZoneMiles}mi): ${validZones.length}`)
  
  // Step 6: Build final segment list (technical zones + transit gaps)
  const segments = buildSegmentList(validZones, totalMiles, censusSegments)
  
  // Format and output
  const output = formatSegments(segments, totalDistance)
  
  console.log(`   Final segments: ${output.length}`)
  output.forEach((s, i) => {
    console.log(`   ${i + 1}. [${s.startMile.toFixed(1)} - ${s.endMile.toFixed(1)} mi] ${s.character.toUpperCase()} (${(s.endMile - s.startMile).toFixed(1)} mi) - ${s.reason || ''}`)
  })
  
  return output
}

/**
 * Find zones around danger curves (always technical)
 */
function findDangerZones(events, config) {
  const dangerEvents = events.filter(e => 
    e.type === 'danger' || (e.angle || 0) >= config.dangerAngleThreshold
  )
  
  return dangerEvents.map(e => ({
    startMile: e.mile - 0.1,  // Small buffer before danger curve
    endMile: e.mile + 0.1,    // Small buffer after
    reason: `danger curve ${e.angle}°`,
    curveCount: 1,
    maxAngle: e.angle
  }))
}

/**
 * Find curve clusters using sliding window
 */
function findCurveClusters(curves, config) {
  if (curves.length < config.minCurvesInCluster) return []
  
  const clusters = []
  const windowMiles = config.clusterWindowMiles
  const minCurves = config.minCurvesInCluster
  const minAvgAngle = config.minAvgAngleForCluster
  
  // Sort curves by mile
  const sortedCurves = [...curves].sort((a, b) => (a.mile || 0) - (b.mile || 0))
  
  for (let i = 0; i < sortedCurves.length; i++) {
    const startCurve = sortedCurves[i]
    const startMile = startCurve.mile || 0
    const endMile = startMile + windowMiles
    
    // Collect curves in window
    const curvesInWindow = []
    for (let j = i; j < sortedCurves.length; j++) {
      const curveMile = sortedCurves[j].mile || 0
      if (curveMile <= endMile) {
        curvesInWindow.push(sortedCurves[j])
      } else {
        break
      }
    }
    
    // Check if valid cluster
    if (curvesInWindow.length >= minCurves) {
      const avgAngle = curvesInWindow.reduce((sum, c) => sum + (c.angle || 0), 0) / curvesInWindow.length
      
      if (avgAngle >= minAvgAngle) {
        const lastMile = curvesInWindow[curvesInWindow.length - 1].mile || 0
        
        clusters.push({
          startMile: startMile,
          endMile: lastMile,
          curveCount: curvesInWindow.length,
          avgAngle: Math.round(avgAngle),
          maxAngle: Math.max(...curvesInWindow.map(c => c.angle || 0)),
          reason: `${curvesInWindow.length} curves, avg ${Math.round(avgAngle)}°`
        })
      }
    }
  }
  
  return clusters
}

/**
 * Merge overlapping or adjacent zones
 */
function mergeZones(zones, mergeGap) {
  if (zones.length === 0) return []
  
  const sorted = [...zones].sort((a, b) => a.startMile - b.startMile)
  const merged = [{ ...sorted[0] }]
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    
    if (current.startMile <= last.endMile + mergeGap) {
      // Merge
      last.endMile = Math.max(last.endMile, current.endMile)
      last.curveCount = (last.curveCount || 0) + (current.curveCount || 0)
      last.maxAngle = Math.max(last.maxAngle || 0, current.maxAngle || 0)
      last.reason = `merged: ${last.curveCount} curves`
    } else {
      merged.push({ ...current })
    }
  }
  
  return merged
}

/**
 * Build complete segment list from technical zones
 */
function buildSegmentList(technicalZones, totalMiles, censusSegments) {
  const segments = []
  let currentMile = 0
  
  // Sort zones by start mile
  const sortedZones = [...technicalZones].sort((a, b) => a.startMile - b.startMile)
  
  for (const zone of sortedZones) {
    // Add transit segment before this zone (if gap exists)
    if (zone.startMile > currentMile + 0.1) {
      segments.push({
        startMile: currentMile,
        endMile: zone.startMile,
        character: 'transit',
        reason: 'no clusters'
      })
    }
    
    // Add the technical zone
    segments.push({
      startMile: Math.max(currentMile, zone.startMile),
      endMile: zone.endMile,
      character: 'technical',
      reason: zone.reason,
      curveCount: zone.curveCount,
      maxAngle: zone.maxAngle
    })
    
    currentMile = zone.endMile
  }
  
  // Add final transit segment if needed
  if (currentMile < totalMiles - 0.1) {
    segments.push({
      startMile: currentMile,
      endMile: totalMiles,
      character: 'transit',
      reason: 'no clusters'
    })
  }
  
  // Apply urban detection for first/last segments
  return applyUrbanFromCensus(segments, censusSegments, totalMiles)
}

/**
 * Apply urban classification from Census data for start/end of route
 */
function applyUrbanFromCensus(segments, censusSegments, totalMiles) {
  if (!segments.length || !censusSegments.length) return segments
  
  const result = [...segments]
  
  // Check first segment - if Census says urban and it's short, mark as urban
  const firstCensus = censusSegments[0]
  if (firstCensus?.character === 'urban') {
    const urbanEndMile = (firstCensus.end || firstCensus.endDistance) / 1609.34
    if (urbanEndMile <= 1.5 && result[0].character === 'transit') {
      // Split first segment if needed
      if (result[0].endMile > urbanEndMile) {
        const originalEnd = result[0].endMile
        result[0].endMile = urbanEndMile
        result[0].character = 'urban'
        result[0].reason = 'census: route start'
        
        result.splice(1, 0, {
          startMile: urbanEndMile,
          endMile: originalEnd,
          character: 'transit',
          reason: 'after urban start'
        })
      } else {
        result[0].character = 'urban'
        result[0].reason = 'census: route start'
      }
    }
  }
  
  // Check last segment - if Census says urban
  const lastCensus = censusSegments[censusSegments.length - 1]
  if (lastCensus?.character === 'urban') {
    const lastSegment = result[result.length - 1]
    const urbanStartMile = (lastCensus.start || lastCensus.startDistance) / 1609.34
    
    if (totalMiles - urbanStartMile <= 1.5 && lastSegment.character === 'transit') {
      if (lastSegment.startMile < urbanStartMile) {
        // Split
        const newEndMile = lastSegment.endMile
        lastSegment.endMile = urbanStartMile
        
        result.push({
          startMile: urbanStartMile,
          endMile: newEndMile,
          character: 'urban',
          reason: 'census: route end'
        })
      } else {
        lastSegment.character = 'urban'
        lastSegment.reason = 'census: route end'
      }
    }
  }
  
  return result
}

/**
 * Format segments to standard output format
 */
function formatSegments(segments, totalDistance) {
  return segments.map(seg => ({
    startMile: seg.startMile,
    endMile: seg.endMile,
    start: seg.startMile * 1609.34,
    end: seg.endMile * 1609.34,
    startDistance: seg.startMile * 1609.34,
    endDistance: seg.endMile * 1609.34,
    character: seg.character,
    reason: seg.reason,
    curveCount: seg.curveCount,
    maxAngle: seg.maxAngle
  }))
}

/**
 * Convert zone output to standard zone format (for compatibility)
 */
export function convertToZoneFormat(zones) {
  return zones.map(z => ({
    start: z.startDistance || z.start,
    end: z.endDistance || z.end,
    character: z.character,
    reason: z.reason
  }))
}

/**
 * Reassign zone to each event based on new classification
 */
export function reassignEventZones(events, zones) {
  return events.map(event => {
    const eventDistance = (event.mile || 0) * 1609.34
    
    // Find which zone this event falls into
    const zone = zones.find(z => {
      const start = z.start || z.startDistance || 0
      const end = z.end || z.endDistance || 0
      return eventDistance >= start && eventDistance <= end
    })
    
    return {
      ...event,
      zone: zone?.character || 'transit'
    }
  })
}

export default {
  classifyZonesByCurveDensity,
  convertToZoneFormat,
  reassignEventZones
}
