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
        max_tokens: 2000
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
  return `You are an expert driving route analyst for a rally co-pilot navigation app. Your job is to classify road segments accurately so the app gives appropriate audio callouts.

## ZONE TYPES

**HIGHWAY** (internal code: "transit")
- Interstates, turnpikes, major highways (I-95, I-93, Route 128, etc.)
- High-speed roads with limited access
- Includes on-ramps and off-ramps that are part of highway system
- Callout style: Minimal, only significant curves

**TECHNICAL** (internal code: "technical")  
- Winding backroads, mountain roads, scenic routes
- Roads where driver needs full attention
- Country roads, forest roads, fun driving roads
- Callout style: Full pace notes, every curve

**URBAN** (internal code: "urban")
- City streets, downtown areas, parking lots
- Gas stations, shopping centers, residential areas
- Low speed, frequent stops
- Callout style: Minimal, only sharp turns

## CLASSIFICATION RULES (in priority order)

1. **Road Name Recognition**
   - "I-XX", "Interstate XX", "US-XX Highway" → HIGHWAY
   - "Route XX" with high speed on limited access → HIGHWAY
   - "Main St", "Oak Ave", local names → URBAN or TECHNICAL based on context
   - Gas station, parking lot, service road → URBAN

2. **Road Class + Speed**
   - motorway, trunk → HIGHWAY
   - motorway_link, trunk_link with speed ≥45 → HIGHWAY
   - motorway_link, trunk_link with speed <45 → Transitioning, check context
   - primary with speed ≥55 → likely HIGHWAY
   - secondary, tertiary, residential → TECHNICAL or URBAN

3. **Context Matters**
   - Start of route at gas station/parking → URBAN even if near highway
   - End of route in neighborhood → URBAN or TECHNICAL
   - Section between two HIGHWAY segments → Usually HIGHWAY (same road)
   - BUT: If road names change AND speed drops → Could be legitimate exit

4. **Sandwich Rule with Override**
   - Default: Non-highway between two highways → Probably HIGHWAY
   - Override allowed IF: Road name clearly changes (I-93 → Main St) AND speed drops significantly
   - You MUST justify any sandwich override with specific evidence

## YOUR TASK

Analyze each segment and decide:
1. Is the current classification correct?
2. If not, what should it be and WHY?
3. Should any segment be SPLIT? (e.g., starts URBAN, becomes HIGHWAY)

## RESPONSE FORMAT

Return valid JSON only:
{
  "decisions": [
    {
      "segmentIndex": 0,
      "currentClassification": "technical",
      "newClassification": "urban",
      "confidence": 0.9,
      "reason": "Segment starts at Shell Gas Station (service road), should be URBAN",
      "splitAt": null
    },
    {
      "segmentIndex": 1,
      "currentClassification": "highway",
      "newClassification": "highway",
      "confidence": 0.95,
      "reason": "I-93 motorway, correct classification",
      "splitAt": null
    },
    {
      "segmentIndex": 2,
      "currentClassification": "technical",
      "newClassification": "highway",
      "confidence": 0.85,
      "reason": "Sandwiched between highway segments, road is still I-93 ramp area",
      "splitAt": null
    }
  ],
  "overallAnalysis": "Route is primarily highway (I-93) with urban start at gas station"
}

Be thorough. Analyze EVERY segment. Provide clear reasoning.`
}

/**
 * Build comprehensive prompt with ALL available data
 */
