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
      showTripSummary: false,
      
      routeData: null,
      routeMode: null,
      destination: null,
      
      // Multi-stop trip planning
      tripWaypoints: [], // Array of { id, name, coordinates, type: 'start'|'stop'|'end' }
      
      activeCurve: null,
      upcomingCurves: [],
      lastAnnouncedCurveId: null,
      
      simulationProgress: 0,
      simulationSpeed: 1,
      simulationPaused: false,
      
      // Trip tracking stats
      tripStats: {
        startTime: null,
        distance: 0,
        maxSpeed: 0,
        curvesCompleted: 0,
        sharpestCurve: null,
        speedSamples: [],
        positionHistory: [],
      },
      
      // Recent routes (persisted) - max 10
      recentRoutes: [],
      
      // Favorite routes (persisted)
      favoriteRoutes: [],
      
      mode: 'cruise',
      showSettings: false,
      isSpeaking: false,
      currentCallout: '',
      
      settings: {
        // Voice
        voiceEnabled: true,
        volume: 1.0,
        calloutTiming: 'normal',
        
        // Units
        units: 'imperial',
        
        // Display
        keepScreenOn: true,
        showSpeedometer: true,
        showElevation: true,
        hudStyle: 'full',
        
        // Curve detection
        curveSensitivity: 'normal', // 'relaxed', 'normal', 'sensitive'
        
        // Feedback
        hapticFeedback: false,
      },
      
      // ========== Recent Routes Actions ==========
      addRecentRoute: (route) => {
        const { recentRoutes } = get()
        // Don't add duplicates (check by destination name)
        const filtered = recentRoutes.filter(r => r.name !== route.name)
        const updated = [
          {
            id: Date.now(),
            name: route.name,
            destination: route.destination,
            origin: route.origin,
            coordinates: route.coordinates?.slice(0, 2), // Just start/end for storage
            distance: route.distance,
            duration: route.duration,
            curveCount: route.curves?.length || 0,
            timestamp: Date.now(),
          },
          ...filtered
        ].slice(0, 10) // Keep max 10
        set({ recentRoutes: updated })
      },
      
      clearRecentRoutes: () => set({ recentRoutes: [] }),
      
      removeRecentRoute: (id) => {
        const { recentRoutes } = get()
        set({ recentRoutes: recentRoutes.filter(r => r.id !== id) })
      },
      
      // ========== Favorite Routes Actions ==========
      addFavoriteRoute: (route) => {
        const { favoriteRoutes } = get()
        if (favoriteRoutes.some(r => r.name === route.name)) return // Already exists
        
        const favorite = {
          id: Date.now(),
          name: route.name || 'Unnamed Route',
          destination: route.destination,
          origin: route.origin,
          waypoints: route.waypoints || [],
          coordinates: route.coordinates?.slice(0, 2),
          distance: route.distance,
          duration: route.duration,
          curveCount: route.curves?.length || 0,
          createdAt: Date.now(),
        }
        set({ favoriteRoutes: [...favoriteRoutes, favorite] })
      },
      
      removeFavoriteRoute: (id) => {
        const { favoriteRoutes } = get()
        set({ favoriteRoutes: favoriteRoutes.filter(r => r.id !== id) })
      },
      
      isFavorite: (routeName) => {
        const { favoriteRoutes } = get()
        return favoriteRoutes.some(r => r.name === routeName)
      },
      
      toggleFavorite: (route) => {
        const { favoriteRoutes, addFavoriteRoute, removeFavoriteRoute } = get()
        const existing = favoriteRoutes.find(r => r.name === route.name)
        if (existing) {
          removeFavoriteRoute(existing.id)
        } else {
          addFavoriteRoute(route)
        }
      },
      
      // ========== Multi-stop Trip Actions ==========
      setTripWaypoints: (waypoints) => set({ tripWaypoints: waypoints }),
      
      addWaypoint: (waypoint) => {
        const { tripWaypoints } = get()
        set({ tripWaypoints: [...tripWaypoints, { ...waypoint, id: Date.now() }] })
      },
      
      removeWaypoint: (id) => {
        const { tripWaypoints } = get()
        set({ tripWaypoints: tripWaypoints.filter(w => w.id !== id) })
      },
      
      reorderWaypoints: (fromIndex, toIndex) => {
        const { tripWaypoints } = get()
        const updated = [...tripWaypoints]
        const [removed] = updated.splice(fromIndex, 1)
        updated.splice(toIndex, 0, removed)
        set({ tripWaypoints: updated })
      },
      
      clearTripWaypoints: () => set({ tripWaypoints: [] }),
      
      // ========== Navigation Actions ==========
      
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
        const isMetric = settings.units === 'metric'
        return isMetric ? Math.round(speed * 1.609) : Math.round(speed)
      },
      
      getSpeedUnit: () => {
        const { settings } = get()
        return settings.units === 'metric' ? 'KM/H' : 'MPH'
      },
      
      getDistanceUnit: () => {
        const { settings } = get()
        return settings.units === 'metric' ? 'm' : 'ft'
      },
      
      // Convert meters to display unit
      formatDistance: (meters) => {
        const { settings } = get()
        if (settings.units === 'metric') {
          if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
          return `${Math.round(meters)} m`
        } else {
          const feet = meters * 3.28084
          if (feet >= 5280) return `${(feet / 5280).toFixed(1)} mi`
          return `${Math.round(feet / 50) * 50} ft`
        }
      },
      
      getRecommendedSpeed: (curve) => {
        if (!curve) return 0
        const { mode, settings } = get()
        const speedKey = `speed${mode.charAt(0).toUpperCase() + mode.slice(1)}`
        let speed = curve[speedKey] || curve.speedCruise || 45
        if (settings.units === 'metric') speed = Math.round(speed * 1.609)
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
        const isMetric = settings.units === 'metric'
        
        return {
          duration,
          durationFormatted: formatDuration(duration),
          distance: isMetric ? distanceKm : distanceMiles,
          distanceUnit: isMetric ? 'km' : 'mi',
          avgSpeed: isMetric ? Math.round(avgSpeed * 1.609) : Math.round(avgSpeed),
          maxSpeed: isMetric ? Math.round(tripStats.maxSpeed * 1.609) : Math.round(tripStats.maxSpeed),
          speedUnit: isMetric ? 'km/h' : 'mph',
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
        recentRoutes: state.recentRoutes,
        favoriteRoutes: state.favoriteRoutes,
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
