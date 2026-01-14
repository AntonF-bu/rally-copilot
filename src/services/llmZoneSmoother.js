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
  
  // Step 1: Ensure zones are continuous (no gaps)
  let result = ensureContinuousZones(zones)
  
  // Step 2: Absorb tiny technical zones (<0.8mi) into neighbors
  // These are usually false positives
  result = absorbTinyTechnicalZones(result)
  
  // Step 3: Aggressively merge transit sections between technical zones
  // Run multiple passes until no more changes
  let changed = true
  let passes = 0
  while (changed && passes < 3) {
    const before = result.length
    result = mergeTransitBetweenTechnical(result)
    changed = result.length !== before
    passes++
  }
  
  // Step 4: Merge remaining short zones
  result = mergeShortZones(result)
  
  // Step 5: Final pass - merge consecutive same-type zones
  const merged = []
  for (const zone of result) {
    if (merged.length > 0 && merged[merged.length - 1].character === zone.character) {
      // Extend previous zone
      merged[merged.length - 1].endMile = zone.endMile
      merged[merged.length - 1].end = zone.endMile * 1609.34
      merged[merged.length - 1].endDistance = zone.endMile * 1609.34
    } else {
      merged.push(zone)
    }
  }
  
  return merged.length > 0 ? merged : zones
}

/**
 * Absorb tiny technical zones (<0.8mi) into neighbors
 * These are usually noise/false positives
 */
function absorbTinyTechnicalZones(zones) {
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]
    const length = zone.endMile - zone.startMile
    
    // If it's a tiny technical zone, absorb it
    if (zone.character === 'technical' && length < 0.8) {
      if (result.length > 0) {
        // Extend previous zone
        console.log(`   Absorbing tiny technical zone (${length.toFixed(2)}mi) into previous ${result[result.length - 1].character}`)
        result[result.length - 1].endMile = zone.endMile
        result[result.length - 1].end = zone.endMile * 1609.34
        result[result.length - 1].endDistance = zone.endMile * 1609.34
      } else if (i + 1 < zones.length) {
        // Will be absorbed by next zone
        zones[i + 1].startMile = zone.startMile
        zones[i + 1].start = zone.startMile * 1609.34
        zones[i + 1].startDistance = zone.startMile * 1609.34
        console.log(`   Absorbing tiny technical zone (${length.toFixed(2)}mi) into next zone`)
      } else {
        result.push(zone)
      }
    } else {
      result.push(zone)
    }
  }
  
  return result
}

/**
 * Merge transit zones that are sandwiched between technical zones
 * These are just "breathers" in what's really continuous technical driving
 */
function mergeTransitBetweenTechnical(zones) {
  if (zones.length < 3) return zones
  
  const result = []
  let i = 0
  
  while (i < zones.length) {
    const current = { ...zones[i] }
    
    // Look for pattern: TECHNICAL → TRANSIT → TECHNICAL
    // Or even: TECHNICAL → TRANSIT → TRANSIT → TECHNICAL
    if (current.character === 'technical' && i + 1 < zones.length) {
      let j = i + 1
      let totalTransitLength = 0
      
      // Count consecutive transit zones
      while (j < zones.length && zones[j].character === 'transit') {
        totalTransitLength += zones[j].endMile - zones[j].startMile
        j++
      }
      
      // If there's a technical zone after the transit section(s)
      // and the total transit length is <= 3.5 miles, absorb it all
      if (j < zones.length && zones[j].character === 'technical' && totalTransitLength <= 3.5) {
        console.log(`   Absorbing ${(j - i - 1)} transit zone(s) (${totalTransitLength.toFixed(1)}mi total) between technical zones`)
        // Extend current technical zone to include all transit and the next technical
        current.endMile = zones[j].endMile
        current.end = zones[j].endMile * 1609.34
        current.endDistance = zones[j].endMile * 1609.34
        current.reason = (current.reason || '') + ' (merged transit gap)'
        i = j + 1 // Skip past the absorbed zones
        result.push(current)
        continue
      }
    }
    
    result.push(current)
    i++
  }
  
  return result
}

/**
 * Merge short zones into neighbors
 */
function mergeShortZones(zones) {
  const result = []
  let i = 0
  
  while (i < zones.length) {
    const current = { ...zones[i] }
    const currentLength = current.endMile - current.startMile
    
    // Look ahead for patterns to merge
    while (i + 1 < zones.length) {
      const next = zones[i + 1]
      const nextLength = next.endMile - next.startMile
      
      // Pattern: Very short zone (<0.5mi) - absorb into current
      if (nextLength < 0.5) {
        console.log(`   Absorbing very short ${next.character} zone (${nextLength.toFixed(2)}mi) into ${current.character}`)
        current.endMile = next.endMile
        current.end = next.endMile * 1609.34
        current.endDistance = next.endMile * 1609.34
        current.reason = (current.reason || '') + ' (absorbed short)'
        i++
        continue
      }
      
      break
    }
    
    // Pattern: Current zone is very short (<0.4mi) - extend previous zone instead
    if (currentLength < 0.4 && result.length > 0) {
      const prev = result[result.length - 1]
      prev.endMile = current.endMile
      prev.end = current.endMile * 1609.34
      prev.endDistance = current.endMile * 1609.34
      console.log(`   Extended previous ${prev.character} zone to absorb short ${current.character} zone`)
      i++
      continue
    }
    
    result.push(current)
    i++
  }
  
  return result
}

/**
 * Ensure zones are continuous with no gaps
 */
function ensureContinuousZones(zones) {
  if (zones.length <= 1) return zones
  
  const result = []
  
  for (let i = 0; i < zones.length; i++) {
    const zone = { ...zones[i] }
    
    // If there's a gap from previous zone, extend previous to cover it
    if (result.length > 0) {
      const prev = result[result.length - 1]
      if (zone.startMile > prev.endMile + 0.01) {
        const gap = zone.startMile - prev.endMile
        console.log(`   Closing gap of ${gap.toFixed(2)}mi between zones`)
        prev.endMile = zone.startMile
        prev.end = zone.startMile * 1609.34
        prev.endDistance = zone.startMile * 1609.34
      }
    }
    
    result.push(zone)
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
