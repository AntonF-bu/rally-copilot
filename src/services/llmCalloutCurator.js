// ================================
// LLM Callout Curator v2.0
// 
// Zone-aware intelligent callout curation
// - Technical: EVERY curve matters, short precise callouts with speed
// - Highway: All feelable bends + flow narration for sequences
// - Urban: Very selective, only major turns
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
  
  console.log('🧠 LLM Callout Curator v2.0 starting...')
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
        max_tokens: 4000  // Increased for technical sections with many callouts
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
  return `You are an expert rally co-driver. Your job is to decide what the driver NEEDS to hear for a safe and engaging drive.

THE DRIVING CONTEXT:
- Driver is enthusiastic, driving spirited on back roads
- Eyes must stay on the road - they rely 100% on your voice
- In technical sections: probably doing 60 in a 35 zone - EVERY curve matters
- On highways: cruising at 70-80mph, need to know what's coming
- In urban: slow, traffic-managed, only call major turns

=== ZONE STRATEGIES ===

🔴 TECHNICAL ZONES (winding back roads, 35-45mph zones driven at 50-65mph):
- Call EVERY curve 15°+ 
- Format: Include recommended speed - "Right 45mph 30°" or "Hard left 35mph"
- For tight sequences: Call each one, or use "Right-left-right, stay tight"
- NEVER skip a curve - driver is pushing hard and needs constant guidance
- Typical: 3-5 callouts per mile in technical sections

🔵 HIGHWAY/TRANSIT ZONES (interstates, highways at 65-80mph):
- Call ALL bends you can FEEL at speed (typically 15°+)
- For sequences within 0.5mi: Narrate the flow
  Example: "Left 25, rolls into soft right, then straight - open throttle"
- Call danger curves (45°+) with emphasis: "CAUTION right 60"
- Wake-up calls after 5+ miles straight: "Bend ahead" even for 15° curves
- On/off ramps are CRITICAL - always call these (often 90°+ turns)

🟢 URBAN ZONES (city streets, 25-35mph):
- Very selective - only call 70°+ turns
- Driver is managing traffic, lights, pedestrians
- Format: Just direction - "Hard right ahead"

=== ABSOLUTE RULES ===

⚠️ NEVER SKIP:
1. Any curve 70°+ (these are dangerous at any speed)
2. Highway offramp turns (usually 90°, critical speed change)
3. Zone transitions ("Technical section ahead")
4. First curve after 5+ miles of straight road

⚠️ SEQUENCE HANDLING:
When 3+ curves are within 0.3 miles:
- OPTION A: Call as sequence "Right-left-right" at start
- OPTION B: Call each one rapidly
- OPTION C: For highway, narrate: "Sweeping right, opens to left, hold the line"
Choose based on zone - technical needs each one, highway can narrate flow

=== CALLOUT FORMAT ===

TECHNICAL:
- "Right 45mph 25°" (direction, speed, angle)
- "Hard left, tightens" (for decreasing radius)
- "Double right" (two similar direction curves)

HIGHWAY:
- "Right 30" (direction, angle)
- "Sweeping left, long" (for gradual bends)
- "Right 40 into left 25" (for sequences)
- "CAUTION - hard right 70°" (for danger curves)

URBAN:
- "Hard right" 
- "Sharp left ahead"

TRANSITIONS:
- "Technical section ahead - stay sharp"
- "Highway opens up"

=== OUTPUT FORMAT ===

Return JSON:
{
  "analysis": "Brief route character summary",
  "callouts": [
    {
      "mile": 2.5,
      "type": "danger|significant|sweeper|sequence|transition|wake_up",
      "text": "The actual callout text",
      "reason": "Why this matters"
    }
  ]
}

EXPECTED CALLOUT COUNTS:
- Technical zone: 3-5 per mile (for 10mi technical = 30-50 callouts)
- Highway zone: 1-2 per 5 miles average, more in curvy sections
- Urban zone: 1-3 total unless very twisty

Remember: In technical zones, MORE IS BETTER. The driver is pushing hard and trusts you completely.`
}

