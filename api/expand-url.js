// /api/expand-url.js
// Expands short URLs like maps.app.goo.gl to full URLs

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

    // Check if it's a short URL that needs expanding
    const shortUrlPatterns = [
      'maps.app.goo.gl',
      'goo.gl',
      'bit.ly',
      't.co'
    ]

    const needsExpanding = shortUrlPatterns.some(pattern => url.includes(pattern))

    if (!needsExpanding) {
      // Already a full URL, return as-is
      return new Response(JSON.stringify({ expandedUrl: url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Follow redirects to get the final URL
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    })

    const expandedUrl = response.url

    console.log('Expanded URL:', url, '->', expandedUrl)

    return new Response(JSON.stringify({ expandedUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('URL expansion error:', error)
    return new Response(JSON.stringify({ error: 'Failed to expand URL' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
