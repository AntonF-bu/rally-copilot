// ================================
// Highway Chatter Service v2.0
// 
// PRE-GENERATES contextual commentary for highway stretches
// - Time-based intervals (~2 min spacing)
// - Speed-reactive variants (slow/cruise/spirited/fast/flying)
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
  HIGHWAY_ENTER: 'highway_enter',
  HIGHWAY_EXIT_PREVIEW: 'highway_exit_preview',
  MILESTONE: 'milestone',
  NOTABLE_FEATURE: 'notable_feature',
  INTERVAL: 'interval',  // Time-based gap filler
  LONG_STRAIGHT_START: 'long_straight_start',
  LONG_STRAIGHT_END: 'long_straight_end',
}

// Speed brackets for variant selection
export const SPEED_BRACKETS = {
  SLOW: 'slow',           // < 55 mph
  CRUISE: 'cruise',       // 55-70 mph  
  SPIRITED: 'spirited',   // 70-85 mph
  FAST: 'fast',           // 85-100 mph
  FLYING: 'flying',       // 100+ mph
}

// Target interval between chatter (in miles, ~2 min at highway speed)
const TARGET_INTERVAL_MILES = 2.5
const MIN_INTERVAL_MILES = 1.5

// ================================
// MAIN EXPORT: Generate Chatter Timeline
// ================================

export async function generateChatterTimeline({ zones, callouts, routeData, elevationData }, apiKey) {
  console.log('🎙️ Highway Chatter Service v2.0 starting...')
  const startTime = Date.now()
  
  // Extract highway zones only
  const highwayZones = zones?.filter(z => z.character === 'transit') || []
  
  if (highwayZones.length === 0) {
    console.log('ℹ️ No highway zones - skipping chatter generation')
    return { chatterTimeline: [], stats: { highwayCount: 0 } }
  }
  
  console.log(`📍 Found ${highwayZones.length} highway zone(s)`)
  
  // Analyze route for data points
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
    estimatedHighwayMinutes: routeAnalysis.estimatedHighwayMinutes,
    targetChatterCount: routeAnalysis.targetChatterCount
  })
  
  // Generate trigger points with time-based grid
  const triggerPoints = generateTriggerPointsV2(routeAnalysis, highwayZones, callouts)
  
  console.log(`🎯 Generated ${triggerPoints.length} trigger points`)
  
  if (triggerPoints.length === 0) {
    return { chatterTimeline: [], stats: routeAnalysis }
  }
  
  // If no API key, use template-based fallback
  if (!apiKey) {
    console.log('ℹ️ No API key - using template chatter')
    const templateChatter = generateTemplateChatterV2(triggerPoints, routeAnalysis)
    return { 
      chatterTimeline: templateChatter, 
      stats: routeAnalysis,
      method: 'template'
    }
  }
  
  // Call LLM to generate varied, contextual chatter with speed variants
  try {
    const llmChatter = await generateLLMChatterV2(triggerPoints, routeAnalysis, apiKey)
    
    const elapsed = Date.now() - startTime
    console.log(`🎙️ Chatter generation complete in ${elapsed}ms`)
    console.log(`   Generated ${llmChatter.length} chatter items with speed variants`)
    
    return {
      chatterTimeline: llmChatter,
      stats: routeAnalysis,
      method: 'llm'
    }
  } catch (err) {
    console.warn('⚠️ LLM chatter failed, using templates:', err.message)
    const templateChatter = generateTemplateChatterV2(triggerPoints, routeAnalysis)
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
  
  // Estimate time at ~70mph average
  const estimatedHighwayMinutes = Math.round(highwayMiles / 70 * 60)
  
  // Target 1 chatter every ~2 minutes
  const targetChatterCount = Math.max(3, Math.ceil(estimatedHighwayMinutes / 2))
  
  // Find gaps between callouts (potential long straights)
  const gaps = findCalloutGaps(highwayZones, callouts)
  
  // Find longest straight
  const longestStraight = gaps.length > 0 
    ? gaps.reduce((max, g) => g.lengthMiles > max.lengthMiles ? g : max, gaps[0])
    : null
  
  // Elevation analysis
  const { elevationGain, elevationLoss } = analyzeElevation(elevationData, highwayZones)
  
  // Find notable features
  const notableFeatures = findNotableFeatures(callouts, highwayZones)
  
  // Count highway callouts
  const highwayCallouts = (callouts || []).filter(c => c.zone === 'transit').length
  
  // Calculate curves in next zone (for exit preview)
  const technicalZones = zones?.filter(z => z.character === 'technical') || []
  const nextTechnicalCurves = countCurvesInZones(callouts, technicalZones)
  
  return {
    totalMiles,
    highwayMiles,
    highwayPercent: Math.round((highwayMiles / totalMiles) * 100),
    estimatedHighwayMinutes,
    targetChatterCount,
    gaps,
    longestStraight,
    elevationGain,
    elevationLoss,
    totalCallouts: callouts?.length || 0,
    highwayCallouts,
    highwayZones,
    notableFeatures,
    nextTechnicalCurves
  }
}

