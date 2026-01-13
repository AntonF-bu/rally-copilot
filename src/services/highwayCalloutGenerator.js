// ================================
// Highway Callout Generator v2.0
// 
// FIXED:
// - Includes sections in notable bend detection
// - Absolute danger rule for 30°+ bends
// - Checks first bend
// - No more rhythm filler
// ================================

// Callout types
export const CALLOUT_TYPE = {
  WAKE_UP: 'wake_up',           // After long straight, curves ahead
  SECTION_START: 'section_start', // Entering winding/technical section
  SECTION_END: 'section_end',     // Leaving technical section
  SWEEPER: 'sweeper',           // Notable curve 15°+
  DANGER: 'danger',             // High angle or difficulty spike
  OPENING: 'opening'            // After technical, road opens up
}

// Default templates (used if AI polish fails or disabled)
const TEMPLATES = {
  [CALLOUT_TYPE.WAKE_UP]: [
    "Heads up, curves ahead",
    "Stay alert, bends coming",
    "Curves returning"
  ],
  [CALLOUT_TYPE.SECTION_START]: [
    "Technical section ahead",
    "Winding stretch coming",
    "Active section ahead"
  ],
  [CALLOUT_TYPE.SECTION_END]: [
    "Clear ahead",
    "Straightens out",
    "Opening up"
  ],
  [CALLOUT_TYPE.SWEEPER]: {
    LEFT: ["Left sweeper ahead", "Sweeping left", "Left bend ahead"],
    RIGHT: ["Right sweeper ahead", "Sweeping right", "Right bend ahead"]
  },
  [CALLOUT_TYPE.DANGER]: [
    "Caution, tight ahead",
    "Sharp curves, stay focused",
    "Watch it, technical"
  ],
  [CALLOUT_TYPE.OPENING]: [
    "Opening up now",
    "Clear stretch ahead",
    "Relaxing now"
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
  
  console.log('📋 Generating callout slots v2.0...')
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
  // RULE 1: Absolute danger - Any bend 30°+ ALWAYS gets warned
  // ================================
  sortedBends.forEach(bend => {
    const angle = bend.angle || 0
    if (angle >= 30) {
      const triggerDistance = Math.max((bend.distanceFromStart || 0) - (0.5 * 1609.34), 0)
      const bendType = bend.isSection ? `${bend.bendCount} curves` : 'sharp bend'
      
      slots.push({
        type: CALLOUT_TYPE.DANGER,
        triggerDistance,
        triggerMile: triggerDistance / 1609.34,
        priority: 'critical',
        context: {
          direction: bend.direction,
          angle: angle,
          bendCount: bend.bendCount,
          isSection: bend.isSection
        },
        templateText: `${bend.direction || ''} ${angle}°, ${bendType}`.trim()
      })
      console.log(`   🔴 DANGER at mile ${(triggerDistance/1609.34).toFixed(1)}: ${angle}° ${bendType}`)
    }
  })
  
  // ================================
  // RULE 2: Notable bends/sections 18-29° (includes sections!)
  // ================================
  const notableBends = sortedBends.filter(b => {
    const angle = b.angle || 0
    return angle >= 18 && angle < 30  // 18-29° range (30+ handled above)
  })
  
  // Max 1 per 5 miles to avoid overload
  const notableBySegment = {}
  notableBends.forEach(bend => {
    const segment = Math.floor((bend.distanceFromStart || 0) / (5 * 1609.34))
    if (!notableBySegment[segment] || (bend.angle || 0) > (notableBySegment[segment].angle || 0)) {
      notableBySegment[segment] = bend
    }
  })
  
  Object.values(notableBySegment).forEach(bend => {
    const triggerDistance = Math.max((bend.distanceFromStart || 0) - (0.3 * 1609.34), 0)
    
    // Skip if too close to a danger callout
    const tooClose = slots.some(s => 
      Math.abs(s.triggerDistance - triggerDistance) < (0.8 * 1609.34)
    )
    
    if (!tooClose) {
      const bendType = bend.isSection ? 'section' : 'sweeper'
      slots.push({
        type: CALLOUT_TYPE.SWEEPER,
        triggerDistance,
        triggerMile: triggerDistance / 1609.34,
        priority: 'high',
        context: {
          direction: bend.direction,
          angle: bend.angle,
          bendCount: bend.bendCount,
          isSection: bend.isSection
        },
        templateText: pickTemplate(CALLOUT_TYPE.SWEEPER, bend.direction)
      })
      console.log(`   🌀 ${bendType.toUpperCase()} at mile ${(triggerDistance/1609.34).toFixed(1)}: ${bend.direction} ${bend.angle}°`)
    }
  })
  
  // ================================
  // RULE 3: Difficulty spikes (including first bend check)
  // ================================
  // Check first bend specially
  if (sortedBends.length > 0) {
    const first = sortedBends[0]
    const firstAngle = first.angle || 0
    if (firstAngle >= 20 && firstAngle < 30) {  // 30+ already handled
      const triggerDistance = Math.max((first.distanceFromStart || 0) - (0.5 * 1609.34), 0)
      const tooClose = slots.some(s => Math.abs(s.triggerDistance - triggerDistance) < (0.5 * 1609.34))
      
      if (!tooClose) {
        slots.push({
          type: CALLOUT_TYPE.DANGER,
          triggerDistance,
          triggerMile: triggerDistance / 1609.34,
          priority: 'high',
          context: { direction: first.direction, angle: firstAngle, isFirst: true },
          templateText: `${first.direction || ''} curves ahead, ${firstAngle}°`.trim()
        })
        console.log(`   ⚡ FIRST BEND at mile ${(triggerDistance/1609.34).toFixed(1)}: ${firstAngle}°`)
      }
    }
  }
  
  // Check spikes between consecutive bends
  for (let i = 1; i < sortedBends.length; i++) {
    const prev = sortedBends[i - 1]
    const curr = sortedBends[i]
    const prevAngle = prev.angle || 0
    const currAngle = curr.angle || 0
    
    // Spike: significant jump AND current is notable
    if (currAngle >= 18 && prevAngle < 12 && currAngle - prevAngle >= 8) {
      const triggerDistance = Math.max((curr.distanceFromStart || 0) - (0.5 * 1609.34), 0)
      
      const tooClose = slots.some(s => 
        Math.abs(s.triggerDistance - triggerDistance) < (0.8 * 1609.34)
      )
      
      if (!tooClose) {
        slots.push({
          type: CALLOUT_TYPE.DANGER,
          triggerDistance,
          triggerMile: triggerDistance / 1609.34,
          priority: currAngle >= 25 ? 'critical' : 'high',
          context: { prevAngle, currAngle, spike: currAngle - prevAngle },
          templateText: pickTemplate(CALLOUT_TYPE.DANGER)
        })
        console.log(`   ⚡ SPIKE at mile ${(triggerDistance/1609.34).toFixed(1)}: ${prevAngle}° → ${currAngle}°`)
      }
    }
  }
  
  // ================================
  // RULE 4: Wake-up after long straights (8+ miles)
  // ================================
  const gaps = findGaps(sortedBends, totalDistance)
  gaps.forEach(gap => {
    if (gap.length >= 8) {  // Raised from 5 to 8 miles
      const triggerDistance = Math.max(gap.endDistance - (0.5 * 1609.34), gap.startDistance)
      
      const tooClose = slots.some(s => 
        Math.abs(s.triggerDistance - triggerDistance) < (1 * 1609.34)
      )
      
      if (!tooClose) {
        slots.push({
          type: CALLOUT_TYPE.WAKE_UP,
          triggerDistance,
          triggerMile: triggerDistance / 1609.34,
          priority: gap.length >= 12 ? 'high' : 'medium',
          context: { gapLength: gap.length },
          templateText: pickTemplate(CALLOUT_TYPE.WAKE_UP)
        })
        console.log(`   💤 WAKE-UP at mile ${(triggerDistance/1609.34).toFixed(1)} (after ${gap.length.toFixed(0)}mi straight)`)
      }
    }
  })
  
  // ================================
  // RULE 5: Opening up after technical sections
  // ================================
  // Find where angle drops significantly after technical
  for (let i = 1; i < sortedBends.length; i++) {
    const prev = sortedBends[i - 1]
    const curr = sortedBends[i]
    const prevAngle = prev.angle || 0
    const currAngle = curr.angle || 0
    const gapMiles = ((curr.distanceFromStart || 0) - (prev.distanceFromStart || 0)) / 1609.34
    
    // After a 25°+ bend, if next is gentle and >2mi away
    if (prevAngle >= 25 && currAngle < 12 && gapMiles >= 2) {
      const triggerDistance = (prev.distanceFromStart || 0) + (0.3 * 1609.34)
      
      const tooClose = slots.some(s => 
        Math.abs(s.triggerDistance - triggerDistance) < (1 * 1609.34)
      )
      
      if (!tooClose) {
        slots.push({
          type: CALLOUT_TYPE.OPENING,
          triggerDistance,
          triggerMile: triggerDistance / 1609.34,
          priority: 'low',
          context: { afterAngle: prevAngle },
          templateText: pickTemplate(CALLOUT_TYPE.OPENING)
        })
        console.log(`   🟢 OPENING at mile ${(triggerDistance/1609.34).toFixed(1)} (after ${prevAngle}° section)`)
      }
    }
  }
  
  // ================================
  // RULE 6: Final technical section (only if TECHNICAL zone)
  // ================================
  const technicalZones = zones.filter(z => z.character === 'technical')
  technicalZones.forEach(zone => {
    const startMile = zone.startDistance / 1609.34
    const endMile = zone.endDistance / 1609.34
    const length = endMile - startMile
    
    if (length >= 1.0) {  // Only significant technical zones
      const startTrigger = Math.max(zone.startDistance - (0.5 * 1609.34), 0)
      
      const tooClose = slots.some(s => 
        Math.abs(s.triggerDistance - startTrigger) < (1 * 1609.34)
      )
      
      if (!tooClose) {
        slots.push({
          type: CALLOUT_TYPE.SECTION_START,
          triggerDistance: startTrigger,
          triggerMile: startTrigger / 1609.34,
          priority: 'high',
          context: { sectionLength: length },
          templateText: `Technical section, ${length.toFixed(1)} miles`
        })
        console.log(`   🔶 SECTION START at mile ${(startTrigger/1609.34).toFixed(1)} (${length.toFixed(1)}mi)`)
      }
      
      // Section end
      slots.push({
        type: CALLOUT_TYPE.SECTION_END,
        triggerDistance: zone.endDistance,
        triggerMile: endMile,
        priority: 'medium',
        context: { afterSection: true },
        templateText: pickTemplate(CALLOUT_TYPE.SECTION_END)
      })
      console.log(`   🔷 SECTION END at mile ${endMile.toFixed(1)}`)
    }
  })
  
  // ================================
  // NO MORE RHYTHM CALLOUTS - They were useless filler
  // ================================
  
  // Sort and dedupe
  const finalSlots = dedupeSlots(slots)
  
  console.log(`📋 Generated ${finalSlots.length} callout slots (no filler)`)
  
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
    
    if (gapMiles >= 5) {
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
  
  return gaps.sort((a, b) => b.length - a.length)
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
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...slots].sort((a, b) => {
    const distDiff = a.triggerDistance - b.triggerDistance
    if (Math.abs(distDiff) < 100) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    return distDiff
  })
  
  // Remove callouts too close together (within 0.7 miles)
  const minGap = 0.7 * 1609.34
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
 * Format slots for display
 */
export function formatSlotsForDisplay(slots) {
  return slots.map(slot => {
    let text = slot.templateText
    
    // For danger/sweeper with direction, ensure it's in the text
    if (slot.context?.direction && !text.toLowerCase().includes(slot.context.direction.toLowerCase())) {
      const dir = slot.context.direction === 'LEFT' ? 'Left' : 'Right'
      if (slot.type === CALLOUT_TYPE.SWEEPER) {
        text = `${dir} ${text.toLowerCase()}`
      }
    }
    
    return {
      id: `slot-${slot.triggerMile.toFixed(1)}`,
      position: slot.position,
      triggerDistance: slot.triggerDistance,
      triggerMile: slot.triggerMile,
      text,
      shortText: text.substring(0, 35),
      type: slot.type,
      priority: slot.priority,
      context: slot.context,
      isRuleBased: true
    }
  })
}
