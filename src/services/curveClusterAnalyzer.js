/**
 * Curve Cluster Analyzer v1.0
 * 
 * Detects technical sections by finding clusters of curves that require active driving.
 * A technical section is defined by PATTERNS, not density:
 * - 3+ curves within 0.5 miles
 * - Average angle > 20° (meaningful curves, not gentle bends)
 * 
 * This runs BEFORE Census classification and takes priority for road character.
 */

/**
 * Analyze route for technical clusters
 * @param {Array} events - Road flow events with mile, angle, direction, zone, type
 * @param {Object} options - Configuration options
 * @returns {Object} - { clusters: [], technicalZones: [], stats: {} }
 */
export function analyzeCurveClusters(events, options = {}) {
  const {
    clusterWindowMiles = 0.5,      // Look ahead window for clustering
    minCurvesInCluster = 3,        // Minimum curves to form a cluster
    minAvgAngle = 20,              // Minimum average angle for cluster
    minSingleAngle = 8,            // Minimum angle to count as a curve
    mergeGapMiles = 0.3,           // Merge clusters within this gap
    extendBufferMiles = 0.1        // Extend zone boundaries slightly
  } = options

  console.log('🔍 Curve Cluster Analyzer v1.0')
  console.log(`   Input events: ${events.length}`)
  console.log(`   Window: ${clusterWindowMiles}mi, Min curves: ${minCurvesInCluster}, Min avg angle: ${minAvgAngle}°`)

  if (!events.length) {
    return { clusters: [], technicalZones: [], stats: { totalClusters: 0 } }
  }

  // Filter to meaningful curves only (ignore tiny angle changes)
  const curves = events.filter(e => (e.angle || 0) >= minSingleAngle)
  console.log(`   Meaningful curves (≥${minSingleAngle}°): ${curves.length}`)

  // Step 1: Find all potential clusters
  const clusters = findClusters(curves, clusterWindowMiles, minCurvesInCluster, minAvgAngle)
  console.log(`   Raw clusters found: ${clusters.length}`)

  // Step 2: Merge overlapping/adjacent clusters
  const mergedClusters = mergeClusters(clusters, mergeGapMiles)
  console.log(`   After merging: ${mergedClusters.length}`)

  // Step 3: Convert clusters to technical zones
  const technicalZones = clustersToZones(mergedClusters, extendBufferMiles)

  // Log results
  if (technicalZones.length > 0) {
    console.log(`   Technical zones detected:`)
    technicalZones.forEach((zone, i) => {
      console.log(`      ${i + 1}. Mile ${zone.startMile.toFixed(1)} - ${zone.endMile.toFixed(1)} (${zone.lengthMiles.toFixed(1)}mi, ${zone.curveCount} curves, max ${zone.maxAngle}°)`)
    })
  } else {
    console.log(`   No technical zones detected`)
  }

  return {
    clusters: mergedClusters,
    technicalZones,
    stats: {
      totalClusters: mergedClusters.length,
      totalTechnicalMiles: technicalZones.reduce((sum, z) => sum + z.lengthMiles, 0),
      maxClusterDensity: mergedClusters.length > 0 
        ? Math.max(...mergedClusters.map(c => c.curves.length / c.lengthMiles))
        : 0
    }
  }
}

/**
 * Find clusters by sliding window approach
 */
function findClusters(curves, windowMiles, minCurves, minAvgAngle) {
  const clusters = []
  
  for (let i = 0; i < curves.length; i++) {
    const startCurve = curves[i]
    const startMile = startCurve.mile ?? startCurve.triggerMile ?? 0
    const endMile = startMile + windowMiles
    
    // Find all curves within the window
    const curvesInWindow = []
    for (let j = i; j < curves.length; j++) {
      const curveMile = curves[j].mile ?? curves[j].triggerMile ?? 0
      if (curveMile <= endMile) {
        curvesInWindow.push(curves[j])
      } else {
        break // Curves are sorted by mile, so we can stop
      }
    }
    
    // Check if this forms a valid cluster
    if (curvesInWindow.length >= minCurves) {
      const avgAngle = curvesInWindow.reduce((sum, c) => sum + (c.angle || 0), 0) / curvesInWindow.length
      
      if (avgAngle >= minAvgAngle) {
        const lastCurveMile = curvesInWindow[curvesInWindow.length - 1].mile ?? 
                              curvesInWindow[curvesInWindow.length - 1].triggerMile ?? 0
        
        clusters.push({
          startMile: startMile,
          endMile: lastCurveMile,
          curves: curvesInWindow,
          avgAngle: avgAngle,
          maxAngle: Math.max(...curvesInWindow.map(c => c.angle || 0)),
          lengthMiles: lastCurveMile - startMile
        })
      }
    }
  }
  
  return clusters
}

/**
 * Merge overlapping or adjacent clusters
 */
function mergeClusters(clusters, mergeGap) {
  if (clusters.length === 0) return []
  
  // Sort by start mile
  const sorted = [...clusters].sort((a, b) => a.startMile - b.startMile)
  
  const merged = [sorted[0]]
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    
    // Check if clusters overlap or are close enough to merge
    if (current.startMile <= last.endMile + mergeGap) {
      // Merge: extend the end, combine curves
      last.endMile = Math.max(last.endMile, current.endMile)
      last.lengthMiles = last.endMile - last.startMile
      
      // Add unique curves (avoid duplicates)
      const existingMiles = new Set(last.curves.map(c => c.mile ?? c.triggerMile))
      for (const curve of current.curves) {
        const curveMile = curve.mile ?? curve.triggerMile
        if (!existingMiles.has(curveMile)) {
          last.curves.push(curve)
          existingMiles.add(curveMile)
        }
      }
      
      // Recalculate stats
      last.avgAngle = last.curves.reduce((sum, c) => sum + (c.angle || 0), 0) / last.curves.length
      last.maxAngle = Math.max(...last.curves.map(c => c.angle || 0))
    } else {
      // No overlap - add as new cluster
      merged.push(current)
    }
  }
  
  return merged
}

