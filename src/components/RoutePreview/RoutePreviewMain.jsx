import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../../store'
import useHighwayStore from '../../services/highwayStore'
import { useSpeech, generateCallout } from '../../hooks/useSpeech'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import { getRoute } from '../../services/routeService'
import { detectCurves } from '../../utils/curveDetection'
import { getCurveColor } from '../../data/routes'
import { ROUTE_CHARACTER, CHARACTER_COLORS } from '../../services/zoneService'
import { HIGHWAY_MODE } from '../../services/highwayModeService'

// Extracted hooks
import { useElevation } from './hooks/useElevation'
import { useFlythrough } from './hooks/useFlythrough'
import { useRouteAnalysisPipeline } from './hooks/useRouteAnalysisPipeline'
import { useMapSetup } from './hooks/useMapSetup'

// Extracted modals
import ShareModal from './modals/ShareModal'
import CurveListModal from './modals/CurveListModal'
import CurvePopupModal from './modals/CurvePopupModal'

// Extracted components
import FlyControls from './components/FlyControls'
import LoadingOverlay from './components/LoadingOverlay'

// Other components
import CopilotLoader from '../CopilotLoader'
import ModeSelection from '../ModeSelection'
import LoadingScreen from '../LoadingScreen'

// Constants
import { DEMO_START, DEMO_END, MAP_STYLES, MODE_COLORS } from './constants'
import { colors } from '../../styles/theme'

const HIGHWAY_BEND_COLOR = colors.highwayBend

/**
 * RoutePreview - Refactored orchestrator
 * Uses extracted hooks and components
 */
