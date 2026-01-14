// ================================
// LLM Zone Smoother v1.0
// 
// Uses LLM to clean up illogical zone sequences:
// - Short transit sections in the middle of technical areas
// - Short technical sections that should be absorbed
// - Ensures smooth, logical zone transitions
//
// Input: Raw zones from classifier
// Output: Smoothed zones with logical flow
// ================================

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

/**
 * Smooth zones using LLM intelligence
 */
export async function smoothZonesWithLLM(zones, routeContext = {}) {
  if (!zones || zones.length <= 2) {
    console.log('⚡ LLM Zone Smoother: Too few zones to smooth')
    return zones
  }
  
  console.log('⚡ LLM Zone Smoother v1.0 starting...')
  console.log(`   Input zones: ${zones.length}`)
  
  // Build zone summary for LLM
  const zoneSummary = zones.map((z, i) => {
    const len = (z.endMile - z.startMile).toFixed(2)
    return `${i + 1}. ${z.startMile.toFixed(1)}-${z.endMile.toFixed(1)}mi: ${z.character.toUpperCase()} (${len}mi)`
  }).join('\n')
  
  const prompt = buildSmoothingPrompt(zoneSummary, routeContext)
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const llmResponse = data.content[0].text
    
    // Parse LLM response
    const smoothedZones = parseLLMResponse(llmResponse, zones)
    
    console.log(`   Output zones: ${smoothedZones.length}`)
    console.log('⚡ LLM Zone Smoother complete')
    
    return smoothedZones
    
  } catch (error) {
    console.error('⚡ LLM Zone Smoother error:', error)
    console.log('   Falling back to rule-based smoothing')
    return ruleBasedSmoothing(zones)
  }
}

/**
 * Build the prompt for zone smoothing
 */
function buildSmoothingPrompt(zoneSummary, context) {
  return `You are a rally co-pilot route analyzer. Review these route zones and fix any illogical sequences.

ZONE TYPES:
- URBAN: City driving with intersections (usually at route start/end only)
- TRANSIT: Highway/cruising sections with gentle curves
- TECHNICAL: Winding backroads requiring active driving

CURRENT ZONES:
${zoneSummary}

RULES FOR SMOOTHING:
1. Short zones (<0.5mi) between two zones of the SAME type should be absorbed
   Example: TECHNICAL → TRANSIT (0.3mi) → TECHNICAL should become one TECHNICAL zone
   
2. Very short zones (<0.3mi) should generally be absorbed into neighbors unless they're genuinely different
   
3. URBAN should only appear at route start or end, never in the middle
   
4. The overall flow should make sense: you don't go from highway to technical and back to highway in 0.5 miles

5. When in doubt, prefer fewer, longer zones over many short zones

OUTPUT FORMAT:
Return ONLY a JSON array of smoothed zones. Each zone needs:
- startMile: number
- endMile: number  
- character: "urban" | "transit" | "technical"
- reason: brief explanation

Example output:
[
  {"startMile": 0, "endMile": 0.5, "character": "urban", "reason": "route start"},
  {"startMile": 0.5, "endMile": 9.5, "character": "transit", "reason": "highway section"},
  {"startMile": 9.5, "endMile": 14, "character": "technical", "reason": "winding backroads"}
]

Return ONLY the JSON array, no other text.`
}

/**
 * Parse LLM response into zone objects
 */
function parseLLMResponse(response, originalZones) {
  try {
    // Extract JSON from response
    let jsonStr = response.trim()
    
    // Handle markdown code blocks
    if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (match) jsonStr = match[1].trim()
    }
    
    const parsed = JSON.parse(jsonStr)
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Invalid response format')
    }
    
    // Convert to full zone format with all required properties
    return parsed.map(z => ({
      startMile: z.startMile,
      endMile: z.endMile,
      start: z.startMile * 1609.34,
      end: z.endMile * 1609.34,
      startDistance: z.startMile * 1609.34,
      endDistance: z.endMile * 1609.34,
      character: z.character,
      reason: z.reason || 'LLM smoothed'
    }))
    
  } catch (error) {
    console.error('Failed to parse LLM response:', error)
    return ruleBasedSmoothing(originalZones)
  }
}

/**
 * Fallback: Rule-based zone smoothing
 */
function ruleBasedSmoothing(zones) {
  if (zones.length <= 1) return zones
  
  console.log('   Using rule-based smoothing fallback')
  
  const result = []
  let i = 0
  
  while (i < zones.length) {
    const current = { ...zones[i] }
    
    // Look ahead for short zones that should be absorbed
    while (i + 1 < zones.length) {
      const next = zones[i + 1]
      const nextLength = next.endMile - next.startMile
      
      // If next zone is very short AND we have a zone after it of the same type as current
      if (nextLength < 0.5 && i + 2 < zones.length) {
        const afterNext = zones[i + 2]
        
        // Absorb pattern: SAME → SHORT_DIFFERENT → SAME
        if (afterNext.character === current.character) {
          console.log(`   Absorbing short ${next.character} zone (${nextLength.toFixed(2)}mi) between ${current.character} zones`)
          current.endMile = afterNext.endMile
          current.end = afterNext.end
          current.endDistance = afterNext.endDistance
          current.reason = (current.reason || '') + ' (merged)'
          i += 2 // Skip the absorbed zones
          continue
        }
      }
      
      // If next zone is very short (<0.3mi), absorb it
      if (nextLength < 0.3) {
        console.log(`   Absorbing very short ${next.character} zone (${nextLength.toFixed(2)}mi) into ${current.character}`)
        current.endMile = next.endMile
        current.end = next.end
        current.endDistance = next.endDistance
        current.reason = (current.reason || '') + ' (absorbed short)'
        i++
        continue
      }
      
      break
    }
    
    result.push(current)
    i++
  }
  
  return result
}

/**
 * Quick validation of zones
 */
export function validateZones(zones) {
  const issues = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const length = zone.endMile - zone.startMile
    
    // Check for very short zones
    if (length < 0.3) {
      issues.push(`Zone ${i + 1} (${zone.character}) is very short: ${length.toFixed(2)}mi`)
    }
    
    // Check for urban in the middle
    if (zone.character === 'urban' && i > 0 && i < zones.length - 1) {
      issues.push(`Zone ${i + 1}: Urban zone in middle of route`)
    }
    
    // Check for ping-pong pattern
    if (i >= 2) {
      const twoBack = zones[i - 2]
      const oneBack = zones[i - 1]
      if (twoBack.character === zone.character && oneBack.character !== zone.character) {
        const oneBackLength = oneBack.endMile - oneBack.startMile
        if (oneBackLength < 0.5) {
          issues.push(`Ping-pong pattern at zone ${i}: ${twoBack.character} → ${oneBack.character} (${oneBackLength.toFixed(2)}mi) → ${zone.character}`)
        }
      }
    }
  }
  
  return issues
}

export default {
  smoothZonesWithLLM,
  validateZones,
  ruleBasedSmoothing
}
