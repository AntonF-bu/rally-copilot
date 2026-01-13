// ================================
// LLM Callout Curator v1.0
// 
// Takes rich road flow data and uses LLM to make
// intelligent decisions about what to call out
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'

/**
 * Main export: Use LLM to curate callouts from road flow data
 */
export async function curateCalloutsWithLLM(flowData, routeInfo, apiKey) {
  if (!apiKey) {
    console.warn('⚠️ No API key, skipping LLM curation')
    return null
  }
  
  console.log('🧠 LLM Callout Curator starting...')
  const startTime = Date.now()
  
  try {
    // Build the prompt with road flow data
    const prompt = buildCurationPrompt(flowData, routeInfo)
    
    console.log(`📝 Prompt size: ${prompt.length} chars`)
    
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
        temperature: 0.3,
        max_tokens: 2000
      })
    })
    
    if (!response.ok) {
      const errText = await response.text()
      console.warn(`⚠️ LLM curation failed: ${response.status}`, errText)
      return null
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      console.warn('⚠️ Empty LLM response')
      return null
    }
    
    // Parse LLM response
    const result = parseCurationResponse(content, flowData)
    
    const elapsed = Date.now() - startTime
    console.log(`🧠 LLM curation complete in ${elapsed}ms`)
    console.log(`   Callouts: ${result.callouts.length}`)
    
    return result
    
  } catch (err) {
    console.warn('⚠️ LLM curation error:', err.message)
    return null
  }
}

function getSystemPrompt() {
  return `You are an expert rally co-driver analyzing a route to decide what the driver needs to hear.

You receive detailed road flow data - continuous samples showing exactly how the road curves. Use this to understand the route's character and decide what callouts are needed.

ROLE: You're the co-driver. The driver can't look at the map. They need AUDIO warnings about what's ahead. You decide what's important enough to say out loud.

ZONE RULES:
- URBAN zones: Call curves 70°+ (these are significant in urban context). Skip minor turns under 70°.
- TRANSIT/HIGHWAY zones: This is your focus. Call out curves 18°+ that matter.
- TECHNICAL zones: Add a "Technical ahead" warning at the START of a technical zone, then call any curves 35°+ within it.

PRINCIPLES:
1. SAFETY FIRST - Always warn about truly dangerous curves (45°+ on highway, 70°+ in urban, 35°+ in technical)
2. CONTEXT MATTERS - A 20° curve after 5+ miles of straight IS surprising and needs a callout
3. SEQUENCES - If 2-3 curves are within 500m of each other, call them as a sequence
4. ZONE TRANSITIONS - Warn when entering a technical section

WHAT TO CALL OUT:
- URBAN: Any curve 70°+ 
- TRANSIT/HIGHWAY: Any curve 45°+ (danger), 18°+ after 3+ miles straight, 25°+ that breaks rhythm
- TECHNICAL: "Technical ahead" at entry, plus any curve 35°+
- Wake-up calls after 6+ miles of straight
- Sequences of close curves

WHAT TO SKIP:
- Urban curves under 70°
- Gentle curves under 15° in flowing highway sections
- Minor technical curves under 35°

CALLOUT TEXT FORMAT:
- Keep it SHORT: "Right 45" or "Hard left" or "Right then left"
- No need to say "degrees" - just the number
- For sequences: "Two rights" or "Left-right-left"
- For technical entry: "Technical ahead"

OUTPUT FORMAT:
Return a JSON object with:
{
  "analysis": "Brief description of route character",
  "callouts": [
    {
      "mile": 2.5,
      "type": "danger|sweeper|wake_up|section|sequence",
      "text": "Short callout (2-4 words)",
      "reason": "Why this matters"
    }
  ]
}

Include callouts from ALL zones - urban (pink), highway (blue), technical (cyan).`
}