function buildCurationPrompt(flowData, routeInfo) {
  const { events } = flowData
  const totalMiles = routeInfo.totalMiles || 0
  
  // Separate events by zone for zone-specific analysis
  const zoneEvents = {
    technical: events.filter(e => e.zoneType === 'technical'),
    transit: events.filter(e => e.zoneType === 'transit'),
    urban: events.filter(e => e.zoneType === 'urban')
  }
  
  // Build the prompt
  let prompt = `ROUTE OVERVIEW: ${totalMiles.toFixed(1)} miles total\n`
  prompt += `Events by zone: Technical=${zoneEvents.technical.length}, Highway=${zoneEvents.transit.length}, Urban=${zoneEvents.urban.length}\n\n`
  
  // Zone summary
  prompt += `=== ZONE BREAKDOWN ===\n`
  
  // Find zone boundaries
  const zoneBoundaries = []
  let currentZone = events[0]?.zoneType
  let zoneStart = 0
  events.forEach((e, i) => {
    if (e.zoneType !== currentZone) {
      zoneBoundaries.push({ zone: currentZone, start: zoneStart, end: e.apexMile })
      currentZone = e.zoneType
      zoneStart = e.apexMile
    }
  })
  if (events.length > 0) {
    zoneBoundaries.push({ zone: currentZone, start: zoneStart, end: totalMiles })
  }
  
  zoneBoundaries.forEach(z => {
    const length = (z.end - z.start).toFixed(1)
    const eventsInZone = events.filter(e => e.apexMile >= z.start && e.apexMile <= z.end)
    const density = eventsInZone.length / Math.max(0.1, z.end - z.start)
    prompt += `${z.zone.toUpperCase()}: Miles ${z.start.toFixed(1)}-${z.end.toFixed(1)} (${length}mi) - ${eventsInZone.length} events (${density.toFixed(1)}/mi)\n`
  })
  
  // Identify sequences (curves within 0.3mi)
  const sequences = []
  let currentSeq = []
  events.forEach((event, i) => {
    const prevEvent = events[i - 1]
    const gap = prevEvent ? event.apexMile - prevEvent.apexMile : 999
    
    if (gap <= 0.3) {
      if (currentSeq.length === 0 && prevEvent) currentSeq.push(prevEvent)
      currentSeq.push(event)
    } else {
      if (currentSeq.length >= 2) sequences.push([...currentSeq])
      currentSeq = []
    }
  })
  if (currentSeq.length >= 2) sequences.push(currentSeq)
  
  if (sequences.length > 0) {
    prompt += `\n=== SEQUENCES (handle as groups) ===\n`
    sequences.forEach((seq, i) => {
      const dirs = seq.map(e => `${e.direction[0]}${e.totalAngle}`).join(' → ')
      const zone = seq[0].zoneType
      prompt += `Mile ${seq[0].apexMile.toFixed(1)} [${zone}]: ${dirs}\n`
    })
  }
  
  // Identify long straights (wake-up opportunities)
  prompt += `\n=== STRAIGHT SECTIONS (5+ miles) ===\n`
  let lastMile = 0
  let straightCount = 0
  events.forEach(event => {
    const gap = event.apexMile - lastMile
    if (gap >= 5) {
      prompt += `Miles ${lastMile.toFixed(1)}-${event.apexMile.toFixed(1)}: ${gap.toFixed(1)}mi straight → NEXT CURVE: ${event.direction} ${event.totalAngle}° [${event.zoneType}]\n`
      straightCount++
    }
    lastMile = event.apexMile
  })
  if (straightCount === 0) prompt += `None - route is consistently engaging\n`
  
  // Danger curves (MUST call)
  const dangerCurves = events.filter(e => e.totalAngle >= 70 || e.type === 'danger')
  if (dangerCurves.length > 0) {
    prompt += `\n=== ⚠️ DANGER CURVES (MUST CALL ALL) ===\n`
    dangerCurves.forEach(e => {
      prompt += `Mile ${e.apexMile.toFixed(1)}: ${e.direction} ${e.totalAngle}° [${e.zoneType}] - ${e.shape}\n`
    })
  }
  
  // Technical zone detail (call everything)
  if (zoneEvents.technical.length > 0) {
    prompt += `\n=== 🔴 TECHNICAL ZONE EVENTS (call ALL 15°+) ===\n`
    prompt += `Mile  | Dir   | Angle | Shape    | Notes\n`
    prompt += `------|-------|-------|----------|-------\n`
    zoneEvents.technical.forEach(e => {
      const mile = e.apexMile.toFixed(1).padStart(5)
      const dir = e.direction.padEnd(5)
      const angle = `${e.totalAngle}°`.padStart(5)
      const shape = e.shape.padEnd(8)
      const notes = e.type === 'danger' ? '⚠️ DANGER' : ''
      prompt += `${mile} | ${dir} | ${angle} | ${shape} | ${notes}\n`
    })
  }
  
  // Highway zone detail
  if (zoneEvents.transit.length > 0) {
    prompt += `\n=== 🔵 HIGHWAY ZONE EVENTS ===\n`
    prompt += `Mile  | Dir   | Angle | Shape    | Type        | Notes\n`
    prompt += `------|-------|-------|----------|-------------|-------\n`
    zoneEvents.transit.forEach(e => {
      const mile = e.apexMile.toFixed(1).padStart(5)
      const dir = e.direction.padEnd(5)
      const angle = `${e.totalAngle}°`.padStart(5)
      const shape = e.shape.padEnd(8)
      const type = e.type.padEnd(11)
      let notes = ''
      if (e.totalAngle >= 70) notes = '⚠️ DANGER'
      else if (e.totalAngle >= 45) notes = '⚠️ CAUTION'
      else if (e.totalAngle >= 25) notes = 'feelable'
      prompt += `${mile} | ${dir} | ${angle} | ${shape} | ${type} | ${notes}\n`
    })
  }
  
  // Urban zone detail  
  if (zoneEvents.urban.length > 0) {
    prompt += `\n=== 🟢 URBAN ZONE EVENTS (only call 70°+) ===\n`
    zoneEvents.urban.forEach(e => {
      if (e.totalAngle >= 50) {
        prompt += `Mile ${e.apexMile.toFixed(1)}: ${e.direction} ${e.totalAngle}° - ${e.totalAngle >= 70 ? 'CALL THIS' : 'optional'}\n`
      }
    })
  }
  
  // Zone transitions
  prompt += `\n=== ZONE TRANSITIONS ===\n`
  zoneBoundaries.forEach((z, i) => {
    if (i > 0) {
      const prevZone = zoneBoundaries[i-1].zone
      prompt += `Mile ${z.start.toFixed(1)}: ${prevZone.toUpperCase()} → ${z.zone.toUpperCase()}\n`
    }
  })
  
  prompt += `\n=== GENERATE CALLOUTS ===
Based on the above data, generate callouts following zone strategies:
- Technical: Call EVERY curve 15°+ with speed recommendation
- Highway: Call bends you can feel, narrate sequences, emphasize danger
- Urban: Only 70°+
- NEVER skip danger curves or offramp turns

Return JSON with your callouts.`
  
  return prompt
}

