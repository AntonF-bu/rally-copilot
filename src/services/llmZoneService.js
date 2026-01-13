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
  return `You are a driving route analyst. Classify road segments as: highway, technical, or urban.

RULES:
1. SANDWICH RULE: If a segment is between two highway segments → it's highway
2. Road names with "I-" or "Interstate" or "Turnpike" → highway  
3. motorway/trunk road class → highway
4. Gas stations, parking lots → urban
5. Winding backroads → technical

RESPOND WITH COMPACT JSON ONLY. Use this exact format:
{"d":[{"i":0,"n":"highway","r":"reason"},{"i":1,"n":"technical","r":"reason"}]}

Where:
- d = decisions array
- i = segment index
- n = new classification (highway/technical/urban)
- r = short reason (max 10 words)

ONLY include segments that need to CHANGE. Skip segments that are already correct.`
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
