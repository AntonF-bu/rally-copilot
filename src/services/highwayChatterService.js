// ================================
// Highway Chatter Service v3.0
// Smart chunking for long routes
// 
// Key improvements:
// - Chunks long routes into smaller batches
// - Parallel API calls for each chunk
// - Better error handling per chunk
// - Reduced token usage per request
// ================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

// Configuration
const CONFIG = {
  maxTriggersPerChunk: 10,     // Max triggers per API call
  minMilesBetweenChatter: 2,   // Minimum spacing between chatters
  targetChatterPerHour: 20,    // ~1 every 3 minutes
  maxTotalChatters: 40,        // Cap for very long routes
}

/**
 * Generate chatter timeline for a route
 * 
 * @param {Object} params
 * @param {Array} params.zones - Route zones
 * @param {Array} params.callouts - Curated callouts (for context)
 * @param {Object} params.routeData - Route metadata
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Object} { chatterTimeline, method }
 */
export async function generateChatterTimeline({ zones, callouts, routeData }, onProgress) {
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  const openaiKey = import.meta.env.VITE_OPENAI_API_KEY
  
  console.log('🎙️ Highway Chatter Service v3.0 starting...')
  
  // Find highway zones
  const highwayZones = zones?.filter(z => z.character === 'transit') || []
  if (highwayZones.length === 0) {
    console.log('📍 No highway zones found')
    return { chatterTimeline: [], method: 'skipped' }
  }
  
  console.log(`📍 Found ${highwayZones.length} highway zone(s)`)
  
  // Calculate total highway miles and target chatter count
  const totalHighwayMiles = highwayZones.reduce((sum, z) => {
    const startMile = z.startDistance / 1609.34
    const endMile = z.endDistance / 1609.34
    return sum + (endMile - startMile)
  }, 0)
  
  const estimatedMinutes = totalHighwayMiles / 1.1 // ~66 mph average
  const targetCount = Math.min(
    CONFIG.maxTotalChatters,
    Math.max(5, Math.round(estimatedMinutes / 3)) // ~1 per 3 minutes
  )
  
  console.log(`📊 Route: ${totalHighwayMiles.toFixed(1)} highway miles, targeting ${targetCount} chatters`)
  
  // Generate trigger points spread across highway sections
  const triggers = generateTriggerPoints(highwayZones, targetCount, callouts)
  console.log(`🎯 Generated ${triggers.length} trigger points`)
  
  if (triggers.length === 0) {
    return { chatterTimeline: [], method: 'no_triggers' }
  }
  
  // Chunk triggers for API calls
  const chunks = chunkTriggers(triggers, CONFIG.maxTriggersPerChunk)
  console.log(`📦 Split into ${chunks.length} chunk(s)`)
  
  onProgress?.(5)
  
  // Try Claude first, fall back to OpenAI
  let result
  
  if (anthropicKey) {
    result = await generateWithClaude(chunks, routeData, anthropicKey, onProgress)
  }
  
  if (!result?.length && openaiKey) {
    console.log('🔄 Claude unavailable, using OpenAI...')
    result = await generateWithOpenAI(chunks, routeData, openaiKey, onProgress)
  }
  
  if (!result?.length) {
    console.warn('⚠️ Both APIs failed, using fallback chatters')
    result = generateFallbackChatters(triggers)
  }
  
  onProgress?.(100)
  
  console.log(`🎙️ Generated ${result.length} chatter items`)
  
  return { 
    chatterTimeline: result, 
    method: anthropicKey ? 'claude_chunked' : 'openai_chunked'
  }
}

/**
 * Generate trigger points spread across highway sections
 */
