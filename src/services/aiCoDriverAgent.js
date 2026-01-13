// ================================
// AI Co-Driver Agent v1.1
// 
// OPTIMIZED: 3 tool calls max to avoid rate limits
// 1. analyze_and_plan - audit + understand route
// 2. generate_callouts - create the callout sequence  
// 3. finalize - complete the briefing
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o-mini'  // Fast and capable

// ================================
// STREAMLINED TOOLS - Just 3
// ================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'analyze_and_plan',
      description: 'Analyze the route and create a plan. Call this FIRST.',
      parameters: {
        type: 'object',
        properties: {
          dataIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bendId: { type: 'string' },
                issue: { type: 'string', enum: ['false_positive', 'over_segmented', 'severity_wrong'] },
                action: { type: 'string', enum: ['skip', 'merge', 'adjust'] },
                mergeWith: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' }
              },
              required: ['bendId', 'issue', 'action']
            },
            description: 'Data issues found (optional)'
          },
          routeCharacter: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Brief route description' },
              rhythm: { type: 'string', description: 'Pattern like "easy → curves → easy → technical"' },
              difficulty: { type: 'string', enum: ['easy', 'moderate', 'challenging', 'technical'] },
              keyMoments: { type: 'array', items: { type: 'string' }, description: '3-5 key things to know' }
            },
            required: ['summary', 'rhythm', 'difficulty']
          },
          dangerZones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                startMile: { type: 'number' },
                endMile: { type: 'number' },
                reason: { type: 'string' }
              },
              required: ['startMile', 'endMile', 'reason']
            },
            description: 'Dangerous sections needing early warning'
          },
          highlights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bendId: { type: 'string' },
                reason: { type: 'string' }
              }
            },
            description: 'Notable/fun moments'
          }
        },
        required: ['routeCharacter']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_callouts',
      description: 'Generate 8-15 callouts MAX. More than 15 = failure. Be selective!',
      parameters: {
        type: 'object',
        properties: {
          callouts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                triggerMile: { type: 'number', description: 'Mile to trigger callout' },
                text: { type: 'string', description: 'What to say (natural language, 2-4 seconds to speak)' },
                type: { 
                  type: 'string', 
                  enum: ['wake_up', 'section_intro', 'section_end', 'highlight', 'advance_warning'],
                  description: 'Callout type'
                },
                priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
              },
              required: ['triggerMile', 'text', 'type', 'priority']
            },
            maxItems: 15,
            description: 'MAXIMUM 15 callouts. Target 8-12 for a typical route.'
          }
        },
        required: ['callouts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finalize',
      description: 'Complete the briefing. Call LAST.',
      parameters: {
        type: 'object',
        properties: {
          confidence: { type: 'number', description: 'Confidence 0-100' },
          notes: { type: 'string', description: 'Any notes' }
        },
        required: ['confidence']
      }
    }
  }
]

// ================================
// AGENT STATE
// ================================

function createAgentState() {
  return {
    analysis: null,
    callouts: [],
    dataIssues: [],
    dangerZones: [],
    highlights: [],
    routeSummary: null,
    toolCalls: [],
    reasoning: []
  }
}

// ================================
// TOOL EXECUTION
// ================================

