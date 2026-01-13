// ================================
// LLM Highway Curator Service v1.0
// 
// Instead of enhancing each bend, the LLM looks at ALL data
// and decides what's actually worth calling out.
// 
// Input: 44 raw bends → Output: 5-8 curated callouts
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

/**
 * Main export: Curate highway bends into meaningful callouts
 * 
 * @param {Object} params
 * @param {Array} params.highwayBends - Raw bends from analyzeHighwayBends()
 * @param {Array} params.zones - Route zones for context
 * @param {Object} params.routeData - Route metadata
 * @param {string} apiKey - OpenAI API key
 * 
 * @returns {Object} { curatedCallouts, filteredIds, reasoning }
 */
export async function curateHighwayBends({ highwayBends, zones, routeData }, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ No API key - returning raw bends')
    return { 
      curatedCallouts: convertToBasicCallouts(highwayBends),
      filteredIds: [],
      reasoning: 'No API key available'
    }
  }

  if (!highwayBends?.length) {
    return { curatedCallouts: [], filteredIds: [], reasoning: 'No bends to curate' }
  }

  console.log('🎯 LLM Highway Curator - Starting...')
  console.log(`   Input: ${highwayBends.length} raw bends`)
  const startTime = Date.now()

  try {
    const prompt = buildCuratorPrompt({ highwayBends, zones, routeData })
    
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: getCuratorSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from LLM')
    }

    const result = parseResponse(content, highwayBends)
    
    const elapsed = Date.now() - startTime
    console.log(`✅ LLM Highway Curator complete in ${elapsed}ms`)
    console.log(`   Output: ${result.curatedCallouts.length} curated callouts`)
    console.log(`   Filtered: ${result.filteredIds.length} bends removed`)
    
    return result

  } catch (err) {
    console.error('❌ LLM Highway Curator error:', err)
    return {
      curatedCallouts: convertToBasicCallouts(highwayBends),
      filteredIds: [],
      reasoning: `Error: ${err.message}`
    }
  }
}

// ================================
// SYSTEM PROMPT - LLM as Editor
// ================================

function getCuratorSystemPrompt() {
  return `You are an expert rally co-driver editor. You receive RAW highway bend data and must CURATE it into a small number of meaningful callouts.

YOUR JOB IS NOT to label every bend. Your job is to be an EDITOR who decides what's worth calling out.

EDITING RULES:

1. MERGE nearby bends:
   - 3+ bends within 1 mile = ONE "Winding section" callout
   - Similar direction bends close together = ONE sweeping curve
   - Don't show 5 markers when 1 would do

2. FILTER aggressively:
   - Skip bends under 12° unless part of a notable sequence
   - Skip isolated minor bends that won't affect driving
   - Highway driving doesn't need constant callouts

3. PRIORITIZE what matters:
   - Notable sweepers (18°+) that are actually fun
   - Character changes (winding → straight, straight → winding)
   - The "highlight" curves of a stretch

4. CONSOLIDATE sections:
   - Multiple "active sections" close together = ONE technical stretch
   - Give distances: "Winding 1.2mi" not "6 bends"

TARGET OUTPUT: 5-10 callouts for a typical highway stretch, NOT 40+

CALLOUT TYPES:
- "section": Winding/technical stretch (merged from multiple bends)
- "sweeper": Notable individual curve worth calling out (18°+)
- "straight": Long straight stretch after curves (driver can relax)
- "skip": Don't show anything (most bends end up here)

RESPOND WITH JSON ONLY:
{
  "callouts": [
    {
      "id": "curated-1",
      "position": [lng, lat],
      "text": "Winding section 1.2mi",
      "shortText": "Winding 1.2mi",
      "type": "section",
      "mergedFrom": ["hwy-1", "hwy-2", "hwy-3"],
      "distanceFromStart": 12500
    },
    {
      "id": "curated-2", 
      "position": [lng, lat],
      "text": "Sweeper right 22°",
      "shortText": "Right 22°",
      "type": "sweeper",
      "mergedFrom": ["hwy-15"],
      "distanceFromStart": 25000
    }
  ],
  "filteredIds": ["hwy-4", "hwy-5", "hwy-6"],
  "reasoning": "Merged 12 gentle bends into 2 section callouts. Filtered 8 minor bends under 10°. Featured 1 notable 22° sweeper."
}`
}

// ================================
// PROMPT BUILDER
// ================================