function findCalloutGaps(highwayZones, callouts) {
  const gaps = []
  
  highwayZones.forEach(zone => {
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
    
    let prevDist = zone.startDistance
    let prevMile = zone.startDistance / 1609.34
    
    zoneCallouts.forEach(callout => {
      const calloutDist = callout.triggerDistance || (callout.triggerMile * 1609.34)
      const calloutMile = calloutDist / 1609.34
      const gapMiles = calloutMile - prevMile
      
      if (gapMiles > 2) {
        gaps.push({
          startMile: prevMile,
          endMile: calloutMile,
          startDistance: prevDist,
          endDistance: calloutDist,
          lengthMiles: gapMiles
        })
      }
      
      prevDist = calloutDist
      prevMile = calloutMile
    })
    
    // Check gap from last callout to zone end
    const zoneEndMile = zone.endDistance / 1609.34
    const endGapMiles = zoneEndMile - prevMile
    
    if (endGapMiles > 2) {
      gaps.push({
        startMile: prevMile,
        endMile: zoneEndMile,
        startDistance: prevDist,
        endDistance: zone.endDistance,
        lengthMiles: endGapMiles
      })
    }
  })
  
  return gaps.sort((a, b) => b.lengthMiles - a.lengthMiles)
}

function analyzeElevation(elevationData, highwayZones) {
  if (!elevationData?.length) {
    return { elevationGain: 0, elevationLoss: 0 }
  }
  
  let totalGain = 0
  let totalLoss = 0
  
  for (let i = 1; i < elevationData.length; i++) {
    const diff = elevationData[i].elevation - elevationData[i-1].elevation
    if (diff > 0) totalGain += diff
    else totalLoss += Math.abs(diff)
  }
  
  return {
    elevationGain: Math.round(totalGain),
    elevationLoss: Math.round(totalLoss)
  }
}

function findNotableFeatures(callouts, highwayZones) {
  const features = []
  
  const highwayCallouts = (callouts || []).filter(c => {
    const dist = c.triggerDistance || (c.triggerMile * 1609.34)
    return highwayZones.some(z => dist >= z.startDistance && dist <= z.endDistance)
  })
  
  // Find sharpest highway curve
  const withAngles = highwayCallouts.filter(c => c.angle && c.angle > 20)
  if (withAngles.length > 0) {
    const sharpest = withAngles.reduce((max, c) => c.angle > max.angle ? c : max, withAngles[0])
    features.push({
      type: 'sharpest_curve',
      mile: sharpest.triggerMile,
      angle: sharpest.angle,
      direction: sharpest.direction
    })
  }
  
  // Find danger curves
  const dangerCurves = highwayCallouts.filter(c => c.type === 'danger')
  if (dangerCurves.length > 0) {
    features.push({
      type: 'danger_count',
      count: dangerCurves.length
    })
  }
  
  return features
}

