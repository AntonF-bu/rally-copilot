import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech, generateCallout } from '../hooks/useSpeech'
import { getRoute } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'
import { detectZones, ZONE_COLORS } from '../services/zoneService'

// ================================
// Route Preview - v11
// With zone detection and edit route button
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const DEMO_START = [-71.0589, 42.3601]
const DEMO_END = [-71.3012, 42.3665]

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
}

export default function RoutePreview({ onStartNavigation, onBack, onEdit }) {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const zoneLayersRef = useRef([])
  const [mapContainer, setMapContainer] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapStyle, setMapStyle] = useState('dark')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [selectedCurve, setSelectedCurve] = useState(null)
  const [showCurveList, setShowCurveList] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showZones, setShowZones] = useState(true)
  
  // Fly-through state
  const [isFlying, setIsFlying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [flySpeed, setFlySpeed] = useState(1)
  const flyAnimationRef = useRef(null)
  const flyIndexRef = useRef(0)
  
  // Elevation state
  const [elevationData, setElevationData] = useState([])
  const [isLoadingElevation, setIsLoadingElevation] = useState(false)
  
  const fetchedRef = useRef(false)
  const elevationFetchedRef = useRef(false)
  const zonesFetchedRef = useRef(false)
  
  // Zone state
  const [zones, setZones] = useState([])
  const [isLoadingZones, setIsLoadingZones] = useState(false)
  
  const { 
    routeData, mode, setMode, routeMode, setRouteData, 
    isFavorite, toggleFavorite, settings,
    globalZoneOverrides, routeZoneOverrides, setRouteZones,
    editedCurves, customCallouts
  } = useStore()
  const { initAudio, preloadRouteAudio, speak } = useSpeech()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  
  // Check if route has edits
  const hasEdits = editedCurves?.length > 0 || customCallouts?.length > 0 || routeZoneOverrides?.length > 0
  
  const isRouteFavorite = routeData?.name ? isFavorite(routeData.name) : false
  const handleToggleFavorite = () => { if (routeData) toggleFavorite(routeData) }

  const mapContainerRef = useCallback((node) => { if (node) setMapContainer(node) }, [])

  // Route stats
  const routeStats = useMemo(() => {
    const dist = routeData?.distance ? (routeData.distance / (settings.units === 'metric' ? 1000 : 1609.34)) : 0
    return {
      distance: dist.toFixed(1),
      distanceUnit: settings.units === 'metric' ? 'km' : 'mi',
      duration: routeData?.duration ? Math.round(routeData.duration / 60) : 0,
      curves: routeData?.curves?.length || 0,
      sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0
    }
  }, [routeData, settings.units])

  const severityBreakdown = useMemo(() => ({
    easy: routeData?.curves?.filter(c => c.severity <= 2).length || 0,
    medium: routeData?.curves?.filter(c => c.severity === 3 || c.severity === 4).length || 0,
    hard: routeData?.curves?.filter(c => c.severity >= 5).length || 0
  }), [routeData])

  const difficultyRating = useMemo(() => {
    if (!routeData?.curves?.length) return { label: 'Unknown', color: '#666' }
    const avgSeverity = routeData.curves.reduce((sum, c) => sum + c.severity, 0) / routeData.curves.length
    const hardRatio = severityBreakdown.hard / routeData.curves.length
    const score = avgSeverity * 0.5 + hardRatio * 10 * 0.5
    if (score < 2) return { label: 'Easy', color: '#22c55e' }
    if (score < 3) return { label: 'Moderate', color: '#ffd500' }
    if (score < 4) return { label: 'Challenging', color: '#f97316' }
    return { label: 'Expert', color: '#ff3366' }
  }, [routeData, severityBreakdown])

  const elevationGain = useMemo(() => {
    if (!elevationData.length) return 0
    let gain = 0
    for (let i = 1; i < elevationData.length; i++) {
      const diff = elevationData[i].elevation - elevationData[i-1].elevation
      if (diff > 0) gain += diff
    }
    return Math.round(settings.units === 'metric' ? gain : gain * 3.28084)
  }, [elevationData, settings.units])

  // Fetch elevation
  const fetchElevationData = useCallback(async (coordinates) => {
    if (!coordinates?.length || coordinates.length < 2 || elevationFetchedRef.current) return
    elevationFetchedRef.current = true
    setIsLoadingElevation(true)
    
    try {
      const numSamples = Math.min(40, coordinates.length)
      const step = Math.max(1, Math.floor(coordinates.length / numSamples))
      const samplePoints = []
      for (let i = 0; i < coordinates.length; i += step) samplePoints.push(coordinates[i])
      if (samplePoints[samplePoints.length - 1] !== coordinates[coordinates.length - 1]) {
        samplePoints.push(coordinates[coordinates.length - 1])
      }
      
      const elevations = await Promise.all(
        samplePoints.map(async (coord, idx) => {
          try {
            const response = await fetch(`https://api.mapbox.com/v4/mapbox.mapbox-terrain-v2/tilequery/${coord[0]},${coord[1]}.json?layers=contour&access_token=${mapboxgl.accessToken}`)
            const data = await response.json()
            let elevation = 0
            if (data.features?.length > 0) {
              const contours = data.features.filter(f => f.properties?.ele !== undefined)
              if (contours.length > 0) elevation = Math.max(...contours.map(f => f.properties.ele))
            }
            return { coord, elevation, distance: (idx / (samplePoints.length - 1)) * (routeData?.distance || 15000) }
          } catch { return { coord, elevation: 0, distance: (idx / (samplePoints.length - 1)) * (routeData?.distance || 15000) } }
        })
      )
      
      const smoothed = elevations.map((point, i) => {
        if (i === 0 || i === elevations.length - 1) return point
        return { ...point, elevation: (elevations[i-1].elevation + point.elevation + elevations[i+1].elevation) / 3 }
      })
      setElevationData(smoothed)
    } catch (err) { console.error('Elevation error:', err) } 
    finally { setIsLoadingElevation(false) }
  }, [routeData?.distance])

  useEffect(() => {
    if (routeMode === 'demo' && !routeData?.coordinates && !fetchedRef.current) {
      fetchedRef.current = true
      fetchDemoRoute()
    }
  }, [routeMode])

  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && !elevationFetchedRef.current) {
      fetchElevationData(routeData.coordinates)
    }
  }, [routeData?.coordinates, fetchElevationData])

  // Fetch zones
  const fetchZones = useCallback(async (coordinates) => {
    if (!coordinates?.length || coordinates.length < 2 || zonesFetchedRef.current) return
    zonesFetchedRef.current = true
    setIsLoadingZones(true)
    
    try {
      const allOverrides = [...(globalZoneOverrides || []), ...(routeZoneOverrides || [])]
      const detectedZones = await detectZones(coordinates, allOverrides)
      setZones(detectedZones)
      setRouteZones(detectedZones)
    } catch (err) {
      console.error('Zone detection error:', err)
    } finally {
      setIsLoadingZones(false)
    }
  }, [globalZoneOverrides, routeZoneOverrides, setRouteZones])

  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && !zonesFetchedRef.current) {
      fetchZones(routeData.coordinates)
    }
  }, [routeData?.coordinates, fetchZones])

  const fetchDemoRoute = async () => {
    setIsLoadingRoute(true)
    try {
      const route = await getRoute(DEMO_START, DEMO_END)
      if (route?.coordinates?.length > 10) {
        const curves = detectCurves(route.coordinates)
        setRouteData({ name: "Boston to Weston Demo", coordinates: route.coordinates, curves, distance: route.distance, duration: route.duration })
      } else { setLoadError('Could not load demo route') }
    } catch { setLoadError('Failed to fetch route') } 
    finally { setIsLoadingRoute(false) }
  }

  const handleReverseRoute = () => {
    if (!routeData?.coordinates) return
    const reversed = {
      ...routeData,
      coordinates: [...routeData.coordinates].reverse(),
      curves: routeData.curves?.map(curve => ({
        ...curve,
        direction: curve.direction === 'LEFT' ? 'RIGHT' : 'LEFT',
        distanceFromStart: (routeData.distance || 15000) - (curve.distanceFromStart || 0)
      })).reverse()
    }
    setRouteData(reversed)
    elevationFetchedRef.current = false
    setElevationData([])
    if (mapRef.current && mapLoaded) rebuildRoute(reversed)
  }

  // Fly animation
  const startFlyAnimation = useCallback(() => {
    if (!mapRef.current || !routeData?.coordinates) return
    const coords = routeData.coordinates
    
    const getBearing = (start, end) => {
      const dLon = (end[0] - start[0]) * Math.PI / 180
      const lat1 = start[1] * Math.PI / 180, lat2 = end[1] * Math.PI / 180
      const y = Math.sin(dLon) * Math.cos(lat2)
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
      return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    }
    
    const animate = () => {
      if (flyIndexRef.current >= coords.length - 1) { stopFlyThrough(); return }
      const current = coords[flyIndexRef.current]
      const next = coords[Math.min(flyIndexRef.current + 5, coords.length - 1)]
      mapRef.current?.easeTo({ center: current, bearing: getBearing(current, next), pitch: 60, zoom: 15, duration: 80 / flySpeed })
      flyIndexRef.current += Math.ceil(2 * flySpeed)
      flyAnimationRef.current = requestAnimationFrame(animate)
    }
    flyAnimationRef.current = requestAnimationFrame(animate)
  }, [routeData, flySpeed])

  const handleFlyThrough = () => {
    if (!mapRef.current || !routeData?.coordinates || isFlying) return
    setIsFlying(true)
    setIsPaused(false)
    flyIndexRef.current = 0
    mapRef.current.easeTo({ center: routeData.coordinates[0], pitch: 60, zoom: 14, duration: 800 })
    setTimeout(() => startFlyAnimation(), 800)
  }

  const toggleFlyPause = () => {
    if (!isFlying) return
    if (isPaused) { setIsPaused(false); startFlyAnimation() } 
    else { setIsPaused(true); if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current) }
  }

  const stopFlyThrough = () => {
    if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
    setIsFlying(false)
    setIsPaused(false)
    flyIndexRef.current = 0
    if (mapRef.current && routeData?.coordinates) {
      const bounds = routeData.coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      mapRef.current.fitBounds(bounds, { padding: { top: 120, bottom: 160, left: 40, right: 40 }, duration: 1000, pitch: 0 })
    }
  }

  useEffect(() => {
    if (isFlying && !isPaused) {
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      startFlyAnimation()
    }
  }, [flySpeed, isFlying, isPaused, startFlyAnimation])

  const handleSampleCallout = async () => {
    await initAudio()
    const curve = routeData?.curves?.find(c => c.severity >= 3) || routeData?.curves?.[0]
    if (curve) speak(generateCallout(curve, mode, settings.units === 'metric' ? 'kmh' : 'mph'), 'high')
  }

  const handleShare = async () => {
    const data = { title: routeData?.name || 'Rally Route', text: `${routeStats.distance}${routeStats.distanceUnit}, ${routeStats.curves} curves`, url: location.href }
    if (navigator.share) { try { await navigator.share(data) } catch {} } 
    else setShowShareModal(true)
  }

  const handleCurveClick = (curve) => {
    setSelectedCurve(curve)
    setShowCurveList(false)
    if (mapRef.current && curve.position) mapRef.current.flyTo({ center: curve.position, zoom: 16, pitch: 45, duration: 800 })
  }

  const handleDownload = async () => {
    if (isDownloading || !routeData?.curves?.length) return
    setIsDownloading(true)
    try { const result = await preloadRouteAudio(routeData.curves); if (result.success) setDownloadComplete(true) } 
    catch {} finally { setIsDownloading(false) }
  }

  const handleStart = async () => { await initAudio(); onStartNavigation() }

  // Build route segments
  const buildSegments = useCallback((coords, curves) => {
    if (!coords?.length) return []
    const segments = [], total = coords.length
    let idx = 0
    const sorted = [...(curves || [])].sort((a, b) => (a.distanceFromStart || 0) - (b.distanceFromStart || 0))
    sorted.forEach(curve => {
      const progress = (curve.distanceFromStart || 0) / (routeData?.distance || 15000)
      const curveIdx = Math.floor(progress * total)
      const start = Math.max(idx, curveIdx - Math.floor(total * 0.02))
      if (start > idx) segments.push({ coords: coords.slice(idx, start + 1), color: '#22c55e' })
      const end = Math.min(curveIdx + Math.floor(total * 0.01), total - 1)
      segments.push({ coords: coords.slice(start, end + 1), color: getCurveColor(curve.severity) })
      idx = end
    })
    if (idx < total - 1) segments.push({ coords: coords.slice(idx), color: '#22c55e' })
    return segments
  }, [routeData?.distance])

  const addRoute = useCallback((map, coords, curves) => {
    if (!map || !coords?.length) return
    const segs = buildSegments(coords, curves)
    segs.forEach((seg, i) => {
      const src = `seg-${i}`, line = `line-${i}`, glow = `glow-${i}`
      if (!map.getSource(src)) {
        map.addSource(src, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } })
        map.addLayer({ id: glow, type: 'line', source: src, paint: { 'line-color': seg.color, 'line-width': 10, 'line-blur': 6, 'line-opacity': 0.4 } })
        map.addLayer({ id: line, type: 'line', source: src, paint: { 'line-color': seg.color, 'line-width': 4 } })
      }
    })
  }, [buildSegments])

  const addMarkers = useCallback((map, curves, coords) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    if (!map || !coords?.length) return
    
    const startEl = document.createElement('div')
    startEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:18px;height:18px;background:#22c55e;border:2px solid white;border-radius:50%;"></div><div style="font-size:8px;color:white;background:#000a;padding:1px 4px;border-radius:3px;margin-top:2px;">START</div></div>`
    markersRef.current.push(new mapboxgl.Marker({ element: startEl }).setLngLat(coords[0]).addTo(map))
    
    const endEl = document.createElement('div')
    endEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;"><div style="width:18px;height:18px;background:#ef4444;border:2px solid white;border-radius:50%;"></div><div style="font-size:8px;color:white;background:#000a;padding:1px 4px;border-radius:3px;margin-top:2px;">FINISH</div></div>`
    markersRef.current.push(new mapboxgl.Marker({ element: endEl }).setLngLat(coords[coords.length - 1]).addTo(map))
    
    curves?.forEach(curve => {
      if (!curve.position) return
      const color = getCurveColor(curve.severity)
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      if (curve.isChicane) {
        el.innerHTML = `<div style="background:#000d;padding:2px 5px;border-radius:5px;border:1px solid ${color};font-size:9px;font-weight:700;color:${color};text-align:center;">${curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}${curve.startDirection === 'LEFT' ? '←' : '→'}<br/>${curve.severitySequence}</div>`
      } else {
        el.innerHTML = `<div style="display:flex;align-items:center;gap:2px;background:#000d;padding:2px 5px;border-radius:5px;border:1px solid ${color};"><svg width="9" height="9" viewBox="0 0 24 24" fill="${color}" style="transform:${curve.direction === 'LEFT' ? 'scaleX(-1)' : 'none'}"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg><span style="font-size:11px;font-weight:700;color:${color};">${curve.severity}</span></div>`
      }
      el.onclick = () => handleCurveClick(curve)
      markersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(curve.position).addTo(map))
    })
  }, [])

  const rebuildRoute = useCallback((data = routeData) => {
    if (!mapRef.current || !data?.coordinates) return
    for (let i = 0; i < 50; i++) {
      ['line-', 'glow-'].forEach(p => { if (mapRef.current.getLayer(p + i)) mapRef.current.removeLayer(p + i) })
      if (mapRef.current.getSource('seg-' + i)) mapRef.current.removeSource('seg-' + i)
    }
    addRoute(mapRef.current, data.coordinates, data.curves)
    addMarkers(mapRef.current, data.curves, data.coordinates)
  }, [routeData, addRoute, addMarkers])

  // Add zone overlays to map
  const addZoneOverlays = useCallback((map, zonesToRender) => {
    if (!map || !zonesToRender?.length) return
    
    // Remove existing zone layers
    zoneLayersRef.current.forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(id)) map.removeSource(id)
    })
    zoneLayersRef.current = []
    
    zonesToRender.forEach((zone, i) => {
      if (!zone.coordinates?.length || zone.coordinates.length < 2) return
      
      const colors = ZONE_COLORS[zone.type] || ZONE_COLORS.rural
      const sourceId = `zone-${i}`
      const fillId = `zone-fill-${i}`
      const lineId = `zone-line-${i}`
      
      // Create buffer polygon around route segment
      const bufferCoords = createRouteBuffer(zone.coordinates, 0.0006)
      if (bufferCoords.length < 4) return
      
      try {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [bufferCoords] } }
        })
        
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: { 'fill-color': colors.label, 'fill-opacity': 0.08 }
        }, 'route-line')
        
        map.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          paint: { 'line-color': colors.border, 'line-width': 1.5, 'line-dasharray': [3, 2] }
        }, 'route-line')
        
        zoneLayersRef.current.push(sourceId, fillId, lineId)
      } catch (err) {
        console.log('Zone layer error:', err.message)
      }
    })
  }, [])

  // Create buffer polygon around route
  const createRouteBuffer = (coords, bufferSize) => {
    if (!coords?.length || coords.length < 2) return []
    const left = [], right = []
    
    for (let i = 0; i < coords.length; i++) {
      const curr = coords[i]
      const next = coords[i + 1] || coords[i]
      const prev = coords[i - 1] || coords[i]
      
      const dx = next[0] - prev[0]
      const dy = next[1] - prev[1]
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      
      const perpX = -dy / len * bufferSize
      const perpY = dx / len * bufferSize
      
      left.push([curr[0] + perpX, curr[1] + perpY])
      right.push([curr[0] - perpX, curr[1] - perpY])
    }
    
    return [...left, ...right.reverse(), left[0]]
  }

  // Render zones when they change
  useEffect(() => {
    if (mapLoaded && mapRef.current && zones.length > 0 && showZones) {
      // Wait for route to be added first
      setTimeout(() => addZoneOverlays(mapRef.current, zones), 100)
    }
  }, [mapLoaded, zones, showZones, addZoneOverlays])

  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates || mapRef.current) return
    mapRef.current = new mapboxgl.Map({ container: mapContainer, style: MAP_STYLES[mapStyle], center: routeData.coordinates[0], zoom: 10, pitch: 0 })
    mapRef.current.on('load', () => {
      setMapLoaded(true)
      addRoute(mapRef.current, routeData.coordinates, routeData.curves)
      addMarkers(mapRef.current, routeData.curves, routeData.coordinates)
      const bounds = routeData.coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      mapRef.current.fitBounds(bounds, { padding: { top: 120, bottom: 160, left: 40, right: 40 }, duration: 1000 })
    })
    mapRef.current.on('style.load', () => rebuildRoute())
    return () => { markersRef.current.forEach(m => m.remove()); zoneLayersRef.current = []; if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current); mapRef.current?.remove(); mapRef.current = null }
  }, [mapContainer, routeData, mapStyle, addRoute, addMarkers, rebuildRoute])

  const handleStyleChange = () => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  if (isLoadingRoute) return <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center"><div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
  if (loadError) return <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center flex-col gap-4"><p className="text-red-400">{loadError}</p><button onClick={onBack} className="px-4 py-2 bg-white/10 rounded">Back</button></div>

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* TOP BAR - Stats + Severity */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0f]/90 to-transparent">
        {/* Navigation row */}
        <div className="flex items-center justify-between p-2 pt-10">
          <div className="flex items-center gap-1.5">
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            </button>
            <button onClick={handleStyleChange} className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">{mapStyle === 'dark' ? <><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}</svg>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Elevation mini */}
            <div className="px-2 py-1 rounded-full bg-black/70 border border-white/10 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2"><path d="M2 22L12 2l10 20H2z"/></svg>
              <span className="text-[10px] text-white/80">{isLoadingElevation ? '...' : `${elevationGain}${settings.units === 'metric' ? 'm' : 'ft'}`}</span>
            </div>
            {/* Difficulty */}
            <div className="px-2 py-1 rounded-full border flex items-center gap-1" style={{ background: `${difficultyRating.color}20`, borderColor: `${difficultyRating.color}50` }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill={difficultyRating.color}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              <span className="text-[10px] font-bold" style={{ color: difficultyRating.color }}>{difficultyRating.label}</span>
            </div>
            {/* Favorite */}
            {routeMode !== 'demo' && (
              <button onClick={handleToggleFavorite} className={`w-9 h-9 rounded-full border flex items-center justify-center ${isRouteFavorite ? 'bg-amber-500/20 border-amber-500/30' : 'bg-black/70 border-white/10'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isRouteFavorite ? '#f59e0b' : 'none'} stroke={isRouteFavorite ? '#f59e0b' : 'white'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Stats row - tappable to open curve list */}
        <button onClick={() => setShowCurveList(true)} className="w-full flex items-center justify-center gap-3 px-3 py-1.5 hover:bg-white/5">
          <span className="text-white font-bold text-lg">{routeStats.distance}</span>
          <span className="text-white/50 text-sm">{routeStats.distanceUnit}</span>
          <span className="text-white/30">•</span>
          <span className="text-white font-bold text-lg">{routeStats.duration}</span>
          <span className="text-white/50 text-sm">min</span>
          <span className="text-white/30">•</span>
          <span className="text-white font-bold text-lg">{routeStats.curves}</span>
          <span className="text-white/50 text-sm">curves</span>
          <span className="text-white/30">•</span>
          <span className="text-red-400 font-bold text-lg">{routeStats.sharpCurves}</span>
          <span className="text-white/50 text-sm">sharp</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="ml-1 opacity-40"><path d="M6 9l6 6 6-6"/></svg>
        </button>

        {/* Severity bar */}
        <div className="h-1 mx-3 mb-2 rounded-full overflow-hidden bg-white/10">
          <div className="h-full flex">
            <div style={{ width: `${(severityBreakdown.easy / routeStats.curves) * 100}%`, background: '#22c55e' }} />
            <div style={{ width: `${(severityBreakdown.medium / routeStats.curves) * 100}%`, background: '#ffd500' }} />
            <div style={{ width: `${(severityBreakdown.hard / routeStats.curves) * 100}%`, background: '#ff3366' }} />
          </div>
        </div>
      </div>

      {/* ELEVATION - Right side mini widget */}
      {elevationData.length > 0 && (
        <div className="absolute right-2 z-20" style={{ top: '180px' }}>
          <div className="bg-black/80 rounded-lg p-1.5 border border-white/10 w-24">
            <div className="text-[8px] text-white/50 mb-0.5">ELEVATION</div>
            <MiniElevation data={elevationData} color={modeColor} />
          </div>
        </div>
      )}

      {/* FLY CONTROLS - Center when flying */}
      {isFlying && (
        <div className="absolute left-1/2 -translate-x-1/2 z-30" style={{ top: '200px' }}>
          <div className="flex items-center gap-2 bg-black/90 rounded-full px-3 py-2 border border-white/20 shadow-lg">
            <button onClick={toggleFlyPause} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20">
              {isPaused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              )}
            </button>
            
            <div className="flex items-center gap-1 border-l border-white/20 pl-2">
              {[0.5, 1, 2].map(s => (
                <button 
                  key={s} 
                  onClick={() => setFlySpeed(s)} 
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${flySpeed === s ? 'bg-cyan-500 text-black' : 'text-white/60 hover:text-white'}`}
                >
                  {s}x
                </button>
              ))}
            </div>
            
            <button onClick={stopFlyThrough} className="w-9 h-9 rounded-full bg-red-500/30 flex items-center justify-center hover:bg-red-500/50 border-l border-white/20 ml-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#f87171"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM BAR - Compact */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#0a0a0f] to-transparent pt-8 pb-4 px-3">
        {/* Zone indicator */}
        {zones.length > 0 && (
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => setShowZones(!showZones)}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs transition-all ${showZones ? 'bg-white/10 text-white' : 'bg-transparent text-white/40'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 12h18M12 3v18"/>
              </svg>
              {zones.length} zones
              {isLoadingZones && <span className="text-white/30">(loading)</span>}
            </button>
            <div className="flex gap-1">
              {Object.entries(ZONE_COLORS).slice(0, 4).map(([type, colors]) => {
                const count = zones.filter(z => z.type === type).length
                if (count === 0) return null
                return (
                  <span key={type} className="px-1.5 py-0.5 rounded text-[9px] font-medium" style={{ background: `${colors.label}20`, color: colors.label }}>
                    {count} {type}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Mode + Actions */}
        <div className="flex items-center justify-between mb-2">
          {/* Mode */}
          <div className="flex bg-black/60 rounded-full p-0.5 border border-white/10">
            {[{ id: 'cruise', l: 'CRUISE', c: '#00d4ff' }, { id: 'fast', l: 'FAST', c: '#ffd500' }, { id: 'race', l: 'RACE', c: '#ff3366' }].map(m => (
              <button 
                key={m.id} 
                onClick={() => setMode(m.id)} 
                className="px-3 py-1 rounded-full text-[10px] font-bold transition-all"
                style={{ background: mode === m.id ? m.c : 'transparent', color: mode === m.id ? (m.id === 'fast' ? '#000' : '#fff') : '#fff6' }}
              >
                {m.l}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-1.5">
            <Btn icon="edit" onClick={onEdit} tip="Edit Route" highlight={hasEdits} />
            <Btn icon="reverse" onClick={handleReverseRoute} tip="Reverse" />
            <Btn icon="fly" onClick={handleFlyThrough} disabled={isFlying} tip="Preview" />
            <Btn icon="voice" onClick={handleSampleCallout} tip="Test Voice" />
            <Btn icon="share" onClick={handleShare} tip="Share" />
            <Btn icon={downloadComplete ? 'check' : 'download'} onClick={handleDownload} disabled={isDownloading || downloadComplete} success={downloadComplete} loading={isDownloading} tip="Download" />
          </div>
        </div>

        {/* Start button */}
        <button onClick={handleStart} className="w-full py-3 rounded-xl font-bold text-sm tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all" style={{ background: modeColor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
          START NAVIGATION
        </button>
      </div>

      {/* Modals */}
      {showCurveList && <CurveList curves={routeData?.curves || []} mode={mode} settings={settings} onSelect={handleCurveClick} onClose={() => setShowCurveList(false)} />}
      {selectedCurve && !showCurveList && <CurvePopup curve={selectedCurve} mode={mode} settings={settings} onClose={() => setSelectedCurve(null)} />}
      {showShareModal && <ShareModal name={routeData?.name} onClose={() => setShowShareModal(false)} />}
      {!mapLoaded && <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-40"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>}
    </div>
  )
}

// Mini elevation widget
function MiniElevation({ data, color }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.elevation)), min = Math.min(...data.map(d => d.elevation)), range = max - min || 1
  return (
    <svg viewBox="0 0 80 20" className="w-full h-6">
      <defs><linearGradient id="meg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor={color} stopOpacity="0.4"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <path d={`M 0 20 ${data.map((d, i) => `L ${(i / (data.length - 1)) * 80} ${20 - ((d.elevation - min) / range) * 16}`).join(' ')} L 80 20 Z`} fill="url(#meg)" />
      <path d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${(i / (data.length - 1)) * 80} ${20 - ((d.elevation - min) / range) * 16}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// Action button
function Btn({ icon, onClick, disabled, success, loading, tip, highlight }) {
  const icons = {
    edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    reverse: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
    fly: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>,
    voice: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
    share: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>,
    download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  }
  return (
    <button onClick={onClick} disabled={disabled} title={tip} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 ${success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : highlight ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-black/60 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white'} disabled:opacity-40`}>
      {loading ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icons[icon]}
    </button>
  )
}

// Curve list
function CurveList({ curves, mode, settings, onSelect, onClose }) {
  const getSpd = (s) => { const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }, m = { cruise: 1, fast: 1.15, race: 1.3 }; let v = Math.round((b[s] || 40) * (m[mode] || 1)); return settings.units === 'metric' ? Math.round(v * 1.609) : v }
  return (
    <div className="fixed inset-0 z-50 flex items-end"><div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-h-[65vh] bg-[#0d0d12] rounded-t-2xl border-t border-white/10 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <span className="text-white font-semibold">All Curves ({curves.length})</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div className="overflow-y-auto max-h-[55vh] p-2">
          {curves.map((c, i) => {
            const col = getCurveColor(c.severity), dist = settings.units === 'metric' ? `${((c.distanceFromStart || 0) / 1000).toFixed(1)}km` : `${((c.distanceFromStart || 0) / 1609).toFixed(1)}mi`
            return (
              <button key={c.id || i} onClick={() => onSelect(c)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: `${col}20`, border: `1px solid ${col}`, color: col }}>{c.isChicane ? c.severitySequence : c.severity}</div>
                <div className="flex-1 text-left">
                  <div className="text-white text-sm">{c.isChicane ? `${c.chicaneType} ${c.startDirection}` : `${c.direction} ${c.severity}`}{c.modifier && <span className="text-white/40 ml-1 text-xs">{c.modifier}</span>}</div>
                  <div className="text-white/40 text-xs">{dist} • {getSpd(c.severity)} {settings.units === 'metric' ? 'km/h' : 'mph'}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff4" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Curve popup
function CurvePopup({ curve, mode, settings, onClose }) {
  const col = getCurveColor(curve.severity)
  const getSpd = (s) => { const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }, m = { cruise: 1, fast: 1.15, race: 1.3 }; let v = Math.round((b[s] || 40) * (m[mode] || 1)); return settings.units === 'metric' ? Math.round(v * 1.609) : v }
  return (
    <div className="absolute bottom-36 left-3 right-3 z-30 bg-black/90 rounded-xl border p-3" style={{ borderColor: `${col}50` }}>
      <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold" style={{ background: `${col}20`, border: `2px solid ${col}`, color: col }}>{curve.severity}</div>
        <div>
          <div className="text-white font-semibold">{curve.isChicane ? `${curve.chicaneType} ${curve.startDirection}` : `${curve.direction} ${curve.severity}`}</div>
          {curve.modifier && <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${col}20`, color: col }}>{curve.modifier}</span>}
          <div className="text-white/50 text-xs mt-1">{getSpd(curve.severity)} {settings.units === 'metric' ? 'km/h' : 'mph'}{curve.radius && ` • R${curve.radius}m`}{curve.totalAngle && ` • ${curve.totalAngle}°`}</div>
        </div>
      </div>
    </div>
  )
}

// Share modal
function ShareModal({ name, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#12121a] rounded-xl p-4 w-full max-w-sm border border-white/10">
        <h3 className="text-white font-semibold mb-1">Share Route</h3>
        <p className="text-white/50 text-sm mb-3">{name || 'Rally Route'}</p>
        <div className="flex gap-2">
          <input type="text" value={location.href} readOnly className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs" />
          <button onClick={copy} className={`px-3 py-2 rounded-lg text-xs font-medium ${copied ? 'bg-green-500 text-white' : 'bg-cyan-500 text-black'}`}>{copied ? '✓' : 'Copy'}</button>
        </div>
        <button onClick={onClose} className="w-full mt-3 py-2 bg-white/10 rounded-lg text-white/60 text-sm">Close</button>
      </div>
    </div>
  )
}
