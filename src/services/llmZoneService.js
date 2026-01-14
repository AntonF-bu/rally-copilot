// ================================
// LLM Zone Classification Service v2
// Comprehensive route analysis with full context
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

// Zone types
export const ZONE_TYPES = {
  HIGHWAY: 'transit',
  TECHNICAL: 'technical',
  URBAN: 'urban'
}

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
 * Main function: Validate and enhance zone classifications
 * Returns both original and enhanced segments for comparison
 */
export async function validateZonesWithLLM(segments, routeData, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ No OpenAI API key - skipping LLM zone validation')
    return { enhanced: segments, original: segments, changes: [] }
  }

  if (!segments?.length) {
    return { enhanced: segments, original: segments, changes: [] }
  }

  console.log('🤖 LLM Zone Validation v2 - Starting...')
  const startTime = Date.now()

  try {
    // Build comprehensive prompt with ALL available data
    const prompt = buildComprehensivePrompt(segments, routeData)
    
    // Log prompt size for debugging
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
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,  // Low for consistency
        max_tokens: 4000   // Increased to prevent truncation
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ OpenAI API error:', error)
      return { enhanced: segments, original: segments, changes: [] }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.warn('⚠️ Empty LLM response')
      return { enhanced: segments, original: segments, changes: [] }
    }

    console.log('📥 LLM Response:', content.slice(0, 500))

    // Parse response
    const llmDecisions = parseResponse(content)
    
    // Apply decisions to create enhanced segments
    const { enhanced, changes } = applyDecisions(segments, llmDecisions)

    const elapsed = Date.now() - startTime
    console.log(`✅ LLM Zone Validation complete in ${elapsed}ms`)
    console.log(`   Changes: ${changes.length}`)
    changes.forEach(c => console.log(`   - ${c}`))

    return { 
      enhanced, 
      original: segments, 
      changes,
      llmReasoning: llmDecisions 
    }

  } catch (err) {
    console.error('❌ LLM validation error:', err)
    return { enhanced: segments, original: segments, changes: [] }
  }
}

/**
 * Comprehensive system prompt
 */
function getSystemPrompt() {
  return `You are a road classification expert for a rally co-pilot app. Your job is to validate and correct zone classifications based on ROAD CHARACTER, not nearby businesses.

ZONE TYPES:
- HIGHWAY/TRANSIT: Controlled-access highways, interstates, major arterials. Characterized by long straights, gentle curves, high speed limits.
- TECHNICAL: Winding backroads, mountain roads, rural routes with frequent curves. The FUN roads for driving enthusiasts.
- URBAN: Dense city centers with traffic lights, stop signs, pedestrians, frequent intersections. Low speed, stop-and-go driving.

CRITICAL RULES - READ CAREFULLY:

1. ROAD CHARACTER TRUMPS EVERYTHING
   - A winding road through a town with a gas station is still TECHNICAL
   - A curvy mountain road near a parking lot is still TECHNICAL
   - Only classify as URBAN if the road itself has urban characteristics (grid streets, traffic lights, low speeds)

2. CURVE DENSITY IS THE KEY INDICATOR
   - Many curves (5+ per mile) = TECHNICAL, regardless of nearby POIs
   - Few curves + high speed = HIGHWAY/TRANSIT
   - Grid pattern + stop signs + traffic lights = URBAN

3. DO NOT RECLASSIFY BASED ON:
   - Gas stations (they exist everywhere, even on mountain roads)
   - Parking lots (trailheads, scenic overlooks have them too)
   - Small towns along the route (a curvy road through a village is still TECHNICAL)
   - Business names or POI types

4. WHEN TO CLASSIFY AS URBAN:
   - ONLY when the road enters a true city/town CENTER
   - Grid street patterns
   - Multiple traffic lights per mile
   - Speed limits 25-35mph due to pedestrians/density
   - The road STOPS being curvy and becomes stop-and-go

5. SANDWICH RULE:
   - Short segments (<2 miles) between two identical zones should match those zones
   - Example: HIGHWAY → short TECHNICAL → HIGHWAY = probably all HIGHWAY
   - BUT: HIGHWAY → long TECHNICAL (5+ miles) → URBAN = keep as classified

6. END OF ROUTE SPECIAL CASE:
   - Routes often end in destinations (towns, cities)
   - But the APPROACH to a destination is often the best driving!
   - Only mark the final 1-2 miles as URBAN if it's truly city driving
   - Winding roads leading TO a town are TECHNICAL, not URBAN

RESPONSE FORMAT:
Return JSON with only segments that need CHANGING:
{
  "d": [
    {"i": 0, "n": "highway", "r": "brief reason"},
    {"i": 5, "n": "technical", "r": "brief reason"}
  ]
}

- "i" = segment index (0-based)
- "n" = new classification (highway, technical, urban)
- "r" = brief reason (10 words max)

Only include segments that need to change. If all segments are correct, return {"d": []}.

EXAMPLES:

Input: Segment 9 (miles 79-91): Currently TECHNICAL, 23 curves detected, ends near Amherst
Correct decision: KEEP as TECHNICAL - high curve count indicates winding road
WRONG decision: Change to URBAN because "gas stations nearby"

Input: Segment 3 (miles 5-8): Currently TECHNICAL, only 2 gentle curves, between two HIGHWAY segments  
Correct decision: Change to HIGHWAY - low curve count, sandwiched between highways

Input: Segment 7 (miles 45-47): Currently HIGHWAY, enters downtown Boston, grid streets
Correct decision: Change to URBAN - true city center characteristics

Remember: Drivers use this app for the JOY of driving. Don't strip away the fun technical sections just because there's a gas station nearby!`
}

