// ================================
// Highway Callout Generator v1.0
// 
// Rule-based system that determines WHAT and WHERE
// AI only polishes the text (optional)
// ================================

// Callout types
export const CALLOUT_TYPE = {
  WAKE_UP: 'wake_up',           // After long straight, curves ahead
  SECTION_START: 'section_start', // Entering winding/technical section
  SECTION_END: 'section_end',     // Leaving technical section
  SWEEPER: 'sweeper',           // Notable curve 15°+
  DANGER: 'danger',             // Unexpected difficulty spike
  RHYTHM: 'rhythm'              // General character info
}

// Default templates (used if AI polish fails)
const TEMPLATES = {
  [CALLOUT_TYPE.WAKE_UP]: [
    "Heads up, curves ahead",
    "Road comes alive ahead",
    "Curves returning after straight",
    "Stay alert, bends coming up"
  ],
  [CALLOUT_TYPE.SECTION_START]: [
    "Winding section ahead",
    "Technical stretch coming up",
    "Active section ahead, stay sharp",
    "Curves for the next few miles"
  ],
  [CALLOUT_TYPE.SECTION_END]: [
    "Clear ahead",
    "Straightens out",
    "Opening up now",
    "Relax, straight stretch ahead"
  ],
  [CALLOUT_TYPE.SWEEPER]: {
    LEFT: [
      "Sweeping left ahead",
      "Nice left sweeper coming",
      "Left bend ahead"
    ],
    RIGHT: [
      "Sweeping right ahead", 
      "Nice right sweeper coming",
      "Right bend ahead"
    ]
  },
  [CALLOUT_TYPE.DANGER]: [
    "Caution, tightens here",
    "Watch it, sharper than it looks",
    "Heads up, tricky section"
  ],
  [CALLOUT_TYPE.RHYTHM]: [
    "Rolling curves ahead",
    "Gentle bends for a bit",
    "Easy curves, enjoy"
  ]
}

/**
 * Main export: Generate callout slots from route data
 * Pure rules - no AI needed
 */