function parseCurationResponse(content, flowData) {
  try {
    // Extract JSON from response
    let jsonStr = content
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    } else {
      const objectMatch = content.match(/\{[\s\S]*\}/)
      if (objectMatch) {
        jsonStr = objectMatch[0]
      }
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
        id: `llm-${callout.mile.toFixed(2)}`,
        mile: callout.mile,
        triggerMile: Math.max(callout.mile - 0.3, 0),
        triggerDistance: Math.max(callout.mile - 0.3, 0) * 1609.34,
        type: callout.type || 'info',
        text: callout.text,
        reason: callout.reason,
        position: nearestEvent?.position || null,
        zone: nearestEvent?.zoneType || 'transit',
        severity: callout.type === 'danger' ? 'critical' : 
                  callout.type === 'wake_up' ? 'medium' : 'high',
        angle: nearestEvent?.totalAngle || null,
        direction: nearestEvent?.direction || null
      }
    })
    
    return {
      analysis: parsed.analysis || '',
      callouts,
      raw: parsed
    }
    
  } catch (err) {
    console.warn('⚠️ Failed to parse LLM response:', err.message)
    console.log('Raw content:', content?.slice(0, 500))
    return { analysis: '', callouts: [], raw: null }
  }
}

export default { curateCalloutsWithLLM }
