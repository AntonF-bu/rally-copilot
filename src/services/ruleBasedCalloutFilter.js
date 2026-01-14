// ================================
// Rule-Based Callout Filter v1.0
// 
// Deterministic filtering of Road Flow events
// No LLM in critical path - fast and reliable
// 
// Thresholds tuned for Boston→Amherst route testing
// ================================

/**
 * Main export: Filter road flow events into callouts
 * @param {Array} events - Road Flow events
 * @param {Object} routeInfo - Route metadata including total miles
 * @returns {Object} - Filtered callouts with analysis
 */
export function filterEventsToCallouts(events, routeInfo) {
  console.log('📋 Rule-Based Callout Filter v1.0')
  console.log(`   Input events: ${events.length}`)
  
  const totalMiles = routeInfo?.totalMiles || 0
  
  // Step 1: Apply zone-based thresholds
  const filteredEvents = events.filter(event => shouldCallout(event, events))
  
  console.log(`   After threshold filter: ${filteredEvents.length}`)
  
  // Step 2: Detect sequences (curves within 0.3mi of each other)
  const sequences = detectSequences(filteredEvents)
  
  console.log(`   Sequences detected: ${sequences.length}`)
  
  // Step 3: Detect zone transitions
  const transitions = detectZoneTransitions(events)
  
  console.log(`   Zone transitions: ${transitions.length}`)
  
  // Step 4: Detect wake-up opportunities (first curve after long straight)
  const wakeUps = detectWakeUpCalls(events, filteredEvents)
  
  console.log(`   Wake-up calls: ${wakeUps.length}`)
  
  // Step 5: Generate callouts with text
  const callouts = generateCallouts(filteredEvents, sequences, transitions, wakeUps)
  
  console.log(`   Final callouts: ${callouts.length}`)
  
  // Analysis summary
  const analysis = generateAnalysis(events, callouts, routeInfo)
  
  return {
    callouts,
    sequences,
    transitions,
    wakeUps,
    analysis,
    stats: {
      inputEvents: events.length,
      filteredEvents: filteredEvents.length,
      finalCallouts: callouts.length,
      byZone: {
        urban: callouts.filter(c => c.zone === 'urban').length,
        transit: callouts.filter(c => c.zone === 'transit').length,
        technical: callouts.filter(c => c.zone === 'technical').length
      }
    }
  }
}

/**
 * Core filtering logic - should this event become a callout?
 */
function shouldCallout(event, allEvents) {
  const { zoneType, totalAngle, type } = event
  
  // RULE 1: ALWAYS call danger curves (45°+ on highway, varies by zone)
  if (type === 'danger') return true
  
  // RULE 2: Zone-specific thresholds
  switch (zoneType) {
    case 'urban':
      // Urban: Only call 70°+ (hard turns)
      // Driver is slow, watching traffic - don't distract with minor curves
      return totalAngle >= 70
      
    case 'transit':
      // Highway: Call 25°+ (feelable at speed)
      // Plus significant curves (30°+)
      // Plus anything after a long straight (handled separately in wake-ups)
      if (totalAngle >= 25) return true
      if (type === 'significant') return true
      return false
      
    case 'technical':
      // Technical: Call EVERYTHING 15°+
      // Driver is pushing hard, needs constant guidance
      return totalAngle >= 15
      
    default:
      // Unknown zone - use highway rules
      return totalAngle >= 25
  }
}

/**
 * Detect sequences of curves close together
 */
function detectSequences(events) {
  const sequences = []
  let currentSeq = []
  
  events.forEach((event, i) => {
    const prevEvent = events[i - 1]
    const gap = prevEvent ? event.apexMile - prevEvent.apexMile : 999
    
    if (gap <= 0.3) {
      // Close to previous - add to sequence
      if (currentSeq.length === 0 && prevEvent) {
        currentSeq.push(prevEvent)
      }
      currentSeq.push(event)
    } else {
      // Gap too big - save current sequence if valid
      if (currentSeq.length >= 3) {
        sequences.push({
          startMile: currentSeq[0].apexMile,
          endMile: currentSeq[currentSeq.length - 1].apexMile,
          events: [...currentSeq],
          pattern: currentSeq.map(e => e.direction[0]).join('-'),
          zone: currentSeq[0].zoneType
        })
      }
      currentSeq = []
    }
  })
  
  // Don't forget last sequence
  if (currentSeq.length >= 3) {
    sequences.push({
      startMile: currentSeq[0].apexMile,
      endMile: currentSeq[currentSeq.length - 1].apexMile,
      events: [...currentSeq],
      pattern: currentSeq.map(e => e.direction[0]).join('-'),
      zone: currentSeq[0].zoneType
    })
  }
  
  return sequences
}

