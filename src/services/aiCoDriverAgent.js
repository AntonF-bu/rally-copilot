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
// SYSTEM PROMPT - AGGRESSIVE FILTERING
// ================================

function getAgentSystemPrompt() {
  return `You are an expert rally co-driver AI. Your job is to create a MINIMAL but EFFECTIVE callout sequence.

CRITICAL: LESS IS MORE
- Target: 8-15 callouts for a typical 85-mile route
- You got 44 raw bends. Most are NOT worth calling out.
- A good co-driver is SELECTIVE, not comprehensive

WHAT TO CALL OUT:
1. DANGER ZONES: Where difficulty spikes unexpectedly (after long straight)
2. NOTABLE SWEEPERS: Only 15°+ that are genuinely fun or tricky
3. SECTION TRANSITIONS: "Curves ahead" before a winding stretch, "Clear" after
4. WAKE-UP CALLS: After 5+ miles of straight, warn before curves return

WHAT TO SKIP:
- Gentle curves under 12° (driver won't notice)
- Isolated minor bends (not worth interrupting silence)
- Curves in already-active sections (one "section" callout covers them)
- Anything the driver will naturally handle

EXAMPLE - 85 mile highway route:
Mile 0-3: Urban exit (skip - driver is alert)
Mile 3: "Clear highway ahead" (one callout)
Mile 3-45: Long straight (SILENCE - don't narrate nothing)
Mile 44: "Heads up, curves in one mile" (wake-up call)
Mile 45-48: Technical section (covered by intro callout)
Mile 48: "Clear ahead" (section end)
Mile 48-70: Rolling gentle curves (maybe 1-2 callouts for notable sweepers)
Mile 70: "Technical finish ahead" (final section warning)
TOTAL: ~8 callouts for 85 miles

YOUR TASK (3 tool calls):
1. analyze_and_plan - Understand route, identify the FEW key moments
2. generate_callouts - Create 8-15 callouts MAX, not 40+
3. finalize - Complete

CALLOUT TYPES:
- wake_up: Alert after long straight (IMPORTANT)
- section_intro: "Winding section next 2 miles"
- section_end: "Clear ahead"
- highlight: Notable sweeper worth calling (15°+)
- advance_warning: For genuine danger spots only

REMEMBER: Silence is golden. A callout every mile is ANNOYING.
Good co-drivers speak when it MATTERS, not constantly.

Be ruthless. 8-15 callouts max. Go.`
}

// ================================
// BUILD CONTEXT
// ================================

function buildContext(routeContext) {
  const { highwayBends, zones, routeData } = routeContext
  const totalMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Zones
  const zoneStr = zones.map(z => {
    const len = ((z.endDistance - z.startDistance) / 1609.34).toFixed(1)
    return `${z.character} mi${(z.startDistance/1609.34).toFixed(0)}-${(z.endDistance/1609.34).toFixed(0)} (${len}mi)`
  }).join(' | ')
  
  // Bends - compact
  const bendStr = highwayBends.map(b => {
    const mi = ((b.distanceFromStart || 0) / 1609.34).toFixed(1)
    if (b.isSection) {
      const dirs = b.bends?.map(x => x.direction === 'LEFT' ? 'L' : 'R').join('') || ''
      return `${b.id}@${mi}mi: SECTION[${dirs}] ${b.bendCount}bends`
    } else if (b.isSSweep) {
      return `${b.id}@${mi}mi: S-SWEEP`
    } else {
      const sw = b.isSweeper ? '!' : ''
      return `${b.id}@${mi}mi: ${b.direction}${b.angle}°${sw}`
    }
  }).join('\n')
  
  // Gaps
  const gaps = []
  let last = 0
  highwayBends.forEach(b => {
    const mi = (b.distanceFromStart || 0) / 1609.34
    if (mi - last > 3) gaps.push(`${last.toFixed(0)}-${mi.toFixed(0)}mi gap`)
    last = mi
  })

  return `ROUTE: ${totalMiles}mi total, ${highwayBends.length} bends

ZONES: ${zoneStr}

GAPS: ${gaps.length > 0 ? gaps.join(', ') : 'None >3mi'}

BENDS:
${bendStr}

Analyze and create callout briefing. Use tools: analyze_and_plan → generate_callouts → finalize`
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
