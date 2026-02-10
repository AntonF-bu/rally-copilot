// src/services/dynamicChatter.js
// ================================
// Dynamic Data-Driven Chatter v1.0
//
// Generates contextual callouts from live drive data.
// No pre-scripted lines. Everything is computed.
// ================================

// ── INTERNAL STATE ──
// Tracks what's been said to avoid repetition
const state = {
  // Milestone tracking
  progressMilestones: new Set(),     // 25, 50, 75, 90
  countdownMilestones: new Set(),    // 10, 5, 2, 1 miles to technical

  // Speed tracking
  speedSamples: [],                   // { speed, distance, time }
  topSpeed: 0,

  // Curve scoring
  curveScores: [],                    // { mile, severity, speed, rating }

  // Timing
  lastDataCalloutDist: 0,
  lastCountdownDist: 0,
  navStartTime: null,

  // Zone tracking for recap
  technicalEntryTime: null,
  technicalEntryCurvesCompleted: 0,
  technicalSpeedSamples: [],
  curveSpeedsInTechnical: [],

  // Personality
  personalityFired: false,

  // Category dedup for data callouts
  lastDataCategory: null,

  // Total technical-related callout counter (countdown + eta-technical combined, max 2)
  technicalMentionCount: 0,
}

/**
 * Reset state at navigation start
 */
export function resetDynamicChatter() {
  state.progressMilestones = new Set()
  state.countdownMilestones = new Set()
  state.speedSamples = []
  state.topSpeed = 0
  state.curveScores = []
  state.lastDataCalloutDist = 0
  state.lastCountdownDist = 0
  state.navStartTime = Date.now()
  state.technicalEntryTime = null
  state.technicalEntryCurvesCompleted = 0
  state.technicalSpeedSamples = []
  state.curveSpeedsInTechnical = []
  state.personalityFired = false
  state.lastDataCategory = null
  state.technicalMentionCount = 0
}

/**
 * Record a speed sample (call every planning cycle)
 */
export function recordSpeed(speed, distance) {
  state.speedSamples.push({ speed, distance, time: Date.now() })
  if (speed > state.topSpeed) state.topSpeed = speed

  // Keep last 200 samples to avoid memory growth
  if (state.speedSamples.length > 200) {
    state.speedSamples = state.speedSamples.slice(-200)
  }
}

/**
 * Record entering a technical zone
 */
export function enterTechnical(curvesCompletedSoFar) {
  state.technicalEntryTime = Date.now()
  state.technicalEntryCurvesCompleted = curvesCompletedSoFar
  state.technicalSpeedSamples = []
  state.curveSpeedsInTechnical = []
}

/**
 * Record speed through a curve (for scoring)
 */
export function recordCurveSpeed(mile, severity, speed) {
  const entry = { mile, severity, speed, time: Date.now() }
  state.curveScores.push(entry)
  state.curveSpeedsInTechnical.push(entry)
}

// ════════════════════════════════════════════
// CHATTER GENERATORS
// Each returns { text, category } or null
// ════════════════════════════════════════════

/**
 * Get average speed over last N miles
 */
function getAvgSpeed(lastMiles = 5) {
  if (state.speedSamples.length < 10) return null
  const currentDist = state.speedSamples[state.speedSamples.length - 1].distance
  const cutoff = currentDist - (lastMiles * 1609.34)
  const recent = state.speedSamples.filter(s => s.distance > cutoff)
  if (recent.length < 5) return null
  return Math.round(recent.reduce((sum, s) => sum + s.speed, 0) / recent.length)
}

/**
 * Get elapsed time in readable format
 */
