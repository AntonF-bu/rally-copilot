// ================================
// AI Callout Polish v1.0
// 
// Optional single API call to polish callout text
// System works without this - just uses templates
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

/**
 * Polish callout slots with AI-generated text
 * Single API call, graceful fallback
 */
export async function polishCalloutsWithAI(slots, routeContext, apiKey) {
  if (!apiKey || !slots?.length) {
    console.log('⏭️ Skipping AI polish (no API key or no slots)')
    return slots
  }
  
  console.log('✨ Polishing callouts with AI...')
  const startTime = Date.now()
  
  try {
    const prompt = buildPolishPrompt(slots, routeContext)
    
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
        temperature: 0.7,
        max_tokens: 1500
      })
    })
    
    if (!response.ok) {
      console.warn(`⚠️ AI polish failed: ${response.status}`)
      return slots
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      console.warn('⚠️ Empty AI response')
      return slots
    }
    
    // Parse AI response and merge with slots
    const polished = parsePolishResponse(content, slots)
    
    const elapsed = Date.now() - startTime
    console.log(`✨ AI polish complete in ${elapsed}ms`)
    
    return polished
    
  } catch (err) {
    console.warn('⚠️ AI polish error:', err.message)
    return slots // Return original slots on error
  }
}

function getPolishSystemPrompt() {
  return `You are a rally co-driver writing callout text for a night highway driver.

RULES:
- Each callout must be speakable in 2-4 seconds
- Sound natural, like a helpful human co-driver
- Be concise but informative
- Match tone to situation (casual for easy, crisp for danger)

STYLE EXAMPLES:
- Wake-up: "Heads up, curves coming back" / "Road gets interesting ahead"
- Section start: "Technical bit coming up" / "Stay sharp, winding section"
- Section end: "Opening up now" / "Clear stretch ahead"
- Sweeper: "Nice right sweeper ahead" / "Sweeping left, enjoy this one"
- Danger: "Watch it here, tightens up" / "Sharper than it looks, caution"

OUTPUT FORMAT:
Return a JSON array with polished text for each slot:
[
  { "id": 0, "text": "Your polished callout text" },
  { "id": 1, "text": "Another callout" }
]

Keep it brief. Be a good co-driver.`
}

function buildPolishPrompt(slots, routeContext) {
  const totalMiles = ((routeContext.routeData?.distance || 0) / 1609.34).toFixed(0)
  
  const slotDescriptions = slots.map((slot, i) => {
    const mile = slot.triggerMile.toFixed(1)
    const type = slot.type.replace('_', ' ')
    let context = ''
    let mustInclude = ''
    
    if (slot.context) {
      if (slot.context.gapLength) context = `after ${slot.context.gapLength.toFixed(0)}mi straight`
      if (slot.context.direction && slot.context.angle) {
        context = `${slot.context.direction} ${slot.context.angle}°`
        mustInclude = ` [MUST SAY ${slot.context.direction}]`
      }
      if (slot.context.sectionLength) context = `${slot.context.sectionLength.toFixed(1)}mi section`
    }
    
    return `${i}. Mile ${mile} - ${type}${context ? ` (${context})` : ''}${mustInclude}`
  }).join('\n')
  
  return `Route: ${totalMiles} miles highway

Polish these ${slots.length} callout slots.
CRITICAL: For sweeper callouts, you MUST use the direction (LEFT/RIGHT) provided. Do not change directions!

${slotDescriptions}

Return JSON array with polished text for each.`
}

function parsePolishResponse(content, originalSlots) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }
    
    const parsed = JSON.parse(jsonStr)
    
    // Merge AI text with original slots
    return originalSlots.map((slot, i) => {
      const aiEntry = parsed.find(p => p.id === i) || parsed[i]
      if (aiEntry?.text) {
        return {
          ...slot,
          aiText: aiEntry.text,
          aiPolished: true
        }
      }
      return slot
    })
    
  } catch (err) {
    console.warn('⚠️ Failed to parse AI response:', err.message)
    return originalSlots
  }
}
