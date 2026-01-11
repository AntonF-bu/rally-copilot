import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech } from '../hooks/useSpeech'
import { getRoute } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'

// ================================
// Route Preview - Mission Briefing
// v7: Full feature upgrade
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const DEMO_START = [-71.0589, 42.3601]
const DEMO_END = [-71.3012, 42.3665]

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9'
}

export default function RoutePreview({ onStartNavigation, onBack }) {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [mapContainer, setMapContainer] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [routeAnimated, setRouteAnimated] = useState(false)
  const fetchedRef = useRef(false)
  
  const { 
    routeData, mode, setMode, routeMode, setRouteData, 
    isFavorite, toggleFavorite, settings 
  } = useStore()
  const { initAudio, preloadRouteAudio } = useSpeech()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  
  const isRouteFavorite = routeData?.name ? isFavorite(routeData.name) : false
  
  const handleToggleFavorite = () => {
    if (routeData) toggleFavorite(routeData)
  }

  const mapContainerRef = useCallback((node) => {
    if (node !== null) setMapContainer(node)
  }, [])

  // Route stats
  const routeStats = useMemo(() => ({
    distance: routeData?.distance ? (routeData.distance / 1609.34).toFixed(1) : 0,
    duration: routeData?.duration ? Math.round(routeData.duration / 60) : 0,
    curves: routeData?.curves?.length || 0,
    sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0,
    chicanes: routeData?.curves?.filter(c => c.isChicane).length || 0
  }), [routeData])

  const severityBreakdown = useMemo(() => ({
    easy: routeData?.curves?.filter(c => c.severity <= 2).length || 0,
    medium: routeData?.curves?.filter(c => c.severity === 3 || c.severity === 4).length || 0,
    hard: routeData?.curves?.filter(c => c.severity >= 5).length || 0
  }), [routeData])

  // Calculate difficulty rating
  const difficultyRating = useMemo(() => {
    if (!routeData?.curves?.length) return { label: 'Unknown', color: '#666' }
    
    const total = routeData.curves.length
    const hardRatio = severityBreakdown.hard / total
    const mediumRatio = severityBreakdown.medium / total
    const avgSeverity = routeData.curves.reduce((sum, c) => sum + c.severity, 0) / total
    const curveDensity = total / (routeStats.distance || 1) // curves per mile
    
    if (avgSeverity >= 4 || hardRatio > 0.3 || curveDensity > 4) {
      return { label: 'Expert', color: '#ff3366' }
    } else if (avgSeverity >= 3 || hardRatio > 0.15 || curveDensity > 2.5) {
      return { label: 'Challenging', color: '#f97316' }
    } else if (avgSeverity >= 2.2 || mediumRatio > 0.3 || curveDensity > 1.5) {
      return { label: 'Moderate', color: '#ffd500' }
    }
    return { label: 'Easy', color: '#22c55e' }
  }, [routeData, severityBreakdown, routeStats])

  // Fetch demo route
  useEffect(() => {
    if (routeMode === 'demo' && !routeData?.coordinates && !fetchedRef.current) {
      fetchedRef.current = true
      fetchDemoRoute()
    }
  }, [routeMode])

  const fetchDemoRoute = async () => {
    setIsLoadingRoute(true)
    setLoadError(null)
    
    try {
      const route = await getRoute(DEMO_START, DEMO_END)
      if (route?.coordinates?.length > 10) {
        const curves = detectCurves(route.coordinates)
        setRouteData({
          name: "Boston to Weston Demo",
          coordinates: route.coordinates,
          curves,
          distance: route.distance,
          duration: route.duration
        })
      } else {
        setLoadError('Could not load demo route')
      }
    } catch (err) {
      setLoadError('Failed to fetch route: ' + err.message)
    } finally {
      setIsLoadingRoute(false)
    }
  }

  // Reverse route
  const handleReverseRoute = () => {
    if (!routeData?.coordinates) return
    
    const reversed = {
      ...routeData,
      coordinates: [...routeData.coordinates].reverse(),
      curves: routeData.curves ? routeData.curves.map(c => ({
        ...c,
        position: c.position, // Keep same position
        direction: c.direction === 'LEFT' ? 'RIGHT' : 'LEFT', // Flip direction
        startDirection: c.startDirection === 'LEFT' ? 'RIGHT' : 'LEFT'
      })).reverse() : []
    }
    
    // Recalculate curve positions along reversed route
    if (reversed.curves.length > 0) {
      const totalDist = routeData.distance || 15000
      reversed.curves = reversed.curves.map(c => ({
        ...c,
        distanceFromStart: totalDist - (c.distanceFromStart || 0)
      }))
    }
    
    setRouteData(reversed)
    
    // Rebuild map with new route
    if (mapRef.current && mapLoaded) {
      rebuildRoute(reversed)
    }
  }

  // Build colored route segments based on upcoming curve severity
  const buildColoredRouteSegments = useCallback((coordinates, curves) => {
    if (!coordinates || coordinates.length < 2) return []
    
    const segments = []
    let currentIndex = 0
    
    // Sort curves by distance from start
    const sortedCurves = [...(curves || [])].sort((a, b) => 
      (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
    )
    
    // Create segments between curves
    const totalPoints = coordinates.length
    
    sortedCurves.forEach((curve, i) => {
      const curveProgress = (curve.distanceFromStart || 0) / (routeData?.distance || 15000)
      const curveIndex = Math.floor(curveProgress * totalPoints)
      
      // Segment before this curve (approach zone - color by this curve's severity)
      const approachStart = Math.max(currentIndex, curveIndex - Math.floor(totalPoints * 0.02))
      if (approachStart > currentIndex) {
        // Green segment (safe zone)
        segments.push({
          coordinates: coordinates.slice(currentIndex, approachStart + 1),
          color: '#22c55e'
        })
      }
      
      // Approach + curve segment
      const curveEnd = Math.min(curveIndex + Math.floor(totalPoints * 0.01), totalPoints - 1)
      segments.push({
        coordinates: coordinates.slice(approachStart, curveEnd + 1),
        color: getCurveColor(curve.severity)
      })
      
      currentIndex = curveEnd
    })
    
    // Final segment to end
    if (currentIndex < totalPoints - 1) {
      segments.push({
        coordinates: coordinates.slice(currentIndex),
        color: '#22c55e'
      })
    }
    
    return segments
  }, [routeData?.distance])

  // Add route to map with animation
  const addRouteToMap = useCallback((mapInstance, routeCoords, curves, animate = true) => {
    if (!mapInstance || !routeCoords) return

    // Remove existing route layers
    ['route-glow', 'route-line', 'route-colored'].forEach(id => {
      if (mapInstance.getLayer(id)) mapInstance.removeLayer(id)
    })
    if (mapInstance.getSource('route')) mapInstance.removeSource('route')
    
    // Remove colored segment layers
    for (let i = 0; i < 50; i++) {
      if (mapInstance.getLayer(`route-segment-${i}`)) {
        mapInstance.removeLayer(`route-segment-${i}`)
      }
      if (mapInstance.getSource(`route-segment-${i}`)) {
        mapInstance.removeSource(`route-segment-${i}`)
      }
    }

    // Add main route source
    mapInstance.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: routeCoords }
      }
    })

    // Glow layer
    mapInstance.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 
        'line-color': '#ffffff', 
        'line-width': 14, 
        'line-blur': 10, 
        'line-opacity': 0.2 
      }
    })

    // Build colored segments
    const segments = buildColoredRouteSegments(routeCoords, curves)
    
    segments.forEach((segment, i) => {
      const sourceId = `route-segment-${i}`
      const layerId = `route-segment-${i}`
      
      mapInstance.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: segment.coordinates }
        }
      })
      
      mapInstance.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 
          'line-color': segment.color, 
          'line-width': 5, 
          'line-opacity': animate ? 0 : 1 
        }
      })
    })

    // Animate segments appearing
    if (animate && segments.length > 0) {
      segments.forEach((_, i) => {
        setTimeout(() => {
          if (mapInstance.getLayer(`route-segment-${i}`)) {
            mapInstance.setPaintProperty(`route-segment-${i}`, 'line-opacity', 1)
          }
        }, i * (1500 / segments.length))
      })
      
      setTimeout(() => setRouteAnimated(true), 1500)
    } else {
      setRouteAnimated(true)
    }
  }, [buildColoredRouteSegments])

  // Add markers to map
  const addMarkersToMap = useCallback((mapInstance, routeCoords, curves) => {
    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Start marker (green with flag icon)
    const startEl = document.createElement('div')
    startEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:32px;height:32px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(34,197,94,0.5);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
        </div>
        <div style="font-size:10px;color:white;background:#22c55e;padding:2px 6px;border-radius:4px;margin-top:4px;font-weight:600;">START</div>
      </div>
    `
    const startMarker = new mapboxgl.Marker({ element: startEl, anchor: 'bottom' })
      .setLngLat(routeCoords[0])
      .addTo(mapInstance)
    markersRef.current.push(startMarker)

    // End marker (red flag)
    const endEl = document.createElement('div')
    endEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:32px;height:32px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(239,68,68,0.5);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
          </svg>
        </div>
        <div style="font-size:10px;color:white;background:#ef4444;padding:2px 6px;border-radius:4px;margin-top:4px;font-weight:600;">FINISH</div>
      </div>
    `
    const endMarker = new mapboxgl.Marker({ element: endEl, anchor: 'bottom' })
      .setLngLat(routeCoords[routeCoords.length - 1])
      .addTo(mapInstance)
    markersRef.current.push(endMarker)

    // Curve markers
    if (curves) {
      curves.forEach((curve) => {
        const color = getCurveColor(curve.severity)
        const el = document.createElement('div')
        el.className = 'curve-marker'
        el.style.cursor = 'pointer'
        
        if (curve.isChicane) {
          const dirChar = curve.startDirection === 'LEFT' ? 'L' : 'R'
          const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:2px solid ${color};box-shadow:0 2px 10px ${color}40;transition:transform 0.2s;">
              <span style="font-size:8px;font-weight:700;color:${color};letter-spacing:0.5px;">${typeLabel}${dirChar}</span>
              <span style="font-size:12px;font-weight:700;color:${color};">${curve.severitySequence}</span>
            </div>
          `
        } else {
          const isLeft = curve.direction === 'LEFT'
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:2px solid ${color};box-shadow:0 2px 10px ${color}40;transition:transform 0.2s;">
              <div style="display:flex;align-items:center;gap:2px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="${color}" style="transform:${isLeft ? 'scaleX(-1)' : 'none'}">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
                <span style="font-size:14px;font-weight:700;color:${color};">${curve.severity}</span>
              </div>
            </div>
          `
        }
        
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(curve.position)
          .addTo(mapInstance)
        markersRef.current.push(marker)
      })
    }
  }, [])

  // Rebuild route (after reverse or style change)
  const rebuildRoute = useCallback((newRouteData) => {
    if (!mapRef.current) return
    const rd = newRouteData || routeData
    if (!rd?.coordinates) return
    
    addRouteToMap(mapRef.current, rd.coordinates, rd.curves, false)
    addMarkersToMap(mapRef.current, rd.coordinates, rd.curves)
    
    // Fit bounds
    const bounds = rd.coordinates.reduce((b, coord) => b.extend(coord), 
      new mapboxgl.LngLatBounds(rd.coordinates[0], rd.coordinates[0]))
    mapRef.current.fitBounds(bounds, {
      padding: { top: 100, bottom: 400, left: 50, right: 50 },
      duration: 500
    })
  }, [routeData, addRouteToMap, addMarkersToMap])

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return
    if (!mapContainer) return
    if (!routeData?.coordinates) return

    mapRef.current = new mapboxgl.Map({
      container: mapContainer,
      style: MAP_STYLES[mapStyle],
      center: routeData.coordinates[Math.floor(routeData.coordinates.length / 2)],
      zoom: 11,
      pitch: 0,
      bearing: 0,
      antialias: true,
      interactive: true
    })

    mapRef.current.on('load', () => {
      setMapLoaded(true)
      addRouteToMap(mapRef.current, routeData.coordinates, routeData.curves, true)
      addMarkersToMap(mapRef.current, routeData.coordinates, routeData.curves)

      // Fit bounds
      const bounds = routeData.coordinates.reduce((b, coord) => b.extend(coord), 
        new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      
      setTimeout(() => {
        mapRef.current?.fitBounds(bounds, {
          padding: { top: 100, bottom: 400, left: 50, right: 50 },
          duration: 1500
        })
      }, 200)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [mapContainer, routeData, mapStyle, addRouteToMap, addMarkersToMap])

  // Handle style change
  const handleStyleChange = useCallback((newStyle) => {
    setMapStyle(newStyle)
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[newStyle])
      
      // Re-add route after style loads
      mapRef.current.once('style.load', () => {
        rebuildRoute()
      })
    }
  }, [rebuildRoute])

  // Start navigation
  const handleStart = async () => {
    await initAudio()
    onStartNavigation()
  }

  // Download voice
  const handleDownload = async () => {
    if (isDownloading || !routeData?.curves?.length) return
    setIsDownloading(true)
    try {
      const result = await preloadRouteAudio(routeData.curves)
      if (result.success) setDownloadComplete(true)
    } catch (err) {
      console.error('Download error:', err)
    } finally {
      setIsDownloading(false)
    }
  }

  // Loading state
  if (isLoadingRoute) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white/60">Loading route...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center px-8">
          <p className="text-red-400 mb-4">{loadError}</p>
          <button onClick={onBack} className="px-6 py-2 bg-white/10 rounded-lg text-white">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      {/* Map */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-12 flex items-start justify-between">
        {/* Left: Back + Map Style */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
            </svg>
          </button>
          
          <MapStyleButton 
            currentStyle={mapStyle}
            onStyleChange={handleStyleChange}
          />
        </div>

        {/* Right: Favorite + Difficulty Badge */}
        <div className="flex flex-col items-end gap-2">
          {/* Difficulty Badge */}
          <div 
            className="px-3 py-1.5 rounded-full backdrop-blur-xl border flex items-center gap-2"
            style={{ 
              background: `${difficultyRating.color}20`,
              borderColor: `${difficultyRating.color}50`
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={difficultyRating.color}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span className="text-xs font-bold" style={{ color: difficultyRating.color }}>
              {difficultyRating.label}
            </span>
          </div>

          {/* Favorite Button */}
          {routeMode !== 'demo' && (
            <button
              onClick={handleToggleFavorite}
              className={`w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all ${
                isRouteFavorite 
                  ? 'bg-amber-500/20 border-amber-500/30' 
                  : 'bg-black/60 border-white/10'
              }`}
            >
              <svg 
                width="20" height="20" viewBox="0 0 24 24" 
                fill={isRouteFavorite ? '#f59e0b' : 'none'} 
                stroke={isRouteFavorite ? '#f59e0b' : 'white'} 
                strokeWidth="2"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          )}

          {/* Demo badge */}
          {routeMode === 'demo' && (
            <div className="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30">
              <span className="text-purple-400 text-xs font-bold tracking-wider">DEMO</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent pt-20 pb-6 px-4">
          
          {/* Mode Selector */}
          <div className="flex justify-center mb-4">
            <div className="inline-flex bg-black/60 backdrop-blur-xl rounded-full p-1 border border-white/10">
              {[
                { id: 'cruise', label: 'Cruise', color: '#00d4ff' },
                { id: 'fast', label: 'Fast', color: '#ffd500' },
                { id: 'race', label: 'Race', color: '#ff3366' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className="px-5 py-1.5 rounded-full text-xs font-bold tracking-wider transition-all"
                  style={{
                    background: mode === m.id ? m.color : 'transparent',
                    color: mode === m.id ? (m.id === 'fast' ? 'black' : 'white') : 'rgba(255,255,255,0.5)'
                  }}
                >
                  {m.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Route Stats */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <StatBox value={routeStats.distance} unit={settings.units === 'metric' ? 'KM' : 'MI'} />
            <StatBox value={routeStats.duration} unit="MIN" />
            <StatBox value={routeStats.curves} unit="CURVES" />
            <StatBox value={routeStats.sharpCurves} unit="SHARP" highlight />
          </div>

          {/* Severity Breakdown Bar */}
          <div className="mb-3">
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-white/10">
              <div 
                className="h-full rounded-l-full transition-all" 
                style={{ 
                  width: `${(severityBreakdown.easy / routeStats.curves) * 100 || 0}%`,
                  background: '#22c55e'
                }} 
              />
              <div 
                className="h-full transition-all" 
                style={{ 
                  width: `${(severityBreakdown.medium / routeStats.curves) * 100 || 0}%`,
                  background: '#ffd500'
                }} 
              />
              <div 
                className="h-full rounded-r-full transition-all" 
                style={{ 
                  width: `${(severityBreakdown.hard / routeStats.curves) * 100 || 0}%`,
                  background: '#ff3366'
                }} 
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/40 mt-1">
              <span>{severityBreakdown.easy} Easy</span>
              <span>{severityBreakdown.medium} Medium</span>
              <span>{severityBreakdown.hard} Hard</span>
              {routeStats.chicanes > 0 && <span>{routeStats.chicanes} Chicanes</span>}
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex gap-2 mb-3">
            {/* Reverse Route */}
            <button
              onClick={handleReverseRoute}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
              <span className="text-white/70 text-sm font-medium">Reverse</span>
            </button>

            {/* Download Voice */}
            <button
              onClick={handleDownload}
              disabled={isDownloading || downloadComplete || !navigator.onLine}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : downloadComplete ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              )}
              <span className={`text-sm font-medium ${downloadComplete ? 'text-green-400' : 'text-white/70'}`}>
                {downloadComplete ? 'Ready' : 'Voice'}
              </span>
            </button>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            className="w-full py-4 rounded-xl font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            style={{ background: modeColor }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            {routeMode === 'demo' ? 'START DEMO' : 'START NAVIGATION'}
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  )
}

// Stat Box Component
function StatBox({ value, unit, highlight = false }) {
  return (
    <div className="bg-white/5 rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${highlight ? 'text-red-400' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-[10px] text-white/40 tracking-wider">{unit}</div>
    </div>
  )
}

// Map Style Button
function MapStyleButton({ currentStyle, onStyleChange }) {
  const [isOpen, setIsOpen] = useState(false)
  
  const styles = [
    { id: 'dark', label: 'Dark' },
    { id: 'satellite', label: 'Satellite' }
  ]
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
          <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
        </svg>
      </button>
    )
  }
  
  return (
    <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-1">
      {styles.map(style => (
        <button
          key={style.id}
          onClick={() => { onStyleChange(style.id); setIsOpen(false) }}
          className={`w-full px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${
            currentStyle === style.id 
              ? 'bg-cyan-500/20 text-cyan-400' 
              : 'text-white/60 hover:bg-white/10'
          }`}
        >
          {style.label}
        </button>
      ))}
    </div>
  )
}
