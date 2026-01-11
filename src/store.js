import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set, get) => ({
      isRunning: false,
      position: null,
      heading: 0,
      speed: 0,
      altitude: null,
      gpsAccuracy: null,
      
      showRouteSelector: true,
      showRoutePreview: false,
      showTripSummary: false,  // NEW: Show trip summary screen
      
      routeData: null,
      routeMode: null,
      destination: null,
      
      activeCurve: null,
      upcomingCurves: [],
      lastAnnouncedCurveId: null,
      
      simulationProgress: 0,
      simulationSpeed: 1,
      simulationPaused: false,
      
      // Trip tracking stats
      tripStats: {
        startTime: null,
        distance: 0,           // meters
        maxSpeed: 0,           // mph
        curvesCompleted: 0,
        sharpestCurve: null,   // severity
        speedSamples: [],      // for average calculation
        positionHistory: [],   // for distance calculation
      },
      
      mode: 'cruise',
      showSettings: false,
      isSpeaking: false,
      currentCallout: '',
      
      settings: {
        voiceEnabled: true,
        volume: 1.0,
        calloutTiming: 6,
        speedUnit: 'mph',
        mapStyle: 'dark',
        keepScreenOn: true,
        hapticFeedback: false,
      },
      
      goToMenu: () => {
        set({ 
          showRouteSelector: true, 
          showRoutePreview: false,
          isRunning: false,
          simulationProgress: 0,
          activeCurve: null,
          upcomingCurves: [],
          lastAnnouncedCurveId: null
        })
      },
      
      goToPreview: () => {
        set({ 
          showRouteSelector: false, 
          showRoutePreview: true,
          isRunning: false,
          simulationProgress: 0,
          activeCurve: null,
          upcomingCurves: [],
          lastAnnouncedCurveId: null
        })
      },
      
      goToDriving: () => {
        set({ 
          showRouteSelector: false, 
          showRoutePreview: false,
          showTripSummary: false,
          isRunning: true,
          simulationProgress: 0,
          lastAnnouncedCurveId: null,
          tripStats: {
            startTime: Date.now(),
            distance: 0,
            maxSpeed: 0,
            curvesCompleted: 0,
            sharpestCurve: null,
            speedSamples: [],
            positionHistory: [],
          }
        })
      },
      
      setShowRouteSelector: (show) => {
        if (show) get().goToMenu()
        else set({ showRouteSelector: false })
      },
      
      setShowRoutePreview: (show) => {
        if (show) get().goToPreview()
        else set({ showRoutePreview: false })
      },
      
      startDrive: () => get().goToDriving(),
      
      stopDrive: () => {
        set({ 
          isRunning: false,
          simulationProgress: 0,
          activeCurve: null,
          upcomingCurves: [],
          lastAnnouncedCurveId: null
        })
      },
      
      // End trip and show summary
      endTrip: () => {
        set({
          isRunning: false,
          showTripSummary: true,
          simulationProgress: 0,
          simulationPaused: false,
        })
      },
      
      // Update trip stats (call periodically during drive)
      updateTripStats: (newPosition, currentSpeed, passedCurve = null) => {
        const { tripStats } = get()
        const updates = { ...tripStats }
        
        // Track max speed
        if (currentSpeed > updates.maxSpeed) {
          updates.maxSpeed = currentSpeed
        }
        
        // Sample speed for average (every call)
        if (currentSpeed > 0) {
          updates.speedSamples = [...updates.speedSamples.slice(-500), currentSpeed] // Keep last 500
        }
        
        // Calculate distance from position history
        if (newPosition && updates.positionHistory.length > 0) {
          const lastPos = updates.positionHistory[updates.positionHistory.length - 1]
          const dist = getDistanceBetween(lastPos, newPosition)
          if (dist > 2 && dist < 500) { // Filter out GPS jumps
            updates.distance += dist
          }
        }
        if (newPosition) {
          updates.positionHistory = [...updates.positionHistory.slice(-100), newPosition] // Keep last 100
        }
        
        // Track curves passed
        if (passedCurve) {
          updates.curvesCompleted += 1
          if (!updates.sharpestCurve || passedCurve.severity > updates.sharpestCurve) {
            updates.sharpestCurve = passedCurve.severity
          }
        }
        
        set({ tripStats: updates })
      },
      
      closeTripSummary: () => {
        set({ showTripSummary: false })
        get().goToPreview()
      },
      
      setPosition: (position) => set({ position }),
      setHeading: (heading) => set({ heading }),
      setSpeed: (speed) => set({ speed }),
      setAltitude: (altitude) => set({ altitude }),
      setGpsAccuracy: (gpsAccuracy) => set({ gpsAccuracy }),
      
      setRouteData: (routeData) => set({ routeData }),
      setRouteMode: (routeMode) => set({ routeMode }),
      setDestination: (destination) => set({ destination }),
      clearRouteData: () => set({ 
        routeData: null, 
        routeMode: null,
        destination: null,
        upcomingCurves: [],
        activeCurve: null
      }),
      
      setActiveCurve: (curve) => set({ activeCurve: curve }),
      setUpcomingCurves: (curves) => set({ upcomingCurves: curves }),
      setLastAnnouncedCurveId: (id) => set({ lastAnnouncedCurveId: id }),
      
      setSimulationProgress: (progress) => set({ simulationProgress: progress }),
      setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
      setSimulationPaused: (paused) => set({ simulationPaused: paused }),
      toggleSimulationPaused: () => set((state) => ({ simulationPaused: !state.simulationPaused })),
      
      setMode: (mode) => set({ mode }),
      toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
      setSpeaking: (isSpeaking, text = '') => set({ isSpeaking, currentCallout: text }),
      
      updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates }
      })),
      
      getDisplaySpeed: () => {
        const { speed, settings } = get()
        if (settings.speedUnit === 'kmh') return Math.round(speed * 1.609)
        return Math.round(speed)
      },
      
      getRecommendedSpeed: (curve) => {
        if (!curve) return 0
        const { mode, settings } = get()
        const speedKey = `speed${mode.charAt(0).toUpperCase() + mode.slice(1)}`
        let speed = curve[speedKey] || curve.speedCruise || 45
        if (settings.speedUnit === 'kmh') speed = Math.round(speed * 1.609)
        return speed
      },
      
      // Get computed trip statistics
      getTripSummary: () => {
        const { tripStats, settings, routeData } = get()
        if (!tripStats.startTime) return null
        
        const duration = Date.now() - tripStats.startTime
        const avgSpeed = tripStats.speedSamples.length > 0
          ? tripStats.speedSamples.reduce((a, b) => a + b, 0) / tripStats.speedSamples.length
          : 0
        
        // Convert units if needed
        const distanceMiles = tripStats.distance / 1609.34
        const distanceKm = tripStats.distance / 1000
        
        return {
          duration,
          durationFormatted: formatDuration(duration),
          distance: settings.speedUnit === 'kmh' ? distanceKm : distanceMiles,
          distanceUnit: settings.speedUnit === 'kmh' ? 'km' : 'mi',
          avgSpeed: settings.speedUnit === 'kmh' ? Math.round(avgSpeed * 1.609) : Math.round(avgSpeed),
          maxSpeed: settings.speedUnit === 'kmh' ? Math.round(tripStats.maxSpeed * 1.609) : Math.round(tripStats.maxSpeed),
          speedUnit: settings.speedUnit === 'kmh' ? 'km/h' : 'mph',
          curvesCompleted: tripStats.curvesCompleted,
          totalCurves: routeData?.curves?.length || 0,
          sharpestCurve: tripStats.sharpestCurve,
        }
      },
    }),
    {
      name: 'rally-copilot-storage',
      partialize: (state) => ({
        settings: state.settings,
        mode: state.mode,
      }),
    }
  )
)

// Helper: Distance between two coordinates in meters
function getDistanceBetween(pos1, pos2) {
  const R = 6371e3
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Helper: Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}m ${seconds % 60}s`
}

export default useStore
