// ================================
// LLM Curve & Bend Enhancement Service v1.0
// Verifies curves, enhances highway bends, generates callout variants
// 
// SEPARATE from llmZoneService.js - zones are not touched here
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

// ================================
// API KEY HELPERS (shared pattern with llmZoneService)
// ================================

export function getLLMApiKey() {
  return import.meta.env.VITE_OPENAI_API_KEY || null
}

export function hasLLMApiKey() {
  return !!getLLMApiKey()
}

// ================================
// MAIN EXPORT: Enhance curves and highway bends
// ================================

/**
 * Main function: Verify curves and enhance highway bends with LLM
 * 
 * @param {Object} params
 * @param {Array} params.curves - From detectCurves()
 * @param {Array} params.highwayBends - From analyzeHighwayBends()
 * @param {Array} params.zones - From zoneService (READ-ONLY, for context)
 * @param {Object} params.routeData - Route metadata
 * @param {string} apiKey - OpenAI API key
 * 
 * @returns {Object} { curves, highwayBends, calloutVariants, changes }
 */
export async function enhanceCurvesWithLLM({ curves, highwayBends, zones, routeData }, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ No OpenAI API key - skipping LLM curve enhancement')
    return { 
      curves, 
      highwayBends, 
      calloutVariants: {},
      changes: [] 
    }
  }

  // Nothing to enhance
  if (!curves?.length && !highwayBends?.length) {
    return { curves: [], highwayBends: [], calloutVariants: {}, changes: [] }
  }

  console.log('🤖 LLM Curve Enhancement v1.0 - Starting...')
  console.log(`   Input: ${curves?.length || 0} curves, ${highwayBends?.length || 0} highway bends`)
  const startTime = Date.now()

  try {
    // Build the prompt
    const prompt = buildCurvePrompt({ curves, highwayBends, zones, routeData })
    console.log(`📝 Prompt size: ${prompt.length} chars`)

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
          { role: 'system', content: getCurveSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,  // Slightly higher than zones for variety in callouts
        max_tokens: 4000
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ OpenAI API error:', error)
      return { curves, highwayBends, calloutVariants: {}, changes: [] }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.warn('⚠️ Empty LLM response')
      return { curves, highwayBends, calloutVariants: {}, changes: [] }
    }

    console.log('📥 LLM Response:', content.slice(0, 800))

    // Parse response
    const llmResult = parseResponse(content)

    // Apply enhancements
    const enhanced = applyEnhancements({
      originalCurves: curves,
      originalBends: highwayBends,
      llmResult
    })

    const elapsed = Date.now() - startTime
    console.log(`✅ LLM Curve Enhancement complete in ${elapsed}ms`)
    console.log(`   Changes: ${enhanced.changes.length}`)
    enhanced.changes.forEach(c => console.log(`   - ${c}`))

    return enhanced

  } catch (err) {
    console.error('❌ LLM curve enhancement error:', err)
    return { curves, highwayBends, calloutVariants: {}, changes: [] }
  }
}

// ================================
// SYSTEM PROMPT
// ================================

function getCurveSystemPrompt() {
  return `You are a rally co-driver creating SHORT, UNIQUE callouts for road sections.

CRITICAL: Each section MUST have a DIFFERENT callout. Never repeat the same phrase!

PATTERN TO CALLOUT MAPPING:
- "X consecutive lefts" → "Left sweep" / "Sweeping left" / "Long left"
- "X consecutive rights" → "Right sweep" / "Sweeping right" / "Long right"
- "alternating L/R" → "S-curves" / "Chicanes" / "Weaving"
- "XL YR mixed" (more L) → "Left-heavy" / "Mostly left"
- "XL YR mixed" (more R) → "Right-heavy" / "Mostly right"

VARIETY IS REQUIRED - use different words for similar patterns:
- Section 1 (4 rights): "Right sweep"
- Section 2 (3 rights): "Sweeping right"
- Section 3 (5 rights): "Long right curve"
- Section 4 (4 rights): "Extended right"

MAX 20 CHARACTERS. Short and punchy.

RESPOND JSON:
{
  "curveChanges": [],
  "bendEnhancements": [
    {"id": "hwy-section-1", "callout": "Left sweep"},
    {"id": "hwy-section-2", "callout": "S-curves"},
    {"id": "hwy-section-3", "callout": "Right sequence"}
  ],
  "calloutVariants": {}
}`
}

