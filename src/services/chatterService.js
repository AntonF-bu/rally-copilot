// ================================
// Highway Chatter Service v1.0
// 
// PRE-GENERATES contextual commentary for highway stretches
// - Only for TRANSIT zones (highway/cruise sections)
// - Data-backed observations, never generic
// - 85% professional / 15% witty
// - NEVER interferes with curve callouts
// 
// Generated during RoutePreview, consumed during Navigation
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

// ================================
// TRIGGER TYPES
// ================================
export const CHATTER_TRIGGERS = {
  HIGHWAY_ENTER: 'highway_enter',      // Entering transit zone
  HIGHWAY_EXIT_PREVIEW: 'highway_exit_preview',  // Warning before highway ends
  LONG_STRAIGHT: 'long_straight',      // Extended period without features
  MILESTONE: 'milestone',              // Progress markers
  ELEVATION_CHANGE: 'elevation_change', // Significant climb/descent
  INTERESTING_STAT: 'interesting_stat', // Notable route data point
  BOREDOM_BUSTER: 'boredom_buster',    // Silence breaker
}

// ================================
// MAIN EXPORT: Generate Chatter Timeline
// ================================

/**
 * Analyzes route and generates chatter timeline for highway sections
 * 
 * @param {Object} params
 * @param {Array} params.zones - Route zones from classifier
 * @param {Array} params.callouts - Curated callouts (to avoid conflicts)
 * @param {Object} params.routeData - Route metadata (distance, duration, etc)
 * @param {Array} params.elevationData - Elevation profile (optional)
 * @param {string} apiKey - OpenAI API key
 * 
 * @returns {Object} { chatterTimeline, stats }
 */
export async function generateChatterTimeline({ zones, callouts, routeData, elevationData }, apiKey) {
  console.log('🎙️ Highway Chatter Service v1.0 starting...')
  const startTime = Date.now()
  
  // Extract highway zones only
  const highwayZones = zones?.filter(z => z.character === 'transit') || []
  
  if (highwayZones.length === 0) {
    console.log('ℹ️ No highway zones - skipping chatter generation')
    return { chatterTimeline: [], stats: { highwayCount: 0 } }
  }
  
  console.log(`📍 Found ${highwayZones.length} highway zones`)
  
  // Analyze route for interesting data points
  const routeAnalysis = analyzeRouteForChatter({
    zones,
    callouts,
    routeData,
    elevationData,
    highwayZones
  })
  
  console.log('📊 Route analysis:', {
    totalMiles: routeAnalysis.totalMiles.toFixed(1),
    highwayMiles: routeAnalysis.highwayMiles.toFixed(1),
    longestStraight: routeAnalysis.longestStraight?.miles.toFixed(1) || 'N/A',
    elevationGain: routeAnalysis.elevationGain,
    totalCallouts: routeAnalysis.totalCallouts
  })
  
  // Generate trigger points (rule-based)
  const triggerPoints = generateTriggerPoints(routeAnalysis, highwayZones, callouts)
  
  console.log(`🎯 Generated ${triggerPoints.length} trigger points`)
  
  if (triggerPoints.length === 0) {
    return { chatterTimeline: [], stats: routeAnalysis }
  }
  
  // If no API key, use template-based fallback
  if (!apiKey) {
    console.log('ℹ️ No API key - using template chatter')
    const templateChatter = generateTemplateChatter(triggerPoints, routeAnalysis)
    return { 
      chatterTimeline: templateChatter, 
      stats: routeAnalysis,
      method: 'template'
    }
  }
  
  // Call LLM to generate varied, contextual chatter
  try {
    const llmChatter = await generateLLMChatter(triggerPoints, routeAnalysis, apiKey)
    
    const elapsed = Date.now() - startTime
    console.log(`🎙️ Chatter generation complete in ${elapsed}ms`)
    console.log(`   Generated ${llmChatter.length} chatter items`)
    
    return {
      chatterTimeline: llmChatter,
      stats: routeAnalysis,
      method: 'llm'
    }
  } catch (err) {
    console.warn('⚠️ LLM chatter failed, using templates:', err.message)
    const templateChatter = generateTemplateChatter(triggerPoints, routeAnalysis)
    return { 
      chatterTimeline: templateChatter, 
      stats: routeAnalysis,
      method: 'template_fallback'
    }
  }
}