function executeTool(toolName, args, routeContext, agentState) {
  switch (toolName) {
    case 'analyze_and_plan': {
      agentState.analysis = args
      agentState.dataIssues = args.dataIssues || []
      agentState.dangerZones = args.dangerZones || []
      agentState.highlights = args.highlights || []
      agentState.routeSummary = args.routeCharacter
      
      if (args.dataIssues?.length > 0) {
        agentState.reasoning.push(`Found ${args.dataIssues.length} data issues`)
      }
      if (args.dangerZones?.length > 0) {
        agentState.reasoning.push(`Identified ${args.dangerZones.length} danger zones`)
      }
      if (args.highlights?.length > 0) {
        agentState.reasoning.push(`Marked ${args.highlights.length} highlights`)
      }
      agentState.reasoning.push(`Route: ${args.routeCharacter?.summary}`)
      
      return { success: true, message: 'Analysis complete. Now call generate_callouts.' }
    }
    
    case 'generate_callouts': {
      let callouts = (args.callouts || []).map((c, i) => ({
        id: `callout-${i + 1}`,
        triggerMile: c.triggerMile,
        triggerDistance: c.triggerMile * 1609.34,
        text: c.text,
        shortText: c.text.length > 35 ? c.text.substring(0, 32) + '...' : c.text,
        type: c.type,
        priority: c.priority
      }))
      
      // Enforce limit - take only highest priority if too many
      if (callouts.length > 15) {
        console.warn(`⚠️ Agent generated ${callouts.length} callouts, limiting to 15`)
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        callouts = callouts
          .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
          .slice(0, 15)
      }
      
      agentState.callouts = callouts
      agentState.reasoning.push(`Generated ${callouts.length} callouts`)
      
      return { success: true, count: callouts.length, message: 'Callouts ready. Call finalize.' }
    }
    
    case 'finalize': {
      return { finalized: true, confidence: args.confidence, notes: args.notes }
    }
    
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ================================
// SYSTEM PROMPT - SPATIAL COVERAGE
// ================================

function getAgentSystemPrompt() {
  return `You are an expert rally co-driver AI creating a callout sequence for night highway driving.

CRITICAL RULE: SPATIAL COVERAGE
Your callouts must be SPREAD ACROSS THE ENTIRE ROUTE, not clustered.
- An 85-mile route needs callouts at miles 5, 15, 25, 35, 45, 55, 65, 75, etc.
- NOT 11 callouts all between miles 75-85!
- Think about the WHOLE drive, not just one section.

WHAT TO CALL OUT (8-15 total for 85 miles):
1. AFTER LONG STRAIGHTS (5+ miles): Wake-up call before curves return
2. SECTION TRANSITIONS: "Curves ahead" / "Clear ahead"
3. NOTABLE SWEEPERS: Only 15°+ that are genuinely significant  
4. DANGER ZONES: Unexpected difficulty spikes

COVERAGE STRATEGY:
- First 20 miles: 1-2 callouts
- Miles 20-40: 2-3 callouts
- Miles 40-60: 2-3 callouts  
- Miles 60-80: 2-3 callouts
- Final 5 miles: 1-2 callouts

WHAT TO SKIP:
- Gentle curves under 12°
- Clusters of minor bends (one "section" callout covers them)
- Anything in already-announced sections

CALLOUT TYPES:
- wake_up: After 5+ mile straight, before curves return
- section_intro: "Winding section ahead" (covers multiple bends)
- section_end: "Clear ahead" after active section
- highlight: Notable sweeper 15°+
- advance_warning: For genuine danger only

YOUR TASK:
1. analyze_and_plan - Find key moments ACROSS THE WHOLE ROUTE
2. generate_callouts - 8-15 callouts spread across all 85 miles
3. finalize - Complete

Remember: A driver needs guidance for the ENTIRE journey, not just the end.`
}

// ================================
// BUILD CONTEXT - Better spatial awareness
// ================================

function buildContext(routeContext) {
  const { highwayBends, zones, routeData } = routeContext
  const totalMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Zones with clear mile markers
  const zoneStr = zones.map((z, i) => {
    const startMi = (z.startDistance / 1609.34).toFixed(1)
    const endMi = (z.endDistance / 1609.34).toFixed(1)
    const len = ((z.endDistance - z.startDistance) / 1609.34).toFixed(1)
    return `[${startMi}-${endMi}mi] ${z.character} (${len}mi)`
  }).join('\n')
  
  // Group bends by mile ranges for better spatial understanding
  const mileRanges = {}
  highwayBends.forEach(b => {
    const mi = Math.floor((b.distanceFromStart || 0) / 1609.34 / 10) * 10 // Group by 10-mile chunks
    if (!mileRanges[mi]) mileRanges[mi] = []
    mileRanges[mi].push(b)
  })
  
  const rangeStr = Object.entries(mileRanges)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([startMi, bends]) => {
      const angles = bends.map(b => b.angle || 0).filter(a => a > 0)
      const maxAngle = angles.length > 0 ? Math.max(...angles) : 0
      const sweepers = bends.filter(b => b.isSweeper || b.angle >= 15).length
      return `Miles ${startMi}-${Number(startMi)+10}: ${bends.length} bends (max ${maxAngle}°, ${sweepers} notable)`
    }).join('\n')
  
  // Find significant gaps (boring stretches)
  const gaps = []
  let lastMile = 0
  const sortedBends = [...highwayBends].sort((a, b) => (a.distanceFromStart || 0) - (b.distanceFromStart || 0))
  sortedBends.forEach(b => {
    const mi = (b.distanceFromStart || 0) / 1609.34
    if (mi - lastMile > 5) {
      gaps.push({ start: lastMile, end: mi, length: mi - lastMile })
    }
    lastMile = mi
  })
  // Check gap to end of route
  const routeEndMile = parseFloat(totalMiles)
  if (routeEndMile - lastMile > 5) {
    gaps.push({ start: lastMile, end: routeEndMile, length: routeEndMile - lastMile })
  }
  
  const gapStr = gaps
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .map(g => `Miles ${g.start.toFixed(0)}-${g.end.toFixed(0)}: ${g.length.toFixed(0)}mi STRAIGHT`)
    .join('\n')
  
  // Key bends - show notable ones with positions
  const keyBends = highwayBends
    .filter(b => b.isSweeper || b.angle >= 12 || b.isSection)
    .slice(0, 30) // Limit to avoid token bloat
    .map(b => {
      const mi = ((b.distanceFromStart || 0) / 1609.34).toFixed(1)
      if (b.isSection) {
        return `@${mi}mi: SECTION ${b.bendCount} bends`
      }
      return `@${mi}mi: ${b.direction} ${b.angle}°${b.isSweeper ? ' SWEEPER' : ''}`
    }).join('\n')

  return `ROUTE OVERVIEW
Total: ${totalMiles} miles
Highway bends detected: ${highwayBends.length}

ZONE BREAKDOWN (start-end miles):
${zoneStr}

BEND DISTRIBUTION BY 10-MILE CHUNKS:
${rangeStr}

LONG STRAIGHT SECTIONS (boring, need wake-up after):
${gapStr || 'No gaps over 5 miles'}

KEY BENDS (notable curves):
${keyBends}

---
INSTRUCTIONS:
1. Create callouts SPREAD ACROSS the route, not clustered
2. After each long straight (5+ miles), add a wake-up callout
3. Before technical sections, add advance warning
4. Target 8-15 callouts covering the WHOLE route
5. Don't forget the first 50 miles!

Call: analyze_and_plan → generate_callouts → finalize`
}

// ================================
// MAIN RUNNER
// ================================

export async function runCoDriverAgent(routeContext, apiKey, onProgress) {
  if (!apiKey) throw new Error('No API key')
  
  const agentState = createAgentState()
  const messages = [
    { role: 'system', content: getAgentSystemPrompt() },
    { role: 'user', content: buildContext(routeContext) }
  ]
  
  console.log('🤖 AI Co-Driver Agent v1.1')
  const startTime = Date.now()
  let iterations = 0
  
  while (iterations < 6) {
    iterations++
    if (onProgress) onProgress({ iteration: iterations, state: agentState })
    
    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.2,
          max_tokens: 4000
        })
      })
      
      if (!response.ok) {
        if (response.status === 429) {
          console.warn('⚠️ Rate limited, waiting...')
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        throw new Error(`API ${response.status}`)
      }
      
      const data = await response.json()
      const msg = data.choices?.[0]?.message
      if (!msg) throw new Error('No response')
      
      messages.push(msg)
      
      if (msg.tool_calls?.length > 0) {
        const results = []
        
        for (const tc of msg.tool_calls) {
          const name = tc.function.name
          let args = {}
          try { args = JSON.parse(tc.function.arguments) } catch {}
          
          console.log(`   🔧 ${name}`)
          agentState.toolCalls.push({ tool: name, args })
          
          const result = executeTool(name, args, routeContext, agentState)
          results.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
          
          if (name === 'finalize') {
            console.log(`✅ Complete in ${Date.now() - startTime}ms`)
            return {
              success: true,
              ...agentState,
              iterations,
              elapsed: Date.now() - startTime,
              confidence: args.confidence,
              notes: args.notes
            }
          }
        }
        messages.push(...results)
      } else {
        messages.push({ role: 'user', content: 'Continue. Call the tools.' })
      }
    } catch (err) {
      console.warn(`⚠️ Error:`, err.message)
      if (iterations >= 5) throw err
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  
  // Return partial if we have callouts
  return {
    success: agentState.callouts.length > 0,
    ...agentState,
    iterations,
    elapsed: Date.now() - startTime,
    confidence: 50,
    notes: 'Partial - iteration limit'
  }
}

// ================================
// FORMAT OUTPUT
// ================================

export function formatAgentOutput(result) {
  if (!result) return { callouts: [], summary: null }
  
  const callouts = [...(result.callouts || [])].sort((a, b) => a.triggerDistance - b.triggerDistance)
  
  return {
    callouts: callouts.map(c => ({ ...c, llmAgent: true })),
    summary: result.routeSummary,
    highlights: result.highlights || [],
    dangerZones: result.dangerZones || [],
    dataIssues: result.dataIssues || [],
    reasoning: result.reasoning || [],
    confidence: result.confidence,
    notes: result.notes,
    stats: {
      iterations: result.iterations,
      elapsed: result.elapsed,
      toolCalls: result.toolCalls?.length || 0
    }
  }
}