/**
 * Convert merged clusters to technical zones with metadata
 */
function clustersToZones(clusters, extendBuffer) {
  return clusters.map(cluster => {
    // Determine zone character based on curve patterns
    let character = 'technical'
    const curvesPerMile = cluster.curves.length / Math.max(cluster.lengthMiles, 0.1)
    
    if (cluster.maxAngle >= 90) {
      character = 'switchbacks'
    } else if (curvesPerMile >= 5) {
      character = 'tight-technical'
    } else if (cluster.avgAngle >= 35) {
      character = 'aggressive'
    } else {
      character = 'sweeping'
    }
    
    return {
      startMile: Math.max(0, cluster.startMile - extendBuffer),
      endMile: cluster.endMile + extendBuffer,
      lengthMiles: cluster.endMile - cluster.startMile + (extendBuffer * 2),
      curveCount: cluster.curves.length,
      avgAngle: Math.round(cluster.avgAngle),
      maxAngle: cluster.maxAngle,
      curvesPerMile: curvesPerMile.toFixed(1),
      character,
      curves: cluster.curves
    }
  })
}

/**
 * Apply technical zones to existing segments
 * This modifies segment classification based on detected clusters
 * 
 * @param {Array} segments - Existing segments from Census classification
 * @param {Array} technicalZones - Detected technical zones from cluster analysis
 * @returns {Array} - Updated segments with technical zones applied
 */
export function applyTechnicalZones(segments, technicalZones) {
  if (!technicalZones.length) {
    console.log('   No technical zones to apply')
    return segments
  }
  
  console.log(`\n🔧 Applying ${technicalZones.length} technical zones to ${segments.length} segments`)
  
  // Convert segments to mile-based for easier manipulation
  const segmentsWithMiles = segments.map(seg => ({
    ...seg,
    startMile: seg.startDistance / 1609.34,
    endMile: seg.endDistance / 1609.34
  }))
  
  const result = []
  let changesApplied = 0
  
  for (const segment of segmentsWithMiles) {
    // Find any technical zones that overlap with this segment
    const overlappingZones = technicalZones.filter(zone => 
      zone.startMile < segment.endMile && zone.endMile > segment.startMile
    )
    
    if (overlappingZones.length === 0) {
      // No overlap - keep segment as-is
      result.push(segment)
    } else {
      // Split segment based on technical zones
      const splits = splitSegmentByZones(segment, overlappingZones)
      result.push(...splits)
      
      if (splits.some(s => s.character === 'technical' && segment.character !== 'technical')) {
        changesApplied++
      }
    }
  }
  
  console.log(`   Changes applied: ${changesApplied}`)
  console.log(`   Resulting segments: ${result.length}`)
  
  // Clean up: merge adjacent segments with same character
  const cleaned = mergeAdjacentSegments(result)
  console.log(`   After cleanup: ${cleaned.length} segments`)
  
  return cleaned
}

/**
 * Split a segment based on overlapping technical zones
 */
function splitSegmentByZones(segment, zones) {
  const splits = []
  let currentMile = segment.startMile
  
  // Sort zones by start mile
  const sortedZones = [...zones].sort((a, b) => a.startMile - b.startMile)
  
  for (const zone of sortedZones) {
    // Add non-technical portion before the zone (if any)
    if (zone.startMile > currentMile) {
      splits.push({
        ...segment,
        startMile: currentMile,
        endMile: Math.min(zone.startMile, segment.endMile),
        startDistance: currentMile * 1609.34,
        endDistance: Math.min(zone.startMile, segment.endMile) * 1609.34
      })
    }
    
    // Add the technical zone portion
    const techStart = Math.max(zone.startMile, segment.startMile)
    const techEnd = Math.min(zone.endMile, segment.endMile)
    
    if (techEnd > techStart) {
      splits.push({
        ...segment,
        character: 'technical',
        startMile: techStart,
        endMile: techEnd,
        startDistance: techStart * 1609.34,
        endDistance: techEnd * 1609.34,
        clusterData: zone // Attach cluster metadata
      })
    }
    
    currentMile = Math.max(currentMile, zone.endMile)
  }
  
  // Add remaining non-technical portion (if any)
  if (currentMile < segment.endMile) {
    splits.push({
      ...segment,
      startMile: currentMile,
      endMile: segment.endMile,
      startDistance: currentMile * 1609.34,
      endDistance: segment.endMile * 1609.34
    })
  }
  
  return splits.filter(s => s.endMile > s.startMile) // Remove zero-length segments
}

/**
 * Merge adjacent segments with the same character
 */
function mergeAdjacentSegments(segments) {
  if (segments.length === 0) return []
  
  const sorted = [...segments].sort((a, b) => a.startMile - b.startMile)
  const merged = [sorted[0]]
  
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]
    
    // Merge if same character and adjacent (within 0.1 mile tolerance)
    if (current.character === last.character && 
        Math.abs(current.startMile - last.endMile) < 0.1) {
      last.endMile = current.endMile
      last.endDistance = current.endDistance
    } else {
      merged.push(current)
    }
  }
  
  return merged
}

/**
 * Quick utility to check if a mile position is in a technical zone
 */
export function isInTechnicalZone(mile, technicalZones) {
  return technicalZones.some(zone => mile >= zone.startMile && mile <= zone.endMile)
}

export default {
  analyzeCurveClusters,
  applyTechnicalZones,
  isInTechnicalZone
}