export default function RoutePreviewNew({ onStartNavigation, onBack, onEdit }) {
  // Enable iOS-style swipe-back gesture
  useSwipeBack(onBack)

  // ========================================
  // STORE STATE
  // ========================================
  const {
    routeData,
    mode,
    setMode,
    routeMode,
    setRouteData,
    isFavorite,
    toggleFavorite,
    settings,
    routeZoneOverrides,
    setRouteZones,
    editedCurves,
    customCallouts
  } = useStore()

  const setStoreHighwayBends = useStore(state => state.setHighwayBends)
  const { highwayMode, setHighwayMode } = useHighwayStore()
  const { initAudio, preloadRouteAudio, speak } = useSpeech()

  // ========================================
  // LOCAL STATE
  // ========================================
  // Mode selection
  const [showModeSelection, setShowModeSelection] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null)

  // UI visibility
  const [selectedCurve, setSelectedCurve] = useState(null)
  const [showCurveList, setShowCurveList] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  // Download state
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)

  // Route loading
  const [isLoadingRoute, setIsLoadingRoute] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const fetchedRef = useRef(false)

  // Copilot loader
  const [isPreparingCopilot, setIsPreparingCopilot] = useState(false)
  const [copilotProgress, setCopilotProgress] = useState(0)
  const [copilotReady, setCopilotReady] = useState(false)
  const [copilotStatus, setCopilotStatus] = useState('')

  // ========================================
  // EXTRACTED HOOKS
  // ========================================
  const analysisEnabled = !showModeSelection && !!selectedMode

  const {
    isLoading: isAnalysisLoading,
    isLoadingCharacter,
    loadingStages,
    routeCharacter,
    highwayBends,
    curatedCallouts,
    agentResult,
    curveEnhanced
  } = useRouteAnalysisPipeline(routeData, selectedMode, analysisEnabled)

  const {
    elevationData,
    elevationGain,
    isLoading: isLoadingElevation
  } = useElevation(routeData, settings)

  const handleCalloutClick = useCallback((callout) => {
    setSelectedCurve({ ...callout, isCuratedCallout: true })
  }, [])

  const {
    mapRef,
    mapContainerRef,
    mapLoaded,
    mapStyle,
    showSleeve,
    showHighwayBends,
    toggleStyle,
    toggleSleeve,
    toggleHighwayBends,
    flyTo
  } = useMapSetup({
    routeData,
    routeSegments: routeCharacter?.segments || [],
    callouts: curatedCallouts,
    enabled: analysisEnabled,
    onCalloutClick: handleCalloutClick
  })

  const {
    isFlying,
    isPaused,
    flySpeed,
    start: startFly,
    togglePause: toggleFlyPause,
    stop: stopFlyThrough,
    setSpeed: setFlySpeed
  } = useFlythrough(mapRef, routeData)

  // ========================================
  // COMPUTED VALUES
  // ========================================
  const modeColor = MODE_COLORS[mode] || MODE_COLORS.cruise
  const hasEdits = editedCurves?.length > 0 || customCallouts?.length > 0 || routeZoneOverrides?.length > 0
  const isRouteFavorite = routeData?.name ? isFavorite(routeData.name) : false
  const hasHighwaySections = routeCharacter?.segments?.some(s => s.character === 'transit')

  const routeStats = useMemo(() => {
    const dist = routeData?.distance
      ? (routeData.distance / (settings.units === 'metric' ? 1000 : 1609.34))
      : 0
    return {
      distance: dist.toFixed(1),
      distanceUnit: settings.units === 'metric' ? 'km' : 'mi',
      duration: routeData?.duration ? Math.round(routeData.duration / 60) : 0,
      curves: routeData?.curves?.length || 0,
      sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0,
      highwayBendCount: highwayBends?.length || 0
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

  // ========================================
  // HANDLERS
  // ========================================
  const handleModeSelect = useCallback((mode) => {
    console.log(`Mode selected: ${mode}`)
    setSelectedMode(mode)
    setHighwayMode(mode)
    setShowModeSelection(false)
  }, [setHighwayMode])

  const handleToggleFavorite = useCallback(() => {
    if (routeData) toggleFavorite(routeData)
  }, [routeData, toggleFavorite])

  const handleCurveClick = useCallback((curve) => {
    setSelectedCurve(curve)
    setShowCurveList(false)
    if (mapRef.current && curve.position) {
      mapRef.current.flyTo({ center: curve.position, zoom: 16, pitch: 45, duration: 800 })
    }
  }, [mapRef])

  const handleHighwayBendClick = useCallback((bend) => {
    setSelectedCurve({ ...bend, severity: bend.severity || 1, isHighwayBend: true })
    if (mapRef.current && bend.position) {
      mapRef.current.flyTo({ center: bend.position, zoom: 15, pitch: 45, duration: 800 })
    }
  }, [mapRef])

  const handleSampleCallout = useCallback(async () => {
    await initAudio()
    const curve = routeData?.curves?.find(c => c.severity >= 3) || routeData?.curves?.[0]
    if (curve) speak(generateCallout(curve, mode, settings.units === 'metric' ? 'kmh' : 'mph'), 'high')
  }, [initAudio, routeData, mode, settings.units, speak])

  const handleShare = useCallback(async () => {
    const data = {
      title: routeData?.name || 'Rally Route',
      text: `${routeStats.distance}${routeStats.distanceUnit}, ${routeStats.curves} curves`,
      url: location.href
    }
    if (navigator.share) {
      try { await navigator.share(data) } catch {}
    } else {
      setShowShareModal(true)
    }
  }, [routeData, routeStats])

  const handleReverseRoute = useCallback(() => {
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
  }, [routeData, setRouteData])

  const handleDownload = useCallback(async () => {
    if (isDownloading || !routeData?.curves?.length) return
    setIsDownloading(true)
    try {
      const result = await preloadRouteAudio(routeData.curves)
      if (result.success) setDownloadComplete(true)
    } catch {}
    finally { setIsDownloading(false) }
  }, [isDownloading, routeData, preloadRouteAudio])

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !routeData?.coordinates) return
    const bounds = routeData.coordinates.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0])
    )
    mapRef.current.fitBounds(bounds, {
      padding: { top: 80, bottom: 200, left: 40, right: 40 },
      duration: 1000
    })
  }, [mapRef, routeData])

  const handleStart = useCallback(async () => {
    await initAudio()
    setIsPreparingCopilot(true)
    setCopilotProgress(0)
    setCopilotStatus('Initializing...')

    try {
      setCopilotStatus('Loading voices...')
      const { preloadCopilotVoices } = await import('../../hooks/useSpeech')

      await preloadCopilotVoices(
        routeData?.curves || [],
        routeCharacter?.segments || [],
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
  }, [initAudio, routeData, routeCharacter])

  const handleCopilotReady = useCallback(() => {
    setIsPreparingCopilot(false)
    setCopilotReady(false)
    setCopilotProgress(0)
    setCopilotStatus('')
    onStartNavigation()
  }, [onStartNavigation])

  // START NAVIGATION button handler - shows mode selection first time, then proceeds
  const handleStartNavClick = useCallback(() => {
    if (!selectedMode) {
      // No mode selected yet - show mode selection
      setShowModeSelection(true)
    } else {
      // Mode already selected, proceed to copilot prep
      handleStart()
    }
  }, [selectedMode, handleStart])

  // ========================================
  // EFFECTS
  // ========================================
  // Fetch demo route
  useEffect(() => {
    if (routeMode === 'demo' && !routeData?.coordinates && !fetchedRef.current) {
      fetchedRef.current = true
      setIsLoadingRoute(true)

      getRoute(DEMO_START, DEMO_END)
        .then(route => {
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
        })
        .catch(() => setLoadError('Failed to fetch route'))
        .finally(() => setIsLoadingRoute(false))
    }
  }, [routeMode, routeData, setRouteData])

  // Detect curves if needed
  useEffect(() => {
    if (routeData?.coordinates?.length > 0 && (!routeData.curves || routeData.curves.length === 0)) {
      const curves = detectCurves(routeData.coordinates)
      useStore.getState().setRouteData({ ...routeData, curves })
    }
  }, [routeData?.coordinates, routeData?.curves])

  // Sync highway bends to store
  useEffect(() => {
    if (highwayBends?.length > 0 && setStoreHighwayBends) {
      setStoreHighwayBends(highwayBends)
    }
  }, [highwayBends, setStoreHighwayBends])

  // Sync route zones to store
  useEffect(() => {
    if (routeCharacter?.segments?.length > 0) {
      setRouteZones(routeCharacter.segments)
    }
  }, [routeCharacter?.segments, setRouteZones])

  // ========================================
  // RENDER STATES
  // ========================================
  // 1. Loading route data
  if (isLoadingRoute) {
    return (
      <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // 2. Error
  if (loadError) {
    return (
      <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center flex-col gap-4">
        <p className="text-red-400">{loadError}</p>
        <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded">Back</button>
      </div>
    )
  }

  // 3. Analysis loading (shows progress: analyzing curves, zones, etc.)
  if (isAnalysisLoading) {
    return (
      <LoadingScreen
        stages={loadingStages}
        mode={selectedMode}
        routeData={routeData}
        onCancel={() => {
          setShowModeSelection(true)
          setSelectedMode(null)
        }}
      />
    )
  }

  // 4. Voice selection — ONLY after user clicks Start Navigation
  if (showModeSelection && routeData?.coordinates) {
    return (
      <ModeSelection
        routeData={routeData}
        onSelect={handleModeSelect}
        onBack={onBack}
      />
    )
  }

  // 5. Copilot preparation
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

  // 6. DEFAULT: Show the map preview with route, zones, stats, START NAVIGATION button

  // ========================================
  // MAIN RENDER
  // ========================================
  return (
    <div className="absolute inset-0 bg-[#0a0a0f]">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#0a0a0f] via-[#0a0a0f]/90 to-transparent" style={{ paddingTop: 'env(safe-area-inset-top, 8px)' }}>
        {/* Row 1: Icon buttons */}
        <div className="flex items-center justify-between px-2 pt-2">
          {/* Left: Navigation + Map controls */}
          <div className="flex items-center gap-1">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            </button>
            <button onClick={toggleStyle} className="w-8 h-8 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                {mapStyle === 'dark' ? <><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></> : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
              </svg>
            </button>
            <button
              onClick={toggleSleeve}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: showSleeve ? colors.accentGlow : 'rgba(0,0,0,0.7)',
                border: `1px solid ${showSleeve ? colors.accent + '80' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showSleeve ? colors.accent : 'white'} strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
            </button>
            {hasHighwaySections && highwayBends?.length > 0 && (
              <button
                onClick={toggleHighwayBends}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showHighwayBends ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-black/70 border border-white/10'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showHighwayBends ? HIGHWAY_BEND_COLOR : 'white'} strokeWidth="2">
                  <path d="M4 19h16M4 15l4-8h8l4 8"/>
                </svg>
              </button>
            )}
          </div>

          {/* Right: Badges + favorite */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: selectedMode === HIGHWAY_MODE.COMPANION ? 'rgba(251,191,36,0.2)' : 'rgba(249,115,22,0.2)',
                color: selectedMode === HIGHWAY_MODE.COMPANION ? '#FBBF24' : '#F97316'
              }}>
              {selectedMode === HIGHWAY_MODE.COMPANION ? 'COMP' : 'BASIC'}
            </span>
            <div className="px-1.5 py-0.5 rounded-full bg-black/70 border border-white/10 flex items-center gap-0.5">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2"><path d="M2 22L12 2l10 20H2z"/></svg>
              <span className="text-[9px] text-white/80">{isLoadingElevation ? '...' : `${elevationGain}${settings.units === 'metric' ? 'm' : 'ft'}`}</span>
            </div>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${difficultyRating.color}30`, color: difficultyRating.color }}>
              {difficultyRating.label}
            </span>
            {routeData?.name && (
              <button onClick={handleToggleFavorite} className={`w-8 h-8 rounded-full flex items-center justify-center border ${isRouteFavorite ? 'bg-amber-500/20 border-amber-500/30' : 'bg-black/70 border-white/10'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isRouteFavorite ? '#f59e0b' : 'none'} stroke={isRouteFavorite ? '#f59e0b' : 'white'} strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Stats pill (full width) */}
        <div className="px-2 pt-1.5 pb-1">
          <button onClick={() => setShowCurveList(true)} className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-full bg-black/50 border border-white/10 hover:bg-white/5 transition-all">
            <span className="text-white font-bold text-[11px]">{routeStats.distance}</span>
            <span className="text-white/50 text-[10px]">{routeStats.distanceUnit}</span>
            <span className="text-white/30">·</span>
            <span className="text-white font-bold text-[11px]">{routeStats.curves}</span>
            <span className="text-white/50 text-[10px]">curves</span>
            <span className="text-white/30">·</span>
            <span className="text-red-400 font-bold text-[11px]">{routeStats.sharpCurves}</span>
            <span className="text-white/50 text-[10px]">sharp</span>
          </button>
        </div>
      </div>

      {/* Elevation mini widget */}
      {elevationData.length > 0 && (
        <div className="absolute right-2 z-20" style={{ top: '70px' }}>
          <div className="bg-black/80 rounded-lg p-1.5 border border-white/10 w-24">
            <div className="text-[8px] text-white/50 mb-0.5">ELEVATION</div>
            <MiniElevation data={elevationData} color={modeColor} />
          </div>
        </div>
      )}

      {/* Fly controls */}
      <FlyControls
        isFlying={isFlying}
        isPaused={isPaused}
        flySpeed={flySpeed}
        onTogglePause={toggleFlyPause}
        onStop={stopFlyThrough}
        onSetSpeed={setFlySpeed}
      />

      {/* BOTTOM BAR */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#0a0a0f] to-transparent pt-8 pb-4 px-3">
        {/* Zone pills + Action buttons - single row */}
        <div className="flex items-center justify-between mb-2">
          {/* Left: Zone segment pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 mr-2">
            {isLoadingCharacter ? (
              <span className="text-[10px] text-white/40">Analyzing...</span>
            ) : routeCharacter?.summary ? (
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
                {highwayBends?.length > 0 && (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                    style={{ background: `${HIGHWAY_BEND_COLOR}20`, color: HIGHWAY_BEND_COLOR, border: `1px solid ${HIGHWAY_BEND_COLOR}40` }}>
                    {highwayBends.length} hwy curves
                  </span>
                )}
              </>
            ) : null}
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Btn icon="recenter" onClick={handleRecenter} tip="Recenter" />
            <Btn icon="voice" onClick={handleSampleCallout} tip="Test" />
            <Btn icon="share" onClick={handleShare} tip="Share" />
          </div>
        </div>

        {/* Start button */}
        <button onClick={handleStartNavClick} className="w-full py-3 rounded-xl font-bold text-sm tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all" style={{ background: colors.accent }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg>
          START NAVIGATION
        </button>
      </div>

      {/* Modals */}
      {showCurveList && (
        <CurveListModal
          curves={routeData?.curves || []}
          highwayBends={highwayBends || []}
          mode={mode}
          settings={settings}
          onSelect={handleCurveClick}
          onSelectBend={handleHighwayBendClick}
          onClose={() => setShowCurveList(false)}
        />
      )}
      {selectedCurve && !showCurveList && (
        <CurvePopupModal
          curve={selectedCurve}
          mode={mode}
          settings={settings}
          onClose={() => setSelectedCurve(null)}
        />
      )}
      {showShareModal && <ShareModal name={routeData?.name} onClose={() => setShowShareModal(false)} />}
      {!mapLoaded && !showModeSelection && <LoadingOverlay isVisible={true} />}
    </div>
  )
}

// ========================================
// HELPER COMPONENTS
// ========================================

function MiniElevation({ data, color }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(d => d.elevation))
  const min = Math.min(...data.map(d => d.elevation))
  const range = max - min || 1
  return (
    <svg viewBox="0 0 80 20" className="w-full h-6">
      <defs>
        <linearGradient id="meg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`M 0 20 ${data.map((d, i) => `L ${(i / (data.length - 1)) * 80} ${20 - ((d.elevation - min) / range) * 16}`).join(' ')} L 80 20 Z`} fill="url(#meg)" />
      <path d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${(i / (data.length - 1)) * 80} ${20 - ((d.elevation - min) / range) * 16}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function Btn({ icon, onClick, disabled, success, loading, tip, highlight }) {
  const icons = {
    edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    reverse: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
    recenter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>,
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
