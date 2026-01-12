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
// Rally Co-Pilot App - v18
// SIMPLIFIED: Reliable callouts with native speech
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
    updateTripStats,
    showRouteEditor,
    goToEditor,
  } = useStore()

  // Simple tracking
  const announcedRef = useRef(new Set())  // Curves that got main callout
  const earlyRef = useRef(new Set())      // Curves that got early warning
  const finalRef = useRef(new Set())      // Curves that got final warning
  const lastCalloutRef = useRef(0)
  const lastLogRef = useRef(0)
  
  const [currentMode, setCurrentMode] = useState(DRIVING_MODE.SPIRITED)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()
  const speedUnit = settings.units === 'metric' ? 'kmh' : 'mph'

  // Reset on route change
  useEffect(() => {
    announcedRef.current = new Set()
    earlyRef.current = new Set()
    finalRef.current = new Set()
    lastCalloutRef.current = 0
  }, [routeMode, routeData])

  // Reset on navigation start
  useEffect(() => {
    if (isRunning) {
      console.log('🚀 Navigation started')
      announcedRef.current = new Set()
      earlyRef.current = new Set()
      finalRef.current = new Set()
      lastCalloutRef.current = Date.now() - 5000
    }
  }, [isRunning])

  // Detect mode from zones
  useEffect(() => {
    if (!isRunning || !routeZones?.length || !upcomingCurves?.[0]) return
    
    const curveDistance = upcomingCurves[0].distanceFromStart || 0
    const zone = routeZones.find(z => 
      curveDistance >= z.startDistance && curveDistance <= z.endDistance
    )
    
    if (zone) {
      const newMode = CHARACTER_TO_MODE[zone.character] || DRIVING_MODE.SPIRITED
      if (newMode !== currentMode) {
        console.log(`🎯 Mode: ${newMode}`)
        setCurrentMode(newMode)
      }
    }
  }, [isRunning, routeZones, upcomingCurves, currentMode])

  // ================================
  // MAIN CALLOUT LOGIC - SIMPLIFIED
  // ================================
  
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) {
      return
    }

    const now = Date.now()
    const curve = upcomingCurves[0]
    if (!curve) return
    
    const distance = curve.distance // meters
    const curveId = curve.id
    
    // Get speed-adjusted distances
    const thresholds = getWarningDistances(currentMode, currentSpeed)
    
    // Minimum pause between callouts
    const minPause = VOICE_CONFIG[currentMode]?.minPauseBetween || 1500
    if (now - lastCalloutRef.current < minPause) {
      return
    }
    
    // Log status every 3 seconds
    if (now - lastLogRef.current > 3000) {
      lastLogRef.current = now
      console.log(`📍 Curve ${curveId}: ${curve.direction} ${curve.severity} @ ${Math.round(distance)}m`)
      console.log(`   Speed: ${Math.round(currentSpeed)}mph | Mode: ${currentMode}`)
      console.log(`   Thresholds: early=${thresholds.early}m, main=${thresholds.main}m`)
      console.log(`   Announced: ${announcedRef.current.has(curveId)}`)
    }
    
    // Skip if curve shouldn't be announced
    if (!shouldAnnounceCurve(currentMode, curve)) {
      return
    }

    // ================================
    // EARLY WARNING (hard curves, severity 4+)
    // ================================
    if (curve.severity >= 4 &&
        distance <= thresholds.early && 
        distance > thresholds.main &&
        !earlyRef.current.has(curveId)) {
      
      const text = generateEarlyWarning(currentMode, curve)
      if (text) {
        console.log(`🔊 EARLY: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'high')
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
        !announcedRef.current.has(curveId)) {
      
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
    
    // ================================
    // CATCH-UP: If we somehow missed the main window
    // ================================
    if (distance <= thresholds.final && 
        distance > 10 &&
        !announcedRef.current.has(curveId)) {
      
      const text = generateCallout(currentMode, curve)
      if (text) {
        console.log(`🔊 CATCH-UP: "${text}" @ ${Math.round(distance)}m`)
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
        console.log(`🔊 FINAL: "${text}" @ ${Math.round(distance)}m`)
        speak(text, 'high')
        finalRef.current.add(curveId)
        lastCalloutRef.current = now
        
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate([150])
        }
      }
    }

  }, [isRunning, upcomingCurves, currentSpeed, settings, setLastAnnouncedCurveId, speak, currentMode])

  // Cleanup passed curves
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const currentIds = new Set(upcomingCurves.map(c => c.id))
    
    // Remove curves that are no longer upcoming
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
    lastCalloutRef.current = Date.now() - 5000
    console.log('🚀 Starting navigation')
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
    return (
      <RouteEditor
        onBack={goToPreview}
        onSave={goToPreview}
      />
    )
  }

  if (showTripSummary) {
    return <TripSummary onClose={() => { clearRouteData(); goToMenu() }} />
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <Map />
      <CalloutOverlay currentDrivingMode={currentMode} />
      <BottomBar />
      <SettingsPanel />
      <VoiceIndicator />
    </div>
  )
}
