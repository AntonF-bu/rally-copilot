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
 * 
 * @param {Array} segments - Route segments with character classifications
 * @param {Object} routeData - Route data including distance
 * @param {string} apiKey - OpenAI API key
 * @param {Array} curves - Optional array of detected curves with { distance, angle, direction }
 */
export async function validateZonesWithLLM(segments, routeData, apiKey, curves = []) {
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
    // Build comprehensive prompt with ALL available data including curves
    const prompt = buildComprehensivePrompt(segments, routeData, curves)
    
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
- HIGHWAY/TRANSIT: Controlled-access highways, interstates, major arterials. Characterized by long straights, gentle curves, high speed limits (50+ mph).
- TECHNICAL: Winding backroads, mountain roads, rural routes with frequent curves. The FUN roads for driving enthusiasts. High curve density (2+ curves per mile).
- URBAN: Dense city centers with traffic lights, stop signs, pedestrians, frequent intersections. Low speed (25-35 mph), stop-and-go driving.

CRITICAL RULES:

1. PRESERVE URBAN AT ROUTE START/END
   - Routes typically START in urban areas (leaving a city)
   - Routes typically END in urban areas (arriving at destination)
   - Short urban segments (<1 mile) at the very start or end are CORRECT - don't change them
   - Only change urban to transit/highway if it's clearly a highway on-ramp situation

2. ROAD CHARACTER TRUMPS POIs
   - A winding road through a town with a gas station is still TECHNICAL
   - Only classify as URBAN if the road itself has urban characteristics
   - POIs (gas stations, parking lots) exist everywhere - ignore them

3. CURVE DENSITY IS THE PRIMARY INDICATOR
   - Look at the CURVES column in the data - this is hard evidence!
   - 2+ curves per mile with angles 20°+ = TECHNICAL (regardless of nearby POIs)
   - 0-1 curves per mile = likely HIGHWAY/TRANSIT
   - High curve count ALWAYS overrides POI-based reasoning

4. SANDWICH RULE
   - Short segments (<2 miles) between two identical zones should match
   - Example: HIGHWAY → short TECHNICAL → HIGHWAY = probably all HIGHWAY
   - BUT: Keep genuine technical sections that have high curve density

5. WHEN TO CHANGE TO URBAN:
   - ONLY for true city CENTER driving
   - Grid street patterns with traffic lights
   - NOT just because there are businesses nearby
   - Low curve count AND low speed limit AND urban road class

6. WHEN TO KEEP URBAN:
   - First segment of route (leaving origin city) - usually correct
   - Last 1-2 miles arriving at destination in a town
   - True downtown areas with grid streets

RESPONSE FORMAT:
Return JSON with only segments that need CHANGING:
{
  "d": [
    {"i": 0, "n": "highway", "r": "brief reason"},
    {"i": 5, "n": "technical", "r": "brief reason"}
  ]
}

If a segment is correctly classified, DO NOT include it in the response.
If all segments are correct, return {"d": []}.

EXAMPLES:

Segment 0 (miles 0-0.5): Currently URBAN, 2 curves, route starts in Boston
✓ KEEP as URBAN - routes start in cities, low curve count, this is correct

Segment 9 (miles 79-91): Currently TECHNICAL, 45 curves (3.9/mi), max 120°, ends near Amherst
✓ KEEP as TECHNICAL - high curve count is definitive evidence of winding roads

Segment 9 (miles 79-91): Currently URBAN, 45 curves (3.9/mi), max 120°
→ CHANGE to TECHNICAL - 45 curves proves this is winding backroads, not urban

Segment 4 (miles 27-28): Currently TECHNICAL, 0 curves, between two TRANSIT segments
→ CHANGE to TRANSIT - no curves + sandwiched = highway

Remember: CURVE DATA IS TRUTH. High curve counts = TECHNICAL, regardless of what's nearby!`
}

/**
 * Build compact prompt with essential data including curve counts
 */
function buildComprehensivePrompt(segments, routeData, curves = []) {
  const totalDistanceMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Pre-calculate curve stats per segment
  const segmentCurveStats = segments.map((seg, i) => {
    const startMi = seg.startDistance / 1609.34
    const endMi = seg.endDistance / 1609.34
    const lengthMi = endMi - startMi
    
    // Find curves in this segment
    const segmentCurves = curves.filter(c => {
      // Handle both distance and distanceFromStart properties
      const curveDistanceMeters = c.distance || c.distanceFromStart || 0
      const curveMile = curveDistanceMeters / 1609.34
      return curveMile >= startMi && curveMile <= endMi
    })
    
    const curveCount = segmentCurves.length
    const curvesPerMile = lengthMi > 0 ? (curveCount / lengthMi).toFixed(1) : '0.0'
    const maxAngle = segmentCurves.length > 0 
      ? Math.max(...segmentCurves.map(c => Math.abs(c.angle || 0)))
      : 0
    const avgAngle = segmentCurves.length > 0
      ? Math.round(segmentCurves.reduce((sum, c) => sum + Math.abs(c.angle || 0), 0) / segmentCurves.length)
      : 0
    
    return { curveCount, curvesPerMile, maxAngle, avgAngle }
  })
  
  // Build compact segment list with curve data
  const segmentList = segments.map((seg, i) => {
    const prevSeg = segments[i - 1]
    const nextSeg = segments[i + 1]
    const lengthMi = ((seg.endDistance - seg.startDistance) / 1609.34).toFixed(1)
    
    const roadNames = seg.details?.roadNames?.slice(0, 2).join(', ') || 'unknown'
    const roadClasses = seg.details?.roadClasses?.join(', ') || 'unknown'
    const avgSpeed = Math.round(seg.details?.avgSpeedLimit || 0)
    
    // Curve stats for this segment
    const curveStats = segmentCurveStats[i]
    const curveInfo = `${curveStats.curveCount} curves (${curveStats.curvesPerMile}/mi, max ${curveStats.maxAngle}°)`
    
    // Flag important segments
    let flag = ''
    if (i === 0) flag = '[START]'
    else if (i === segments.length - 1) flag = '[END]'
    else if (prevSeg?.character === 'transit' && nextSeg?.character === 'transit' && seg.character !== 'transit') {
      flag = '[SANDWICHED]'
    }
    
    // High curve density flag
    if (parseFloat(curveStats.curvesPerMile) >= 2) {
      flag += '[HIGH-CURVES!]'
    }
    
    return `${i}: ${seg.character.toUpperCase()} ${lengthMi}mi | ${curveInfo} | ${avgSpeed}mph | ${roadClasses} ${flag}`
  }).join('\n')

  return `Route: ${totalDistanceMiles}mi, ${segments.length} segments, ${curves.length} total curves detected

SEGMENTS (with curve data):
${segmentList}

IMPORTANT: Curve data is TRUTH. High curve counts (2+/mi) = TECHNICAL road character.

Return ONLY segments that need to CHANGE:
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