function buildCurationPrompt(flowData, routeInfo) {
  const { events } = flowData
  const totalMiles = routeInfo.totalMiles || 0
  
  // Group events by rough sections for easier reading
  const sections = []
  let currentSection = { startMile: 0, events: [], character: 'unknown' }
  
  events.forEach((event, i) => {
    // Start new section if big gap or zone change
    const prevEvent = events[i - 1]
    const gap = prevEvent ? event.apexMile - prevEvent.apexMile : 0
    
    if (gap > 5 || (prevEvent && prevEvent.zoneType !== event.zoneType)) {
      if (currentSection.events.length > 0) {
        currentSection.endMile = prevEvent?.apexMile || currentSection.startMile
        currentSection.character = classifySection(currentSection.events)
        sections.push(currentSection)
      }
      currentSection = { startMile: event.apexMile, events: [], character: 'unknown' }
    }
    
    currentSection.events.push(event)
  })
  
  // Don't forget last section
  if (currentSection.events.length > 0) {
    currentSection.endMile = events[events.length - 1]?.apexMile || currentSection.startMile
    currentSection.character = classifySection(currentSection.events)
    sections.push(currentSection)
  }
  
  // Detect sequences (curves within 0.3 miles of each other)
  const sequences = []
  let currentSeq = []
  events.forEach((event, i) => {
    const prevEvent = events[i - 1]
    const gap = prevEvent ? event.apexMile - prevEvent.apexMile : 999
    
    if (gap <= 0.3) {
      if (currentSeq.length === 0 && prevEvent) {
        currentSeq.push(prevEvent)
      }
      currentSeq.push(event)
    } else {
      if (currentSeq.length >= 2) {
        sequences.push([...currentSeq])
      }
      currentSeq = []
    }
  })
  if (currentSeq.length >= 2) {
    sequences.push(currentSeq)
  }
  
  // Build the prompt
  let prompt = `ROUTE: ${totalMiles.toFixed(1)} miles\n\n`
  
  // Section overview
  prompt += `SECTIONS OVERVIEW:\n`
  sections.forEach((section, i) => {
    const length = (section.endMile - section.startMile).toFixed(1)
    const eventCount = section.events.length
    const maxAngle = Math.max(...section.events.map(e => e.totalAngle))
    prompt += `${i + 1}. Miles ${section.startMile.toFixed(1)}-${section.endMile.toFixed(1)} (${length}mi): ${section.character.toUpperCase()} - ${eventCount} events, max ${maxAngle}°\n`
  })
  
  // Sequences (close curves that should be called together)
  if (sequences.length > 0) {
    prompt += `\n⚠️ SEQUENCES (curves within 0.3mi - call these TOGETHER):\n`
    sequences.forEach((seq, i) => {
      const dirs = seq.map(e => e.direction[0]).join('-')  // "R-L-R"
      const angles = seq.map(e => e.totalAngle).join('°, ') + '°'
      const startMile = seq[0].apexMile.toFixed(1)
      prompt += `  ${i + 1}. Mile ${startMile}: ${dirs} sequence (${angles})\n`
    })
  }
  
  // Gaps (straight sections)
  prompt += `\nSTRAIGHT SECTIONS (gaps between events):\n`
  let lastMile = 0
  events.forEach(event => {
    const gap = event.apexMile - lastMile
    if (gap >= 3) {
      prompt += `  Miles ${lastMile.toFixed(1)}-${event.apexMile.toFixed(1)}: ${gap.toFixed(1)} miles straight\n`
    }
    lastMile = event.apexMile
  })
  if (totalMiles - lastMile >= 3) {
    prompt += `  Miles ${lastMile.toFixed(1)}-${totalMiles.toFixed(1)}: ${(totalMiles - lastMile).toFixed(1)} miles straight\n`
  }
  
  // All events with detail
  prompt += `\nALL ROAD EVENTS (${events.length} total):\n`
  prompt += `Mile  | Dir   | Angle | Shape    | Type        | Zone\n`
  prompt += `------|-------|-------|----------|-------------|--------\n`
  
  events.forEach(e => {
    const mile = e.apexMile.toFixed(1).padStart(5)
    const dir = e.direction.padEnd(5)
    const angle = `${e.totalAngle}°`.padStart(5)
    const shape = e.shape.padEnd(8)
    const type = e.type.padEnd(11)
    const zone = e.zoneType
    prompt += `${mile} | ${dir} | ${angle} | ${shape} | ${type} | ${zone}\n`
  })
  
  prompt += `\nBased on this data, decide what callouts the driver needs. Return JSON.`
  
  return prompt
}

function classifySection(events) {
  if (events.length === 0) return 'empty'
  
  const avgAngle = events.reduce((sum, e) => sum + e.totalAngle, 0) / events.length
  const maxAngle = Math.max(...events.map(e => e.totalAngle))
  const density = events.length / Math.max(1, events[events.length - 1].apexMile - events[0].apexMile)
  
  if (maxAngle >= 70 || avgAngle >= 40) return 'technical'
  if (density > 3 && avgAngle >= 25) return 'winding'
  if (avgAngle >= 20) return 'flowing'
  return 'gentle'
}

function parseCurationResponse(content, flowData) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }
    
    const parsed = JSON.parse(jsonStr)
    
    // Validate and enhance callouts with positions from flow data
    const callouts = (parsed.callouts || []).map(callout => {
      // Find nearest event to get accurate position and zone
      const nearestEvent = flowData.events.reduce((nearest, event) => {
        const dist = Math.abs(event.apexMile - callout.mile)
        const nearestDist = nearest ? Math.abs(nearest.apexMile - callout.mile) : Infinity
        return dist < nearestDist ? event : nearest
      }, null)
      
      return {
        id: `llm-${callout.mile.toFixed(1)}`,
        mile: callout.mile,
        triggerMile: Math.max(callout.mile - 0.3, 0), // Trigger slightly before
        triggerDistance: Math.max(callout.mile - 0.3, 0) * 1609.34,
        type: callout.type || 'info',
        text: callout.text,
        reason: callout.reason,
        position: nearestEvent?.position || null,
        zone: nearestEvent?.zoneType || 'transit', // Get zone from nearest event
        severity: callout.type === 'danger' ? 'critical' : 
                  callout.type === 'wake_up' ? 'medium' : 'high'
      }
    })
    
    return {
      analysis: parsed.analysis || '',
      callouts,
      raw: parsed
    }
    
  } catch (err) {
    console.warn('⚠️ Failed to parse LLM response:', err.message)
    console.log('Raw content:', content)
    return { analysis: '', callouts: [], raw: null }
  }
}