function generateTriggerPoints(highwayZones, targetCount, callouts) {
  const triggers = []
  
  // Get callout miles for gap detection
  const calloutMiles = new Set(
    (callouts || [])
      .filter(c => c.zone === 'transit' || c.zone === 'highway')
      .map(c => Math.round((c.triggerMile || c.mile || 0) * 10) / 10)
  )
  
  for (const zone of highwayZones) {
    const startMile = zone.startDistance / 1609.34
    const endMile = zone.endDistance / 1609.34
    const zoneMiles = endMile - startMile
    
    // Calculate triggers for this zone proportionally
    const totalHighwayMiles = highwayZones.reduce((sum, z) => 
      sum + (z.endDistance - z.startDistance) / 1609.34, 0)
    const zoneShare = zoneMiles / totalHighwayMiles
    const zoneTargetCount = Math.max(2, Math.round(targetCount * zoneShare))
    
    // Spread triggers evenly with some randomness
    const spacing = zoneMiles / (zoneTargetCount + 1)
    
    for (let i = 1; i <= zoneTargetCount; i++) {
      const baseMile = startMile + (spacing * i)
      // Add slight randomness (±20% of spacing)
      const jitter = (Math.random() - 0.5) * spacing * 0.4
      const mile = Math.max(startMile + 0.5, Math.min(endMile - 0.5, baseMile + jitter))
      
      // Check if there's a callout nearby
      const nearCallout = [...calloutMiles].some(cm => Math.abs(cm - mile) < 0.5)
      
      // Determine context
      let context = 'cruise'
      const prevCallout = findNearestCallout(callouts, mile, -5) // Look back 5 miles
      const nextCallout = findNearestCallout(callouts, mile, 5)   // Look ahead 5 miles
      
      if (!prevCallout && !nextCallout) {
        context = 'long_straight'
      } else if (nextCallout && nextCallout.type === 'danger') {
        context = 'before_action'
      } else if (prevCallout && prevCallout.type === 'danger') {
        context = 'after_action'
      }
      
      triggers.push({
        id: triggers.length,
        mile: Math.round(mile * 10) / 10,
        context,
        nearCallout,
        zoneStart: Math.round(startMile * 10) / 10,
        zoneEnd: Math.round(endMile * 10) / 10,
      })
    }
  }
  
  // Sort by mile and enforce minimum spacing
  triggers.sort((a, b) => a.mile - b.mile)
  
  const filtered = []
  let lastMile = -CONFIG.minMilesBetweenChatter
  
  for (const t of triggers) {
    if (t.mile - lastMile >= CONFIG.minMilesBetweenChatter) {
      filtered.push(t)
      lastMile = t.mile
    }
  }
  
  return filtered.slice(0, CONFIG.maxTotalChatters)
}

/**
 * Find nearest callout within range
 */
function findNearestCallout(callouts, mile, range) {
  if (!callouts?.length) return null
  
  const direction = range > 0 ? 1 : -1
  const maxDist = Math.abs(range)
  
  let nearest = null
  let nearestDist = maxDist + 1
  
  for (const c of callouts) {
    const cMile = c.triggerMile || c.mile || 0
    const dist = (cMile - mile) * direction
    
    if (dist > 0 && dist < nearestDist) {
      nearest = c
      nearestDist = dist
    }
  }
  
  return nearest
}

/**
 * Split triggers into chunks
 */
function chunkTriggers(triggers, maxPerChunk) {
  const chunks = []
  for (let i = 0; i < triggers.length; i += maxPerChunk) {
    chunks.push(triggers.slice(i, i + maxPerChunk))
  }
  return chunks
}

/**
 * Generate chatters using Claude (chunked, parallel)
 */
async function generateWithClaude(chunks, routeData, apiKey, onProgress) {
  console.log(`📝 Using Claude for ${chunks.length} chunk(s)`)
  
  const startProgress = 10
  const endProgress = 90
  const progressPerChunk = (endProgress - startProgress) / chunks.length
  
  // Process chunks in parallel (max 3 concurrent)
  const results = []
  const batchSize = 3
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    const batchResults = await Promise.all(
      batch.map((chunk, idx) => 
        generateChunkWithClaude(chunk, routeData, apiKey, i + idx)
      )
    )
    
    results.push(...batchResults.flat())
    
    const progress = startProgress + ((i + batch.length) * progressPerChunk)
    onProgress?.(Math.round(progress))
  }
  
  return results
}

/**
 * Generate a single chunk with Claude
 */
async function generateChunkWithClaude(triggers, routeData, apiKey, chunkIndex) {
  const prompt = buildClaudePrompt(triggers, routeData, chunkIndex)
  
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000, // Reduced for smaller chunks
        messages: [{ role: 'user', content: prompt }]
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.content?.[0]?.text
    
    if (!content) {
      throw new Error('Empty response')
    }
    
    return parseClaudeResponse(content, triggers)
    
  } catch (err) {
    console.warn(`⚠️ Claude chunk ${chunkIndex} failed:`, err.message)
    return [] // Return empty, will aggregate what we have
  }
}

/**
 * Build prompt for Claude (optimized for smaller chunks)
 */
