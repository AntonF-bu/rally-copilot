// ================================
// AI Co-Driver Agent v1.0
// 
// An intelligent agent that audits, analyzes, and generates
// callouts for highway driving. Uses tools to inspect and
// modify route data.
// ================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const MODEL = 'gpt-4o'  // Using full GPT-4o for agent reasoning

// ================================
// TOOL DEFINITIONS
// ================================

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'inspect_bend',
      description: 'Inspect a specific bend in detail. Use this to verify if a detected bend is real or a false positive.',
      parameters: {
        type: 'object',
        properties: {
          bendId: { type: 'string', description: 'The ID of the bend to inspect (e.g., "hwy-23")' }
        },
        required: ['bendId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_segment',
      description: 'Inspect a segment of the route by distance range. Use this to understand what happens between two points.',
      parameters: {
        type: 'object',
        properties: {
          startMile: { type: 'number', description: 'Start mile marker' },
          endMile: { type: 'number', description: 'End mile marker' }
        },
        required: ['startMile', 'endMile']
      }
    }
  },
  {
    type: 'function', 
    function: {
      name: 'merge_bends',
      description: 'Merge multiple nearby bends into a single logical unit. Use when detection over-segmented a continuous curve.',
      parameters: {
        type: 'object',
        properties: {
          bendIds: { type: 'array', items: { type: 'string' }, description: 'Array of bend IDs to merge' },
          newDescription: { type: 'string', description: 'Description for the merged bend (e.g., "sweeping right curve")' },
          newType: { type: 'string', enum: ['sweeper', 'section', 'sequence'], description: 'Type of merged bend' }
        },
        required: ['bendIds', 'newDescription', 'newType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'flag_bend',
      description: 'Flag a bend as problematic - false positive, misclassified, or needs attention.',
      parameters: {
        type: 'object',
        properties: {
          bendId: { type: 'string', description: 'The bend ID to flag' },
          issue: { type: 'string', enum: ['false_positive', 'misclassified', 'severity_wrong', 'missed_danger'], description: 'Type of issue' },
          reason: { type: 'string', description: 'Explanation of the issue' },
          suggestedFix: { type: 'string', description: 'What should be done about it' }
        },
        required: ['bendId', 'issue', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_highlight',
      description: 'Mark a bend or section as a route highlight - something notable, fun, or memorable.',
      parameters: {
        type: 'object',
        properties: {
          bendId: { type: 'string', description: 'The bend ID to highlight' },
          reason: { type: 'string', description: 'Why this is a highlight (e.g., "best sweeper on route", "scenic overlook")' }
        },
        required: ['bendId', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_danger_zone',
      description: 'Mark a section as potentially dangerous - requires early warning.',
      parameters: {
        type: 'object',
        properties: {
          startMile: { type: 'number', description: 'Start of danger zone' },
          endMile: { type: 'number', description: 'End of danger zone' },
          reason: { type: 'string', description: 'Why this is dangerous (e.g., "difficulty spike after long straight", "tightening radius")' },
          warningDistance: { type: 'number', description: 'How far in advance to warn (miles)' }
        },
        required: ['startMile', 'endMile', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_callout',
      description: 'Add a callout to the sequence. Use this to build the final callout list.',
      parameters: {
        type: 'object',
        properties: {
          triggerMile: { type: 'number', description: 'Mile marker where this callout should trigger' },
          calloutText: { type: 'string', description: 'What to say (natural, spoken language)' },
          type: { type: 'string', enum: ['advance_warning', 'bend_callout', 'section_intro', 'section_end', 'wake_up', 'highlight', 'info'], description: 'Type of callout' },
          relatedBendIds: { type: 'array', items: { type: 'string' }, description: 'Bend IDs this callout relates to' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'How important is this callout' }
        },
        required: ['triggerMile', 'calloutText', 'type', 'priority']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_silent_zone',
      description: 'Mark a section where no callouts are needed (straight road, nothing happening).',
      parameters: {
        type: 'object',
        properties: {
          startMile: { type: 'number', description: 'Start of silent zone' },
          endMile: { type: 'number', description: 'End of silent zone' },
          reason: { type: 'string', description: 'Why silence is appropriate here' }
        },
        required: ['startMile', 'endMile', 'reason']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_route_summary',
      description: 'Set the overall route summary and character assessment.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of the route character' },
          rhythm: { type: 'string', description: 'The rhythm pattern (e.g., "easy → technical → easy → highlight → easy")' },
          keyMoments: { type: 'array', items: { type: 'string' }, description: 'The 3-5 key moments a driver should know about' },
          overallDifficulty: { type: 'string', enum: ['easy', 'moderate', 'challenging', 'technical'], description: 'Overall difficulty assessment' }
        },
        required: ['summary', 'rhythm', 'keyMoments', 'overallDifficulty']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finalize_briefing',
      description: 'Call this when done to finalize and return the complete briefing.',
      parameters: {
        type: 'object',
        properties: {
          confidence: { type: 'number', description: 'How confident you are in this briefing (0-100)' },
          notes: { type: 'string', description: 'Any notes or caveats about this briefing' }
        },
        required: ['confidence']
      }
    }
  }
]

// ================================
// AGENT STATE - Accumulated during tool calls
// ================================

function createAgentState() {
  return {
    // Corrections and flags
    flaggedBends: [],
    mergedBends: [],
    highlights: [],
    dangerZones: [],
    
    // Generated output
    callouts: [],
    silentZones: [],
    
    // Summary
    routeSummary: null,
    
    // Meta
    toolCalls: [],
    reasoning: []
  }
}

// ================================
// TOOL EXECUTION
// ================================

function executeTool(toolName, args, routeContext, agentState) {
  const { highwayBends, zones, routeData } = routeContext
  
  switch (toolName) {
    case 'inspect_bend': {
      const bend = highwayBends.find(b => b.id === args.bendId)
      if (!bend) return { error: `Bend ${args.bendId} not found` }
      
      const mileMark = ((bend.distanceFromStart || 0) / 1609.34).toFixed(2)
      const zone = zones.find(z => 
        bend.distanceFromStart >= z.startDistance && 
        bend.distanceFromStart <= z.endDistance
      )
      
      return {
        id: bend.id,
        mile: parseFloat(mileMark),
        position: bend.position,
        type: bend.isSection ? 'section' : bend.isSSweep ? 's-sweep' : 'single',
        direction: bend.direction,
        angle: bend.angle,
        length: bend.length,
        bendCount: bend.bendCount,
        zone: zone?.character || 'unknown',
        isSweeper: bend.isSweeper,
        bends: bend.bends?.map(b => ({
          direction: b.direction,
          angle: b.angle
        }))
      }
    }
    
    case 'inspect_segment': {
      const startMeters = args.startMile * 1609.34
      const endMeters = args.endMile * 1609.34
      
      const bendsInSegment = highwayBends.filter(b => 
        b.distanceFromStart >= startMeters && 
        b.distanceFromStart <= endMeters
      )
      
      const zonesInSegment = zones.filter(z =>
        (z.startDistance <= endMeters && z.endDistance >= startMeters)
      )
      
      return {
        startMile: args.startMile,
        endMile: args.endMile,
        lengthMiles: (args.endMile - args.startMile).toFixed(2),
        bendCount: bendsInSegment.length,
        bends: bendsInSegment.map(b => ({
          id: b.id,
          mile: ((b.distanceFromStart || 0) / 1609.34).toFixed(2),
          type: b.isSection ? 'section' : b.isSSweep ? 's-sweep' : 'single',
          direction: b.direction,
          angle: b.angle
        })),
        zones: zonesInSegment.map(z => ({
          character: z.character,
          fromMile: (z.startDistance / 1609.34).toFixed(2),
          toMile: (z.endDistance / 1609.34).toFixed(2)
        }))
      }
    }
    
    case 'merge_bends': {
      const merge = {
        id: `merged-${agentState.mergedBends.length + 1}`,
        originalBendIds: args.bendIds,
        description: args.newDescription,
        type: args.newType
      }
      agentState.mergedBends.push(merge)
      agentState.reasoning.push(`Merged ${args.bendIds.length} bends into "${args.newDescription}"`)
      return { success: true, mergeId: merge.id }
    }
    
    case 'flag_bend': {
      const flag = {
        bendId: args.bendId,
        issue: args.issue,
        reason: args.reason,
        suggestedFix: args.suggestedFix
      }
      agentState.flaggedBends.push(flag)
      agentState.reasoning.push(`Flagged ${args.bendId}: ${args.issue} - ${args.reason}`)
      return { success: true, flagged: args.bendId }
    }
    
    case 'mark_highlight': {
      const highlight = {
        bendId: args.bendId,
        reason: args.reason
      }
      agentState.highlights.push(highlight)
      agentState.reasoning.push(`Highlighted ${args.bendId}: ${args.reason}`)
      return { success: true, highlighted: args.bendId }
    }
    
    case 'mark_danger_zone': {
      const danger = {
        startMile: args.startMile,
        endMile: args.endMile,
        reason: args.reason,
        warningDistance: args.warningDistance || 1
      }
      agentState.dangerZones.push(danger)
      agentState.reasoning.push(`Danger zone miles ${args.startMile}-${args.endMile}: ${args.reason}`)
      return { success: true, dangerZone: danger }
    }
    
    case 'add_callout': {
      const callout = {
        id: `callout-${agentState.callouts.length + 1}`,
        triggerMile: args.triggerMile,
        triggerDistance: args.triggerMile * 1609.34,
        text: args.calloutText,
        type: args.type,
        relatedBendIds: args.relatedBendIds || [],
        priority: args.priority
      }
      agentState.callouts.push(callout)
      return { success: true, calloutId: callout.id }
    }
    
    case 'mark_silent_zone': {
      const silent = {
        startMile: args.startMile,
        endMile: args.endMile,
        startDistance: args.startMile * 1609.34,
        endDistance: args.endMile * 1609.34,
        reason: args.reason
      }
      agentState.silentZones.push(silent)
      return { success: true }
    }
    
    case 'set_route_summary': {
      agentState.routeSummary = {
        summary: args.summary,
        rhythm: args.rhythm,
        keyMoments: args.keyMoments,
        overallDifficulty: args.overallDifficulty
      }
      return { success: true }
    }
    
    case 'finalize_briefing': {
      return { 
        finalized: true, 
        confidence: args.confidence,
        notes: args.notes,
        calloutCount: agentState.callouts.length,
        flagCount: agentState.flaggedBends.length,
        highlightCount: agentState.highlights.length
      }
    }
    
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

// ================================
// SYSTEM PROMPT
// ================================

function getAgentSystemPrompt() {
  return `You are an expert rally co-driver AI agent. Your job is to analyze route data and create a perfect audio briefing for a driver.

## THE SCENARIO
Someone is driving fast at night on a highway. They CANNOT look at their phone. Audio only.
Every curve that surprises them is dangerous. But constant chatter is annoying.
Your job: Keep them informed, safe, and engaged without overwhelming them.

## YOUR CAPABILITIES
You have tools to:
- INSPECT bend and segment data to understand what's there
- FLAG problematic detections (false positives, misclassifications)
- MERGE over-segmented bends into logical units
- MARK highlights and danger zones
- BUILD a callout sequence with proper timing
- SET the route summary and character

## YOUR PROCESS
1. AUDIT: Scan the data for errors. Are any bends false positives? Misclassified? Over-segmented?
2. ANALYZE: Understand the route's story. Where are difficulty spikes? Highlights? Long boring stretches?
3. PLAN: Decide what needs callouts and what can be silent
4. BUILD: Create the callout sequence with proper timing and language
5. FINALIZE: Set the summary and complete the briefing

## CALLOUT PRINCIPLES
- ADVANCE WARNING: Alert 0.5-1 mile before significant bends (more warning at higher speeds)
- GROUPING: "Three rights ahead" not "right... right... right..."
- WAKE-UP CALLS: After long straights, warn before difficulty increases
- NATURAL LANGUAGE: Sound like a helpful co-driver, not a robot
- STRATEGIC SILENCE: Don't narrate nothing, but DO say "clear ahead" after technical sections

## THINKING OUT LOUD
As you work, explain your reasoning. Why are you flagging something? Why merge these bends?
This helps debug and improve the system.

## OUTPUT QUALITY
- Every dangerous bend must have a callout (safety critical)
- Callouts should be speakable in 2-4 seconds
- Use timing phrases: "in half a mile", "coming up", "quarter mile"
- Match tone to moment: casual for easy stuff, crisp for technical

Start by inspecting the route data, then methodically build the briefing.`
}

// ================================
// BUILD INITIAL CONTEXT
// ================================

function buildInitialContext(routeContext) {
  const { highwayBends, zones, routeData } = routeContext
  const totalMiles = ((routeData?.distance || 0) / 1609.34).toFixed(1)
  
  // Build zone summary
  const zoneSummary = zones.map(z => {
    const lenMi = ((z.endDistance - z.startDistance) / 1609.34).toFixed(1)
    return `  ${z.character}: miles ${(z.startDistance/1609.34).toFixed(1)}-${(z.endDistance/1609.34).toFixed(1)} (${lenMi}mi)`
  }).join('\n')
  
  // Build bend overview
  const bendOverview = highwayBends.map(b => {
    const mile = ((b.distanceFromStart || 0) / 1609.34).toFixed(2)
    if (b.isSection) {
      return `  ${b.id}: SECTION @mile ${mile} - ${b.bendCount} bends, ${(b.length/1609.34).toFixed(2)}mi`
    } else if (b.isSSweep) {
      return `  ${b.id}: S-SWEEP @mile ${mile} - ${b.firstBend?.direction}→${b.secondBend?.direction}`
    } else {
      return `  ${b.id}: ${b.direction} ${b.angle}° @mile ${mile}${b.isSweeper ? ' (sweeper)' : ''}`
    }
  }).join('\n')
  
  // Find gaps (potential boring stretches)
  const gaps = []
  let lastMile = 0
  highwayBends.forEach(b => {
    const mile = (b.distanceFromStart || 0) / 1609.34
    if (mile - lastMile > 2) {
      gaps.push(`  ${lastMile.toFixed(1)}-${mile.toFixed(1)}: ${(mile - lastMile).toFixed(1)} miles with no bends`)
    }
    lastMile = mile
  })
  
  return `## ROUTE OVERVIEW
Total distance: ${totalMiles} miles
Detected bends: ${highwayBends.length}

## ZONES
${zoneSummary}

## DETECTED BENDS
${bendOverview}

## NOTABLE GAPS (potential boring stretches)
${gaps.length > 0 ? gaps.join('\n') : '  No significant gaps detected'}

## YOUR TASK
Analyze this route, audit the data, and build a complete callout briefing.
Use your tools to inspect details, flag issues, and construct the callout sequence.
Think step by step and show your reasoning.`
}

// ================================
// MAIN AGENT RUNNER
// ================================

export async function runCoDriverAgent(routeContext, apiKey, onProgress) {
  if (!apiKey) {
    throw new Error('No API key provided')
  }
  
  const agentState = createAgentState()
  const messages = [
    { role: 'system', content: getAgentSystemPrompt() },
    { role: 'user', content: buildInitialContext(routeContext) }
  ]
  
  console.log('🤖 AI Co-Driver Agent starting...')
  console.log(`   Route: ${((routeContext.routeData?.distance || 0) / 1609.34).toFixed(1)} miles`)
  console.log(`   Bends: ${routeContext.highwayBends?.length || 0}`)
  
  const startTime = Date.now()
  let iterations = 0
  const MAX_ITERATIONS = 20  // Safety limit
  
  while (iterations < MAX_ITERATIONS) {
    iterations++
    
    if (onProgress) {
      onProgress({ iteration: iterations, state: agentState })
    }
    
    // Call the API
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
        temperature: 0.3,
        max_tokens: 4000
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const assistantMessage = data.choices?.[0]?.message
    
    if (!assistantMessage) {
      throw new Error('No response from agent')
    }
    
    // Add assistant message to history
    messages.push(assistantMessage)
    
    // Check for tool calls
    if (assistantMessage.tool_calls?.length > 0) {
      const toolResults = []
      
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments)
        
        console.log(`   🔧 Tool: ${toolName}`, toolArgs)
        agentState.toolCalls.push({ tool: toolName, args: toolArgs })
        
        const result = executeTool(toolName, toolArgs, routeContext, agentState)
        
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        })
        
        // Check if agent is done
        if (toolName === 'finalize_briefing') {
          const elapsed = Date.now() - startTime
          console.log(`✅ AI Co-Driver Agent complete in ${elapsed}ms`)
          console.log(`   Iterations: ${iterations}`)
          console.log(`   Callouts: ${agentState.callouts.length}`)
          console.log(`   Flags: ${agentState.flaggedBends.length}`)
          console.log(`   Highlights: ${agentState.highlights.length}`)
          
          return {
            success: true,
            ...agentState,
            iterations,
            elapsed,
            confidence: toolArgs.confidence,
            notes: toolArgs.notes
          }
        }
      }
      
      // Add tool results to messages
      messages.push(...toolResults)
      
    } else {
      // No tool calls - agent is just responding with text
      // This might be reasoning or asking for clarification
      console.log(`   💭 Agent thinking:`, assistantMessage.content?.substring(0, 100))
      
      // If no tool calls and no finish, prompt to continue
      if (!assistantMessage.content?.includes('finalize')) {
        messages.push({
          role: 'user',
          content: 'Continue with your analysis. Use the tools to build the callout sequence, then call finalize_briefing when done.'
        })
      }
    }
  }
  
  // Max iterations reached
  console.warn('⚠️ Agent reached max iterations')
  return {
    success: false,
    ...agentState,
    iterations,
    error: 'Max iterations reached'
  }
}

// ================================
// HELPER: Convert agent output to display format
// ================================

export function formatAgentOutput(agentResult) {
  if (!agentResult?.success) {
    return {
      callouts: [],
      summary: 'Agent failed to complete',
      error: agentResult?.error
    }
  }
  
  // Sort callouts by trigger distance
  const sortedCallouts = [...agentResult.callouts].sort((a, b) => 
    a.triggerDistance - b.triggerDistance
  )
  
  // Convert to display format with positions
  const displayCallouts = sortedCallouts.map(c => ({
    id: c.id,
    position: null,  // Will need to interpolate from route
    triggerDistance: c.triggerDistance,
    triggerMile: c.triggerMile,
    text: c.text,
    shortText: c.text.length > 30 ? c.text.substring(0, 27) + '...' : c.text,
    type: c.type,
    priority: c.priority,
    llmAgent: true
  }))
  
  return {
    callouts: displayCallouts,
    summary: agentResult.routeSummary,
    highlights: agentResult.highlights,
    dangerZones: agentResult.dangerZones,
    flaggedBends: agentResult.flaggedBends,
    silentZones: agentResult.silentZones,
    reasoning: agentResult.reasoning,
    confidence: agentResult.confidence,
    notes: agentResult.notes,
    stats: {
      iterations: agentResult.iterations,
      elapsed: agentResult.elapsed,
      toolCalls: agentResult.toolCalls?.length || 0
    }
  }
}