function buildComprehensivePrompt(segments, routeData) {
  // Extract route-level info
  const totalDistance = routeData?.distance || 0
  const totalDistanceMiles = (totalDistance / 1609.34).toFixed(1)
  
  // Get start/end coordinates for context
  const startCoord = routeData?.coordinates?.[0]
  const endCoord = routeData?.coordinates?.[routeData.coordinates.length - 1]
  
  // Calculate current classification breakdown
  let highwayDist = 0, techDist = 0, urbanDist = 0
  segments.forEach(seg => {
    const len = (seg.endDistance || 0) - (seg.startDistance || 0)
    if (seg.character === 'transit') highwayDist += len
    else if (seg.character === 'technical') techDist += len
    else if (seg.character === 'urban') urbanDist += len
  })
  
  const highwayPct = totalDistance > 0 ? Math.round((highwayDist / totalDistance) * 100) : 0
  const techPct = totalDistance > 0 ? Math.round((techDist / totalDistance) * 100) : 0
  const urbanPct = totalDistance > 0 ? Math.round((urbanDist / totalDistance) * 100) : 0

  // Build segment details
  const segmentDetails = segments.map((seg, i) => {
    const prevSeg = segments[i - 1]
    const nextSeg = segments[i + 1]
    const lengthMiles = ((seg.endDistance - seg.startDistance) / 1609.34).toFixed(2)
    
    // Collect all road names in this segment
    const roadNames = seg.roadNames || seg.details?.roadNames || []
    const uniqueRoadNames = [...new Set(roadNames)].filter(Boolean)
    
    // Get road classes
    const roadClasses = seg.roadClasses || seg.details?.roadClasses || []
    const uniqueRoadClasses = [...new Set(roadClasses)].filter(Boolean)
    
    // Speed info
    const avgSpeed = seg.details?.avgSpeedLimit || seg.avgSpeedLimit || 'unknown'
    const minSpeed = seg.details?.minSpeedLimit || seg.minSpeedLimit || avgSpeed
    const maxSpeed = seg.details?.maxSpeedLimit || seg.maxSpeedLimit || avgSpeed
    
    // Position context
    let positionContext = ''
    if (i === 0) positionContext = '⚠️ START OF ROUTE'
    else if (i === segments.length - 1) positionContext = '⚠️ END OF ROUTE'
    else if (prevSeg?.character === 'transit' && nextSeg?.character === 'transit' && seg.character !== 'transit') {
      positionContext = '⚠️ SANDWICHED between HIGHWAY segments'
    }
    
    // Neighbor info
    const prevChar = prevSeg ? prevSeg.character.toUpperCase() : 'none'
    const nextChar = nextSeg ? nextSeg.character.toUpperCase() : 'none'
    
    return `
SEGMENT ${i}: ${seg.character.toUpperCase()} (${lengthMiles} mi)
├─ Distance: ${(seg.startDistance/1609.34).toFixed(2)} - ${(seg.endDistance/1609.34).toFixed(2)} miles
├─ Road Names: ${uniqueRoadNames.length > 0 ? uniqueRoadNames.join(', ') : 'unknown'}
├─ Road Classes: ${uniqueRoadClasses.length > 0 ? uniqueRoadClasses.join(', ') : seg.details?.roadClass || 'unknown'}
├─ Speed: avg ${avgSpeed} mph (range: ${minSpeed}-${maxSpeed})
├─ Density: ${seg.details?.densityCategory || 'unknown'} (${seg.details?.density || '?'}/sq mi)
├─ Curves: ${seg.curveCount || seg.details?.avgCurveDensity || 0} curves, max severity ${seg.maxSeverity || '?'}
├─ Neighbors: prev=${prevChar}, next=${nextChar}
${positionContext ? `└─ ${positionContext}` : '└─ (middle segment)'}`
  }).join('\n')

  return `
=== ROUTE ANALYSIS REQUEST ===

ROUTE OVERVIEW:
• Total Distance: ${totalDistanceMiles} miles
• Segments: ${segments.length}
• Current Breakdown: ${highwayPct}% Highway, ${techPct}% Technical, ${urbanPct}% Urban
• Start Coordinates: [${startCoord?.[0]?.toFixed(4)}, ${startCoord?.[1]?.toFixed(4)}]
• End Coordinates: [${endCoord?.[0]?.toFixed(4)}, ${endCoord?.[1]?.toFixed(4)}]

=== SEGMENTS TO ANALYZE ===
${segmentDetails}

=== INSTRUCTIONS ===
1. Analyze EVERY segment
2. Check if classifications are correct
3. Pay special attention to segments marked with ⚠️
4. Look for road name patterns (I-XX = Interstate, etc.)
5. Consider the full route context

Return your analysis as JSON.`
}

/**
 * Parse LLM response
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
    return parsed
    
  } catch (err) {
    console.error('Failed to parse LLM response:', err)
    return { decisions: [], overallAnalysis: 'Parse error' }
  }
}

/**
 * Apply LLM decisions to segments
 */
function applyDecisions(originalSegments, llmDecisions) {
  const changes = []
  const decisions = llmDecisions?.decisions || []
  
  // Create map of decisions by index
  const decisionMap = new Map()
  decisions.forEach(d => {
    if (typeof d.segmentIndex === 'number') {
      decisionMap.set(d.segmentIndex, d)
    }
  })
  
  // Apply decisions
  const enhanced = originalSegments.map((seg, i) => {
    const decision = decisionMap.get(i)
    
    if (!decision) {
      // No decision for this segment, keep as-is
      return seg
    }
    
    // Map classification names
    let newChar = seg.character
    const newClassLower = decision.newClassification?.toLowerCase()
    
    if (newClassLower === 'highway' || newClassLower === 'transit') {
      newChar = 'transit'
    } else if (newClassLower === 'technical') {
      newChar = 'technical'
    } else if (newClassLower === 'urban') {
      newChar = 'urban'
    }
    
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
