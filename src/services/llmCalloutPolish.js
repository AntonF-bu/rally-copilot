// ================================
// LLM Callout Polish v1.0
// 
// STAGE 2 of hybrid system
// Takes rule-based callouts and ENHANCES them
// CANNOT delete any callouts - only improve text
// 
// If LLM fails, rule-based callouts are used as-is
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

/**
 * Main export: Polish rule-based callouts with LLM
 * @param {Object} ruleBasedResult - Output from ruleBasedCalloutFilter
 * @param {Object} routeInfo - Route metadata
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} - Polished callouts (or original if LLM fails)
 */
export async function polishCalloutsWithLLM(ruleBasedResult, routeInfo, apiKey) {
  if (!apiKey) {
    console.log('⚠️ No API key - using rule-based callouts as-is')
    return ruleBasedResult
  }
  
  const { callouts, sequences, analysis } = ruleBasedResult
  
  if (!callouts?.length) {
    return ruleBasedResult
  }
  
  console.log('✨ LLM Callout Polish v1.0 starting...')
  console.log(`   Input callouts: ${callouts.length}`)
  
  const startTime = Date.now()
  
  try {
    const prompt = buildPolishPrompt(callouts, sequences, routeInfo)
    
    console.log(`📝 Polish prompt size: ${prompt.length} chars`)
    
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: getPolishSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    })
    
    if (!response.ok) {
      console.warn(`⚠️ LLM polish failed: ${response.status} - using rule-based`)
      return ruleBasedResult
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      console.warn('⚠️ Empty LLM response - using rule-based')
      return ruleBasedResult
    }
    
    // Parse and merge polish suggestions
    const polishedCallouts = parseAndMergePolish(content, callouts)
    
    const elapsed = Date.now() - startTime
    console.log(`✨ LLM polish complete in ${elapsed}ms`)
    console.log(`   Output callouts: ${polishedCallouts.length}`)
    
    // Verify we didn't lose any callouts
    if (polishedCallouts.length < callouts.length) {
      console.warn(`⚠️ LLM tried to delete callouts! Using rule-based.`)
      return ruleBasedResult
    }
    
    return {
      ...ruleBasedResult,
      callouts: polishedCallouts,
      llmPolished: true,
      analysis: ruleBasedResult.analysis
    }
    
  } catch (err) {
    console.warn('⚠️ LLM polish error:', err.message, '- using rule-based')
    return ruleBasedResult
  }
}

function getPolishSystemPrompt() {
  return `You are a rally co-driver assistant. Your job is to POLISH callout text, not filter.

You receive a list of pre-approved callouts. These MUST all be announced. You can:
1. IMPROVE the callout text to sound more natural
2. ADD context (e.g., "after straight", "tightens", "opens up")
3. SUGGEST better phrasing for sequences

You CANNOT:
1. Remove any callouts
2. Skip any curves
3. Change the mile markers
4. Reduce the number of callouts

RULES FOR TEXT:
- Keep it SHORT (2-5 words max)
- Technical zone: "Right 25", "Hard left", "Tightens"
- Highway zone: "Right 30", "Sweeping left", "CAUTION right 60"
- Use "CAUTION" for danger curves
- Use "HARD" for 70°+ turns
- For offramps: "HARD RIGHT - EXIT"

OUTPUT FORMAT:
Return JSON array with improved text for each callout:
[
  {"mile": 0.0, "text": "Hard left"},
  {"mile": 0.5, "text": "Right 45, tightens"},
  ...
]

You MUST return exactly the same number of entries as input.`
}

function buildPolishPrompt(callouts, sequences, routeInfo) {
  let prompt = `ROUTE: ${routeInfo?.totalMiles?.toFixed(1) || '?'} miles\n\n`
  
  prompt += `CALLOUTS TO POLISH (${callouts.length} total):\n`
  prompt += `Mile  | Zone      | Angle | Current Text\n`
  prompt += `------|-----------|-------|-------------\n`
  
  callouts.forEach(c => {
    const mile = c.mile.toFixed(1).padStart(5)
    const zone = (c.zone || 'transit').padEnd(9)
    const angle = c.angle ? `${c.angle}°`.padStart(5) : '  -  '
    prompt += `${mile} | ${zone} | ${angle} | ${c.text}\n`
  })
  
  if (sequences?.length > 0) {
    prompt += `\nSEQUENCES (curves close together - consider bundled callouts):\n`
    sequences.forEach(s => {
      prompt += `Mile ${s.startMile.toFixed(1)}: ${s.pattern} (${s.events.length} curves)\n`
    })
  }
  
  prompt += `\nPolish the callout text. Return JSON array with mile and improved text.`
  prompt += `\nIMPORTANT: Return EXACTLY ${callouts.length} entries - one for each input callout.`
  
  return prompt
}

function parseAndMergePolish(content, originalCallouts) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    } else {
      const arrayMatch = content.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
    }
    
    const polished = JSON.parse(jsonStr)
    
    if (!Array.isArray(polished)) {
      console.warn('⚠️ LLM response not an array')
      return originalCallouts
    }
    
    // Create a map of polished text by mile
    const polishMap = new Map()
    polished.forEach(p => {
      if (p.mile !== undefined && p.text) {
        polishMap.set(p.mile.toFixed(1), p.text)
      }
    })
    
    // Merge polish into original callouts
    return originalCallouts.map(callout => {
      const polishedText = polishMap.get(callout.mile.toFixed(1))
      if (polishedText) {
        return {
          ...callout,
          text: polishedText,
          originalText: callout.text
        }
      }
      return callout
    })
    
  } catch (err) {
    console.warn('⚠️ Failed to parse LLM polish response:', err.message)
    return originalCallouts
  }
}

/**
 * Combined function: Rule-based filter + LLM polish
 * This is the main entry point for the hybrid system
 */
export async function generateHybridCallouts(flowData, routeInfo, apiKey) {
  // Import rule-based filter dynamically to avoid circular deps
  const { filterEventsToCallouts } = await import('./ruleBasedCalloutFilter.js')
  
  // Stage 1: Rule-based filtering
  console.log('\n📋 STAGE 1: Rule-Based Filtering')
  const ruleBasedResult = filterEventsToCallouts(flowData.events, routeInfo)
  
  // Stage 2: LLM polish (optional)
  if (apiKey) {
    console.log('\n✨ STAGE 2: LLM Polish')
    return await polishCalloutsWithLLM(ruleBasedResult, routeInfo, apiKey)
  }
  
  return ruleBasedResult
}

export default { polishCalloutsWithLLM, generateHybridCallouts }