/**
 * Build compact prompt with essential data only
 */
function buildComprehensivePrompt(segments, routeData) {
  const totalDistanceMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Build compact segment list
  const segmentList = segments.map((seg, i) => {
    const prevSeg = segments[i - 1]
    const nextSeg = segments[i + 1]
    const lengthMi = ((seg.endDistance - seg.startDistance) / 1609.34).toFixed(1)
    
    const roadNames = seg.details?.roadNames?.join(', ') || 'unknown'
    const roadClasses = seg.details?.roadClasses?.join(', ') || 'unknown'
    const avgSpeed = Math.round(seg.details?.avgSpeedLimit || 0)
    
    // Flag sandwiched segments
    let flag = ''
    if (i === 0) flag = '[START]'
    else if (i === segments.length - 1) flag = '[END]'
    else if (prevSeg?.character === 'transit' && nextSeg?.character === 'transit' && seg.character !== 'transit') {
      flag = '[SANDWICHED!]'
    }
    
    const prev = prevSeg ? prevSeg.character : '-'
    const next = nextSeg ? nextSeg.character : '-'
    
    return `${i}: ${seg.character} ${lengthMi}mi | roads:${roadNames} | class:${roadClasses} | ${avgSpeed}mph | prev:${prev} next:${next} ${flag}`
  }).join('\n')

  return `Route: ${totalDistanceMiles}mi, ${segments.length} segments

SEGMENTS:
${segmentList}

Return ONLY segments that need to CHANGE using compact format:
{"d":[{"i":INDEX,"n":"highway|technical|urban","r":"reason"}]}`
}

/**
 * Parse LLM response - handles compact format
 */
function parseResponse(content) {
  try {
    // Extract JSON from response
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
    
    // Handle compact format: {"d":[{"i":0,"n":"highway","r":"reason"}]}
    if (parsed.d && Array.isArray(parsed.d)) {
      console.log(`📋 Parsed compact format: ${parsed.d.length} decisions`)
      return {
        decisions: parsed.d.map(d => ({
          segmentIndex: d.i,
          newClassification: d.n,
          reason: d.r,
          confidence: 0.9
        }))
      }
    }
    
    // Handle standard format: {"decisions":[...]}
    if (parsed.decisions) {
      return parsed
    }
    
    // Handle array format: [{...}, {...}]
    if (Array.isArray(parsed)) {
      return { decisions: parsed }
    }
    
    console.warn('⚠️ Unknown response format:', Object.keys(parsed))
    return { decisions: [] }
    
  } catch (err) {
    console.error('Failed to parse LLM response:', err)
    console.error('Raw content:', content?.slice(0, 500))
    return { decisions: [] }
  }
}

