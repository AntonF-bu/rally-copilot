import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech, generateCallout } from '../hooks/useSpeech'
import { getRoute } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'
import { analyzeRouteCharacter, CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'
import { analyzeHighwayBends, HIGHWAY_MODE } from '../services/highwayModeService'
import { validateZonesWithLLM, getLLMApiKey, hasLLMApiKey } from '../services/llmZoneService'
import { enhanceCurvesWithLLM, shouldEnhanceCurves } from '../services/llmCurveService'
import useHighwayStore from '../services/highwayStore'
import CopilotLoader from './CopilotLoader'

// ================================
// Route Preview - v19
// NEW: LLM Curve Enhancement Integration
// Preview is single source of truth
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const DEMO_START = [-71.0589, 42.3601]
const DEMO_END = [-71.3012, 42.3665]

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
}

// Highway blue color for bend markers
const HIGHWAY_BEND_COLOR = '#3b82f6'

export default function RoutePreview({ onStartNavigation, onBack, onEdit }) {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const highwayMarkersRef = useRef([])
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
  const [showSleeve, setShowSleeve] = useState(true)
  
  // LLM Curve Enhancement state
  const [curveEnhanced, setCurveEnhanced] = useState(false)
  const [curveEnhancementResult, setCurveEnhancementResult] = useState(null)
  
  // Highway bends - LOCAL state for UI
  const [highwayBends, setHighwayBendsLocal] = useState([])
  const [showHighwayBends, setShowHighwayBends] = useState(true)
  
  // Highway mode from store
  const { highwayMode, setHighwayMode } = useHighwayStore()
  
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
  const characterFetchedRef = useRef(false)
  const highwayAnalyzedRef = useRef(false)
  
  // Route character state
  const [routeCharacter, setRouteCharacter] = useState({ segments: [], summary: null, censusTracts: [] })
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  
  // LLM enhancement state with toggle
  const [llmEnhanced, setLlmEnhanced] = useState(false)
  const [llmResult, setLlmResult] = useState(null)
  const [useEnhancedZones, setUseEnhancedZones] = useState(true)
  
  const { 
    routeData, mode, setMode, routeMode, setRouteData, 
    isFavorite, toggleFavorite, settings,
    globalZoneOverrides, routeZoneOverrides, setRouteZones,
    editedCurves, customCallouts
  } = useStore()
  
  // Get setHighwayBends separately - may not exist in older store versions
  const setStoreHighwayBends = useStore((state) => state.setHighwayBends)
  
  const { initAudio, preloadRouteAudio, speak } = useSpeech()

  // Helper to set highway bends BOTH locally and in store
  const setHighwayBends = useCallback((bends) => {
    setHighwayBendsLocal(bends)
    // Only call store action if it exists (store.js must have setHighwayBends)
    if (setStoreHighwayBends) {
      setStoreHighwayBends(bends)
      console.log(`🛣️ Preview: Stored ${bends.length} highway bends in global store`)
    }
  }, [setStoreHighwayBends])

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
      sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0,
      highwayBendCount: highwayBends.length,
      sSweepCount: highwayBends.filter(b => b.isSSweep).length
    }
  }, [routeData, settings.units, highwayBends])

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

  // Fetch route character analysis
  const fetchRouteCharacter = useCallback(async (coordinates, curves) => {
    if (!coordinates?.length || coordinates.length < 2 || characterFetchedRef.current) return
    characterFetchedRef.current = true
    setIsLoadingCharacter(true)
    
    try {
      // Step 1: Rule-based analysis
      const analysis = await analyzeRouteCharacter(coordinates, curves || [])
      setRouteCharacter(analysis)
      setRouteZones(analysis.segments)
      setIsLoadingCharacter(false)
      
      // Step 2: LLM enhancement (if API key available)
      if (hasLLMApiKey() && analysis.segments?.length > 0) {
        setIsLoadingAI(true)
        console.log('🤖 Running LLM zone validation during preview...')
        try {
          const llmResponse = await validateZonesWithLLM(
            analysis.segments,
            routeData,
            getLLMApiKey()
          )
          
          console.log('🤖 LLM Response:', JSON.stringify(llmResponse, null, 2))
          
          setLlmResult(llmResponse)
          
          const { enhanced, changes } = llmResponse
          
          if (enhanced?.length > 0 && changes?.length > 0) {
            console.log(`🤖 LLM made ${changes.length} change(s) during preview:`)
            changes.forEach(c => console.log(`   - ${c}`))
            setLlmEnhanced(true)
            setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
            setRouteZones(enhanced)
            
            // Update highway bends with enhanced zones - STORED IN GLOBAL STORE
            const bends = analyzeHighwayBends(coordinates, enhanced)
            setHighwayBends(bends)
            console.log(`🛣️ Preview: Found ${bends.length} highway bends (after LLM)`)
          } else {
            console.log('🤖 LLM found no changes needed')
            if (!highwayAnalyzedRef.current && analysis.segments?.length) {
              highwayAnalyzedRef.current = true
              const bends = analyzeHighwayBends(coordinates, analysis.segments)
              setHighwayBends(bends)
              console.log(`🛣️ Preview: Found ${bends.length} highway bends`)
            }
          }
        } catch (llmErr) {
          console.warn('⚠️ LLM preview validation failed:', llmErr)
          if (!highwayAnalyzedRef.current && analysis.segments?.length) {
            highwayAnalyzedRef.current = true
            const bends = analyzeHighwayBends(coordinates, analysis.segments)
            setHighwayBends(bends)
          }
        } finally {
          setIsLoadingAI(false)
        }
      } else {
        // No API key - just run highway bend analysis
        if (!highwayAnalyzedRef.current && analysis.segments?.length) {
          highwayAnalyzedRef.current = true
          const bends = analyzeHighwayBends(coordinates, analysis.segments)
          setHighwayBends(bends)
          console.log(`🛣️ Preview: Found ${bends.length} highway bends`)
          
          if (bends.length > 0) {
            const sSweeps = bends.filter(b => b.isSSweep)
            const sweepers = bends.filter(b => b.isSweeper && !b.isSSweep)
            console.log(`   - S-sweeps: ${sSweeps.length}`)
            console.log(`   - Sweepers: ${sweepers.length}`)
            console.log(`   - Other bends: ${bends.length - sSweeps.length - sweepers.length}`)
          }
        }
      }
      
    } catch (err) {
      console.error('Route character analysis error:', err)
      setIsLoadingCharacter(false)
      setIsLoadingAI(false)
    }
  }, [setRouteZones, routeData, setHighwayBends])

  // CRITICAL: Detect curves if routeData doesn't have them
  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && (!routeData.curves || routeData.curves.length === 0)) {
      console.log('🔍 RoutePreview: No curves in routeData, detecting...')
      const curves = detectCurves(routeData.coordinates)
      console.log(`🔍 RoutePreview: Detected ${curves.length} curves`)
      
      // Update routeData with curves
      useStore.getState().setRouteData({
        ...routeData,
        curves
      })
    }
  }, [routeData?.coordinates, routeData?.curves])

  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && routeData?.curves?.length > 0 && !characterFetchedRef.current) {
      fetchRouteCharacter(routeData.coordinates, routeData.curves)
    }
  }, [routeData?.coordinates, routeData?.curves, fetchRouteCharacter])

  // Toggle sleeve visibility
  const handleToggleSleeve = useCallback(() => {
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
          } catch (e) {}
        })
      }
    }
  }, [showSleeve])

  // Toggle highway bend markers visibility
  const handleToggleHighwayBends = useCallback(() => {
    const newVisibility = !showHighwayBends
    setShowHighwayBends(newVisibility)
    
    highwayMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = newVisibility ? 'block' : 'none'
    })
  }, [showHighwayBends])

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
    characterFetchedRef.current = false
    highwayAnalyzedRef.current = false
    setHighwayBends([])
    setElevationData([])
    setLlmEnhanced(false)
    setCurveEnhanced(false)
    setCurveEnhancementResult(null)
    if (mapRef.current && mapLoaded) rebuildRoute(reversed)
  }

  // Fly animation refs
  const isPausedRef = useRef(false)
  const flySpeedRef = useRef(1)
  
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])
  
  useEffect(() => {
    flySpeedRef.current = flySpeed
  }, [flySpeed])

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
    
    let lastTime = 0
    
    const animate = (timestamp) => {
      if (flyIndexRef.current >= coords.length - 1) { 
        stopFlyThrough()
        return 
      }
      
      if (isPausedRef.current) {
        flyAnimationRef.current = requestAnimationFrame(animate)
        return
      }
      
      const frameInterval = 80 / flySpeedRef.current
      if (timestamp - lastTime < frameInterval) {
        flyAnimationRef.current = requestAnimationFrame(animate)
        return
      }
      lastTime = timestamp
      
      const current = coords[flyIndexRef.current]
      const lookAhead = Math.min(flyIndexRef.current + 15, coords.length - 1)
      const next = coords[lookAhead]
      
      mapRef.current?.easeTo({ 
        center: current, 
        bearing: getBearing(current, next), 
        pitch: 55, 
        zoom: 15.5, 
        duration: 120 
      })
      
      const step = Math.max(1, Math.ceil(flySpeedRef.current * 2))
      flyIndexRef.current += step
      
      flyAnimationRef.current = requestAnimationFrame(animate)
    }
    
    flyAnimationRef.current = requestAnimationFrame(animate)
  }, [routeData])

  const handleFlyThrough = () => {
    if (!mapRef.current || !routeData?.coordinates || isFlying) return
    setIsFlying(true)
    setIsPaused(false)
    isPausedRef.current = false
    flyIndexRef.current = 0
    
    mapRef.current.easeTo({ 
      center: routeData.coordinates[0], 
      pitch: 60, 
      zoom: 14, 
      duration: 800 
    })
    setTimeout(() => startFlyAnimation(), 850)
  }

  const toggleFlyPause = () => {
    if (!isFlying) return
    const newPaused = !isPaused
    setIsPaused(newPaused)
    isPausedRef.current = newPaused
    console.log(`🎬 Fly-through ${newPaused ? 'paused' : 'resumed'}`)
  }

  const stopFlyThrough = useCallback(() => {
    console.log('🎬 Stopping fly-through')
    if (flyAnimationRef.current) {
      cancelAnimationFrame(flyAnimationRef.current)
      flyAnimationRef.current = null
    }
    setIsFlying(false)
    setIsPaused(false)
    isPausedRef.current = false
    flyIndexRef.current = 0
    
    if (mapRef.current && routeData?.coordinates) {
      setTimeout(() => {
        if (!mapRef.current) return
        const bounds = routeData.coordinates.reduce(
          (b, c) => b.extend(c), 
          new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
        )
        mapRef.current.fitBounds(bounds, { 
          padding: { top: 120, bottom: 160, left: 40, right: 40 }, 
          duration: 1000, 
          pitch: 0,
          bearing: 0
        })
      }, 100)
    }
  }, [routeData])

  useEffect(() => {
    // Speed changes are handled via ref
  }, [flySpeed])

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

  // Handle highway bend click
  const handleHighwayBendClick = (bend) => {
    setSelectedCurve({
      ...bend,
      severity: bend.severity || 1,
      isHighwayBend: true
    })
    if (mapRef.current && bend.position) {
      mapRef.current.flyTo({ center: bend.position, zoom: 15, pitch: 45, duration: 800 })
    }
  }

  const handleDownload = async () => {
    if (isDownloading || !routeData?.curves?.length) return
    setIsDownloading(true)
    try { const result = await preloadRouteAudio(routeData.curves); if (result.success) setDownloadComplete(true) } 
    catch {} finally { setIsDownloading(false) }
  }

  // Loading state for copilot
  const [isPreparingCopilot, setIsPreparingCopilot] = useState(false)
  const [copilotProgress, setCopilotProgress] = useState(0)
  const [copilotReady, setCopilotReady] = useState(false)
  const [copilotStatus, setCopilotStatus] = useState('')

  // ================================
  // HANDLE START - WITH LLM INTEGRATION
  // ================================
  const handleStart = async () => { 
    await initAudio()
    
    setIsPreparingCopilot(true)
    setCopilotProgress(0)
    setCopilotStatus('Initializing...')
    
    try {
      // ========================================
      // PHASE 1: LLM Zone Validation
      // ========================================
      if (hasLLMApiKey() && routeCharacter.segments?.length > 0) {
        setCopilotProgress(5)
        setCopilotStatus('🤖 AI analyzing route zones...')
        console.log('🤖 Starting LLM zone validation...')
        
        try {
          const llmResponse = await validateZonesWithLLM(
            routeCharacter.segments,
            routeData,
            getLLMApiKey()
          )
          
          setLlmResult(llmResponse)
          
          const { enhanced, original, changes } = llmResponse
          
          if (enhanced?.length > 0 && changes?.length > 0) {
            console.log(`🤖 LLM made ${changes.length} change(s):`)
            changes.forEach(c => console.log(`   - ${c}`))
            
            setLlmEnhanced(true)
            
            setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
            setRouteZones(enhanced)
            
            // Re-analyze highway bends with enhanced zones - STORED IN GLOBAL STORE
            const bends = analyzeHighwayBends(routeData.coordinates, enhanced)
            setHighwayBends(bends)
            console.log(`🛣️ Re-analyzed highway bends: ${bends.length}`)
          } else {
            console.log('🤖 LLM confirmed all zones are correct')
            if (enhanced?.length > 0) {
              setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
              setRouteZones(enhanced)
            }
          }
        } catch (llmError) {
          console.warn('⚠️ LLM validation failed, using rule-based zones:', llmError)
        }
        
        setCopilotProgress(20)
      } else {
        if (!hasLLMApiKey()) {
          console.log('ℹ️ No OpenAI API key - skipping LLM zone validation')
        }
        setCopilotProgress(20)
      }
      
      // ========================================
      // PHASE 1.5: POST-PROCESSING
      // Trust LLM decisions - don't override them
      // ========================================
      console.log(`🔧 Post-LLM: Trusting zone decisions as-is`)
      
      // ========================================
      // PHASE 2: LLM Curve Enhancement
      // ========================================
      if (hasLLMApiKey() && shouldEnhanceCurves({ curves: routeData?.curves, highwayBends })) {
        setCopilotProgress(25)
        setCopilotStatus('🤖 AI enhancing curves...')
        console.log('🤖 Starting LLM curve enhancement...')
        
        try {
          const curveResult = await enhanceCurvesWithLLM({
            curves: routeData?.curves || [],
            highwayBends: highwayBends,
            zones: routeCharacter.segments,
            routeData
          }, getLLMApiKey())
          
          setCurveEnhancementResult(curveResult)
          
          // Apply enhanced curves if there were changes
          if (curveResult.changes?.length > 0) {
            console.log(`🤖 Curve enhancement made ${curveResult.changes.length} changes`)
            curveResult.changes.forEach(c => console.log(`   - ${c}`))
            
            setCurveEnhanced(true)
            
            // Update curves in route data
            if (curveResult.curves) {
              useStore.getState().setRouteData({
                ...routeData,
                curves: curveResult.curves
              })
            }
            
            // Update highway bends
            if (curveResult.highwayBends) {
              setHighwayBends(curveResult.highwayBends)
            }
            
            // Store callout variants for navigation to use
            if (curveResult.calloutVariants && Object.keys(curveResult.calloutVariants).length > 0) {
              useStore.getState().setCalloutVariants(curveResult.calloutVariants)
            }
          } else {
            console.log('🤖 Curve enhancement: no changes needed')
          }
        } catch (curveErr) {
          console.warn('⚠️ LLM curve enhancement failed:', curveErr)
          // Continue without enhancement - graceful fallback
        }
        
        setCopilotProgress(35)
      } else {
        if (!hasLLMApiKey()) {
          console.log('ℹ️ No API key - skipping curve enhancement')
        } else {
          console.log('ℹ️ Route does not need curve enhancement')
        }
        setCopilotProgress(35)
      }
      
      // ========================================
      // PHASE 3: Voice Preloading
      // ========================================
      setCopilotStatus('Loading voice callouts...')
      const { preloadCopilotVoices } = await import('../hooks/useSpeech')
      
      await preloadCopilotVoices(
        routeData?.curves || [],
        routeCharacter.segments || [],
        ({ percent }) => {
          setCopilotProgress(35 + Math.min(percent * 0.64, 64))
        }
      )
      
      setCopilotProgress(100)
      setCopilotStatus('Ready!')
      setCopilotReady(true)
      
    } catch (err) {
      console.error('Copilot prep error:', err)
      setCopilotProgress(100)
      setCopilotReady(true)
    }
  }
  
  const handleCopilotReady = () => {
    setIsPreparingCopilot(false)
    setCopilotReady(false)
    setCopilotProgress(0)
    setCopilotStatus('')
    onStartNavigation()
  }

  // Build SLEEVE segments
  const buildSleeveSegments = useCallback((coords, characterSegments) => {
    if (!coords?.length) return []
    if (!characterSegments?.length) {
      return [{ coords, color: CHARACTER_COLORS.technical.primary, character: 'technical' }]
    }
    
    const segments = []
    
    characterSegments.forEach((seg) => {
      let segCoords
      
      if (seg.coordinates?.length > 1) {
        segCoords = seg.coordinates
      } else if (seg.startIndex !== undefined && seg.endIndex !== undefined) {
        segCoords = coords.slice(seg.startIndex, seg.endIndex + 1)
      } else {
        const totalDist = routeData?.distance || 15000
        const startProgress = Math.max(0, seg.startDistance / totalDist)
        const endProgress = Math.min(1, seg.endDistance / totalDist)
        const startIdx = Math.floor(startProgress * coords.length)
        const endIdx = Math.min(Math.ceil(endProgress * coords.length), coords.length)
        segCoords = coords.slice(startIdx, endIdx + 1)
      }
      
      if (segCoords?.length > 1) {
        const colors = CHARACTER_COLORS[seg.character] || CHARACTER_COLORS.technical
        segments.push({
          coords: segCoords,
          color: colors.primary,
          character: seg.character
        })
      }
    })
    
    return segments
  }, [routeData?.distance])

  // Build severity segments
  const buildSeveritySegments = useCallback((coords, curves) => {
    if (!coords?.length) return [{ coords, color: '#22c55e' }]
    if (!curves?.length) return [{ coords, color: '#22c55e' }]

    const totalDist = routeData?.distance || 15000
    const gradientDist = 150
    
    const severityColors = {
      0: '#22c55e', 1: '#22c55e', 2: '#84cc16',
      3: '#eab308', 4: '#f97316', 5: '#ef4444', 6: '#dc2626',
    }
    
    const coordColors = coords.map(() => severityColors[0])
    
    curves.forEach(curve => {
      if (!curve.distanceFromStart) return
      
      const curveDist = curve.distanceFromStart
      const severity = curve.severity || 3
      const curveColor = severityColors[Math.min(severity, 6)]
      
      const warningStart = curveDist - gradientDist
      const warningEnd = curveDist
      const curveStart = curveDist
      const curveEnd = curveDist + (curve.length || 50)
      const recoveryStart = curveEnd
      const recoveryEnd = curveEnd + (gradientDist * 0.5)
      
      coords.forEach((coord, i) => {
        const coordDist = (i / coords.length) * totalDist
        
        if (coordDist >= warningStart && coordDist < warningEnd) {
          const progress = (coordDist - warningStart) / gradientDist
          coordColors[i] = interpolateColor(severityColors[0], curveColor, progress)
        }
        
        if (coordDist >= curveStart && coordDist < curveEnd) {
          coordColors[i] = curveColor
        }
        
        if (coordDist >= recoveryStart && coordDist < recoveryEnd) {
          const progress = (coordDist - recoveryStart) / (gradientDist * 0.5)
          coordColors[i] = interpolateColor(curveColor, severityColors[0], progress)
        }
      })
    })
    
    const segments = []
    let currentSegment = { coords: [coords[0]], color: coordColors[0] }
    
    for (let i = 1; i < coords.length; i++) {
      if (coordColors[i] === currentSegment.color) {
        currentSegment.coords.push(coords[i])
      } else {
        currentSegment.coords.push(coords[i])
        segments.push(currentSegment)
        currentSegment = { coords: [coords[i]], color: coordColors[i] }
      }
    }
    segments.push(currentSegment)
    
    return segments.filter(s => s.coords.length > 1)
  }, [routeData?.distance])

  const interpolateColor = (color1, color2, progress) => {
    const hex = (c) => parseInt(c.slice(1), 16)
    const r1 = (hex(color1) >> 16) & 255, g1 = (hex(color1) >> 8) & 255, b1 = hex(color1) & 255
    const r2 = (hex(color2) >> 16) & 255, g2 = (hex(color2) >> 8) & 255, b2 = hex(color2) & 255
    const r = Math.round(r1 + (r2 - r1) * progress)
    const g = Math.round(g1 + (g2 - g1) * progress)
    const b = Math.round(b1 + (b2 - b1) * progress)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  const addRoute = useCallback((map, coords, characterSegments, curves) => {
    if (!map || !coords?.length) return
    
    const sleeveSegs = buildSleeveSegments(coords, characterSegments)
    const routeSegs = buildSeveritySegments(coords, curves)
    
    // Add SLEEVE fill layers
    sleeveSegs.forEach((seg, i) => {
      const src = `sleeve-src-${i}`, sleeve = `sleeve-${i}`
      if (!map.getSource(src)) {
        map.addSource(src, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } })
        if (showSleeve) {
          map.addLayer({ 
            id: sleeve, 
            type: 'line', 
            source: src, 
            layout: { 'line-join': 'round', 'line-cap': 'round' }, 
            paint: { 
              'line-color': seg.color, 
              'line-width': 40, 
              'line-opacity': 0.25
            } 
          })
        }
      }
    })
    
    // Add sleeve borders
    if (showSleeve) {
      sleeveSegs.forEach((seg, i) => {
        const borderSrc = `sleeve-border-src-${i}`
        const borderTop = `sleeve-border-top-${i}`
        const borderBottom = `sleeve-border-bottom-${i}`
        
        if (!map.getSource(borderSrc)) {
          map.addSource(borderSrc, { 
            type: 'geojson', 
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } 
          })
          
          map.addLayer({ 
            id: borderTop, 
            type: 'line', 
            source: borderSrc, 
            layout: { 'line-join': 'round', 'line-cap': 'butt' }, 
            paint: { 
              'line-color': seg.color,
              'line-width': 1.5,
              'line-opacity': 0.5,
              'line-dasharray': [4, 6],
              'line-offset': 20
            } 
          })
          
          map.addLayer({ 
            id: borderBottom, 
            type: 'line', 
            source: borderSrc, 
            layout: { 'line-join': 'round', 'line-cap': 'butt' }, 
            paint: { 
              'line-color': seg.color,
              'line-width': 1.5,
              'line-opacity': 0.5,
              'line-dasharray': [4, 6],
              'line-offset': -20
            } 
          })
        }
      })
    }
    
    // Add ROUTE LINE layers
    routeSegs.forEach((seg, i) => {
      const src = `route-src-${i}`, glow = `glow-${i}`, line = `line-${i}`
      if (!map.getSource(src)) {
        map.addSource(src, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } })
        map.addLayer({ id: glow, type: 'line', source: src, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': seg.color, 'line-width': 14, 'line-blur': 6, 'line-opacity': 0.5 } })
        map.addLayer({ id: line, type: 'line', source: src, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': seg.color, 'line-width': 5 } })
      }
    })
  }, [buildSleeveSegments, buildSeveritySegments, showSleeve])

  // Helper: Check if a distance is within a transit zone
  const isInTransitZone = useCallback((distance, segments) => {
    if (!segments?.length) return false
    return segments.some(seg => 
      seg.character === 'transit' && 
      distance >= seg.startDistance && 
      distance <= seg.endDistance
    )
  }, [])

  // Add curve markers - SKIP curves in transit zones
  const addMarkers = useCallback((map, curves, coords, segments) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    
    curves?.forEach(curve => {
      if (!curve.position) return
      
      // Skip curves in transit/highway zones
      if (isInTransitZone(curve.distanceFromStart, segments)) {
        return
      }
      
      const color = getCurveColor(curve.severity)
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      
      if (curve.isChicane) {
        el.innerHTML = `<div style="position:relative;background:#000d;padding:2px 5px;border-radius:5px;border:2px solid ${color};font-size:9px;font-weight:700;color:${color};text-align:center;">${curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}${curve.startDirection === 'LEFT' ? '←' : '→'}<br/>${curve.severitySequence}</div>`
      } else {
        el.innerHTML = `<div style="display:flex;align-items:center;gap:2px;background:#000d;padding:2px 5px;border-radius:5px;border:1px solid ${color};"><svg width="9" height="9" viewBox="0 0 24 24" fill="${color}" style="transform:${curve.direction === 'LEFT' ? 'scaleX(-1)' : 'none'}"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg><span style="font-size:11px;font-weight:700;color:${color};">${curve.severity}</span></div>`
      }
      el.onclick = () => handleCurveClick(curve)
      markersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(curve.position).addTo(map))
    })
  }, [isInTransitZone])

  // Add highway bend markers - WITH ACTIVE SECTION SUPPORT
  const addHighwayBendMarkers = useCallback((map, bends) => {
    highwayMarkersRef.current.forEach(m => m.remove())
    highwayMarkersRef.current = []
    
    if (!showHighwayBends || !bends?.length) return
    
    bends.forEach(bend => {
      if (!bend.position) return
      
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      
      // ACTIVE SECTION marker
      if (bend.isSection) {
        const bgColor = '#f59e0b'
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.9);padding:6px 10px;border-radius:8px;border:2px solid ${bgColor};box-shadow:0 2px 12px ${bgColor}50;">
            <span style="font-size:10px;font-weight:700;color:${bgColor};letter-spacing:0.5px;text-transform:uppercase;">ACTIVE</span>
            <span style="font-size:12px;font-weight:600;color:${bgColor};">${bend.bendCount} bends</span>
            <span style="font-size:9px;color:${bgColor}90;">${bend.length}m</span>
          </div>
        `
      }
      // S-SWEEP marker
      else if (bend.isSSweep) {
        const dir1 = bend.firstBend.direction === 'LEFT' ? '←' : '→'
        const dir2 = bend.secondBend.direction === 'LEFT' ? '←' : '→'
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.85);padding:3px 6px;border-radius:6px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 8px ${HIGHWAY_BEND_COLOR}30;">
            <span style="font-size:8px;font-weight:700;color:${HIGHWAY_BEND_COLOR};letter-spacing:0.5px;">S-SWEEP</span>
            <span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${dir1}${bend.firstBend.angle}° ${dir2}${bend.secondBend.angle}°</span>
          </div>
        `
      }
      // Regular SW marker
      else {
        const isLeft = bend.direction === 'LEFT'
        const dirArrow = isLeft ? '←' : '→'
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:2px;background:rgba(0,0,0,0.8);padding:2px 6px;border-radius:5px;border:1.5px solid ${HIGHWAY_BEND_COLOR};box-shadow:0 2px 6px ${HIGHWAY_BEND_COLOR}20;">
            <span style="font-size:9px;font-weight:700;color:${HIGHWAY_BEND_COLOR};">SW</span>
            <span style="font-size:10px;color:${HIGHWAY_BEND_COLOR};">${dirArrow}</span>
            <span style="font-size:10px;font-weight:600;color:${HIGHWAY_BEND_COLOR};">${bend.angle}°</span>
          </div>
        `
      }
      
      el.onclick = () => handleHighwayBendClick(bend)
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(bend.position)
        .addTo(map)
      
      highwayMarkersRef.current.push(marker)
    })
  }, [showHighwayBends])

  const rebuildRoute = useCallback((data = routeData, charSegs = routeCharacter.segments) => {
    if (!mapRef.current || !data?.coordinates) return
    
    for (let i = 0; i < 100; i++) {
      ['sleeve-', 'sleeve-border-top-', 'sleeve-border-bottom-', 'glow-', 'line-'].forEach(p => { 
        if (mapRef.current.getLayer(p + i)) mapRef.current.removeLayer(p + i) 
      })
      if (mapRef.current.getSource('sleeve-src-' + i)) mapRef.current.removeSource('sleeve-src-' + i)
      if (mapRef.current.getSource('sleeve-border-src-' + i)) mapRef.current.removeSource('sleeve-border-src-' + i)
      if (mapRef.current.getSource('route-src-' + i)) mapRef.current.removeSource('route-src-' + i)
    }
    
    addRoute(mapRef.current, data.coordinates, charSegs, data.curves)
    addMarkers(mapRef.current, data.curves, data.coordinates, charSegs)
    addHighwayBendMarkers(mapRef.current, highwayBends)
  }, [routeData, routeCharacter.segments, addRoute, addMarkers, addHighwayBendMarkers, highwayBends])

  // Rebuild route when character analysis completes
  useEffect(() => {
    if (mapLoaded && routeCharacter.segments.length > 0) {
      rebuildRoute(routeData, routeCharacter.segments)
    }
  }, [routeCharacter.segments, mapLoaded])

  // Add highway markers when bends are detected
  useEffect(() => {
    if (mapRef.current && mapLoaded && highwayBends.length > 0) {
      addHighwayBendMarkers(mapRef.current, highwayBends)
    }
  }, [highwayBends, mapLoaded, addHighwayBendMarkers])

  // Initialize map
  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates || mapRef.current) return
    mapRef.current = new mapboxgl.Map({ container: mapContainer, style: MAP_STYLES[mapStyle], center: routeData.coordinates[0], zoom: 10, pitch: 0 })
    mapRef.current.on('load', () => {
      setMapLoaded(true)
      addRoute(mapRef.current, routeData.coordinates, routeCharacter.segments, routeData.curves)
      addMarkers(mapRef.current, routeData.curves, routeData.coordinates, routeCharacter.segments)
      const bounds = routeData.coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
      mapRef.current.fitBounds(bounds, { padding: { top: 120, bottom: 160, left: 40, right: 40 }, duration: 1000 })
    })
    mapRef.current.on('style.load', () => rebuildRoute())
    return () => { 
      markersRef.current.forEach(m => m.remove())
      highwayMarkersRef.current.forEach(m => m.remove())
      zoneLayersRef.current = []
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      mapRef.current?.remove()
      mapRef.current = null 
    }
  }, [mapContainer, routeData, mapStyle, addRoute, addMarkers, rebuildRoute, routeCharacter.segments])

  const handleStyleChange = () => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  if (isLoadingRoute) return <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center"><div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
  if (loadError) return <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center flex-col gap-4"><p className="text-red-400">{loadError}</p><button onClick={onBack} className="px-4 py-2 bg-white/10 rounded">Back</button></div>
  
  if (isPreparingCopilot) {
    return (
      <CopilotLoader 
        progress={copilotProgress} 
        isComplete={copilotReady}
        onComplete={handleCopilotReady}
        status={copilotStatus}
      />
    )
  }

  // Check if route has highway sections
  const hasHighwaySections = routeCharacter.segments?.some(s => s.character === 'transit')

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* TOP BAR */}
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
            {/* Sleeve toggle */}
            <button 
              onClick={handleToggleSleeve} 
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showSleeve ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-black/70 border border-white/10'}`}
              title="Toggle density layer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showSleeve ? '#00d4ff' : 'white'} strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </button>
            {/* Highway bends toggle */}
            {hasHighwaySections && highwayBends.length > 0 && (
              <button 
                onClick={handleToggleHighwayBends} 
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showHighwayBends ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-black/70 border border-white/10'}`}
                title={`Toggle highway bends (${highwayBends.length})`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showHighwayBends ? HIGHWAY_BEND_COLOR : 'white'} strokeWidth="2">
                  <path d="M4 19h16M4 15l4-8h8l4 8"/>
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Elevation mini */}
            <div className="px-2 py-1 rounded-full bg-black/70 border border-white/10 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2"><path d="M2 22L12 2l10 20H2z"/></svg>
              <span className="text-[10px] text-white/80">{isLoadingElevation ? '...' : `${elevationGain}${settings.units === 'metric' ? 'm' : 'ft'}`}</span>
            </div>
            {/* Difficulty badge */}
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: `${difficultyRating.color}30`, color: difficultyRating.color }}>
              {difficultyRating.label}
            </span>
            {/* Favorite */}
            {routeData?.name && (
              <button onClick={handleToggleFavorite} className={`w-9 h-9 rounded-full flex items-center justify-center border ${isRouteFavorite ? 'bg-amber-500/20 border-amber-500/30' : 'bg-black/70 border-white/10'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isRouteFavorite ? '#f59e0b' : 'none'} stroke={isRouteFavorite ? '#f59e0b' : 'white'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
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

      {/* FLY CONTROLS */}
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

      {/* BOTTOM BAR */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#0a0a0f] to-transparent pt-8 pb-4 px-3">
        {/* Route Character - Compact single line */}
        {routeCharacter.summary && (
          <div className="flex items-center gap-2 mb-2 overflow-x-auto">
            {isLoadingCharacter ? (
              <span className="text-[10px] text-white/40">Analyzing route...</span>
            ) : (
              <>
                {Object.values(ROUTE_CHARACTER).map(char => {
                  const data = routeCharacter.summary.byCharacter[char]
                  if (!data || data.percentage === 0) return null
                  const colors = CHARACTER_COLORS[char]
                  const dist = settings.units === 'metric' 
                    ? `${(data.distance / 1000).toFixed(1)}km`
                    : `${(data.distance / 1609.34).toFixed(1)}mi`
                  return (
                    <span 
                      key={char}
                      className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                      style={{ background: `${colors.primary}20`, color: colors.primary, border: `1px solid ${colors.primary}40` }}
                    >
                      {colors.label} {dist}
                    </span>
                  )
                })}
                {/* Highway bends count */}
                {highwayBends.length > 0 && (
                  <span 
                    className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                    style={{ background: `${HIGHWAY_BEND_COLOR}20`, color: HIGHWAY_BEND_COLOR, border: `1px solid ${HIGHWAY_BEND_COLOR}40` }}
                  >
                    {highwayBends.length} sweeps
                  </span>
                )}
                {routeCharacter.summary.funPercentage > 0 && (
                  <span className="flex-shrink-0 text-[10px] font-bold ml-auto" style={{ color: routeCharacter.summary.funPercentage > 50 ? '#22c55e' : '#fbbf24' }}>
                    {routeCharacter.summary.funPercentage}% fun
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* AI LOADING - Compact inline */}
        {isLoadingAI && (
          <div className="mb-2 flex items-center gap-2 px-2 py-1.5 bg-purple-500/10 rounded-full border border-purple-500/30">
            <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] text-purple-300">Analyzing zones...</span>
          </div>
        )}

        {/* AI ZONE TOGGLE - Compact inline style */}
        {!isLoadingAI && llmEnhanced && llmResult && llmResult.changes?.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            {/* Toggle pill */}
            <div className="flex bg-black/60 rounded-full p-0.5 border border-purple-500/30">
              <button 
                onClick={() => {
                  setUseEnhancedZones(false)
                  const zones = llmResult.original
                  setRouteCharacter(prev => ({ ...prev, segments: zones }))
                  setRouteZones(zones)
                  const bends = analyzeHighwayBends(routeData.coordinates, zones)
                  setHighwayBends(bends)
                }}
                className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all"
                style={{ 
                  background: !useEnhancedZones ? '#64748b' : 'transparent', 
                  color: !useEnhancedZones ? '#fff' : '#fff5' 
                }}
              >
                Original
              </button>
              <button 
                onClick={() => {
                  setUseEnhancedZones(true)
                  const zones = llmResult.enhanced
                  setRouteCharacter(prev => ({ ...prev, segments: zones }))
                  setRouteZones(zones)
                  const bends = analyzeHighwayBends(routeData.coordinates, zones)
                  setHighwayBends(bends)
                }}
                className="px-2.5 py-1 rounded-full text-[9px] font-bold transition-all flex items-center gap-1"
                style={{ 
                  background: useEnhancedZones ? '#8b5cf6' : 'transparent', 
                  color: useEnhancedZones ? '#fff' : '#fff5' 
                }}
              >
                <span>AI</span>
                <span className="opacity-70">({llmResult.changes?.length})</span>
              </button>
            </div>
            
            {/* Expandable changes - click to show */}
            <button 
              onClick={() => {
                const details = llmResult.changes?.join('\n')
                if (details) alert(details)
              }}
              className="text-[9px] text-purple-400/60 hover:text-purple-400 transition-colors"
              title={llmResult.changes?.join('\n')}
            >
              view changes
            </button>
          </div>
        )}

        {/* AI CURVE ENHANCEMENT STATUS - NEW! */}
        {curveEnhanced && curveEnhancementResult?.changes?.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/30">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span className="text-[10px] text-emerald-400 font-medium">
                AI enhanced {curveEnhancementResult.changes.length} curve(s)
              </span>
            </div>
            <button 
              onClick={() => {
                const details = curveEnhancementResult.changes?.join('\n')
                if (details) alert(details)
              }}
              className="text-[9px] text-emerald-400/60 hover:text-emerald-400 transition-colors"
            >
              view details
            </button>
          </div>
        )}

        {/* Mode + Highway Mode + Actions */}
        <div className="flex items-center justify-between mb-2">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            {/* Driving mode */}
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

            {/* Highway mode toggle */}
            {hasHighwaySections && (
              <div className="flex bg-black/60 rounded-full p-0.5 border border-white/10">
                <button 
                  onClick={() => setHighwayMode(HIGHWAY_MODE.BASIC)} 
                  className="px-2 py-1 rounded-full text-[9px] font-bold transition-all flex items-center gap-1"
                  style={{ 
                    background: highwayMode === HIGHWAY_MODE.BASIC ? HIGHWAY_BEND_COLOR : 'transparent', 
                    color: highwayMode === HIGHWAY_MODE.BASIC ? '#fff' : '#fff6' 
                  }}
                  title="Basic highway mode - sweeper callouts only"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                  HWY
                </button>
                <button 
                  onClick={() => setHighwayMode(HIGHWAY_MODE.COMPANION)} 
                  className="px-2 py-1 rounded-full text-[9px] font-bold transition-all flex items-center gap-1"
                  style={{ 
                    background: highwayMode === HIGHWAY_MODE.COMPANION ? '#f59e0b' : 'transparent', 
                    color: highwayMode === HIGHWAY_MODE.COMPANION ? '#000' : '#fff6' 
                  }}
                  title="Companion mode - full coaching + chatter"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  +
                </button>
              </div>
            )}
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
      {showCurveList && <CurveList curves={routeData?.curves || []} highwayBends={highwayBends} mode={mode} settings={settings} onSelect={handleCurveClick} onSelectBend={handleHighwayBendClick} onClose={() => setShowCurveList(false)} />}
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

// Curve list modal
function CurveList({ curves, highwayBends = [], mode, settings, onSelect, onSelectBend, onClose }) {
  const [showTab, setShowTab] = useState('curves')
  
  const getSpd = (s) => { 
    const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }, m = { cruise: 1, fast: 1.15, race: 1.3 }
    let v = Math.round((b[s] || 40) * (m[mode] || 1))
    return settings.units === 'metric' ? Math.round(v * 1.6) : v
  }
  
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 pt-12 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">{curves.length} Curves</h2>
          {highwayBends.length > 0 && (
            <div className="flex bg-white/10 rounded-full p-0.5">
              <button 
                onClick={() => setShowTab('curves')} 
                className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'curves' ? 'bg-white/20 text-white' : 'text-white/50'}`}
              >
                Curves
              </button>
              <button 
                onClick={() => setShowTab('highway')} 
                className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'highway' ? 'bg-blue-500/30 text-blue-400' : 'text-white/50'}`}
              >
                Highway ({highwayBends.length})
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {showTab === 'curves' ? (
          curves.map((curve, i) => (
            <button key={curve.id || i} onClick={() => onSelect(curve)} className="w-full p-3 mb-1 rounded-lg bg-white/5 hover:bg-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: getCurveColor(curve.severity), color: '#000' }}>
                {curve.severity}
              </div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">
                  {curve.isChicane ? `${curve.chicaneType} ${curve.startDirection}` : `${curve.direction} ${curve.severity}`}
                  {curve.modifier && <span className="text-white/50 ml-1">{curve.modifier}</span>}
                </div>
                <div className="text-white/40 text-xs">
                  {((curve.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-white/80 text-sm font-mono">{getSpd(curve.severity)}</div>
                <div className="text-white/40 text-[10px]">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
              </div>
            </button>
          ))
        ) : (
          highwayBends.map((bend, i) => (
            <button 
              key={bend.id || i} 
              onClick={() => onSelectBend(bend)} 
              className={`w-full p-3 mb-1 rounded-lg flex items-center gap-3 border ${
                bend.isSection 
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20' 
                  : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'
              }`}
            >
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" 
                style={{ background: bend.isSection ? '#f59e0b' : '#3b82f6', color: '#fff' }}
              >
                {bend.isSection ? bend.bendCount : bend.isSSweep ? 'S' : 'SW'}
              </div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">
                  {bend.isSection ? (
                    `Active Section: ${bend.bendCount} bends`
                  ) : bend.isSSweep ? (
                    `S-Sweep: ${bend.firstBend.direction} ${bend.firstBend.angle}° → ${bend.secondBend.direction} ${bend.secondBend.angle}°`
                  ) : (
                    `${bend.direction} ${bend.angle}°`
                  )}
                  {bend.modifier && <span className={`ml-1 ${bend.isSection ? 'text-amber-400/70' : 'text-blue-400/70'}`}>{bend.modifier}</span>}
                </div>
                <div className="text-white/40 text-xs">
                  {((bend.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}
                  {bend.length && ` • ${bend.length}m`}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-mono ${bend.isSection ? 'text-amber-400' : 'text-blue-400'}`}>{bend.optimalSpeed || 70}</div>
                <div className="text-white/40 text-[10px]">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// Curve popup
function CurvePopup({ curve, mode, settings, onClose }) {
  const getSpd = (s) => { 
    const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }, m = { cruise: 1, fast: 1.15, race: 1.3 }
    let v = Math.round((b[s] || 40) * (m[mode] || 1))
    return settings.units === 'metric' ? Math.round(v * 1.6) : v
  }
  
  const isSection = curve.isSection
  const isHighwayBend = curve.isHighwayBend || curve.isSSweep || isSection
  const color = isSection ? '#f59e0b' : isHighwayBend ? '#3b82f6' : getCurveColor(curve.severity)
  
  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-black/90 rounded-xl p-4 border border-white/20 min-w-[280px] max-w-[340px]" style={{ borderColor: isHighwayBend ? `${color}40` : undefined }}>
      <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: color, color: '#fff' }}>
          {isSection ? curve.bendCount : curve.isSSweep ? 'S' : isHighwayBend ? 'SW' : curve.severity}
        </div>
        <div>
          <div className="text-white font-bold">
            {isSection ? 'Active Section' : curve.isSSweep ? 'S-Sweep' : curve.isHighwayBend ? `${curve.direction} Sweep` : curve.isChicane ? curve.chicaneType : `${curve.direction} ${curve.severity}`}
          </div>
          {isSection ? (
            <div className="text-amber-400/70 text-sm">{curve.bendCount} bends • {curve.length}m</div>
          ) : curve.angle ? (
            <div className="text-white/50 text-sm">{curve.angle}°{curve.length ? ` • ${curve.length}m` : ''}</div>
          ) : curve.modifier ? (
            <div className="text-white/50 text-sm">{curve.modifier}</div>
          ) : null}
        </div>
      </div>
      
      {/* Callout preview for sections */}
      {isSection && curve.calloutDetailed && (
        <div className="mb-2 p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <div className="text-[10px] text-amber-400/60 mb-1">CALLOUT PREVIEW</div>
          <div className="text-amber-200 text-xs leading-relaxed">{curve.calloutDetailed}</div>
        </div>
      )}
      
      {/* Speed recommendation */}
      <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
        <span className="text-white/50">Target Speed</span>
        <span className="text-white font-mono">{curve.optimalSpeed || getSpd(curve.severity)} {settings.units === 'metric' ? 'km/h' : 'mph'}</span>
      </div>
      
      {/* Throttle advice for highway bends */}
      {curve.throttleAdvice && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div style={{ color }} className="text-xs">{curve.throttleAdvice}</div>
        </div>
      )}
    </div>
  )
}

// Share modal
function ShareModal({ name, onClose }) {
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    onClose()
  }
  
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a24] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">Share Route</h3>
        <p className="text-white/60 text-sm mb-4">{name || 'Rally Route'}</p>
        <button onClick={copyLink} className="w-full py-3 bg-cyan-500 text-black font-bold rounded-xl mb-2">
          Copy Link
        </button>
        <button onClick={onClose} className="w-full py-3 bg-white/10 text-white rounded-xl">
          Cancel
        </button>
      </div>
    </div>
  )
}
