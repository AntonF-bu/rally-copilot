// ================================
// LLM Curve Validation Service
// Comprehensive curve analysis using GPT-4o-mini
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

/**
 * Get API key from environment
 */
export function getLLMApiKey() {
  return import.meta.env.VITE_OPENAI_API_KEY || null
}

export function hasLLMApiKey() {
  return !!getLLMApiKey()
}

/**
 * Main function: Validate and enhance curves using LLM
 */
export async function validateCurvesWithLLM(curves, zones, routeData, apiKey) {
  if (!apiKey || !curves?.length) {
    console.log('⚠️ Skipping LLM curve validation (no API key or no curves)')
    return curves
  }

  console.log(`🤖 Starting LLM curve validation for ${curves.length} curves...`)

  try {
    // Build the prompt
    const prompt = buildCurvePrompt(curves, zones, routeData)
    
    // Call OpenAI
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.warn('⚠️ Empty LLM response for curves')
      return curves
    }

    // Parse and apply enhancements
    const enhancements = parseCurveResponse(content)
    const enhancedCurves = applyCurveEnhancements(curves, enhancements, zones)

    console.log(`✅ LLM curve validation complete:`)
    console.log(`   - Severity adjustments: ${enhancements.severityAdjustments?.length || 0}`)
    console.log(`   - Chicanes detected: ${enhancements.chicanes?.length || 0}`)
    console.log(`   - Curves to remove: ${enhancements.removals?.length || 0}`)
    console.log(`   - Highway priority curves: ${enhancements.highwayPriority?.length || 0}`)

    return enhancedCurves

  } catch (err) {
    console.error('❌ LLM curve validation error:', err)
    return curves
  }
}

/**
 * System prompt for curve analysis
 */
function getSystemPrompt() {
  return `You are an expert rally co-driver and road analyst. Your job is to validate and enhance curve data for a driving navigation app that provides audio pace notes.

YOUR TASKS:
1. SEVERITY ADJUSTMENTS - Curves may be mis-rated. Consider:
   - A 15° curve at highway speed (65mph) is MORE dangerous than at 35mph
   - Severity 1-2 are gentle, 3-4 are moderate, 5-6 are sharp/hairpin
   - Highway curves should generally be severity 1-3 (sweepers)
   - Technical road curves can be 1-6 depending on angle

2. CHICANE DETECTION - Identify quick left-right or right-left sequences:
   - Two curves within 100m that alternate direction = chicane
   - Mark the entry curve as chicane start

3. FALSE POSITIVE REMOVAL - Some "curves" are noise:
   - Curves under 5° are usually GPS noise - recommend removal
   - Very short curves (<20m) in urban areas are often intersections, not real curves
   - Duplicate curves at same location

4. HIGHWAY PRIORITY - On highway zones, identify which curves are IMPORTANT:
   - Not every gentle sweep needs a callout
   - Prioritize curves 10°+ on highways
   - Mark curves that would surprise a driver

5. MISSING CURVE WARNINGS - Identify suspicious gaps:
   - Technical roads with 2+ km gaps between curves
   - Areas where road geometry suggests a curve should exist

SEVERITY GUIDE:
- 1: Barely noticeable, flat out
- 2: Gentle curve, slight lift
- 3: Moderate curve, brake lightly  
- 4: Significant curve, brake and gear down
- 5: Sharp curve, significant braking
- 6: Hairpin/very sharp, major braking

Respond ONLY with valid JSON. No explanation text outside JSON.`
}

/**
 * Build the curve analysis prompt
 */
