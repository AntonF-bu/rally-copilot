// ================================
// Smart Chatter Service v1
// Data-backed intelligent companion callouts
// ================================

// ================================
// SESSION TRACKING STATE
// ================================
const sessionState = {
  // Speed tracking
  speedHistory: [],           // Array of { speed, timestamp, distance }
  maxSpeed: 0,
  speedAtLastCallout: 0,
  timeAbove80: 0,             // Seconds spent above 80mph
  timeAbove90: 0,             // Seconds spent above 90mph
  lastSpeedCheck: Date.now(),
  
  // Segment tracking
  segmentStartTime: Date.now(),
  segmentStartDistance: 0,
  segmentSpeeds: [],
  completedSegments: [],      // Array of { zone, avgSpeed, time, distance }
  
  // Progress tracking
  navigationStartTime: Date.now(),
  lastMilestone: 0,           // Last announced milestone (25, 50, 75, 90)
  announcedZoneChanges: new Set(),
  
  // Callout tracking
  lastCalloutTime: 0,
  lastCalloutType: null,
  calloutCooldowns: {},       // { type: lastTime } for per-type cooldowns
  
  // Pattern tracking
  leftSweeperSpeeds: [],
  rightSweeperSpeeds: [],
  avgSpeedByZoneType: {
    transit: [],
    technical: [],
    urban: []
  }
}

// Reset session (call when navigation starts)
export function resetChatterSession() {
  sessionState.speedHistory = []
  sessionState.maxSpeed = 0
  sessionState.speedAtLastCallout = 0
  sessionState.timeAbove80 = 0
  sessionState.timeAbove90 = 0
  sessionState.lastSpeedCheck = Date.now()
  sessionState.segmentStartTime = Date.now()
  sessionState.segmentStartDistance = 0
  sessionState.segmentSpeeds = []
  sessionState.completedSegments = []
  sessionState.navigationStartTime = Date.now()
  sessionState.lastMilestone = 0
  sessionState.announcedZoneChanges = new Set()
  sessionState.lastCalloutTime = 0
  sessionState.lastCalloutType = null
  sessionState.calloutCooldowns = {}
  sessionState.leftSweeperSpeeds = []
  sessionState.rightSweeperSpeeds = []
  sessionState.avgSpeedByZoneType = { transit: [], technical: [], urban: [] }
  
  console.log('🎤 Smart chatter session reset')
}

// ================================
// DATA UPDATE FUNCTION
// Call this every GPS update
// ================================
export function updateChatterData(data) {
  const { speed, distance, zoneType, bendDirection } = data
  const now = Date.now()
  
  // Update speed history (keep last 60 entries = ~1 minute at 1Hz)
  sessionState.speedHistory.push({ speed, timestamp: now, distance })
  if (sessionState.speedHistory.length > 60) {
    sessionState.speedHistory.shift()
  }
  
  // Track max speed
  if (speed > sessionState.maxSpeed) {
    sessionState.maxSpeed = speed
  }
  
  // Track time at high speeds
  const timeDelta = (now - sessionState.lastSpeedCheck) / 1000
  if (speed >= 80) sessionState.timeAbove80 += timeDelta
  if (speed >= 90) sessionState.timeAbove90 += timeDelta
  sessionState.lastSpeedCheck = now
  
  // Track segment speeds
  sessionState.segmentSpeeds.push(speed)
  
  // Track zone-specific speeds
  if (zoneType && sessionState.avgSpeedByZoneType[zoneType]) {
    sessionState.avgSpeedByZoneType[zoneType].push(speed)
  }
  
  // Track sweeper performance
  if (bendDirection === 'LEFT') {
    sessionState.leftSweeperSpeeds.push(speed)
  } else if (bendDirection === 'RIGHT') {
    sessionState.rightSweeperSpeeds.push(speed)
  }
}

