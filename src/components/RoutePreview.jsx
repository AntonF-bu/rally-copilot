import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech, generateCallout } from '../hooks/useSpeech'
import { getRoute } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'

// ================================
// Route Preview - Mission Briefing
// v8: Complete feature set
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
  const [selectedCurve, setSelectedCurve] = useState(null)
  const [showCurveList, setShowCurveList] = useState(false)
  const [isFlying, setIsFlying] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showElevationExpanded, setShowElevationExpanded] = useState(false)
  const fetchedRef = useRef(false)
  const flyAnimationRef = useRef(null)
  
  const { 
    routeData, mode, setMode, routeMode, setRouteData, 
    isFavorite, toggleFavorite, settings, updateSettings 
  } = useStore()
  const { initAudio, preloadRouteAudio, speak } = useSpeech()

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
    const curveDensity = total / (routeStats.distance || 1)
    
    if (avgSeverity >= 4 || hardRatio > 0.3 || curveDensity > 4) {
      return { label: 'Expert', color: '#ff3366' }
    } else if (avgSeverity >= 3 || hardRatio > 0.15 || curveDensity > 2.5) {
      return { label: 'Challenging', color: '#f97316' }
    } else if (avgSeverity >= 2.2 || mediumRatio > 0.3 || curveDensity > 1.5) {
      return { label: 'Moderate', color: '#ffd500' }
    }
    return { label: 'Easy', color: '#22c55e' }
  }, [routeData, severityBreakdown, routeStats])

  // Find hardest section (cluster of hard curves)
  const hardestSection = useMemo(() => {
    if (!routeData?.curves?.length) return null
    
    const hardCurves = routeData.curves.filter(c => c.severity >= 4)
    if (hardCurves.length === 0) return null
    
    // Find the hardest single curve
    const hardest = hardCurves.reduce((max, c) => c.severity > max.severity ? c : max, hardCurves[0])
    return hardest
  }, [routeData])

  // Generate elevation profile data
  const elevationProfile = useMemo(() => {
    if (!routeData?.coordinates) return []
    
    // Simulate elevation data (in real app, fetch from Mapbox Terrain API)
    const points = []
    const numPoints = Math.min(50, routeData.coordinates.length)
    const step = Math.floor(routeData.coordinates.length / numPoints)
    
    let baseElev = 50 + Math.random() * 100
    for (let i = 0; i < numPoints; i++) {
      const idx = i * step
      // Simulate rolling terrain
      baseElev += (Math.random() - 0.5) * 30
      baseElev = Math.max(0, Math.min(500, baseElev))
      
      points.push({
        distance: (idx / routeData.coordinates.length) * (routeData.distance || 15000),
        elevation: baseElev,
        coord: routeData.coordinates[idx]
      })
    }
    return points
  }, [routeData])

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
        direction: c.direction === 'LEFT' ? 'RIGHT' : 'LEFT',
        startDirection: c.startDirection === 'LEFT' ? 'RIGHT' : 'LEFT'
      })).reverse() : []
    }
    
    if (reversed.curves.length > 0) {
      const totalDist = routeData.distance || 15000
      reversed.curves = reversed.curves.map(c => ({
        ...c,
        distanceFromStart: totalDist - (c.distanceFromStart || 0)
      }))
    }
    
    setRouteData(reversed)
    if (mapRef.current && mapLoaded) rebuildRoute(reversed)
  }

  // Fly through animation
  const handleFlyThrough = () => {
    if (!mapRef.current || !routeData?.coordinates || isFlying) return
    
    setIsFlying(true)
    const coords = routeData.coordinates
    const totalPoints = coords.length
    let currentIndex = 0
    
    // Calculate bearing between points
    const getBearing = (start, end) => {
      const dLon = (end[0] - start[0]) * Math.PI / 180
      const lat1 = start[1] * Math.PI / 180
      const lat2 = end[1] * Math.PI / 180
      const y = Math.sin(dLon) * Math.cos(lat2)
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    }
    
    const animate = () => {
      if (currentIndex >= totalPoints - 1) {
        setIsFlying(false)
        // Reset view
        const bounds = coords.reduce((b, coord) => b.extend(coord), 
          new mapboxgl.LngLatBounds(coords[0], coords[0]))
        mapRef.current?.fitBounds(bounds, {
          padding: { top: 100, bottom: 400, left: 50, right: 50 },
          duration: 1000
        })
        return
      }
      
      const current = coords[currentIndex]
      const next = coords[Math.min(currentIndex + 5, totalPoints - 1)]
      const bearing = getBearing(current, next)
      
      mapRef.current?.easeTo({
        center: current,
        bearing: bearing,
        pitch: 60,
        zoom: 15,
        duration: 100
      })
      
      currentIndex += 2
      flyAnimationRef.current = requestAnimationFrame(animate)
    }
    
    // Start with zoom out then fly
    mapRef.current.easeTo({
      center: coords[0],
      pitch: 60,
      zoom: 14,
      duration: 1000
    })
    
    setTimeout(() => {
      flyAnimationRef.current = requestAnimationFrame(animate)
    }, 1000)
  }

  const stopFlyThrough = () => {
    if (flyAnimationRef.current) {
      cancelAnimationFrame(flyAnimationRef.current)
      flyAnimationRef.current = null
    }
    setIsFlying(false)
    
    // Reset view
    if (mapRef.current && routeData?.coordinates) {
      const bounds = routeData.coordinates.reduce((b, coord) => b.extend(coord), 
        new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      mapRef.current.fitBounds(bounds, {
        padding: { top: 100, bottom: 400, left: 50, right: 50 },
        duration: 1000,
        pitch: 0
      })
    }
  }

  // Play sample callout
  const handleSampleCallout = async () => {
    await initAudio()
    const sampleCurve = routeData?.curves?.find(c => c.severity >= 3) || routeData?.curves?.[0]
    if (sampleCurve) {
      const callout = generateCallout(sampleCurve, mode, settings.units === 'metric' ? 'kmh' : 'mph')
      speak(callout, 'high')
    }
  }

  // Share route
  const handleShare = async () => {
    const shareData = {
      title: routeData?.name || 'Rally Co-Pilot Route',
      text: `Check out this route: ${routeStats.distance} ${settings.units === 'metric' ? 'km' : 'mi'}, ${routeStats.curves} curves`,
      url: window.location.href
    }
    
    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setShowShareModal(true)
        }
      }
    } else {
      setShowShareModal(true)
    }
  }

  // Zoom to curve
  const handleCurveClick = (curve) => {
    setSelectedCurve(curve)
    if (mapRef.current && curve.position) {
      mapRef.current.flyTo({
        center: curve.position,
        zoom: 16,
        pitch: 45,
        duration: 1000
      })
    }
  }

  // Build colored route segments
  const buildColoredRouteSegments = useCallback((coordinates, curves) => {
    if (!coordinates || coordinates.length < 2) return []
    
    const segments = []
    let currentIndex = 0
    const sortedCurves = [...(curves || [])].sort((a, b) => 
      (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
    )
    const totalPoints = coordinates.length
    
    sortedCurves.forEach((curve) => {
      const curveProgress = (curve.distanceFromStart || 0) / (routeData?.distance || 15000)
      const curveIndex = Math.floor(curveProgress * totalPoints)
      const approachStart = Math.max(currentIndex, curveIndex - Math.floor(totalPoints * 0.02))
      
      if (approachStart > currentIndex) {
        segments.push({ coordinates: coordinates.slice(currentIndex, approachStart + 1), color: '#22c55e' })
      }
      
      const curveEnd = Math.min(curveIndex + Math.floor(totalPoints * 0.01), totalPoints - 1)
      segments.push({ coordinates: coordinates.slice(approachStart, curveEnd + 1), color: getCurveColor(curve.severity) })
      currentIndex = curveEnd
    })
    
    if (currentIndex < totalPoints - 1) {
      segments.push({ coordinates: coordinates.slice(currentIndex), color: '#22c55e' })
    }
    
    return segments
  }, [routeData?.distance])

  // Add route to map
  const addRouteToMap = useCallback((mapInstance, routeCoords, curves, animate = true) => {
    if (!mapInstance || !routeCoords) return

    ['route-glow', 'route-line'].forEach(id => {
      if (mapInstance.getLayer(id)) mapInstance.removeLayer(id)
    })
    if (mapInstance.getSource('route')) mapInstance.removeSource('route')
    
    for (let i = 0; i < 100; i++) {
      if (mapInstance.getLayer(`route-segment-${i}`)) mapInstance.removeLayer(`route-segment-${i}`)
      if (mapInstance.getSource(`route-segment-${i}`)) mapInstance.removeSource(`route-segment-${i}`)
    }

    mapInstance.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } }
    })

    mapInstance.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-blur': 10, 'line-opacity': 0.2 }
    })

    const segments = buildColoredRouteSegments(routeCoords, curves)
    
    segments.forEach((segment, i) => {
      mapInstance.addSource(`route-segment-${i}`, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: segment.coordinates } }
      })
      
      mapInstance.addLayer({
        id: `route-segment-${i}`,
        type: 'line',
        source: `route-segment-${i}`,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': segment.color, 'line-width': 5, 'line-opacity': animate ? 0 : 1 }
      })
    })

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
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Start marker
    const startEl = document.createElement('div')
    startEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:32px;height:32px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(34,197,94,0.5);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
        </div>
        <div style="font-size:10px;color:white;background:#22c55e;padding:2px 6px;border-radius:4px;margin-top:4px;font-weight:600;">START</div>
      </div>
    `
    markersRef.current.push(new mapboxgl.Marker({ element: startEl, anchor: 'bottom' }).setLngLat(routeCoords[0]).addTo(mapInstance))

    // End marker
    const endEl = document.createElement('div')
    endEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:32px;height:32px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(239,68,68,0.5);display:flex;align-items:center;justify-content:center;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
        </div>
        <div style="font-size:10px;color:white;background:#ef4444;padding:2px 6px;border-radius:4px;margin-top:4px;font-weight:600;">FINISH</div>
      </div>
    `
    markersRef.current.push(new mapboxgl.Marker({ element: endEl, anchor: 'bottom' }).setLngLat(routeCoords[routeCoords.length - 1]).addTo(mapInstance))

    // Curve markers
    if (curves) {
      curves.forEach((curve) => {
        const color = getCurveColor(curve.severity)
        const el = document.createElement('div')
        el.style.cursor = 'pointer'
        
        const isHardest = hardestSection && curve.id === hardestSection.id
        const borderStyle = isHardest ? `3px solid ${color}` : `2px solid ${color}`
        const shadowStyle = isHardest ? `0 0 20px ${color}80, 0 0 40px ${color}40` : `0 2px 10px ${color}40`
        
        if (curve.isChicane) {
          const dirChar = curve.startDirection === 'LEFT' ? 'L' : 'R'
          const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:${borderStyle};box-shadow:${shadowStyle};transition:transform 0.2s;">
              <span style="font-size:8px;font-weight:700;color:${color};letter-spacing:0.5px;">${typeLabel}${dirChar}</span>
              <span style="font-size:12px;font-weight:700;color:${color};">${curve.severitySequence}</span>
              ${isHardest ? '<span style="font-size:7px;color:#ff3366;font-weight:700;">HARDEST</span>' : ''}
            </div>
          `
        } else {
          const isLeft = curve.direction === 'LEFT'
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:4px 8px;border-radius:8px;border:${borderStyle};box-shadow:${shadowStyle};transition:transform 0.2s;">
              <div style="display:flex;align-items:center;gap:2px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="${color}" style="transform:${isLeft ? 'scaleX(-1)' : 'none'}">
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
                <span style="font-size:14px;font-weight:700;color:${color};">${curve.severity}</span>
              </div>
              ${isHardest ? '<span style="font-size:7px;color:#ff3366;font-weight:700;">HARDEST</span>' : ''}
            </div>
          `
        }
        
        el.onclick = () => handleCurveClick(curve)
        markersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(curve.position).addTo(mapInstance))
      })
    }
  }, [hardestSection])

  // Rebuild route
  const rebuildRoute = useCallback((newRouteData) => {
    if (!mapRef.current) return
    const rd = newRouteData || routeData
    if (!rd?.coordinates) return
    
    addRouteToMap(mapRef.current, rd.coordinates, rd.curves, false)
    addMarkersToMap(mapRef.current, rd.coordinates, rd.curves)
    
    const bounds = rd.coordinates.reduce((b, coord) => b.extend(coord), 
      new mapboxgl.LngLatBounds(rd.coordinates[0], rd.coordinates[0]))
    mapRef.current.fitBounds(bounds, { padding: { top: 100, bottom: 400, left: 50, right: 50 }, duration: 500 })
  }, [routeData, addRouteToMap, addMarkersToMap])

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainer || !routeData?.coordinates) return

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

      const bounds = routeData.coordinates.reduce((b, coord) => b.extend(coord), 
        new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      
      setTimeout(() => {
        mapRef.current?.fitBounds(bounds, { padding: { top: 100, bottom: 400, left: 50, right: 50 }, duration: 1500 })
      }, 200)
    })

    return () => {
      markersRef.current.forEach(m => m.remove())
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [mapContainer, routeData, mapStyle, addRouteToMap, addMarkersToMap])

  // Handle style change
  const handleStyleChange = useCallback((newStyle) => {
    setMapStyle(newStyle)
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[newStyle])
      mapRef.current.once('style.load', () => rebuildRoute())
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

  // Loading states
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
          <button onClick={onBack} className="px-6 py-2 bg-white/10 rounded-lg text-white">Go Back</button>
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
        <div className="flex flex-col gap-2">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
          </button>
          <MapStyleButton currentStyle={mapStyle} onStyleChange={handleStyleChange} />
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="px-3 py-1.5 rounded-full backdrop-blur-xl border flex items-center gap-2" style={{ background: `${difficultyRating.color}20`, borderColor: `${difficultyRating.color}50` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={difficultyRating.color}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span className="text-xs font-bold" style={{ color: difficultyRating.color }}>{difficultyRating.label}</span>
          </div>

          {routeMode !== 'demo' && (
            <button onClick={handleToggleFavorite} className={`w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center ${isRouteFavorite ? 'bg-amber-500/20 border-amber-500/30' : 'bg-black/60 border-white/10'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={isRouteFavorite ? '#f59e0b' : 'none'} stroke={isRouteFavorite ? '#f59e0b' : 'white'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          )}

          {routeMode === 'demo' && (
            <div className="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30">
              <span className="text-purple-400 text-xs font-bold tracking-wider">DEMO</span>
            </div>
          )}
        </div>
      </div>

      {/* Fly-through overlay */}
      {isFlying && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
          <button onClick={stopFlyThrough} className="px-6 py-3 bg-red-500 rounded-xl text-white font-bold flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            Stop Preview
          </button>
        </div>
      )}

      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent pt-6 pb-4 px-4">
          
          {/* Mode Selector */}
          <div className="flex justify-center mb-2">
            <div className="inline-flex bg-black/60 backdrop-blur-xl rounded-full p-0.5 border border-white/10">
              {[{ id: 'cruise', label: 'Cruise', color: '#00d4ff' }, { id: 'fast', label: 'Fast', color: '#ffd500' }, { id: 'race', label: 'Race', color: '#ff3366' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider transition-all" style={{ background: mode === m.id ? m.color : 'transparent', color: mode === m.id ? (m.id === 'fast' ? 'black' : 'white') : 'rgba(255,255,255,0.5)' }}>
                  {m.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Route Stats - Compact */}
          <div className="flex justify-between items-center mb-2 px-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-white">{routeStats.distance}</span>
              <span className="text-[10px] text-white/40">{settings.units === 'metric' ? 'km' : 'mi'}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-white">{routeStats.duration}</span>
              <span className="text-[10px] text-white/40">min</span>
            </div>
            <button onClick={() => setShowCurveList(true)} className="flex items-baseline gap-1 hover:opacity-80">
              <span className="text-xl font-bold text-white">{routeStats.curves}</span>
              <span className="text-[10px] text-white/40">curves</span>
            </button>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-red-400">{routeStats.sharpCurves}</span>
              <span className="text-[10px] text-white/40">sharp</span>
            </div>
          </div>

          {/* Severity Bar */}
          <div className="mb-2">
            <div className="flex h-1 rounded-full overflow-hidden bg-white/10">
              <div className="h-full" style={{ width: `${(severityBreakdown.easy / routeStats.curves) * 100 || 0}%`, background: '#22c55e' }} />
              <div className="h-full" style={{ width: `${(severityBreakdown.medium / routeStats.curves) * 100 || 0}%`, background: '#ffd500' }} />
              <div className="h-full" style={{ width: `${(severityBreakdown.hard / routeStats.curves) * 100 || 0}%`, background: '#ff3366' }} />
            </div>
          </div>

          {/* Action Row - Inline icons */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <IconButton icon="reverse" onClick={handleReverseRoute} tooltip="Reverse" />
              <IconButton icon="fly" onClick={handleFlyThrough} disabled={isFlying} tooltip="Preview" />
              <IconButton icon="voice" onClick={handleSampleCallout} tooltip="Test Voice" />
              <IconButton icon="share" onClick={handleShare} tooltip="Share" />
            </div>
            <button
              onClick={handleDownload}
              disabled={isDownloading || downloadComplete || !navigator.onLine}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                downloadComplete ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {isDownloading ? (
                <div className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              ) : downloadComplete ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              )}
              {downloadComplete ? 'Offline Ready' : 'Download Voice'}
            </button>
          </div>

          {/* Start Button */}
          <button onClick={handleStart} className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all" style={{ background: modeColor }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {routeMode === 'demo' ? 'START DEMO' : 'START NAVIGATION'}
          </button>
        </div>
      </div>

      {/* Elevation Widget - Small on map */}
      <ElevationWidget 
        data={elevationProfile} 
        curves={routeData?.curves}
        modeColor={modeColor}
        expanded={showElevationExpanded}
        onToggle={() => setShowElevationExpanded(!showElevationExpanded)}
        settings={settings}
        totalDistance={routeData?.distance}
      />

      {/* Curve List Modal */}
      {showCurveList && (
        <CurveListModal 
          curves={routeData?.curves || []} 
          mode={mode}
          settings={settings}
          hardestId={hardestSection?.id}
          onSelect={handleCurveClick}
          onClose={() => setShowCurveList(false)} 
        />
      )}

      {/* Curve Detail Popup */}
      {selectedCurve && !showCurveList && (
        <CurveDetailPopup 
          curve={selectedCurve} 
          mode={mode}
          settings={settings}
          onClose={() => setSelectedCurve(null)} 
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal 
          routeName={routeData?.name}
          onClose={() => setShowShareModal(false)} 
        />
      )}

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

// Elevation Widget - Compact and expandable
function ElevationWidget({ data, curves, modeColor, expanded, onToggle, settings, totalDistance }) {
  if (!data || data.length < 2) return null
  
  const maxElev = Math.max(...data.map(d => d.elevation))
  const minElev = Math.min(...data.map(d => d.elevation))
  const range = maxElev - minElev || 1
  const elevGain = Math.round(maxElev - minElev)
  const isMetric = settings?.units === 'metric'
  const elevGainDisplay = isMetric ? `${Math.round(elevGain * 0.3048)}m` : `${elevGain}ft`
  
  const glassStyle = {
    background: 'rgba(10,10,15,0.9)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)'
  }
  
  if (!expanded) {
    // Compact widget - positioned on right side
    return (
      <button 
        onClick={onToggle}
        className="absolute right-4 z-20 rounded-xl px-2 py-1.5 cursor-pointer transition-all active:scale-95"
        style={{ top: '200px', ...glassStyle }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/40 uppercase">Elev</span>
          <span className="text-[11px] text-white/70 font-medium">{elevGainDisplay}</span>
        </div>
        <svg viewBox="0 0 60 20" className="w-16 h-5 mt-1">
          <defs>
            <linearGradient id="elevMiniGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={modeColor} stopOpacity="0.4"/>
              <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* Simple area fill */}
          <path 
            d={`M 0 20 ${data.slice(0, 20).map((d, i) => {
              const x = (i / 19) * 60
              const y = 20 - ((d.elevation - minElev) / range) * 16
              return `L ${x} ${y}`
            }).join(' ')} L 60 20 Z`}
            fill="url(#elevMiniGrad)"
          />
          <path 
            d={data.slice(0, 20).map((d, i) => {
              const x = (i / 19) * 60
              const y = 20 - ((d.elevation - minElev) / range) * 16
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
            }).join(' ')}
            fill="none" 
            stroke={modeColor} 
            strokeWidth="1.5"
          />
        </svg>
      </button>
    )
  }
  
  // Expanded view
  return (
    <div className="absolute left-4 right-4 z-30" style={{ top: '140px' }}>
      <div className="rounded-2xl p-3" style={glassStyle}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-white font-medium">Elevation Profile</span>
            <span className="text-[10px] text-white/50">Gain: {elevGainDisplay}</span>
          </div>
          <button onClick={onToggle} className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        
        <div className="relative">
          <svg viewBox="0 0 100 35" className="w-full h-16">
            <defs>
              <linearGradient id="elevExpandedGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={modeColor} stopOpacity="0.25"/>
                <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
              </linearGradient>
            </defs>
            
            {/* Grid */}
            {[0, 25, 50, 75, 100].map(x => (
              <line key={x} x1={x} y1="0" x2={x} y2="35" stroke="white" strokeOpacity="0.05" />
            ))}
            
            {/* Area */}
            <path 
              d={`M 0 35 ${data.map((d, i) => {
                const x = (i / (data.length - 1)) * 100
                const y = 35 - ((d.elevation - minElev) / range) * 30
                return `L ${x} ${y}`
              }).join(' ')} L 100 35 Z`}
              fill="url(#elevExpandedGrad)"
            />
            
            {/* Line */}
            <path 
              d={data.map((d, i) => {
                const x = (i / (data.length - 1)) * 100
                const y = 35 - ((d.elevation - minElev) / range) * 30
                return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
              }).join(' ')}
              fill="none" 
              stroke={modeColor} 
              strokeWidth="1.5"
            />
            
            {/* Curve markers */}
            {curves?.slice(0, 15).map((curve, i) => {
              const progress = (curve.distanceFromStart || 0) / (totalDistance || 15000)
              const x = progress * 100
              const dataIdx = Math.min(Math.floor(progress * (data.length - 1)), data.length - 1)
              const y = 35 - ((data[dataIdx]?.elevation - minElev) / range) * 30
              return <circle key={i} cx={x} cy={y} r="2" fill={getCurveColor(curve.severity)} />
            })}
          </svg>
          
          {/* Labels */}
          <div className="flex justify-between text-[9px] text-white/30 mt-1">
            <span>Start</span>
            <span>Finish</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Icon Button - Compact circular button
function IconButton({ icon, onClick, disabled, tooltip }) {
  const icons = {
    reverse: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
    fly: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>,
    share: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
    voice: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  }
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      title={tooltip}
      className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-all active:scale-95"
    >
      {icons[icon]}
    </button>
  )
}

// Map Style Button
function MapStyleButton({ currentStyle, onStyleChange }) {
  const [isOpen, setIsOpen] = useState(false)
  
  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
      </button>
    )
  }
  
  return (
    <div className="bg-black/80 backdrop-blur-xl rounded-xl border border-white/10 p-1">
      {[{ id: 'dark', label: 'Dark' }, { id: 'satellite', label: 'Satellite' }].map(style => (
        <button key={style.id} onClick={() => { onStyleChange(style.id); setIsOpen(false) }} className={`w-full px-3 py-2 rounded-lg text-xs font-medium text-left ${currentStyle === style.id ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/60 hover:bg-white/10'}`}>
          {style.label}
        </button>
      ))}
    </div>
  )
}

// Curve List Modal
function CurveListModal({ curves, mode, settings, hardestId, onSelect, onClose }) {
  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
    const mult = { cruise: 1.0, fast: 1.15, race: 1.3 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
    if (settings.units === 'metric') speed = Math.round(speed * 1.609)
    return speed
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-h-[70vh] bg-[#0d0d12] rounded-t-3xl border-t border-white/10 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-white font-bold">All Curves ({curves.length})</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="overflow-auto max-h-[calc(70vh-60px)] p-2">
          {curves.map((curve, i) => {
            const color = getCurveColor(curve.severity)
            const isHardest = curve.id === hardestId
            return (
              <button key={curve.id || i} onClick={() => { onSelect(curve); onClose() }} className={`w-full flex items-center gap-3 p-3 rounded-xl mb-1 transition-all ${isHardest ? 'bg-red-500/10 border border-red-500/30' : 'bg-white/5 hover:bg-white/10'}`}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, border: `2px solid ${color}` }}>
                  {curve.isChicane ? (
                    <span className="text-xs font-bold" style={{ color }}>{curve.severitySequence}</span>
                  ) : (
                    <span className="text-lg font-bold" style={{ color }}>{curve.severity}</span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {curve.isChicane ? (curve.chicaneType === 'CHICANE' ? 'Chicane' : 'S-Curve') : `${curve.direction === 'LEFT' ? 'Left' : 'Right'} ${curve.severity}`}
                    </span>
                    {curve.modifier && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">{curve.modifier}</span>}
                    {isHardest && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">HARDEST</span>}
                  </div>
                  <div className="text-xs text-white/40">
                    {Math.round((curve.distanceFromStart || 0) / (settings.units === 'metric' ? 1 : 3.28084))} {settings.units === 'metric' ? 'm' : 'ft'} from start
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color }}>{getSpeed(curve.severity)}</div>
                  <div className="text-[10px] text-white/40">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Curve Detail Popup
function CurveDetailPopup({ curve, mode, settings, onClose }) {
  const color = getCurveColor(curve.severity)
  const getSpeed = (severity) => {
    const speeds = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }
    const mult = { cruise: 1.0, fast: 1.15, race: 1.3 }
    let speed = Math.round((speeds[severity] || 40) * (mult[mode] || 1.0))
    if (settings.units === 'metric') speed = Math.round(speed * 1.609)
    return speed
  }
  
  return (
    <div className="absolute bottom-32 left-4 right-4 z-30">
      <div className="bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 p-4" style={{ borderColor: `${color}50` }}>
        <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: `${color}20`, border: `2px solid ${color}` }}>
            {curve.isChicane ? (
              <div className="text-center">
                <div className="text-[10px] font-bold" style={{ color }}>{curve.chicaneType}</div>
                <div className="text-xl font-bold" style={{ color }}>{curve.severitySequence}</div>
              </div>
            ) : (
              <div className="text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill={color} style={{ transform: curve.direction === 'LEFT' ? 'scaleX(-1)' : 'none' }}>
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
                <div className="text-2xl font-bold" style={{ color }}>{curve.severity}</div>
              </div>
            )}
          </div>
          
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg">
              {curve.isChicane ? `${curve.chicaneType} ${curve.startDirection}` : `${curve.direction} ${curve.severity}`}
            </h3>
            {curve.modifier && <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-white/10 text-white/70">{curve.modifier}</span>}
            
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-xl font-bold" style={{ color }}>{getSpeed(curve.severity)}</div>
                <div className="text-[9px] text-white/40">{settings.units === 'metric' ? 'KM/H' : 'MPH'}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-xl font-bold text-white">{curve.radius || '?'}</div>
                <div className="text-[9px] text-white/40">RADIUS M</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-xl font-bold text-white">{curve.totalAngle || '?'}</div>
                <div className="text-[9px] text-white/40">DEGREES</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Share Modal
function ShareModal({ routeName, onClose }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.href
  
  const handleCopy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#0d0d12] rounded-2xl border border-white/10 p-6 w-full max-w-sm">
        <h3 className="text-white font-bold text-lg mb-4">Share Route</h3>
        <p className="text-white/60 text-sm mb-4">{routeName || 'Rally Co-Pilot Route'}</p>
        
        <div className="flex gap-2">
          <input type="text" value={url} readOnly className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
          <button onClick={handleCopy} className={`px-4 py-2 rounded-lg font-medium text-sm ${copied ? 'bg-green-500 text-white' : 'bg-cyan-500 text-black'}`}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        
        <button onClick={onClose} className="w-full mt-4 py-2 bg-white/10 rounded-lg text-white/60 text-sm">Close</button>
      </div>
    </div>
  )
}
