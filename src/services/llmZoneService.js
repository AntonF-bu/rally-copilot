// ================================
// LLM Zone Classification Service
// Uses OpenAI to intelligently classify route zones
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

// Zone types
export const ZONE_TYPES = {
  HIGHWAY: 'transit',      // Maps to our internal 'transit' character
  TECHNICAL: 'technical',
  URBAN: 'urban'
}

/**
 * Validate and improve zone classifications using LLM
 * Called during "Preparing Co-Pilot" phase
 */
export async function validateZonesWithLLM(segments, routeData, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ No OpenAI API key - skipping LLM zone validation')
    return segments
  }

  if (!segments?.length) {
    return segments
  }

  console.log('🤖 LLM Zone Validation - Starting...')
  const startTime = Date.now()

  try {
    // Build segment summaries for LLM
    const segmentSummaries = segments.map((seg, i) => ({
      index: i,
      startKm: (seg.startDistance / 1000).toFixed(1),
      endKm: (seg.endDistance / 1000).toFixed(1),
      lengthKm: ((seg.endDistance - seg.startDistance) / 1000).toFixed(1),
      currentClassification: seg.character,
      curveCount: seg.curveCount || 0,
      avgCurveAngle: seg.avgCurveAngle || 0,
      // Add any road metadata if available
      roadClass: seg.roadClass || 'unknown',
      estimatedSpeedMph: seg.estimatedSpeed || 0
    }))

    // Build the prompt
    const prompt = buildClassificationPrompt(segmentSummaries, routeData)

    // Call OpenAI
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',  // Fast and cheap, good for classification
        messages: [
          {
            role: 'system',
            content: getSystemPrompt()
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        temperature: 0.3,  // Low temperature for consistent classification
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ OpenAI API error:', error)
      return segments
    }

    const data = await response.json()
    const llmResponse = data.choices?.[0]?.message?.content

    if (!llmResponse) {
      console.error('❌ Empty LLM response')
      return segments
    }

    console.log('🤖 LLM Response:', llmResponse)

    // Parse LLM response and apply overrides
    const overrides = parseClassificationResponse(llmResponse, segments.length)
    const updatedSegments = applyOverrides(segments, overrides)

    const elapsed = Date.now() - startTime
    console.log(`✅ LLM Zone Validation complete in ${elapsed}ms`)
    
    // Log any changes
    overrides.forEach(override => {
      if (override.newClassification !== segments[override.index].character) {
        console.log(`   📍 Segment ${override.index}: ${segments[override.index].character} → ${override.newClassification} (${override.reason})`)
      }
    })

    return updatedSegments

  } catch (error) {
    console.error('❌ LLM Zone Validation failed:', error)
    return segments  // Return original segments on error
  }
}

/**
 * System prompt for the classification task
 */
function getSystemPrompt() {
  return `You are an expert driving route analyst for a rally co-pilot app. Your job is to classify road segments into the correct driving character.

CLASSIFICATION TYPES (only use these 3):
- HIGHWAY: Wide, fast roads. Interstates, turnpikes, major highways. INCLUDES highway interchanges, ramps, curves, and ANY section that is part of the same continuous highway.
- TECHNICAL: Narrow, winding roads requiring full attention. Mountain roads, forest roads, twisty backroads. ONLY when driver has physically EXITED the highway onto a completely different road.
- URBAN: City/town driving with traffic lights, frequent stops. Downtown areas, commercial zones.

CRITICAL - HIGHWAY CONTINUITY IS PARAMOUNT:
The #1 mistake to avoid is marking highway sections as TECHNICAL just because they have curves.

RULES (in priority order):
1. If estimated speed is 55+ mph → HIGHWAY (highways have high speed limits)
2. If road class is motorway, trunk, or primary → HIGHWAY
3. If segment is between two HIGHWAY segments → HIGHWAY (you can't teleport off a highway)
4. If segment is at START of route and NEXT segment is HIGHWAY → probably HIGHWAY (starting on highway)
5. If segment is at END of route and PREVIOUS segment is HIGHWAY → probably HIGHWAY (ending on highway)
6. Curves do NOT make something TECHNICAL - highways have curves too!
7. Only use TECHNICAL when the road class clearly indicates a secondary/tertiary road AND it's NOT surrounded by highway segments

EXAMPLES:
- I-95 with a 15° curve at an interchange → HIGHWAY (still on I-95)
- Route 128 with sweeping bends → HIGHWAY (major highway)
- Exit onto Route 9 mountain road → TECHNICAL (exited highway, different road)
- Downtown Boston streets → URBAN

You MUST respond with classifications for ALL segments, not just changes. This ensures nothing is missed.`
}

/**
 * Build the classification prompt with segment data
 */