/**
 * Detect zone transitions
 */
function detectZoneTransitions(events) {
  const transitions = []
  let currentZone = null
  
  events.forEach(event => {
    if (event.zoneType !== currentZone) {
      if (currentZone !== null) {
        transitions.push({
          mile: event.apexMile,
          fromZone: currentZone,
          toZone: event.zoneType,
          position: event.position
        })
      }
      currentZone = event.zoneType
    }
  })
  
  return transitions
}

/**
 * Detect wake-up calls needed after long straights
 */
function detectWakeUpCalls(allEvents, filteredEvents) {
  const wakeUps = []
  const LONG_STRAIGHT_THRESHOLD = 5 // miles
  
  let lastEventMile = 0
  
  allEvents.forEach(event => {
    const gap = event.apexMile - lastEventMile
    
    if (gap >= LONG_STRAIGHT_THRESHOLD) {
      // This is the first curve after a long straight
      // Check if it's already in filtered events
      const alreadyIncluded = filteredEvents.some(
        e => Math.abs(e.apexMile - event.apexMile) < 0.1
      )
      
      if (!alreadyIncluded && event.totalAngle >= 15) {
        wakeUps.push({
          mile: event.apexMile,
          straightDistance: gap,
          event: event,
          reason: `First curve after ${gap.toFixed(1)} miles straight`
        })
      }
    }
    
    lastEventMile = event.apexMile
  })
  
  return wakeUps
}

/**
 * Generate final callouts with text
 */
function generateCallouts(filteredEvents, sequences, transitions, wakeUps) {
  const callouts = []
  const sequenceStartMiles = new Set(sequences.map(s => s.startMile))
  const transitionMiles = new Set(transitions.map(t => t.mile))
  const wakeUpMiles = new Set(wakeUps.map(w => w.mile))
  
  // Add zone transition callouts
  transitions.forEach(t => {
    if (t.toZone === 'technical') {
      callouts.push({
        id: `transition-${t.mile.toFixed(2)}`,
        mile: t.mile - 0.3, // Announce slightly before
        triggerMile: Math.max(t.mile - 0.5, 0),
        triggerDistance: Math.max(t.mile - 0.5, 0) * 1609.34,
        type: 'transition',
        text: 'Technical section ahead - stay sharp',
        reason: `Entering technical zone at mile ${t.mile.toFixed(1)}`,
        zone: t.fromZone,
        position: t.position,
        priority: 'high'
      })
    }
  })
  
  // Add wake-up callouts
  wakeUps.forEach(w => {
    callouts.push({
      id: `wakeup-${w.mile.toFixed(2)}`,
      mile: w.mile,
      triggerMile: Math.max(w.mile - 0.3, 0),
      triggerDistance: Math.max(w.mile - 0.3, 0) * 1609.34,
      type: 'wake_up',
      text: generateWakeUpText(w.event),
      reason: w.reason,
      zone: w.event.zoneType,
      position: w.event.position,
      angle: w.event.totalAngle,
      direction: w.event.direction,
      priority: 'medium'
    })
  })
  
  // Process filtered events
  filteredEvents.forEach(event => {
    // Skip if this is the start of a sequence (we'll handle it as sequence)
    const isSequenceStart = sequenceStartMiles.has(event.apexMile)
    const isInSequence = sequences.some(s => 
      event.apexMile >= s.startMile && event.apexMile <= s.endMile
    )
    
    // For technical zone, call every curve even in sequences
    // For highway, bundle sequences
    if (isInSequence && event.zoneType !== 'technical') {
      // Only add sequence callout at the start
      if (isSequenceStart) {
        const seq = sequences.find(s => s.startMile === event.apexMile)
        callouts.push({
          id: `sequence-${event.apexMile.toFixed(2)}`,
          mile: event.apexMile,
          triggerMile: Math.max(event.apexMile - 0.3, 0),
          triggerDistance: Math.max(event.apexMile - 0.3, 0) * 1609.34,
          type: 'sequence',
          text: generateSequenceText(seq),
          reason: `Sequence of ${seq.events.length} curves`,
          zone: event.zoneType,
          position: event.position,
          priority: 'high'
        })
      }
      // Skip individual events in highway sequences
      return
    }
    
    // Generate individual callout
    callouts.push({
      id: `curve-${event.apexMile.toFixed(2)}`,
      mile: event.apexMile,
      triggerMile: Math.max(event.apexMile - 0.3, 0),
      triggerDistance: Math.max(event.apexMile - 0.3, 0) * 1609.34,
      type: event.type,
      text: generateCalloutText(event),
      reason: generateReason(event),
      zone: event.zoneType,
      position: event.position,
      angle: event.totalAngle,
      direction: event.direction,
      priority: getPriority(event)
    })
  })
  
  // Sort by mile
  callouts.sort((a, b) => a.mile - b.mile)
  
  return callouts
}