// ================================
// ROUTE ANALYSIS
// ================================

function analyzeRouteForChatter({ zones, callouts, routeData, elevationData, highwayZones }) {
  const totalMiles = (routeData?.distance || 0) / 1609.34
  
  // Calculate highway miles
  const highwayMiles = highwayZones.reduce((sum, z) => {
    return sum + (z.endDistance - z.startDistance) / 1609.34
  }, 0)
  
  // Find longest straight stretch (gap between callouts in highway zones)
  const longestStraight = findLongestStraight(highwayZones, callouts)
  
  // Elevation analysis
  const { elevationGain, elevationLoss, maxClimb, maxDescent } = analyzeElevation(elevationData, highwayZones)
  
  // Count callouts by zone
  const calloutsByZone = {
    transit: callouts?.filter(c => c.zone === 'transit').length || 0,
    technical: callouts?.filter(c => c.zone === 'technical').length || 0,
    urban: callouts?.filter(c => c.zone === 'urban').length || 0
  }
  
  // Find interesting stats
  const interestingStats = findInterestingStats(zones, callouts, routeData)
  
  return {
    totalMiles,
    highwayMiles,
    highwayPercent: Math.round((highwayMiles / totalMiles) * 100),
    longestStraight,
    elevationGain,
    elevationLoss,
    maxClimb,
    maxDescent,
    totalCallouts: callouts?.length || 0,
    calloutsByZone,
    highwayZones,
    interestingStats
  }
}

function findLongestStraight(highwayZones, callouts) {
  let longest = null
  
  highwayZones.forEach(zone => {
    // Find callouts within this highway zone
    const zoneCallouts = (callouts || [])
      .filter(c => {
        const dist = c.triggerDistance || (c.triggerMile * 1609.34)
        return dist >= zone.startDistance && dist <= zone.endDistance
      })
      .sort((a, b) => {
        const distA = a.triggerDistance || (a.triggerMile * 1609.34)
        const distB = b.triggerDistance || (b.triggerMile * 1609.34)
        return distA - distB
      })
    
    // Check gaps between callouts
    let prevDist = zone.startDistance
    
    zoneCallouts.forEach(callout => {
      const calloutDist = callout.triggerDistance || (callout.triggerMile * 1609.34)
      const gap = calloutDist - prevDist
      const gapMiles = gap / 1609.34
      
      if (!longest || gapMiles > longest.miles) {
        longest = {
          miles: gapMiles,
          startDistance: prevDist,
          endDistance: calloutDist,
          startMile: prevDist / 1609.34,
          endMile: calloutDist / 1609.34
        }
      }
      
      prevDist = calloutDist
    })
    
    // Check gap from last callout to zone end
    const endGap = zone.endDistance - prevDist
    const endGapMiles = endGap / 1609.34
    
    if (!longest || endGapMiles > longest.miles) {
      longest = {
        miles: endGapMiles,
        startDistance: prevDist,
        endDistance: zone.endDistance,
        startMile: prevDist / 1609.34,
        endMile: zone.endDistance / 1609.34
      }
    }
  })
  
  return longest
}

function analyzeElevation(elevationData, highwayZones) {
  if (!elevationData?.length) {
    return { elevationGain: 0, elevationLoss: 0, maxClimb: null, maxDescent: null }
  }
  
  let totalGain = 0
  let totalLoss = 0
  let maxClimb = null
  let maxDescent = null
  
  // Simple gain/loss calculation
  for (let i = 1; i < elevationData.length; i++) {
    const diff = elevationData[i].elevation - elevationData[i-1].elevation
    if (diff > 0) {
      totalGain += diff
    } else {
      totalLoss += Math.abs(diff)
    }
  }
  
  // Find significant climbs/descents in highway zones
  // (simplified - could be enhanced with windowed analysis)
  
  return {
    elevationGain: Math.round(totalGain),
    elevationLoss: Math.round(totalLoss),
    maxClimb,
    maxDescent
  }
}