function countCurvesInZones(callouts, zones) {
  return (callouts || []).filter(c => {
    const dist = c.triggerDistance || (c.triggerMile * 1609.34)
    return zones.some(z => dist >= z.startDistance && dist <= z.endDistance)
  }).length
}

// ================================
// TRIGGER POINT GENERATION V2 (Time-Based Grid)
// ================================

function generateTriggerPointsV2(analysis, highwayZones, callouts) {
  const triggers = []
  
  highwayZones.forEach((zone, zoneIndex) => {
    const zoneStartMile = zone.startDistance / 1609.34
    const zoneEndMile = zone.endDistance / 1609.34
    const zoneLengthMiles = zoneEndMile - zoneStartMile
    
    // Skip very short highway sections (< 1 mile)
    if (zoneLengthMiles < 1) return
    
    // Find what comes after this highway
    const allZones = analysis.highwayZones
    const isLastHighway = zoneIndex === allZones.length - 1
    
    // 1. HIGHWAY_ENTER - at zone start
    triggers.push({
      type: CHATTER_TRIGGERS.HIGHWAY_ENTER,
      triggerMile: zoneStartMile + 0.1,
      triggerDistance: zone.startDistance + 160,
      context: {
        zoneLengthMiles: zoneLengthMiles.toFixed(1),
        sweeperCount: analysis.highwayCallouts,
        estimatedMinutes: Math.round(zoneLengthMiles / 70 * 60),
        nextTechnicalCurves: analysis.nextTechnicalCurves
      }
    })
    
    // 2. Create time-based grid of interval triggers
    const intervalCount = Math.floor(zoneLengthMiles / TARGET_INTERVAL_MILES) - 1
    
    if (intervalCount > 0) {
      const actualInterval = zoneLengthMiles / (intervalCount + 1)
      
      for (let i = 1; i <= intervalCount; i++) {
        const intervalMile = zoneStartMile + (actualInterval * i)
        const milesIntoHighway = intervalMile - zoneStartMile
        const milesRemaining = zoneEndMile - intervalMile
        const percentComplete = Math.round((milesIntoHighway / zoneLengthMiles) * 100)
        
        // Determine interval context type
        let intervalType = 'general'
        
        // Check if we're in a long straight
        const inGap = analysis.gaps.find(g => 
          intervalMile >= g.startMile && intervalMile <= g.endMile
        )
        if (inGap && inGap.lengthMiles > 4) {
          intervalType = 'long_straight'
        }
        
        // Check if near a milestone (10, 20, 30, 40 miles)
        const nearMilestone = [10, 20, 30, 40, 50].find(m => 
          Math.abs(milesIntoHighway - m) < 1
        )
        if (nearMilestone) {
          intervalType = 'milestone'
        }
        
        triggers.push({
          type: CHATTER_TRIGGERS.INTERVAL,
          triggerMile: intervalMile,
          triggerDistance: intervalMile * 1609.34,
          context: {
            intervalType,
            milesIntoHighway: milesIntoHighway.toFixed(1),
            milesRemaining: milesRemaining.toFixed(1),
            percentComplete,
            totalHighwayMiles: zoneLengthMiles.toFixed(1),
            inLongStraight: inGap ? inGap.lengthMiles.toFixed(1) : null,
            nearMilestone
          }
        })
      }
    }
    
    // 3. Notable features (sharpest curve warning)
    analysis.notableFeatures.forEach(feature => {
      if (feature.type === 'sharpest_curve' && feature.mile > zoneStartMile && feature.mile < zoneEndMile) {
        // Add warning 0.5 miles before
        const warningMile = feature.mile - 0.5
        if (warningMile > zoneStartMile) {
          triggers.push({
            type: CHATTER_TRIGGERS.NOTABLE_FEATURE,
            triggerMile: warningMile,
            triggerDistance: warningMile * 1609.34,
            context: {
              featureType: 'sharpest_curve',
              angle: feature.angle,
              direction: feature.direction,
              distance: '0.5 miles'
            }
          })
        }
      }
    })
    
    // 4. Long straight callouts
    analysis.gaps.filter(g => g.lengthMiles > 5).forEach(gap => {
      // Start of long straight
      if (gap.startMile > zoneStartMile + 1) {
        triggers.push({
          type: CHATTER_TRIGGERS.LONG_STRAIGHT_START,
          triggerMile: gap.startMile + 0.2,
          triggerDistance: (gap.startMile + 0.2) * 1609.34,
          context: {
            straightMiles: gap.lengthMiles.toFixed(1)
          }
        })
      }
      
      // End of long straight (1 mile before)
      if (gap.endMile < zoneEndMile - 1) {
        triggers.push({
          type: CHATTER_TRIGGERS.LONG_STRAIGHT_END,
          triggerMile: gap.endMile - 1,
          triggerDistance: (gap.endMile - 1) * 1609.34,
          context: {
            straightMiles: gap.lengthMiles.toFixed(1)
          }
        })
      }
    })
    
    // 5. HIGHWAY_EXIT_PREVIEW - 1 mile before highway ends
    if (zoneLengthMiles > 2) {
      triggers.push({
        type: CHATTER_TRIGGERS.HIGHWAY_EXIT_PREVIEW,
        triggerMile: zoneEndMile - 1,
        triggerDistance: zone.endDistance - 1609.34,
        context: {
          nextTechnicalCurves: analysis.nextTechnicalCurves,
          distance: '1 mile'
        }
      })
    }
  })
  
  // Sort by distance and remove duplicates/too-close triggers
  triggers.sort((a, b) => a.triggerDistance - b.triggerDistance)
  
  // Filter triggers that are too close together
  const filtered = []
  let lastMile = -999
  
  triggers.forEach(trigger => {
    if (trigger.triggerMile - lastMile >= MIN_INTERVAL_MILES) {
      filtered.push(trigger)
      lastMile = trigger.triggerMile
    }
  })
  
  return filtered
}

