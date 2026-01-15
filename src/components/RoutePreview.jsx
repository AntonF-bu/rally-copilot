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
import { generateChatterTimeline } from '../services/chatterService'

import { 
  classifyZones, 
  classifyByRoadName, 
  convertToStandardFormat, 
  reassignEventZones,
  extractCurvesFromEvents 
} from '../services/simpleZoneClassifier'
import useHighwayStore from '../services/highwayStore'
import CopilotLoader from './CopilotLoader'
import PreviewLoader from './PreviewLoader'

// ================================
// Route Preview - v36
// FIX: Zone coloring now works correctly
// - Waits for zones before drawing route
// - Properly cleans up and rebuilds layers
// - Transit = gray, Technical = cyan
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
  
  // Track if initial route has been drawn (to prevent premature drawing)
  const initialRouteDrawnRef = useRef(false)
  
  // LLM Curve Enhancement state - NOW AI AGENT
  const [curveEnhanced, setCurveEnhanced] = useState(false)
  const [curatedCallouts, setCuratedCallouts] = useState([])
  const [agentResult, setAgentResult] = useState(null)
  const [agentProgress, setAgentProgress] = useState(null)
  const [aiSectionCollapsed, setAiSectionCollapsed] = useState(true)
  
  // Highway bends - LOCAL state for UI (raw bends, before curation)
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
  
  // Preview loading stages
  const [previewLoadingStages, setPreviewLoadingStages] = useState({})
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  
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

  // ================================
  // FETCH ROUTE CHARACTER - v35 with simpleZoneClassifier v2
  // ================================
  const fetchRouteCharacter = useCallback(async (coordinates, curves) => {
    if (!coordinates?.length || coordinates.length < 2 || characterFetchedRef.current) return
    characterFetchedRef.current = true
    setIsLoadingCharacter(true)
    setIsPreviewLoading(true)
    
    // Helper to update stages
    const updateStage = (stage, status) => {
      setPreviewLoadingStages(prev => ({ ...prev, [stage]: status }))
    }
    
    try {
      // ========================================
      // Step 1: Get Census-based zones (for urban detection at edges)
      // ========================================
      updateStage('zones', 'loading')
      const censusAnalysis = await analyzeRouteCharacter(coordinates, curves || [])
      const censusSegments = censusAnalysis.segments || []
      console.log('📊 Census zones (reference):', censusSegments.map(s => `${s.character}(${((s.end - s.start)/1609.34).toFixed(1)}mi)`).join(' → '))
      
      // ========================================
      // Step 2: Extract road refs from Mapbox legs data
      // ========================================
      let roadSegments = []
      if (routeData?.legs && routeData.legs.length > 0) {
        console.log('\n🛣️ Extracting road refs from route legs...')
        roadSegments = await extractRoadRefs(routeData.legs, routeData.distance, routeData.coordinates)
        
        // Log road ref summary
        const interstates = roadSegments.filter(s => s.roadClass === 'interstate')
        const usHighways = roadSegments.filter(s => s.roadClass === 'us_highway')
        const stateRoutes = roadSegments.filter(s => s.roadClass === 'state_route')
        const localRoads = roadSegments.filter(s => s.roadClass === 'local')
        console.log(`   Road coverage: ${interstates.length} interstate, ${usHighways.length} US hwy, ${stateRoutes.length} state, ${localRoads.length} local`)
      } else {
        console.log('⚠️ No legs data available for road ref extraction')
      }
      
      // ========================================
      // Step 3: Run Road Flow Analyzer with uniform sampling
      // ========================================
      const uniformZones = [{
        start: 0,
        end: routeData.distance,
        character: 'transit'
      }]
      
      console.log('\n🌊 Running Road Flow Analyzer (uniform sampling for zone classification)...')
      const flowResult = analyzeRoadFlow(coordinates, uniformZones, routeData.distance)
      window.__roadFlowData = flowResult
      console.log('💡 Access road flow data: window.__roadFlowData')
      
      // ========================================
      // ========================================
      // Step 4: Classify zones with urban detection
      // Uses simpleZoneClassifier v5 which handles urban overlay internally
      // ========================================
      console.log('\n🛣️ Classifying zones with simpleZoneClassifier v5...')
      updateStage('zones', 'loading')
      
      const totalMiles = routeData.distance / 1609.34
      
      // Extract curves for legacy compatibility (not used by v5 but may be needed elsewhere)
      const curvesForAnalysis = extractCurvesFromEvents(flowResult.events)
      console.log(`   Extracted ${curvesForAnalysis.length} curves for analysis`)
      
      // NEW: Single async call handles both road classification AND urban detection
      const activeZones = await classifyZones(
        roadSegments,
        totalMiles,
        coordinates,           // Pass coordinates for urban detection
        routeData.distance     // Pass total distance in meters
      )
      
      updateStage('zones', 'complete')

      
      // Update state
      setRouteCharacter({ ...censusAnalysis, segments: activeZones })
      setRouteZones(activeZones)
      updateStage('zones', 'complete')
      setIsLoadingCharacter(false)
      
      // Skip LLM zone validation - road names are authoritative now
      updateStage('aiZones', 'complete')
      setIsLoadingAI(false)
      
      // ========================================
      // Step 5: Analyze highway bends (using classified zones)
      // ========================================
      if (!highwayAnalyzedRef.current && activeZones?.length) {
        highwayAnalyzedRef.current = true
        updateStage('highway', 'loading')
        
        const rawBends = analyzeHighwayBends(coordinates, activeZones)
        console.log(`🛣️ Found ${rawBends.length} raw highway bends`)
        setHighwayBendsLocal(rawBends)
        setHighwayBends(rawBends)
        updateStage('highway', 'complete')
        
        // DEBUG: Dump all highway data for analysis
        console.log('🔍 Dumping highway data for analysis...')
        const debugData = dumpHighwayData(rawBends, activeZones, routeData)
        window.__highwayDebugData = debugData
        
        // ========================================
        // Step 6: HYBRID CALLOUT SYSTEM - Rule-based + LLM Polish
        // ========================================
        if (flowResult.events.length > 0) {
          updateStage('aiCurves', 'loading')
          console.log('📋 Running Hybrid Callout System...')
          
          // UPDATED: Use reassignEventZones from simpleZoneClassifier
          const eventsWithCorrectZones = reassignEventZones(flowResult.events, activeZones)
          console.log(`📍 Reassigned zones to ${eventsWithCorrectZones.length} events`)
          
          // Update the global flow data with correct zones
          flowResult.events = eventsWithCorrectZones
          window.__roadFlowData = flowResult
          
          try {
            // ========================================
            // STAGE 6a: Rule-Based Filtering (always runs)
            // ========================================
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
            
            // Store rule-based result for debugging
            window.__ruleBasedCallouts = ruleBasedResult
            console.log('💡 Access rule-based callouts: window.__ruleBasedCallouts')
            
            // ========================================
            // STAGE 6b: LLM Polish (optional, can fail safely)
            // ========================================
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
            
            // ========================================
            // Format and store final callouts
            // ========================================
            if (finalResult.callouts.length > 0) {
              console.log(`\n✅ HYBRID SYSTEM COMPLETE: ${finalResult.callouts.length} callouts`)
              console.log(`   Analysis: ${finalResult.analysis}`)
              
              // Format callouts for display
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
              
              // ========================================
              // STAGE 6c: Speed-Based Grouping
              // ========================================
              console.log('\n🎯 STAGE 3: Speed-Based Grouping')
              const groupedSets = generateGroupedCalloutSets(
                formattedCallouts,
                { totalMiles: routeData.distance / 1609.34 }
              )
              
              console.log(`   Fast set: ${groupedSets.fast.length} callouts (${groupedSets.stats.fastReduction}% reduction)`)
              console.log(`   Standard set: ${groupedSets.standard.length} callouts (${groupedSets.stats.standardReduction}% reduction)`)
              
              // Store grouped sets for runtime selection
              window.__groupedCallouts = groupedSets
              console.log('💡 Access grouped callouts: window.__groupedCallouts')
              
              // Log sample grouped callouts
              console.log('\n📍 Standard set sample:')
              groupedSets.standard.slice(0, 10).forEach(c => {
                const mile = c.triggerMile ?? c.mile ?? 0
                const grouped = c.groupedFrom ? ` [grouped ${c.groupedFrom.length}]` : ''
                console.log(`   Mile ${mile.toFixed(1)}: "${c.text}" [${c.zone}/${c.type}]${grouped}`)
              })
              
              // Use STANDARD set for preview display
              const displayCallouts = groupedSets.standard
              
              // Debug: Log technical zone callouts
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
              
              // Store BOTH sets in global store for navigation runtime selection
// Store BOTH sets in global store for navigation runtime selection
              useStore.getState().setCuratedHighwayCallouts(displayCallouts)
              useStore.getState().setGroupedCalloutSets?.(groupedSets)
              window.__hybridCallouts = finalResult
              
            } else {
              console.warn('⚠️ Hybrid system returned no callouts!')
            }
            
          } catch (hybridErr) {
            console.error('⚠️ Hybrid callout system error:', hybridErr)
            
            // Ultimate fallback: use simple rule-based from roadFlowAnalyzer
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
          
          // ========================================
          // ========================================
          // Step 7: Generate Highway Companion Chatter
          // ========================================
          if (hasLLMApiKey()) {
            console.log('\n🎙️ STAGE 4: Highway Companion Chatter')
            try {
              const highwayDataDump = window.__highwayDataDump || null
              
              const chatterResult = await generateChatterTimeline({
                zones: activeZones,
                callouts: curatedCallouts,
                routeData,
                elevationData: null,
                highwayDataDump
              })
              
              console.log(`🎙️ Generated ${chatterResult.chatterTimeline.length} chatter items`)
              console.log(`   Method: ${chatterResult.method}`)
              
              useStore.getState().setChatterTimeline?.(chatterResult.chatterTimeline)
              window.__chatterTimeline = chatterResult.chatterTimeline
              
              console.log('💡 Access chatter: window.__chatterTimeline')
            } catch (chatterErr) {
              console.warn('⚠️ Chatter generation failed:', chatterErr.message)
            }
          }
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

  // CRITICAL: Detect curves if routeData doesn't have them
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

  // Fetch demo route - NOW INCLUDES LEGS
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
          legs: route.legs  // Include legs for road ref extraction
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
      legs: routeData.legs  // Keep legs (though they won't be accurate for reversed route)
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

// HANDLE START - WITH LLM INTEGRATION
  // ================================
  const handleStart = async () => { 
    await initAudio()
    
    setIsPreparingCopilot(true)
    setCopilotProgress(0)
    setCopilotStatus('Initializing...')
    
    try {
      // ========================================
      // PHASE 1: LLM Zone Validation (re-run for freshness)
      // ========================================
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
            
            // Re-analyze highway bends with enhanced zones
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
      
      // ========================================
      // PHASE 2: Curve Enhancement (skip if already done in preview)
      // ========================================
      setCopilotProgress(35)
      
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

  // ================================
  // ================================
  // BUILD SLEEVE SEGMENTS - v39 FIX
  // Uses actual distance calculation, not linear interpolation
  // ================================
  const buildSleeveSegments = useCallback((coords, characterSegments) => {
    console.log('🎨 buildSleeveSegments called with', characterSegments?.length || 0, 'segments')
    
    if (!coords?.length || !characterSegments?.length) {
      return []
    }
    
    const totalDist = routeData?.distance || 15000
    
    // ========================================
    // STEP 1: Calculate cumulative distance for each coordinate
    // ========================================
    const coordDistances = [0]
    for (let i = 1; i < coords.length; i++) {
      const [lng1, lat1] = coords[i - 1]
      const [lng2, lat2] = coords[i]
      // Haversine distance in meters
      const R = 6371000
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      const dist = R * c
      coordDistances.push(coordDistances[i-1] + dist)
    }
    
    const calculatedTotal = coordDistances[coordDistances.length - 1]
    console.log(`🎨 Calculated route distance: ${(calculatedTotal/1609.34).toFixed(1)}mi vs reported ${(totalDist/1609.34).toFixed(1)}mi`)
    
    // ========================================
    // STEP 2: Find coordinate index for a given distance
    // ========================================
    const findCoordIndexAtDistance = (targetDist) => {
      // Scale target distance if there's a mismatch
      const scaledTarget = targetDist * (calculatedTotal / totalDist)
      
      for (let i = 0; i < coordDistances.length; i++) {
        if (coordDistances[i] >= scaledTarget) {
          return Math.max(0, i - 1)
        }
      }
      return coords.length - 1
    }
    
    // ========================================
    // STEP 3: Build segments using actual distances
    // ========================================
    const segments = []
    
    console.log('📊 ZONE SEGMENTS (distance-based):')
    characterSegments.forEach((seg, i) => {
      const startDist = seg.startDistance ?? (seg.start * 1609.34) ?? 0
      const endDist = seg.endDistance ?? (seg.end * 1609.34) ?? totalDist
      
      const startIdx = findCoordIndexAtDistance(startDist)
      const endIdx = findCoordIndexAtDistance(endDist)
      
      const actualStartMile = coordDistances[startIdx] / 1609.34
      const actualEndMile = coordDistances[endIdx] / 1609.34
      
      console.log(`   Segment ${i}: ${seg.character.toUpperCase()}`)
      console.log(`      Target: mile ${(startDist/1609.34).toFixed(1)} - ${(endDist/1609.34).toFixed(1)}`)
      console.log(`      Actual: mile ${actualStartMile.toFixed(1)} - ${actualEndMile.toFixed(1)}`)
      console.log(`      Coords: ${startIdx} - ${endIdx}`)
      
      const segCoords = coords.slice(startIdx, endIdx + 1)
      
      if (segCoords.length > 1) {
        const colors = CHARACTER_COLORS[seg.character] || CHARACTER_COLORS.technical
        segments.push({
          coords: segCoords,
          color: colors.primary,
          character: seg.character,
          startIdx,
          endIdx
        })
        console.log(`      ✓ Created with ${segCoords.length} coords, color ${colors.primary}`)
      }
    })
    
    return segments
  }, [routeData?.distance])

  // Build severity segments (unchanged)
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

  // ================================
  // ADD ROUTE - FIXED v36
  // Now properly handles zone-colored segments
  // ================================
  const addRoute = useCallback((map, coords, characterSegments, curves) => {
    if (!map || !coords?.length) return
    
    // Build segments using ZONE colors
    const zoneSegs = buildSleeveSegments(coords, characterSegments)
    
    // If no segments yet (zones not ready), don't draw anything
    if (!zoneSegs.length) {
      console.log('🗺️ addRoute: No segments to draw (waiting for zones)')
      return
    }
    
    console.log('🗺️ addRoute: Drawing', zoneSegs.length, 'zone segments')
    
    // Add each segment as a separate layer
    zoneSegs.forEach((seg, i) => {
      const srcId = `route-src-${i}`
      const glowId = `glow-${i}`
      const lineId = `line-${i}`
      
      // Remove existing if present
      if (map.getLayer(glowId)) map.removeLayer(glowId)
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getSource(srcId)) map.removeSource(srcId)
      
      // Add source
      map.addSource(srcId, { 
        type: 'geojson', 
        data: { 
          type: 'Feature', 
          geometry: { 
            type: 'LineString', 
            coordinates: seg.coords 
          } 
        } 
      })
      
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
          'line-opacity': 0.4 
        } 
      })
      
      // Add main line layer
      map.addLayer({ 
        id: lineId, 
        type: 'line', 
        source: srcId, 
        layout: { 'line-join': 'round', 'line-cap': 'round' }, 
        paint: { 
          'line-color': seg.color, 
          'line-width': 4 
        } 
      })
      
      console.log(`🗺️ Added segment ${i}: ${seg.character} with color ${seg.color}`)
    })
  }, [buildSleeveSegments])

  // Add curve markers - DISABLED: curated callouts handle all zones now
  const addMarkers = useCallback((map, curves, coords, segments) => {
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    // Old marker system disabled - curated callouts handle everything
  }, [])

  // Add highway markers - NOW SHOWS CURATED CALLOUTS (not raw bends)
  const addHighwayBendMarkers = useCallback((map, callouts) => {
    highwayMarkersRef.current.forEach(m => m.remove())
    highwayMarkersRef.current = []
    
    if (!showHighwayBends) return
    
    // Helper to create short label for marker
    const getShortLabel = (callout) => {
      const text = callout.text || ''
      
      // Check if this is a grouped callout
      const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
      
      if (isGrouped) {
        // For grouped callouts, show pattern-based short text
        if (text.toLowerCase().includes('hairpin')) {
          return text.includes('DOUBLE') ? '2xHP' : 'HP'
        } else if (text.toLowerCase().includes('chicane')) {
          return 'CHI'
        } else if (text.toLowerCase().includes('esses')) {
          return 'ESS'
        } else if (text.includes('HARD')) {
          const hardMatch = text.match(/HARD\s+(LEFT|RIGHT)\s+(\d+)/i)
          return hardMatch ? `H${hardMatch[1][0]}${hardMatch[2]}` : 'HRD'
        } else if (text.match(/\d+\s*(left|right)s/i)) {
          const countMatch = text.match(/(\d+)\s*(left|right)s/i)
          return countMatch ? `${countMatch[1]}${countMatch[2][0].toUpperCase()}` : text.substring(0, 4)
        } else if (text.toLowerCase().includes('tightens')) {
          return 'TGT'
        } else {
          return `G${callout.groupedFrom.length}`
        }
      }
      
      // Individual callout handling
      if (callout.type === 'wake_up') return '!'
      if (callout.type === 'sequence') return 'SEQ'
      
      // Extract direction (L/R) and angle if present
      const dirMatch = text.match(/\b(left|right|L|R)\b/i)
      const angleMatch = text.match(/(\d+)/);
      
      if (dirMatch && angleMatch) {
        const dir = dirMatch[1][0].toUpperCase()
        return `${dir}${angleMatch[1]}`
      }
      
      if (angleMatch) return angleMatch[1]
      if (dirMatch) return dirMatch[1][0].toUpperCase()
      
      return callout.type?.[0]?.toUpperCase() || '•'
    }
    
    // Use curated callouts if available, otherwise show nothing on highway
    const markersToShow = callouts || curatedCallouts || []
    
    if (!markersToShow.length) {
      console.log('🗺️ No curated callouts to display')
      return
    }
    
    console.log(`🗺️ Rendering ${markersToShow.length} curated highway callouts`)
    
    markersToShow.forEach(callout => {
      if (!callout.position) return
      
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      
      // Short label
      const shortLabel = getShortLabel(callout)
      
      // Highway uses blue, Technical/Urban use severity colors
      let color
      const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
      
      if (callout.zone === 'transit' || callout.zone === 'highway') {
        color = '#3b82f6' // Blue for highway
      } else {
        // Technical/Urban use severity-based colors
        const angle = parseInt(callout.text?.match(/\d+/)?.[0]) || 0
        if (angle >= 70 || callout.text?.toLowerCase().includes('hairpin')) {
          color = '#ef4444' // Red - danger
        } else if (angle >= 45 || callout.text?.toLowerCase().includes('chicane') || callout.text?.toLowerCase().includes('esses')) {
          color = '#f97316' // Orange - significant
        } else {
          color = '#22c55e' // Green - moderate
        }
      }
      
      // Style matching the screenshot - solid bg, colored border, white text for non-highway
      const isHighway = callout.zone === 'transit' || callout.zone === 'highway'
      el.innerHTML = `
        <div style="
          background: ${isHighway ? color + '30' : color};
          padding: ${isGrouped ? '4px 12px' : '4px 10px'};
          border-radius: ${isGrouped ? '12px' : '6px'};
          border: ${isGrouped ? '3px solid #fff' : '2px solid ' + color};
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        " 
        title="${callout.text}&#10;Mile ${callout.triggerMile?.toFixed(1) || '?'}&#10;Zone: ${callout.zone}&#10;${callout.reason || ''}${isGrouped ? '&#10;(' + callout.groupedFrom.length + ' curves grouped)' : ''}">
          <span style="font-size:${isGrouped ? '12px' : '11px'};font-weight:${isGrouped ? '700' : '600'};color:${isHighway ? color : '#fff'};">${shortLabel}</span>
        </div>
      `
      
      el.onclick = () => {
        setSelectedCurve({
          ...callout,
          isCuratedCallout: true
        })
        if (mapRef.current) {
          mapRef.current.flyTo({ center: callout.position, zoom: 14, pitch: 45, duration: 800 })
        }
      }
      
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(callout.position)
        .addTo(map)
      
      highwayMarkersRef.current.push(marker)
    })
  }, [showHighwayBends, curatedCallouts])

  // ================================
  // REBUILD ROUTE - FIXED v36
  // Properly cleans up ALL old layers before adding new ones
  // ================================
  const rebuildRoute = useCallback((data = routeData, charSegs = routeCharacter.segments) => {
    if (!mapRef.current || !data?.coordinates) return
    
    console.log('🔄 rebuildRoute called with', charSegs?.length || 0, 'segments')
    
    // Don't rebuild if no segments (zones not ready yet)
    if (!charSegs?.length) {
      console.log('🔄 rebuildRoute: No segments, skipping')
      return
    }
    
    // Clean up ALL old layers first
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
      if (mapRef.current.getSource(srcId)) {
        mapRef.current.removeSource(srcId)
      }
    }
    console.log('🔄 Cleaned up', removedCount, 'old layers')
    
    // Now add the new route
    addRoute(mapRef.current, data.coordinates, charSegs, data.curves)
    addMarkers(mapRef.current, data.curves, data.coordinates, charSegs)
    addHighwayBendMarkers(mapRef.current, curatedCallouts)
    
    initialRouteDrawnRef.current = true
  }, [routeData, routeCharacter.segments, addRoute, addMarkers, addHighwayBendMarkers, curatedCallouts])

  // ================================
  // EFFECT: Rebuild route when zones are ready
  // This is the KEY fix - only draw when we have zones
  // ================================
  useEffect(() => {
    if (mapLoaded && routeCharacter.segments?.length > 0) {
      console.log('🗺️ Zones ready, rebuilding route with', routeCharacter.segments.length, 'segments')
      rebuildRoute(routeData, routeCharacter.segments)
    }
  }, [routeCharacter.segments, mapLoaded, rebuildRoute, routeData])

  // Add highway markers when curated callouts are ready
  useEffect(() => {
    if (mapRef.current && mapLoaded && curatedCallouts.length > 0) {
      console.log('🗺️ Curated callouts ready, rendering markers...')
      addHighwayBendMarkers(mapRef.current, curatedCallouts)
    }
  }, [curatedCallouts, mapLoaded, addHighwayBendMarkers])

  // ================================
  // INITIALIZE MAP - FIXED v36
  // DON'T draw route on load - wait for zones
  // ================================
  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates || mapRef.current) return
    
    mapRef.current = new mapboxgl.Map({ 
      container: mapContainer, 
      style: MAP_STYLES[mapStyle], 
      center: routeData.coordinates[0], 
      zoom: 10, 
      pitch: 0 
    })
    
    mapRef.current.on('load', () => {
      setMapLoaded(true)
      
      // FIT BOUNDS immediately so user sees the route area
      const bounds = routeData.coordinates.reduce(
        (b, c) => b.extend(c), 
        new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
      )
      mapRef.current.fitBounds(bounds, { 
        padding: { top: 120, bottom: 160, left: 40, right: 40 }, 
        duration: 1000 
      })
      
      // DON'T draw route here - wait for zones to be ready
      // The useEffect watching routeCharacter.segments will handle it
      console.log('🗺️ Map loaded, waiting for zones before drawing route...')
    })
    
    mapRef.current.on('style.load', () => {
      // Only rebuild if we have zones
      if (routeCharacter.segments?.length > 0) {
        rebuildRoute()
      }
    })
    
    return () => { 
      markersRef.current.forEach(m => m.remove())
      highwayMarkersRef.current.forEach(m => m.remove())
      zoneLayersRef.current = []
      if (flyAnimationRef.current) cancelAnimationFrame(flyAnimationRef.current)
      mapRef.current?.remove()
      mapRef.current = null 
    }
  }, [mapContainer, routeData, mapStyle])

  const handleStyleChange = () => {
    const next = mapStyle === 'dark' ? 'satellite' : 'dark'
    setMapStyle(next)
    mapRef.current?.setStyle(MAP_STYLES[next])
  }

  // ================================
  // LOADING / ERROR STATES
  // ================================
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

  // Show preview loader while analyzing route
  if (isPreviewLoading && hasLLMApiKey()) {
    return (
      <PreviewLoader 
        isLoading={true}
        stages={previewLoadingStages}
        routeName={routeData?.name || 'Analyzing route...'}
      />
    )
  }

  // Check if route has highway sections
  const hasHighwaySections = routeCharacter.segments?.some(s => s.character === 'transit')

  // ================================
  // MAIN RENDER
  // ================================
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
                <span>AI Zones</span>
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
              view
            </button>
          </div>
        )}

        {/* AI CO-DRIVER - Compact widget */}
        {curveEnhanced && agentResult && (
          <div className="mb-2">
            <button 
              onClick={() => setAiSectionCollapsed(!aiSectionCollapsed)}
              className="flex items-center gap-2 px-2.5 py-1.5 bg-black/70 rounded-lg border border-emerald-500/30 hover:border-emerald-500/50 transition-all"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-[10px] text-emerald-400 font-semibold">AI Co-Driver</span>
              <span className="text-[9px] text-white/40">{curatedCallouts.length} callouts</span>
              <svg 
                width="10" 
                height="10" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
                className={`text-white/40 transition-transform ${aiSectionCollapsed ? '' : 'rotate-180'}`}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            
            {/* Expanded content */}
            {!aiSectionCollapsed && (
              <div className="mt-2 p-2.5 bg-black/80 rounded-lg border border-emerald-500/20 max-w-md">
                {/* Analysis */}
                <div className="text-[10px] text-white/70 leading-relaxed mb-2">
                  {agentResult.summary?.summary || agentResult.analysis || 'Route analyzed'}
                </div>
                
                {/* Callout pills */}
                <div className="flex flex-wrap gap-1">
                  {curatedCallouts.map((callout, i) => {
                    const angle = parseInt(callout.text?.match(/\d+/)?.[0]) || 0
                    let color = '#22c55e'
                    if (angle >= 70) color = '#ef4444'
                    else if (angle >= 45) color = '#f97316'
                    
                    const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
                    
                    const text = callout.text || ''
                    let shortText = ''
                    
                    if (isGrouped) {
                      if (text.toLowerCase().includes('hairpin')) {
                        shortText = text.includes('DOUBLE') ? '2xHP' : 'HP'
                        color = '#ef4444'
                      } else if (text.toLowerCase().includes('chicane')) {
                        shortText = 'CHI'
                        color = '#f97316'
                      } else if (text.toLowerCase().includes('esses')) {
                        shortText = 'ESS'
                        color = '#f97316'
                      } else if (text.includes('HARD')) {
                        const hardMatch = text.match(/HARD\s+(LEFT|RIGHT)\s+(\d+)/i)
                        shortText = hardMatch ? `H${hardMatch[1][0]}${hardMatch[2]}` : 'HRD'
                        color = '#ef4444'
                      } else if (text.match(/\d+\s*(left|right)s/i)) {
                        const countMatch = text.match(/(\d+)\s*(left|right)s/i)
                        shortText = countMatch ? `${countMatch[1]}${countMatch[2][0].toUpperCase()}` : text.substring(0, 4)
                      } else if (text.toLowerCase().includes('tightens')) {
                        shortText = 'TGT'
                      } else {
                        shortText = `G${callout.groupedFrom.length}`
                      }
                    } else {
                      const dirMatch = text.match(/\b(left|right)\b/i)
                      const angleMatch = text.match(/(\d+)/)
                      shortText = dirMatch && angleMatch 
                        ? `${dirMatch[1][0].toUpperCase()}${angleMatch[1]}` 
                        : callout.type === 'sequence' ? text.substring(0, 8) : text.substring(0, 6)
                    }
                    
                    return (
                      <button
                        key={callout.id || i}
                        onClick={() => {
                          setSelectedCurve({ ...callout, isCuratedCallout: true })
                          if (mapRef.current && callout.position) {
                            mapRef.current.flyTo({ center: callout.position, zoom: 14, pitch: 45, duration: 800 })
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                        style={{ 
                          background: color, 
                          color: '#fff',
                          border: isGrouped ? '2px solid #fff' : 'none'
                        }}
                        title={`${callout.text}\nMile ${callout.triggerMile?.toFixed(1)}${isGrouped ? `\n(${callout.groupedFrom.length} curves grouped)` : ''}`}
                      >
                        {shortText}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Agent loading state */}
        {isLoadingAI && agentProgress && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
            <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] text-cyan-300">
              AI Agent analyzing... (step {agentProgress.iteration})
            </span>
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

// ================================
// HELPER COMPONENTS
// ================================

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
  
  // Check if this is an LLM-curated callout
  const isCurated = curve.isCuratedCallout || curve.isLLMCurated || curve.isFlowBased
  
  if (isCurated) {
    // Curated callout popup
    const colors = {
      danger: '#ef4444',
      significant: '#f59e0b',
      sweeper: '#3b82f6',
      wake_up: '#10b981',
      section: '#8b5cf6',
      sequence: '#ec4899'
    }
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
        
        {/* Reason from LLM */}
        {curve.reason && (
          <div className="mb-3 p-2 bg-white/5 rounded-lg border border-white/10">
            <div className="text-[10px] text-white/40 mb-1">WHY THIS CALLOUT</div>
            <div className="text-white/80 text-xs leading-relaxed">{curve.reason}</div>
          </div>
        )}
        
        {/* Speed recommendation */}
        <div className="flex justify-between text-sm border-t border-white/10 pt-2">
          <span className="text-white/50">Target Speed</span>
          <span className="text-white font-mono">
            {curve.type === 'danger' ? getSpd(5) : curve.type === 'significant' ? getSpd(4) : getSpd(3)} {settings.units === 'metric' ? 'km/h' : 'mph'}
          </span>
        </div>
      </div>
    )
  }
  
  // Original popup for regular curves
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
