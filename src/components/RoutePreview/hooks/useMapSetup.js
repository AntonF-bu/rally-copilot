import { useState, useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { CHARACTER_COLORS } from '../../../services/zoneService'
import { MAP_STYLES } from '../constants'
import { buildZoneSegments } from '../../../utils/routeGeometry'

// Zone colors for shared utility (must match CHARACTER_COLORS primary values)
const ZONE_COLORS = {
  technical: CHARACTER_COLORS.technical.primary,
  transit: CHARACTER_COLORS.transit.primary,
  urban: CHARACTER_COLORS.urban.primary
}

/**
 * Hook to manage Mapbox map setup, route rendering, and markers
 * @param {Object} params - Configuration object
 * @param {Object} params.routeData - Route with coordinates, distance
 * @param {Array} params.routeSegments - Zone segments for coloring
 * @param {Array} params.callouts - Callouts to display as markers
 * @param {boolean} params.enabled - Whether to initialize the map
 * @param {Function} params.onCalloutClick - Callback when callout marker clicked
 * @returns {Object} Map state and controls
 */
export function useMapSetup({
  routeData,
  routeSegments = [],
  callouts = [],
  enabled = true,
  onCalloutClick
}) {
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [showSleeve, setShowSleeve] = useState(true)
  const [showHighwayBends, setShowHighwayBends] = useState(true)
  const [mapContainer, setMapContainer] = useState(null)  // Use state instead of ref

  const mapRef = useRef(null)
  const markersRef = useRef([])
  const highwayMarkersRef = useRef([])
  const initialRouteDrawnRef = useRef(false)

  // Note: mapContainer/setMapContainer is now state above, used as ref callback

  // ================================
  // BUILD SLEEVE SEGMENTS (using shared utility)
  // ================================
  const buildSleeveSegments = useCallback((coords, characterSegments) => {
    const segments = buildZoneSegments(
      coords,
      characterSegments,
      routeData?.distance || 0,
      ZONE_COLORS
    )
    // Convert from shared format (coordinates) to local format (coords)
    return segments.map(seg => ({
      coords: seg.coordinates,
      color: seg.color,
      character: seg.character
    }))
  }, [routeData?.distance])

  // ================================
  // ADD ROUTE LAYERS
  // ================================
  const addRoute = useCallback((map, coords, characterSegments) => {
    if (!map || !coords?.length) return

    const zoneSegs = buildSleeveSegments(coords, characterSegments)
    if (!zoneSegs.length) return

    zoneSegs.forEach((seg, i) => {
      const srcId = `route-src-${i}`
      const glowId = `glow-${i}`
      const lineId = `line-${i}`

      // Clean up existing layers
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(glowId)) map.removeLayer(glowId)
      if (map.getSource(srcId)) map.removeSource(srcId)

      // Add source
      map.addSource(srcId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: seg.coords }
        }
      })

      // DEBUG: Log the color being used
      console.log(`🎨 ZONE ${i}: character=${seg.character}, color=${seg.color}`)

      // Add glow layer
      map.addLayer({
        id: glowId,
        type: 'line',
        source: srcId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': seg.color,
          'line-width': 12,
          'line-blur': 5,
          'line-opacity': 0.4,
          'line-emissive-strength': 1.0
        }
      })

      // Add main line layer
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': seg.color, 'line-width': 4, 'line-opacity': 1.0, 'line-emissive-strength': 1.0 }
      })

      console.log(`🎨 Drawing segment ${i}: color=${seg.color}, glow-opacity=0.4, line-width=4`)
    })

    // Force route layers to top of stack
    const style = map.getStyle()
    const allLayerIds = style.layers.map(l => l.id)
    const routeLayerIds = allLayerIds.filter(id =>
      id.startsWith('route-') || id.startsWith('glow-') || id.startsWith('line-')
    )

    // Also log ALL layers for debugging
    console.log('📋 ALL MAP LAYERS:', allLayerIds)
    console.log('🛣️ ROUTE LAYERS:', routeLayerIds)

    // Move each route layer to top
    routeLayerIds.forEach(id => {
      try { map.moveLayer(id) } catch(e) {}
    })
  }, [buildSleeveSegments])

  // ================================
  // GET SHORT LABEL FOR CALLOUT
  // ================================
  const getShortLabel = (callout) => {
    const text = callout.text || ''
    const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1

    if (isGrouped) {
      if (text.toLowerCase().includes('hairpin')) return text.includes('DOUBLE') ? '2xHP' : 'HP'
      if (text.toLowerCase().includes('chicane')) return 'CHI'
      if (text.toLowerCase().includes('esses')) return 'ESS'
      if (text.includes('HARD')) {
        const match = text.match(/HARD\s+(LEFT|RIGHT)\s+(\d+)/i)
        return match ? `H${match[1][0]}${match[2]}` : 'HRD'
      }
      return `G${callout.groupedFrom.length}`
    }

    if (callout.type === 'wake_up') return '!'
    if (callout.type === 'sequence') return 'SEQ'

    const dirMatch = text.match(/\b(left|right|L|R)\b/i)
    const angleMatch = text.match(/(\d+)/)

    if (dirMatch && angleMatch) return `${dirMatch[1][0].toUpperCase()}${angleMatch[1]}`
    if (angleMatch) return angleMatch[1]
    if (dirMatch) return dirMatch[1][0].toUpperCase()

    return callout.type?.[0]?.toUpperCase() || '•'
  }

  // ================================
  // ADD CALLOUT MARKERS
  // ================================
  const addCalloutMarkers = useCallback((map, calloutsToShow) => {
    // Clear existing markers
    highwayMarkersRef.current.forEach(m => m.remove())
    highwayMarkersRef.current = []

    if (!showHighwayBends || !calloutsToShow?.length) return

    calloutsToShow.forEach(callout => {
      if (!callout.position) return

      const el = document.createElement('div')
      el.style.cursor = 'pointer'

      const shortLabel = getShortLabel(callout)
      const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1

      // Determine color
      let color
      if (callout.zone === 'transit' || callout.zone === 'highway') {
        color = '#3b82f6'
      } else {
        const angle = parseInt(callout.text?.match(/\d+/)?.[0]) || 0
        if (angle >= 70 || callout.text?.toLowerCase().includes('hairpin')) color = '#ef4444'
        else if (angle >= 45 || callout.text?.toLowerCase().includes('chicane')) color = '#f97316'
        else color = '#22c55e'
      }

      const isHighway = callout.zone === 'transit' || callout.zone === 'highway'
      el.innerHTML = `
        <div style="background: ${isHighway ? color + '30' : color}; padding: ${isGrouped ? '4px 12px' : '4px 10px'}; border-radius: ${isGrouped ? '12px' : '6px'}; border: ${isGrouped ? '3px solid #fff' : '2px solid ' + color}; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.4);">
          <span style="font-size:${isGrouped ? '12px' : '11px'}; font-weight:${isGrouped ? '700' : '600'}; color:${isHighway ? color : '#fff'};">${shortLabel}</span>
        </div>
      `

      el.onclick = () => {
        if (onCalloutClick) {
          onCalloutClick({ ...callout, isCuratedCallout: true })
        }
        if (mapRef.current) {
          mapRef.current.flyTo({ center: callout.position, zoom: 14, pitch: 45, duration: 800 })
        }
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(callout.position)
        .addTo(map)

      highwayMarkersRef.current.push(marker)
    })
  }, [showHighwayBends, onCalloutClick])

  // ================================
  // REBUILD ROUTE
  // ================================
  const rebuildRoute = useCallback((data = routeData, segments = routeSegments) => {
    if (!mapRef.current || !data?.coordinates) return
    if (!segments?.length) return

    // Remove existing layers
    for (let i = 0; i < 100; i++) {
      ['glow-', 'line-'].forEach(prefix => {
        const layerId = prefix + i
        if (mapRef.current.getLayer(layerId)) {
          mapRef.current.removeLayer(layerId)
        }
      })
      const srcId = 'route-src-' + i
      if (mapRef.current.getSource(srcId)) {
        mapRef.current.removeSource(srcId)
      }
    }

    addRoute(mapRef.current, data.coordinates, segments)
    addCalloutMarkers(mapRef.current, callouts)

    initialRouteDrawnRef.current = true
  }, [routeData, routeSegments, callouts, addRoute, addCalloutMarkers])

  // ================================
  // TOGGLE FUNCTIONS
  // ================================
  const toggleStyle = useCallback(() => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[next])
    }
  }, [mapStyle])

  const toggleSleeve = useCallback(() => {
    const newVisibility = !showSleeve
    setShowSleeve(newVisibility)

    if (mapRef.current) {
      const visibility = newVisibility ? 'visible' : 'none'
      for (let i = 0; i < 100; i++) {
        ['sleeve-', 'sleeve-border-top-', 'sleeve-border-bottom-'].forEach(prefix => {
          try {
            if (mapRef.current.getLayer(`${prefix}${i}`)) {
              mapRef.current.setLayoutProperty(`${prefix}${i}`, 'visibility', visibility)
            }
          } catch (e) { }
        })
      }
    }
  }, [showSleeve])

  const toggleHighwayBends = useCallback(() => {
    const newVisibility = !showHighwayBends
    setShowHighwayBends(newVisibility)
    highwayMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = newVisibility ? 'block' : 'none'
    })
  }, [showHighwayBends])

  // Fly to location
  const flyTo = useCallback((center, options = {}) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center, ...options })
    }
  }, [])

  // Fit bounds to route
  const fitBounds = useCallback((coords, options = {}) => {
    if (!mapRef.current || !coords?.length) return

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    )

    mapRef.current.fitBounds(bounds, {
      padding: { top: 120, bottom: 160, left: 40, right: 40 },
      duration: 1000,
      ...options
    })
  }, [])

  // ================================
  // INITIALIZE MAP
  // ================================
  useEffect(() => {
    // Wait for container, enabled, and route data
    if (!enabled || !mapContainer || !routeData?.coordinates || mapRef.current) {
      return
    }

    console.log('🗺️ Initializing map with container:', mapContainer)

    mapRef.current = new mapboxgl.Map({
      container: mapContainer,  // Use state variable
      style: MAP_STYLES[mapStyle],
      center: routeData.coordinates[0],
      zoom: 10,
      pitch: 0
    })

    mapRef.current.on('load', () => {
      console.log('🗺️ Map loaded!')
      setMapLoaded(true)

      // Fit bounds to route
      const bounds = routeData.coordinates.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
      )
      mapRef.current.fitBounds(bounds, {
        padding: { top: 120, bottom: 160, left: 40, right: 40 },
        duration: 1000
      })
    })

    mapRef.current.on('style.load', () => {
      if (routeSegments?.length > 0) {
        rebuildRoute()
      }
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      highwayMarkersRef.current.forEach(m => m.remove())
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [enabled, mapContainer, routeData?.coordinates, mapStyle])  // Add mapContainer to deps

  // Draw route when segments are ready
  useEffect(() => {
    if (mapLoaded && routeSegments?.length > 0 && !initialRouteDrawnRef.current) {
      rebuildRoute(routeData, routeSegments)
    }
  }, [mapLoaded, routeSegments, rebuildRoute, routeData])

  // Update markers when callouts change
  useEffect(() => {
    if (mapRef.current && mapLoaded && callouts?.length > 0) {
      addCalloutMarkers(mapRef.current, callouts)
    }
  }, [callouts, mapLoaded, addCalloutMarkers])

  // Reset function
  const reset = useCallback(() => {
    initialRouteDrawnRef.current = false
    markersRef.current.forEach(m => m.remove())
    highwayMarkersRef.current.forEach(m => m.remove())
    markersRef.current = []
    highwayMarkersRef.current = []
  }, [])

  return {
    // Refs
    mapRef,
    mapContainerRef: setMapContainer,

    // State
    mapLoaded,
    mapStyle,
    showSleeve,
    showHighwayBends,

    // Actions
    toggleStyle,
    toggleSleeve,
    toggleHighwayBends,
    rebuildRoute,
    flyTo,
    fitBounds,
    reset
  }
}

export default useMapSetup