// ================================
// LLM CHATTER GENERATION V2 (With Speed Variants)
// ================================

async function generateLLMChatterV2(triggerPoints, analysis, apiKey) {
  const prompt = buildChatterPromptV2(triggerPoints, analysis)
  
  console.log(`📝 Chatter prompt: ${prompt.length} chars for ${triggerPoints.length} triggers`)
  
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: getChatterSystemPromptV2() },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 4000
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
  
  return parseChatterResponseV2(content, triggerPoints)
}

function getChatterSystemPromptV2() {
  return `You are a rally co-driver AI providing highway commentary. Professional but with personality.

PERSONALITY:
- 85% data-focused professional co-pilot
- 15% dry wit (never cheesy, think British racing humor)
- Knows the route inside-out, references specific data
- Speed-aware: comments change based on how fast they're going

SPEED BRACKETS (generate different variant for each):
- slow (<55 mph): Encouraging, "traffic will clear", patient
- cruise (55-70): Normal informative co-pilot
- spirited (70-85): Appreciative of pace, time savings
- fast (85-100): Playful warnings about speed traps, impressed but cautious
- flying (100+): Mix of impressed and genuine caution, humor about arrival times

RULES:
1. Max 25 words per line
2. MUST reference specific data (miles, times, curve counts)
3. Natural speech for TTS (sounds good when spoken aloud)
4. Each speed bracket should feel genuinely different, not just swapping adjectives
5. The "fast" and "flying" variants can mention blue lights, speed traps, arrival times
6. Include ETA/time references where relevant ("at this pace", "saving X minutes")

OUTPUT FORMAT - JSON array:
[
  {
    "id": 0,
    "variants": {
      "slow": ["variant 1", "variant 2", "variant 3"],
      "cruise": ["variant 1", "variant 2", "variant 3"],
      "spirited": ["variant 1", "variant 2", "variant 3"],
      "fast": ["variant 1", "variant 2", "variant 3"],
      "flying": ["variant 1", "variant 2", "variant 3"]
    }
  }
]

Generate 3 variants per speed bracket (15 total per trigger).`
}