// Record completed segment
export function recordSegmentComplete(zoneType, distance) {
  const avgSpeed = sessionState.segmentSpeeds.length > 0
    ? sessionState.segmentSpeeds.reduce((a, b) => a + b, 0) / sessionState.segmentSpeeds.length
    : 0
  
  const segmentTime = Date.now() - sessionState.segmentStartTime
  const segmentDistance = distance - sessionState.segmentStartDistance
  
  sessionState.completedSegments.push({
    zone: zoneType,
    avgSpeed: Math.round(avgSpeed),
    time: segmentTime,
    distance: segmentDistance
  })
  
  // Reset for next segment
  sessionState.segmentStartTime = Date.now()
  sessionState.segmentStartDistance = distance
  sessionState.segmentSpeeds = []
}

// ================================
// COOLDOWN MANAGEMENT
// ================================
const COOLDOWNS = {
  speed: 45000,           // 45 seconds between speed callouts
  time: 120000,           // 2 minutes between time updates
  progress: 60000,        // 1 minute between progress updates
  roadAhead: 30000,       // 30 seconds between road ahead callouts
  zoneChange: 0,          // No cooldown - one-time per zone
  safety: 60000,          // 1 minute between safety warnings
  pattern: 180000,        // 3 minutes between pattern observations
  density: 90000,         // 1.5 minutes between density callouts
  general: 20000          // Minimum 20 seconds between ANY callout
}

function canCallout(type) {
  const now = Date.now()
  
  // Check general cooldown
  if (now - sessionState.lastCalloutTime < COOLDOWNS.general) {
    return false
  }
  
  // Check type-specific cooldown
  const lastTypeTime = sessionState.calloutCooldowns[type] || 0
  const cooldown = COOLDOWNS[type] || COOLDOWNS.general
  
  return now - lastTypeTime >= cooldown
}

function recordCallout(type) {
  const now = Date.now()
  sessionState.lastCalloutTime = now
  sessionState.lastCalloutType = type
  sessionState.calloutCooldowns[type] = now
}

// ================================
// SMART CALLOUT GENERATORS
// ================================

