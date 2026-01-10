// Vercel Edge Function for ElevenLabs Text-to-Speech
// This keeps your API key secure on the server

export const config = {
  runtime: 'edge',
}

export default async function handler(request) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { text, voiceId } = await request.json()

    if (!text) {
      return new Response('Missing text', { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return new Response('ElevenLabs API key not configured', { status: 500 })
    }

    // Default to Adam voice if not specified
    const voice = voiceId || 'pNInz6obpgDQGcFmaJgB'

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Fast, low latency model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true
          }
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('ElevenLabs error:', error)
      return new Response(`ElevenLabs API error: ${response.status}`, { 
        status: response.status 
      })
    }

    // Return audio stream
    const audioBuffer = await response.arrayBuffer()
    
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })

  } catch (error) {
    console.error('TTS error:', error)
    return new Response(`Server error: ${error.message}`, { status: 500 })
  }
}