function buildCuratorPrompt({ highwayBends, zones, routeData }) {
  const totalMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Get highway zones for context
  const highwayZones = zones?.filter(z => z.character === 'transit') || []
  const highwayMiles = highwayZones.reduce((sum, z) => {
    return sum + (z.endDistance - z.startDistance) / 1609.34
  }, 0).toFixed(1)

  // Build comprehensive bend data
  const bendData = highwayBends.map((b, i) => {
    const distMi = ((b.distanceFromStart || 0) / 1609.34).toFixed(2)
    const pos = b.position ? `[${b.position[0].toFixed(5)}, ${b.position[1].toFixed(5)}]` : 'null'
    
    if (b.isSection) {
      const leftCount = b.bends?.filter(x => x.direction === 'LEFT').length || 0
      const rightCount = b.bends?.filter(x => x.direction === 'RIGHT').length || 0
      const lengthMi = ((b.length || 0) / 1609.34).toFixed(2)
      return `${b.id}: SECTION @${distMi}mi pos=${pos} | ${b.bendCount} bends (${leftCount}L/${rightCount}R) | ${lengthMi}mi long | angles: ${b.bends?.map(x => x.angle).join(',') || 'n/a'}`
    } else if (b.isSSweep) {
      return `${b.id}: S-SWEEP @${distMi}mi pos=${pos} | ${b.firstBend?.direction}${b.firstBend?.angle}° → ${b.secondBend?.direction}${b.secondBend?.angle}°`
    } else {
      return `${b.id}: BEND @${distMi}mi pos=${pos} | ${b.direction} ${b.angle}° | ${b.isSweeper ? 'SWEEPER' : 'minor'}`
    }
  }).join('\n')

  // Calculate gaps between bends for context
  const gaps = []
  for (let i = 1; i < highwayBends.length; i++) {
    const gap = (highwayBends[i].distanceFromStart - highwayBends[i-1].distanceFromStart) / 1609.34
    if (gap > 1) {
      gaps.push(`${gap.toFixed(1)}mi gap after ${highwayBends[i-1].id}`)
    }
  }

  return `ROUTE CONTEXT:
- Total: ${totalMiles} miles
- Highway sections: ${highwayMiles} miles
- Raw bends detected: ${highwayBends.length}

NOTABLE GAPS (straight sections):
${gaps.length > 0 ? gaps.join('\n') : 'No major gaps detected'}

RAW BEND DATA:
${bendData}

YOUR TASK:
1. Look at ALL this data holistically
2. Decide what's worth calling out (aim for 5-10 callouts, not ${highwayBends.length})
3. Merge nearby bends into section callouts
4. Filter out noise (minor bends that don't matter)
5. Feature highlights (notable sweepers, character changes)

Return JSON with callouts array, filteredIds array, and reasoning string.`
}

// ================================
// RESPONSE PARSER
// ================================

function parseResponse(content, originalBends) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!objectMatch) {
      throw new Error('No JSON object found')
    }

    const parsed = JSON.parse(objectMatch[0])
    
    // Validate and enrich callouts
    const callouts = (parsed.callouts || []).map((c, i) => {
      // Find position from merged bends if not provided
      let position = c.position
      if (!position && c.mergedFrom?.length > 0) {
        const firstBend = originalBends.find(b => b.id === c.mergedFrom[0])
        position = firstBend?.position
      }
      
      return {
        id: c.id || `curated-${i}`,
        position: position,
        text: c.text || c.shortText || 'Section',
        shortText: c.shortText || c.text || 'Section',
        type: c.type || 'section',
        mergedFrom: c.mergedFrom || [],
        distanceFromStart: c.distanceFromStart || 0,
        llmCurated: true
      }
    }).filter(c => c.position) // Only keep callouts with valid positions

    return {
      curatedCallouts: callouts,
      filteredIds: parsed.filteredIds || [],
      reasoning: parsed.reasoning || 'No reasoning provided'
    }

  } catch (err) {
    console.error('Parse error:', err)
    return {
      curatedCallouts: convertToBasicCallouts(originalBends),
      filteredIds: [],
      reasoning: `Parse error: ${err.message}`
    }
  }
}

// ================================
// FALLBACK: Convert raw bends to basic callouts
// ================================

function convertToBasicCallouts(bends) {
  if (!bends?.length) return []
  
  // Simple fallback: only show sections and notable sweepers
  return bends
    .filter(b => b.isSection || (b.angle && b.angle >= 15))
    .slice(0, 10) // Limit to 10
    .map((b, i) => ({
      id: `basic-${i}`,
      position: b.position,
      text: b.isSection 
        ? `Section ${b.bendCount} bends` 
        : `${b.direction} ${b.angle}°`,
      shortText: b.isSection 
        ? `${b.bendCount} bends` 
        : `${b.direction?.[0]}${b.angle}°`,
      type: b.isSection ? 'section' : 'sweeper',
      mergedFrom: [b.id],
      distanceFromStart: b.distanceFromStart || 0,
      llmCurated: false
    }))
}

// ================================
// HELPER: Check if curation is needed
// ================================

export function shouldCurateHighway(highwayBends) {
  // Curate if we have more than 5 bends (otherwise not much to curate)
  return highwayBends?.length > 5
}
