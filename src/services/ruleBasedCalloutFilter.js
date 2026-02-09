// ================================
// Rule-Based Callout Filter v1.2
// 
// Fixes in v1.2:
// - Zone-aware trigger distances (technical = closer)
// 
// Fixes in v1.1:
// 1. Highway threshold: 25° → 20° (feelable bends)
// 2. Never bundle danger curves into sequences
// 3. Technical threshold: 15° → 12° (more coverage)
// 4. EXIT only if zone changes after (not just angle-based)
// 5. Fixed wake-up detection logic
// ================================

/**
 * Main export: Filter road flow events into callouts
 * @param {Array} events - Road Flow events
 * @param {Object} routeInfo - Route metadata including total miles
 * @param {Array} zones - Zone segments for exit detection
 * @returns {Object} - Filtered callouts with analysis
 */
export function filterEventsToCallouts(events, routeInfo, zones = []) {
  if (window.__TRAMO_VERBOSE) {
    console.log('📋 Rule-Based Callout Filter v1.2')
    console.log(`   Input events: ${events.length}`)
  }

  const totalMiles = routeInfo?.totalMiles || 0

  // Build zone lookup for exit detection
  const zoneLookup = buildZoneLookup(zones, totalMiles)

  // Step 1: Apply zone-based thresholds
  const filteredEvents = events.filter(event => shouldCallout(event, events))

  if (window.__TRAMO_VERBOSE) console.log(`   After threshold filter: ${filteredEvents.length}`)

  // Step 2: Detect sequences (curves within 0.3mi of each other)
  // FIX #2: Pass danger check to exclude danger curves from sequences
  const sequences = detectSequences(filteredEvents)

  if (window.__TRAMO_VERBOSE) console.log(`   Sequences detected: ${sequences.length}`)

  // Step 3: Detect zone transitions
  const transitions = detectZoneTransitions(events)

  if (window.__TRAMO_VERBOSE) console.log(`   Zone transitions: ${transitions.length}`)

  // Step 4: Detect wake-up opportunities (first curve after long straight)
  // FIX #5: Improved wake-up detection
  const wakeUps = detectWakeUpCalls(events, filteredEvents)

  if (window.__TRAMO_VERBOSE) console.log(`   Wake-up calls: ${wakeUps.length}`)

  // Step 5: Generate callouts with text
  // FIX #4: Pass zoneLookup for exit detection
  const callouts = generateCallouts(filteredEvents, sequences, transitions, wakeUps, zoneLookup)

  if (window.__TRAMO_VERBOSE) console.log(`   Final callouts: ${callouts.length}`)
  
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
 * Build zone lookup for determining zone at any mile marker
 */
function buildZoneLookup(zones, totalMiles) {
  if (!zones || zones.length === 0) return null
  
  return {
    zones,
    getZoneAtMile: (mile) => {
      for (const zone of zones) {
        const startMile = (zone.startDistance || 0) / 1609.34
        const endMile = (zone.endDistance || 0) / 1609.34
        if (mile >= startMile && mile <= endMile) {
          return zone.character || 'transit'
        }
      }
      return 'transit' // Default
    }
  }
}

/**
 * Core filtering logic - should this event become a callout?
 * FIX #1: Highway 25° → 20°
 * FIX #3: Technical 15° → 12°
 */
function shouldCallout(event, allEvents) {
  const { zoneType, totalAngle, type } = event
  
  // RULE 1: ALWAYS call danger curves
  if (type === 'danger') return true
  
  // RULE 2: Zone-specific thresholds
  switch (zoneType) {
    case 'urban':
      // Urban: Only call 70°+ (hard turns)
      // Driver is slow, watching traffic - don't distract with minor curves
      return totalAngle >= 70
      
    case 'transit':
      // FIX #1: Highway threshold lowered to 20° (feelable at speed)
      if (totalAngle >= 20) return true
      if (type === 'significant') return true
      return false
      
    case 'technical':
      // FIX #3: Technical threshold lowered to 12° (more coverage)
      // Driver is pushing hard, needs constant guidance
      return totalAngle >= 12
      
    default:
      // Unknown zone - use highway rules
      return totalAngle >= 20
  }
}

/**
 * Detect sequences of curves close together
 * FIX #2: Never include danger curves in sequences - they must stand alone
 */
function detectSequences(events) {
  const sequences = []
  let currentSeq = []
  
  events.forEach((event, i) => {
    const prevEvent = events[i - 1]
    const gap = prevEvent ? event.apexMile - prevEvent.apexMile : 999
    
    // FIX #2: Skip danger curves - they should never be bundled
    if (event.type === 'danger' || event.totalAngle >= 70) {
      // Save current sequence if valid
      if (currentSeq.length >= 3) {
        sequences.push(createSequence(currentSeq))
      }
      currentSeq = []
      return
    }
    
    // Also check if previous was danger - don't start sequence after danger
    if (prevEvent && (prevEvent.type === 'danger' || prevEvent.totalAngle >= 70)) {
      currentSeq = []
    }
    
    if (gap <= 0.3) {
      // Close to previous - add to sequence
      if (currentSeq.length === 0 && prevEvent && prevEvent.type !== 'danger' && prevEvent.totalAngle < 70) {
        currentSeq.push(prevEvent)
      }
      currentSeq.push(event)
    } else {
      // Gap too big - save current sequence if valid
      if (currentSeq.length >= 3) {
        sequences.push(createSequence(currentSeq))
      }
      currentSeq = []
    }
  })
  
  // Don't forget last sequence
  if (currentSeq.length >= 3) {
    sequences.push(createSequence(currentSeq))
  }
  
  return sequences
}

function createSequence(events) {
  return {
    startMile: events[0].apexMile,
    endMile: events[events.length - 1].apexMile,
    events: [...events],
    pattern: events.map(e => e.direction[0]).join('-'),
    zone: events[0].zoneType,
    maxAngle: Math.max(...events.map(e => e.totalAngle)),
    hasDanger: events.some(e => e.type === 'danger' || e.totalAngle >= 70)
  }
}

/**
 * Detect zone transitions
 */
function detectZoneTransitions(events) {
  const transitions = []
  let currentZone = null

  events.forEach(event => {
    if (event.zoneType !== currentZone) {
      // Include initial zone (fromZone=null) so first zone gets a briefing
      transitions.push({
        mile: currentZone === null ? 0 : event.apexMile,
        fromZone: currentZone,
        toZone: event.zoneType,
        position: event.position
      })
      currentZone = event.zoneType
    }
  })

  return transitions
}

/**
 * Detect wake-up calls needed after long straights
 * FIX #5: Improved logic - always add wake-up after long straight regardless of inclusion
 */
function detectWakeUpCalls(allEvents, filteredEvents) {
  const wakeUps = []
  const LONG_STRAIGHT_THRESHOLD = 5 // miles
  
  // Find gaps between FILTERED events (what driver will hear)
  let lastCalloutMile = 0
  
  // Sort filtered events by mile
  const sortedFiltered = [...filteredEvents].sort((a, b) => a.apexMile - b.apexMile)
  
  sortedFiltered.forEach(event => {
    const gap = event.apexMile - lastCalloutMile
    
    if (gap >= LONG_STRAIGHT_THRESHOLD) {
      // There's a long gap before this callout
      // Add context about the straight section
      wakeUps.push({
        mile: event.apexMile,
        straightDistance: gap,
        event: event,
        reason: `First curve after ${gap.toFixed(1)} miles straight`,
        enhanceExisting: true // Flag to enhance the existing callout rather than add new
      })
    }
    
    lastCalloutMile = event.apexMile
  })
  
  return wakeUps
}

/**
 * Check if a highway curve is actually an exit (zone changes after)
 * FIX #4: Only call it EXIT if zone changes
 */
function isActualExit(event, zoneLookup) {
  if (!zoneLookup) return false
  if (event.zoneType !== 'transit') return false
  if (event.totalAngle < 70) return false
  
  // Check zone 0.5 miles ahead
  const currentZone = zoneLookup.getZoneAtMile(event.apexMile)
  const aheadZone = zoneLookup.getZoneAtMile(event.apexMile + 0.5)
  
  // It's an EXIT if we're leaving transit zone
  return currentZone === 'transit' && aheadZone !== 'transit'
}

/**
 * Get lead distance (how far before apex to trigger callout)
 * Technical = closer (130m), Highway = further (240-400m)
 */
function getLeadDistance(event) {
  const { zoneType, type, totalAngle } = event
  
  // Danger curves need more warning
  if (type === 'danger' || totalAngle >= 70) {
    return zoneType === 'technical' ? 0.1 : 0.25  // 160m technical, 400m highway
  }
  
  // Zone-specific lead distances
  switch (zoneType) {
    case 'technical':
      // Technical: very close - ~100-130m (5-7 seconds at 40-50mph)
      return 0.08
    case 'urban':
      // Urban: close - ~130m (slower speeds)
      return 0.08
    case 'transit':
    default:
      // Highway: further ahead - ~240m (8-10 seconds at 70mph)
      return 0.15
  }
}

/**
 * Generate final callouts with text
 */
function generateCallouts(filteredEvents, sequences, transitions, wakeUps, zoneLookup) {
  const callouts = []
  const sequenceStartMiles = new Set(sequences.map(s => s.startMile))
  const sequenceEventMiles = new Set()
  
  // Build set of all miles that are part of sequences
  sequences.forEach(seq => {
    seq.events.forEach(e => sequenceEventMiles.add(e.apexMile.toFixed(2)))
  })
  
  // Build wake-up lookup
  const wakeUpMiles = new Map()
  wakeUps.forEach(w => wakeUpMiles.set(w.mile.toFixed(2), w))
  
  // Add zone transition markers
  // Round 8: Text is a simple marker — useSpeechPlanner builds dynamic briefings
  // at runtime based on speech budget and upcoming events
  transitions.forEach(t => {
    callouts.push({
      id: `transition-${t.mile.toFixed(2)}`,
      mile: t.mile,
      triggerMile: Math.max(t.mile - 0.05, 0),
      triggerDistance: Math.max(t.mile - 0.05, 0) * 1609.34,
      type: 'transition',
      text: `Entering ${t.toZone} zone`,
      reason: `Zone transition at mile ${t.mile.toFixed(1)}`,
      zone: t.fromZone || t.toZone,
      position: t.position,
      priority: 'normal'
    })
  })
  
  // Process filtered events
  filteredEvents.forEach(event => {
    const mileKey = event.apexMile.toFixed(2)
    const isInSequence = sequenceEventMiles.has(mileKey)
    const isSequenceStart = sequenceStartMiles.has(event.apexMile)
    const wakeUpInfo = wakeUpMiles.get(mileKey)
    
    // FIX #2: Danger curves ALWAYS get individual callouts, never bundled
    const isDanger = event.type === 'danger' || event.totalAngle >= 70
    
    // Get zone-aware lead distance
    const leadDistance = getLeadDistance(event)
    
    // For sequences (non-danger, non-technical)
    if (isInSequence && !isDanger && event.zoneType !== 'technical') {
      // Only add sequence callout at the start
      if (isSequenceStart) {
        const seq = sequences.find(s => s.startMile === event.apexMile)
        const seqLeadDistance = event.zoneType === 'transit' ? 0.2 : 0.1
        callouts.push({
          id: `sequence-${event.apexMile.toFixed(2)}`,
          mile: event.apexMile,
          triggerMile: Math.max(event.apexMile - seqLeadDistance, 0),
          triggerDistance: Math.max(event.apexMile - seqLeadDistance, 0) * 1609.34,
          type: 'sequence',
          text: generateSequenceText(seq),
          reason: `Sequence of ${seq.events.length} curves`,
          zone: event.zoneType,
          position: event.position,
          priority: 'high'
        })
      }
      // Skip individual events in highway sequences (unless danger)
      return
    }
    
    // Generate individual callout
    // FIX #4: Pass zoneLookup for proper exit detection
    let calloutText = generateCalloutText(event, zoneLookup)
    
    // FIX #5: Enhance with wake-up context if applicable
    if (wakeUpInfo && wakeUpInfo.straightDistance >= 5) {
      calloutText = `Bend ahead - ${calloutText.toLowerCase()}`
    }
    
    callouts.push({
      id: `curve-${event.apexMile.toFixed(2)}`,
      mile: event.apexMile,
      triggerMile: Math.max(event.apexMile - leadDistance, 0),
      triggerDistance: Math.max(event.apexMile - leadDistance, 0) * 1609.34,
      type: event.type,
      text: calloutText,
      reason: generateReason(event, zoneLookup, wakeUpInfo),
      zone: event.zoneType,
      position: event.position,
      angle: event.totalAngle,
      direction: event.direction,
      priority: getPriority(event),
      afterStraight: wakeUpInfo ? wakeUpInfo.straightDistance : null
    })
  })
  
  // Sort by mile
  callouts.sort((a, b) => a.mile - b.mile)
  
  return callouts
}

/**
 * Generate callout text based on zone and curve type
 * FIX #4: Only mark as EXIT if zone actually changes
 */
function generateCalloutText(event, zoneLookup) {
  const { direction, totalAngle, zoneType, type, shape } = event
  const dir = direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase()
  
  // FIX #4: Check if this is an actual exit (zone changes after)
  if (isActualExit(event, zoneLookup)) {
    return `HARD ${dir.toUpperCase()} - EXIT`
  }
  
  // Danger curves get emphasis (but not EXIT unless zone changes)
  if (type === 'danger' || totalAngle >= 70) {
    if (totalAngle >= 90) {
      return `CAUTION - Hard ${dir.toLowerCase()} ${totalAngle}°`
    }
    return `CAUTION - ${dir} ${totalAngle}°`
  }
  
  // Technical zone - short and precise
  if (zoneType === 'technical') {
    if (totalAngle >= 45) {
      return `Hard ${dir.toLowerCase()} ${totalAngle}°`
    }
    return `${dir} ${totalAngle}°`
  }
  
  // Highway - standard format
  if (totalAngle >= 40) {
    return `${dir} ${totalAngle}°, tightens`
  }
  
  return `${dir} ${totalAngle}°`
}

/**
 * Generate sequence text
 */
function generateSequenceText(sequence) {
  const count = sequence.events.length
  const pattern = sequence.pattern
  const maxAngle = sequence.maxAngle
  
  const directions = pattern.split('-').map(d => d === 'R' ? 'right' : 'left')
  
  if (count === 3) {
    return `${directions[0]}–${directions[1]}–${directions[2]}, max ${maxAngle}°`
  }
  
  if (count <= 5) {
    const uniqueDirs = [...new Set(directions)]
    if (uniqueDirs.length === 1) {
      return `${count} ${directions[0]}s, max ${maxAngle}°`
    }
    return `${directions.join('–')}, stay tight`
  }
  
  return `${count} curves ahead, max ${maxAngle}°, stay focused`
}

/**
 * Generate reason for callout
 */
function generateReason(event, zoneLookup, wakeUpInfo) {
  const { zoneType, totalAngle, type } = event
  
  if (wakeUpInfo && wakeUpInfo.straightDistance >= 5) {
    return `First curve after ${wakeUpInfo.straightDistance.toFixed(1)} miles straight - stay alert`
  }
  
  if (type === 'danger') {
    if (isActualExit(event, zoneLookup)) {
      return `Exit ramp - significant speed reduction needed`
    }
    return `Danger curve - ${totalAngle}° requires attention`
  }
  
  if (zoneType === 'technical') {
    return `Technical zone - all curves called for driver awareness`
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
  if (event.type === 'danger' || event.totalAngle >= 70) return 'critical'
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
 */
export function generateFallbackCallouts(events, routeInfo, zones) {
  console.log('⚠️ Using fallback callout generation (no LLM)')
  return filterEventsToCallouts(events, routeInfo, zones)
}

/**
 * Merge close callouts in technical zones into chained sequences.
 * Real co-drivers chain curves that are close together:
 * "Left 3 into right 5 into hairpin left" instead of 3 separate callouts.
 *
 * Call this AFTER filterEventsToCallouts and AFTER LLM polish.
 *
 * @param {Array} callouts - Sorted callouts array
 * @param {Array} zones - Route zones for zone type lookup
 * @returns {Array} - Callouts with close technical ones merged
 */
export function mergeCloseCallouts(callouts, zones = []) {
  if (!callouts?.length || callouts.length < 2) return callouts

  const MERGE_DISTANCE_M = 250  // Max gap between triggers to merge
  const MAX_CHAIN = 3           // Max curves in one merged callout
  const EXTRA_LEAD_PER_CURVE = 50  // Fire earlier per additional curve in chain

  const getZoneAt = (distanceM) => {
    if (!zones?.length) return 'transit'
    for (const z of zones) {
      if (distanceM >= (z.startDistance || 0) && distanceM <= (z.endDistance || 0)) {
        return z.character || 'transit'
      }
    }
    return 'transit'
  }

  // Helper: is this a curve callout (not a zone announcement or chatter)?
  const isCurveCallout = (c) => {
    if (!c) return false
    const t = c.type || ''
    const txt = (c.text || '').toLowerCase()
    // Exclude zone announcements, chatter, wake-up without angle data
    if (t === 'zone_transition' || t === 'chatter') return false
    if (txt.includes('section') || txt.includes('open road') || txt.includes('clear.') || txt.includes('urban')) return false
    // Must have some curve-related content
    return txt.match(/left|right|hairpin|chicane|esses/i) !== null
  }

  const sorted = [...callouts].sort((a, b) => {
    const dA = a.triggerDistance ?? (a.triggerMile * 1609.34)
    const dB = b.triggerDistance ?? (b.triggerMile * 1609.34)
    return dA - dB
  })

  const merged = []
  let i = 0

  while (i < sorted.length) {
    const current = sorted[i]
    const currentDist = current.triggerDistance ?? ((current.triggerMile || 0) * 1609.34)
    const currentZone = current.zone || getZoneAt(currentDist)

    // Only merge in technical zones, and only curve callouts
    if (currentZone !== 'technical' || !isCurveCallout(current)) {
      merged.push(current)
      i++
      continue
    }

    // Try to build a chain of close callouts
    const chain = [current]
    let j = i + 1

    while (j < sorted.length && chain.length < MAX_CHAIN) {
      const next = sorted[j]
      const nextDist = next.triggerDistance ?? ((next.triggerMile || 0) * 1609.34)
      const prevDist = chain[chain.length - 1].triggerDistance ??
                       ((chain[chain.length - 1].triggerMile || 0) * 1609.34)
      const gap = nextDist - prevDist

      const nextZone = next.zone || getZoneAt(nextDist)

      if (gap <= MERGE_DISTANCE_M && nextZone === 'technical' && isCurveCallout(next)) {
        chain.push(next)
        j++
      } else {
        break
      }
    }

    if (chain.length === 1) {
      merged.push(current)
      i++
    } else {
      // Build merged callout
      const leadOffset = (chain.length - 1) * EXTRA_LEAD_PER_CURVE
      const firstDist = chain[0].triggerDistance ?? ((chain[0].triggerMile || 0) * 1609.34)

      // Join texts with ", " — cleanForSpeech will convert to "into" connectors
      const mergedText = chain.map(c => c.text).join(', ')

      const mergedCallout = {
        ...chain[0],
        id: `merged-${chain[0].id}`,
        triggerDistance: Math.max(0, firstDist - leadOffset),
        triggerMile: Math.max(0, (firstDist - leadOffset) / 1609.34),
        text: mergedText,
        type: chain.some(c => c.type === 'danger') ? 'danger' : 'significant',
        priority: 'high',
        mergedFrom: chain.map(c => c.id),
        mergedCount: chain.length,
        zone: 'technical'
      }

      console.log(`🔗 MERGED ${chain.length} callouts: "${mergedText}"`)
      merged.push(mergedCallout)
      i = j  // Skip all items consumed by the chain
    }
  }

  console.log(`🔗 Merge: ${callouts.length} callouts → ${merged.length} (${callouts.length - merged.length} merged)`)
  return merged
}

export default { filterEventsToCallouts, generateFallbackCallouts, mergeCloseCallouts }