function buildClaudePrompt(triggers, routeData, chunkIndex) {
  const triggerList = triggers.map(t => 
    `${t.id}: Mile ${t.mile} (${t.context})`
  ).join('\n')
  
  return `Generate witty Jeremy Clarkson-style co-driver commentary for a highway drive.

ROUTE: ${Math.round((routeData?.distance || 0) / 1609.34)} miles total

TRIGGER POINTS (chunk ${chunkIndex + 1}):
${triggerList}

CONTEXT TYPES:
- cruise: Normal highway driving
- long_straight: After 5+ miles with no events
- before_action: Approaching curves/events
- after_action: Just passed challenging section

OUTPUT FORMAT (JSON only, no markdown):
{
  "chatter": [
    {
      "id": 0,
      "variants": {
        "slow": ["text1", "text2"],
        "cruise": ["text1", "text2"],
        "fast": ["text1", "text2"]
      }
    }
  ]
}

STYLE:
- Dry British wit, sardonic observations
- Reference the actual driving situation
- Keep each line under 15 words
- 2 variants per speed category
- Be entertaining but not distracting

Respond with ONLY the JSON, no explanation.`
}

/**
 * Parse Claude's response
 */
function parseClaudeResponse(content, triggers) {
  try {
    // Extract JSON from response
    let jsonStr = content
    
    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    const parsed = JSON.parse(jsonStr.trim())
    const chatters = parsed.chatter || parsed.chatters || parsed
    
    if (!Array.isArray(chatters)) {
      throw new Error('Response is not an array')
    }
    
    // Map back to trigger data
    return chatters.map((c, idx) => {
      const trigger = triggers.find(t => t.id === c.id) || triggers[idx]
      return {
        id: `chatter-${trigger?.id || idx}`,
        triggerMile: trigger?.mile || 0,
        triggerDistance: (trigger?.mile || 0) * 1609.34,
        context: trigger?.context || 'cruise',
        variants: c.variants || {
          slow: [c.text || c.slow?.[0] || 'Cruising along...'],
          cruise: [c.text || c.cruise?.[0] || 'Cruising along...'],
          fast: [c.text || c.fast?.[0] || 'Making good time...']
        },
        text: c.variants?.cruise?.[0] || c.text || 'Cruising along...'
      }
    })
    
  } catch (err) {
    console.warn('⚠️ Claude response parse error:', err.message)
    return []
  }
}

/**
 * Generate chatters using OpenAI (chunked, parallel)
 */
async function generateWithOpenAI(chunks, routeData, apiKey, onProgress) {
  console.log(`📝 Using OpenAI for ${chunks.length} chunk(s)`)
  
  const startProgress = 10
  const endProgress = 90
  const progressPerChunk = (endProgress - startProgress) / chunks.length
  
  const results = []
  
  // Process chunks in parallel (max 4 concurrent for OpenAI)
  const batchSize = 4
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    const batchResults = await Promise.all(
      batch.map((chunk, idx) => 
        generateChunkWithOpenAI(chunk, routeData, apiKey, i + idx)
      )
    )
    
    results.push(...batchResults.flat())
    
    const progress = startProgress + ((i + batch.length) * progressPerChunk)
    onProgress?.(Math.round(progress))
  }
  
  return results
}

/**
 * Generate a single chunk with OpenAI
 */
async function generateChunkWithOpenAI(triggers, routeData, apiKey, chunkIndex) {
  const prompt = buildOpenAIPrompt(triggers, routeData, chunkIndex)
  
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1500
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('Empty response')
    }
    
    return parseOpenAIResponse(content, triggers)
    
  } catch (err) {
    console.warn(`⚠️ OpenAI chunk ${chunkIndex} failed:`, err.message)
    return generateFallbackChatters(triggers)
  }
}

/**
 * Build prompt for OpenAI
 */
function buildOpenAIPrompt(triggers, routeData, chunkIndex) {
  return buildClaudePrompt(triggers, routeData, chunkIndex) // Same format works
}

/**
 * Parse OpenAI's response
 */
function parseOpenAIResponse(content, triggers) {
  return parseClaudeResponse(content, triggers) // Same parser works
}

/**
 * Generate fallback chatters when APIs fail
 */
function generateFallbackChatters(triggers) {
  const fallbackLines = {
    cruise: [
      "Just cruising along here.",
      "Smooth sailing on the highway.",
      "Open road ahead.",
    ],
    long_straight: [
      "This straight goes on forever.",
      "I may have dozed off there.",
      "Remarkably straight, this bit.",
    ],
    before_action: [
      "Something coming up ahead.",
      "Stay alert now.",
      "Road's about to get interesting.",
    ],
    after_action: [
      "Well handled back there.",
      "That was... exciting.",
      "Nicely done.",
    ],
  }
  
  return triggers.map((t, idx) => {
    const lines = fallbackLines[t.context] || fallbackLines.cruise
    const text = lines[idx % lines.length]
    
    return {
      id: `chatter-fallback-${t.id}`,
      triggerMile: t.mile,
      triggerDistance: t.mile * 1609.34,
      context: t.context,
      variants: {
        slow: [text],
        cruise: [text],
        fast: [text]
      },
      text
    }
  })
}

export default { generateChatterTimeline }