// ================================
// PROMPT BUILDER
// ================================

function buildCurvePrompt({ curves, highwayBends, zones, routeData }) {
  const totalMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)

  // Build curve list (abbreviated)
  const curveList = curves?.slice(0, 30).map((c, i) => {
    const distMi = ((c.distanceFromStart || 0) / 1609.34).toFixed(2)
    const zone = findZoneAtDistance(zones, c.distanceFromStart)
    const len = c.length || '?'
    return `  ${c.id || `c${i}`}: ${c.direction} sev${c.severity} @${distMi}mi len=${len}m zone=${zone}`
  }).join('\n') || '  No curves'

  // Build highway bend list - FOCUS ON SECTIONS
  const bendList = highwayBends?.map((b) => {
    const distMi = ((b.distanceFromStart || 0) / 1609.34).toFixed(2)
    
    if (b.isSection) {
      // Analyze the pattern
      const leftCount = b.bends?.filter(x => x.direction === 'LEFT' && !x.isSSweep).length || 0
      const rightCount = b.bends?.filter(x => x.direction === 'RIGHT' && !x.isSSweep).length || 0
      const sSweepCount = b.bends?.filter(x => x.isSSweep).length || 0
      
      // Determine pattern type
      let pattern = ''
      if (leftCount > 0 && rightCount === 0) pattern = `${leftCount} consecutive lefts`
      else if (rightCount > 0 && leftCount === 0) pattern = `${rightCount} consecutive rights`
      else if (sSweepCount > 0) pattern = `${sSweepCount} S-sweeps`
      else if (Math.abs(leftCount - rightCount) <= 1) pattern = 'alternating L/R'
      else pattern = `${leftCount}L ${rightCount}R mixed`
      
      return `  ${b.id}: [SECTION] ${b.bendCount} bends | ${pattern} | @${distMi}mi`
    } else if (b.isSSweep) {
      return `  ${b.id}: S-SWEEP @${distMi}mi`
    } else {
      return `  ${b.id}: ${b.direction} sweep @${distMi}mi`
    }
  }).join('\n') || '  No highway bends'

  const sectionCount = highwayBends?.filter(b => b.isSection).length || 0

  return `ROUTE: ${totalMiles} miles

CURVES (${curves?.length || 0}, showing first 30):
${curveList}

HIGHWAY BENDS (${sectionCount} sections to enhance):
${bendList}

RULES:
- "X consecutive lefts" → "Sweeping left" or "Long left curve"
- "X consecutive rights" → "Sweeping right" or "Extended right"
- "alternating L/R" → "S-curves" or "Weaving section"
- "mixed" → "Technical section" or describe dominant direction

MAX 35 chars per callout. Describe the FEEL, not the count.`
}

/**
 * Find which zone a distance falls into
 */
function findZoneAtDistance(zones, distance) {
  if (!zones?.length || distance == null) return 'unknown'
  const zone = zones.find(z => distance >= z.startDistance && distance <= z.endDistance)
  return zone?.character || 'unknown'
}

// ================================
// RESPONSE PARSER
// ================================

function parseResponse(content) {
  try {
    let jsonStr = content

    // Handle markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    // Find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      jsonStr = objectMatch[0]
    }

    const parsed = JSON.parse(jsonStr)
    
    console.log(`📋 Parsed LLM response:`)
    console.log(`   - Curve changes: ${parsed.curveChanges?.length || 0}`)
    console.log(`   - Bend enhancements: ${parsed.bendEnhancements?.length || 0}`)
    console.log(`   - Callout variants: ${Object.keys(parsed.calloutVariants || {}).length} curves`)

    return {
      curveChanges: parsed.curveChanges || [],
      bendEnhancements: parsed.bendEnhancements || [],
      calloutVariants: parsed.calloutVariants || {}
    }

  } catch (err) {
    console.error('Failed to parse LLM curve response:', err)
    console.error('Raw content:', content?.slice(0, 500))
    return { curveChanges: [], bendEnhancements: [], calloutVariants: {} }
  }
}

// ================================
// APPLY ENHANCEMENTS
// ================================

