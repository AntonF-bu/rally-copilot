import { useEffect, useRef, useState } from 'react'
import useStore from './store'
import { useSimulation } from './hooks/useSimulation'
import { useGeolocation } from './hooks/useGeolocation'
import { useRouteAnalysis } from './hooks/useRouteAnalysis'
import { useSpeech, generateCallout, generateEarlyWarning, generateFinalWarning, generateStraightCallout, generateInSectionCallout } from './hooks/useSpeech'

import Map from './components/Map'
import CalloutOverlay from './components/CalloutOverlay'
import BottomBar from './components/BottomBar'
import SettingsPanel from './components/SettingsPanel'
import VoiceIndicator from './components/VoiceIndicator'
import RouteSelector from './components/RouteSelector'
import RoutePreview from './components/RoutePreview'
import TripSummary from './components/TripSummary'
import RouteEditor from './components/RouteEditor'

// Rally Co-Pilot App - v12
// With Route Editor + Zones

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
    goToMenu,
    goToPreview,
    goToDriving,
    clearRouteData,
    position,
    speed,
    updateTripStats,
  } = useStore()

  const earlyWarningsRef = useRef(new Set())
  const mainCalloutsRef = useRef(new Set())
  const finalWarningsRef = useRef(new Set())
  const straightCalledRef = useRef(new Set())
  const lastCalloutTimeRef = useRef(0)
  const inTechnicalSectionRef = useRef(null)
  const lastTripUpdateRef = useRef(0)
  const announcedCurvesRef = useRef(new Set())
  
  // Route Editor state (local to App since it's a temporary screen)
  const [showEditor, setShowEditor] = useState(false)
  
  const isDemoMode = routeMode === 'demo'
  useSimulation(isDemoMode && isRunning)
  useGeolocation(!isDemoMode && isRunning)
  useRouteAnalysis()

  const currentSpeed = getDisplaySpeed()

  // Update trip stats periodically
  useEffect(() => {
    if (!isRunning) return
    
    const now = Date.now()
    if (now - lastTripUpdateRef.current < 1000) return
    lastTripUpdateRef.current = now
    
    if (position && speed !== undefined) {
      updateTripStats(position, speed)
    }
  }, [isRunning, position, speed, updateTripStats])

  // Reset callout tracking when route changes
  useEffect(() => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    straightCalledRef.current = new Set()
    inTechnicalSectionRef.current = null
    announcedCurvesRef.current = new Set()
    lastCalloutTimeRef.current = Date.now()
  }, [routeMode, routeData])

  // Progressive Callout Logic
  useEffect(() => {
    if (!isRunning || !settings.voiceEnabled || upcomingCurves.length === 0) return

    const now = Date.now()
    const MIN_CALLOUT_INTERVAL = 1200
    
    if (now - lastCalloutTimeRef.current < MIN_CALLOUT_INTERVAL) return

    const nextCurve = upcomingCurves[0]
    if (!nextCurve) return

    const speedMps = Math.max((currentSpeed * 1609.34) / 3600, 8)
    const distance = nextCurve.distance
    
    const earlyDistance = Math.max(400, speedMps * 10)
    const mainDistance = Math.max(200, speedMps * 5)
    const finalDistance = Math.max(50, speedMps * 1.5)

    const isHardCurve = nextCurve.severity >= 4
    const curveId = nextCurve.id

    // EARLY WARNING
    if (isHardCurve && 
        distance <= earlyDistance && 
        distance > mainDistance &&
        !earlyWarningsRef.current.has(curveId)) {
      
      const callout = generateEarlyWarning(nextCurve, mode, settings.units === 'metric' ? 'kmh' : 'mph')
      speak(callout, 'normal')
      
      earlyWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now
      return
    }

    // MAIN CALLOUT
    if (distance <= mainDistance && 
        distance > finalDistance &&
        !mainCalloutsRef.current.has(curveId)) {
      
      const secondCurve = upcomingCurves[1]
      let includeSecond = null
      
      if (secondCurve && !secondCurve.isChicane) {
        const distanceToSecond = secondCurve.distanceFromStart - (nextCurve.distanceFromStart + nextCurve.length)
        if (distanceToSecond < 150 && distanceToSecond >= 0) {
          includeSecond = secondCurve
        }
      }
      
      const callout = generateCallout(nextCurve, mode, settings.units === 'metric' ? 'kmh' : 'mph', includeSecond, 'main')
      speak(callout, 'high')
      
      mainCalloutsRef.current.add(curveId)
      setLastAnnouncedCurveId(curveId)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        const pattern = nextCurve.severity >= 5 ? [100, 50, 100] : [50]
        navigator.vibrate(pattern)
      }
      return
    }

    // FINAL WARNING
    if (isHardCurve &&
        distance <= finalDistance && 
        distance > 15 &&
        mainCalloutsRef.current.has(curveId) &&
        !finalWarningsRef.current.has(curveId)) {
      
      const callout = generateFinalWarning(nextCurve, mode, settings.units === 'metric' ? 'kmh' : 'mph')
      speak(callout, 'high')
      
      finalWarningsRef.current.add(curveId)
      lastCalloutTimeRef.current = now

      if (settings.hapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate([150])
      }
      return
    }

    // SECOND CURVE
    const secondCurve = upcomingCurves[1]
    if (secondCurve && 
        mainCalloutsRef.current.has(curveId) &&
        !mainCalloutsRef.current.has(secondCurve.id)) {
      
      const secondDistance = secondCurve.distance
      const secondMainDistance = Math.max(200, speedMps * 5)
      
      if (secondDistance <= secondMainDistance && secondDistance > 50) {
        const callout = generateCallout(secondCurve, mode, settings.units === 'metric' ? 'kmh' : 'mph', upcomingCurves[2], 'main')
        speak(callout, 'high')
        
        mainCalloutsRef.current.add(secondCurve.id)
        setLastAnnouncedCurveId(secondCurve.id)
        lastCalloutTimeRef.current = now
        return
      }
    }

    // STRAIGHT SECTION
    if (distance > 600 && !straightCalledRef.current.has(`straight-${curveId}`)) {
      const nextCharacter = nextCurve ? getCurveCharacter(nextCurve) : ''
      const nextDir = nextCurve?.direction === 'LEFT' ? 'left' : 'right'
      const distText = getDistanceText(distance, settings.units === 'metric' ? 'kmh' : 'mph')
      
      const callout = nextCurve 
        ? `Clear ahead. ${nextCharacter} ${nextDir} in ${distText}.`
        : `Clear ahead for ${distText}.`
      
      speak(callout, 'normal')
      straightCalledRef.current.add(`straight-${curveId}`)
      lastCalloutTimeRef.current = now
    }

  }, [isRunning, upcomingCurves, currentSpeed, mode, settings, setLastAnnouncedCurveId, speak])

  // Cleanup passed curves
  useEffect(() => {
    if (!isRunning || upcomingCurves.length === 0) return
    
    const upcomingIds = new Set(upcomingCurves.map(c => c.id))
    
    ;[earlyWarningsRef, mainCalloutsRef, finalWarningsRef].forEach(ref => {
      ref.current.forEach(id => {
        if (!upcomingIds.has(id)) ref.current.delete(id)
      })
    })
    
    straightCalledRef.current.forEach(key => {
      const curveId = parseInt(key.split('-')[1])
      if (!upcomingIds.has(curveId)) straightCalledRef.current.delete(key)
    })
  }, [isRunning, upcomingCurves])

  const handleStartNavigation = () => {
    earlyWarningsRef.current = new Set()
    mainCalloutsRef.current = new Set()
    finalWarningsRef.current = new Set()
    straightCalledRef.current = new Set()
    inTechnicalSectionRef.current = null
    announcedCurvesRef.current = new Set()
    goToDriving()
  }

  const handleBackFromPreview = () => {
    clearRouteData()
    goToMenu()
  }

  const handleEditRoute = () => setShowEditor(true)
  
  const handleSaveEdits = (editedRoute) => {
    setShowEditor(false)
  }

  // SCREEN 1: Route Selector
  if (showRouteSelector) return <RouteSelector />

  // SCREEN 2: Trip Summary
  if (showTripSummary) return <TripSummary />

  // SCREEN 3: Route Editor
  if (showEditor) {
    return (
      <RouteEditor
        onBack={() => setShowEditor(false)}
        onSave={handleSaveEdits}
      />
    )
  }

  // SCREEN 4: Route Preview
  if (showRoutePreview) {
    return (
      <RoutePreview 
        onStartNavigation={handleStartNavigation}
        onBack={handleBackFromPreview}
        onEdit={handleEditRoute}
      />
    )
  }

  // SCREEN 5: Main Driving UI
  return (
    <div className="fixed inset-0 bg-[#0a0a0f] overflow-hidden">
      <Map />
      <CalloutOverlay />
      <VoiceIndicator />
      <BottomBar />
      <SettingsPanel />
    </div>
  )
}

