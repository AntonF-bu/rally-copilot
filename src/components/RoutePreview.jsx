import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech, generateCallout } from '../hooks/useSpeech'
import { getRoute, extractRoadRefs } from '../services/routeService'
import { detectCurves } from '../utils/curveDetection'
import { analyzeRouteCharacter, CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'
import { analyzeHighwayBends, HIGHWAY_MODE } from '../services/highwayModeService'
import { validateZonesWithLLM, getLLMApiKey, hasLLMApiKey } from '../services/llmZoneService'
import { generateCalloutSlots, addPositionsToSlots, formatSlotsForDisplay } from '../services/highwayCalloutGenerator'
import { polishCalloutsWithAI } from '../services/aiCalloutPolish'
import { dumpHighwayData } from '../services/highwayDataDebug'
import { analyzeRoadFlow, generateCalloutsFromEvents } from '../services/roadFlowAnalyzer'
import { filterEventsToCallouts } from '../services/ruleBasedCalloutFilter'
import { polishCalloutsWithLLM } from '../services/llmCalloutPolish'
import { generateGroupedCalloutSets } from '../services/calloutGroupingService'
import { 
  classifyByRoadName, 
  convertToStandardFormat, 
  reassignEventZones,
  extractCurvesFromEvents 
} from '../services/simpleZoneClassifier'
import useHighwayStore from '../services/highwayStore'
import CopilotLoader from './CopilotLoader'
import PreviewLoader from './PreviewLoader'

// ================================
// Route Preview - v37
// FIX: Zone colors now properly display on route line
// - Transit zones: Blue (#3b82f6)
// - Technical zones: Cyan (#22d3ee)
// - Added debug logging for segment building
// - Fixed layer cleanup in rebuildRoute
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
  
  const [curveEnhanced, setCurveEnhanced] = useState(false)
  const [curatedCallouts, setCuratedCallouts] = useState([])
  const [agentResult, setAgentResult] = useState(null)
  const [agentProgress, setAgentProgress] = useState(null)
  const [aiSectionCollapsed, setAiSectionCollapsed] = useState(true)
  
  const [highwayBends, setHighwayBendsLocal] = useState([])
  const [showHighwayBends, setShowHighwayBends] = useState(true)
  
  const { highwayMode, setHighwayMode } = useHighwayStore()
  
  const [isFlying, setIsFlying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [flySpeed, setFlySpeed] = useState(1)
  const flyAnimationRef = useRef(null)
  const flyIndexRef = useRef(0)
  
  const [elevationData, setElevationData] = useState([])
  const [isLoadingElevation, setIsLoadingElevation] = useState(false)
  
  const fetchedRef = useRef(false)
  const elevationFetchedRef = useRef(false)
  const characterFetchedRef = useRef(false)
  const highwayAnalyzedRef = useRef(false)
  
  const [routeCharacter, setRouteCharacter] = useState({ segments: [], summary: null, censusTracts: [] })
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  
  const [previewLoadingStages, setPreviewLoadingStages] = useState({})
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  
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

  const setHighwayBends = useCallback((bends) => {
    setHighwayBendsLocal(bends)
    if (setStoreHighwayBends) {
      setStoreHighwayBends(bends)
      console.log(`🛣️ Preview: Stored ${bends.length} highway bends in global store`)
    }
  }, [setStoreHighwayBends])

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  
  const hasEdits = editedCurves?.length > 0 || customCallouts?.length > 0 || routeZoneOverrides?.length > 0
  
  const isRouteFavorite = routeData?.name ? isFavorite(routeData.name) : false
  const handleToggleFavorite = () => { if (routeData) toggleFavorite(routeData) }

  const mapContainerRef = useCallback((node) => { if (node) setMapContainer(node) }, [])

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
  // FETCH ROUTE CHARACTER - v37
  // ================================
  const fetchRouteCharacter = useCallback(async (coordinates, curves) => {
    if (!coordinates?.length || coordinates.length < 2 || characterFetchedRef.current) return
    characterFetchedRef.current = true
    setIsLoadingCharacter(true)
    setIsPreviewLoading(true)
    
    const updateStage = (stage, status) => {
      setPreviewLoadingStages(prev => ({ ...prev, [stage]: status }))
    }
    
    try {
      updateStage('zones', 'loading')
      const censusAnalysis = await analyzeRouteCharacter(coordinates, curves || [])
      const censusSegments = censusAnalysis.segments || []
      console.log('📊 Census zones (reference):', censusSegments.map(s => `${s.character}(${((s.end - s.start)/1609.34).toFixed(1)}mi)`).join(' → '))
      
      let roadSegments = []
      if (routeData?.legs && routeData.legs.length > 0) {
        console.log('\n🛣️ Extracting road refs from route legs...')
        roadSegments = await extractRoadRefs(routeData.legs, routeData.distance, routeData.coordinates)
        
        const interstates = roadSegments.filter(s => s.roadClass === 'interstate')
        const usHighways = roadSegments.filter(s => s.roadClass === 'us_highway')
        const stateRoutes = roadSegments.filter(s => s.roadClass === 'state_route')
        const localRoads = roadSegments.filter(s => s.roadClass === 'local')
        console.log(`   Road coverage: ${interstates.length} interstate, ${usHighways.length} US hwy, ${stateRoutes.length} state, ${localRoads.length} local`)
      } else {
        console.log('⚠️ No legs data available for road ref extraction')
      }
      
      const uniformZones = [{
        start: 0,
        end: routeData.distance,
        character: 'transit'
      }]
      
      console.log('\n🌊 Running Road Flow Analyzer (uniform sampling for zone classification)...')
      const flowResult = analyzeRoadFlow(coordinates, uniformZones, routeData.distance)
      window.__roadFlowData = flowResult
      console.log('💡 Access road flow data: window.__roadFlowData')
      
      console.log('\n🛣️ Classifying zones with simpleZoneClassifier v2...')
      
      const totalMiles = routeData.distance / 1609.34
      
      const curvesForAnalysis = extractCurvesFromEvents(flowResult.events)
      console.log(`   Extracted ${curvesForAnalysis.length} curves for gap analysis`)
      
      const votedZones = classifyByRoadName(roadSegments, totalMiles, curvesForAnalysis)
      
      const activeZones = convertToStandardFormat(votedZones, routeData.distance)
      
      // Log the zones that will be used for coloring
      console.log('🎨 Active zones for route coloring:')
      activeZones.forEach((z, i) => {
        const color = CHARACTER_COLORS[z.character]?.primary || '#22d3ee'
        console.log(`   ${i + 1}. ${z.character}: Mile ${z.startMile?.toFixed(1)}-${z.endMile?.toFixed(1)} → ${color}`)
      })
      
      setRouteCharacter({ ...censusAnalysis, segments: activeZones })
      setRouteZones(activeZones)
      updateStage('zones', 'complete')
      setIsLoadingCharacter(false)
      
      updateStage('aiZones', 'complete')
      setIsLoadingAI(false)
      
      if (!highwayAnalyzedRef.current && activeZones?.length) {
        highwayAnalyzedRef.current = true
        updateStage('highway', 'loading')
        
        const rawBends = analyzeHighwayBends(coordinates, activeZones)
        console.log(`🛣️ Found ${rawBends.length} raw highway bends`)
        setHighwayBendsLocal(rawBends)
        setHighwayBends(rawBends)
        updateStage('highway', 'complete')
        
        console.log('🔍 Dumping highway data for analysis...')
        const debugData = dumpHighwayData(rawBends, activeZones, routeData)
        window.__highwayDebugData = debugData
        
        if (flowResult.events.length > 0) {
          updateStage('aiCurves', 'loading')
          console.log('📋 Running Hybrid Callout System...')
          
          const eventsWithCorrectZones = reassignEventZones(flowResult.events, activeZones)
          console.log(`📍 Reassigned zones to ${eventsWithCorrectZones.length} events`)
          
          flowResult.events = eventsWithCorrectZones
          window.__roadFlowData = flowResult
          
          try {
            console.log('\n📋 STAGE 1: Rule-Based Callout Filter')
            const ruleBasedResult = filterEventsToCallouts(
              eventsWithCorrectZones,
              { totalMiles: routeData.distance / 1609.34 },
              activeZones
            )
            
            console.log(`📋 Rule-based: ${ruleBasedResult.callouts.length} callouts`)
            console.log(`   By zone: Urban=${ruleBasedResult.stats.byZone.urban}, Highway=${ruleBasedResult.stats.byZone.transit}, Technical=${ruleBasedResult.stats.byZone.technical}`)
            console.log(`   Sequences: ${ruleBasedResult.sequences.length}`)
            console.log(`   Transitions: ${ruleBasedResult.transitions.length}`)
            console.log(`   Wake-ups: ${ruleBasedResult.wakeUps.length}`)
            
            window.__ruleBasedCallouts = ruleBasedResult
            console.log('💡 Access rule-based callouts: window.__ruleBasedCallouts')
            
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
                  console.log('✨ LLM polish applied successfully')
                } else {
                  console.log('ℹ️ Using rule-based callouts (LLM polish skipped or failed)')
                }
              } catch (polishErr) {
                console.warn('⚠️ LLM polish failed, using rule-based:', polishErr.message)
                finalResult = ruleBasedResult
              }
            } else {
              console.log('ℹ️ No API key - using rule-based callouts only')
            }
            
            if (finalResult.callouts.length > 0) {
              console.log(`\n✅ HYBRID SYSTEM COMPLETE: ${finalResult.callouts.length} callouts`)
              console.log(`   Analysis: ${finalResult.analysis}`)
              
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
              
              console.log('\n🎯 STAGE 3: Speed-Based Grouping')
              const groupedSets = generateGroupedCalloutSets(
                formattedCallouts,
                { totalMiles: routeData.distance / 1609.34 }
              )
              
              console.log(`   Fast set: ${groupedSets.fast.length} callouts (${groupedSets.stats.fastReduction}% reduction)`)
              console.log(`   Standard set: ${groupedSets.standard.length} callouts (${groupedSets.stats.standardReduction}% reduction)`)
              
              window.__groupedCallouts = groupedSets
              console.log('💡 Access grouped callouts: window.__groupedCallouts')
              
              console.log('\n📍 Standard set sample:')
              groupedSets.standard.slice(0, 10).forEach(c => {
                const mile = c.triggerMile ?? c.mile ?? 0
                const grouped = c.groupedFrom ? ` [grouped ${c.groupedFrom.length}]` : ''
                console.log(`   Mile ${mile.toFixed(1)}: "${c.text}" [${c.zone}/${c.type}]${grouped}`)
              })
              
              const displayCallouts = groupedSets.standard
              
              const techCallouts = displayCallouts.filter(c => c.zone === 'technical')
              console.log(`\n🔍 Technical callouts for display: ${techCallouts.length}`)
              techCallouts.slice(0, 15).forEach(c => {
                const isGrouped = c.groupedFrom ? `[GROUPED ${c.groupedFrom.length}]` : '[individual]'
                console.log(`   Mile ${(c.triggerMile ?? c.mile ?? 0).toFixed(1)}: "${c.text}" ${isGrouped}`)
              })
              
              setCuratedCallouts(displayCallouts)
              setAgentResult({
                summary: {
                  summary: finalResult.analysis,
                  rhythm: 'Hybrid Callout System v1.3 (simpleZoneClassifier v2)',
                  difficulty: 'auto'
                },
                reasoning: [
                  `Road Flow detected ${flowResult.events.length} events`,
                  `Rule-based filter: ${ruleBasedResult.callouts.length} callouts`,
                  `After grouping: Fast=${groupedSets.fast.length}, Standard=${groupedSets.standard.length}`,
                  finalResult.llmPolished ? 'LLM polish applied' : 'Rule-based text used'
                ],
                confidence: 95
              })
              setCurveEnhanced(true)
              
              useStore.getState().setCuratedHighwayCallouts(displayCallouts)
              useStore.getState().setGroupedCalloutSets?.(groupedSets)
              window.__hybridCallouts = finalResult
              
            } else {
              console.warn('⚠️ Hybrid system returned no callouts!')
            }
            
          } catch (hybridErr) {
            console.error('⚠️ Hybrid callout system error:', hybridErr)
            
            console.log('⚠️ Using emergency fallback callout generator')
            const fallbackCallouts = generateCalloutsFromEvents(flowResult.events, activeZones, routeData.distance)
            const formattedCallouts = fallbackCallouts.map(c => ({
              id: c.id,
              position: c.position,
              triggerDistance: c.triggerDistance,
              triggerMile: c.triggerMile,
              text: c.text,
              shortText: c.text.substring(0, 35),
              type: c.type,
              priority: c.severity,
              isFlowBased: true
            }))
            setCuratedCallouts(formattedCallouts)
            useStore.getState().setCuratedHighwayCallouts(formattedCallouts)
          }
          updateStage('aiCurves', 'complete')
        }
      }
      
      setIsLoadingAI(false)
      setIsPreviewLoading(false)
      
    } catch (err) {
      console.error('Route character analysis error:', err)
      setIsLoadingCharacter(false)
      setIsLoadingAI(false)
      setIsPreviewLoading(false)
    }
  }, [setRouteZones, routeData, setHighwayBends])

  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && (!routeData.curves || routeData.curves.length === 0)) {
      console.log('🔍 RoutePreview: No curves in routeData, detecting...')
      
      if (hasLLMApiKey()) {
        setIsPreviewLoading(true)
        setPreviewLoadingStages({ route: 'complete', curves: 'loading' })
      }
      
      const curves = detectCurves(routeData.coordinates)
      console.log(`🔍 RoutePreview: Detected ${curves.length} curves`)
      
      setPreviewLoadingStages(prev => ({ ...prev, curves: 'complete' }))
      
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
    setHighwayBends([])
    setElevationData([])
    setLlmEnhanced(false)
    setCurveEnhanced(false)
    if (mapRef.current && mapLoaded) rebuildRoute(reversed)
  }

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

  const [isPreparingCopilot, setIsPreparingCopilot] = useState(false)
  const [copilotProgress, setCopilotProgress] = useState(0)
  const [copilotReady, setCopilotReady] = useState(false)
  const [copilotStatus, setCopilotStatus] = useState('')

  const handleStart = async () => { 
    await initAudio()
    
    setIsPreparingCopilot(true)
    setCopilotProgress(0)
    setCopilotStatus('Initializing...')
    
    try {
      if (hasLLMApiKey() && routeCharacter.segments?.length > 0 && !llmEnhanced) {
        setCopilotProgress(5)
        setCopilotStatus('🤖 AI analyzing route zones...')
        console.log('🤖 Starting LLM zone validation...')
        
        try {
          const llmResponse = await validateZonesWithLLM(
            routeCharacter.segments,
            routeData,
            getLLMApiKey(),
            routeData.curves || []
          )
          
          setLlmResult(llmResponse)
          
          const { enhanced, original, changes } = llmResponse
          
          if (enhanced?.length > 0 && changes?.length > 0) {
            console.log(`🤖 LLM made ${changes.length} change(s):`)
            changes.forEach(c => console.log(`   - ${c}`))
            
            setLlmEnhanced(true)
            
            setRouteCharacter(prev => ({ ...prev, segments: enhanced }))
            setRouteZones(enhanced)
            
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
        } else if (llmEnhanced) {
          console.log('ℹ️ LLM already enhanced zones during preview')
        }
        setCopilotProgress(20)
      }
      
      setCopilotProgress(35)
      
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

  // ================================
  // BUILD SLEEVE SEGMENTS - v37 with debug logging
  // ================================
  const buildSleeveSegments = useCallback((coords, characterSegments) => {
    // Debug logging
    console.log('🎨 buildSleeveSegments called with', characterSegments?.length, 'segments:', 
      characterSegments?.map(s => `${s.character}(${s.startMile?.toFixed(1)}-${s.endMile?.toFixed(1)}mi)`).join(', '))
    console.log('🎨 First segment details:', characterSegments?.[0] ? JSON.stringify({
      character: characterSegments[0].character,
      start: characterSegments[0].start,
      end: characterSegments[0].end,
      startDistance: characterSegments[0].startDistance,
      endDistance: characterSegments[0].endDistance,
      startMile: characterSegments[0].startMile,
      endMile: characterSegments[0].endMile
    }) : 'none')
    
    if (!coords?.length) return []
    if (!characterSegments?.length) {
      console.log('🎨 No characterSegments - defaulting to all technical')
      return [{ coords, color: CHARACTER_COLORS.technical.primary, character: 'technical' }]
    }
    
    const segments = []
    const totalDist = routeData?.distance || 15000
    
    characterSegments.forEach((seg, i) => {
      let segCoords
      
      if (seg.coordinates?.length > 1) {
        segCoords = seg.coordinates
      } else if (seg.startIndex !== undefined && seg.endIndex !== undefined) {
        segCoords = coords.slice(seg.startIndex, seg.endIndex + 1)
      } else {
        const startProgress = Math.max(0, (seg.startDistance || seg.start || 0) / totalDist)
        const endProgress = Math.min(1, (seg.endDistance || seg.end || totalDist) / totalDist)
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
        console.log(`🎨 Segment ${i}: ${seg.character} → ${colors.primary} (${segCoords.length} points)`)
      }
    })
    
    console.log('🎨 Built', segments.length, 'visual segments:', 
      segments.map(s => `${s.character}:${s.color}(${s.coords?.length}pts)`).join(', '))
    
    return segments
  }, [routeData?.distance])


  // ================================
  // ADD ROUTE - v37 with improved layer management
  // ================================
  const addRoute = useCallback((map, coords, characterSegments, curves) => {
    if (!map || !coords?.length) return
    
    // Build segments using ZONE colors (not severity)
    const zoneSegs = buildSleeveSegments(coords, characterSegments)
    
    console.log('🗺️ addRoute: Adding', zoneSegs.length, 'zone segments to map')
    
    // Add route line colored by zone
    zoneSegs.forEach((seg, i) => {
      const src = `route-src-${i}`, glow = `glow-${i}`, line = `line-${i}`
      
      // Remove existing if present (important for rebuilds)
      try {
        if (map.getLayer(glow)) map.removeLayer(glow)
        if (map.getLayer(line)) map.removeLayer(line)
        if (map.getSource(src)) map.removeSource(src)
      } catch (e) {
        console.warn('🗺️ Error removing old layer:', e)
      }
      
      // Add new source and layers
      map.addSource(src, { 
        type: 'geojson', 
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: seg.coords } } 
      })
      
      map.addLayer({ 
        id: glow, 
        type: 'line', 
        source: src, 
        paint: { 'line-color': seg.color, 'line-width': 12, 'line-opacity': 0.3, 'line-blur': 3 } 
      })
      
      map.addLayer({ 
        id: line, 
        type: 'line', 
        source: src, 
        paint: { 'line-color': seg.color, 'line-width': 4, 'line-opacity': 0.9 } 
      })
      
      console.log(`🗺️ Added layer ${i}: ${seg.character} with color ${seg.color}`)
    })
    
    // Add curve markers
    if (curves?.length) {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      
      curves.forEach(curve => {
        if (!curve.position) return
        const el = document.createElement('div')
        el.className = 'curve-marker'
        el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${getCurveColor(curve.severity)};border:2px solid rgba(255,255,255,0.8);cursor:pointer;`
        el.onclick = () => handleCurveClick(curve)
        markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat(curve.position).addTo(map))
      })
    }
  }, [buildSleeveSegments, handleCurveClick])

  // ================================
  // REBUILD ROUTE - v37 with proper cleanup
  // ================================
  const rebuildRoute = useCallback((data = routeData, charSegs = routeCharacter.segments) => {
    console.log('🔄 rebuildRoute called with', charSegs?.length, 'segments')
    if (!mapRef.current || !data?.coordinates) {
      console.log('🔄 rebuildRoute: No map or coordinates')
      return
    }
    
    // Clean up ALL old layers first (important!)
    let removedLayers = 0
    let removedSources = 0
    for (let i = 0; i < 100; i++) {
      ['glow-', 'line-'].forEach(p => { 
        try {
          if (mapRef.current.getLayer(p + i)) {
            mapRef.current.removeLayer(p + i)
            removedLayers++
          }
        } catch (e) {}
      })
      try {
        if (mapRef.current.getSource('route-src-' + i)) {
          mapRef.current.removeSource('route-src-' + i)
          removedSources++
        }
      } catch (e) {}
    }
    console.log(`🔄 Removed ${removedLayers} layers, ${removedSources} sources`)
    
    // Now add the route with new segments
    addRoute(mapRef.current, data.coordinates, charSegs, data.curves)
    
    // Add highway bend markers
    if (highwayBends?.length > 0) {
      highwayMarkersRef.current.forEach(m => m.remove())
      highwayMarkersRef.current = []
      
      highwayBends.forEach(bend => {
        if (!bend.position) return
        const el = document.createElement('div')
        
        if (bend.isSSweep) {
          el.style.cssText = `width:20px;height:20px;background:${HIGHWAY_BEND_COLOR};border:2px solid white;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:bold;`
          el.innerHTML = 'S'
        } else if (bend.isSection) {
          el.style.cssText = `width:18px;height:18px;background:${HIGHWAY_BEND_COLOR};border:2px solid white;border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:bold;`
          el.innerHTML = bend.bendCount || '+'
        } else {
          el.style.cssText = `width:10px;height:10px;background:${HIGHWAY_BEND_COLOR};border:2px solid white;border-radius:50%;cursor:pointer;opacity:0.8;`
        }
        
        el.onclick = () => handleHighwayBendClick(bend)
        el.style.display = showHighwayBends ? 'flex' : 'none'
        highwayMarkersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat(bend.position).addTo(mapRef.current))
      })
    }
  }, [routeData, routeCharacter.segments, addRoute, highwayBends, showHighwayBends, handleHighwayBendClick])

  // Rebuild route when character segments change
  useEffect(() => {
    if (mapLoaded && routeData?.coordinates && routeCharacter.segments?.length > 0) {
      console.log('🔄 Character segments changed, rebuilding route visualization')
      rebuildRoute(routeData, routeCharacter.segments)
    }
  }, [mapLoaded, routeCharacter.segments, routeData, rebuildRoute])

  // ================================
  // MAP INITIALIZATION - v37
  // ================================
  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates?.length || mapRef.current) return
    
    const coords = routeData.coordinates
    const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]))
    
    const map = new mapboxgl.Map({ 
      container: mapContainer, 
      style: MAP_STYLES[mapStyle], 
      bounds, 
      fitBoundsOptions: { padding: { top: 120, bottom: 180, left: 40, right: 40 } },
      attributionControl: false
    })
    
    mapRef.current = map
    
    map.on('load', () => {
      setMapLoaded(true)
      
      // Use character segments if available, otherwise empty array
      // (will be rebuilt when segments are ready)
      const charSegs = routeCharacter.segments?.length > 0 ? routeCharacter.segments : []
      addRoute(map, coords, charSegs, routeData.curves)
      
      // Start/end markers
      new mapboxgl.Marker({ color: '#22c55e' }).setLngLat(coords[0]).addTo(map)
      new mapboxgl.Marker({ color: '#ef4444' }).setLngLat(coords[coords.length - 1]).addTo(map)
    })
    
    return () => { 
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      map.remove()
      mapRef.current = null 
    }
  }, [mapContainer, routeData, mapStyle, addRoute, routeCharacter.segments])

  // Rebuild when highwayBends change
  useEffect(() => {
    if (mapLoaded && routeData?.coordinates && highwayBends?.length > 0) {
      rebuildRoute()
    }
  }, [mapLoaded, highwayBends, rebuildRoute, routeData])

  // Map style change
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    mapRef.current.setStyle(MAP_STYLES[mapStyle])
    mapRef.current.once('style.load', () => {
      if (routeData?.coordinates) rebuildRoute()
    })
  }, [mapStyle, mapLoaded, rebuildRoute, routeData])

  const handleCuratedCalloutClick = (callout) => {
    if (mapRef.current && callout.position) {
      mapRef.current.flyTo({
        center: callout.position,
        zoom: 15,
        pitch: 45,
        duration: 800
      })
      
      setSelectedCurve({
        ...callout,
        isCuratedCallout: true,
        severity: callout.priority === 'high' ? 5 : callout.priority === 'medium' ? 3 : 1
      })
    }
  }

  // Curated callout markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !curatedCallouts?.length) {
      console.log('🗺️ No curated callouts to display')
      return
    }
    
    console.log(`🗺️ Rendering ${curatedCallouts.length} curated highway callouts`)
    
    const existingMarkers = document.querySelectorAll('.curated-callout-marker')
    existingMarkers.forEach(m => m.remove())
    
    curatedCallouts.forEach((callout, idx) => {
      if (!callout.position) return
      
      const el = document.createElement('div')
      el.className = 'curated-callout-marker'
      
      const isTransition = callout.type === 'transition'
      const isDanger = callout.type === 'danger' || callout.priority === 'high'
      const isGrouped = callout.groupedFrom?.length > 1
      
      let bgColor = '#10b981'
      let size = 8
      let borderStyle = '2px solid rgba(255,255,255,0.7)'
      
      if (isTransition) {
        bgColor = '#f59e0b'
        size = 14
        borderStyle = '2px solid white'
      } else if (isDanger) {
        bgColor = '#ef4444'
        size = 12
        borderStyle = '2px solid white'
      } else if (isGrouped) {
        bgColor = '#8b5cf6'
        size = 10
        borderStyle = '2px solid white'
      }
      
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${bgColor};
        border: ${borderStyle};
        border-radius: ${isTransition ? '3px' : '50%'};
        cursor: pointer;
        opacity: 0.9;
        transition: transform 0.2s, opacity 0.2s;
      `
      
      el.onmouseenter = () => {
        el.style.transform = 'scale(1.3)'
        el.style.opacity = '1'
      }
      el.onmouseleave = () => {
        el.style.transform = 'scale(1)'
        el.style.opacity = '0.9'
      }
      
      el.onclick = () => handleCuratedCalloutClick(callout)
      
      el.title = `${callout.text} (${callout.zone || 'highway'})`
      
      new mapboxgl.Marker({ element: el })
        .setLngLat(callout.position)
        .addTo(mapRef.current)
    })
  }, [mapLoaded, curatedCallouts])

  if (isLoadingRoute) return <div className="h-full flex items-center justify-center bg-gray-900 text-white"><div className="text-center"><div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full mb-4 mx-auto" /><p className="text-xl font-medium">Loading route...</p></div></div>
  if (loadError) return <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white gap-4"><p className="text-lg text-red-400">{loadError}</p><button onClick={fetchDemoRoute} className="px-4 py-2 bg-cyan-500 rounded-lg">Retry</button></div>
  if (!routeData?.coordinates?.length) return <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-white gap-4"><p className="text-lg text-gray-400">No route loaded</p><button onClick={onBack} className="px-4 py-2 bg-gray-700 rounded-lg">Go Back</button></div>

  return (
    <div className="h-full relative bg-gray-900">
      {isPreviewLoading && (
        <PreviewLoader 
          stages={previewLoadingStages} 
          onComplete={() => setIsPreviewLoading(false)}
        />
      )}
      
      <div ref={mapContainerRef} className="absolute inset-0" />
      
      {isPreparingCopilot && (
        <CopilotLoader 
          progress={copilotProgress}
          isReady={copilotReady}
          onReady={handleCopilotReady}
          status={copilotStatus}
        />
      )}
      
      {/* Top controls */}
      <div className="absolute top-4 left-4 right-4 z-20">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 bg-gray-900/90 backdrop-blur rounded-lg text-white text-sm shadow-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
          
          <div className="flex items-center gap-2">
            <button onClick={handleToggleFavorite} className={`p-2 rounded-lg shadow-lg ${isRouteFavorite ? 'bg-yellow-500 text-gray-900' : 'bg-gray-900/90 backdrop-blur text-white'}`}>
              <svg className="w-5 h-5" fill={isRouteFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
            </button>
            <button onClick={handleShare} className="p-2 bg-gray-900/90 backdrop-blur rounded-lg text-white shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            </button>
            <button onClick={() => setMapStyle(s => s === 'dark' ? 'satellite' : 'dark')} className="p-2 bg-gray-900/90 backdrop-blur rounded-lg text-white shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{mapStyle === 'dark' ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />}</svg>
            </button>
            {onEdit && hasEdits && (
              <button onClick={onEdit} className="p-2 bg-orange-500/90 backdrop-blur rounded-lg text-white shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </div>
        </div>
        
        {/* Route info */}
        <div className="mt-3 bg-gray-900/90 backdrop-blur rounded-lg p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-white truncate flex-1">{routeData.name || 'Rally Route'}</h2>
            <button onClick={handleReverseRoute} className="ml-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-white" title="Reverse route">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-300">{routeStats.distance} {routeStats.distanceUnit}</span>
            <span className="text-gray-300">~{routeStats.duration} min</span>
            <span className="text-cyan-400">{routeStats.curves} curves</span>
            {routeStats.sharpCurves > 0 && <span className="text-red-400">{routeStats.sharpCurves} sharp</span>}
            {elevationGain > 0 && <span className="text-green-400">↑{elevationGain}{settings.units === 'metric' ? 'm' : 'ft'}</span>}
          </div>
          
          {routeCharacter.segments?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="flex items-center gap-1 text-xs overflow-x-auto">
                {routeCharacter.segments.map((seg, i) => {
                  const miles = ((seg.endDistance || seg.end) - (seg.startDistance || seg.start)) / 1609.34
                  return (
                    <div key={i} className="flex items-center">
                      <span 
                        className="px-1.5 py-0.5 rounded text-white font-medium"
                        style={{ backgroundColor: CHARACTER_COLORS[seg.character]?.primary || '#666' }}
                      >
                        {seg.character === 'technical' ? '⚡' : seg.character === 'urban' ? '🏙️' : '🛣️'} {miles.toFixed(1)}mi
                      </span>
                      {i < routeCharacter.segments.length - 1 && <span className="text-gray-500 mx-1">→</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Difficulty badge */}
      <div className="absolute top-36 right-4 z-20">
        <div className="bg-gray-900/90 backdrop-blur rounded-lg p-2 shadow-lg text-center">
          <div className="text-xs text-gray-400 mb-1">Difficulty</div>
          <div className="text-lg font-bold" style={{ color: difficultyRating.color }}>{difficultyRating.label}</div>
        </div>
      </div>
      
      {/* Fly-through controls */}
      <div className="absolute top-52 right-4 z-20">
        <div className="bg-gray-900/90 backdrop-blur rounded-lg p-2 shadow-lg">
          {!isFlying ? (
            <button onClick={handleFlyThrough} className="flex items-center gap-2 text-white text-sm px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              Fly Through
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button onClick={toggleFlyPause} className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded text-white">
                  {isPaused ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>}
                </button>
                <button onClick={stopFlyThrough} className="flex items-center justify-center w-8 h-8 bg-red-600 hover:bg-red-500 rounded text-white">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                </button>
              </div>
              <div className="flex items-center gap-1">
                {[0.5, 1, 2, 4].map(speed => (
                  <button key={speed} onClick={() => setFlySpeed(speed)} className={`px-2 py-1 text-xs rounded ${flySpeed === speed ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}>{speed}x</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Visibility toggles */}
      <div className="absolute right-4 z-20" style={{ top: isFlying ? '320px' : '240px' }}>
        <div className="bg-gray-900/90 backdrop-blur rounded-lg p-2 shadow-lg flex flex-col gap-2">
          <button onClick={handleToggleSleeve} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${showSleeve ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            Zones
          </button>
          {highwayBends.length > 0 && (
            <button onClick={handleToggleHighwayBends} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors ${showHighwayBends ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              Bends ({highwayBends.length})
            </button>
          )}
        </div>
      </div>
      
      {/* Curve list toggle */}
      <div className="absolute left-4 z-20" style={{ top: '180px' }}>
        <button onClick={() => setShowCurveList(!showCurveList)} className="bg-gray-900/90 backdrop-blur rounded-lg px-3 py-2 text-white text-sm shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          {showCurveList ? 'Hide' : 'Curves'}
        </button>
      </div>
      
      {/* Curve list panel */}
      {showCurveList && (
        <div className="absolute left-4 z-20 bg-gray-900/95 backdrop-blur rounded-lg shadow-lg w-72 max-h-96 overflow-hidden" style={{ top: '220px' }}>
          <div className="p-3 border-b border-gray-700">
            <h3 className="font-semibold text-white">Curves ({routeData.curves?.length || 0})</h3>
            <div className="flex gap-2 mt-2 text-xs">
              <span className="text-green-400">Easy: {severityBreakdown.easy}</span>
              <span className="text-yellow-400">Med: {severityBreakdown.medium}</span>
              <span className="text-red-400">Hard: {severityBreakdown.hard}</span>
            </div>
          </div>
          <div className="overflow-y-auto max-h-72">
            {routeData.curves?.map((curve, i) => (
              <button key={i} onClick={() => handleCurveClick(curve)} className={`w-full px-3 py-2 text-left hover:bg-gray-800 flex items-center gap-3 ${selectedCurve === curve ? 'bg-gray-800' : ''}`}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getCurveColor(curve.severity) }} />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{curve.direction} {Math.round(curve.angle)}° - Sev {curve.severity}</div>
                  <div className="text-gray-400 text-xs">{((curve.distanceFromStart || 0) / (settings.units === 'metric' ? 1000 : 1609.34)).toFixed(1)} {settings.units === 'metric' ? 'km' : 'mi'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Selected curve info */}
      {selectedCurve && (
        <div className="absolute bottom-44 left-4 right-4 z-20">
          <div className="bg-gray-900/95 backdrop-blur rounded-lg p-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">
                {selectedCurve.isHighwayBend ? 'Highway Bend' : selectedCurve.isCuratedCallout ? 'Callout Point' : 'Curve Details'}
              </h3>
              <button onClick={() => setSelectedCurve(null)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Direction</div>
                <div className="text-white font-medium">{selectedCurve.direction}</div>
              </div>
              <div>
                <div className="text-gray-400">Angle</div>
                <div className="text-white font-medium">{Math.round(selectedCurve.angle)}°</div>
              </div>
              <div>
                <div className="text-gray-400">{selectedCurve.isHighwayBend ? 'Type' : 'Severity'}</div>
                <div className="font-medium" style={{ color: getCurveColor(selectedCurve.severity) }}>
                  {selectedCurve.isHighwayBend ? (selectedCurve.isSSweep ? 'S-Sweep' : selectedCurve.isSection ? 'Section' : 'Sweeper') : selectedCurve.severity}
                </div>
              </div>
            </div>
            {selectedCurve.isCuratedCallout && (
              <div className="mt-3 p-2 bg-gray-800 rounded">
                <div className="text-cyan-400 text-sm font-medium">"{selectedCurve.text}"</div>
                <div className="text-gray-400 text-xs mt-1">Zone: {selectedCurve.zone} | Type: {selectedCurve.type}</div>
              </div>
            )}
            {selectedCurve.calloutText && (
              <div className="mt-2 text-cyan-400 text-sm">Callout: "{selectedCurve.calloutText}"</div>
            )}
          </div>
        </div>
      )}
      
      {/* AI Enhancement results */}
      {agentResult && (
        <div className="absolute left-4 right-4 z-20" style={{ bottom: selectedCurve ? '280px' : '180px' }}>
          <div className="bg-gray-900/95 backdrop-blur rounded-lg shadow-lg overflow-hidden">
            <button 
              onClick={() => setAiSectionCollapsed(!aiSectionCollapsed)}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-800/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">✨</span>
                <span className="text-white font-medium">AI Co-Pilot Analysis</span>
                <span className="text-xs text-gray-400">({curatedCallouts.length} callouts)</span>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${aiSectionCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {!aiSectionCollapsed && (
              <div className="p-3 pt-0 border-t border-gray-800">
                <p className="text-sm text-gray-300 mb-2">{agentResult.summary?.summary}</p>
                <div className="text-xs text-gray-500">
                  {agentResult.reasoning?.slice(0, 3).map((r, i) => (
                    <div key={i}>• {r}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Bottom actions */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-gray-900 via-gray-900/95 to-transparent pt-12">
        <div className="flex gap-3">
          <button onClick={handleDownload} disabled={isDownloading || downloadComplete} className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 ${downloadComplete ? 'bg-green-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>
            {downloadComplete ? <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Ready</> : isDownloading ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Loading...</> : <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Preload</>}
          </button>
          <button onClick={handleSampleCallout} className="px-4 py-3 bg-gray-700 text-white rounded-xl hover:bg-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828" /></svg>
          </button>
          <button onClick={handleStart} className="flex-[2] py-3 rounded-xl font-bold text-lg flex items-center justify-center gap-2 text-gray-900" style={{ backgroundColor: modeColor }}>
            Start Navigation
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>
        
        {/* Mode selector */}
        <div className="flex justify-center gap-4 mt-3">
          {Object.entries(modeColors).map(([m, color]) => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${mode === m ? 'text-gray-900' : 'text-gray-400 bg-gray-800'}`} style={mode === m ? { backgroundColor: color } : {}}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Share modal */}
      {showShareModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Share Route</h3>
            <div className="bg-gray-900 p-3 rounded-lg mb-4"><code className="text-cyan-400 text-sm break-all">{location.href}</code></div>
            <div className="flex gap-3">
              <button onClick={() => { navigator.clipboard.writeText(location.href); setShowShareModal(false) }} className="flex-1 py-2 bg-cyan-500 text-gray-900 rounded-lg font-medium">Copy Link</button>
              <button onClick={() => setShowShareModal(false)} className="px-4 py-2 bg-gray-700 text-white rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