// 1. SPEED INTELLIGENCE
function getSpeedCallout(speed, speedLimit = 65) {
  if (!canCallout('speed')) return null
  
  const over = speed - speedLimit
  const lastSpeed = sessionState.speedAtLastCallout
  const speedChange = speed - lastSpeed
  
  let callout = null
  
  // Very high speed
  if (speed >= 95) {
    const options = [
      `${speed}. That's ${over} over. Living dangerously.`,
      `${speed} mph. Hope you know where the cops sit.`,
      `${speed}. Your car, your choice. Eyes up.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  }
  // High speed
  else if (speed >= 85) {
    const options = [
      `${speed} mph. ${over} over the limit.`,
      `Cruising at ${speed}. Ticket territory.`,
      `${speed}. Fast but manageable.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  }
  // Speed creeping up
  else if (speedChange >= 10 && speed >= 75) {
    callout = `Speed's crept up to ${speed}. Intentional?`
  }
  // New max speed
  else if (speed > sessionState.maxSpeed - 2 && speed >= 80) {
    callout = `${speed}. New high for this trip.`
  }
  // Good cruising speed
  else if (speed >= 70 && speed <= 77 && Math.random() < 0.3) {
    const options = [
      `Steady at ${speed}. Good cruise speed.`,
      `${speed} mph. Sweet spot for fuel economy.`,
      `Holding ${speed}. Nice and consistent.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  }
  
  if (callout) {
    sessionState.speedAtLastCallout = speed
    recordCallout('speed')
  }
  
  return callout
}

// 2. TIME/ETA INTELLIGENCE
function getTimeCallout(data) {
  if (!canCallout('time')) return null
  
  const { userDistance, totalDistance, expectedDuration } = data
  const elapsed = (Date.now() - sessionState.navigationStartTime) / 1000 // seconds
  
  const progress = userDistance / totalDistance
  const expectedElapsed = expectedDuration * progress
  const timeDiff = expectedElapsed - elapsed // positive = ahead of schedule
  const minsAhead = Math.round(timeDiff / 60)
  
  let callout = null
  
  if (Math.abs(minsAhead) >= 2) {
    if (minsAhead >= 5) {
      callout = `${minsAhead} minutes ahead of schedule. Flying.`
    } else if (minsAhead >= 2) {
      const options = [
        `${minsAhead} minutes ahead. Nice pace.`,
        `Running ${minsAhead} ahead of schedule.`,
        `Making good time. ${minsAhead} minutes up.`
      ]
      callout = options[Math.floor(Math.random() * options.length)]
    } else if (minsAhead <= -3) {
      callout = `${Math.abs(minsAhead)} minutes behind. Want to make it up?`
    } else if (minsAhead <= -2) {
      callout = `Running ${Math.abs(minsAhead)} behind schedule.`
    }
  }
  
  // ETA callout (occasionally)
  if (!callout && progress > 0.3 && progress < 0.8 && Math.random() < 0.2) {
    const remainingSeconds = (totalDistance - userDistance) / (userDistance / elapsed)
    const eta = new Date(Date.now() + remainingSeconds * 1000)
    const etaTime = eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    callout = `At this pace, arriving around ${etaTime}.`
  }
  
  if (callout) recordCallout('time')
  return callout
}

// 3. ROAD AHEAD INTELLIGENCE
function getRoadAheadCallout(data) {
  if (!canCallout('roadAhead')) return null
  
  const { userDistance, highwayBends, zones, curves } = data
  
  // Find next bend
  const nextBend = highwayBends?.find(b => b.distanceFromStart > userDistance)
  const distanceToNextBend = nextBend ? nextBend.distanceFromStart - userDistance : Infinity
  
  // Convert to miles
  const milesToBend = distanceToNextBend / 1609
  
  let callout = null
  
  // Long straight ahead (> 2 miles)
  if (milesToBend > 2) {
    const miles = Math.round(milesToBend * 10) / 10
    const options = [
      `${miles} miles of straight road. Open it up if you want.`,
      `Clear highway for ${miles} miles.`,
      `Long stretch ahead. ${miles} miles to the next bend.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  }
  // Medium straight (1-2 miles)
  else if (milesToBend > 1) {
    if (Math.random() < 0.4) {
      callout = `Mile and a half of open road ahead.`
    }
  }
  // Bend coming up
  else if (nextBend && distanceToNextBend < 800 && distanceToNextBend > 400) {
    if (nextBend.isSection) {
      callout = `Active section in ${Math.round(distanceToNextBend * 3.28)} feet. ${nextBend.bendCount} bends.`
    } else if (nextBend.isSSweep) {
      const dir = nextBend.firstBend?.direction === 'LEFT' ? 'left' : 'right'
      callout = `S-sweep coming. Starts ${dir}.`
    }
  }
  
  if (callout) recordCallout('roadAhead')
  return callout
}

// 4. PROGRESS INTELLIGENCE
function getProgressCallout(data) {
  const { userDistance, totalDistance, speed } = data
  const progress = Math.round((userDistance / totalDistance) * 100)
  
  // Check for milestones
  const milestones = [25, 50, 75, 90]
  const currentMilestone = milestones.find(m => 
    progress >= m && sessionState.lastMilestone < m
  )
  
  if (!currentMilestone) return null
  if (!canCallout('progress')) return null
  
  sessionState.lastMilestone = currentMilestone
  
  const remainingMiles = Math.round((totalDistance - userDistance) / 1609 * 10) / 10
  const elapsed = (Date.now() - sessionState.navigationStartTime) / 1000
  const avgSpeed = Math.round((userDistance / 1609) / (elapsed / 3600))
  
  let callout = null
  
  if (currentMilestone === 25) {
    callout = `Quarter of the way. ${remainingMiles} miles to go.`
  } else if (currentMilestone === 50) {
    const options = [
      `Halfway there. Averaging ${avgSpeed} mph so far.`,
      `50% done. ${remainingMiles} miles remaining.`,
      `Halfway point. Good progress.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  } else if (currentMilestone === 75) {
    callout = `Three quarters done. Only ${remainingMiles} miles left.`
  } else if (currentMilestone === 90) {
    const options = [
      `Almost there. ${remainingMiles} miles to go.`,
      `90% done. Home stretch.`,
      `Final push. ${remainingMiles} miles.`
    ]
    callout = options[Math.floor(Math.random() * options.length)]
  }
  
  if (callout) recordCallout('progress')
  return callout
}

// 5. ZONE TRANSITION INTELLIGENCE
function getZoneTransitionCallout(data) {
  const { userDistance, zones, currentZone } = data
  
  if (!zones?.length) return null
  
  // Find upcoming zone change
  const upcomingZone = zones.find(z => 
    z.startDistance > userDistance && 
    z.startDistance - userDistance < 2000 // Within 2km
  )
  
  if (!upcomingZone) return null
  
  const zoneKey = `${upcomingZone.character}-${upcomingZone.startDistance}`
  if (sessionState.announcedZoneChanges.has(zoneKey)) return null
  
  const distanceToZone = upcomingZone.startDistance - userDistance
  
  // Only announce when getting close (within 1 mile)
  if (distanceToZone > 1609) return null
  
  sessionState.announcedZoneChanges.add(zoneKey)
  
  const distDisplay = distanceToZone > 800 
    ? `${Math.round(distanceToZone / 1609 * 10) / 10} miles`
    : `${Math.round(distanceToZone * 3.28)} feet`
  
  let callout = null
  
  if (upcomingZone.character === 'technical') {
    // Count curves in upcoming technical section
    const techEnd = upcomingZone.endDistance
    const techLength = techEnd - upcomingZone.startDistance
    const techLengthMiles = Math.round(techLength / 1609 * 10) / 10
    
    callout = `Technical section in ${distDisplay}. Time to focus.`
  } else if (upcomingZone.character === 'transit' && currentZone !== 'transit') {
    callout = `Back on highway in ${distDisplay}. Open road ahead.`
  } else if (upcomingZone.character === 'urban') {
    callout = `Urban zone in ${distDisplay}. Watch for lights.`
  }
  
  if (callout) recordCallout('zoneChange')
  return callout
}

// 6. CURVE DENSITY ANALYSIS
function getCurveDensityCallout(data) {
  if (!canCallout('density')) return null
  
  const { userDistance, curves, highwayBends } = data
  
  // Look ahead 3 miles
  const lookAhead = 4828 // 3 miles in meters
  
  // Count curves ahead
  const curvesAhead = curves?.filter(c => 
    c.distanceFromStart > userDistance && 
    c.distanceFromStart < userDistance + lookAhead
  ) || []
  
  const bendsAhead = highwayBends?.filter(b =>
    b.distanceFromStart > userDistance &&
    b.distanceFromStart < userDistance + lookAhead
  ) || []
  
  let callout = null
  
  // Dense section warning
  if (curvesAhead.length >= 8) {
    const hardCurves = curvesAhead.filter(c => c.severity >= 4).length
    if (hardCurves >= 3) {
      callout = `Dense section ahead. ${curvesAhead.length} curves in the next 3 miles, ${hardCurves} are sharp.`
    } else {
      callout = `Busy stretch coming. ${curvesAhead.length} curves over the next 3 miles.`
    }
  }
  // Easy stretch
  else if (curvesAhead.length <= 2 && bendsAhead.length <= 2) {
    if (Math.random() < 0.3) {
      callout = `Easy stretch ahead. Only ${curvesAhead.length + bendsAhead.length} bends for the next 3 miles.`
    }
  }
  
  if (callout) recordCallout('density')
  return callout
}

// 7. TIME OF DAY CONTEXT
function getTimeOfDayCallout(data) {
  if (!canCallout('general')) return null
  
  const hour = new Date().getHours()
  const { speed, userDistance, totalDistance } = data
  const progress = userDistance / totalDistance
  
  let callout = null
  
  // Rush hour warning (only once, early in trip)
  if (progress < 0.3) {
    if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
      if (Math.random() < 0.1) { // Rare callout
        callout = `Rush hour traffic possible ahead. Stay alert.`
      }
    }
  }
  
  // Late night
  if (hour >= 23 || hour <= 5) {
    if (Math.random() < 0.05) {
      const options = [
        `Late night driving. Stay sharp.`,
        `Roads should be empty this time of night.`,
        `Night owl hours. Watch for wildlife.`
      ]
      callout = options[Math.floor(Math.random() * options.length)]
    }
  }
  
  return callout
}

// 8. SAFETY/COP AWARENESS
function getSafetyCallout(data) {
  if (!canCallout('safety')) return null
  
  const { speed } = data
  
  let callout = null
  
  // Extended time at high speed
  if (sessionState.timeAbove90 > 300 && speed >= 85) { // 5+ minutes above 90
    const mins = Math.round(sessionState.timeAbove90 / 60)
    callout = `Been running hot for ${mins} minutes. Cops love that.`
    sessionState.timeAbove90 = 0 // Reset after warning
  }
  else if (sessionState.timeAbove80 > 600 && speed >= 80) { // 10+ minutes above 80
    const mins = Math.round(sessionState.timeAbove80 / 60)
    if (Math.random() < 0.5) {
      callout = `${mins} minutes at 80 plus. Just saying.`
      sessionState.timeAbove80 = 0
    }
  }
  
  if (callout) recordCallout('safety')
  return callout
}

// 9. DRIVING PATTERN INTELLIGENCE (Tier 2)
function getPatternCallout(data) {
  if (!canCallout('pattern')) return null
  
  const { speed, zoneType } = data
  
  // Need enough data
  if (sessionState.speedHistory.length < 30) return null
  
  let callout = null
  
  // Check left vs right sweeper performance
  if (sessionState.leftSweeperSpeeds.length >= 3 && sessionState.rightSweeperSpeeds.length >= 3) {
    const leftAvg = sessionState.leftSweeperSpeeds.reduce((a, b) => a + b, 0) / sessionState.leftSweeperSpeeds.length
    const rightAvg = sessionState.rightSweeperSpeeds.reduce((a, b) => a + b, 0) / sessionState.rightSweeperSpeeds.length
    const diff = Math.abs(leftAvg - rightAvg)
    
    if (diff > 5) {
      const slower = leftAvg < rightAvg ? 'left' : 'right'
      const faster = leftAvg < rightAvg ? 'right' : 'left'
      callout = `You're ${Math.round(diff)} mph slower on ${slower} sweepers than ${faster}s.`
    }
  }
  
  // Check speed variance
  if (!callout && sessionState.speedHistory.length >= 20) {
    const recent = sessionState.speedHistory.slice(-20)
    const speeds = recent.map(h => h.speed)
    const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length
    const variance = speeds.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / speeds.length
    const stdDev = Math.sqrt(variance)
    
    if (stdDev < 3 && avg > 60) {
      callout = `Rock steady. ${Math.round(avg)} mph with barely any variation.`
    } else if (stdDev > 12) {
      callout = `Speed's all over the place. Settling in?`
    }
  }
  
  // Compare to zone averages
  if (!callout && zoneType && sessionState.avgSpeedByZoneType[zoneType]?.length >= 10) {
    const zoneAvg = sessionState.avgSpeedByZoneType[zoneType].reduce((a, b) => a + b, 0) / 
                    sessionState.avgSpeedByZoneType[zoneType].length
    const diff = speed - zoneAvg
    
    if (diff > 10) {
      callout = `${Math.round(diff)} faster than your average in this zone type.`
    }
  }
  
  if (callout) recordCallout('pattern')
  return callout
}

// 10. SEGMENT COMPARISON (Tier 2)
function getSegmentComparisonCallout(data) {
  if (sessionState.completedSegments.length < 2) return null
  if (!canCallout('pattern')) return null
  
  const lastSegment = sessionState.completedSegments[sessionState.completedSegments.length - 1]
  const sameTypeSegments = sessionState.completedSegments.filter(s => s.zone === lastSegment.zone)
  
  if (sameTypeSegments.length < 2) return null
  
  const avgSpeed = sameTypeSegments.reduce((sum, s) => sum + s.avgSpeed, 0) / sameTypeSegments.length
  const diff = lastSegment.avgSpeed - avgSpeed
  
  let callout = null
  
  if (diff > 5) {
    callout = `That segment was ${Math.round(diff)} mph faster than your average ${lastSegment.zone} section.`
  } else if (diff < -5) {
    callout = `${Math.round(Math.abs(diff))} slower than usual on that ${lastSegment.zone} stretch.`
  }
  
  if (callout) recordCallout('pattern')
  return callout
}

// ================================
// MAIN CHATTER FUNCTION
// Call this periodically (every few seconds)
// ================================
export function getSmartChatter(data) {
  const {
    speed,
    userDistance,
    totalDistance,
    expectedDuration,
    highwayBends,
    zones,
    curves,
    currentZone,
    speedLimit = 65
  } = data
  
  // Don't chatter if not moving much (lowered for testing)
  if (speed < 5) {
    console.log('🎤 smartChatter: speed too low', speed)
    return null
  }
  
  // Update session data
  updateChatterData({ 
    speed, 
    distance: userDistance, 
    zoneType: currentZone 
  })
  
  // Priority-ordered callout checks
  // Higher priority = checked first, but cooldowns still apply
  
  // 1. Safety warnings (highest priority)
  let callout = getSafetyCallout(data)
  if (callout) return { text: callout, type: 'safety', priority: 'high' }
  
  // 2. Zone transitions (important, one-time)
  callout = getZoneTransitionCallout(data)
  if (callout) return { text: callout, type: 'zone', priority: 'high' }
  
  // 3. Progress milestones (one-time per milestone)
  callout = getProgressCallout(data)
  if (callout) return { text: callout, type: 'progress', priority: 'normal' }
  
  // 4. Speed commentary
  callout = getSpeedCallout(speed, speedLimit)
  if (callout) return { text: callout, type: 'speed', priority: 'normal' }
  
  // 5. Road ahead
  callout = getRoadAheadCallout(data)
  if (callout) return { text: callout, type: 'road', priority: 'normal' }
  
  // 6. Time/ETA updates
  callout = getTimeCallout(data)
  if (callout) return { text: callout, type: 'time', priority: 'low' }
  
  // 7. Curve density
  callout = getCurveDensityCallout(data)
  if (callout) return { text: callout, type: 'density', priority: 'low' }
  
  // 8. Driving patterns (Tier 2)
  callout = getPatternCallout(data)
  if (callout) return { text: callout, type: 'pattern', priority: 'low' }
  
  // 9. Time of day (rare)
  callout = getTimeOfDayCallout(data)
  if (callout) return { text: callout, type: 'context', priority: 'low' }
  
  // No callout needed
  return null
}

// ================================
// SEGMENT COMPLETE HOOK
// Call when transitioning zones
// ================================
export function onZoneComplete(zoneType, distance) {
  recordSegmentComplete(zoneType, distance)
  return getSegmentComparisonCallout({ distance })
}

// ================================
// EXPORTS
// ================================
export default {
  getSmartChatter,
  resetChatterSession,
  updateChatterData,
  onZoneComplete
}