function applyEnhancements({ originalCurves, originalBends, llmResult }) {
  const changes = []
  const { curveChanges, bendEnhancements, calloutVariants } = llmResult

  // --- Process curve changes ---
  const curveChangeMap = new Map()
  curveChanges.forEach(change => {
    if (change.id) curveChangeMap.set(change.id, change)
  })

  const enhancedCurves = originalCurves?.filter((curve, i) => {
    const curveId = curve.id || `c${i}`
    const change = curveChangeMap.get(curveId)

    if (!change) return true // Keep unchanged

    if (change.action === 'remove') {
      changes.push(`🗑️ Removed curve ${curveId}: ${change.reason || 'false positive'}`)
      return false // Filter out
    }

    return true // Keep (adjustments applied below)
  }).map((curve, i) => {
    const curveId = curve.id || `c${i}`
    const change = curveChangeMap.get(curveId)

    if (change?.action === 'adjust' && change.newSeverity) {
      changes.push(`📝 Curve ${curveId}: severity ${curve.severity} → ${change.newSeverity} (${change.reason})`)
      return {
        ...curve,
        severity: change.newSeverity,
        originalSeverity: curve.severity,
        llmAdjusted: true,
        llmReason: change.reason
      }
    }

    return curve
  }) || []

  // --- Process bend enhancements ---
  const bendEnhanceMap = new Map()
  bendEnhancements.forEach(enh => {
    if (enh.id) bendEnhanceMap.set(enh.id, enh)
  })

  const enhancedBends = originalBends?.map(bend => {
    const enhancement = bendEnhanceMap.get(bend.id)

    if (!enhancement) return bend

    if (bend.isSection && enhancement.callout) {
      changes.push(`✨ Enhanced section ${bend.id}: "${enhancement.callout.slice(0, 50)}..."`)
      return {
        ...bend,
        calloutDetailed: enhancement.callout,
        calloutShort: enhancement.shortCallout || bend.calloutBasic,
        llmEnhanced: true
      }
    }

    return bend
  }) || []

  // --- Build callout variants map ---
  // Add original callout as first variant, then LLM variants
  const finalCalloutVariants = {}
  
  enhancedCurves.forEach((curve, i) => {
    const curveId = curve.id || `c${i}`
    const llmVariants = calloutVariants[curveId] || []
    
    // Generate base callout
    const baseCallout = generateBaseCallout(curve)
    
    if (llmVariants.length > 0) {
      // LLM provided variants
      finalCalloutVariants[curveId] = [baseCallout, ...llmVariants]
      changes.push(`🎙️ Generated ${llmVariants.length} callout variants for ${curveId}`)
    } else if (curve.severity >= 3) {
      // No LLM variants but it's a notable curve - keep base
      finalCalloutVariants[curveId] = [baseCallout]
    }
  })

  return {
    curves: enhancedCurves,
    highwayBends: enhancedBends,
    calloutVariants: finalCalloutVariants,
    changes
  }
}

/**
 * Generate base callout text for a curve (fallback/default)
 */
function generateBaseCallout(curve) {
  if (curve.isChicane) {
    const firstDir = curve.startDirection === 'LEFT' ? 'Left' : 'Right'
    const type = curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S curve'
    return `${type} ${firstDir} ${curve.severitySequence || ''}`
  }

  const dir = curve.direction === 'LEFT' ? 'Left' : 'Right'
  let text = `${dir} ${curve.severity}`

  if (curve.modifier) {
    const mods = {
      'TIGHTENS': 'tightens',
      'OPENS': 'opens',
      'LONG': 'long',
      'HAIRPIN': 'hairpin'
    }
    text += ` ${mods[curve.modifier] || curve.modifier.toLowerCase()}`
  }

  return text
}

// ================================
// UTILITY: Check if enhancement is needed
// ================================

/**
 * Quick check if LLM enhancement would be useful for this route
 * Helps avoid unnecessary API calls for simple routes
 */
export function shouldEnhanceCurves({ curves, highwayBends }) {
  // Has active sections that need rich descriptions
  const hasActiveSections = highwayBends?.some(b => b.isSection) || false
  
  // Has notable curves that would benefit from variants
  const hasNotableCurves = curves?.filter(c => c.severity >= 3).length > 2
  
  // Has potential false positives (short urban curves)
  const hasSuspiciousCurves = curves?.some(c => 
    (c.length && c.length < 30) || 
    (c.severity === 1 && !c.isSweeper)
  ) || false

  return hasActiveSections || hasNotableCurves || hasSuspiciousCurves
}

// ================================
// DEFAULT EXPORT
// ================================

export default {
  enhanceCurvesWithLLM,
  shouldEnhanceCurves,
  getLLMApiKey,
  hasLLMApiKey
}
