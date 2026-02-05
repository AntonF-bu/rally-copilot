import { useEffect, useRef, useState, useLayoutEffect } from 'react'
import useStore from './store'

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
// Rally Co-Pilot App - v22
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

  const { speak, initAudio } = useSpeech()

  const {
    isRunning,
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
  
  const [currentMode, setCurrentMode] = useState(DRIVING_MODE.HIGHWAY)
  const [userDistanceAlongRoute, setUserDistanceAlongRoute] = useState(0)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Reset on route/navigation change
  useEffect(() => {
    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    announcedHighwayBendsRef.current = new Set()
    announcedCuratedCalloutsRef.current = new Set() // NEW
    lastCalloutRef.current = 0
    lastZoneAnnouncedRef.current = null
    setUserDistanceAlongRoute(0)
    resetHighwayTrip()
  }, [routeMode, routeData, resetHighwayTrip])

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
    }
  }, [isRunning])

  // Calculate user's distance along route from position
  // OPTIMIZED: Use cached index and only search nearby points
  const lastClosestIdxRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning || !position || !routeData?.coordinates) {
      return
    }
    
    // In demo mode, use simulationProgress
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
    
    setUserDistanceAlongRoute(distanceAlong)
    
  }, [isRunning, position, routeData, isDemoMode])

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
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled) return
    
    // Use curated callouts from store (set by RoutePreview)
    if (!curatedHighwayCallouts?.length) {
      return // Will fall back to legacy system below
    }
    
    const userDist = userDistanceAlongRoute
    const now = Date.now()
    
    // Adaptive throttle based on zone
    const currentZone = routeZones?.find(z => 
      userDist >= z.startDistance && userDist <= z.endDistance
    )
    const minInterval = currentZone?.character === 'technical' ? 2000 
                      : currentZone?.character === 'urban' ? 3000 
                      : 4000
    
    if (now - lastCalloutRef.current < minInterval) return
    
    // Adaptive lookahead based on speed
    const speedMps = (currentSpeed || 30) * 0.44704
    const lookaheadDistance = Math.max(150, Math.min(500, speedMps * 6))
    
    // Find next unannounced callout
    const nextCallout = curatedHighwayCallouts.find(callout => {
      if (announcedCuratedCalloutsRef.current.has(callout.id)) return false
      
      const calloutDist = callout.triggerDistance ?? (callout.triggerMile * 1609.34)
      const distanceToCallout = calloutDist - userDist
      
      return distanceToCallout > 0 && distanceToCallout < lookaheadDistance
    })
    
    if (!nextCallout) return
    
    // Speak it!
    const calloutText = nextCallout.text
    const isUrgent = ['danger', 'significant'].includes(nextCallout.type) ||
                     calloutText.toLowerCase().includes('caution') ||
                     calloutText.toLowerCase().includes('hard')
    const priority = isUrgent ? 'high' : 'normal'
    
    const calloutDist = nextCallout.triggerDistance ?? (nextCallout.triggerMile * 1609.34)
    console.log(`🎤 CURATED [${nextCallout.zone}/${nextCallout.type}]: "${calloutText}" @ ${Math.round(calloutDist)}m`)
    speak(calloutText, priority)
    
    announcedCuratedCalloutsRef.current.add(nextCallout.id)
    lastCalloutRef.current = now
    
    if (nextCallout.type === 'danger' && settings.hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate([150])
    }
    
  }, [isRunning, settings.voiceEnabled, curatedHighwayCallouts, userDistanceAlongRoute, currentSpeed, routeZones, speak, settings.hapticFeedback])

  // ================================
  // HIGHWAY COMPANION CHATTER
  // FIXED: Distance-based triggers instead of setInterval
  // Uses pre-generated chatter timeline from RoutePreview
  // ================================
  const lastChatterCheckRef = useRef(0)
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || !inHighwayZone) return
    
    // Only check every 500m of travel to reduce CPU
    const currentDist = userDistanceAlongRoute
    if (Math.abs(currentDist - lastChatterCheckRef.current) < 500) return
    lastChatterCheckRef.current = currentDist
    
    // getChatter now uses pre-generated timeline (no computation)
    const chatter = getChatter()
    if (chatter) {
      console.log(`🎤 CHATTER: "${chatter}"`)
      speak(chatter, 'low')
    }
  }, [isRunning, settings.voiceEnabled, inHighwayZone, userDistanceAlongRoute, getChatter, speak])

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
    lastCalloutRef.current = Date.now() - 5000
    resetHighwayTrip()
    goToDriving()
  }

  // Render
  if (showRouteSelector) {
    return <RouteSelector onRouteSelected={goToPreview} />
  }

  if (showRoutePreview) {
    return (
      <RoutePreview 
        onStartNavigation={handleStartNavigation} 
        onBack={() => { clearRouteData(); goToMenu() }}
        onEdit={goToEditor}
      />
    )
  }
  
  if (showRouteEditor) {
    return <RouteEditor onBack={goToPreview} onSave={goToPreview} />
  }

  if (showTripSummary) {
    return <TripSummary onClose={() => { clearRouteData(); goToMenu() }} />
  }

  return (
    <div className="fixed inset-0" style={{ background: 'var(--bg-deep)' }}>
      <AmbientBackground />
      <div className="relative z-[1] w-full h-full">
        <Map />
        <CalloutOverlay currentDrivingMode={currentMode} userDistance={userDistanceAlongRoute} />
        <BottomBar />
        <SettingsPanel />
        <VoiceIndicator />
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
