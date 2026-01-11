// ================================
// Census Sleeve Layer - Simple Buffer Version
// Renders a thick semi-transparent buffer around the route
// colored by population density
// ================================

// Sleeve colors - distinct from route line colors
const SLEEVE_COLORS = {
  urban: '#a855f7',      // Purple
  suburban: '#f97316',   // Orange  
  rural: '#14b8a6',      // Teal
  unknown: '#6b7280'     // Gray
}

/**
 * Add route buffer sleeve to map
 * Creates a wide semi-transparent line following the route, colored by density segments
 */
export function addCensusSleeveAsCollection(map, censusTracts, routeSegments, routeCoordinates) {
  if (!map || !routeCoordinates?.length) {
    console.warn('Cannot add sleeve: missing map or coordinates')
    return []
  }

  const sourceId = 'census-sleeve-source'
  const bufferId = 'census-sleeve-buffer'
  const outlineId = 'census-sleeve-outline'

  // Remove existing sleeve layers
  removeCensusSleeve(map, [sourceId, bufferId, outlineId])

  // If we have route segments with density info, use those
  // Otherwise create a single segment from census tracts
  const segments = buildSleeveSegments(routeSegments, routeCoordinates, censusTracts)
  
  if (!segments.length) {
    console.warn('No sleeve segments to render')
    return []
  }

  console.log('🗺️ Adding sleeve with', segments.length, 'segments')

  try {
    // Build a FeatureCollection with each segment as a separate feature
    const features = segments.map((seg, i) => ({
      type: 'Feature',
      properties: {
        densityCategory: seg.densityCategory,
        color: SLEEVE_COLORS[seg.densityCategory] || SLEEVE_COLORS.unknown
      },
      geometry: {
        type: 'LineString',
        coordinates: seg.coordinates
      }
    }))

    // Add source
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features
      }
    })

    // Add wide buffer layer (underneath route)
    map.addLayer({
      id: bufferId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 35,
        'line-opacity': 0.25,
        'line-blur': 2
      }
    })

    // Add subtle outline
    map.addLayer({
      id: outlineId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 40,
        'line-opacity': 0.15,
        'line-blur': 8
      }
    })

    // Move sleeve layers below the route line layers
    moveSleeveBelow(map, bufferId, outlineId)

    console.log('✅ Sleeve layers added')
    return [sourceId, bufferId, outlineId]

  } catch (e) {
    console.error('Census sleeve error:', e)
    return []
  }
}

/**
 * Build sleeve segments from route segments or census tracts
 */
function buildSleeveSegments(routeSegments, routeCoordinates, censusTracts) {
  // If we have pre-built route segments with density info, use those
  if (routeSegments?.length) {
    return routeSegments.map(seg => ({
      coordinates: seg.coordinates || [],
      densityCategory: seg.details?.densityCategory || 'unknown'
    })).filter(seg => seg.coordinates.length > 1)
  }

  // Otherwise, build segments by checking each point against census tracts
  if (!censusTracts?.length || !routeCoordinates?.length) {
    // Fallback: single segment with unknown density
    return [{
      coordinates: routeCoordinates,
      densityCategory: 'unknown'
    }]
  }

  // Sample route and assign density from census tracts
  const segments = []
  let currentSegment = null
  
  for (let i = 0; i < routeCoordinates.length; i++) {
    const coord = routeCoordinates[i]
    const density = getDensityAtPoint(coord, censusTracts)
    
    if (!currentSegment || currentSegment.densityCategory !== density) {
      if (currentSegment && currentSegment.coordinates.length > 1) {
        // Add overlap point for smooth connection
        currentSegment.coordinates.push(coord)
        segments.push(currentSegment)
      }
      currentSegment = {
        coordinates: [coord],
        densityCategory: density
      }
    } else {
      currentSegment.coordinates.push(coord)
    }
  }
  
  // Add final segment
  if (currentSegment && currentSegment.coordinates.length > 1) {
    segments.push(currentSegment)
  }

  return segments
}

/**
 * Get density category at a point from census tracts
 */
function getDensityAtPoint(coord, censusTracts) {
  for (const tract of censusTracts) {
    if (tract.geometry && pointInPolygon(coord, tract.geometry)) {
      return tract.densityCategory || 'unknown'
    }
  }
  return 'unknown'
}

/**
 * Point-in-polygon test
 */
function pointInPolygon(point, geometry) {
  if (!geometry) return false
  
  const [lng, lat] = point
  const polygons = geometry.type === 'MultiPolygon' 
    ? geometry.coordinates 
    : [geometry.coordinates]
  
  for (const polygon of polygons) {
    const exterior = polygon[0]
    if (isPointInRing(lng, lat, exterior)) {
      let inHole = false
      for (let i = 1; i < polygon.length; i++) {
        if (isPointInRing(lng, lat, polygon[i])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

function isPointInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Move sleeve layers below route layers
 */
function moveSleeveBelow(map, bufferId, outlineId) {
  try {
    // Find the first route segment layer
    const layers = map.getStyle().layers
    const routeLayer = layers.find(l => l.id.startsWith('seg-') || l.id.startsWith('line-') || l.id.startsWith('glow-'))
    
    if (routeLayer) {
      map.moveLayer(outlineId, routeLayer.id)
      map.moveLayer(bufferId, routeLayer.id)
    }
  } catch (e) {
    // Ignore layer ordering errors
  }
}

/**
 * Remove census sleeve layers from map
 */
export function removeCensusSleeve(map, layerIds) {
  if (!map) return
  
  const idsToRemove = layerIds?.length ? layerIds : [
    'census-sleeve-source',
    'census-sleeve-buffer', 
    'census-sleeve-outline'
  ]

  idsToRemove.forEach(id => {
    try {
      if (map.getLayer(id)) map.removeLayer(id)
    } catch (e) {}
  })
  
  idsToRemove.forEach(id => {
    try {
      if (map.getSource(id)) map.removeSource(id)
    } catch (e) {}
  })
}

/**
 * Toggle sleeve visibility
 */
export function toggleSleeveVisibility(map, visible) {
  if (!map) return
  
  const visibility = visible ? 'visible' : 'none'
  
  try {
    if (map.getLayer('census-sleeve-buffer')) {
      map.setLayoutProperty('census-sleeve-buffer', 'visibility', visibility)
    }
    if (map.getLayer('census-sleeve-outline')) {
      map.setLayoutProperty('census-sleeve-outline', 'visibility', visibility)
    }
  } catch (e) {}
}

/**
 * Legend items for UI
 */
export function getCensusLegendItems() {
  return [
    { label: 'Urban (>8k/mi²)', color: SLEEVE_COLORS.urban, category: 'urban' },
    { label: 'Suburban (2.5-8k/mi²)', color: SLEEVE_COLORS.suburban, category: 'suburban' },
    { label: 'Rural (<2.5k/mi²)', color: SLEEVE_COLORS.rural, category: 'rural' }
  ]
}

export default {
  addCensusSleeveAsCollection,
  removeCensusSleeve,
  toggleSleeveVisibility,
  getCensusLegendItems,
  SLEEVE_COLORS
}
