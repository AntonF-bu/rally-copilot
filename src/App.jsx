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

// NEW: Highway mode imports
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
// Rally Co-Pilot App - v20
// NEW: Highway mode with sweeper callouts
// ================================

const CHARACTER_TO_MODE = {
  [ROUTE_CHARACTER.TRANSIT]: DRIVING_MODE.HIGHWAY,
  [ROUTE_CHARACTER.SPIRITED]: DRIVING_MODE.SPIRITED,
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

  // NEW: Highway mode hook
  const {
    isHighwayActive,
    getNextHighwayCallout,
    getProgressCallout,
    onSweeperCompleted,
    resetHighwayTrip
  } = useHighwayMode()
  
  // NEW: Highway store for recording callout times
  const { recordCalloutTime } = useHighwayStore()

  // Tracking
  const announcedRef = useRef(new Set())
  const earlyRef = useRef(new Set())
  const finalRef = useRef(new Set())
  const lastCalloutRef = useRef(0)
  const lastLogRef = useRef(0)
  const lastZoneAnnouncedRef = useRef(null)
  
  // NEW: Track announced sweepers separately
  const announcedSweepersRef = useRef(new Set())
  
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
    announcedSweepersRef.current = new Set() // NEW
    lastCalloutRef.current = 0
    lastZoneAnnouncedRef.current = null
    setUserDistanceAlongRoute(0)
    resetHighwayTrip() // NEW: Reset highway stats
  }, [routeMode, routeData, resetHighwayTrip])

  useEffect(() => {
    if (isRunning) {
      console.log('🚀 Navigation started')
      announcedRef.current = new Set()
      earlyRef.current = new Set()
      finalRef.current = new Set()
      announcedSweepersRef.current = new Set() // NEW
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
    
    // Estimate distance along route
    const totalDist = routeData.distance || 15000
    const distanceAlong = (closestIdx / coords.length) * totalDist
    setUserDistanceAlongRoute(distanceAlong)
    
  }, [isRunning, position, routeData, isDemoMode])

  // Detect mode from zones using calculated distance
  useEffect(() => {
    if (!isRunning || !routeZones?.length) return
    
    const zone = routeZones.find(z => 
      userDistanceAlongRoute >= z.startDistance && userDistanceAlongRoute <= z.endDistance
    )
    
    if (zone) {
      const newMode = CHARACTER_TO_MODE[zone.character] || DRIVING_MODE.SPIRITED
      
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
  // MAIN CALLOUT LOGIC
  // ================================
  
  useEffect(() => {
    // Log state every 2 seconds regardless
    const now = Date.now()
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
        - isHighwayActive: ${isHighwayActive}`)
      
      if (upcomingCurves.length > 0) {
        console.log(`   First 3 curves:`, upcomingCurves.slice(0, 3).map(c => ({
          id: c.id,
          distance: Math.round(c.distance),
          severity: c.severity,
          direction: c.direction
        })))
      }
    }
    
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const curve = upcomingCurves[0]
    if (!curve) return
    
    const distance = curve.distance
    const curveId = curve.id
    
    // Get thresholds
    const thresholds = getWarningDistances(currentMode, currentSpeed)
    
    // Minimum pause
    const minPause = VOICE_CONFIG[currentMode]?.minPauseBetween || 1200
    if (now - lastCalloutRef.current < minPause) {
      return
    }

    // ================================
    // NEW: HIGHWAY MODE SWEEPER CALLOUTS
    // Check for sweeper callouts FIRST when in highway zone
    // ================================
    if (isHighwayActive && !announcedSweepersRef.current.has(curveId)) {
      const highwayCallout = getNextHighwayCallout(upcomingCurves, distance)
      
      if (highwayCallout) {
        console.log(`🛣️ HIGHWAY CALLOUT: "${highwayCallout.text}" @ ${Math.round(distance)}m`)
        speak(highwayCallout.text, 'normal')
        announcedSweepersRef.current.add(curveId)
        lastCalloutRef.current = now
        recordCalloutTime()
        
        // If it's a sweeper, also mark as announced in regular ref to avoid duplicate
        if (highwayCallout.type === 'sweeper') {
          announcedRef.current.add(curveId)
          setLastAnnouncedCurveId(curveId)
        }
        return
      }
    }
    
    // Log curve status
    const curveType = curve.isChicane ? `Chicane ${curve.startDirection}` : `${curve.direction} ${curve.severity}`
    console.log(`📍 CURVE: ${curveType} @ ${Math.round(distance)}m | Thresholds: early=${thresholds.early}, main=${thresholds.main} | Announced: ${announcedRef.current.has(curveId)}`)
    
    // Skip if shouldn't announce
    if (!shouldAnnounceCurve(currentMode, curve)) {
      console.log(`   ⏭️ Skipping - shouldAnnounceCurve returned false`)
      return
    }

    const isHardCurve = curve.severity >= 4 || curve.isChicane

    // ================================
    // EARLY WARNING (hard curves/chicanes only)
    // ================================
    if (isHardCurve && 
        distance <= thresholds.early && 
        distance > thresholds.main &&
        !earlyRef.current.has(curveId)) {
      
      const text = generateEarlyWarning(currentMode, curve)
      if (text) {
        console.log(`🔊 EARLY WARNING: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'high')
        earlyRef.current.add(curveId)
        lastCalloutRef.current = now
        return
      }
    }

    // ================================
    // MAIN CALLOUT
    // ================================
    const inMainWindow = distance <= thresholds.main && distance > thresholds.final
    const alreadyAnnounced = announcedRef.current.has(curveId)
    
    console.log(`   📊 Main window check: distance=${Math.round(distance)}, main=${thresholds.main}, final=${thresholds.final}, inWindow=${inMainWindow}, announced=${alreadyAnnounced}`)
    
    if (inMainWindow && !alreadyAnnounced) {
      const text = generateCallout(currentMode, curve)
      if (text) {
        console.log(`🔊 MAIN CALLOUT: "${text}" @ ${Math.round(distance)}m`)
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

  }, [isRunning, upcomingCurves, currentSpeed, settings, setLastAnnouncedCurveId, speak, currentMode, isHighwayActive, getNextHighwayCallout, recordCalloutTime])

  // ================================
  // NEW: HIGHWAY PROGRESS CALLOUTS
  // Separate effect for progress milestones
  // ================================
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || !isHighwayActive) return
    
    const progressCallout = getProgressCallout()
    if (progressCallout) {
      console.log(`🛣️ PROGRESS: "${progressCallout.text}"`)
      speak(progressCallout.text, 'normal')
    }
  }, [isRunning, settings.voiceEnabled, isHighwayActive, getProgressCallout, speak, userDistanceAlongRoute])

  // Cleanup
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const currentIds = new Set(upcomingCurves.map(c => c.id))
    ;[announcedRef, earlyRef, finalRef, announcedSweepersRef].forEach(ref => {
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
    announcedSweepersRef.current = new Set() // NEW
    lastCalloutRef.current = Date.now() - 5000
    resetHighwayTrip() // NEW
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
    [ROUTE_CHARACTER.SPIRITED]: 'Spirited section',
    [ROUTE_CHARACTER.URBAN]: 'Urban area'
  }
  return announcements[character] || null
}