function buildChatterPromptV2(triggerPoints, analysis) {
  let prompt = `ROUTE DATA:\n`
  prompt += `- Total route: ${analysis.totalMiles.toFixed(1)} miles\n`
  prompt += `- Highway section: ${analysis.highwayMiles.toFixed(1)} miles (~${analysis.estimatedHighwayMinutes} min at 70mph)\n`
  prompt += `- Highway sweepers/curves: ${analysis.highwayCallouts}\n`
  prompt += `- Technical section after: ${analysis.nextTechnicalCurves} curves\n`
  
  if (analysis.longestStraight) {
    prompt += `- Longest straight: ${analysis.longestStraight.lengthMiles.toFixed(1)} miles\n`
  }
  if (analysis.elevationGain > 100) {
    prompt += `- Elevation gain: ${analysis.elevationGain} ft\n`
  }
  
  const sharpest = analysis.notableFeatures.find(f => f.type === 'sharpest_curve')
  if (sharpest) {
    prompt += `- Sharpest highway curve: ${sharpest.angle}° ${sharpest.direction} at mile ${sharpest.mile.toFixed(1)}\n`
  }
  
  prompt += `\nGENERATE CHATTER FOR THESE ${triggerPoints.length} TRIGGERS:\n\n`
  
  triggerPoints.forEach((trigger, idx) => {
    prompt += `[${idx}] ${trigger.type} @ mile ${trigger.triggerMile.toFixed(1)}\n`
    prompt += `    Context: ${JSON.stringify(trigger.context)}\n\n`
  })
  
  prompt += `\nGenerate speed-aware variants. Reference specific numbers. Be genuine at each speed level.`
  
  return prompt
}

function parseChatterResponseV2(content, triggerPoints) {
  try {
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
    
    return triggerPoints.map((trigger, idx) => {
      const llmData = parsed.find(p => p.id === idx) || parsed[idx]
      
      // Ensure we have variants for all speed brackets
      const variants = llmData?.variants || {}
      const defaultVariants = getTemplateVariantsV2(trigger, {})
      
      return {
        ...trigger,
        id: `chatter-${idx}`,
        variants: {
          slow: variants.slow || defaultVariants.slow,
          cruise: variants.cruise || defaultVariants.cruise,
          spirited: variants.spirited || defaultVariants.spirited,
          fast: variants.fast || defaultVariants.fast,
          flying: variants.flying || defaultVariants.flying
        },
        isChatter: true,
        priority: 3
      }
    })
  } catch (err) {
    console.warn('⚠️ Failed to parse LLM chatter:', err.message)
    return generateTemplateChatterV2(triggerPoints, {})
  }
}

// ================================
// TEMPLATE FALLBACK V2 (With Speed Variants)
// ================================

function generateTemplateChatterV2(triggerPoints, analysis) {
  return triggerPoints.map((trigger, idx) => {
    const variants = getTemplateVariantsV2(trigger, analysis)
    return {
      ...trigger,
      id: `chatter-${idx}`,
      variants,
      isChatter: true,
      priority: 3
    }
  })
}

