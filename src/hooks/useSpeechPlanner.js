import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import { DRIVING_MODE } from '../services/calloutEngine'

// ================================
// Speech Planner v1.0
// The single brain that decides what the driver hears
// Replaces 4 independent useEffects in App.jsx
// ================================

// Speech source types
const SOURCE = {
  CURVE: 'curve',        // Curve/bend callouts — highest priority
  BRIEFING: 'briefing',  // Zone transition briefings
  CHATTER: 'chatter',    // Highway companion chatter
  SYSTEM: 'system',      // "Navigation started" etc
}

// Priority values (higher = more important)
const PRIORITY = {
  [SOURCE.CURVE]: 3,
  [SOURCE.BRIEFING]: 2,
  [SOURCE.CHATTER]: 1,
  [SOURCE.SYSTEM]: 2,
}

// Zone-specific speech density
const ZONE_DENSITY = {
  [DRIVING_MODE.HIGHWAY]: { maxPerMile: 8, chatterAllowed: true, briefingVerbosity: 'full' },
  [DRIVING_MODE.TECHNICAL]: { maxPerMile: 20, chatterAllowed: false, briefingVerbosity: 'minimal' },
  [DRIVING_MODE.URBAN]: { maxPerMile: 4, chatterAllowed: false, briefingVerbosity: 'short' },
}

// TTS overhead: API fetch + audio start latency
const TTS_BUFFER_SECONDS = 1.5
// Approximate speaking rate
const WORDS_PER_SECOND = 2.5
// Minimum speed for budget calc (avoid div by zero)
const MIN_SPEED_MPH = 5