// Helper functions
function getDistanceText(distanceMeters, speedUnit = 'mph') {
  if (!distanceMeters || distanceMeters < 0) return 'ahead'
  
  if (speedUnit === 'kmh') {
    if (distanceMeters >= 1000) {
      const km = Math.round(distanceMeters / 100) / 10
      return `${km} kilometers`
    } else if (distanceMeters >= 200) {
      return `${Math.round(distanceMeters / 50) * 50} meters`
    }
    return `${Math.round(distanceMeters)} meters`
  } else {
    const feet = distanceMeters * 3.28084
    if (feet >= 2640) {
      const miles = Math.round(feet / 528) / 10
      return `${miles} miles`
    } else if (feet >= 1000) {
      return `${Math.round(feet / 100) * 100} feet`
    }
    return `${Math.round(feet / 50) * 50} feet`
  }
}

function getCurveCharacter(curve) {
  if (!curve) return ''
  const severity = curve.severity
  const length = curve.length || 0
  
  if (severity <= 2 && length > 150) return 'sweeping'
  if (severity <= 1) return 'gentle'
  if (severity === 2) return 'easy'
  if (severity === 3) return 'moderate'
  if (severity === 4) return 'tight'
  if (severity === 5) return 'sharp'
  return 'very sharp'
}
