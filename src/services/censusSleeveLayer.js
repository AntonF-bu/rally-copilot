// ================================
// Census Sleeve Layer
// Renders census tract polygons as a colored, semi-transparent sleeve
// ================================

import { CHARACTER_COLORS } from './zoneService'

/**
 * Add census tract polygons to map as a colored sleeve
 * @param {mapboxgl.Map} map - Mapbox map instance
 * @param {Array} censusTracts - Array of tract objects with geometry and densityCategory
 * @param {Array} existingLayerIds - Array to track created layer IDs for cleanup
 */
export function addCensusSleeveToMap(map, censusTracts, existingLayerIds = []) {
  if (!map || !censusTracts?.length) return existingLayerIds

  // Remove existing sleeve layers first
  removeCensusSleeve(map, existingLayerIds)
  
  const newLayerIds = []

  // Color mapping for density categories
  const densityColors = {
    urban: CHARACTER_COLORS.urban.primary,      // Red - #f87171
    suburban: CHARACTER_COLORS.spirited.primary, // Yellow - #fbbf24
    rural: CHARACTER_COLORS.technical.primary,   // Green - #22c55e
    unknown: '#9ca3af'                           // Gray fallback
  }

  // Add each tract as a polygon layer
  censusTracts.forEach((tract, i) => {
    if (!tract.geometry) return

    const sourceId = `census-tract-${i}`
    const fillId = `census-fill-${i}`
    const outlineId = `census-outline-${i}`
    
    const color = densityColors[tract.densityCategory] || densityColors.unknown

    try {
      // Add source
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {
              geoid: tract.geoid,
              density: tract.density,
              category: tract.densityCategory,
              population: tract.population
            },
            geometry: tract.geometry
          }
        })
      }

      // Add fill layer (semi-transparent)
      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': color,
            'fill-opacity': 0.15  // Light transparency
          }
        }, 'road-label')  // Insert below labels
        newLayerIds.push(fillId)
      }

      // Add outline layer (dashed border)
      if (!map.getLayer(outlineId)) {
        map.addLayer({
          id: outlineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': color,
            'line-width': 1.5,
            'line-opacity': 0.4,
            'line-dasharray': [3, 2]
          }
        }, 'road-label')
        newLayerIds.push(outlineId)
      }

      newLayerIds.push(sourceId)

    } catch (e) {
      console.warn(`Census sleeve layer error for tract ${i}:`, e.message)
    }
  })

  return newLayerIds
}

/**
 * Remove census sleeve layers from map
 */
export function removeCensusSleeve(map, layerIds) {
  if (!map || !layerIds?.length) return

  layerIds.forEach(id => {
    try {
      if (map.getLayer(id)) {
        map.removeLayer(id)
      }
      if (map.getSource(id)) {
        map.removeSource(id)
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  })
}

/**
 * Add a combined GeoJSON FeatureCollection for all tracts
 * More efficient for many tracts
 */
export function addCensusSleeveAsCollection(map, censusTracts, layerPrefix = 'census-sleeve') {
  if (!map || !censusTracts?.length) return []

  const sourceId = `${layerPrefix}-source`
  const fillId = `${layerPrefix}-fill`
  const outlineId = `${layerPrefix}-outline`

  // Remove existing
  try {
    if (map.getLayer(fillId)) map.removeLayer(fillId)
    if (map.getLayer(outlineId)) map.removeLayer(outlineId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } catch (e) {}

  // Build FeatureCollection
  const features = censusTracts
    .filter(t => t.geometry)
    .map(tract => ({
      type: 'Feature',
      properties: {
        geoid: tract.geoid,
        density: tract.density,
        densityCategory: tract.densityCategory,
        population: tract.population
      },
      geometry: tract.geometry
    }))

  if (!features.length) return []

  try {
    // Add source
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features
      }
    })

    // Add fill layer with data-driven color
    map.addLayer({
      id: fillId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': [
          'match',
          ['get', 'densityCategory'],
          'urban', CHARACTER_COLORS.urban.primary,
          'suburban', CHARACTER_COLORS.spirited.primary,
          'rural', CHARACTER_COLORS.technical.primary,
          '#9ca3af'  // default gray
        ],
        'fill-opacity': 0.18
      }
    }, 'road-label')

    // Add outline layer
    map.addLayer({
      id: outlineId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': [
          'match',
          ['get', 'densityCategory'],
          'urban', CHARACTER_COLORS.urban.primary,
          'suburban', CHARACTER_COLORS.spirited.primary,
          'rural', CHARACTER_COLORS.technical.primary,
          '#9ca3af'
        ],
        'line-width': 1.5,
        'line-opacity': 0.5,
        'line-dasharray': [4, 2]
      }
    }, 'road-label')

    return [sourceId, fillId, outlineId]

  } catch (e) {
    console.error('Census sleeve collection error:', e)
    return []
  }
}

/**
 * Create a legend component for census density categories
 */
export function getCensusLegendItems() {
  return [
    { label: 'Urban (>10k/mi²)', color: CHARACTER_COLORS.urban.primary, category: 'urban' },
    { label: 'Suburban (2-10k/mi²)', color: CHARACTER_COLORS.spirited.primary, category: 'suburban' },
    { label: 'Rural (<2k/mi²)', color: CHARACTER_COLORS.technical.primary, category: 'rural' }
  ]
}

export default {
  addCensusSleeveToMap,
  addCensusSleeveAsCollection,
  removeCensusSleeve,
  getCensusLegendItems
}
