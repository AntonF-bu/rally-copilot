// ================================
// API Endpoint: Expand Short URLs
// Follows redirects to get the full Google Maps URL
// ================================

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const { url } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('Expanding URL:', url)

    // Follow redirects to get final URL
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    })

    const expandedUrl = response.url

    console.log('Expanded URL:', expandedUrl)

    return new Response(JSON.stringify({ expandedUrl }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error expanding URL:', error)
    return new Response(JSON.stringify({ error: 'Failed to expand URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