function findInterestingStats(zones, callouts, routeData) {
  const stats = []
  
  // Sharpest curve on route (if in highway zone)
  const highwayCurves = (callouts || []).filter(c => c.zone === 'transit' && c.angle)
  if (highwayCurves.length > 0) {
    const sharpest = highwayCurves.reduce((max, c) => 
      (c.angle > (max?.angle || 0)) ? c : max, null)
    if (sharpest && sharpest.angle > 30) {
      stats.push({
        type: 'sharpest_highway_curve',
        value: sharpest.angle,
        mile: sharpest.triggerMile,
        direction: sharpest.direction
      })
    }
  }
  
  // Count sweepers
  const sweeperCount = (callouts || []).filter(c => 
    c.zone === 'transit' && c.type !== 'danger'
  ).length
  
  if (sweeperCount > 0) {
    stats.push({
      type: 'total_sweepers',
      value: sweeperCount
    })
  }
  
  return stats
}

// ================================
// TRIGGER POINT GENERATION (Rule-Based)
// ================================

function generateTriggerPoints(analysis, highwayZones, callouts) {
  const triggers = []
  
  highwayZones.forEach((zone, zoneIndex) => {
    const zoneStartMile = zone.startDistance / 1609.34
    const zoneEndMile = zone.endDistance / 1609.34
    const zoneLengthMiles = zoneEndMile - zoneStartMile
    
    // Skip very short highway sections (< 1 mile)
    if (zoneLengthMiles < 1) return
    
    // Find what zone comes after this highway
    const nextZone = analysis.highwayZones[zoneIndex + 1] || 
      (analysis.highwayZones.length > zoneIndex + 1 ? null : { character: 'technical' })
    
    // Count callouts in this highway zone
    const zoneCallouts = (callouts || []).filter(c => {
      const dist = c.triggerDistance || (c.triggerMile * 1609.34)
      return dist >= zone.startDistance && dist <= zone.endDistance
    })
    
    // 1. HIGHWAY_ENTER - at zone start
    triggers.push({
      type: CHATTER_TRIGGERS.HIGHWAY_ENTER,
      triggerDistance: zone.startDistance + 100, // 100m into highway
      triggerMile: zoneStartMile + 0.06,
      context: {
        zoneLengthMiles: zoneLengthMiles.toFixed(1),
        sweeperCount: zoneCallouts.length,
        nextZoneType: nextZone?.character || 'end',
        nextZoneCurveCount: getNextZoneCurveCount(zone.endDistance, callouts)
      }
    })
    
    // 2. LONG_STRAIGHT - if gap > 2 miles without callouts
    if (analysis.longestStraight && analysis.longestStraight.miles > 2) {
      const straight = analysis.longestStraight
      // Trigger at start of long straight
      if (straight.startDistance >= zone.startDistance && 
          straight.endDistance <= zone.endDistance) {
        triggers.push({
          type: CHATTER_TRIGGERS.LONG_STRAIGHT,
          triggerDistance: straight.startDistance + 200,
          triggerMile: straight.startMile + 0.12,
          context: {
            straightMiles: straight.miles.toFixed(1),
            whatComesNext: 'features'
          }
        })
      }
    }
    
    // 3. MILESTONE - halfway through long highways (> 4 miles)
    if (zoneLengthMiles > 4) {
      const halfwayDist = zone.startDistance + ((zone.endDistance - zone.startDistance) / 2)
      triggers.push({
        type: CHATTER_TRIGGERS.MILESTONE,
        triggerDistance: halfwayDist,
        triggerMile: halfwayDist / 1609.34,
        context: {
          milestone: 'halfway_highway',
          milesRemaining: (zoneLengthMiles / 2).toFixed(1),
          totalHighwayMiles: zoneLengthMiles.toFixed(1)
        }
      })
    }
    
    // 4. HIGHWAY_EXIT_PREVIEW - 1km before highway ends (if next zone is technical)
    if (nextZone?.character === 'technical' || zoneIndex === highwayZones.length - 1) {
      const exitPreviewDist = zone.endDistance - 1000 // 1km before end
      if (exitPreviewDist > zone.startDistance) {
        triggers.push({
          type: CHATTER_TRIGGERS.HIGHWAY_EXIT_PREVIEW,
          triggerDistance: exitPreviewDist,
          triggerMile: exitPreviewDist / 1609.34,
          context: {
            nextZoneType: nextZone?.character || 'technical',
            nextZoneCurveCount: getNextZoneCurveCount(zone.endDistance, callouts),
            distance: '1km'
          }
        })
      }
    }
    
    // 5. BOREDOM_BUSTER - for very long highways (> 6 miles) without much action
    if (zoneLengthMiles > 6 && zoneCallouts.length < 3) {
      // Add at 1/3 and 2/3 points
      const thirdPoint = zone.startDistance + ((zone.endDistance - zone.startDistance) / 3)
      triggers.push({
        type: CHATTER_TRIGGERS.BOREDOM_BUSTER,
        triggerDistance: thirdPoint,
        triggerMile: thirdPoint / 1609.34,
        context: {
          silenceMinutes: Math.round((zoneLengthMiles / 3) * 1.2), // Rough estimate
          routeFact: getRandomRouteFact(analysis)
        }
      })
    }
  })
  
  // Sort by distance
  triggers.sort((a, b) => a.triggerDistance - b.triggerDistance)
  
  // Remove triggers too close to callouts (within 500m)
  const filteredTriggers = triggers.filter(trigger => {
    const tooClose = (callouts || []).some(callout => {
      const calloutDist = callout.triggerDistance || (callout.triggerMile * 1609.34)
      return Math.abs(calloutDist - trigger.triggerDistance) < 500
    })
    return !tooClose
  })
  
  return filteredTriggers
}

