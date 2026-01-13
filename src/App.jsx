import { useEffect, useRef, useState } from 'react'
import useStore from './store'
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

// ================================
// Rally Co-Pilot App - v21
// FIXED: Highway mode callouts during navigation
// ================================

const CHARACTER_TO_MODE = {
  [ROUTE_CHARACTER.TRANSIT]: DRIVING_MODE.HIGHWAY,
  [ROUTE_CHARACTER.TECHNICAL]: DRIVING_MODE.TECHNICAL,
  [ROUTE_CHARACTER.URBAN]: DRIVING_MODE.URBAN
}

export default function App() {
  const { speak } = useSpeech()
  
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
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    speed,
    showRouteEditor,
    goToEditor,
  } = useStore()

  // Highway mode hook
  const {
    isHighwayActive,
    inHighwayZone,
    highwayBends,
    highwayMode,
    getNextHighwayCallout,
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
  
  // Track announced highway bends separately
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
      lastCalloutRef.current = Date.now() - 5000
      lastZoneAnnouncedRef.current = null
    }
  }, [isRunning])

  // Calculate user's distance along route from position
  useEffect(() => {
    if (!isRunning || !position || !routeData?.coordinates) return
    
    // In demo mode, use simulationProgress
    if (isDemoMode) {
      const totalDist = routeData.distance || 15000
      setUserDistanceAlongRoute(useStore.getState().simulationProgress * totalDist)
      return
    }
    
    // In live GPS mode, calculate from position
    const coords = routeData.coordinates
    let minDist = Infinity
    let closestIdx = 0
    
    for (let i = 0; i < coords.length; i++) {
      const dx = coords[i][0] - position[0]
      const dy = coords[i][1] - position[1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        minDist = dist
        closestIdx = i
      }
    }
    
    // Calculate actual distance along route to closest point
    // by summing segment lengths instead of assuming uniform distribution
    let distanceAlong = 0
    for (let i = 0; i < closestIdx && i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0]
      const dy = coords[i + 1][1] - coords[i][1]
      // Convert degrees to meters (approximate at this latitude)
      const dxMeters = dx * 111320 * Math.cos(coords[i][1] * Math.PI / 180)
      const dyMeters = dy * 110540
      distanceAlong += Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters)
    }
    
    setUserDistanceAlongRoute(distanceAlong)
    
  }, [isRunning, position, routeData, isDemoMode])

  // Detect mode from zones using calculated distance
  useEffect(() => {
    if (!isRunning || !routeZones?.length) return
    
    const zone = routeZones.find(z => 
      userDistanceAlongRoute >= z.startDistance && userDistanceAlongRoute <= z.endDistance
    )
    
    if (zone) {
      const newMode = CHARACTER_TO_MODE[zone.character] || DRIVING_MODE.TECHNICAL
      
      if (newMode !== currentMode) {
        console.log(`🎯 Zone changed: ${currentMode} → ${newMode} @ ${Math.round(userDistanceAlongRoute)}m`)
        setCurrentMode(newMode)
        
        // Announce zone transition (only once per zone)
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
  // HIGHWAY BEND CALLOUTS
  // Separate effect for highway-specific bend announcements
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled) return
    if (!highwayBends?.length) {
      // Log occasionally for debugging
      if (Math.random() < 0.01) console.log('🛣️ No highway bends detected')
      return
    }
    
    const now = Date.now()
    const minPause = 1500 // Minimum pause between callouts
    
    if (now - lastCalloutRef.current < minPause) return
    
    // Find upcoming highway bends
    const upcomingBends = highwayBends.filter(bend => {
      const distanceToBend = bend.distanceFromStart - userDistanceAlongRoute
      return distanceToBend > 0 && distanceToBend < 500 // Look ahead 500m
    })
    
    if (upcomingBends.length === 0) return
    
    // Get closest bend
    const nextBend = upcomingBends[0]
    const distanceToBend = nextBend.distanceFromStart - userDistanceAlongRoute
    
    // Already announced?
    if (announcedHighwayBendsRef.current.has(nextBend.id)) return
    
    // Check announcement distance based on bend type
    const announceDistance = nextBend.isSection ? 450 :
                            nextBend.isSSweep ? 400 : 
                            nextBend.angle > 20 ? 350 : 
                            nextBend.angle > 10 ? 300 : 250
    
    // Log when we're approaching
    if (distanceToBend <= announceDistance + 50 && distanceToBend > announceDistance) {
      console.log(`🛣️ Approaching bend: ${nextBend.direction} ${nextBend.angle}° @ ${Math.round(distanceToBend)}m (announce at ${announceDistance}m)`)
    }
    
    if (distanceToBend <= announceDistance) {
      // Get callout from hook
      console.log(`🛣️ Getting callout for bend at ${Math.round(distanceToBend)}m`)
      const callout = getNextHighwayCallout(userDistanceAlongRoute)
      
      if (callout) {
        console.log(`🛣️ HIGHWAY SPEAKING: "${callout.text}" @ ${Math.round(distanceToBend)}m`)
        speak(callout.text, 'high')  // Use high priority like regular curves
        announcedHighwayBendsRef.current.add(nextBend.id)
        lastCalloutRef.current = now
        recordCalloutTime()
      } else {
        console.log(`🛣️ WARNING: getNextHighwayCallout returned null!`)
      }
    }
  }, [isRunning, settings.voiceEnabled, highwayBends, userDistanceAlongRoute, getNextHighwayCallout, speak, recordCalloutTime])

  // ================================
  // HIGHWAY COMPANION CHATTER
  // Periodic fun callouts during quiet stretches
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || !inHighwayZone) return
    
    // Check for chatter every 10 seconds
    const interval = setInterval(() => {
      const chatter = getChatter()
      if (chatter) {
        console.log(`🎤 CHATTER: "${chatter}"`)
        speak(chatter, 'low')
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [isRunning, settings.voiceEnabled, inHighwayZone, getChatter, speak])

  // ================================
  // REGULAR CURVE CALLOUTS
  // ================================
  useEffect(() => {
    const now = Date.now()
    
    // Log state every 2 seconds
    if (now - lastLogRef.current > 2000) {
      lastLogRef.current = now
      console.log(`🔍 CALLOUT DEBUG:
        - isRunning: ${isRunning}
        - voiceEnabled: ${settings.voiceEnabled}
        - upcomingCurves.length: ${upcomingCurves.length}
        - currentSpeed: ${currentSpeed}
        - currentMode: ${currentMode}
        - routeMode: ${routeMode}
        - isDemoMode: ${isDemoMode}
        - isHighwayActive: ${isHighwayActive}
        - highwayBends: ${highwayBends?.length || 0}
        - userDistance: ${Math.round(userDistanceAlongRoute)}m`)
    }
    
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    // CRITICAL: If highway mode is active, skip regular curve callouts entirely
    // Highway bends are handled by the separate highway callout effect
    if (isHighwayActive) {
      return
    }

    const curve = upcomingCurves[0]
    if (!curve) return
    
    const distance = curve.distance
    const curveId = curve.id
    
    // Helper: Check if a curve is in a highway zone (transit)
    const isCurveInHighwayZone = (curveDistance) => {
      if (!routeZones?.length) return false
      return routeZones.some(zone => 
        zone.character === 'transit' &&
        curveDistance >= zone.startDistance && 
        curveDistance <= zone.endDistance
      )
    }
    
    // Skip if this curve is in a transit/highway zone - highway system handles those
    if (curve.distanceFromStart && isCurveInHighwayZone(curve.distanceFromStart)) {
      // Don't announce - highway mode handles these zones
      return
    }
    
    // Get thresholds
    const thresholds = getWarningDistances(currentMode, currentSpeed)
    
    // Minimum pause
    const minPause = VOICE_CONFIG[currentMode]?.minPauseBetween || 1200
    if (now - lastCalloutRef.current < minPause) {
      return
    }
    
    // Check if already announced
    const alreadyAnnounced = announcedRef.current.has(curveId)
    
    // ================================
    // EARLY WARNING (severity 4+ only)
    // ================================
    if (curve.severity >= 4 &&
        distance <= thresholds.early && 
        distance > thresholds.main &&
        !earlyRef.current.has(curveId)) {
      
      const text = generateEarlyWarning(currentMode, curve)
      if (text && shouldAnnounceCurve(currentMode, curve)) {
        console.log(`🔊 EARLY: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'normal')
        earlyRef.current.add(curveId)
        lastCalloutRef.current = now
        return
      }
    }

    // ================================
    // MAIN CALLOUT
    // ================================
    if (distance <= thresholds.main && 
        distance > thresholds.final &&
        !alreadyAnnounced) {
      
      if (shouldAnnounceCurve(currentMode, curve)) {
        const text = generateCallout(currentMode, curve)
        if (text) {
          console.log(`🔊 MAIN: "${text}" @ ${Math.round(distance)}m`)
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
    
    // ================================
    // CATCH-UP (if we missed main window)
    // ================================
    if (distance <= thresholds.final && 
        distance > 10 &&
        !alreadyAnnounced) {
      
      const text = generateCallout(currentMode, curve)
      if (text) {
        console.log(`🔊 CATCH-UP: "${text}" @ ${Math.round(distance)}m (missed main window)`)
        speak(text, 'high')
        announcedRef.current.add(curveId)
        setLastAnnouncedCurveId(curveId)
        lastCalloutRef.current = now
        return
      }
    }

    // ================================
    // FINAL WARNING (severity 5+ only)
    // ================================
    if (curve.severity >= 5 &&
        distance <= thresholds.final && 
        distance > 10 &&
        announcedRef.current.has(curveId) &&
        !finalRef.current.has(curveId)) {
      
      const text = generateFinalWarning(currentMode, curve)
      if (text) {
        console.log(`🔊 FINAL: "${text}"`)
        speak(text, 'high')
        finalRef.current.add(curveId)
        lastCalloutRef.current = now
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, settings, setLastAnnouncedCurveId, speak, currentMode, routeZones, userDistanceAlongRoute])

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
  const handleStartNavigation = () => {
    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    announcedHighwayBendsRef.current = new Set()
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
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <Map />
      <CalloutOverlay currentDrivingMode={currentMode} userDistance={userDistanceAlongRoute} />
      <BottomBar />
      <SettingsPanel />
      <VoiceIndicator />
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
