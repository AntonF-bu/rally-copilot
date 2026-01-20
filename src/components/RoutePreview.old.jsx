import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech, generateCallout } from '../hooks/useSpeech'
import { getRoute, extractRoadRefs } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'
import { analyzeRouteCharacter, CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'
import { analyzeHighwayBends, HIGHWAY_MODE } from '../services/highwayModeService'
import { getLLMApiKey, hasLLMApiKey } from '../services/llmZoneService'
import { dumpHighwayData } from '../services/highwayDataDebug'
import { analyzeRoadFlow, generateCalloutsFromEvents } from '../services/roadFlowAnalyzer'
import { filterEventsToCallouts } from '../services/ruleBasedCalloutFilter'
import { polishCalloutsWithLLM } from '../services/llmCalloutPolish'
import { generateGroupedCalloutSets } from '../services/calloutGroupingService'
// NEW: Import the chunked chatter service
import { generateChatterTimeline } from '../services/highwayChatterService'

import {
  classifyZones,
  convertToStandardFormat,
  reassignEventZones,
  extractCurvesFromEvents
} from '../services/simpleZoneClassifier'
import useHighwayStore from '../services/highwayStore'
import CopilotLoader from './CopilotLoader'
// NEW: Import mode selection and loading screen
import ModeSelection from './ModeSelection'
import LoadingScreen from './LoadingScreen'

// ================================
// Route Preview - v37
// NEW: Mode selection + improved loading
// - ModeSelection screen after address
// - LoadingScreen with progress stages
// - Chunked chatter generation for long routes
// - Basic mode skips chatter entirely
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const DEMO_START = [-71.0589, 42.3601]
const DEMO_END = [-71.3012, 42.3665]

const MAP_STYLES = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
}

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
  
  // Track if initial route has been drawn
  const initialRouteDrawnRef = useRef(false)
  
  // NEW: Mode selection state
  const [showModeSelection, setShowModeSelection] = useState(true)
  const [selectedMode, setSelectedMode] = useState(null)
  
  // LLM Curve Enhancement state
  const [curveEnhanced, setCurveEnhanced] = useState(false)
  const [curatedCallouts, setCuratedCallouts] = useState([])
  const [agentResult, setAgentResult] = useState(null)
  const [agentProgress, setAgentProgress] = useState(null)
  const [aiSectionCollapsed, setAiSectionCollapsed] = useState(true)
  
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
  
  // NEW: Improved loading stages
  const [loadingStages, setLoadingStages] = useState({
    route: 'pending',
    curves: 'pending',
    zones: 'pending',
    highway: 'pending',
    callouts: 'pending',
    chatter: 'pending',
    voices: 'pending'
  })
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  
  // LLM enhancement state
  const [llmEnhanced, setLlmEnhanced] = useState(false)
  const [llmResult, setLlmResult] = useState(null)
  const [useEnhancedZones, setUseEnhancedZones] = useState(true)
  
  const { 
    routeData, mode, setMode, routeMode, setRouteData, 
    isFavorite, toggleFavorite, settings,
    globalZoneOverrides, routeZoneOverrides, setRouteZones,
    editedCurves, customCallouts
  } = useStore()
  
  const setStoreHighwayBends = useStore((state) => state.setHighwayBends)
  const { initAudio, preloadRouteAudio, speak } = useSpeech()

  // Helper to set highway bends
  const setHighwayBends = useCallback((bends) => {
    setHighwayBendsLocal(bends)
    if (setStoreHighwayBends) {
      setStoreHighwayBends(bends)
      console.log(`🛣️ Preview: Stored ${bends.length} highway bends in global store`)
    }
  }, [setStoreHighwayBends])

  // Helper to update loading stages
  const updateStage = useCallback((stage, status) => {
    setLoadingStages(prev => ({ ...prev, [stage]: status }))
  }, [])

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  
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

  // ================================
  // MODE SELECTION HANDLER
  // ================================
  const handleModeSelect = useCallback((mode) => {
    console.log(`🎯 Mode selected: ${mode}`)
    setSelectedMode(mode)
    setHighwayMode(mode)
    setShowModeSelection(false)
    
    // Start loading with the selected mode
    setIsPreviewLoading(true)
    updateStage('route', 'complete') // Route already loaded
  }, [setHighwayMode, updateStage])

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

  // ================================
  // FETCH ROUTE CHARACTER - v37 with mode-aware chatter
  // ================================
  const fetchRouteCharacter = useCallback(async (coordinates, curves) => {
    if (!coordinates?.length || coordinates.length < 2 || characterFetchedRef.current) return
    if (showModeSelection) return // Don't start until mode is selected
    
    characterFetchedRef.current = true
    setIsLoadingCharacter(true)
    
    try {
      // ========================================
      // Step 1: Census analysis
      // ========================================
      updateStage('zones', 'loading')
      const censusAnalysis = await analyzeRouteCharacter(coordinates, curves || [])
      const censusSegments = censusAnalysis.segments || []
      console.log('📊 Census zones:', censusSegments.map(s => `${s.character}(${((s.end - s.start)/1609.34).toFixed(1)}mi)`).join(' → '))
      
      // ========================================
      // Step 2: Extract road refs
      // ========================================
      let roadSegments = []
      if (routeData?.legs && routeData.legs.length > 0) {
        console.log('\n🛣️ Extracting road refs...')
        roadSegments = await extractRoadRefs(routeData.legs, routeData.distance, routeData.coordinates)
        
        const interstates = roadSegments.filter(s => s.roadClass === 'interstate')
        const usHighways = roadSegments.filter(s => s.roadClass === 'us_highway')
        const stateRoutes = roadSegments.filter(s => s.roadClass === 'state_route')
        const localRoads = roadSegments.filter(s => s.roadClass === 'local')
        console.log(`   Road coverage: ${interstates.length} interstate, ${usHighways.length} US hwy, ${stateRoutes.length} state, ${localRoads.length} local`)
      }
      
      // ========================================
      // Step 3: Road Flow Analysis
      // ========================================
      const uniformZones = [{ start: 0, end: routeData.distance, character: 'transit' }]
      console.log('\n🌊 Running Road Flow Analyzer...')
      const flowResult = analyzeRoadFlow(coordinates, uniformZones, routeData.distance)
      window.__roadFlowData = flowResult
      
      // ========================================
      // Step 4: Zone Classification
      // ========================================
      console.log('\n🛣️ Classifying zones...')
      const totalMiles = routeData.distance / 1609.34
      const curvesForAnalysis = extractCurvesFromEvents(flowResult.events)
      
      const activeZones = await classifyZones(
        roadSegments,
        totalMiles,
        coordinates,
        routeData.distance
      )
      
      updateStage('zones', 'complete')
      setRouteCharacter({ ...censusAnalysis, segments: activeZones })
      setRouteZones(activeZones)
      setIsLoadingCharacter(false)
      
      // ========================================
      // Step 5: Highway Bends
      // ========================================
      if (!highwayAnalyzedRef.current && activeZones?.length) {
        highwayAnalyzedRef.current = true
        updateStage('highway', 'loading')
        
        const rawBends = analyzeHighwayBends(coordinates, activeZones)
        console.log(`🛣️ Found ${rawBends.length} raw highway bends`)
        setHighwayBendsLocal(rawBends)
        setHighwayBends(rawBends)
        updateStage('highway', 'complete')
        
        const debugData = dumpHighwayData(rawBends, activeZones, routeData)
        window.__highwayDebugData = debugData
        
        // ========================================
        // Step 6: Hybrid Callout System
        // ========================================
        if (flowResult.events.length > 0) {
          updateStage('callouts', 'loading')
          console.log('📋 Running Hybrid Callout System...')
          
          const eventsWithCorrectZones = reassignEventZones(flowResult.events, activeZones)
          flowResult.events = eventsWithCorrectZones
          window.__roadFlowData = flowResult
          
          try {
            // Rule-based filtering
            console.log('\n📋 STAGE 1: Rule-Based Callout Filter')
            const ruleBasedResult = filterEventsToCallouts(
              eventsWithCorrectZones,
              { totalMiles: routeData.distance / 1609.34 },
              activeZones
            )
            
            console.log(`📋 Rule-based: ${ruleBasedResult.callouts.length} callouts`)
            window.__ruleBasedCallouts = ruleBasedResult
            
            // LLM Polish (optional)
            let finalResult = ruleBasedResult
            
            if (hasLLMApiKey()) {
              console.log('\n✨ STAGE 2: LLM Polish')
              try {
                finalResult = await polishCalloutsWithLLM(
                  ruleBasedResult,
                  { totalMiles: routeData.distance / 1609.34 },
                  getLLMApiKey()
                )
                if (finalResult.llmPolished) {
                  console.log('✨ LLM polish applied')
                }
              } catch (polishErr) {
                console.warn('⚠️ LLM polish failed:', polishErr.message)
              }
            }
            
            // Format and store callouts
            if (finalResult.callouts.length > 0) {
              console.log(`\n✅ HYBRID SYSTEM: ${finalResult.callouts.length} callouts`)
              
              const formattedCallouts = finalResult.callouts.map(c => ({
                id: c.id,
                position: c.position,
                triggerDistance: c.triggerDistance,
                triggerMile: c.triggerMile || c.mile,
                text: c.text,
                shortText: c.text.substring(0, 35),
                type: c.type,
                priority: c.priority || 'medium',
                reason: c.reason,
                zone: c.zone,
                angle: c.angle,
                direction: c.direction,
                isHybridCallout: true,
                isLLMPolished: finalResult.llmPolished || false
              }))
              
              // Speed-based grouping
              console.log('\n🎯 STAGE 3: Speed-Based Grouping')
              const groupedSets = generateGroupedCalloutSets(
                formattedCallouts,
                { totalMiles: routeData.distance / 1609.34 }
              )
              
              console.log(`   Fast: ${groupedSets.fast.length}, Standard: ${groupedSets.standard.length}`)
              window.__groupedCallouts = groupedSets
              
              const displayCallouts = groupedSets.standard
              setCuratedCallouts(displayCallouts)
              setAgentResult({
                summary: { summary: finalResult.analysis },
                reasoning: [
                  `${flowResult.events.length} events detected`,
                  `${ruleBasedResult.callouts.length} callouts after filtering`,
                  finalResult.llmPolished ? 'LLM polish applied' : 'Rule-based'
                ],
                confidence: 95
              })
              setCurveEnhanced(true)
              
              useStore.getState().setCuratedHighwayCallouts(displayCallouts)
              useStore.getState().setGroupedCalloutSets?.(groupedSets)
              window.__hybridCallouts = finalResult
            }
            
          } catch (hybridErr) {
            console.error('⚠️ Hybrid system error:', hybridErr)
            const fallbackCallouts = generateCalloutsFromEvents(flowResult.events, activeZones, routeData.distance)
            setCuratedCallouts(fallbackCallouts)
            useStore.getState().setCuratedHighwayCallouts(fallbackCallouts)
          }
          
          updateStage('callouts', 'complete')
          
          // ========================================
          // Step 7: Chatter Generation (COMPANION MODE ONLY)
          // ========================================
          if (selectedMode === HIGHWAY_MODE.COMPANION && hasLLMApiKey()) {
            updateStage('chatter', 'loading')
            console.log('\n🎙️ STAGE 4: Highway Companion Chatter (Companion Mode)')
            
            try {
              const chatterResult = await generateChatterTimeline(
                {
                  zones: activeZones,
                  callouts: curatedCallouts,
                  routeData
                },
                (progress) => {
                  // Progress callback from chunked service
                  console.log(`🎙️ Chatter progress: ${progress}%`)
                }
              )
              
              console.log(`🎙️ Generated ${chatterResult.chatterTimeline.length} chatter items`)
              console.log(`   Method: ${chatterResult.method}`)
              
              useStore.getState().setChatterTimeline?.(chatterResult.chatterTimeline)
              window.__chatterTimeline = chatterResult.chatterTimeline
              
            } catch (chatterErr) {
              console.warn('⚠️ Chatter generation failed:', chatterErr.message)
            }
            
            updateStage('chatter', 'complete')
          } else if (selectedMode === HIGHWAY_MODE.BASIC) {
            console.log('ℹ️ Basic mode - skipping chatter generation')
            updateStage('chatter', 'complete')
          }
        }
      }
      
      updateStage('voices', 'complete')
      setIsLoadingAI(false)
      setIsPreviewLoading(false)
      
    } catch (err) {
      console.error('Route analysis error:', err)
      setIsLoadingCharacter(false)
      setIsLoadingAI(false)
      setIsPreviewLoading(false)
    }
  }, [setRouteZones, routeData, setHighwayBends, showModeSelection, selectedMode, updateStage])

  // Detect curves if needed
  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && (!routeData.curves || routeData.curves.length === 0)) {
      console.log('🔍 Detecting curves...')
      updateStage('curves', 'loading')
      
      const curves = detectCurves(routeData.coordinates)
      console.log(`🔍 Detected ${curves.length} curves`)
      
      updateStage('curves', 'complete')
      
      useStore.getState().setRouteData({
        ...routeData,
        curves
      })
    }
  }, [routeData?.coordinates, routeData?.curves, updateStage])

  // Start analysis after mode selection
  useEffect(() => {
    if (!showModeSelection && routeData?.coordinates?.length > 0 && routeData?.curves?.length > 0 && !characterFetchedRef.current) {
      fetchRouteCharacter(routeData.coordinates, routeData.curves)
    }
  }, [showModeSelection, routeData?.coordinates, routeData?.curves, fetchRouteCharacter])

  // ================================
  // SLEEVE TOGGLE
  // ================================
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

  const handleToggleHighwayBends = useCallback(() => {
    const newVisibility = !showHighwayBends
    setShowHighwayBends(newVisibility)
    highwayMarkersRef.current.forEach(marker => {
      marker.getElement().style.display = newVisibility ? 'block' : 'none'
    })
  }, [showHighwayBends])

  // Fetch demo route
  const fetchDemoRoute = async () => {
    setIsLoadingRoute(true)
    try {
      const route = await getRoute(DEMO_START, DEMO_END)
      if (route?.coordinates?.length > 10) {
        const curves = detectCurves(route.coordinates)
        setRouteData({ 
          name: "Boston to Weston Demo", 
          coordinates: route.coordinates, 
          curves, 
          distance: route.distance, 
          duration: route.duration,
          legs: route.legs
        })
      } else { 
        setLoadError('Could not load demo route') 
      }
    } catch { 
      setLoadError('Failed to fetch route') 
    } finally { 
      setIsLoadingRoute(false) 
    }
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
      })).reverse(),
      legs: routeData.legs
    }
    setRouteData(reversed)
    elevationFetchedRef.current = false
    characterFetchedRef.current = false
    highwayAnalyzedRef.current = false
    initialRouteDrawnRef.current = false
    setHighwayBends([])
    setElevationData([])
    setLlmEnhanced(false)
    setCurveEnhanced(false)
    if (mapRef.current && mapLoaded) rebuildRoute(reversed)
  }

  // Fly animation
  const isPausedRef = useRef(false)
  const flySpeedRef = useRef(1)
  
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])
  useEffect(() => { flySpeedRef.current = flySpeed }, [flySpeed])

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
    
    mapRef.current.easeTo({ center: routeData.coordinates[0], pitch: 60, zoom: 14, duration: 800 })
    setTimeout(() => startFlyAnimation(), 850)
  }

  const toggleFlyPause = () => {
    if (!isFlying) return
    const newPaused = !isPaused
    setIsPaused(newPaused)
    isPausedRef.current = newPaused
  }

  const stopFlyThrough = useCallback(() => {
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

  const handleHighwayBendClick = (bend) => {
    setSelectedCurve({ ...bend, severity: bend.severity || 1, isHighwayBend: true })
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

  // Copilot loader state
  const [isPreparingCopilot, setIsPreparingCopilot] = useState(false)
  const [copilotProgress, setCopilotProgress] = useState(0)
  const [copilotReady, setCopilotReady] = useState(false)
  const [copilotStatus, setCopilotStatus] = useState('')

  // Handle start
  const handleStart = async () => { 
    await initAudio()
    setIsPreparingCopilot(true)
    setCopilotProgress(0)
    setCopilotStatus('Initializing...')
    
    try {
      // LLM zone validation
      // if (hasLLMApiKey() && routeCharacter.segments?.length > 0 && !llmEnhanced) {
      //   setCopilotProgress(5)
      //   setCopilotStatus('🤖 AI analyzing zones...')
        
      //   try {
      //     const llmResponse = await validateZonesWithLLM(
      //       routeCharacter.segments,
      //       routeData,
      //       getLLMApiKey(),
      //       routeData.curves || []
      //     )
          
      //     setLlmResult(llmResponse)
      //     const { enhanced, changes } = llmResponse
          
      //     if (enhanced?.length > 0 && changes?.length > 0) {
      //       setLlmEnhanced(true)
      //       setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
      //       setRouteZones(enhanced)
      //       const bends = analyzeHighwayBends(routeData.coordinates, enhanced)
      //       setHighwayBends(bends)
      //     } else if (enhanced?.length > 0) {
      //       setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
      //       setRouteZones(enhanced)
      //     }
      //   } catch (llmError) {
      //     console.warn('⚠️ LLM validation failed:', llmError)
      //   }
        
      //   setCopilotProgress(20)
      // } else {
      //   setCopilotProgress(20)
      // }
      
      // setCopilotProgress(35)
      
      // Voice preloading
      setCopilotStatus('Loading voices...')
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

  // ================================
  // BUILD SLEEVE SEGMENTS
  // ================================
  const buildSleeveSegments = useCallback((coords, characterSegments) => {
    if (!coords?.length || !characterSegments?.length) return []
    
    const totalDist = routeData?.distance || 15000
    
    const coordDistances = [0]
    for (let i = 1; i < coords.length; i++) {
      const [lng1, lat1] = coords[i - 1]
      const [lng2, lat2] = coords[i]
      const R = 6371000
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      coordDistances.push(coordDistances[i-1] + R * c)
    }
    
    const calculatedTotal = coordDistances[coordDistances.length - 1]
    
    const findCoordIndexAtDistance = (targetDist) => {
      const scaledTarget = targetDist * (calculatedTotal / totalDist)
      for (let i = 0; i < coordDistances.length; i++) {
        if (coordDistances[i] >= scaledTarget) return Math.max(0, i - 1)
      }
      return coords.length - 1
    }
    
    const segments = []
    characterSegments.forEach((seg, i) => {
      const startDist = seg.startDistance ?? (seg.start * 1609.34) ?? 0
      const endDist = seg.endDistance ?? (seg.end * 1609.34) ?? totalDist
      
      const startIdx = findCoordIndexAtDistance(startDist)
      const endIdx = findCoordIndexAtDistance(endDist)
      const segCoords = coords.slice(startIdx, endIdx + 1)
      
      if (segCoords.length > 1) {
        const colors = CHARACTER_COLORS[seg.character] || CHARACTER_COLORS.technical
        segments.push({ coords: segCoords, color: colors.primary, character: seg.character, startIdx, endIdx })
      }
    })
    
    return segments
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

  // ================================
  // ADD ROUTE
  // ================================
  const addRoute = useCallback((map, coords, characterSegments, curves) => {
    if (!map || !coords?.length) return
    
    const zoneSegs = buildSleeveSegments(coords, characterSegments)
    if (!zoneSegs.length) return
    
    zoneSegs.forEach((seg, i) => {
      const srcId = `route-src-${i}`
      const glowId = `glow-${i}`
      const lineId = `line-${i}`
      
      if (map.getLayer(glowId)) map.removeLayer(glowId)
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getSource(srcId)) map.removeSource(srcId)
      
      map.addSource(srcId, { 
        type: 'geojson', 
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } 
      })
      
      map.addLayer({ 
        id: glowId, type: 'line', source: srcId, 
        layout: { 'line-join': 'round', 'line-cap': 'round' }, 
        paint: { 'line-color': seg.color, 'line-width': 12, 'line-blur': 5, 'line-opacity': 0.4 } 
      })
      
      map.addLayer({ 
        id: lineId, type: 'line', source: srcId, 
        layout: { 'line-join': 'round', 'line-cap': 'round' }, 
        paint: { 'line-color': seg.color, 'line-width': 4 } 
      })
    })
  }, [buildSleeveSegments])

  const addMarkers = useCallback((map, curves, coords, segments) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
  }, [])

  // Add highway markers
  const addHighwayBendMarkers = useCallback((map, callouts) => {
    highwayMarkersRef.current.forEach(m => m.remove())
    highwayMarkersRef.current = []
    
    if (!showHighwayBends) return
    
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
    
    const markersToShow = callouts || curatedCallouts || []
    if (!markersToShow.length) return
    
    markersToShow.forEach(callout => {
      if (!callout.position) return
      
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      
      const shortLabel = getShortLabel(callout)
      const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
      
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
        setSelectedCurve({ ...callout, isCuratedCallout: true })
        if (mapRef.current) mapRef.current.flyTo({ center: callout.position, zoom: 14, pitch: 45, duration: 800 })
      }
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(callout.position)
        .addTo(map)
      
      highwayMarkersRef.current.push(marker)
    })
  }, [showHighwayBends, curatedCallouts])

  // Rebuild route
  const rebuildRoute = useCallback((data = routeData, charSegs = routeCharacter.segments) => {
    if (!mapRef.current || !data?.coordinates) return
    if (!charSegs?.length) return
    
    let removedCount = 0
    for (let i = 0; i < 100; i++) {
      ['glow-', 'line-'].forEach(prefix => { 
        const layerId = prefix + i
        if (mapRef.current.getLayer(layerId)) {
          mapRef.current.removeLayer(layerId)
          removedCount++
        }
      })
      const srcId = 'route-src-' + i
      if (mapRef.current.getSource(srcId)) mapRef.current.removeSource(srcId)
    }
    
    addRoute(mapRef.current, data.coordinates, charSegs, data.curves)
    addMarkers(mapRef.current, data.curves, data.coordinates, charSegs)
    addHighwayBendMarkers(mapRef.current, curatedCallouts)
    
    initialRouteDrawnRef.current = true
  }, [routeData, routeCharacter.segments, addRoute, addMarkers, addHighwayBendMarkers, curatedCallouts])

  // Rebuild when zones ready
  useEffect(() => {
    if (mapLoaded && routeCharacter.segments?.length > 0) {
      rebuildRoute(routeData, routeCharacter.segments)
    }
  }, [routeCharacter.segments, mapLoaded, rebuildRoute, routeData])

  // Add highway markers when callouts ready
  useEffect(() => {
    if (mapRef.current && mapLoaded && curatedCallouts.length > 0) {
      addHighwayBendMarkers(mapRef.current, curatedCallouts)
    }
  }, [curatedCallouts, mapLoaded, addHighwayBendMarkers])

  // Initialize map
  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates || mapRef.current) return
    if (showModeSelection) return // Don't initialize map until mode selected
    
    mapRef.current = new mapboxgl.Map({ 
      container: mapContainer, 
      style: MAP_STYLES[mapStyle], 
      center: routeData.coordinates[0], 
      zoom: 10, 
      pitch: 0 
    })
    
    mapRef.current.on('load', () => {
      setMapLoaded(true)
      
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
      if (routeCharacter.segments?.length > 0) rebuildRoute()
    })
    
    return () => { 
      markersRef.current.forEach(m => m.remove())
      highwayMarkersRef.current.forEach(m => m.remove())
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      mapRef.current?.remove()
      mapRef.current = null 
    }
  }, [mapContainer, routeData, mapStyle, showModeSelection])

  const handleStyleChange = () => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  // ================================
  // RENDER STATES
  // ================================
  
  if (isLoadingRoute) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  
  if (loadError) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center flex-col gap-4">
        <p className="text-red-400">{loadError}</p>
        <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded">Back</button>
      </div>
    )
  }
  
  // ================================
  // NEW: Show Mode Selection first
  // ================================
  if (showModeSelection && routeData?.coordinates) {
    return (
      <ModeSelection 
        routeData={routeData}
        onSelect={handleModeSelect}
        onBack={onBack}
      />
    )
  }
  
  // ================================
  // NEW: Show Loading Screen while processing
  // ================================
  if (isPreviewLoading) {
    return (
      <LoadingScreen 
        stages={loadingStages}
        mode={selectedMode}
        routeData={routeData}
        onCancel={() => {
          setIsPreviewLoading(false)
          setShowModeSelection(true)
          characterFetchedRef.current = false
          highwayAnalyzedRef.current = false
        }}
      />
    )
  }
  
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

  const hasHighwaySections = routeCharacter.segments?.some(s => s.character === 'transit')

  // ================================
  // MAIN PREVIEW RENDER
  // ================================
  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0f]/90 to-transparent">
        <div className="flex items-center justify-between p-2 pt-10">
          <div className="flex items-center gap-1.5">
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            </button>
            <button onClick={handleStyleChange} className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">{mapStyle === 'dark' ? <><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}</svg>
            </button>
            <button 
              onClick={handleToggleSleeve} 
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showSleeve ? 'bg-cyan-500/20 border border-cyan-500/50' : 'bg-black/70 border border-white/10'}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showSleeve ? '#00d4ff' : 'white'} strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </button>
            {hasHighwaySections && highwayBends.length > 0 && (
              <button 
                onClick={handleToggleHighwayBends} 
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${showHighwayBends ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-black/70 border border-white/10'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={showHighwayBends ? HIGHWAY_BEND_COLOR : 'white'} strokeWidth="2">
                  <path d="M4 19h16M4 15l4-8h8l4 8"/>
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mode indicator */}
            <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${selectedMode === HIGHWAY_MODE.COMPANION ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
              {selectedMode === HIGHWAY_MODE.COMPANION ? 'COMPANION' : 'BASIC'}
            </span>
            <div className="px-2 py-1 rounded-full bg-black/70 border border-white/10 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2"><path d="M2 22L12 2l10 20H2z"/></svg>
              <span className="text-[10px] text-white/80">{isLoadingElevation ? '...' : `${elevationGain}${settings.units === 'metric' ? 'm' : 'ft'}`}</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: `${difficultyRating.color}30`, color: difficultyRating.color }}>
              {difficultyRating.label}
            </span>
            {routeData?.name && (
              <button onClick={handleToggleFavorite} className={`w-9 h-9 rounded-full flex items-center justify-center border ${isRouteFavorite ? 'bg-amber-500/20 border-amber-500/30' : 'bg-black/70 border-white/10'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isRouteFavorite ? '#f59e0b' : 'none'} stroke={isRouteFavorite ? '#f59e0b' : 'white'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
            )}
          </div>
        </div>

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
      </div>

      {/* Elevation mini widget */}
      {elevationData.length > 0 && (
        <div className="absolute right-2 z-20" style={{ top: '180px' }}>
          <div className="bg-black/80 rounded-lg p-1.5 border border-white/10 w-24">
            <div className="text-[8px] text-white/50 mb-0.5">ELEVATION</div>
            <MiniElevation data={elevationData} color={modeColor} />
          </div>
        </div>
      )}

      {/* Fly controls */}
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
                <button key={s} onClick={() => setFlySpeed(s)} className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${flySpeed === s ? 'bg-cyan-500 text-black' : 'text-white/60 hover:text-white'}`}>
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
        {/* Route Character */}
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
                    <span key={char} className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                      style={{ background: `${colors.primary}20`, color: colors.primary, border: `1px solid ${colors.primary}40` }}>
                      {colors.label} {dist}
                    </span>
                  )
                })}
                {highwayBends.length > 0 && (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                    style={{ background: `${HIGHWAY_BEND_COLOR}20`, color: HIGHWAY_BEND_COLOR, border: `1px solid ${HIGHWAY_BEND_COLOR}40` }}>
                    {highwayBends.length} sweeps
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* AI Co-Driver widget */}
        {curveEnhanced && agentResult && (
          <div className="mb-2">
            <button onClick={() => setAiSectionCollapsed(!aiSectionCollapsed)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-black/70 rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-[10px] text-emerald-400 font-semibold">AI Co-Driver</span>
              <span className="text-[9px] text-white/40">{curatedCallouts.length} callouts</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-white/40 transition-transform ${aiSectionCollapsed ? '' : 'rotate-180'}`}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            
            {!aiSectionCollapsed && (
              <div className="mt-2 p-2.5 bg-black/80 rounded-lg border border-emerald-500/20 max-w-md">
                <div className="text-[10px] text-white/70 leading-relaxed mb-2">
                  {agentResult.summary?.summary || 'Route analyzed'}
                </div>
                <div className="flex flex-wrap gap-1">
                  {curatedCallouts.slice(0, 20).map((callout, i) => {
                    const angle = parseInt(callout.text?.match(/\d+/)?.[0]) || 0
                    let color = '#22c55e'
                    if (angle >= 70) color = '#ef4444'
                    else if (angle >= 45) color = '#f97316'
                    
                    const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
                    const text = callout.text || ''
                    let shortText = ''
                    
                    if (isGrouped) {
                      if (text.toLowerCase().includes('hairpin')) shortText = text.includes('DOUBLE') ? '2xHP' : 'HP'
                      else if (text.toLowerCase().includes('chicane')) shortText = 'CHI'
                      else shortText = `G${callout.groupedFrom.length}`
                    } else {
                      const dirMatch = text.match(/\b(left|right)\b/i)
                      const angleMatch = text.match(/(\d+)/)
                      shortText = dirMatch && angleMatch ? `${dirMatch[1][0].toUpperCase()}${angleMatch[1]}` : text.substring(0, 6)
                    }
                    
                    return (
                      <button key={callout.id || i}
                        onClick={() => {
                          setSelectedCurve({ ...callout, isCuratedCallout: true })
                          if (mapRef.current && callout.position) mapRef.current.flyTo({ center: callout.position, zoom: 14, pitch: 45, duration: 800 })
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                        style={{ background: color, color: '#fff', border: isGrouped ? '2px solid #fff' : 'none' }}>
                        {shortText}
                      </button>
                    )
                  })}
                  {curatedCallouts.length > 20 && (
                    <span className="px-1.5 py-0.5 text-[9px] text-white/40">+{curatedCallouts.length - 20} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode + Actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="flex bg-black/60 rounded-full p-0.5 border border-white/10">
              {[{ id: 'cruise', l: 'CRUISE', c: '#00d4ff' }, { id: 'fast', l: 'FAST', c: '#ffd500' }, { id: 'race', l: 'RACE', c: '#ff3366' }].map(m => (
                <button key={m.id} onClick={() => setMode(m.id)} 
                  className="px-3 py-1 rounded-full text-[10px] font-bold transition-all"
                  style={{ background: mode === m.id ? m.c : 'transparent', color: mode === m.id ? (m.id === 'fast' ? '#000' : '#fff') : '#fff6' }}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            <Btn icon="edit" onClick={onEdit} tip="Edit" highlight={hasEdits} />
            <Btn icon="reverse" onClick={handleReverseRoute} tip="Reverse" />
            <Btn icon="fly" onClick={handleFlyThrough} disabled={isFlying} tip="Preview" />
            <Btn icon="voice" onClick={handleSampleCallout} tip="Test" />
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
      {!mapLoaded && !showModeSelection && <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-40"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>}
    </div>
  )
}

// ================================
// HELPER COMPONENTS
// ================================

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
              <button onClick={() => setShowTab('curves')} className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'curves' ? 'bg-white/20 text-white' : 'text-white/50'}`}>Curves</button>
              <button onClick={() => setShowTab('highway')} className={`px-3 py-1 rounded-full text-xs font-medium ${showTab === 'highway' ? 'bg-blue-500/30 text-blue-400' : 'text-white/50'}`}>Highway ({highwayBends.length})</button>
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: getCurveColor(curve.severity), color: '#000' }}>{curve.severity}</div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">{curve.isChicane ? `${curve.chicaneType} ${curve.startDirection}` : `${curve.direction} ${curve.severity}`}{curve.modifier && <span className="text-white/50 ml-1">{curve.modifier}</span>}</div>
                <div className="text-white/40 text-xs">{((curve.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}</div>
              </div>
              <div className="text-right">
                <div className="text-white/80 text-sm font-mono">{getSpd(curve.severity)}</div>
                <div className="text-white/40 text-[10px]">{settings.units === 'metric' ? 'km/h' : 'mph'}</div>
              </div>
            </button>
          ))
        ) : (
          highwayBends.map((bend, i) => (
            <button key={bend.id || i} onClick={() => onSelectBend(bend)} className={`w-full p-3 mb-1 rounded-lg flex items-center gap-3 border ${bend.isSection ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20' : 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'}`}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: bend.isSection ? '#f59e0b' : '#3b82f6', color: '#fff' }}>{bend.isSection ? bend.bendCount : bend.isSSweep ? 'S' : 'SW'}</div>
              <div className="flex-1 text-left">
                <div className="text-white text-sm font-medium">{bend.isSection ? `Active Section: ${bend.bendCount} bends` : bend.isSSweep ? `S-Sweep: ${bend.firstBend.direction} ${bend.firstBend.angle}° → ${bend.secondBend.direction} ${bend.secondBend.angle}°` : `${bend.direction} ${bend.angle}°`}</div>
                <div className="text-white/40 text-xs">{((bend.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}</div>
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

function CurvePopup({ curve, mode, settings, onClose }) {
  const getSpd = (s) => { 
    const b = { 1: 60, 2: 50, 3: 40, 4: 32, 5: 25, 6: 18 }, m = { cruise: 1, fast: 1.15, race: 1.3 }
    let v = Math.round((b[s] || 40) * (m[mode] || 1))
    return settings.units === 'metric' ? Math.round(v * 1.6) : v
  }
  
  const isCurated = curve.isCuratedCallout || curve.isLLMCurated || curve.isFlowBased
  
  if (isCurated) {
    const colors = { danger: '#ef4444', significant: '#f59e0b', sweeper: '#3b82f6', wake_up: '#10b981', section: '#8b5cf6', sequence: '#ec4899' }
    const color = colors[curve.type] || '#3b82f6'
    
    return (
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-black/90 rounded-xl p-4 border border-white/20 min-w-[280px] max-w-[340px]" style={{ borderColor: `${color}40` }}>
        <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: color, color: '#fff' }}>
            {curve.type === 'wake_up' ? '!' : curve.type === 'sequence' ? 'S' : curve.type?.[0]?.toUpperCase() || '•'}
          </div>
          <div>
            <div className="text-white font-bold text-sm">{curve.text || 'Callout'}</div>
            <div className="text-white/50 text-xs">Mile {curve.triggerMile?.toFixed(1) || '?'} • {curve.type || 'info'}</div>
          </div>
        </div>
        {curve.reason && (
          <div className="mb-3 p-2 bg-white/5 rounded-lg border border-white/10">
            <div className="text-[10px] text-white/40 mb-1">WHY</div>
            <div className="text-white/80 text-xs leading-relaxed">{curve.reason}</div>
          </div>
        )}
        <div className="flex justify-between text-sm border-t border-white/10 pt-2">
          <span className="text-white/50">Target</span>
          <span className="text-white font-mono">{curve.type === 'danger' ? getSpd(5) : curve.type === 'significant' ? getSpd(4) : getSpd(3)} {settings.units === 'metric' ? 'km/h' : 'mph'}</span>
        </div>
      </div>
    )
  }
  
  const color = curve.isSection ? '#f59e0b' : curve.isHighwayBend ? '#3b82f6' : getCurveColor(curve.severity)
  
  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-black/90 rounded-xl p-4 border border-white/20 min-w-[280px] max-w-[340px]">
      <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: color, color: '#fff' }}>
          {curve.isSection ? curve.bendCount : curve.isSSweep ? 'S' : curve.isHighwayBend ? 'SW' : curve.severity}
        </div>
        <div>
          <div className="text-white font-bold">{curve.isSection ? 'Active Section' : curve.isSSweep ? 'S-Sweep' : curve.isHighwayBend ? `${curve.direction} Sweep` : `${curve.direction} ${curve.severity}`}</div>
          {curve.angle && <div className="text-white/50 text-sm">{curve.angle}°{curve.length ? ` • ${curve.length}m` : ''}</div>}
        </div>
      </div>
      <div className="flex justify-between text-sm border-t border-white/10 pt-2 mt-2">
        <span className="text-white/50">Target</span>
        <span className="text-white font-mono">{curve.optimalSpeed || getSpd(curve.severity)} {settings.units === 'metric' ? 'km/h' : 'mph'}</span>
      </div>
    </div>
  )
}

function ShareModal({ name, onClose }) {
  const copyLink = () => { navigator.clipboard.writeText(window.location.href); onClose() }
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a24] rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold text-white mb-4">Share Route</h3>
        <p className="text-white/60 text-sm mb-4">{name || 'Rally Route'}</p>
        <button onClick={copyLink} className="w-full py-3 bg-cyan-500 text-black font-bold rounded-xl mb-2">Copy Link</button>
        <button onClick={onClose} className="w-full py-3 bg-white/10 text-white rounded-xl">Cancel</button>
      </div>
    </div>
  )
}