function getNextZoneCurveCount(afterDistance, callouts) {
  // Count callouts in the 5 miles after this point
  const lookAhead = 5 * 1609.34 // 5 miles in meters
  return (callouts || []).filter(c => {
    const dist = c.triggerDistance || (c.triggerMile * 1609.34)
    return dist > afterDistance && dist < afterDistance + lookAhead
  }).length
}

function getRandomRouteFact(analysis) {
  const facts = []
  
  if (analysis.elevationGain > 200) {
    facts.push(`elevation_gain_${analysis.elevationGain}`)
  }
  if (analysis.totalCallouts > 20) {
    facts.push(`total_curves_${analysis.totalCallouts}`)
  }
  if (analysis.highwayPercent > 50) {
    facts.push(`highway_heavy_${analysis.highwayPercent}`)
  }
  
  return facts[Math.floor(Math.random() * facts.length)] || 'generic'
}

// ================================
// LLM CHATTER GENERATION
// ================================

async function generateLLMChatter(triggerPoints, analysis, apiKey) {
  const prompt = buildChatterPrompt(triggerPoints, analysis)
  
  console.log(`📝 Chatter prompt: ${prompt.length} chars`)
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: getChatterSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7, // Higher for variety
      max_tokens: 2000
    })
  })
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }
  
  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  
  if (!content) {
    throw new Error('Empty LLM response')
  }
  
  return parseChatterResponse(content, triggerPoints)
}

