// ── TEST FLAG: Set to true to route simulator positions through the real GPS matcher ──
const TEST_REAL_MATCHING = false

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react'
import useStore from './store'
import { useAuth } from './hooks/useAuth'
import AuthScreen from './components/auth/AuthScreen'
import { DriveSimulator } from './services/driveSimulator'
import DriveSimulatorPanel from './components/DriveSimulatorPanel'

// Theme application hook - runs before render to prevent flash
function useThemeSync() {
  const theme = useStore((state) => state.theme)

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return theme
}
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech } from './hooks/useSpeech'
import { ROUTE_CHARACTER } from './services/zoneService'

import { 
  DRIVING_MODE,
  getWarningDistances, 
  shouldAnnounceCurve,
  generateCallout,
  generateEarlyWarning,
  generateFinalWarning,
  VOICE_CONFIG
} from './services/calloutEngine'

// Highway mode imports
import { useHighwayMode } from './hooks/useHighwayMode'
import useHighwayStore from './services/highwayStore'
import { useSpeechPlanner } from './hooks/useSpeechPlanner'
import { useDriveStats } from './hooks/useDriveStats'
import { useFreeDrive } from './hooks/useFreeDrive'
import { getDistanceAlongRoute, buildCumulativeDistances } from './services/routeMatcher'

import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'
import TripSummary from './components/TripSummary'
import RouteEditor from './components/RouteEditor'
import AmbientBackground from './components/ui/AmbientBackground'
import FreeDriveHUD from './components/FreeDriveHUD'

// ================================
// Tramo App - v23
// Round 8: Speech Planner replaces independent speech useEffects
// All speech decisions now flow through useSpeechPlanner
// ================================

const CHARACTER_TO_MODE = {
  [ROUTE_CHARACTER.TRANSIT]: DRIVING_MODE.HIGHWAY,
  [ROUTE_CHARACTER.TECHNICAL]: DRIVING_MODE.TECHNICAL,
  [ROUTE_CHARACTER.URBAN]: DRIVING_MODE.URBAN
}