function formatTime(ms) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} minutes`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (remainMins === 0) return `${hrs} hour${hrs > 1 ? 's' : ''}`
  return `${hrs} hour${hrs > 1 ? 's' : ''} ${remainMins} minutes`
}

/**
 * Format clock time (e.g., "3:45 PM")
 */
function formatClockTime(date) {
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  const min = m < 10 ? `0${m}` : m
  return `${hour}:${min} ${ampm}`
}

// ────────────────────────────────
// 1. DATA CALLOUTS (highway)
// ────────────────────────────────

export function getDataCallout({
  currentDist, currentSpeed, totalDist,
  distToNextCurve, nextCurveText,
  distToTechnical, technicalCurveCount,
  currentZone
}) {
  if (currentZone !== 'transit') return null

  // Don't fire too close to last data callout (at least 2 miles gap)
  if (currentDist - state.lastDataCalloutDist < 3218) return null

  const remainingDist = totalDist - currentDist
  const remainingMi = (remainingDist / 1609.34).toFixed(0)
  const avgSpeed = getAvgSpeed(5)
  const elapsed = Date.now() - state.navStartTime

  // Build pool of candidate callouts, pick the most relevant one
  const candidates = []

  // Speed check (after at least 3 miles of driving) — weighted UP, most interesting data
  if (avgSpeed && currentDist > 4828) {
    candidates.push({
      text: `Averaging ${avgSpeed} through this stretch.`,
      weight: 4,
      category: 'speed',
    })

    // Speed comparison to previous stretch
    const avgSpeedLong = getAvgSpeed(15)
    if (avgSpeedLong && Math.abs(avgSpeed - avgSpeedLong) > 5) {
      if (avgSpeed > avgSpeedLong) {
        candidates.push({
          text: `Picked up the pace. ${avgSpeed} in the last 5 miles, up from ${avgSpeedLong} average.`,
          weight: 4,
          category: 'speed',
        })
      }
    }

    // Top speed mention (only once-ish, when it's notable)
    if (state.topSpeed > avgSpeed + 15 && state.topSpeed > 70) {
      candidates.push({
        text: `Top speed so far, ${Math.round(state.topSpeed)}. Averaging ${avgSpeed}.`,
        weight: 3,
        category: 'speed',
      })
    }
  }

  // ETA to destination
  if (avgSpeed && avgSpeed > 20 && remainingDist > 8000) {
    const etaMinutes = Math.round((remainingDist / 1609.34) / avgSpeed * 60)
    if (etaMinutes > 5) {
      const etaDate = new Date(Date.now() + etaMinutes * 60000)
      candidates.push({
        text: `About ${etaMinutes} minutes to go. Should arrive around ${formatClockTime(etaDate)}.`,
        weight: 2,
        category: 'eta',
      })
    }
  }

  // ETA to technical — weighted DOWN, capped at 2 total technical mentions
  if (distToTechnical && distToTechnical > 3000 && avgSpeed && avgSpeed > 20 && state.technicalMentionCount < 2) {
    const etaMins = Math.round((distToTechnical / 1609.34) / avgSpeed * 60)
    if (etaMins > 3 && etaMins < 120) {
      const etaDate = new Date(Date.now() + etaMins * 60000)
      candidates.push({
        text: `Technical section in about ${etaMins} minutes at this pace. Should hit the twisties around ${formatClockTime(etaDate)}.`,
        weight: 1, // Low weight — countdown milestones handle this; avoid repetitive countdown feel
        category: 'eta-technical',
      })
    }
  }

  // Clear ahead (when nothing for a long time)
  if (distToNextCurve > 8000 && nextCurveText) { // > 5 miles to next curve
    const clearMi = (distToNextCurve / 1609.34).toFixed(0)
    candidates.push({
      text: `Clear for the next ${clearMi} miles. Next up, ${nextCurveText}.`,
      weight: 3,
      category: 'clear',
    })
  }

  // Time elapsed
  if (elapsed > 600000 && elapsed < 900000) { // 10-15 min mark
    candidates.push({
      text: `${formatTime(elapsed)} in. ${remainingMi} miles to go.`,
      weight: 1,
      category: 'elapsed',
    })
  }

  // Elapsed time for longer drives
  if (elapsed > 1800000) { // 30+ min
    const elapsedStr = formatTime(elapsed)
    candidates.push({
      text: `${elapsedStr} on the road. ${remainingMi} miles remaining.`,
      weight: 1,
      category: 'elapsed',
    })
  }

  if (candidates.length === 0) return null

  // Filter out candidates matching the last category to avoid repeats
  let filtered = candidates.filter(c => c.category !== state.lastDataCategory)
  if (filtered.length === 0) filtered = candidates // fallback if all filtered out

  // Weighted random selection — higher weight = more likely
  const totalWeight = filtered.reduce((sum, c) => sum + c.weight, 0)
  let rand = Math.random() * totalWeight
  let selected = filtered[0]
  for (const c of filtered) {
    rand -= c.weight
    if (rand <= 0) { selected = c; break }
  }

  state.lastDataCalloutDist = currentDist
  state.lastDataCategory = selected.category

  // Track technical mentions toward the global cap of 2
  if (selected.category === 'eta-technical') {
    state.technicalMentionCount++
  }

  return { text: selected.text, category: 'data' }
}

// ────────────────────────────────
// 2. PROGRESS MILESTONES
// ────────────────────────────────

export function getProgressCallout({ currentDist, totalDist, currentSpeed }) {
  const pct = (currentDist / totalDist) * 100
  const remainingMi = ((totalDist - currentDist) / 1609.34).toFixed(0)
  const avgSpeed = getAvgSpeed(10)

  const milestones = [
    { pct: 25, getText: () => `Quarter of the way. ${remainingMi} miles to go.` },
    { pct: 50, getText: () => {
      if (avgSpeed) {
        const etaMins = Math.round((parseFloat(remainingMi)) / avgSpeed * 60)
        return `Halfway. ${remainingMi} miles left, about ${etaMins} minutes.`
      }
      return `Halfway done. ${remainingMi} miles to go.`
    }},
    { pct: 75, getText: () => `Three quarters done. ${remainingMi} miles left.` },
    { pct: 90, getText: () => `Almost there. ${remainingMi} miles to go.` },
  ]

  for (const m of milestones) {
    if (pct >= m.pct && !state.progressMilestones.has(m.pct)) {
      state.progressMilestones.add(m.pct)
      return { text: m.getText(), category: 'progress' }
    }
  }

  return null
}

// ────────────────────────────────
// 3. COUNTDOWN TO TECHNICAL
// ────────────────────────────────

export function getCountdownCallout({ distToTechnical, technicalCurveCount, currentSpeed, currentDist }) {
  if (!distToTechnical || distToTechnical < 0) return null

  // Hard cap: max 2 total technical-related callouts (countdown + eta-technical combined)
  if (state.technicalMentionCount >= 2) return null

  const miToTech = distToTechnical / 1609.34
  const avgSpeed = getAvgSpeed(3)

  // Only 2 milestones: early heads-up (10mi) and final warning (5mi)
  const milestones = [
    { miles: 10, getText: () => {
      if (avgSpeed) {
        const mins = Math.round(10 / avgSpeed * 60)
        return `10 miles to the twisties. About ${mins} minutes.`
      }
      return `10 miles to the technical section. ${technicalCurveCount} curves waiting.`
    }},
    { miles: 5, getText: () => `5 miles out. ${technicalCurveCount} curves in the technical section.` },
  ]

  for (const m of milestones) {
    if (miToTech <= m.miles && !state.countdownMilestones.has(m.miles)) {
      // Don't fire multiple at once (at least 0.5mi between)
      if (currentDist - state.lastCountdownDist < 805) return null

      state.countdownMilestones.add(m.miles)
      state.lastCountdownDist = currentDist
      state.technicalMentionCount++
      return { text: m.getText(), category: 'countdown' }
    }
  }

  return null
}

// ────────────────────────────────
// 4. CURVE SCORING (technical zone)
// ────────────────────────────────

export function getCurveScoreCallout(mile, severity, speedAtCurve) {
  // Only score significant curves (severity 2-4, i.e. rally scale 2-4)
  if (severity > 4) return null  // gentle curves aren't interesting to score

  // What's "good" speed through a curve of this severity?
  // These are rough targets — tune based on testing
  const targets = {
    2: { brave: 30, normal: 20, cautious: 15 },   // hairpin/90°+
    3: { brave: 45, normal: 35, cautious: 25 },   // hard curves 70-89°
    4: { brave: 55, normal: 45, cautious: 35 },   // medium curves 50-69°
  }

  const target = targets[severity]
  if (!target) return null

  const speed = Math.round(speedAtCurve)

  let comment
  if (speedAtCurve >= target.brave) {
    const options = [
      `${speed} through that one. Committed.`,
      `${speed} mph. Brave.`,
      `Nice. ${speed} through there.`,
      `${speed}. Sending it.`,
    ]
    comment = options[Math.floor(Math.random() * options.length)]
  } else if (speedAtCurve >= target.normal) {
    // Normal pace — don't comment on every one, only sometimes
    if (Math.random() > 0.3) return null
    const options = [
      `${speed} through that. Solid.`,
      `${speed}. Good pace.`,
    ]
    comment = options[Math.floor(Math.random() * options.length)]
  } else if (speedAtCurve < target.cautious) {
    // Slow — only comment occasionally, never judgmental
    if (Math.random() > 0.2) return null
    comment = `${speed} through there. Plenty of room.`
  } else {
    return null
  }

  recordCurveSpeed(mile, severity, speedAtCurve)
  return { text: comment, category: 'curveScore' }
}

// ────────────────────────────────
// 5. DRIVE PERSONALITY (after 10+ miles)
// ────────────────────────────────

export function getDrivePersonalityCallout({ currentDist, currentSpeed, currentZone }) {
  // Only fire once, after at least 10 miles
  if (currentDist < 16093) return null
  if (state.personalityFired) return null

  const avgSpeed = getAvgSpeed(10)
  if (!avgSpeed) return null

  state.personalityFired = true

  // Characterize based on average highway speed
  if (currentZone === 'transit') {
    if (avgSpeed > 80) {
      return { text: `Spirited pace. Averaging ${avgSpeed} over the last stretch.`, category: 'personality' }
    } else if (avgSpeed > 68) {
      return { text: `Steady cruising. ${avgSpeed} average. Good rhythm.`, category: 'personality' }
    } else if (avgSpeed > 55) {
      return { text: `Taking it easy. ${avgSpeed} average through the highway.`, category: 'personality' }
    }
  }

  return null
}

// ────────────────────────────────
// 6. TECHNICAL SECTION RECAP
// ────────────────────────────────

export function getTechnicalRecap({ curvesCompletedTotal, currentZone }) {
  // Fire when leaving technical into transit or urban
  if (currentZone === 'technical') return null
  if (!state.technicalEntryTime) return null

  // Only fire once per technical section
  const entryTime = state.technicalEntryTime
  state.technicalEntryTime = null

  const timeInTechnical = Date.now() - entryTime
  const curvesInSection = curvesCompletedTotal - state.technicalEntryCurvesCompleted

  if (curvesInSection < 3) return null

  const mins = Math.round(timeInTechnical / 60000)

  // Find fastest curve
  let fastestEntry = null
  for (const entry of state.curveSpeedsInTechnical) {
    if (!fastestEntry || entry.speed > fastestEntry.speed) {
      fastestEntry = entry
    }
  }

  // Calculate average speed through technical
  const techAvg = state.technicalSpeedSamples.length > 0
    ? Math.round(state.technicalSpeedSamples.reduce((s, e) => s + e.speed, 0) / state.technicalSpeedSamples.length)
    : null

  let recap = `${curvesInSection} curves done in ${mins} minute${mins !== 1 ? 's' : ''}.`

  if (techAvg) {
    recap += ` Averaged ${techAvg} through the technical.`
  }

  if (fastestEntry && fastestEntry.speed > 30) {
    recap += ` Fastest was ${Math.round(fastestEntry.speed)} through mile ${fastestEntry.mile.toFixed(1)}.`
  }

  return { text: recap, category: 'recap' }
}

// ────────────────────────────────
// MAIN ENTRY: Get best dynamic chatter
// Called by the planner when there's chatter budget
// ────────────────────────────────

export function getDynamicChatter(data) {
  // Record speed sample
  recordSpeed(data.currentSpeed, data.currentDist)

  // Record technical speed if in technical zone
  if (data.currentZone === 'technical') {
    state.technicalSpeedSamples.push({
      speed: data.currentSpeed,
      distance: data.currentDist
    })
  }

  // Try generators in priority order

  // 1. Countdown to technical (high priority when close)
  if (data.distToTechnical && data.distToTechnical < 16093 && data.distToTechnical > 0) {
    const countdown = getCountdownCallout({
      ...data,
      currentDist: data.currentDist,
    })
    if (countdown) return countdown
  }

  // 2. Progress milestones
  const progress = getProgressCallout(data)
  if (progress) return progress

  // 3. Technical recap (just left technical)
  const recap = getTechnicalRecap(data)
  if (recap) return recap

  // 4. Drive personality (one-time)
  const personality = getDrivePersonalityCallout(data)
  if (personality) return personality

  // 5. Data callouts (speed, ETA, clear ahead)
  const dataCallout = getDataCallout(data)
  if (dataCallout) return dataCallout

  // 6. Nothing dynamic to say — fall back to pre-generated chatter
  return null
}