function getTemplateVariantsV2(trigger, analysis) {
  const ctx = trigger.context || {}
  
  switch (trigger.type) {
    case CHATTER_TRIGGERS.HIGHWAY_ENTER:
      return {
        slow: [
          `${ctx.zoneLengthMiles} miles of highway ahead. Should be smooth from here.`,
          `Entering highway. ${ctx.zoneLengthMiles} miles to cruise through.`,
          `Highway stretch starting. Settle in for ${ctx.estimatedMinutes || 'a few'} minutes.`
        ],
        cruise: [
          `${ctx.zoneLengthMiles} miles of highway. ${ctx.sweeperCount} sweepers to keep it interesting.`,
          `Highway mode. ${ctx.zoneLengthMiles} miles, then ${ctx.nextTechnicalCurves} curves in the technical section.`,
          `Cruising into ${ctx.zoneLengthMiles} miles of highway. I'll call out the sweepers.`
        ],
        spirited: [
          `${ctx.zoneLengthMiles} miles of highway - good chance to make up some time.`,
          `Highway stretch. ${ctx.zoneLengthMiles} miles at this pace, you'll be early.`,
          `Nice pace into the highway. ${ctx.sweeperCount} sweepers ahead, nothing dramatic.`
        ],
        fast: [
          `${ctx.zoneLengthMiles} miles of highway. At this speed, watch for speed traps around mile markers.`,
          `Highway time. ${ctx.zoneLengthMiles} miles - plenty of time for a blue light to notice you.`,
          `Moving well. ${ctx.zoneLengthMiles} miles of highway, maybe ease off near the overpasses.`
        ],
        flying: [
          `Alright speed demon, ${ctx.zoneLengthMiles} miles of highway. At this rate you'll arrive yesterday.`,
          `${ctx.zoneLengthMiles} miles at this pace? That's about ${Math.round((parseFloat(ctx.zoneLengthMiles) || 10) / 110 * 60)} minutes if you don't get pulled over.`,
          `Highway stretch. At triple digits, the scenery becomes a blur anyway.`
        ]
      }
    
    case CHATTER_TRIGGERS.HIGHWAY_EXIT_PREVIEW:
      return {
        slow: [
          `Technical section in ${ctx.distance}. ${ctx.nextTechnicalCurves} curves coming up.`,
          `Highway ends soon. Get ready for ${ctx.nextTechnicalCurves} curves.`,
          `${ctx.distance} to go, then it gets twisty. ${ctx.nextTechnicalCurves} curves ahead.`
        ],
        cruise: [
          `Heads up - technical section in ${ctx.distance}. ${ctx.nextTechnicalCurves} curves waiting.`,
          `Highway ends in ${ctx.distance}. Time to wake up - ${ctx.nextTechnicalCurves} curves coming.`,
          `${ctx.distance} of highway left. Then ${ctx.nextTechnicalCurves} curves to play with.`
        ],
        spirited: [
          `${ctx.distance} to fun time. ${ctx.nextTechnicalCurves} curves in the technical section.`,
          `Almost to the good stuff. ${ctx.nextTechnicalCurves} curves in ${ctx.distance}.`,
          `Technical section in ${ctx.distance}. ${ctx.nextTechnicalCurves} curves - this is what we came for.`
        ],
        fast: [
          `Might want to dial it back - technical section with ${ctx.nextTechnicalCurves} curves in ${ctx.distance}.`,
          `${ctx.nextTechnicalCurves} curves coming in ${ctx.distance}. Good time to shed some speed.`,
          `Technical in ${ctx.distance}. ${ctx.nextTechnicalCurves} curves don't care how fast you got here.`
        ],
        flying: [
          `Brakes exist for a reason. ${ctx.nextTechnicalCurves} curves in ${ctx.distance}.`,
          `${ctx.distance} to reality check. ${ctx.nextTechnicalCurves} curves that require... less velocity.`,
          `Technical section ahead. ${ctx.nextTechnicalCurves} curves that won't appreciate your current enthusiasm.`
        ]
      }
    
    case CHATTER_TRIGGERS.INTERVAL:
      const pct = ctx.percentComplete || 50
      const remaining = ctx.milesRemaining || '?'
      const intoHighway = ctx.milesIntoHighway || '?'
      
      return {
        slow: [
          `${remaining} miles to go. Traffic should be clearing up.`,
          `${pct}% through the highway stretch. Hang in there.`,
          `${intoHighway} miles done. ${remaining} to go.`
        ],
        cruise: [
          `${remaining} miles of highway remaining. Good rhythm.`,
          `${pct}% through. ${remaining} miles to the technical section.`,
          `Cruising nicely. ${remaining} miles to go.`
        ],
        spirited: [
          `${remaining} miles left. Making good time at this pace.`,
          `${pct}% done, running ahead of schedule.`,
          `${intoHighway} miles down. You're about 3 minutes ahead of pace.`
        ],
        fast: [
          `${remaining} miles at this speed? About ${Math.round(parseFloat(remaining) / 85 * 60)} minutes. If you're lucky.`,
          `${pct}% through. Still no blue lights - impressive.`,
          `${remaining} to go. At this pace you're saving serious time. And tempting fate.`
        ],
        flying: [
          `${remaining} miles left. At this speed, that's about ${Math.round(parseFloat(remaining) / 110 * 60)} minutes. Theoretically.`,
          `${pct}% through and no helicopter yet. Living dangerously.`,
          `${remaining} miles. You'll either arrive very early or very late. No in between.`
        ]
      }
    
    case CHATTER_TRIGGERS.LONG_STRAIGHT_START:
      const straightMiles = ctx.straightMiles || '?'
      return {
        slow: [
          `Long straight ahead. ${straightMiles} miles to relax.`,
          `${straightMiles} miles without a turn. Easy stretch.`,
          `Straight shot for ${straightMiles} miles.`
        ],
        cruise: [
          `${straightMiles} miles of straight road. Longest stretch on the route.`,
          `Long straight - ${straightMiles} miles. Enjoy the cruise.`,
          `${straightMiles} miles without a turn coming up.`
        ],
        spirited: [
          `${straightMiles} miles of open road. Make the most of it.`,
          `Long straight ahead. ${straightMiles} miles to stretch the legs.`,
          `${straightMiles} miles of nothing but tarmac. Have fun.`
        ],
        fast: [
          `${straightMiles} miles of straight. Prime speed trap territory.`,
          `Long straight - ${straightMiles} miles. Cop favorite zone.`,
          `${straightMiles} miles of temptation. They know people speed here.`
        ],
        flying: [
          `${straightMiles} miles straight. At this speed, that's about ${Math.round(parseFloat(straightMiles) / 120 * 60)} minutes of clenching.`,
          `Long straight. ${straightMiles} miles of praying your tires are balanced.`,
          `${straightMiles} miles. Every overhead bridge is a potential speed trap. Just saying.`
        ]
      }
    
    case CHATTER_TRIGGERS.LONG_STRAIGHT_END:
      return {
        slow: [
          `Curves returning soon. Stay alert.`,
          `End of the straight stretch ahead.`,
          `Features coming back. Wake up time.`
        ],
        cruise: [
          `Long straight ending. Curves returning.`,
          `Back to normal shortly. Sweepers ahead.`,
          `Straight section ending. Time to engage again.`
        ],
        spirited: [
          `Good stretch. Curves coming back now.`,
          `End of the straight. Back to the fun stuff.`,
          `Straight's done. Sweepers returning.`
        ],
        fast: [
          `Curves ahead. Might want to bring it down a notch.`,
          `Straight ending. Real road returning.`,
          `Time to use those brakes. Curves coming.`
        ],
        flying: [
          `Curves approaching. Physics is about to matter again.`,
          `Straight's over. Time to remember how steering works.`,
          `Reality check incoming. Curves ahead.`
        ]
      }
    
    case CHATTER_TRIGGERS.NOTABLE_FEATURE:
      const angle = ctx.angle || '?'
      const dir = ctx.direction || 'curve'
      return {
        slow: [
          `Sharpest highway curve in ${ctx.distance}. ${angle}° ${dir}.`,
          `${angle}° ${dir} coming up. Sharpest on this stretch.`,
          `Notable curve ahead - ${angle}° ${dir}.`
        ],
        cruise: [
          `Heads up - ${angle}° ${dir} in ${ctx.distance}. Sharpest on the highway.`,
          `Sharpest highway curve coming. ${angle}° ${dir}.`,
          `${angle}° ${dir} ahead. Worth paying attention to this one.`
        ],
        spirited: [
          `${angle}° ${dir} in ${ctx.distance}. Sharpest highway curve - enjoy it.`,
          `Good one coming - ${angle}° ${dir}. Best curve on this stretch.`,
          `Sharpest on the route: ${angle}° ${dir}. ${ctx.distance} away.`
        ],
        fast: [
          `${angle}° ${dir} ahead. You'll want to shed speed for this one.`,
          `Sharpest curve coming - ${angle}° ${dir}. Seriously, brake.`,
          `${ctx.distance} to a ${angle}° ${dir}. Current speed: not recommended.`
        ],
        flying: [
          `${angle}° ${dir} incoming. At this speed, that's gonna be exciting.`,
          `Sharpest curve ahead. ${angle}°. Your call if you want to test physics.`,
          `${angle}° ${dir} in ${ctx.distance}. Triple digit entry: not advised.`
        ]
      }
    
    case CHATTER_TRIGGERS.MILESTONE:
      const milestone = ctx.nearMilestone || 10
      return {
        slow: [
          `${milestone} miles into the highway. Steady progress.`,
          `${milestone} mile mark. You're doing fine.`,
          `${milestone} miles done.`
        ],
        cruise: [
          `${milestone} miles in. Good rhythm.`,
          `${milestone} mile mark. Cruising nicely.`,
          `${milestone} miles of highway down.`
        ],
        spirited: [
          `${milestone} miles done. Nice pace.`,
          `${milestone} mile mark. Running a few minutes hot.`,
          `${milestone} in. You're ahead of schedule.`
        ],
        fast: [
          `${milestone} miles already? Time flies at this speed.`,
          `${milestone} mile mark. Still no blue lights - lucky.`,
          `${milestone} down. You're eating this highway alive.`
        ],
        flying: [
          `${milestone} miles in what, 5 minutes? Impressive. And illegal.`,
          `${milestone} mile mark. Your guardian angel is working overtime.`,
          `${milestone} down. At this rate you'll need to wait for the restaurant to open.`
        ]
      }
    
    default:
      return {
        slow: [`Continuing on route.`],
        cruise: [`Continuing on route.`],
        spirited: [`Good pace.`],
        fast: [`Moving well. Stay sharp.`],
        flying: [`Easy there, speed racer.`]
      }
  }
}