/**
 * Generate callout text based on zone and curve type
 */
function generateCalloutText(event) {
  const { direction, totalAngle, zoneType, type, shape } = event
  const dir = direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase()
  
  // Detect offramp (high angle curve on highway)
  if (zoneType === 'transit' && totalAngle >= 70) {
    return `HARD ${dir.toUpperCase()} - EXIT`
  }
  
  // Danger curves get emphasis
  if (type === 'danger' || totalAngle >= 60) {
    if (totalAngle >= 90) {
      return `CAUTION - Hard ${dir.toLowerCase()}`
    }
    return `CAUTION ${dir.toLowerCase()} ${totalAngle}°`
  }
  
  // Technical zone - short and precise
  if (zoneType === 'technical') {
    if (totalAngle >= 45) {
      return `Hard ${dir.toLowerCase()} ${totalAngle}°`
    }
    return `${dir} ${totalAngle}`
  }
  
  // Highway - standard format
  if (totalAngle >= 40) {
    return `${dir} ${totalAngle}, tightens`
  }
  
  return `${dir} ${totalAngle}`
}

/**
 * Generate sequence text
 */
function generateSequenceText(sequence) {
  const count = sequence.events.length
  const pattern = sequence.pattern // e.g., "R-L-R"
  const maxAngle = Math.max(...sequence.events.map(e => e.totalAngle))
  
  // Describe the pattern
  const directions = pattern.split('-').map(d => d === 'R' ? 'right' : 'left')
  
  if (count === 3) {
    return `${directions[0]}-${directions[1]}-${directions[2]}, max ${maxAngle}°`
  }
  
  if (count <= 5) {
    const uniqueDirs = [...new Set(directions)]
    if (uniqueDirs.length === 1) {
      return `${count} ${directions[0]}s, max ${maxAngle}°`
    }
    return `${directions.join('-')}, stay tight`
  }
  
  // Long sequence
  return `${count} curves ahead, max ${maxAngle}°, stay focused`
}

/**
 * Generate wake-up text
 */
function generateWakeUpText(event) {
  const dir = event.direction.charAt(0).toUpperCase() + event.direction.slice(1).toLowerCase()
  return `Bend ahead - ${dir.toLowerCase()} ${event.totalAngle}`
}

/**
 * Generate reason for callout
 */
function generateReason(event) {
  const { zoneType, totalAngle, type } = event
  
  if (type === 'danger') {
    return `Danger curve - ${totalAngle}° requires attention`
  }
  
  if (zoneType === 'technical') {
    return `Technical zone - all curves called for driver awareness`
  }
  
  if (zoneType === 'transit' && totalAngle >= 70) {
    return `Likely exit ramp - significant speed reduction needed`
  }
  
  if (type === 'significant') {
    return `Significant curve - feelable at highway speed`
  }
  
  return `${totalAngle}° curve in ${zoneType} zone`
}

/**
 * Get priority for callout
 */
function getPriority(event) {
  if (event.type === 'danger' || event.totalAngle >= 60) return 'critical'
  if (event.type === 'significant' || event.totalAngle >= 40) return 'high'
  return 'medium'
}

/**
 * Generate analysis summary
 */
function generateAnalysis(allEvents, callouts, routeInfo) {
  const totalMiles = routeInfo?.totalMiles || 0
  
  const zoneBreakdown = {
    urban: allEvents.filter(e => e.zoneType === 'urban').length,
    transit: allEvents.filter(e => e.zoneType === 'transit').length,
    technical: allEvents.filter(e => e.zoneType === 'technical').length
  }
  
  const calloutsPerMile = totalMiles > 0 ? (callouts.length / totalMiles).toFixed(2) : 0
  
  const dangerCount = callouts.filter(c => c.type === 'danger' || c.priority === 'critical').length
  
  return `Route: ${totalMiles.toFixed(1)} miles. ` +
    `${callouts.length} callouts (${calloutsPerMile}/mile). ` +
    `${dangerCount} danger curves. ` +
    `Events by zone: Urban=${zoneBreakdown.urban}, Highway=${zoneBreakdown.transit}, Technical=${zoneBreakdown.technical}`
}

/**
 * Fallback: Generate callouts without LLM polish
 * Use this if LLM stage fails
 */
export function generateFallbackCallouts(events, routeInfo) {
  console.log('⚠️ Using fallback callout generation (no LLM)')
  return filterEventsToCallouts(events, routeInfo)
}

export default { filterEventsToCallouts, generateFallbackCallouts }
