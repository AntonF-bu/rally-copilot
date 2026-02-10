// Vercel Edge Function for ElevenLabs Text-to-Speech
// Now accepts dynamic voice settings per driving mode

export const config = {
  runtime: 'edge',
}

export default async function handler(request) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { text, voiceId, voiceSettings } = await request.json()

    if (!text) {
      return new Response('Missing text', { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return new Response('ElevenLabs API key not configured', { status: 500 })
    }

    // Default to specific voice if not specified
    const voice = voiceId || 'lh03wW2cCRf05ksqPizq'

    // Default voice settings (can be overridden by caller)
    const settings = {
      stability: voiceSettings?.stability ?? 0.85,
      similarity_boost: voiceSettings?.similarity_boost ?? 0.80,
      style: voiceSettings?.style ?? 0.15,
      use_speaker_boost: voiceSettings?.use_speaker_boost ?? true
    }

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
          model_id: 'eleven_multilingual_v2',
          voice_settings: settings
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
        'Cache-Control': 'public, max-age=3600',
      },
    })

  } catch (error) {
    console.error('TTS error:', error)
    return new Response(`Server error: ${error.message}`, { status: 500 })
  }
}