// ================================
// UTILITY EXPORTS
// ================================

/**
 * Get speed bracket from current speed (mph)
 */
export function getSpeedBracket(speedMph) {
  if (speedMph < 55) return SPEED_BRACKETS.SLOW
  if (speedMph < 70) return SPEED_BRACKETS.CRUISE
  if (speedMph < 85) return SPEED_BRACKETS.SPIRITED
  if (speedMph < 100) return SPEED_BRACKETS.FAST
  return SPEED_BRACKETS.FLYING
}

/**
 * Pick a random variant for a chatter item based on speed
 */
export function pickChatterVariant(chatterItem, speedMph = 65) {
  if (!chatterItem?.variants) return null
  
  const bracket = getSpeedBracket(speedMph)
  const variants = chatterItem.variants[bracket]
  
  if (!variants || variants.length === 0) {
    // Fallback to cruise
    const fallback = chatterItem.variants.cruise || chatterItem.variants.slow
    if (fallback && fallback.length > 0) {
      return fallback[Math.floor(Math.random() * fallback.length)]
    }
    return null
  }
  
  return variants[Math.floor(Math.random() * variants.length)]
}

/**
 * Check if chatter can play (no callout conflict)
 */
export function canPlayChatter(chatterItem, upcomingCallouts, currentDistance, bufferSeconds = 8, estimatedSpeed = 25) {
  if (!upcomingCallouts?.length) return true
  
  const bufferDistance = bufferSeconds * estimatedSpeed
  
  const nextCallout = upcomingCallouts[0]
  if (!nextCallout) return true
  
  const nextCalloutDist = nextCallout.triggerDistance || (nextCallout.triggerMile * 1609.34)
  const distanceToNext = nextCalloutDist - currentDistance
  
  if (distanceToNext < bufferDistance) {
    return false
  }
  
  const chatterDuration = 4
  const chatterTravelDistance = chatterDuration * estimatedSpeed
  
  if (distanceToNext < chatterTravelDistance + (bufferSeconds * estimatedSpeed * 0.5)) {
    return false
  }
  
  return true
}