/**
 * Apply LLM decisions to segments
 */
function applyDecisions(originalSegments, llmDecisions) {
  const changes = []
  const decisions = llmDecisions?.decisions || []
  
  console.log(`📋 Applying ${decisions.length} LLM decisions to ${originalSegments.length} segments`)
  
  // Create map of decisions by index
  const decisionMap = new Map()
  decisions.forEach(d => {
    if (typeof d.segmentIndex === 'number') {
      decisionMap.set(d.segmentIndex, d)
      console.log(`   Decision for seg ${d.segmentIndex}: current="${d.currentClassification}" → new="${d.newClassification}"`)
    }
  })
  
  // Apply decisions
  const enhanced = originalSegments.map((seg, i) => {
    const decision = decisionMap.get(i)
    
    if (!decision) {
      // No decision for this segment, keep as-is
      return seg
    }
    
    // Map classification names - handle various formats
    let newChar = seg.character
    const newClassRaw = decision.newClassification || ''
    const newClassLower = newClassRaw.toLowerCase().trim()
    
    console.log(`   Seg ${i}: current char="${seg.character}", LLM says="${newClassRaw}" (normalized="${newClassLower}")`)
    
    if (newClassLower === 'highway' || newClassLower === 'transit' || newClassLower === 'hwy') {
      newChar = 'transit'
    } else if (newClassLower === 'technical' || newClassLower === 'tech') {
      newChar = 'technical'
    } else if (newClassLower === 'urban') {
      newChar = 'urban'
    }
    
    console.log(`   Seg ${i}: mapped to newChar="${newChar}", will change=${newChar !== seg.character}`)
    
    // Check if this is actually a change
    if (newChar !== seg.character) {
      changes.push(`Segment ${i}: ${seg.character} → ${newChar} (${decision.reason})`)
      
      return {
        ...seg,
        character: newChar,
        llmOverride: true,
        llmReason: decision.reason,
        llmConfidence: decision.confidence
      }
    }
    
    // No change, but add LLM confirmation
    return {
      ...seg,
      llmConfirmed: true,
      llmReason: decision.reason
    }
  })
  
  console.log(`📋 Applied changes: ${changes.length}`)
  
  return { enhanced, changes }
}

/**
 * Collect road names for a segment from sample points
 * Call this during route analysis to gather road name data
 */
export function collectSegmentRoadNames(samplePoints, startDist, endDist) {
  const roadNames = []
  const roadClasses = []
  const speedLimits = []
  
  samplePoints.forEach(point => {
    if (point.distance >= startDist && point.distance <= endDist) {
      if (point.roadName) roadNames.push(point.roadName)
      if (point.roadClass) roadClasses.push(point.roadClass)
      if (point.speedLimit) speedLimits.push(point.speedLimit)
    }
  })
  
  return {
    roadNames: [...new Set(roadNames)],
    roadClasses: [...new Set(roadClasses)],
    avgSpeedLimit: speedLimits.length > 0 
      ? Math.round(speedLimits.reduce((a, b) => a + b, 0) / speedLimits.length)
      : null,
    minSpeedLimit: speedLimits.length > 0 ? Math.min(...speedLimits) : null,
    maxSpeedLimit: speedLimits.length > 0 ? Math.max(...speedLimits) : null
  }
}

export default {
  validateZonesWithLLM,
  collectSegmentRoadNames,
  getLLMApiKey,
  hasLLMApiKey,
  ZONE_TYPES
}