export default function App() {
  // Apply theme to document root
  useThemeSync()

  // Auth state
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()

  const { speak, initAudio } = useSpeech()

  const {
    isRunning,
    isSimulating,
    setIsSimulating,
    mode,
    settings,
    upcomingCurves,
    setLastAnnouncedCurveId,
    getDisplaySpeed,
    showRouteSelector,
    showRoutePreview,
    showTripSummary,
    routeMode,
    driveMode,
    routeData,
    routeZones,
    curatedHighwayCallouts,
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    heading: storeHeading,
    speed,
    showRouteEditor,
    goToEditor,
    setPosition,
    setHeading,
    setSpeed,
    endTrip,
    setFreeDriveTripStats,
  } = useStore()

  // Highway mode hook (still used for zone tracking, chatter, etc)
  const {
    isHighwayActive,
    inHighwayZone,
    highwayBends,
    highwayMode,
    getProgressCallout,
    getChatter,
    onBendCompleted,
    resetHighwayTrip,
    recordCalloutTime
  } = useHighwayMode()
  
  // Tracking refs
  const announcedRef = useRef(new Set())
  const earlyRef = useRef(new Set())
  const finalRef = useRef(new Set())
  const lastCalloutRef = useRef(0)
  const lastZoneAnnouncedRef = useRef(null)

  // NEW: Track announced curated callouts
  const announcedCuratedCalloutsRef = useRef(new Set())

  // LEGACY: Track announced highway bends (fallback only)
  const announcedHighwayBendsRef = useRef(new Set())

  // Distance tracking for seek suppression
  const prevDistanceRef = useRef(0)

  // Distance tracking ref that NEVER resets during navigation
  const distanceStateRef = useRef({
    prevDist: 0,
    initialized: false,
    navigationId: null,
    lastValidDist: 0,
  })

  // Track when we just finished seeking to suppress false seek detection
  const justSeekedRef = useRef(0)
  const wasSeekingRef = useRef(false)

  // Windowed route matching — pre-computed segment distances
  const cumulativeDistancesRef = useRef(null)
  const routeCoordsKeyRef = useRef(null) // track which route we computed for

  // Off-route detection
  const offRouteCountRef = useRef(0)
  const offRouteWarningFiredRef = useRef(false)

  // Route lock — grace period at navigation start for off-route starts (parking lots, etc.)
  const routeLockRef = useRef({
    locked: false,
    startTime: 0,
    consecutiveGoodUpdates: 0,
    lastMatchedDist: 0,
  })

  // Round 9B: Throttle distance calc to ~1Hz to ignore RAF interpolated positions
  const lastDistCalcTimeRef = useRef(0)

  // Round 9C: Speed-integration sanity check — compares matcher distance vs speed-estimated distance
  const speedIntegrationRef = useRef({ lastTime: 0, estimatedDist: 0 })
  const lastSanityLogRef = useRef(0)

  // Round 9C: Periodic real-driving status log
  const lastDriveLogRef = useRef(0)

  // Round 9C: Diagnostic log capture for real-world driving tests
  const diagnosticLogRef = useRef([])
  const diagnosticToastRef = useRef(false)

  const logDiagnostic = useCallback((category, message, data) => {
    console.log(`${category === 'warning' ? '⚠️' : category === 'sanity' ? '📐' : category === 'status' ? '🚗' : category === 'gps' ? '📡' : '📋'} ${message}`)
    if (isSimulating) return
    const log = diagnosticLogRef.current
    log.push({ timestamp: Date.now(), category, message, data })
    if (log.length > 500) log.shift()
  }, [isSimulating])

  // TEST_REAL_MATCHING: simulator's ground-truth distance + comparison log timer
  const simDistRef = useRef(0)
  const lastMatchTestLogRef = useRef(0)

  const [currentMode, setCurrentMode] = useState(DRIVING_MODE.HIGHWAY)
  const [userDistanceAlongRoute, setUserDistanceAlongRoute] = useState(0)

  // Drive simulator instance ref
  const simulatorRef = useRef(null)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning, logDiagnostic)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Round 10: Drive stats collection
  const { driveStatsRef, recordCurveCallout, recordCalloutSpoken, flushStats, wasMovingRecently } = useDriveStats({
    isRunning,
    currentSpeed,
    currentMode,
    userDistanceAlongRoute,
    routeZones,
  })

  // ── FREE DRIVE MODE ──
  const isFreeDrive = driveMode === 'free'
  const freeDrive = useFreeDrive({
    isActive: isRunning && isFreeDrive,
    position,
    heading: storeHeading,
    speed: currentSpeed,
    speak,
  })
  const freeDriveStateRef = useRef(null)

  // Free drive tick loop: run every 2 seconds, hook decides when to call API
  useEffect(() => {
    if (!isRunning || !isFreeDrive) return
    let mounted = true

    const interval = setInterval(async () => {
      if (!mounted) return
      const result = await freeDrive.tick()
      if (result) {
        freeDriveStateRef.current = result
      }
    }, 2000)

    // Opening line
    const openTimer = setTimeout(() => {
      if (mounted && currentSpeed > 5) {
        speak('Free drive. Calling curves as they come.', 'normal')
      }
    }, 4000)

    return () => {
      mounted = false
      clearInterval(interval)
      clearTimeout(openTimer)
    }
  }, [isRunning, isFreeDrive, freeDrive, speak, currentSpeed, userDistanceAlongRoute])

  // Free drive stop handler
  const handleStopFreeDrive = useCallback(() => {
    const stats = freeDrive.getTripStats()
    setFreeDriveTripStats(stats)

    // Closing line
    const curvesText = stats.totalCurvesCalled === 1 ? '1 curve' : `${stats.totalCurvesCalled} curves`
    const distText = `${stats.totalDistanceMiles.toFixed(1)} miles`
    speak(`Nice drive. ${curvesText} over ${distText}.`, 'normal')

    freeDrive.reset()
    endTrip()
  }, [freeDrive, setFreeDriveTripStats, speak, endTrip])

  // Auto-end navigation handler (called by finish sequence in speech planner)
  const handleAutoEnd = useCallback(() => {
    // Flush drive stats before ending (in case not already flushed)
    flushStats()
    if (simulatorRef.current) {
      simulatorRef.current.stop()
      simulatorRef.current = null
    }
    endTrip()
  }, [flushStats, endTrip])

  // Speech planner — the single brain that decides what the driver hears
  // Replaces: curated callout useEffect, chatter useEffect, zone announcement speech
  const { plannerStats } = useSpeechPlanner({
    isRunning,
    currentMode,
    currentSpeed,
    userDistanceAlongRoute,
    curatedHighwayCallouts,
    routeZones,
    announcedCalloutsRef: announcedCuratedCalloutsRef,
    speak,
    routeData,
    // Round 10: Drive stats integration
    onCurveCallout: recordCurveCallout,
    onCalloutSpoken: recordCalloutSpoken,
    driveStatsRef,
    wasMovingRecently,
    flushDriveStats: flushStats,
    onNavigationEnd: handleAutoEnd,
    routeLockedRef: routeLockRef,
  })

  // Reset on route/navigation change
  // FIX #2: Only reset distance if navigation is NOT active
  useEffect(() => {
    // If navigation is running, DON'T reset distance tracking
    // This prevents mid-drive resets when routeData reference changes
    if (isRunning && distanceStateRef.current.initialized) {
      console.log('⚠️ Route effect re-ran during navigation - skipping distance reset')
      return
    }

    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    announcedHighwayBendsRef.current = new Set()
    announcedCuratedCalloutsRef.current = new Set()
    lastCalloutRef.current = 0
    lastZoneAnnouncedRef.current = null
    setUserDistanceAlongRoute(0)
    distanceStateRef.current = {
      prevDist: 0,
      initialized: false,
      navigationId: null,
      lastValidDist: 0,
    }
    resetHighwayTrip()
  }, [routeMode, routeData, resetHighwayTrip, isRunning])

  useEffect(() => {
    if (isRunning) {
      console.log('🚀 Navigation started')
      announcedRef.current = new Set()
      earlyRef.current = new Set()
      finalRef.current = new Set()
      announcedHighwayBendsRef.current = new Set()
      announcedCuratedCalloutsRef.current = new Set()
      lastCalloutRef.current = Date.now() - 5000
      lastZoneAnnouncedRef.current = null

      // Navigation start log
      if (curatedHighwayCallouts?.length) {
        const zoneStr = (routeZones || []).map(z => {
          const s = z.startDistance != null ? (z.startDistance / 1609.34).toFixed(1) : '?'
          const e = z.endDistance != null ? (z.endDistance / 1609.34).toFixed(1) : '?'
          return `${z.character}(${s}-${e}mi)`
        }).join(' → ')

        const chatterCount = (useStore.getState().chatterTimeline || window.__chatterTimeline || []).length

        console.log(`\n${'═'.repeat(50)}`)
        console.log(`📋 ROUTE: ${(routeData?.distance / 1609.34).toFixed(1)}mi | ${curatedHighwayCallouts.length} callouts | ${chatterCount} chatter`)
        console.log(`📋 ZONES: ${zoneStr}`)
        console.log(`${'═'.repeat(50)}\n`)
      }

      // Initialize distance tracker for this navigation session
      if (!distanceStateRef.current.initialized) {
        // Re-snap: grab current GPS position and snap to nearest route point
        // Handles case where loading took 30-60s and driver moved
        let initialDist = 0
        const currentPos = useStore.getState().position
        const coords = routeData?.coordinates
        if (currentPos && coords?.length > 1 && !isSimulating) {
          const cumDist = cumulativeDistancesRef.current || buildCumulativeDistances(coords)
          if (!cumulativeDistancesRef.current) {
            cumulativeDistancesRef.current = cumDist
            const routeKey = `${coords.length}-${coords[0]?.[0]}-${coords[0]?.[1]}`
            routeCoordsKeyRef.current = routeKey
          }
          const { distance: snappedDist, distFromRoute } = getDistanceAlongRoute(
            coords, cumDist, currentPos[0], currentPos[1], 0, 0
          )
          initialDist = snappedDist
          console.log(`🔒 [startup] Re-snapped to mile ${(snappedDist / 1609.34).toFixed(2)} (${distFromRoute.toFixed(0)}m from route)`)
          if (distFromRoute > 200) {
            console.warn(`⚠️ [startup] Re-snap is ${distFromRoute.toFixed(0)}m from route — GPS may be inaccurate`)
          }

          // Mark callouts before snap point as already announced
          const callouts = useStore.getState().curatedHighwayCallouts || []
          let skipped = 0
          callouts.forEach(c => {
            const trigDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
            if (trigDist < initialDist) {
              announcedCuratedCalloutsRef.current.add(c.id || `${c.triggerMile}`)
              skipped++
            }
          })
          if (skipped > 0) {
            console.log(`🔒 [startup] Skipped ${skipped} callouts before re-snap point`)
          }
        }

        distanceStateRef.current = {
          prevDist: initialDist,
          initialized: true,
          navigationId: Date.now(),
          lastValidDist: initialDist,
        }
        if (initialDist > 0) {
          setUserDistanceAlongRoute(initialDist)
        }
        console.log('🚀 Navigation distance tracker initialized, sessionId:', distanceStateRef.current.navigationId)
      }
    } else {
      // Navigation ended - reset the initialized flag
      distanceStateRef.current.initialized = false

      // Show diagnostic data availability toast (real driving only)
      if (diagnosticLogRef.current.length > 0 && !diagnosticToastRef.current) {
        diagnosticToastRef.current = true
        console.log(`📋 Diagnostic log: ${diagnosticLogRef.current.length} entries captured. Triple-tap speed display to view.`)
        // Reset toast flag after 60s so it can fire again on next nav end
        setTimeout(() => { diagnosticToastRef.current = false }, 60000)
      }
    }
  }, [isRunning])

  // Calculate user's distance along route from position
  // Round 9: Windowed route matching — constrains GPS snap to nearby segments
  // Round 9B: Throttled to ~1Hz to prevent interpolation-induced drift on curves
  // Round 9C: Speed-integration sanity check + periodic drive status log
  useEffect(() => {
    if (!isRunning || !position || !routeData?.coordinates) {
      return
    }

    // ── ROUND 9B: THROTTLE TO ~1Hz (real GPS only) ──
    // GPS fires at ~1Hz but RAF interpolation fires at ~60fps.
    // Both write to the same Zustand `position`. Running distance matching
    // on interpolated positions causes cumulative forward drift on curves
    // (interpolation cuts corners → projection bias → 322% bug).
    // Only process distance at most once per 900ms to catch real GPS updates only.
    // Simulation bypasses this entirely (returns early below).
    if (!isSimulating) {
      const now = Date.now()
      if (now - lastDistCalcTimeRef.current < 900) return
      lastDistCalcTimeRef.current = now
    }

    // During simulation, distance is set by handleSimulatorPosition directly
    // (unless TEST_REAL_MATCHING is on — then we fall through to the matcher)
    if (isSimulating && !TEST_REAL_MATCHING) {
      return
    }

    // In demo mode (legacy), use simulationProgress
    if (isDemoMode) {
      const totalDist = routeData.distance || 15000
      setUserDistanceAlongRoute(useStore.getState().simulationProgress * totalDist)
      return
    }

    const now = Date.now()

    // ── PRE-COMPUTE CUMULATIVE DISTANCES (once per route) ──
    const coords = routeData.coordinates
    const routeKey = `${coords.length}-${coords[0]?.[0]}-${coords[0]?.[1]}`
    if (routeCoordsKeyRef.current !== routeKey) {
      cumulativeDistancesRef.current = buildCumulativeDistances(coords)
      routeCoordsKeyRef.current = routeKey
      console.log(`🗺️ Pre-computed ${coords.length} segment distances for route matching`)
    }

    const cumDist = cumulativeDistancesRef.current
    if (!cumDist) return

    // ── WINDOWED ROUTE MATCHING ──
    const lastDist = distanceStateRef.current.lastValidDist
    const { distance: distanceAlong, distFromRoute } = getDistanceAlongRoute(
      coords,
      cumDist,
      position[0], // lng
      position[1], // lat
      lastDist,
      currentSpeed
    )

    // ── SAFEGUARD: NEVER EXCEED ROUTE LENGTH ──
    const totalRouteDist = routeData?.distance || Infinity
    const clampedDistance = Math.min(distanceAlong, totalRouteDist)

    // ── ROUTE LOCK GRACE PERIOD ──
    // At navigation start, GPS may be off-route (parking lot). Give 60s or 0.5mi
    // for the matcher to lock on before firing warnings or sanity checks.
    const lock = routeLockRef.current
    const inGracePeriod = !lock.locked && (now - lock.startTime < 60000) && clampedDistance < 805

    if (!lock.locked) {
      const distAdvance = clampedDistance - lock.lastMatchedDist
      if (distAdvance > 5 && clampedDistance > 0) {
        lock.consecutiveGoodUpdates++
        lock.lastMatchedDist = clampedDistance
      } else if (distAdvance <= 0 && currentSpeed > 10) {
        lock.consecutiveGoodUpdates = 0
      }

      if (lock.consecutiveGoodUpdates >= 3) {
        lock.locked = true
        logDiagnostic('startup', 'Route locked')
        console.log('🔒 Route locked after', lock.consecutiveGoodUpdates, 'good updates')
      } else if (now - lock.startTime > 60000) {
        // Grace period expired — force lock
        lock.locked = true
        logDiagnostic('startup', 'Route lock forced (grace period expired)')
        console.log('🔒 Route lock forced after 60s grace period')
      } else if (currentSpeed > 10 && distAdvance <= 0) {
        logDiagnostic('startup', `Waiting for route lock... (dist=${Math.round(clampedDistance)}m, speed=${Math.round(currentSpeed)}mph)`)
      }
    }

    // ── OFF-ROUTE DETECTION (suppressed during grace period) ──
    if (distFromRoute > 50) {
      offRouteCountRef.current++
      if (offRouteCountRef.current >= 10 && !offRouteWarningFiredRef.current && !inGracePeriod) {
        speak("Looks like we're off route.", 'normal')
        offRouteWarningFiredRef.current = true
        logDiagnostic('warning', `OFF ROUTE: ${distFromRoute.toFixed(0)}m from route for ${offRouteCountRef.current} updates`)
      }
    } else {
      offRouteCountRef.current = 0
      offRouteWarningFiredRef.current = false
    }

    // Guard: if windowed matcher returned same distance (GPS too far), skip update
    if (distanceAlong === lastDist && lastDist > 0) {
      return
    }

    // ── ROUND 9C: SPEED-INTEGRATION SANITY CHECK (every 10s, suppressed during grace) ──
    const si = speedIntegrationRef.current
    const dt = (now - si.lastTime) / 1000

    if (dt > 0 && currentSpeed > 5) {
      const speedMps = currentSpeed * 0.44704
      si.estimatedDist += speedMps * dt
      si.lastTime = now

      if (!inGracePeriod && now - lastSanityLogRef.current > 10000 && si.estimatedDist > 100) {
        lastSanityLogRef.current = now
        const ratio = clampedDistance / Math.max(si.estimatedDist, 1)
        const status = (ratio > 1.3 || ratio < 0.7) ? 'warning' : 'sanity'
        logDiagnostic(status, `matcher: ${(clampedDistance / 1609.34).toFixed(2)}mi | speed-est: ${(si.estimatedDist / 1609.34).toFixed(2)}mi | ratio: ${ratio.toFixed(2)} | speed: ${currentSpeed.toFixed(0)}mph`)
      }
    } else {
      si.lastTime = now
    }

    // ── ROUND 9C: REAL-DRIVING STATUS LOG (every 30s, non-simulated only) ──
    if (!isSimulating && now - lastDriveLogRef.current > 30000) {
      lastDriveLogRef.current = now
      const progress = ((clampedDistance / (routeData?.distance || 1)) * 100).toFixed(1)
      logDiagnostic('status', `dist: ${(clampedDistance / 1609.34).toFixed(2)}mi | speed: ${currentSpeed.toFixed(0)}mph | zone: ${currentMode} | progress: ${progress}% | callouts: ${announcedCuratedCalloutsRef.current.size}`)
    }

    // ── TEST_REAL_MATCHING: Compare matcher vs simulator ground truth ──
    if (TEST_REAL_MATCHING && isSimulating) {
      const simDist = simDistRef.current
      if (now - lastMatchTestLogRef.current > 5000 && simDist > 0) {
        console.log(`📐 MATCH TEST | sim: ${(simDist / 1609.34).toFixed(2)}mi | matcher: ${(clampedDistance / 1609.34).toFixed(2)}mi | diff: ${(clampedDistance - simDist).toFixed(0)}m`)
        lastMatchTestLogRef.current = now
      }
      distanceStateRef.current.lastValidDist = clampedDistance
      distanceStateRef.current.prevDist = clampedDistance
      return
    }

    // Update distance state
    distanceStateRef.current.lastValidDist = clampedDistance
    distanceStateRef.current.prevDist = clampedDistance

    setUserDistanceAlongRoute(clampedDistance)

  }, [isRunning, position, routeData, isDemoMode, isSimulating, currentSpeed, currentMode, speak, logDiagnostic])

  // Detect mode from zones using calculated distance
  useEffect(() => {
    if (!isRunning || !routeZones?.length) return
    
    const sortedZones = [...routeZones].sort((a, b) => a.startDistance - b.startDistance)

    let zone = sortedZones.find(z => 
      userDistanceAlongRoute >= z.startDistance && userDistanceAlongRoute <= z.endDistance
    )
    
    if (!zone && userDistanceAlongRoute < 100) {
      zone = sortedZones.find(z => z.startDistance <= 100) || sortedZones[0]
    }
    
    if (zone) {
      const newMode = CHARACTER_TO_MODE[zone.character] || DRIVING_MODE.TECHNICAL

      if (newMode !== currentMode) {
        console.log(`🎯 Zone changed: ${currentMode} → ${newMode} @ ${Math.round(userDistanceAlongRoute)}m`)
        setCurrentMode(newMode)
        lastZoneAnnouncedRef.current = zone.id
        // Zone speech handled by useSpeechPlanner
      }
    }
  }, [isRunning, routeZones, userDistanceAlongRoute, currentMode])

  // ================================
  // SEEK SUPPRESSION
  // Marks callouts as played when user scrubs/seeks in simulation
  // The speech planner reads announcedCuratedCalloutsRef and skips these
  // ================================
  useEffect(() => {
    if (!isRunning || !curatedHighwayCallouts?.length) return

    const userDist = userDistanceAlongRoute
    const prevDist = prevDistanceRef.current

    // Detect when seeking ends (isSeeking transitions from true to false)
    const currentlySeeking = simulatorRef.current?.isSeeking || false
    if (wasSeekingRef.current && !currentlySeeking) {
      justSeekedRef.current = 5
      console.log('🔇 Seek ended - suppressing seek detection for 5 ticks')
    }
    wasSeekingRef.current = currentlySeeking

    // While seeking: mark passed callouts as played silently
    if (currentlySeeking) {
      const passedCallouts = curatedHighwayCallouts.filter(c => {
        if (announcedCuratedCalloutsRef.current.has(c.id)) return false
        const calloutDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        return calloutDist < userDist
      })

      if (passedCallouts.length > 0) {
        console.log(`🔇 SEEKING: marking ${passedCallouts.length} callouts as played (silent)`)
        passedCallouts.forEach(c => {
          announcedCuratedCalloutsRef.current.add(c.id)
        })
      }

      prevDistanceRef.current = userDist
      return
    }

    // Post-seek grace period
    if (justSeekedRef.current > 0) {
      justSeekedRef.current--
      prevDistanceRef.current = userDist
    }

    // Speed-aware seek detection
    const currentSpeedMps = (currentSpeed || 30) * 0.44704
    const seekThreshold = Math.max(800, currentSpeedMps * 15)
    const jumpDistance = userDist - prevDist
    const isSeekJump = jumpDistance > seekThreshold && justSeekedRef.current === 0

    if (isSeekJump) {
      console.log(`🚀 SEEK DETECTED: jumped ${Math.round(jumpDistance)}m (threshold=${Math.round(seekThreshold)}m at ${Math.round(currentSpeed || 0)}mph)`)

      const jumpedOverCallouts = curatedHighwayCallouts.filter(c => {
        if (announcedCuratedCalloutsRef.current.has(c.id)) return false
        const calloutDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        return calloutDist >= prevDist && calloutDist <= userDist
      })

      if (jumpedOverCallouts.length > 0) {
        jumpedOverCallouts.sort((a, b) => {
          const distA = a.triggerDistance > 0 ? a.triggerDistance : (a.triggerMile * 1609.34)
          const distB = b.triggerDistance > 0 ? b.triggerDistance : (b.triggerMile * 1609.34)
          return distA - distB
        })

        // Mark all but the last one as skipped
        jumpedOverCallouts.slice(0, -1).forEach(c => {
          announcedCuratedCalloutsRef.current.add(c.id)
          console.log(`⏭️ SEEK-SKIPPED: "${(c.text || '').substring(0, 30)}..."`)
        })

        // Fire the last one (closest to current position)
        const toFire = jumpedOverCallouts[jumpedOverCallouts.length - 1]
        const calloutText = toFire.text
        const isUrgent = ['danger', 'significant'].includes(toFire.type) ||
                         calloutText.toLowerCase().includes('caution') ||
                         calloutText.toLowerCase().includes('hard')
        const priority = isUrgent ? 'high' : 'normal'

        console.log(`✅ SEEK-FIRED: "${calloutText}" from jump`)
        speak(calloutText, priority)
        announcedCuratedCalloutsRef.current.add(toFire.id)

        if (toFire.type === 'danger' && settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

    // Mark expired callouts as played (prevents stuck queue)
    const MAX_OVERSHOOT_EXPIRED = 500
    const expiredCallouts = curatedHighwayCallouts.filter(c => {
      if (announcedCuratedCalloutsRef.current.has(c.id)) return false
      const calloutDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
      return calloutDist < userDist - MAX_OVERSHOOT_EXPIRED
    })
    expiredCallouts.forEach(c => {
      announcedCuratedCalloutsRef.current.add(c.id)
      if (window.__TRAMO_VERBOSE) {
        console.log(`⏭️ EXPIRED: "${(c.text || '').substring(0, 30)}..."`)
      }
    })

    prevDistanceRef.current = userDist

  }, [isRunning, curatedHighwayCallouts, userDistanceAlongRoute, currentSpeed, speak, settings.hapticFeedback])

  // Chatter is now handled by useSpeechPlanner — removed chatter useEffect

  // ================================
  // LEGACY CURVE CALLOUTS (fallback when no curated callouts)
  // ================================
  useEffect(() => {
    const now = Date.now()

    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    // Skip if curated callouts are handling everything
    if (curatedHighwayCallouts?.length > 0) {
      return
    }

    const curve = upcomingCurves[0]
    if (!curve) return
    
    const distance = curve.distance
    const curveId = curve.id
    
    // Skip curves in transit zones
    const isCurveInHighwayZone = (curveDistance) => {
      if (!routeZones?.length) return false
      return routeZones.some(zone => 
        zone.character === 'transit' &&
        curveDistance >= zone.startDistance && 
        curveDistance <= zone.endDistance
      )
    }
    
    if (curve.distanceFromStart && isCurveInHighwayZone(curve.distanceFromStart)) {
      return
    }
    
    const thresholds = getWarningDistances(currentMode, currentSpeed)
    const minPause = VOICE_CONFIG[currentMode]?.minPauseBetween || 1200
    
    if (now - lastCalloutRef.current < minPause) {
      return
    }
    
    const alreadyAnnounced = announcedRef.current.has(curveId)
    
    // Early warning (severity 4+)
    if (curve.severity >= 4 &&
        distance <= thresholds.early && 
        distance > thresholds.main &&
        !earlyRef.current.has(curveId)) {
      
      const text = generateEarlyWarning(currentMode, curve)
      if (text && shouldAnnounceCurve(currentMode, curve)) {
        console.log(`🔊 LEGACY EARLY: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'normal')
        earlyRef.current.add(curveId)
        lastCalloutRef.current = now
        return
      }
    }

    // Main callout
    if (distance <= thresholds.main && 
        distance > thresholds.final &&
        !alreadyAnnounced) {
      
      if (shouldAnnounceCurve(currentMode, curve)) {
        const text = generateCallout(currentMode, curve)
        if (text) {
          console.log(`🔊 LEGACY MAIN: "${text}" @ ${Math.round(distance)}m`)
          speak(text, 'high')
          announcedRef.current.add(curveId)
          setLastAnnouncedCurveId(curveId)
          lastCalloutRef.current = now
          
          if (settings.hapticFeedback && 'vibrate' in navigator) {
            navigator.vibrate(curve.severity >= 5 ? [100, 50, 100] : [50])
          }
          return
        }
      }
    }
    
    // Catch-up
    if (distance <= thresholds.final && 
        distance > 10 &&
        !alreadyAnnounced) {
      
      const text = generateCallout(currentMode, curve)
      if (text) {
        console.log(`🔊 LEGACY CATCH-UP: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'high')
        announcedRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutRef.current = now
        return
      }
    }

    // Final warning (severity 5+)
    if (curve.severity >= 5 &&
        distance <= thresholds.final && 
        distance > 10 &&
        announcedRef.current.has(curveId) &&
        !finalRef.current.has(curveId)) {
      
      const text = generateFinalWarning(currentMode, curve)
      if (text) {
        console.log(`🔊 LEGACY FINAL: "${text}"`)
        speak(text, 'high')
        finalRef.current.add(curveId)
        lastCalloutRef.current = now
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, settings, setLastAnnouncedCurveId, speak, currentMode, routeZones, userDistanceAlongRoute, curatedHighwayCallouts])

  // ================================
  // HIGHWAY PROGRESS CALLOUTS
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || !isHighwayActive) return
    
    const progressCallout = getProgressCallout()
    if (progressCallout) {
      console.log(`🛣️ PROGRESS: "${progressCallout.text}"`)
      speak(progressCallout.text, 'normal')
    }
  }, [isRunning, settings.voiceEnabled, isHighwayActive, getProgressCallout, speak, userDistanceAlongRoute])

  // Cleanup old announced refs
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const currentIds = new Set(upcomingCurves.map(c => c.id))
    ;[announcedRef, earlyRef, finalRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!currentIds.has(id)) ref.current.delete(id)
      })
    })
  }, [isRunning, upcomingCurves])

  // Runtime summary and nav end summary now handled by useSpeechPlanner

  // Navigation handlers
  const handleStartNavigation = async () => {
    // CRITICAL: Unlock audio on iOS before navigation starts
    await initAudio()

    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    announcedHighwayBendsRef.current = new Set()
    announcedCuratedCalloutsRef.current = new Set()
    prevDistanceRef.current = 0
    lastCalloutRef.current = Date.now() - 5000
    offRouteCountRef.current = 0
    offRouteWarningFiredRef.current = false
    lastDistCalcTimeRef.current = 0
    speedIntegrationRef.current = { lastTime: Date.now(), estimatedDist: 0 }
    lastSanityLogRef.current = 0
    lastDriveLogRef.current = 0
    diagnosticLogRef.current = []
    diagnosticToastRef.current = false
    routeLockRef.current = { locked: false, startTime: Date.now(), consecutiveGoodUpdates: 0, lastMatchedDist: 0 }
    resetHighwayTrip()

    goToDriving()
  }

  // Handle simulator position updates
  // FIX #3: Use distanceAlongRoute directly from simulator instead of recalculating
  const handleSimulatorPosition = useCallback((positionData) => {
    const { latitude, longitude, speed: speedMps, heading } = positionData.coords
    setPosition([longitude, latitude])
    setHeading(heading || 0)
    setSpeed(speedMps ? speedMps * 2.237 : 0) // Convert m/s to mph

    // FIX #3: Use distanceAlongRoute from simulator directly
    // This is more accurate than recalculating from lat/lng
    if (positionData.distanceAlongRoute !== undefined) {
      const currentDist = positionData.distanceAlongRoute
      // TEST_REAL_MATCHING: stash ground-truth for comparison logging
      if (TEST_REAL_MATCHING) simDistRef.current = currentDist
      const prevDist = distanceStateRef.current.lastValidDist

      // FIX #2: Guard against distance anomalies during seeking
      if (!positionData.isSeeking) {
        if (currentDist < prevDist - 50 || (currentDist === 0 && prevDist > 100)) {
          console.warn(`⚠️ DISTANCE ANOMALY: prev=${Math.round(prevDist)}m, current=${Math.round(currentDist)}m. Ignoring.`)
          return
        }
        distanceStateRef.current.lastValidDist = currentDist
        distanceStateRef.current.prevDist = currentDist
      }

      setUserDistanceAlongRoute(currentDist)
    }
  }, [setPosition, setHeading, setSpeed, setUserDistanceAlongRoute])

  // Handle simulation complete
  const handleSimulationComplete = useCallback(() => {
    console.log('Simulation complete - ending trip')
    flushStats() // Round 10: Flush drive stats before ending
    if (simulatorRef.current) {
      simulatorRef.current.stop()
      simulatorRef.current = null
    }
    endTrip()
  }, [endTrip, flushStats])

  // Start simulation
  const handleStartSimulation = useCallback(async ({ coordinates, zones, curves }) => {
    // CRITICAL: Unlock audio on iOS before navigation starts
    await initAudio()

    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    announcedHighwayBendsRef.current = new Set()
    announcedCuratedCalloutsRef.current = new Set()
    prevDistanceRef.current = 0
    lastCalloutRef.current = Date.now() - 5000
    offRouteCountRef.current = 0
    offRouteWarningFiredRef.current = false
    lastDistCalcTimeRef.current = 0
    speedIntegrationRef.current = { lastTime: Date.now(), estimatedDist: 0 }
    lastSanityLogRef.current = 0
    lastDriveLogRef.current = 0
    routeLockRef.current = { locked: true, startTime: Date.now(), consecutiveGoodUpdates: 3, lastMatchedDist: 0 } // Simulation: pre-locked
    resetHighwayTrip()

    // Set simulation flag BEFORE starting navigation
    setIsSimulating(true)

    // Create simulator
    simulatorRef.current = new DriveSimulator({
      coordinates,
      zones,
      curves,
      onPosition: handleSimulatorPosition,
      onComplete: handleSimulationComplete,
      onZoneChange: (zone) => {
        console.log(`Simulator zone change: ${zone.character}`)
      }
    })

    // Start navigation (this sets isRunning=true)
    goToDriving()

    // Start simulator after a brief delay
    setTimeout(() => {
      if (simulatorRef.current) {
        simulatorRef.current.start()
      }
    }, 500)
  }, [initAudio, resetHighwayTrip, setIsSimulating, goToDriving, handleSimulatorPosition, handleSimulationComplete])

  // Stop simulation
  const handleStopSimulation = useCallback(() => {
    if (simulatorRef.current) {
      simulatorRef.current.stop()
      simulatorRef.current = null
    }
    setIsSimulating(false)
    goToPreview()
  }, [setIsSimulating, goToPreview])

  // Cleanup simulator on unmount
  useEffect(() => {
    return () => {
      if (simulatorRef.current) {
        simulatorRef.current.stop()
        simulatorRef.current = null
      }
    }
  }, [])

  // iOS mobile container styles - consistent 420px width across all screens
  // Using position: fixed with top/bottom: 0 for reliable iOS Safari full-screen
  const mobileContainerStyle = {
    maxWidth: '420px',
    margin: '0 auto',
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    overflow: 'hidden',
    background: '#12121A',
  }

  // Render

  // Auth loading state
  if (isAuthLoading) {
    return (
      <div style={{
        ...mobileContainerStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '3px solid rgba(249,115,22,0.2)',
            borderTopColor: '#E8622C',
            animation: 'spin 1s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div style={mobileContainerStyle}>
        <AuthScreen />
      </div>
    )
  }

  if (showRouteSelector) {
    return (
      <div style={mobileContainerStyle}>
        <RouteSelector onRouteSelected={goToPreview} />
      </div>
    )
  }

  if (showRoutePreview) {
    return (
      <div style={mobileContainerStyle}>
        <RoutePreview
          onStartNavigation={handleStartNavigation}
          onStartSimulation={handleStartSimulation}
          onBack={() => { clearRouteData(); goToMenu() }}
          onEdit={goToEditor}
        />
      </div>
    )
  }

  if (showRouteEditor) {
    return (
      <div style={mobileContainerStyle}>
        <RouteEditor onBack={goToPreview} onSave={goToPreview} />
      </div>
    )
  }

  if (showTripSummary) {
    return (
      <div style={mobileContainerStyle}>
        <TripSummary onClose={() => { clearRouteData(); goToMenu() }} diagnosticLog={diagnosticLogRef} />
      </div>
    )
  }

  // Build free drive state for HUD
  const fdState = isFreeDrive ? freeDrive.getState() : null

  return (
    <div style={mobileContainerStyle}>
      <div className="absolute inset-0" style={{ background: 'var(--bg-deep)' }}>
        <AmbientBackground />
        <div className="relative z-[1] w-full h-full">
          <Map
            freeDriveGeometry={isFreeDrive ? fdState?.geometry : null}
          />
          {isFreeDrive ? (
            <FreeDriveHUD
              speed={currentSpeed}
              roadName={fdState?.roadName || ''}
              curves={fdState?.detectedCurves || []}
              junctionAhead={fdState?.junctionAhead}
              paused={fdState?.paused}
              onStop={handleStopFreeDrive}
            />
          ) : (
            <>
              <CalloutOverlay currentDrivingMode={currentMode} userDistance={userDistanceAlongRoute} diagnosticLog={diagnosticLogRef} isSimulating={isSimulating} />
              <BottomBar />
            </>
          )}
          <SettingsPanel />
          <VoiceIndicator />
          {/* Drive Simulator Panel - only when simulating */}
          {isSimulating && simulatorRef.current && (
            <DriveSimulatorPanel
              simulator={simulatorRef.current}
              onStop={handleStopSimulation}
            />
          )}
        </div>
      </div>
    </div>
  )
}

