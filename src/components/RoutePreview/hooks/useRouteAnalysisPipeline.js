import { useState, useEffect, useRef, useCallback } from 'react'
import useStore from '../../../store'

// Analysis services
import { analyzeRouteCharacter } from '../../../services/zoneService'
import { analyzeHighwayBends, HIGHWAY_MODE } from '../../../services/highwayModeService'
import { extractRoadRefs } from '../../../services/routeService'
import { analyzeRoadFlow, generateCalloutsFromEvents } from '../../../services/roadFlowAnalyzer'
import {
  classifyZones,
  reassignEventZones,
  extractCurvesFromEvents
} from '../../../services/simpleZoneClassifier'
import { filterEventsToCallouts } from '../../../services/ruleBasedCalloutFilter'
import { polishCalloutsWithLLM } from '../../../services/llmCalloutPolish'
import { generateGroupedCalloutSets } from '../../../services/calloutGroupingService'
import { generateChatterTimeline } from '../../../services/highwayChatterService'
import { dumpHighwayData } from '../../../services/highwayDataDebug'
import { getLLMApiKey, hasLLMApiKey } from '../../../services/llmZoneService'

/**
 * Hook to run the full route analysis pipeline
 * @param {Object} routeData - Route with coordinates, legs, distance, curves
 * @param {string} selectedMode - Highway mode (BASIC or COMPANION)
 * @param {boolean} enabled - Whether to run the analysis
 * @returns {Object} Analysis results and loading states
 */
export function useRouteAnalysisPipeline(routeData, selectedMode, enabled = true) {
  // Loading states
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false)
  const [loadingStages, setLoadingStages] = useState({
    route: 'pending',
    curves: 'pending',
    zones: 'pending',
    highway: 'pending',
    callouts: 'pending',
    chatter: 'pending',
    voices: 'pending'
  })

  // Analysis results
  const [routeCharacter, setRouteCharacter] = useState({ segments: [], summary: null, censusTracts: [] })
  const [highwayBends, setHighwayBends] = useState([])
  const [curatedCallouts, setCuratedCallouts] = useState([])
  const [agentResult, setAgentResult] = useState(null)
  const [curveEnhanced, setCurveEnhanced] = useState(false)

  // Guards
  const characterFetchedRef = useRef(false)
  const highwayAnalyzedRef = useRef(false)
  const routeIdRef = useRef(null)

  // Store actions
  const setRouteZones = useStore(state => state.setRouteZones)
  const setHighwayBendsStore = useStore(state => state.setHighwayBends)

  // Helper to update stages
  const updateStage = useCallback((stage, status) => {
    setLoadingStages(prev => ({ ...prev, [stage]: status }))
  }, [])

  // Reset for new route
  const reset = useCallback(() => {
    characterFetchedRef.current = false
    highwayAnalyzedRef.current = false
    routeIdRef.current = null
    setIsLoading(false)
    setIsLoadingCharacter(false)
    setLoadingStages({
      route: 'pending',
      curves: 'pending',
      zones: 'pending',
      highway: 'pending',
      callouts: 'pending',
      chatter: 'pending',
      voices: 'pending'
    })
    setRouteCharacter({ segments: [], summary: null, censusTracts: [] })
    setHighwayBends([])
    setCuratedCallouts([])
    setAgentResult(null)
    setCurveEnhanced(false)
  }, [])

  // Main analysis pipeline
  const runAnalysis = useCallback(async () => {
    if (!routeData?.coordinates?.length || routeData.coordinates.length < 2) return
    if (characterFetchedRef.current) return
    if (!enabled) return

    characterFetchedRef.current = true
    setIsLoading(true)
    setIsLoadingCharacter(true)

    const coordinates = routeData.coordinates
    const curves = routeData.curves || []

    try {
      // ========================================
      // Step 1: Census analysis
      // ========================================
      updateStage('zones', 'loading')
      const censusAnalysis = await analyzeRouteCharacter(coordinates, curves)
      const censusSegments = censusAnalysis.segments || []
      console.log('📊 Census zones:', censusSegments.map(s => `${s.character}(${((s.end - s.start) / 1609.34).toFixed(1)}mi)`).join(' → '))

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
        setHighwayBends(rawBends)
        if (setHighwayBendsStore) {
          setHighwayBendsStore(rawBends)
        }
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

              // Log the actual callout text for debugging
              console.log('\n🎯 FINAL CALLOUTS:')
              groupedSets.standard.forEach((c, i) => {
                console.log(`  ${i + 1}. Mile ${(c.triggerMile || c.mile || 0).toFixed(1)} | ${c.zone || 'unknown'} | "${c.text}"`)
              })

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
                  console.log(`🎙️ Chatter progress: ${progress}%`)
                }
              )

              console.log(`🎙️ Generated ${chatterResult.chatterTimeline.length} chatter items`)
              console.log(`   Method: ${chatterResult.method}`)

              // Log the actual chatter text for debugging
              if (chatterResult.chatterTimeline.length > 0) {
                console.log('\n🎙️ CHATTER ITEMS:')
                chatterResult.chatterTimeline.forEach((c, i) => {
                  const text = c.text || c.variants?.cruise?.[0] || c.message || 'no text'
                  console.log(`  ${i + 1}. Mile ${(c.triggerMile || c.mile || 0).toFixed(1)} | "${text}"`)
                })
              }

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
      setIsLoading(false)

    } catch (err) {
      console.error('Route analysis error:', err)
      setIsLoadingCharacter(false)
      setIsLoading(false)
    }
  }, [routeData, selectedMode, enabled, updateStage, setRouteZones, setHighwayBendsStore])

  // Trigger analysis when route data and mode are ready
  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && selectedMode && enabled && !characterFetchedRef.current) {
      runAnalysis()
    }
  }, [routeData?.coordinates, selectedMode, enabled, runAnalysis])

  return {
    // Loading states
    isLoading,
    isLoadingCharacter,
    loadingStages,

    // Results
    routeCharacter,
    highwayBends,
    curatedCallouts,
    agentResult,
    curveEnhanced,

    // Actions
    reset,
    runAnalysis
  }
}

export default useRouteAnalysisPipeline
