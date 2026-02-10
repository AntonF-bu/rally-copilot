import { useEffect, useRef, useCallback } from 'react'
import useStore from '../store'
import { DRIVING_MODE } from '../services/calloutEngine'
import { getDynamicChatter, resetDynamicChatter, getCurveScoreCallout, recordCurveSpeed, enterTechnical, getTechnicalRecap } from '../services/dynamicChatter'

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

/**
 * Convert curve callout text to clean spoken form for briefings/crossfades.
 * "CAUTION - Right 45°" → "right 4"
 * "Right 30° into HARD LEFT 88°" → "right 5 into left 2"
 * Matches cleanForSpeech rally scale: 180+=hairpin, 120+=1, 80+=2, 60+=3, 40+=4, 20+=5, <20=6
 */
function cleanCurveForBriefing(text) {
  if (!text) return null
  let clean = text.replace(/^CAUTION\s*-\s*/i, '')
  clean = clean.replace(/(\d+)°/g, (match, deg) => {
    const d = parseFloat(deg)
    if (d >= 180) return 'hairpin'
    if (d >= 120) return '1'
    if (d >= 80) return '2'
    if (d >= 60) return '3'
    if (d >= 40) return '4'
    if (d >= 20) return '5'
    return '6'
  })
  clean = clean.replace(/HARD\s+/gi, '')
  return clean.toLowerCase().trim()
}