export function generateCalloutSlots(highwayBends, zones, routeData) {
  const slots = []
  const totalDistance = routeData?.distance || 0
  const totalMiles = totalDistance / 1609.34
  
  console.log('📋 Generating callout slots...')
  console.log(`   Route: ${totalMiles.toFixed(1)} miles`)
  console.log(`   Highway bends: ${highwayBends?.length || 0}`)
  console.log(`   Zones: ${zones?.length || 0}`)
  
  if (!highwayBends?.length || !totalDistance) {
    console.warn('⚠️ Insufficient data for callout generation')
    return []
  }
  
  // Sort bends by distance
  const sortedBends = [...highwayBends].sort((a, b) => 
    (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
  )
  
  // ================================
  // RULE 1: Wake-up calls after long straights
  // ================================
  const gaps = findGaps(sortedBends, totalDistance)
  gaps.forEach(gap => {
    if (gap.length >= 5) { // 5+ mile gap
      // Place wake-up 0.5 miles before curves return
      const triggerDistance = Math.max(gap.endDistance - (0.5 * 1609.34), gap.startDistance)
      slots.push({
        type: CALLOUT_TYPE.WAKE_UP,
        triggerDistance,
        triggerMile: triggerDistance / 1609.34,
        priority: gap.length >= 10 ? 'high' : 'medium',
        context: {
          gapLength: gap.length,
          afterMiles: gap.startMile
        },
        templateText: pickTemplate(CALLOUT_TYPE.WAKE_UP)
      })
      console.log(`   💤 Wake-up at mile ${(triggerDistance/1609.34).toFixed(1)} (after ${gap.length.toFixed(0)}mi straight)`)
    }
  })
  
  // ================================
  // RULE 2: Section transitions (technical zones)
  // ================================
  const technicalZones = zones.filter(z => z.character === 'technical')
  technicalZones.forEach(zone => {
    const startMile = zone.startDistance / 1609.34
    const endMile = zone.endDistance / 1609.34
    const length = endMile - startMile
    
    // Only mark significant technical sections (0.5+ miles)
    if (length >= 0.5) {
      // Section start - warn 0.5 miles before
      const startTrigger = Math.max(zone.startDistance - (0.5 * 1609.34), 0)
      slots.push({
        type: CALLOUT_TYPE.SECTION_START,
        triggerDistance: startTrigger,
        triggerMile: startTrigger / 1609.34,
        priority: 'high',
        context: {
          sectionLength: length,
          sectionStart: startMile
        },
        templateText: pickTemplate(CALLOUT_TYPE.SECTION_START)
      })
      console.log(`   🔶 Section start at mile ${(startTrigger/1609.34).toFixed(1)} (${length.toFixed(1)}mi technical)`)
      
      // Section end
      slots.push({
        type: CALLOUT_TYPE.SECTION_END,
        triggerDistance: zone.endDistance,
        triggerMile: endMile,
        priority: 'medium',
        context: { afterSection: true },
        templateText: pickTemplate(CALLOUT_TYPE.SECTION_END)
      })
      console.log(`   🔷 Section end at mile ${endMile.toFixed(1)}`)
    }
  })
  
  // ================================
  // RULE 3: Notable sweepers (15°+)
  // ================================
  const notableSweepers = sortedBends.filter(b => 
    !b.isSection && 
    b.angle >= 15 && // Must be 15°+ to be notable
    b.angle < 40 // Not too sharp (those are in technical sections)
  )
  
  // Don't over-call sweepers - max 1 per 5 miles, pick the best
  const sweepersBySegment = {}
  notableSweepers.forEach(s => {
    const segment = Math.floor((s.distanceFromStart || 0) / (5 * 1609.34)) // 5-mile segments
    if (!sweepersBySegment[segment] || s.angle > sweepersBySegment[segment].angle) {
      sweepersBySegment[segment] = s
    }
  })
  
  Object.values(sweepersBySegment).forEach(sweeper => {
    const mile = (sweeper.distanceFromStart || 0) / 1609.34
    // Warn 0.3 miles before
    const triggerDistance = Math.max(sweeper.distanceFromStart - (0.3 * 1609.34), 0)
    
    // Skip if too close to a section start/end
    const tooCloseToSection = slots.some(s => 
      (s.type === CALLOUT_TYPE.SECTION_START || s.type === CALLOUT_TYPE.SECTION_END) &&
      Math.abs(s.triggerDistance - triggerDistance) < 1609.34 // Within 1 mile
    )
    
    if (!tooCloseToSection) {
      slots.push({
        type: CALLOUT_TYPE.SWEEPER,
        triggerDistance,
        triggerMile: triggerDistance / 1609.34,
        priority: sweeper.angle >= 20 ? 'high' : 'medium',
        context: {
          direction: sweeper.direction,
          angle: sweeper.angle,
          bendId: sweeper.id
        },
        templateText: pickTemplate(CALLOUT_TYPE.SWEEPER, sweeper.direction)
      })
      console.log(`   🌀 Sweeper at mile ${(triggerDistance/1609.34).toFixed(1)} (${sweeper.direction} ${sweeper.angle}°)`)
    }
  })
  
  // ================================
  // RULE 4: Danger zones (difficulty spikes)
  // ================================
  // Find places where angle suddenly increases after gentle section
  for (let i = 1; i < sortedBends.length; i++) {
    const prev = sortedBends[i - 1]
    const curr = sortedBends[i]
    const prevAngle = prev.angle || (prev.isSection ? 15 : 0)
    const currAngle = curr.angle || (curr.isSection ? 20 : 0)
    
    // Significant jump in difficulty
    if (currAngle >= 20 && prevAngle < 12 && currAngle - prevAngle >= 10) {
      const triggerDistance = Math.max(curr.distanceFromStart - (0.5 * 1609.34), 0)
      
      // Skip if already covered by another callout nearby
      const alreadyCovered = slots.some(s => 
        Math.abs(s.triggerDistance - triggerDistance) < (0.5 * 1609.34)
      )
      
      if (!alreadyCovered) {
        slots.push({
          type: CALLOUT_TYPE.DANGER,
          triggerDistance,
          triggerMile: triggerDistance / 1609.34,
          priority: 'critical',
          context: {
            prevAngle,
            currAngle,
            spike: currAngle - prevAngle
          },
          templateText: pickTemplate(CALLOUT_TYPE.DANGER)
        })
        console.log(`   ⚠️ Danger zone at mile ${(triggerDistance/1609.34).toFixed(1)} (${prevAngle}° → ${currAngle}°)`)
      }
    }
  }
  
  // ================================
  // RULE 5: Ensure spatial coverage
  // ================================
  // If we have big gaps in callouts (10+ miles), add rhythm callouts
  const sortedSlots = [...slots].sort((a, b) => a.triggerDistance - b.triggerDistance)
  const coverageGaps = []
  
  let lastCalloutMile = 0
  sortedSlots.forEach(slot => {
    const gapMiles = slot.triggerMile - lastCalloutMile
    if (gapMiles > 10) {
      coverageGaps.push({
        startMile: lastCalloutMile,
        endMile: slot.triggerMile,
        midMile: lastCalloutMile + gapMiles / 2
      })
    }
    lastCalloutMile = slot.triggerMile
  })
  
  // Check gap to end of route
  if (totalMiles - lastCalloutMile > 10) {
    coverageGaps.push({
      startMile: lastCalloutMile,
      endMile: totalMiles,
      midMile: lastCalloutMile + (totalMiles - lastCalloutMile) / 2
    })
  }
  
  // Add rhythm callouts in coverage gaps (only if there are bends there)
  coverageGaps.forEach(gap => {
    const bendsInGap = sortedBends.filter(b => {
      const mile = (b.distanceFromStart || 0) / 1609.34
      return mile >= gap.startMile && mile <= gap.endMile
    })
    
    if (bendsInGap.length > 0) {
      const triggerDistance = gap.midMile * 1609.34
      slots.push({
        type: CALLOUT_TYPE.RHYTHM,
        triggerDistance,
        triggerMile: gap.midMile,
        priority: 'low',
        context: {
          bendCount: bendsInGap.length
        },
        templateText: pickTemplate(CALLOUT_TYPE.RHYTHM)
      })
      console.log(`   🎵 Rhythm at mile ${gap.midMile.toFixed(1)} (coverage fill)`)
    }
  })
  
  // ================================
  // Sort and dedupe
  // ================================
  const finalSlots = dedupeSlots(slots)
  
  console.log(`📋 Generated ${finalSlots.length} callout slots`)
  
  return finalSlots
}

/**
 * Find gaps (straight sections) between bends
 */
function findGaps(sortedBends, totalDistance) {
  const gaps = []
  let lastDistance = 0
  
  sortedBends.forEach(bend => {
    const distance = bend.distanceFromStart || 0
    const gapMeters = distance - lastDistance
    const gapMiles = gapMeters / 1609.34
    
    if (gapMiles >= 3) { // Minimum 3 miles to be notable
      gaps.push({
        startDistance: lastDistance,
        endDistance: distance,
        startMile: lastDistance / 1609.34,
        endMile: distance / 1609.34,
        length: gapMiles
      })
    }
    lastDistance = distance
  })
  
  // Check gap from last bend to end of route
  const finalGap = (totalDistance - lastDistance) / 1609.34
  if (finalGap >= 3) {
    gaps.push({
      startDistance: lastDistance,
      endDistance: totalDistance,
      startMile: lastDistance / 1609.34,
      endMile: totalDistance / 1609.34,
      length: finalGap
    })
  }
  
  return gaps.sort((a, b) => b.length - a.length) // Longest first
}

/**
 * Pick a random template for variety
 */
function pickTemplate(type, direction = null) {
  if (type === CALLOUT_TYPE.SWEEPER && direction) {
    const templates = TEMPLATES[type][direction] || TEMPLATES[type].RIGHT
    return templates[Math.floor(Math.random() * templates.length)]
  }
  
  const templates = TEMPLATES[type]
  if (Array.isArray(templates)) {
    return templates[Math.floor(Math.random() * templates.length)]
  }
  return "Heads up"
}

/**
 * Remove duplicate/overlapping callouts
 */
function dedupeSlots(slots) {
  // Sort by distance, then by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...slots].sort((a, b) => {
    const distDiff = a.triggerDistance - b.triggerDistance
    if (Math.abs(distDiff) < 100) { // Within 100m, sort by priority
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    return distDiff
  })
  
  // Remove callouts too close together (within 0.5 miles)
  const minGap = 0.5 * 1609.34
  const deduped = []
  
  sorted.forEach(slot => {
    const tooClose = deduped.some(existing => 
      Math.abs(existing.triggerDistance - slot.triggerDistance) < minGap
    )
    if (!tooClose) {
      deduped.push(slot)
    }
  })
  
  return deduped.sort((a, b) => a.triggerDistance - b.triggerDistance)
}