export function useSpeechPlanner({
  isRunning,
  currentMode,
  currentSpeed,
  userDistanceAlongRoute,
  curatedHighwayCallouts,
  routeZones,
  announcedCalloutsRef,
  speak,
}) {
  // ================================
  // INTERNAL STATE
  // ================================

  // Planning cycle triggers
  const lastPlanDistRef = useRef(0)
  const lastPlanTimeRef = useRef(0)

  // Speech tracking
  const lastSpokenRef = useRef({ text: '', source: '', time: 0, distance: 0 })

  // Zone tracking (planner does its own, no dependency on useHighwayMode)
  const lastZoneIdRef = useRef(null)
  const currentZoneRef = useRef(null)

  // Chatter tracking
  const announcedChatterRef = useRef(new Set())

  // Stats for runtime summary
  const statsRef = useRef({ spoken: 0, chatter: 0, dropped: 0, briefings: 0 })
  const lastSummaryRef = useRef(0)

  // Get chatter timeline from store
  const chatterTimeline = useStore(state => state.chatterTimeline)

  // ================================
  // RESET on navigation start/stop
  // ================================
  useEffect(() => {
    if (isRunning) {
      lastPlanDistRef.current = 0
      lastPlanTimeRef.current = Date.now()
      lastSpokenRef.current = { text: '', source: '', time: 0, distance: 0 }
      lastZoneIdRef.current = null
      currentZoneRef.current = null
      announcedChatterRef.current = new Set()
      statsRef.current = { spoken: 0, chatter: 0, dropped: 0, briefings: 0 }
      lastSummaryRef.current = Date.now()
    }
  }, [isRunning])

  // ================================
  // SPEECH BUDGET CALCULATOR
  // ================================
  const calculateBudget = useCallback((distToNextCurve, speedMph) => {
    const speed = Math.max(speedMph, MIN_SPEED_MPH)
    const speedMps = speed * 0.44704 // mph to m/s
    const timeToNextCurve = distToNextCurve / speedMps
    const budgetSeconds = Math.max(0, timeToNextCurve - TTS_BUFFER_SECONDS)
    const budgetWords = Math.floor(budgetSeconds * WORDS_PER_SECOND)

    return { budgetSeconds, budgetWords, timeToNextCurve }
  }, [])

  // ================================
  // FIND CURRENT ZONE
  // ================================
  const findCurrentZone = useCallback((distance) => {
    if (!routeZones?.length) return null
    return routeZones.find(z =>
      distance >= z.startDistance && distance <= z.endDistance
    ) || routeZones[0]
  }, [routeZones])

  // ================================
  // GET UPCOMING EVENTS (the lookahead)
  // ================================
  const getUpcoming = useCallback((currentDist, lookaheadMeters = 3000) => {
    const events = []

    // Upcoming curated callouts (curves, transitions, etc)
    if (curatedHighwayCallouts?.length) {
      for (const callout of curatedHighwayCallouts) {
        if (announcedCalloutsRef.current.has(callout.id)) continue

        const dist = callout.triggerDistance > 0 ? callout.triggerDistance : ((callout.triggerMile || 0) * 1609.34)
        const ahead = dist - currentDist

        if (ahead > -50 && ahead < lookaheadMeters) {
          const isCurve = /left|right|hairpin|chicane|esses|sweeper/i.test(callout.text || '')
          const isTransition = callout.type === 'transition'

          // If marked as transition but text is curve-like, it's a misclassified curve
          const actualSource = (isTransition && !isCurve) ? SOURCE.BRIEFING
                             : isCurve ? SOURCE.CURVE : SOURCE.BRIEFING

          events.push({
            id: callout.id,
            distance: dist,
            ahead,
            text: callout.text,
            source: actualSource,
            priority: PRIORITY[actualSource],
            originalCallout: callout,
          })
        }
      }
    }

    // Upcoming chatter triggers
    const timeline = chatterTimeline || window.__chatterTimeline
    if (timeline?.length) {
      for (const item of timeline) {
        if (announcedChatterRef.current.has(item.id)) continue

        const dist = (item.triggerMile || item.mile || 0) * 1609.34
        const ahead = dist - currentDist

        if (ahead > -200 && ahead < lookaheadMeters) {
          // Pick variant based on speed
          let text = item.text
          if (item.variants) {
            const cat = currentSpeed > 70 ? 'fast' : currentSpeed > 50 ? 'cruise' : 'slow'
            const variants = item.variants[cat] || item.variants.cruise || [item.text]
            text = Array.isArray(variants) ? variants[Math.floor(Math.random() * variants.length)] : variants
          }

          events.push({
            id: item.id,
            distance: dist,
            ahead,
            text,
            source: SOURCE.CHATTER,
            priority: PRIORITY[SOURCE.CHATTER],
            isChatter: true,
          })
        }
      }
    }

    // Sort by distance
    events.sort((a, b) => a.distance - b.distance)
    return events
  }, [curatedHighwayCallouts, chatterTimeline, announcedCalloutsRef, currentSpeed])

  // ================================
  // ZONE BRIEFING BUILDER
  // Builds dynamic text sized to the speech budget
  // ================================
  const buildZoneBriefing = useCallback((zone, upcoming, budget) => {
    if (!zone) return null

    const character = zone.character
    const zoneLengthMi = ((zone.endDistance - zone.startDistance) / 1609.34).toFixed(1)

    // Count curve events in this zone
    const curvesInZone = upcoming.filter(e =>
      e.source === SOURCE.CURVE &&
      e.distance >= zone.startDistance &&
      e.distance <= zone.endDistance
    )

    if (character === 'transit') {
      // HIGHWAY — scale verbosity to budget
      if (budget.budgetSeconds > 20) {
        // Full briefing
        const parts = [`Open road. ${zoneLengthMi} miles.`]
        if (curvesInZone.length === 0) {
          parts.push('Straight ahead.')
        } else {
          parts.push(`${curvesInZone.length} curves ahead.`)
        }
        // Preview first curve
        if (curvesInZone.length > 0) {
          const firstDist = curvesInZone[0].distance - zone.startDistance
          const firstMi = (firstDist / 1609.34).toFixed(1)
          if (parseFloat(firstMi) > 0.3) {
            parts.push(`First in ${firstMi} miles.`)
          }
        }
        // Preview what's after highway
        const nextTechZone = (routeZones || []).find(z =>
          z.startDistance > zone.startDistance && z.character === 'technical'
        )
        if (nextTechZone) {
          const distToTech = ((nextTechZone.startDistance - zone.startDistance) / 1609.34).toFixed(0)
          parts.push(`Technical in ${distToTech} miles.`)
        }
        return parts.join(' ')
      } else if (budget.budgetSeconds > 10) {
        // Medium briefing
        const parts = [`Open road. ${zoneLengthMi} miles.`]
        if (curvesInZone.length > 0) {
          parts.push(`${curvesInZone.length} curves.`)
        }
        return parts.join(' ')
      } else {
        // Short
        return 'Open road.'
      }
    }

    if (character === 'technical') {
      if (budget.budgetSeconds > 10) {
        return `Technical section. ${curvesInZone.length} curves in ${zoneLengthMi} miles. Stay sharp.`
      } else {
        return 'Technical. Stay sharp.'
      }
    }

    if (character === 'urban') {
      return 'Urban zone. Watch for traffic.'
    }

    return null
  }, [routeZones])

  // ================================
  // SUBMIT SPEECH (the gatekeeper)
  // ================================
  const submitSpeech = useCallback((text, source, priority, eventId) => {
    if (!text) return false

    const now = Date.now()
    const dist = userDistanceAlongRoute
    const last = lastSpokenRef.current

    // Dedup: same text within 500m
    if (text === last.text && dist - last.distance < 500) {
      console.log(`🚫 DROP [${source}] "${text.slice(0, 40)}..." — dedup (same text ${Math.round(dist - last.distance)}m ago)`)
      statsRef.current.dropped++
      return false
    }

    // Dedup: same source within 200m (except curves, they can be close)
    if (source === last.source && source !== SOURCE.CURVE && dist - last.distance < 200) {
      console.log(`🚫 DROP [${source}] "${text.slice(0, 40)}..." — same source too soon`)
      statsRef.current.dropped++
      return false
    }

    // Map source to useSpeech priority
    const speakPriority = source === SOURCE.CURVE ? 'high'
                        : source === SOURCE.CHATTER ? 'low'
                        : 'normal'

    // Speak it
    const mi = (dist / 1609.34).toFixed(1)
    const emoji = source === SOURCE.CURVE ? '🔊'
                : source === SOURCE.CHATTER ? '🎙️'
                : source === SOURCE.BRIEFING ? '📢'
                : '🔈'
    console.log(`${emoji} [${mi}mi] [${source}] "${text}"`)

    speak(text, speakPriority)

    // Update tracking
    lastSpokenRef.current = { text, source, time: now, distance: dist }

    // Mark as announced
    if (eventId) {
      if (source === SOURCE.CHATTER) {
        announcedChatterRef.current.add(eventId)
      } else {
        announcedCalloutsRef.current.add(eventId)
      }
    }

    // Stats
    statsRef.current.spoken++
    if (source === SOURCE.CHATTER) statsRef.current.chatter++
    if (source === SOURCE.BRIEFING) statsRef.current.briefings++

    return true
  }, [speak, userDistanceAlongRoute, announcedCalloutsRef])

  // ================================
  // THE MAIN PLANNING LOOP
  // ================================
  useEffect(() => {
    if (!isRunning) return
    if (!curatedHighwayCallouts?.length) return

    const now = Date.now()
    const dist = userDistanceAlongRoute

    // Hybrid trigger: every 100m OR every 2 seconds
    const distDelta = Math.abs(dist - lastPlanDistRef.current)
    const timeDelta = now - lastPlanTimeRef.current
    if (distDelta < 100 && timeDelta < 2000) return

    lastPlanDistRef.current = dist
    lastPlanTimeRef.current = now

    // --- STEP 1: Where am I? ---
    const zone = findCurrentZone(dist)
    const zoneConfig = ZONE_DENSITY[currentMode] || ZONE_DENSITY[DRIVING_MODE.HIGHWAY]

    // --- STEP 2: What's coming? ---
    const upcoming = getUpcoming(dist)

    // Separate by type
    const curves = upcoming.filter(e => e.source === SOURCE.CURVE)
    const briefings = upcoming.filter(e => e.source === SOURCE.BRIEFING)
    const chatters = upcoming.filter(e => e.source === SOURCE.CHATTER)

    // Find nearest curve (for budget calculation)
    const nearestCurve = curves[0]
    const distToNextCurve = nearestCurve ? nearestCurve.ahead : 10000 // 10km = "nothing coming"

    // --- STEP 3: Speech budget ---
    const budget = calculateBudget(distToNextCurve, currentSpeed)

    // --- STEP 4: Zone change detection ---
    const zoneId = zone ? `${zone.character}-${zone.startDistance}` : null
    const zoneChanged = zoneId && zoneId !== lastZoneIdRef.current

    if (zoneChanged) {
      lastZoneIdRef.current = zoneId
      currentZoneRef.current = zone

      // Build and speak zone briefing
      // Check if there's a curated transition callout for this zone boundary
      const transitionCallout = briefings.find(e => e.ahead > -100 && e.ahead < 200)

      if (transitionCallout) {
        // There's a curated transition callout — upgrade its text with our dynamic briefing
        const briefingText = buildZoneBriefing(zone, upcoming, budget)
        if (briefingText) {
          submitSpeech(briefingText, SOURCE.BRIEFING, PRIORITY[SOURCE.BRIEFING], transitionCallout.id)
        }
      } else {
        // No curated transition — generate our own
        if (budget.budgetSeconds > 3) {
          const briefingText = buildZoneBriefing(zone, upcoming, budget)
          if (briefingText) {
            submitSpeech(briefingText, SOURCE.BRIEFING, PRIORITY[SOURCE.BRIEFING], null)
          }
        }
      }

      // Don't process curves or chatter on the same cycle as a zone briefing
      // Let the briefing breathe. Next cycle (100m or 2s) will handle curves.
      return
    }

    // --- STEP 5: Curve callouts ---
    // Find curves that are within trigger range
    for (const curve of curves) {
      if (announcedCalloutsRef.current.has(curve.id)) continue

      // Urban zone filter: only speak dangerous curves (70°+)
      // Normal intersection turns (29°, 45°) are noise in city driving
      if (currentMode === DRIVING_MODE.URBAN) {
        const angleMatch = (curve.text || '').match(/(\d+)°/)
        const angle = angleMatch ? parseFloat(angleMatch[1]) : 0
        if (angle < 70) {
          announcedCalloutsRef.current.add(curve.id)
          continue
        }
      }

      // Adaptive trigger distance based on speed
      const speedMps = Math.max(currentSpeed, MIN_SPEED_MPH) * 0.44704
      const triggerDist = Math.max(100, Math.min(400, speedMps * 5)) // 5 seconds ahead

      if (curve.ahead > 0 && curve.ahead < triggerDist) {
        const callout = curve.originalCallout
        // Haptic for danger curves
        if (callout && (callout.type === 'danger' || (callout.angle && callout.angle >= 70))) {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate([150])
          }
        }
        submitSpeech(curve.text, SOURCE.CURVE, PRIORITY[SOURCE.CURVE], curve.id)
        // Only speak one curve per cycle (next cycle handles the next one)
        break
      }
    }

    // --- STEP 6: Chatter ---
    if (zoneConfig.chatterAllowed && chatters.length > 0) {
      for (const chat of chatters) {
        if (announcedChatterRef.current.has(chat.id)) continue

        // Chatter triggers at +/-200m of the trigger point
        if (chat.ahead > -200 && chat.ahead < 200) {
          // Only speak if we have enough budget (no curve coming soon)
          if (budget.budgetSeconds > 15) {
            // Also check: don't fire within 400m of last spoken item
            const distSinceLastSpeak = dist - lastSpokenRef.current.distance
            if (distSinceLastSpeak > 400 || lastSpokenRef.current.distance === 0) {
              submitSpeech(chat.text, SOURCE.CHATTER, PRIORITY[SOURCE.CHATTER], chat.id)
            } else {
              console.log(`🚫 DROP [chatter] "${chat.text.slice(0, 30)}..." — too close to last speech (${Math.round(distSinceLastSpeak)}m)`)
              statsRef.current.dropped++
              // Mark as announced so we don't retry every cycle
              announcedChatterRef.current.add(chat.id)
            }
          } else {
            console.log(`🚫 DROP [chatter] "${chat.text.slice(0, 30)}..." — curve coming in ${budget.budgetSeconds.toFixed(0)}s`)
            statsRef.current.dropped++
            announcedChatterRef.current.add(chat.id)
          }
          break
        }
      }
    }

    // --- STEP 7: Handle transition callouts that aren't zone changes ---
    // Some transition callouts fire BEFORE the zone change
    for (const briefing of briefings) {
      if (announcedCalloutsRef.current.has(briefing.id)) continue

      // Trigger within 200m
      if (briefing.ahead > -50 && briefing.ahead < 200) {
        // Don't fire if a curve is imminent
        if (budget.budgetSeconds > 5) {
          submitSpeech(briefing.text, SOURCE.BRIEFING, PRIORITY[SOURCE.BRIEFING], briefing.id)
        } else {
          // Mark as announced, skip it
          announcedCalloutsRef.current.add(briefing.id)
          console.log(`🚫 DROP [briefing] "${briefing.text.slice(0, 30)}..." — curve imminent`)
          statsRef.current.dropped++
        }
        break
      }
    }

    // --- STEP 8: Runtime summary (every 60s) ---
    if (now - lastSummaryRef.current > 60000) {
      lastSummaryRef.current = now
      const mi = (dist / 1609.34).toFixed(1)
      const remaining = (curatedHighwayCallouts || []).filter(c =>
        !announcedCalloutsRef.current.has(c.id)
      ).length
      const st = statsRef.current
      console.log(`⏱️ ${mi}mi | ${Math.round(currentSpeed)}mph | ${currentMode} | spoke:${st.spoken} chatter:${st.chatter} briefings:${st.briefings} dropped:${st.dropped} remaining:${remaining}`)
    }

  }, [isRunning, userDistanceAlongRoute, currentMode, currentSpeed,
      curatedHighwayCallouts, routeZones, findCurrentZone, getUpcoming,
      calculateBudget, buildZoneBriefing, submitSpeech, announcedCalloutsRef])

  // ================================
  // NAVIGATION END SUMMARY
  // ================================
  const prevRunningRef = useRef(false)
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      const mi = (userDistanceAlongRoute / 1609.34).toFixed(1)
      const st = statsRef.current
      console.log(`\n🏁 NAV COMPLETE | ${mi}mi | spoke:${st.spoken} curves chatter:${st.chatter} briefings:${st.briefings} dropped:${st.dropped}\n`)
    }
    prevRunningRef.current = isRunning
  }, [isRunning, userDistanceAlongRoute])

  return { plannerStats: statsRef.current }
}

export default useSpeechPlanner