export function useSpeechPlanner({
  isRunning,
  currentMode,
  currentSpeed,
  userDistanceAlongRoute,
  curatedHighwayCallouts,
  routeZones,
  announcedCalloutsRef,
  speak,
  routeData,
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

  // Curve scoring (deferred to next cycle after curve fires)
  const pendingScoreRef = useRef(null)

  // Previous zone tracking (for technical recap on exit)
  const lastZoneRef = useRef(null)

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
      resetDynamicChatter()
      lastPlanDistRef.current = 0
      lastPlanTimeRef.current = Date.now()
      lastSpokenRef.current = { text: '', source: '', time: 0, distance: 0 }
      lastZoneIdRef.current = null
      currentZoneRef.current = null
      lastZoneRef.current = null
      pendingScoreRef.current = null
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
  // Uses actual curve descriptions instead of abstract counts
  // ================================
  const buildZoneBriefing = useCallback((zone, upcoming, budget) => {
    if (!zone) return null

    const character = zone.character
    const zoneLengthMi = ((zone.endDistance - zone.startDistance) / 1609.34).toFixed(1)

    // Get curve events in this zone, sorted by distance
    const curvesInZone = upcoming.filter(e =>
      e.source === SOURCE.CURVE &&
      e.distance >= zone.startDistance &&
      e.distance <= zone.endDistance
    ).sort((a, b) => a.distance - b.distance)

    // Helper: distance from zone start to a curve, as readable string
    const distFromStart = (curve) => {
      const mi = ((curve.distance - zone.startDistance) / 1609.34).toFixed(1)
      return `${mi} miles`
    }

    // Find next zone after this one
    const nextZone = (routeZones || []).find(z =>
      z.startDistance > zone.startDistance && z.character !== zone.character
    )
    const nextZoneDistMi = nextZone
      ? ((nextZone.startDistance - zone.startDistance) / 1609.34).toFixed(0)
      : null

    // ═══════════════════════════════════
    // HIGHWAY BRIEFING (verbose, preview curves)
    // ═══════════════════════════════════
    if (character === 'transit') {
      const parts = ['Open road.']

      if (budget.budgetSeconds > 20 && curvesInZone.length > 0) {
        // FULL BRIEFING: name the first 2-3 curves
        const previewCount = Math.min(curvesInZone.length, 3)

        // First curve with distance
        const first = curvesInZone[0]
        const firstName = cleanCurveForBriefing(first.text)
        parts.push(`${firstName} in ${distFromStart(first)}.`)

        // Second curve
        if (previewCount >= 2) {
          const second = curvesInZone[1]
          const secondName = cleanCurveForBriefing(second.text)
          const gapMi = ((second.distance - first.distance) / 1609.34).toFixed(1)
          if (parseFloat(gapMi) < 1) {
            parts.push(`Then ${secondName}.`)
          } else {
            parts.push(`Then ${secondName} in ${gapMi} miles.`)
          }
        }

        // Third curve (only if budget allows)
        if (previewCount >= 3 && budget.budgetSeconds > 30) {
          const third = curvesInZone[2]
          const thirdName = cleanCurveForBriefing(third.text)
          parts.push(`Then ${thirdName}.`)
        }

        // After the curves: describe what follows
        if (curvesInZone.length <= 3) {
          const lastCurve = curvesInZone[curvesInZone.length - 1]
          const remainingMi = ((zone.endDistance - lastCurve.distance) / 1609.34).toFixed(0)
          if (parseFloat(remainingMi) > 3) {
            parts.push('Long straight after.')
          }
        } else {
          parts.push(`${curvesInZone.length} curves total.`)
        }

      } else if (budget.budgetSeconds > 10 && curvesInZone.length > 0) {
        // MEDIUM BRIEFING: just name the first curve
        const first = curvesInZone[0]
        const firstName = cleanCurveForBriefing(first.text)
        parts.push(`${zoneLengthMi} miles. ${firstName} in ${distFromStart(first)}.`)

      } else if (curvesInZone.length === 0) {
        // No curves in zone
        parts.push(`${zoneLengthMi} miles. Straight ahead.`)

      } else {
        // SHORT BRIEFING
        parts.push(`${zoneLengthMi} miles.`)
      }

      // Next zone preview
      if (nextZone && nextZoneDistMi && budget.budgetSeconds > 15) {
        if (nextZone.character === 'technical') {
          parts.push(`Technical in ${nextZoneDistMi} miles.`)
        } else if (nextZone.character === 'urban') {
          parts.push(`Urban in ${nextZoneDistMi} miles.`)
        }
      }

      return parts.join(' ')
    }

    // ═══════════════════════════════════
    // TECHNICAL BRIEFING (surgical, curve count + first curve)
    // ═══════════════════════════════════
    if (character === 'technical') {
      if (budget.budgetSeconds > 10 && curvesInZone.length > 0) {
        const first = curvesInZone[0]
        const firstName = cleanCurveForBriefing(first.text)
        const firstDist = distFromStart(first)
        return `Technical section. ${curvesInZone.length} curves in ${zoneLengthMi} miles. First up, ${firstName} in ${firstDist}. Stay sharp.`
      } else if (curvesInZone.length > 0) {
        return `Technical. ${curvesInZone.length} curves. Stay sharp.`
      } else {
        return 'Technical section. Stay sharp.'
      }
    }

    // ═══════════════════════════════════
    // URBAN BRIEFING (minimal)
    // ═══════════════════════════════════
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

    // Map source to voice profile for dynamic TTS settings
    const voiceProfile = source === SOURCE.CURVE ? 'curve'
                       : source === SOURCE.CHATTER ? 'chatter'
                       : source === SOURCE.BRIEFING ? 'briefing'
                       : 'default'

    speak(text, speakPriority, { voiceProfile })

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

    // ── STEP 0: Pending curve score ──
    if (pendingScoreRef.current) {
      const ps = pendingScoreRef.current
      pendingScoreRef.current = null

      const score = getCurveScoreCallout(ps.mile, ps.severity, ps.speed)
      if (score) {
        submitSpeech(score.text, SOURCE.CHATTER, PRIORITY[SOURCE.CHATTER], `score-${ps.mile}`)
      }
    }

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
      const previousZone = lastZoneRef.current
      lastZoneRef.current = zone
      lastZoneIdRef.current = zoneId
      currentZoneRef.current = zone

      // Technical recap: fire when LEAVING technical
      if (previousZone?.character === 'technical' && zone.character !== 'technical') {
        const curvesCompleted = (curatedHighwayCallouts || []).filter(c =>
          announcedCalloutsRef.current.has(c.id)
        ).length

        const recap = getTechnicalRecap({
          curvesCompletedTotal: curvesCompleted,
          currentZone: zone.character,
        })

        if (recap) {
          submitSpeech(recap.text, SOURCE.CHATTER, PRIORITY[SOURCE.CHATTER], `recap-${dist}`)
          // Don't return — still fire zone briefing after recap
        }
      }

      // Track technical entry for recap
      if (zone.character === 'technical') {
        const curvesCompleted = (curatedHighwayCallouts || []).filter(c =>
          announcedCalloutsRef.current.has(c.id)
        ).length
        enterTechnical(curvesCompleted)
      }

      // Check if crossfade already covered this zone transition
      // (crossfade marks the transition callout as announced)
      const nearbyTransition = briefings.find(e =>
        Math.abs(e.distance - zone.startDistance) < 200
      )
      const alreadyCrossfaded = nearbyTransition &&
        announcedCalloutsRef.current.has(nearbyTransition.id)

      if (alreadyCrossfaded) {
        console.log(`📢 [${(dist / 1609.34).toFixed(1)}mi] Zone briefing skipped — crossfade already covered it`)
        return
      }

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

    // --- STEP 5: Curve callouts (with zone boundary crossfade) ---
    // When the last curve before a zone boundary fires, append transition
    // context and preview the next zone's first curves in one smooth sentence.
    for (const curve of curves) {
      if (announcedCalloutsRef.current.has(curve.id)) continue

      // Urban zone filter: only speak dangerous curves (70°+)
      // BUT: only filter if the curve itself is IN an urban zone
      // Don't filter curves that are physically in highway/technical zones
      // even if currentMode hasn't caught up yet
      if (currentMode === DRIVING_MODE.URBAN) {
        const curveZone = routeZones?.find(z =>
          curve.distance >= z.startDistance && curve.distance <= z.endDistance
        )
        const curveIsInUrban = !curveZone || curveZone.character === 'urban'

        if (curveIsInUrban) {
          const angleMatch = (curve.text || '').match(/(\d+)°/)
          const angle = angleMatch ? parseFloat(angleMatch[1]) : 0
          if (angle < 70) {
            announcedCalloutsRef.current.add(curve.id)
            continue
          }
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

        // ─── ZONE BOUNDARY CROSSFADE ───
        // If this is the last curve before a zone change, append transition
        // context and preview the next zone's first curves
        let speechText = curve.text

        if (zone && routeZones?.length) {
          const distToZoneEnd = zone.endDistance - curve.distance

          // Within 800m of zone boundary?
          if (distToZoneEnd > 0 && distToZoneEnd < 800) {
            // Check: no other unannounced curves between this one and zone end
            const curvesAfterInZone = curves.filter(c =>
              !announcedCalloutsRef.current.has(c.id) &&
              c.id !== curve.id &&
              c.distance > curve.distance &&
              c.distance < zone.endDistance
            )

            if (curvesAfterInZone.length === 0) {
              // Find the next zone (different character)
              const nextZone = routeZones.find(z =>
                z.startDistance >= zone.endDistance - 50 &&
                z.character !== zone.character
              )

              if (nextZone) {
                // Build crossfade suffix
                const crossfadeParts = []

                // Zone transition label
                const zoneLabel = nextZone.character === 'technical' ? 'technical section'
                                : nextZone.character === 'transit' ? 'open road'
                                : 'urban zone'
                crossfadeParts.push(`Then ${zoneLabel}.`)

                // Preview first 2-3 curves in next zone
                const nextZoneCurves = (curatedHighwayCallouts || []).filter(c => {
                  if (announcedCalloutsRef.current.has(c.id)) return false
                  const cDist = c.triggerDistance > 0 ? c.triggerDistance : ((c.triggerMile || 0) * 1609.34)
                  return cDist >= nextZone.startDistance &&
                         cDist <= nextZone.endDistance &&
                         /left|right|hairpin|chicane|esses|sweeper/i.test(c.text || '')
                }).sort((a, b) => {
                  const aDist = a.triggerDistance > 0 ? a.triggerDistance : ((a.triggerMile || 0) * 1609.34)
                  const bDist = b.triggerDistance > 0 ? b.triggerDistance : ((b.triggerMile || 0) * 1609.34)
                  return aDist - bDist
                })

                const maxPreview = budget.budgetSeconds > 15 ? 3 : 2
                const previewCount = Math.min(nextZoneCurves.length, maxPreview)

                if (previewCount > 0) {
                  const firstName = cleanCurveForBriefing(nextZoneCurves[0].text)
                  if (firstName) crossfadeParts.push(`First up, ${firstName}.`)

                  if (previewCount >= 2) {
                    const secondName = cleanCurveForBriefing(nextZoneCurves[1].text)
                    if (secondName) crossfadeParts.push(`Then ${secondName}.`)
                  }

                  if (previewCount >= 3) {
                    const thirdName = cleanCurveForBriefing(nextZoneCurves[2].text)
                    if (thirdName) crossfadeParts.push(`Then ${thirdName}.`)
                  }
                }

                speechText = `${curve.text}. ${crossfadeParts.join(' ')}`

                // Mark the transition callout at the boundary as announced
                // so Step 4 skips the standalone briefing when we enter the next zone
                const transitionAtBoundary = briefings.find(e =>
                  Math.abs(e.distance - nextZone.startDistance) < 200
                )
                if (transitionAtBoundary) {
                  announcedCalloutsRef.current.add(transitionAtBoundary.id)
                }

                console.log(`🔗 [${(dist / 1609.34).toFixed(1)}mi] Crossfade: curve + ${nextZone.character} zone preview`)
              }
            }
          }
        }

        submitSpeech(speechText, SOURCE.CURVE, PRIORITY[SOURCE.CURVE], curve.id)

        // ── CURVE SCORING (technical only) ──
        if (currentMode === DRIVING_MODE.TECHNICAL && curve.source === SOURCE.CURVE) {
          const angleMatch = (curve.text || '').match(/(\d+)°/)
          const angle = angleMatch ? parseFloat(angleMatch[1]) : 0
          const severity = angle >= 90 ? 2 : angle >= 70 ? 3 : angle >= 50 ? 4 : angle >= 30 ? 5 : 6

          // Record for recap
          recordCurveSpeed((dist / 1609.34), severity, currentSpeed)

          // Get immediate curve score callout (only for hard curves)
          // Deferred to NEXT planning cycle so the curve callout plays first
          if (severity <= 4 && budget.budgetSeconds > 8) {
            pendingScoreRef.current = { mile: dist / 1609.34, severity, speed: currentSpeed }
          }
        }

        // Only speak one curve per cycle (next cycle handles the next one)
        break
      }
    }

    // ─── STEP 6: Dynamic chatter ───
    // Only in highway zones, only when there's speech budget
    if (currentMode === DRIVING_MODE.HIGHWAY && budget.budgetSeconds > 15) {
      // Don't fire within 5000m (~3 miles) of last spoken chatter
      // This single gap controls all chatter spacing so dynamic and pre-gen don't pile up
      const distSinceLastSpeak = dist - lastSpokenRef.current.distance
      if (distSinceLastSpeak > 5000 || lastSpokenRef.current.distance === 0) {

        // Calculate data for dynamic chatter
        const curvesCompleted = (curatedHighwayCallouts || []).filter(c =>
          announcedCalloutsRef.current.has(c.id)
        ).length

        // Find distance to next technical zone
        const nextTechnical = (routeZones || []).find(z =>
          z.startDistance > dist && z.character === 'technical'
        )
        const distToTechnical = nextTechnical
          ? nextTechnical.startDistance - dist
          : null

        // Count curves in that technical zone
        const technicalCurveCount = nextTechnical
          ? (curatedHighwayCallouts || []).filter(c => {
              const d = c.triggerDistance > 0 ? c.triggerDistance : ((c.triggerMile || 0) * 1609.34)
              return d >= nextTechnical.startDistance && d <= nextTechnical.endDistance &&
                     /left|right|hairpin/i.test(c.text || '')
            }).length
          : 0

        // Get nearest curve for "clear ahead" callouts
        const nearestCurveClean = nearestCurve ? cleanCurveForBriefing(nearestCurve.text) : null

        const result = getDynamicChatter({
          currentDist: dist,
          currentSpeed,
          totalDist: routeData?.distance || dist + 10000,
          distToNextCurve: nearestCurve ? nearestCurve.ahead : 99999,
          nextCurveText: nearestCurveClean,
          distToTechnical,
          technicalCurveCount,
          currentZone: 'transit',
          curvesCompletedTotal: curvesCompleted,
        })

        if (result) {
          submitSpeech(result.text, SOURCE.CHATTER, PRIORITY[SOURCE.CHATTER], `dynamic-${result.category}-${dist}`)
        } else {
          // Fall back to pre-generated chatter timeline
          for (const chat of chatters) {
            if (announcedChatterRef.current.has(chat.id)) continue
            if (chat.ahead > -200 && chat.ahead < 200) {
              submitSpeech(chat.text, SOURCE.CHATTER, PRIORITY[SOURCE.CHATTER], chat.id)
              break
            }
          }
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
      curatedHighwayCallouts, routeZones, routeData, findCurrentZone, getUpcoming,
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