function buildCurvePrompt(curves, zones, routeData) {
  // Summarize zones
  const zoneSummary = zones?.length > 0 
    ? zones.map(z => `${z.character}: ${((z.endDistance - z.startDistance)/1609.34).toFixed(1)}mi`).join(', ')
    : 'Unknown'

  // Get zone for each curve
  const getZoneForCurve = (curve) => {
    if (!zones?.length) return 'unknown'
    const zone = zones.find(z => 
      curve.distanceFromStart >= z.startDistance && 
      curve.distanceFromStart <= z.endDistance
    )
    return zone?.character || 'unknown'
  }

  // Build curve list (limit to prevent token overflow)
  const maxCurves = 100
  const curvesToAnalyze = curves.length > maxCurves 
    ? curves.filter((_, i) => i % Math.ceil(curves.length / maxCurves) === 0)
    : curves

  const curveList = curvesToAnalyze.map((curve, i) => {
    const prevCurve = curvesToAnalyze[i - 1]
    const nextCurve = curvesToAnalyze[i + 1]
    const distToPrev = prevCurve ? curve.distanceFromStart - prevCurve.distanceFromStart : null
    const distToNext = nextCurve ? nextCurve.distanceFromStart - curve.distanceFromStart : null
    
    return {
      id: curve.id,
      index: i,
      distanceKm: (curve.distanceFromStart / 1000).toFixed(2),
      direction: curve.direction,
      angle: Math.round(curve.angle || 0),
      severity: curve.severity,
      length: Math.round(curve.length || 0),
      zone: getZoneForCurve(curve),
      distToPrevM: distToPrev ? Math.round(distToPrev) : null,
      distToNextM: distToNext ? Math.round(distToNext) : null,
      prevDirection: prevCurve?.direction || null,
      nextDirection: nextCurve?.direction || null
    }
  })

  // Calculate stats
  const avgAngle = curves.reduce((sum, c) => sum + (c.angle || 0), 0) / curves.length
  const highwayCurves = curvesToAnalyze.filter(c => getZoneForCurve(c) === 'transit').length
  const technicalCurves = curvesToAnalyze.filter(c => getZoneForCurve(c) === 'technical').length

  return `ROUTE OVERVIEW:
- Total distance: ${((routeData?.distance || 0) / 1609.34).toFixed(1)} miles
- Total curves: ${curves.length}
- Average curve angle: ${avgAngle.toFixed(1)}°
- Zone breakdown: ${zoneSummary}
- Highway curves: ${highwayCurves}, Technical curves: ${technicalCurves}

CURVES TO ANALYZE (${curvesToAnalyze.length} of ${curves.length}):
${JSON.stringify(curveList, null, 2)}

Analyze these curves and return a JSON object with your recommendations:

{
  "severityAdjustments": [
    { "id": "curve-id", "currentSeverity": 2, "newSeverity": 4, "reason": "15° at highway speed" }
  ],
  "chicanes": [
    { "startId": "curve-id-1", "endId": "curve-id-2", "type": "left-right" }
  ],
  "removals": [
    { "id": "curve-id", "reason": "Only 3° angle, GPS noise" }
  ],
  "highwayPriority": [
    { "id": "curve-id", "reason": "Significant 18° sweep, worth calling out" }
  ],
  "warnings": [
    "Suspicious 3km gap between curves 12 and 13 on technical road"
  ]
}

Rules:
- Only include curves that need changes (don't list every curve)
- Be conservative with removals (only obvious false positives)
- Chicanes must be <150m apart with alternating directions
- Highway priority = curves worth announcing (usually 10°+)
- Severity adjustments should consider zone (highway vs technical)`
}

/**
 * Parse LLM response into structured enhancements
 */
function parseCurveResponse(content) {
  const defaults = {
    severityAdjustments: [],
    chicanes: [],
    removals: [],
    highwayPriority: [],
    warnings: []
  }

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    // Try to find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      jsonStr = objectMatch[0]
    }

    const parsed = JSON.parse(jsonStr)
    
    return {
      severityAdjustments: Array.isArray(parsed.severityAdjustments) ? parsed.severityAdjustments : [],
      chicanes: Array.isArray(parsed.chicanes) ? parsed.chicanes : [],
      removals: Array.isArray(parsed.removals) ? parsed.removals : [],
      highwayPriority: Array.isArray(parsed.highwayPriority) ? parsed.highwayPriority : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    }

  } catch (err) {
    console.warn('⚠️ Failed to parse LLM curve response:', err.message)
    return defaults
  }
}