function buildClassificationPrompt(segmentSummaries, routeData) {
  // Calculate current highway percentage
  let totalDist = 0
  let highwayDist = 0
  segmentSummaries.forEach(seg => {
    const len = parseFloat(seg.lengthKm) || 0
    totalDist += len
    if (seg.currentClassification === 'transit') highwayDist += len
  })
  const highwayPercent = totalDist > 0 ? Math.round((highwayDist / totalDist) * 100) : 0

  const routeContext = routeData ? `
ROUTE OVERVIEW:
- Total distance: ${((routeData.distance || 0) / 1000).toFixed(1)} km (${((routeData.distance || 0) / 1609.34).toFixed(1)} miles)
- Total curves: ${routeData.curves?.length || 0}
- Current highway percentage: ${highwayPercent}%
- Route type hint: ${highwayPercent > 50 ? 'PREDOMINANTLY HIGHWAY ROUTE' : 'Mixed route'}
` : ''

  const segmentsList = segmentSummaries.map((seg, i) => {
    const prevSeg = segmentSummaries[i - 1]
    const nextSeg = segmentSummaries[i + 1]
    
    // Build position context
    let positionHint = ''
    if (i === 0 && nextSeg?.currentClassification === 'transit') {
      positionHint = ' ⚠️ START of route, next is HIGHWAY'
    } else if (i === segmentSummaries.length - 1 && prevSeg?.currentClassification === 'transit') {
      positionHint = ' ⚠️ END of route, prev is HIGHWAY'
    } else if (prevSeg?.currentClassification === 'transit' && nextSeg?.currentClassification === 'transit') {
      positionHint = ' ⚠️ SANDWICHED between HIGHWAY segments!'
    }
    
    const neighbors = []
    if (prevSeg) neighbors.push(`Prev: ${prevSeg.currentClassification.toUpperCase()}`)
    if (nextSeg) neighbors.push(`Next: ${nextSeg.currentClassification.toUpperCase()}`)
    const neighborInfo = neighbors.length > 0 ? ` | ${neighbors.join(', ')}` : ''
    
    return `[${i}] ${seg.startKm}-${seg.endKm}km (${seg.lengthKm}km): ${seg.currentClassification.toUpperCase()}${neighborInfo}${positionHint}
    Speed: ${seg.estimatedSpeedMph}mph, Curves: ${seg.curveCount}, Avg angle: ${seg.avgCurveAngle}°, Road: ${seg.roadClass}`
  }).join('\n')

  return `${routeContext}

SEGMENTS:
${segmentsList}

⚠️ IMPORTANT: Any segment marked with ⚠️ is SUSPICIOUS and likely needs to be changed to HIGHWAY.

Return a JSON array with your classification for EVERY segment (not just changes):

[
  { "index": 0, "classification": "HIGHWAY", "confidence": 0.95, "reason": "motorway, 65mph" },
  { "index": 1, "classification": "HIGHWAY", "confidence": 0.90, "reason": "between highway segments" },
  ...
]

Respond ONLY with the JSON array, no other text.`
}

/**
 * Parse LLM response into structured overrides
 */
function parseClassificationResponse(response, segmentCount) {
  const overrides = []

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      console.warn('LLM response is not an array')
      return overrides
    }

    for (const item of parsed) {
      const index = parseInt(item.index)
      if (isNaN(index) || index < 0 || index >= segmentCount) continue

      const classification = item.classification?.toUpperCase()
      let mappedClass = null

      switch (classification) {
        case 'HIGHWAY':
        case 'TRANSIT':
          mappedClass = 'transit'
          break
        case 'TECHNICAL':
          mappedClass = 'technical'
          break
        case 'URBAN':
          mappedClass = 'urban'
          break
        // Map any legacy spirited to technical
        case 'SPIRITED':
          mappedClass = 'technical'
          break
      }

      if (mappedClass) {
        overrides.push({
          index,
          newClassification: mappedClass,
          confidence: item.confidence || 0.8,
          reason: item.reason || 'LLM classification'
        })
      }
    }
  } catch (e) {
    console.error('Failed to parse LLM response:', e)
  }

  return overrides
}

/**
 * Apply LLM overrides to segments
 */
function applyOverrides(segments, overrides) {
  if (!overrides.length) return segments

  const updated = [...segments]

  for (const override of overrides) {
    if (override.index >= 0 && override.index < updated.length) {
      const currentChar = updated[override.index].character
      const newChar = override.newClassification
      
      // Always apply if it's a change (we asked LLM for all segments, trust its judgment)
      // Only skip if confidence is very low (<0.5) AND it's not fixing a highway continuity issue
      const isHighwayFix = newChar === 'transit' && currentChar !== 'transit'
      const shouldApply = override.confidence >= 0.5 || isHighwayFix
      
      if (shouldApply && newChar !== currentChar) {
        console.log(`  🔄 LLM: Segment ${override.index}: ${currentChar} → ${newChar} (${(override.confidence * 100).toFixed(0)}% - ${override.reason})`)
        updated[override.index] = {
          ...updated[override.index],
          character: newChar,
          llmOverride: true,
          llmReason: override.reason,
          llmConfidence: override.confidence
        }
      }
    }
  }

  return updated
}

/**
 * Check if API key is configured
 */
export function hasLLMApiKey() {
  return !!import.meta.env.VITE_OPENAI_API_KEY
}

/**
 * Get API key from environment
 */
export function getLLMApiKey() {
  return import.meta.env.VITE_OPENAI_API_KEY || ''
}
