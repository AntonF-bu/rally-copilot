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
// Tramo App - v22
// NEW: Unified curated callout system - matches Preview exactly
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
  const lastLogRef = useRef(0)
  const lastZoneAnnouncedRef = useRef(null)

  // NEW: Track announced curated callouts
  const announcedCuratedCalloutsRef = useRef(new Set())

  // LEGACY: Track announced highway bends (fallback only)
  const announcedHighwayBendsRef = useRef(new Set())

  // Debug: track previous distance for threshold crossing detection
  const prevDistanceRef = useRef(0)
  const lastTickLogRef = useRef(0)

  // FIX #2: Distance tracking ref that NEVER resets during navigation
  // This survives React re-renders and effect re-runs
  const distanceStateRef = useRef({
    prevDist: 0,
    initialized: false,
    navigationId: null,  // unique per navigation session
    lastValidDist: 0,    // last known good distance
  })

  // FIX #4: Track when we just finished seeking to suppress false seek detection
  const justSeekedRef = useRef(0)
  const wasSeekingRef = useRef(false)

  // Debug flag for callout logging
  const DEBUG_CALLOUTS = true

  const [currentMode, setCurrentMode] = useState(DRIVING_MODE.HIGHWAY)
  const [userDistanceAlongRoute, setUserDistanceAlongRoute] = useState(0)

  // Drive simulator instance ref
  const simulatorRef = useRef(null)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

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
    announcedCuratedCalloutsRef.current = new Set() // NEW
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
      announcedCuratedCalloutsRef.current = new Set() // NEW
      lastCalloutRef.current = Date.now() - 5000
      lastZoneAnnouncedRef.current = null

      // FIX #2: Initialize distance tracker for this navigation session
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
  // OPTIMIZED: Use cached index and only search nearby points
  const lastClosestIdxRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning || !position || !routeData?.coordinates) {
      return
    }

    // FIX ROOT CAUSE: During simulation, distance is set by handleSimulatorPosition
    // directly from the simulator's distanceAlongRoute. Do NOT recalculate from lat/lng
    // as this creates the dual-system conflict (two different distance values fighting).
    if (isSimulating) {
      return
    }

    // In demo mode (legacy), use simulationProgress
    if (isDemoMode) {
      const totalDist = routeData.distance || 15000
      setUserDistanceAlongRoute(useStore.getState().simulationProgress * totalDist)
      return
    }
    
    // In live GPS mode, calculate from position
    // OPTIMIZATION: Only search near the last known position
    const coords = routeData.coordinates
    const searchRadius = 50 // Only check 50 points in each direction
    const startIdx = Math.max(0, lastClosestIdxRef.current - searchRadius)
    const endIdx = Math.min(coords.length - 1, lastClosestIdxRef.current + searchRadius)
    
    let minDist = Infinity
    let closestIdx = lastClosestIdxRef.current
    
    for (let i = startIdx; i <= endIdx; i++) {
      const dx = coords[i][0] - position[0]
      const dy = coords[i][1] - position[1]
      const dist = dx * dx + dy * dy // Skip sqrt for comparison
      if (dist < minDist) {
        minDist = dist
        closestIdx = i
      }
    }
    
    // Update cached index
    lastClosestIdxRef.current = closestIdx
    
    // Use pre-calculated distances if available, otherwise estimate
    let distanceAlong
    if (routeData.cumulativeDistances?.[closestIdx]) {
      distanceAlong = routeData.cumulativeDistances[closestIdx]
    } else {
      // Estimate based on index ratio
      distanceAlong = (closestIdx / coords.length) * (routeData.distance || 15000)
    }
    
    // Only log occasionally to reduce console spam
    if (Math.random() < 0.1) {
      console.log(`📍 Distance: idx=${closestIdx}, dist=${Math.round(distanceAlong)}m`)
    }

    // FIX #2: Guard against distance anomalies
    // If distance went to 0 or jumped backwards significantly, something re-initialized. Ignore it.
    const prevValid = distanceStateRef.current.lastValidDist
    if (distanceAlong < prevValid - 50 || (distanceAlong === 0 && prevValid > 100)) {
      console.warn(`⚠️ DISTANCE ANOMALY: prev=${Math.round(prevValid)}m, current=${Math.round(distanceAlong)}m. Ignoring.`)
      return // Don't update state with bad value
    }

    // Update last valid distance
    distanceStateRef.current.lastValidDist = distanceAlong
    distanceStateRef.current.prevDist = distanceAlong

    // Check for distance reset (debug)
    if (distanceAlong === 0 && prevValid > 100) {
      console.error('🚨 DISTANCE RESET DETECTED! prevDist was', prevValid)
    }

    setUserDistanceAlongRoute(distanceAlong)

  }, [isRunning, position, routeData, isDemoMode, isSimulating])

  // Detect mode from zones using calculated distance
  useEffect(() => {
    if (!isRunning || !routeZones?.length) return
    
    const sortedZones = [...routeZones].sort((a, b) => a.startDistance - b.startDistance)
    
    if (userDistanceAlongRoute < 10) {
      console.log('🎯 App.jsx sorted zones:', 
        sortedZones.map(z => `${z.character}(${Math.round(z.startDistance)}-${Math.round(z.endDistance)}m)`).join(' → ')
      )
    }
    
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
        
        if (lastZoneAnnouncedRef.current !== zone.id) {
          const announcement = getZoneAnnouncement(zone.character)
          if (announcement) {
            console.log(`📢 Zone: "${announcement}"`)
            speak(announcement, 'normal')
          }
          lastZoneAnnouncedRef.current = zone.id
        }
      }
    }
  }, [isRunning, routeZones, userDistanceAlongRoute, currentMode, speak])

  // ================================
  // UNIFIED CURATED CALLOUT SYSTEM
  // Uses callouts from Preview (hybrid system output)
  // This replaces the old highway bend + curve systems
  // FIXED: Now uses threshold crossing instead of proximity window
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled) return

    // Use curated callouts from store (set by RoutePreview)
    if (!curatedHighwayCallouts?.length) {
      return // Will fall back to legacy system below
    }

    const userDist = userDistanceAlongRoute
    const prevDist = prevDistanceRef.current
    const now = Date.now()

    // FIX #4: Detect when seeking ends (isSeeking transitions from true to false)
    const currentlySeeking = simulatorRef.current?.isSeeking || false
    if (wasSeekingRef.current && !currentlySeeking) {
      // Just finished seeking - suppress seek detection for next 5 ticks
      justSeekedRef.current = 5
      console.log('🔇 Seek ended - suppressing seek detection for 5 ticks')
    }
    wasSeekingRef.current = currentlySeeking

    // BUG FIX #2 (Option A): Skip callout processing while seeking/scrubbing
    // When user is dragging the progress bar, just mark passed callouts as played silently
    if (currentlySeeking) {
      // Find all unplayed callouts we've passed
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

      // Update previous distance and return early - no callout firing during seek
      prevDistanceRef.current = userDist
      return
    }

    // FIX #4: Decrement justSeekedRef counter and skip seek detection if still positive
    if (justSeekedRef.current > 0) {
      justSeekedRef.current--
      console.log(`🔇 Post-seek tick ${5 - justSeekedRef.current}/5 - skipping seek detection`)
      // Process normally but skip seek detection below
      prevDistanceRef.current = userDist
      // Fall through to normal callout processing, but skip the seek jump handling
    }

    // FIX #4: Speed-aware seek detection with HIGHER minimum threshold
    // Only check if we're not in the post-seek grace period
    const tickIntervalMs = 1000 // simulator tick interval
    const currentSpeedMps = (currentSpeed || 30) * 0.44704 // mph to m/s
    const expectedTickMovement = currentSpeedMps * (tickIntervalMs / 1000)
    // FIX ROUND 4: Raised minimum to 800m with 15x speed multiplier
    // At 60mph: max(800, 27*15=405) = 800m
    // At 120mph: max(800, 54*15=810) = 810m
    // At 180mph: max(800, 80*15=1200) = 1200m - only real scrubs will exceed this
    const seekThreshold = Math.max(800, currentSpeedMps * 15)

    const jumpDistance = userDist - prevDist
    const isSeekJump = jumpDistance > seekThreshold && justSeekedRef.current === 0

    if (isSeekJump) {
      console.log(`🚀 SEEK DETECTED: jumped ${Math.round(jumpDistance)}m (threshold=${Math.round(seekThreshold)}m at ${Math.round(currentSpeed || 0)}mph)`)

      // Find all unplayed callouts in the jumped range
      const jumpedOverCallouts = curatedHighwayCallouts.filter(c => {
        if (announcedCuratedCalloutsRef.current.has(c.id)) return false
        const calloutDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        return calloutDist >= prevDist && calloutDist <= userDist
      })

      if (jumpedOverCallouts.length > 0) {
        // Sort by trigger distance (ascending)
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
        lastCalloutRef.current = now

        if (toFire.type === 'danger' && settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

    // Throttled tick logging (1 per second max)
    if (DEBUG_CALLOUTS && now - lastTickLogRef.current > 1000) {
      lastTickLogRef.current = now
      const delta = userDist - prevDist
      console.log(`📍 TICK: dist=${Math.round(userDist)}m (${(userDist / 1609.34).toFixed(2)}mi), delta=${Math.round(delta)}m, speed=${Math.round(currentSpeed || 0)}mph`)

      // Find next unannounced callout ahead
      const nextUnannounced = curatedHighwayCallouts.find(c =>
        !announcedCuratedCalloutsRef.current.has(c.id) &&
        (c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)) > userDist
      )
      if (nextUnannounced) {
        const nextDist = nextUnannounced.triggerDistance > 0 ? nextUnannounced.triggerDistance : (nextUnannounced.triggerMile * 1609.34)
        console.log(`🎯 NEXT: "${(nextUnannounced.text || '').substring(0, 30)}..." trigger=${Math.round(nextDist)}m, distAway=${Math.round(nextDist - userDist)}m`)
      }

      // BUG FIX #3: Check for missed callouts AND mark them as played
      // This prevents expired callouts from blocking future checks
      const MAX_OVERSHOOT_EXPIRED = 500 // meters - beyond this, callout is expired
      const expiredCallouts = curatedHighwayCallouts.filter(c => {
        if (announcedCuratedCalloutsRef.current.has(c.id)) return false
        const calloutDist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        return calloutDist < userDist - MAX_OVERSHOOT_EXPIRED
      })

      // Mark ALL expired callouts as played so they don't block future checks
      expiredCallouts.forEach(c => {
        announcedCuratedCalloutsRef.current.add(c.id)
        console.log(`⏭️ EXPIRED: "${(c.text || '').substring(0, 30)}..." at ${Math.round(c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34))}m (car at ${Math.round(userDist)}m)`)
      })

      if (expiredCallouts.length > 0) {
        console.warn(`⚠️ Marked ${expiredCallouts.length} callouts as expired`)
      }
    }

    // Update previous distance ref
    prevDistanceRef.current = userDist

    // Adaptive throttle based on zone
    const currentZone = routeZones?.find(z =>
      userDist >= z.startDistance && userDist <= z.endDistance
    )
    const minInterval = currentZone?.character === 'technical' ? 2000
                      : currentZone?.character === 'urban' ? 3000
                      : 4000

    if (now - lastCalloutRef.current < minInterval) return

    // ========================================
    // FIXED TRIGGER MECHANISM: Threshold crossing
    // Fire callouts we've passed (within MAX_OVERSHOOT limit)
    // ========================================
    const MAX_OVERSHOOT = 500 // Don't fire if already 500m past

    // Find all unannounced callouts that we've crossed
    const crossedCallouts = curatedHighwayCallouts.filter(callout => {
      if (announcedCuratedCalloutsRef.current.has(callout.id)) return false

      const calloutDist = callout.triggerDistance > 0 ? callout.triggerDistance : (callout.triggerMile * 1609.34)
      const overshoot = userDist - calloutDist

      // Fire if: we've passed it (overshoot > 0) but not too far past
      return overshoot >= 0 && overshoot < MAX_OVERSHOOT
    })

    // Sort by trigger distance (earliest first)
    crossedCallouts.sort((a, b) => {
      const distA = a.triggerDistance > 0 ? a.triggerDistance : (a.triggerMile * 1609.34)
      const distB = b.triggerDistance > 0 ? b.triggerDistance : (b.triggerMile * 1609.34)
      return distA - distB
    })

    // If we jumped over multiple callouts, mark earlier ones as played silently
    // and only speak the most recent one
    if (crossedCallouts.length > 1) {
      // Mark all but the last as silently played
      crossedCallouts.slice(0, -1).forEach(c => {
        if (DEBUG_CALLOUTS) {
          console.log(`⏭️ SKIPPED (jumped over): "${(c.text || '').substring(0, 30)}..."`)
        }
        announcedCuratedCalloutsRef.current.add(c.id)
      })
    }

    // Get the callout to actually speak (the last/most recent one)
    const calloutToSpeak = crossedCallouts.length > 0 ? crossedCallouts[crossedCallouts.length - 1] : null

    if (!calloutToSpeak) {
      // Also check for upcoming callouts within lookahead
      // BUG FIX #1: Speed-based lookahead formula
      // At 60mph: ~120m (~400ft), at 90mph: ~180m (~600ft), at 180mph: ~360m (~1200ft)
      const currentSpeedMph = currentSpeed || 30
      const lookaheadMeters = Math.max(80, currentSpeedMph * 2) // ~2 meters per mph

      const upcomingCallout = curatedHighwayCallouts.find(callout => {
        if (announcedCuratedCalloutsRef.current.has(callout.id)) return false
        // BUG FIX #4: Use || instead of ?? to fall back when triggerDistance is 0
        const calloutDist = callout.triggerDistance > 0
          ? callout.triggerDistance
          : (callout.triggerMile * 1609.34)
        const distanceToCallout = calloutDist - userDist
        return distanceToCallout > 0 && distanceToCallout <= lookaheadMeters
      })

      if (!upcomingCallout) return

      // Fire the upcoming callout
      const calloutText = upcomingCallout.text
      const isUrgent = ['danger', 'significant'].includes(upcomingCallout.type) ||
                       calloutText.toLowerCase().includes('caution') ||
                       calloutText.toLowerCase().includes('hard')
      const priority = isUrgent ? 'high' : 'normal'

      const calloutDist = upcomingCallout.triggerDistance > 0 ? upcomingCallout.triggerDistance : (upcomingCallout.triggerMile * 1609.34)
      if (DEBUG_CALLOUTS) {
        console.log(`✅ FIRED (lookahead): "${calloutText}" | trigger=${Math.round(calloutDist)}m, carAt=${Math.round(userDist)}m, distAhead=${Math.round(calloutDist - userDist)}m`)
      }
      speak(calloutText, priority)

      announcedCuratedCalloutsRef.current.add(upcomingCallout.id)
      lastCalloutRef.current = now

      if (upcomingCallout.type === 'danger' && settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate([150])
      }
      return
    }

    // Speak the crossed callout
    const calloutText = calloutToSpeak.text
    const isUrgent = ['danger', 'significant'].includes(calloutToSpeak.type) ||
                     calloutText.toLowerCase().includes('caution') ||
                     calloutText.toLowerCase().includes('hard')
    const priority = isUrgent ? 'high' : 'normal'

    const calloutDist = calloutToSpeak.triggerDistance > 0 ? calloutToSpeak.triggerDistance : (calloutToSpeak.triggerMile * 1609.34)
    const overshoot = userDist - calloutDist
    if (DEBUG_CALLOUTS) {
      console.log(`✅ FIRED (crossed): "${calloutText}" | trigger=${Math.round(calloutDist)}m, carAt=${Math.round(userDist)}m, overshoot=${Math.round(overshoot)}m`)
    }
    speak(calloutText, priority)

    announcedCuratedCalloutsRef.current.add(calloutToSpeak.id)
    lastCalloutRef.current = now

    if (calloutToSpeak.type === 'danger' && settings.hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate([150])
    }

  }, [isRunning, settings.voiceEnabled, curatedHighwayCallouts, userDistanceAlongRoute, currentSpeed, routeZones, speak, settings.hapticFeedback])

  // ================================
  // HIGHWAY COMPANION CHATTER
  // FIXED: Distance-based triggers instead of setInterval
  // Uses pre-generated chatter timeline from RoutePreview
  // BUG FIX #4: Added debug logging and better integration
  // ================================
  const lastChatterCheckRef = useRef(0)
  const lastChatterLogRef = useRef(0)

  // Get chatter timeline from store
  const chatterTimeline = useStore(state => state.chatterTimeline)

  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled) return

    const currentDist = userDistanceAlongRoute
    const now = Date.now()

    // Debug log chatter status every 2 seconds (reduced frequency)
    // FIX #5: Use direct zone lookup for accurate inHighway detection
    if (DEBUG_CALLOUTS && now - lastChatterLogRef.current > 2000) {
      lastChatterLogRef.current = now

      // FIX #5: Direct zone lookup (same as getChatter uses) for accurate display
      const directZone = routeZones?.find(z =>
        currentDist >= z.startDistance && currentDist <= z.endDistance
      )
      // FIX #5: Check for 'transit' character (which maps to highway mode)
      const directInHighway = directZone?.character === 'transit'

      const timeline = chatterTimeline || window.__chatterTimeline
      if (timeline?.length > 0) {
        const nextChatter = timeline.find(c => {
          const triggerDist = (c.triggerMile || c.mile || 0) * 1609.34
          return triggerDist > currentDist
        })
        if (nextChatter) {
          const nextDist = (nextChatter.triggerMile || nextChatter.mile || 0) * 1609.34
          console.log(`💬 CHATTER: next at ${Math.round(nextDist)}m (${((nextChatter.triggerMile || nextChatter.mile || 0)).toFixed(1)}mi), car at ${Math.round(currentDist)}m, distAway=${Math.round(nextDist - currentDist)}m, inHighway=${directInHighway}, zone=${directZone?.character || 'none'}`)
        }
      } else {
        console.log(`💬 CHATTER: no timeline available, inHighway=${directInHighway}, zone=${directZone?.character || 'none'}`)
      }
    }

    // Check chatter every 50m for more responsive triggering
    const distSinceLastCheck = Math.abs(currentDist - lastChatterCheckRef.current)
    if (distSinceLastCheck < 50) return
    lastChatterCheckRef.current = currentDist

    // FIX ROUND 4: Respect minimum gap after last spoken callout (15 seconds)
    // Chatter should not interrupt curve callouts or fire too close after them
    if (now - lastCalloutRef.current < 15000) return

    // getChatter handles zone checking and threshold crossing internally
    const chatter = getChatter()
    if (chatter) {
      console.log(`🎤 CHATTER FIRED: "${chatter}"`)
      speak(chatter, 'low')
    }
  }, [isRunning, settings.voiceEnabled, inHighwayZone, userDistanceAlongRoute, getChatter, speak, chatterTimeline])

  // ================================
  // LEGACY CURVE CALLOUTS (fallback when no curated callouts)
  // ================================
  useEffect(() => {
    const now = Date.now()
    
    // Log state every 10 seconds instead of 2 (reduces iOS pressure)
    if (now - lastLogRef.current > 10000) {
      lastLogRef.current = now
      console.log(`🔍 DEBUG: running=${isRunning}, curated=${curatedHighwayCallouts?.length || 0}, speed=${currentSpeed}, mode=${currentMode}`)
    }
    
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
    resetHighwayTrip()

    // Log all callout trigger distances at nav start
    if (DEBUG_CALLOUTS && curatedHighwayCallouts?.length > 0) {
      console.log('\n📋 CALLOUT TRIGGER MAP:')
      curatedHighwayCallouts.forEach((c, i) => {
        const dist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        console.log(`  ${i + 1}. trigger=${Math.round(dist)}m (${(dist / 1609.34).toFixed(2)}mi) | "${(c.text || '').substring(0, 40)}"`)
      })
      console.log('')
    }

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
    resetHighwayTrip()

    // Log all callout trigger distances at simulation start
    if (DEBUG_CALLOUTS && curatedHighwayCallouts?.length > 0) {
      console.log('\n📋 CALLOUT TRIGGER MAP (Simulation):')
      curatedHighwayCallouts.forEach((c, i) => {
        const dist = c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)
        console.log(`  ${i + 1}. trigger=${Math.round(dist)}m (${(dist / 1609.34).toFixed(2)}mi) | "${(c.text || '').substring(0, 40)}"`)
      })
      console.log('')
    }

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

// Zone transition announcements
function getZoneAnnouncement(character) {
  const announcements = {
    [ROUTE_CHARACTER.TECHNICAL]: 'Technical section',
    [ROUTE_CHARACTER.TRANSIT]: 'Highway',
    [ROUTE_CHARACTER.URBAN]: 'Urban area'
  }
  return announcements[character] || null
}