/**
 * Apply LLM enhancements to curve data
 */
function applyCurveEnhancements(curves, enhancements, zones) {
  // Create lookup maps
  const severityMap = new Map()
  enhancements.severityAdjustments?.forEach(adj => {
    severityMap.set(adj.id, adj)
  })

  const removalSet = new Set()
  enhancements.removals?.forEach(rem => {
    removalSet.add(rem.id)
  })

  const chicaneMap = new Map()
  enhancements.chicanes?.forEach(ch => {
    chicaneMap.set(ch.startId, { ...ch, isChicaneStart: true })
    chicaneMap.set(ch.endId, { ...ch, isChicaneEnd: true })
  })

  const prioritySet = new Set()
  enhancements.highwayPriority?.forEach(p => {
    prioritySet.set(p.id)
  })

  // Apply enhancements
  const enhancedCurves = curves
    .filter(curve => !removalSet.has(curve.id)) // Remove false positives
    .map(curve => {
      const enhanced = { ...curve }

      // Apply severity adjustment
      const sevAdj = severityMap.get(curve.id)
      if (sevAdj) {
        enhanced.severity = sevAdj.newSeverity
        enhanced.severityAdjusted = true
        enhanced.severityReason = sevAdj.reason
        console.log(`  📊 Severity: ${curve.id} ${sevAdj.currentSeverity} → ${sevAdj.newSeverity}`)
      }

      // Apply chicane marking
      const chicane = chicaneMap.get(curve.id)
      if (chicane) {
        if (chicane.isChicaneStart) {
          enhanced.isChicaneStart = true
          enhanced.chicaneType = chicane.type
          enhanced.chicanePairId = chicane.endId
          console.log(`  🔀 Chicane start: ${curve.id} (${chicane.type})`)
        }
        if (chicane.isChicaneEnd) {
          enhanced.isChicaneEnd = true
          enhanced.chicanePairId = chicane.startId
        }
      }

      // Apply highway priority
      if (prioritySet.has(curve.id)) {
        enhanced.highwayPriority = true
        console.log(`  ⭐ Highway priority: ${curve.id}`)
      }

      // Mark as LLM-enhanced
      if (sevAdj || chicane || prioritySet.has(curve.id)) {
        enhanced.llmEnhanced = true
      }

      return enhanced
    })

  // Log removals
  if (enhancements.removals?.length > 0) {
    console.log(`  🗑️ Removed ${enhancements.removals.length} false positive curves`)
  }

  // Log warnings
  enhancements.warnings?.forEach(warning => {
    console.log(`  ⚠️ LLM Warning: ${warning}`)
  })

  return enhancedCurves
}

/**
 * Generate enhanced callout for chicane
 */
export function generateChicaneCallout(curve, nextCurve) {
  if (!curve.isChicaneStart || !nextCurve) return null

  const type = curve.chicaneType || `${curve.direction}-${nextCurve.direction}`
  const distance = Math.round((nextCurve.distanceFromStart - curve.distanceFromStart))

  // Examples: "Chicane left-right" or "Quick left-right"
  if (distance < 50) {
    return `Quick ${type}`
  } else {
    return `Chicane ${type}, ${distance} meters`
  }
}

/**
 * Check if curve should be announced based on zone and priority
 */
export function shouldAnnounceCurve(curve, zone) {
  // Always announce chicane starts
  if (curve.isChicaneStart) return true

  // In highway zones, only announce priority curves or severity 3+
  if (zone === 'transit') {
    return curve.highwayPriority || curve.severity >= 3
  }

  // In technical zones, announce everything
  if (zone === 'technical') {
    return curve.severity >= 1
  }

  // In urban zones, only severity 4+
  if (zone === 'urban') {
    return curve.severity >= 4
  }

  // Default: announce severity 2+
  return curve.severity >= 2
}

export default {
  validateCurvesWithLLM,
  generateChicaneCallout,
  shouldAnnounceCurve,
  getLLMApiKey,
  hasLLMApiKey
}
