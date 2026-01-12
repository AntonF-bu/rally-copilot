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
- HIGHWAY: Wide, fast roads with gentle sweepers. Interstates, turnpikes, major highways, scenic byways with good flow. Typically 2+ lanes, higher speed limits, gentle curves.
- TECHNICAL: Narrow, winding roads requiring full attention. Mountain roads, forest roads, twisty backroads, country lanes with tight curves. Many curves, lower effective speeds.
- URBAN: City/town driving with traffic lights, pedestrians, frequent stops. Downtown areas, suburban streets, commercial zones.

KEY INSIGHTS:
- A narrow 2-lane forest road with a 50mph speed limit is TECHNICAL, not HIGHWAY
- A scenic country road with gentle sweeping curves is HIGHWAY
- High curve count + tight angles = TECHNICAL
- High curve count + gentle angles = HIGHWAY
- Few curves + high speed = HIGHWAY
- Lots of intersections/stops = URBAN

RULES:
1. High curve density with tight angles (15°+) = TECHNICAL
2. High curve density with gentle angles (<15°) = HIGHWAY
3. Road names containing "Mountain", "Forest", "Ridge" with many curves = TECHNICAL
4. Road names containing "Interstate", "Turnpike", "Highway XX" = HIGHWAY
5. Short segments (<2km) between highway sections are likely interchanges - keep as HIGHWAY
6. When in doubt, prefer TECHNICAL for safety (better to over-call than under-call)

Respond ONLY with valid JSON array. No explanation text outside the JSON.`
}

/**
 * Build the classification prompt with segment data
 */
function buildClassificationPrompt(segmentSummaries, routeData) {
  const routeContext = routeData ? `
ROUTE OVERVIEW:
- Total distance: ${((routeData.distance || 0) / 1000).toFixed(1)} km
- Total curves: ${routeData.curves?.length || 0}
- Route name: ${routeData.name || 'Unknown'}
` : ''

  const segmentsList = segmentSummaries.map(seg => 
    `Segment ${seg.index}: ${seg.startKm}km - ${seg.endKm}km (${seg.lengthKm}km)
   Current: ${seg.currentClassification.toUpperCase()}
   Curves: ${seg.curveCount}, Avg angle: ${seg.avgCurveAngle}°
   Road class: ${seg.roadClass}, Est. speed: ${seg.estimatedSpeedMph}mph`
  ).join('\n\n')

  return `${routeContext}

SEGMENTS TO CLASSIFY:

${segmentsList}

For each segment, analyze if the current classification is correct. Return a JSON array with your assessment:

[
  {
    "index": 0,
    "classification": "HIGHWAY|TECHNICAL|URBAN",
    "confidence": 0.0-1.0,
    "reason": "brief explanation"
  },
  ...
]

Only include segments where you recommend a CHANGE or have low confidence in current classification. If a segment looks correct, you can omit it or confirm with high confidence.`
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
      // Only apply if confidence is high enough
      if (override.confidence >= 0.6) {
        updated[override.index] = {
          ...updated[override.index],
          character: override.newClassification,
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