/**
 * Add positions to slots by interpolating along route
 */
export function addPositionsToSlots(slots, coordinates, totalDistance) {
  return slots.map(slot => {
    const position = interpolatePosition(coordinates, slot.triggerDistance, totalDistance)
    return { ...slot, position }
  })
}

/**
 * Interpolate position along route
 */
function interpolatePosition(coordinates, distance, totalDistance) {
  if (!coordinates?.length || !totalDistance || distance < 0) return null
  
  const ratio = Math.min(Math.max(distance / totalDistance, 0), 1)
  const index = Math.floor(ratio * (coordinates.length - 1))
  const nextIndex = Math.min(index + 1, coordinates.length - 1)
  
  const segmentRatio = (ratio * (coordinates.length - 1)) - index
  
  const lng = coordinates[index][0] + (coordinates[nextIndex][0] - coordinates[index][0]) * segmentRatio
  const lat = coordinates[index][1] + (coordinates[nextIndex][1] - coordinates[index][1]) * segmentRatio
  
  return [lng, lat]
}

/**
 * Format slots for display (without AI polish)
 */
export function formatSlotsForDisplay(slots) {
  return slots.map(slot => {
    // For sweepers, ensure direction is in the text
    let text = slot.aiText || slot.templateText
    if (slot.type === CALLOUT_TYPE.SWEEPER && slot.context?.direction) {
      const dir = slot.context.direction.toLowerCase()
      // Verify the text contains the correct direction
      if (!text.toLowerCase().includes(dir)) {
        console.warn(`⚠️ Direction mismatch: slot says ${slot.context.direction} but text is "${text}"`)
        // Force correct direction in template
        text = `${slot.context.direction === 'LEFT' ? 'Left' : 'Right'} sweeper ahead`
      }
    }
    
    return {
      id: `slot-${slot.triggerMile.toFixed(1)}`,
      position: slot.position,
      triggerDistance: slot.triggerDistance,
      triggerMile: slot.triggerMile,
      text,
      shortText: text.substring(0, 30),
      type: slot.type,
      priority: slot.priority,
      direction: slot.context?.direction, // Expose direction for debugging
      isRuleBased: true
    }
  })
}
