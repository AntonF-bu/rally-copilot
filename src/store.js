import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ================================
// Rally Co-Pilot Store - v4
// Complete state management
// ================================

const useStore = create(
  persist(
    (set, get) => ({
      // ========== Navigation State ==========
      isRunning: false,
      position: null,
      heading: 0,
      speed: 0,
      gpsAccuracy: null,
      
      // ========== Route State ==========
      routeData: null,
      routeMode: null, // 'destination', 'lookahead', 'import', 'demo'
      showRouteSelector: true,
      showRoutePreview: false,
      
      // ========== Curve State ==========
      activeCurve: null,
      upcomingCurves: [],
      lastAnnouncedCurveId: null,
      
      // ========== Simulation State ==========
      simulationProgress: 0,
      
      // ========== UI State ==========
      mode: 'cruise', // cruise, fast, race
      showSettings: false,
      isSpeaking: false,
      currentCallout: '',
      
      // ========== Settings (persisted) ==========
      settings: {
        voiceEnabled: true,
        volume: 1.0,
        calloutTiming: 6, // seconds ahead
        speedUnit: 'mph',
        mapStyle: 'dark',
        keepScreenOn: true,
        hapticFeedback: false,
      },
      
      // ========== Actions ==========
      
      // Navigation
      startDrive: () => set({ 
        isRunning: true,
        showRouteSelector: false,
        showRoutePreview: false,
        simulationProgress: 0,
        lastAnnouncedCurveId: null
      }),
      
      stopDrive: () => set({ 
        isRunning: false,
        activeCurve: null,
        upcomingCurves: [],
        simulationProgress: 0,
        lastAnnouncedCurveId: null
      }),
      
      // Position updates
      setPosition: (position) => set({ position }),
      setHeading: (heading) => set({ heading }),
      setSpeed: (speed) => set({ speed }),
      setGpsAccuracy: (gpsAccuracy) => set({ gpsAccuracy }),
      
      // Route management
      setRouteData: (routeData) => set({ routeData }),
      setRouteMode: (routeMode) => set({ routeMode }),
      clearRouteData: () => set({ 
        routeData: null, 
        routeMode: null,
        upcomingCurves: [],
        activeCurve: null
      }),
      
      // Screen navigation
      setShowRouteSelector: (show) => set({ showRouteSelector: show }),
      setShowRoutePreview: (show) => set({ showRoutePreview: show }),
      
      // Curve management
      setActiveCurve: (curve) => set({ activeCurve: curve }),
      setUpcomingCurves: (curves) => set({ upcomingCurves: curves }),
      setLastAnnouncedCurveId: (id) => set({ lastAnnouncedCurveId: id }),
      
      // Simulation
      setSimulationProgress: (progress) => set({ simulationProgress: progress }),
      
      // UI
      setMode: (mode) => set({ mode }),
      toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
      setSpeaking: (isSpeaking, text = '') => set({ 
        isSpeaking, 
        currentCallout: text 
      }),
      
      // Settings
      updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates }
      })),
      
      // ========== Computed Values ==========
      
      getDisplaySpeed: () => {
        const { speed, settings } = get()
        if (settings.speedUnit === 'kmh') {
          return Math.round(speed * 1.609)
        }
        return Math.round(speed)
      },
      
      getRecommendedSpeed: (curve) => {
        if (!curve) return 0
        const { mode, settings } = get()
        
        const speedKey = `speed${mode.charAt(0).toUpperCase() + mode.slice(1)}`
        let speed = curve[speedKey] || curve.speedCruise || 45
        
        // Convert to kmh if needed
        if (settings.speedUnit === 'kmh') {
          speed = Math.round(speed * 1.609)
        }
        
        return speed
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

export default useStore
