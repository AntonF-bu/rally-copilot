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
    routeData,
    routeZones,
    curatedHighwayCallouts, // NEW: Get curated callouts from store
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    speed,
    showRouteEditor,
    goToEditor,
    setPosition,
    setHeading,
    setSpeed,
    endTrip,
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

  // Round 9B: Throttle distance calc to ~1Hz to ignore RAF interpolated positions
  const lastDistCalcTimeRef = useRef(0)

  // Round 9B: Cumulative sanity check — speed-integrated distance vs route-matched distance
  const sanityCheckRef = useRef({ lastCheckTime: 0, speedSamples: [], lastCheckDist: 0 })

  const [currentMode, setCurrentMode] = useState(DRIVING_MODE.HIGHWAY)
  const [userDistanceAlongRoute, setUserDistanceAlongRoute] = useState(0)

  // Drive simulator instance ref
  const simulatorRef = useRef(null)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

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
        distanceStateRef.current = {
          prevDist: 0,
          initialized: true,
          navigationId: Date.now(),
          lastValidDist: 0,
        }
        console.log('🚀 Navigation distance tracker initialized, sessionId:', distanceStateRef.current.navigationId)
      }
    } else {
      // Navigation ended - reset the initialized flag
      distanceStateRef.current.initialized = false
    }
  }, [isRunning])

  // Calculate user's distance along route from position
  // Round 9: Windowed route matching — constrains GPS snap to nearby segments
  // Round 9B: Throttled to ~1Hz to prevent interpolation-induced drift on curves
  useEffect(() => {
    if (!isRunning || !position || !routeData?.coordinates) {
      return
    }

    // During simulation, distance is set by handleSimulatorPosition directly
    if (isSimulating) {
      return
    }

    // In demo mode (legacy), use simulationProgress
    if (isDemoMode) {
      const totalDist = routeData.distance || 15000
      setUserDistanceAlongRoute(useStore.getState().simulationProgress * totalDist)
      return
    }

    // ── ROUND 9B: THROTTLE TO ~1Hz ──
    // GPS fires at ~1Hz but RAF interpolation fires at ~60fps.
    // Both write to the same Zustand `position`. Running distance matching
    // on interpolated positions causes cumulative forward drift on curves
    // (interpolation cuts corners → projection bias → 322% bug).
    // Only process distance at most once per 900ms to catch real GPS updates only.
    const now = Date.now()
    const timeSinceLastCalc = now - lastDistCalcTimeRef.current
    if (timeSinceLastCalc < 900) return
    lastDistCalcTimeRef.current = now

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

    // ── OFF-ROUTE DETECTION ──
    if (distFromRoute > 50) {
      offRouteCountRef.current++
      if (offRouteCountRef.current >= 10 && !offRouteWarningFiredRef.current) {
        speak("Looks like we're off route.", 'normal')
        offRouteWarningFiredRef.current = true
        console.warn(`🚗 OFF ROUTE: ${distFromRoute.toFixed(0)}m from route for ${offRouteCountRef.current} updates`)
      }
    } else {
      offRouteCountRef.current = 0
      offRouteWarningFiredRef.current = false
    }

    // Guard: if windowed matcher returned same distance (GPS too far), skip update
    if (distanceAlong === lastDist && lastDist > 0) {
      return
    }

    // ── ROUND 9B SAFEGUARD: NEVER EXCEED ROUTE LENGTH ──
    const totalRouteDist = routeData?.distance || Infinity
    const clampedDistance = Math.min(distanceAlong, totalRouteDist)

    // ── ROUND 9B SAFEGUARD: CUMULATIVE SANITY CHECK (every 10s) ──
    const sc = sanityCheckRef.current
    sc.speedSamples.push(currentSpeed * 0.44704) // mph → m/s
    if (sc.speedSamples.length > 20) sc.speedSamples.shift()

    if (now - sc.lastCheckTime > 10000 && sc.lastCheckTime > 0) {
      const avgSpeedMps = sc.speedSamples.reduce((a, b) => a + b, 0) / sc.speedSamples.length
      const elapsedSec = (now - sc.lastCheckTime) / 1000
      const expectedDist = avgSpeedMps * elapsedSec
      const actualDist = clampedDistance - sc.lastCheckDist
      const ratio = actualDist / Math.max(expectedDist, 1)

      if (ratio > 1.5 || ratio < 0.5) {
        console.warn(`📐 Distance sanity FAILED: tracked ${actualDist.toFixed(0)}m but speed suggests ${expectedDist.toFixed(0)}m (ratio: ${ratio.toFixed(2)})`)
      } else if (window.__TRAMO_VERBOSE) {
        console.log(`📐 Distance sanity OK: tracked ${actualDist.toFixed(0)}m, speed suggests ${expectedDist.toFixed(0)}m (ratio: ${ratio.toFixed(2)})`)
      }

      sc.lastCheckTime = now
      sc.lastCheckDist = clampedDistance
      sc.speedSamples = []
    } else if (sc.lastCheckTime === 0) {
      sc.lastCheckTime = now
      sc.lastCheckDist = clampedDistance
    }

    // Update distance state
    distanceStateRef.current.lastValidDist = clampedDistance
    distanceStateRef.current.prevDist = clampedDistance

    setUserDistanceAlongRoute(clampedDistance)

  }, [isRunning, position, routeData, isDemoMode, isSimulating, currentSpeed, speak])

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
    sanityCheckRef.current = { lastCheckTime: 0, speedSamples: [], lastCheckDist: 0 }
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
    if (simulatorRef.current) {
      simulatorRef.current.stop()
      simulatorRef.current = null
    }
    endTrip()
  }, [endTrip])

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
    sanityCheckRef.current = { lastCheckTime: 0, speedSamples: [], lastCheckDist: 0 }
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
        <TripSummary onClose={() => { clearRouteData(); goToMenu() }} />
      </div>
    )
  }

  return (
    <div style={mobileContainerStyle}>
      <div className="absolute inset-0" style={{ background: 'var(--bg-deep)' }}>
        <AmbientBackground />
        <div className="relative z-[1] w-full h-full">
          <Map />
          <CalloutOverlay currentDrivingMode={currentMode} userDistance={userDistanceAlongRoute} />
          <BottomBar />
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