function getChatterSystemPrompt() {
  return `You are a professional rally co-driver AI providing highway commentary for a driving app.

PERSONALITY:
- 85% professional, data-focused co-pilot
- 15% dry wit and clever observations (never cheesy)
- Think: experienced navigator who's seen a thousand routes
- Natural, conversational tone - like a helpful human passenger

RULES:
1. Max 20 words per chatter line
2. MUST reference specific data provided (miles, curve counts, etc)
3. Designed for text-to-speech (sounds natural when spoken aloud)
4. No filler words (um, uh, like, you know)
5. Never generic - always route-specific
6. Generate 5 VARIANTS for each trigger (driver hears different one each time)

TONE EXAMPLES:
- Professional: "6 miles of highway ahead. 3 sweepers to call out, then technical section."
- Data-backed: "Longest straight on the route coming up. 4.2 miles."
- Witty (15%): "4 miles of nothing. The road designer took the day off here."
- Exit preview: "Technical section in 1K. 23 curves coming up - stay sharp."

OUTPUT FORMAT:
Return JSON array:
[
  {
    "id": 0,
    "variants": [
      "Variant 1 text here",
      "Variant 2 text here", 
      "Variant 3 text here",
      "Variant 4 text here",
      "Variant 5 - can be the witty one"
    ]
  },
  ...
]

Generate exactly 5 variants per trigger. Variant 5 can be more playful.`
}

function buildChatterPrompt(triggerPoints, analysis) {
  let prompt = `ROUTE DATA:\n`
  prompt += `- Total: ${analysis.totalMiles.toFixed(1)} miles\n`
  prompt += `- Highway: ${analysis.highwayMiles.toFixed(1)} miles (${analysis.highwayPercent}%)\n`
  prompt += `- Total callouts: ${analysis.totalCallouts}\n`
  prompt += `- Highway sweepers: ${analysis.calloutsByZone.transit}\n`
  
  if (analysis.longestStraight) {
    prompt += `- Longest straight: ${analysis.longestStraight.miles.toFixed(1)} miles\n`
  }
  if (analysis.elevationGain > 100) {
    prompt += `- Elevation gain: ${analysis.elevationGain} ft\n`
  }
  
  prompt += `\nGENERATE CHATTER FOR THESE ${triggerPoints.length} TRIGGERS:\n\n`
  
  triggerPoints.forEach((trigger, idx) => {
    prompt += `[${idx}] ${trigger.type} at mile ${trigger.triggerMile.toFixed(1)}\n`
    prompt += `    Context: ${JSON.stringify(trigger.context)}\n\n`
  })
  
  prompt += `\nGenerate 5 natural-sounding variants for each trigger. Reference the specific data.`
  
  return prompt
}

function parseChatterResponse(content, triggerPoints) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    } else {
      const arrayMatch = content.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }
    
    const parsed = JSON.parse(jsonStr)
    
    // Merge with trigger points
    return triggerPoints.map((trigger, idx) => {
      const llmData = parsed.find(p => p.id === idx) || parsed[idx]
      return {
        ...trigger,
        id: `chatter-${idx}`,
        variants: llmData?.variants || [generateFallbackText(trigger)],
        isChatter: true,
        priority: 3 // Lowest priority - can be skipped
      }
    })
  } catch (err) {
    console.warn('⚠️ Failed to parse LLM chatter:', err.message)
    // Return template-based fallback
    return generateTemplateChatter(triggerPoints, {})
  }
}

// ================================
// TEMPLATE FALLBACK (No API Key)
// ================================

function generateTemplateChatter(triggerPoints, analysis) {
  return triggerPoints.map((trigger, idx) => {
    const variants = getTemplateVariants(trigger, analysis)
    return {
      ...trigger,
      id: `chatter-${idx}`,
      variants,
      isChatter: true,
      priority: 3
    }
  })
}

