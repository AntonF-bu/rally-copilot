// Vercel Serverless Function to proxy Census TIGERweb API requests
// This avoids CORS issues when calling from the browser

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const { coordinates } = req.body || {}
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) {
      return res.status(400).json({ error: 'Invalid coordinates' })
    }

    // Step 1: Query TIGERweb for tract geometries
    const polyline = {
      paths: [coordinates],
      spatialReference: { wkid: 4326 }
    }

    const params = new URLSearchParams({
      geometry: JSON.stringify(polyline),
      geometryType: 'esriGeometryPolyline',
      spatialRel: 'esriSpatialRelIntersects',
      distance: 500,
      units: 'esriSRUnit_Meter',
      outFields: 'GEOID,STATE,COUNTY,TRACT,AREALAND',
      returnGeometry: 'true',
      f: 'geojson'
    })

    const tigerUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/4/query?${params}`
    
    console.log('Fetching TIGERweb:', tigerUrl.substring(0, 100) + '...')
    
    const tigerResponse = await fetch(tigerUrl)
    
    if (!tigerResponse.ok) {
      console.error('TIGERweb error:', tigerResponse.status)
      return res.status(502).json({ error: 'TIGERweb API error', status: tigerResponse.status })
    }

    const tigerData = await tigerResponse.json()
    
    if (!tigerData.features?.length) {
      return res.status(200).json({ tracts: [], success: true })
    }

    // Extract tract info
    const tracts = tigerData.features.map(feature => ({
      geoid: feature.properties.GEOID,
      state: feature.properties.STATE,
      county: feature.properties.COUNTY,
      tract: feature.properties.TRACT,
      areaLand: feature.properties.AREALAND,
      geometry: feature.geometry
    }))

    console.log(`Found ${tracts.length} census tracts`)

    // Step 2: Group tracts by state+county for Census API calls
    const byStateCounty = {}
    tracts.forEach(tract => {
      const key = `${tract.state}-${tract.county}`
      if (!byStateCounty[key]) {
        byStateCounty[key] = { state: tract.state, county: tract.county, tracts: [] }
      }
      byStateCounty[key].tracts.push(tract)
    })

    // Step 3: Fetch population data for each state+county group
    const populationResults = await Promise.all(
      Object.values(byStateCounty).map(async (group) => {
        try {
          const censusUrl = `https://api.census.gov/data/2023/acs/acs5?get=B01001_001E&for=tract:*&in=state:${group.state}&in=county:${group.county}`
          const censusResponse = await fetch(censusUrl)
          
          if (!censusResponse.ok) {
            console.warn(`Census API error for ${group.state}-${group.county}`)
            return group.tracts.map(t => ({ ...t, population: null }))
          }

          const censusData = await censusResponse.json()
          
          // Build population map (first row is headers)
          const populationMap = {}
          for (let i = 1; i < censusData.length; i++) {
            const [pop, st, co, tr] = censusData[i]
            const geoid = `${st}${co}${tr}`
            populationMap[geoid] = parseInt(pop) || 0
          }

          // Match populations to tracts
          return group.tracts.map(tract => ({
            ...tract,
            population: populationMap[tract.geoid] ?? null
          }))
        } catch (err) {
          console.warn(`Census fetch error for ${group.state}-${group.county}:`, err.message)
          return group.tracts.map(t => ({ ...t, population: null }))
        }
      })
    )

    // Flatten results and calculate density
    const tractsWithDensity = populationResults.flat().map(tract => {
      const density = calculateDensity(tract.population, tract.areaLand)
      return {
        ...tract,
        density,
        densityCategory: categorizeDensity(density)
      }
    })

    console.log('Census data processed:', tractsWithDensity.map(t => `${t.geoid.slice(-4)}:${t.densityCategory}`).join(', '))

    return res.status(200).json({
      tracts: tractsWithDensity,
      success: true
    })

  } catch (error) {
    console.error('Census proxy error:', error)
    return res.status(500).json({ error: error.message, success: false })
  }
}

function calculateDensity(population, areaLandSqMeters) {
  if (!population || !areaLandSqMeters || areaLandSqMeters === 0) return 0
  const areaSquareMiles = areaLandSqMeters / 2589988
  return Math.round(population / areaSquareMiles)
}

function categorizeDensity(density) {
  if (density >= 8000) return 'urban'
  if (density >= 2500) return 'suburban'
  return 'rural'
}