function getTemplateVariants(trigger, analysis) {
  const ctx = trigger.context
  
  switch (trigger.type) {
    case CHATTER_TRIGGERS.HIGHWAY_ENTER:
      return [
        `Highway stretch. ${ctx.zoneLengthMiles} miles ahead.`,
        `Cruise mode for ${ctx.zoneLengthMiles} miles.`,
        `Easy ${ctx.zoneLengthMiles} miles coming up.`,
        `${ctx.zoneLengthMiles} miles of highway. ${ctx.sweeperCount} sweepers to call.`,
        `Settling into ${ctx.zoneLengthMiles} miles of highway. Enjoy the cruise.`
      ]
    
    case CHATTER_TRIGGERS.HIGHWAY_EXIT_PREVIEW:
      return [
        `Technical section in ${ctx.distance}. ${ctx.nextZoneCurveCount} curves ahead.`,
        `${ctx.distance} to go, then it gets interesting. ${ctx.nextZoneCurveCount} curves coming.`,
        `Heads up - ${ctx.nextZoneCurveCount} curves in ${ctx.distance}.`,
        `Highway ends soon. ${ctx.nextZoneCurveCount} curves after this.`,
        `Time to wake up. Technical section with ${ctx.nextZoneCurveCount} curves in ${ctx.distance}.`
      ]
    
    case CHATTER_TRIGGERS.LONG_STRAIGHT:
      return [
        `Long straight ahead. ${ctx.straightMiles} miles.`,
        `${ctx.straightMiles} miles of nothing but road.`,
        `Clear run for ${ctx.straightMiles} miles.`,
        `Straight shot. ${ctx.straightMiles} miles.`,
        `${ctx.straightMiles} miles without a turn. Someone was being lazy with the surveying.`
      ]
    
    case CHATTER_TRIGGERS.MILESTONE:
      return [
        `Halfway through the highway stretch.`,
        `${ctx.milesRemaining} miles of highway remaining.`,
        `Midpoint. ${ctx.milesRemaining} more miles of cruise.`,
        `Half done with this stretch.`,
        `${ctx.milesRemaining} miles to go. Doing great.`
      ]
    
    case CHATTER_TRIGGERS.BOREDOM_BUSTER:
      return [
        `Still cruising. Features coming up eventually.`,
        `Quiet stretch. Stay alert.`,
        `Long way without action. Hang in there.`,
        `Route gets more interesting ahead.`,
        `If you're wondering, yes, this road does eventually turn.`
      ]
    
    default:
      return [`Continuing on route.`]
  }
}

function generateFallbackText(trigger) {
  const ctx = trigger.context
  switch (trigger.type) {
    case CHATTER_TRIGGERS.HIGHWAY_ENTER:
      return `Highway for ${ctx.zoneLengthMiles} miles.`
    case CHATTER_TRIGGERS.HIGHWAY_EXIT_PREVIEW:
      return `Technical section ahead.`
    case CHATTER_TRIGGERS.LONG_STRAIGHT:
      return `Long straight ahead.`
    default:
      return `Continuing on route.`
  }
}

// ================================
// UTILITY EXPORTS
// ================================

/**
 * Pick a random variant for a chatter item
 */
export function pickChatterVariant(chatterItem) {
  if (!chatterItem?.variants?.length) return null
  return chatterItem.variants[Math.floor(Math.random() * chatterItem.variants.length)]
}

/**
 * Check if chatter can play (no callout conflict)
 * @param {Object} chatterItem - Chatter to potentially play
 * @param {Array} upcomingCallouts - Upcoming callouts with trigger distances
 * @param {number} currentDistance - Current position in meters
 * @param {number} bufferSeconds - Seconds of buffer to require (default 8)
 * @param {number} estimatedSpeed - Current speed in m/s for timing calc
 */
export function canPlayChatter(chatterItem, upcomingCallouts, currentDistance, bufferSeconds = 8, estimatedSpeed = 25) {
  if (!upcomingCallouts?.length) return true
  
  const bufferDistance = bufferSeconds * estimatedSpeed // ~200m at 25m/s (55mph)
  
  // Check if any callout is within buffer distance
  const nextCallout = upcomingCallouts[0]
  if (!nextCallout) return true
  
  const nextCalloutDist = nextCallout.triggerDistance || (nextCallout.triggerMile * 1609.34)
  const distanceToNext = nextCalloutDist - currentDistance
  
  // Don't play if callout coming soon
  if (distanceToNext < bufferDistance) {
    return false
  }
  
  // Estimate chatter duration (~3 seconds for typical line)
  const chatterDuration = 3
  const chatterTravelDistance = chatterDuration * estimatedSpeed
  
  // Check if chatter would overlap with callout
  if (distanceToNext < chatterTravelDistance + (bufferSeconds * estimatedSpeed * 0.5)) {
    return false
  }
  
  return true
}
