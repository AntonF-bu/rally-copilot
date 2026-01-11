import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ================================
// Rally Co-Pilot Store - v5
// Fixed navigation state management
// ================================

const useStore = create(
  persist(
    (set, get) => ({
      // ========== Navigation State ==========
      isRunning: false,
      position: null,
      heading: 0,
      speed: 0,
      altitude: null, // GPS altitude in meters
      gpsAccuracy: null,
      
      // ========== Screen State ==========
      // These control which screen is shown
      showRouteSelector: true,
      showRoutePreview: false,
      // Note: Main driving UI shows when both are false AND isRunning is true
      
      // ========== Route State ==========
      routeData: null,
      routeMode: null, // 'destination', 'lookahead', 'import', 'demo'
      destination: null, // { name, coordinates } for rerouting
      
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
        calloutTiming: 6,
        speedUnit: 'mph',
        mapStyle: 'dark',
        keepScreenOn: true,
        hapticFeedback: false,
      },
      
      // ========== Screen Navigation Actions ==========
      
      // Go to route selector (main menu)
      goToMenu: () => {
        console.log('goToMenu called')
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
      
      // Go to route preview
      goToPreview: () => {
        console.log('goToPreview called')
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
      
      // Start navigation (go to driving view)
      goToDriving: () => {
        console.log('goToDriving called')
        set({ 
          showRouteSelector: false, 
          showRoutePreview: false,
          isRunning: true,
          simulationProgress: 0,
          lastAnnouncedCurveId: null
        })
      },
      
      // Legacy setters (for compatibility)
      setShowRouteSelector: (show) => {
        console.log('setShowRouteSelector:', show)
        if (show) {
          get().goToMenu()
        } else {
          set({ showRouteSelector: false })
        }
      },
      
      setShowRoutePreview: (show) => {
        console.log('setShowRoutePreview:', show)
        if (show) {
          get().goToPreview()
        } else {
          set({ showRoutePreview: false })
        }
      },
      
      // ========== Drive Actions ==========
      
      startDrive: () => {
        console.log('startDrive called')
        get().goToDriving()
      },
      
      stopDrive: () => {
        console.log('stopDrive called')
        set({ 
          isRunning: false,
          simulationProgress: 0,
          activeCurve: null,
          upcomingCurves: [],
          lastAnnouncedCurveId: null
        })
      },
      
      // ========== Position Actions ==========
      setPosition: (position) => set({ position }),
      setHeading: (heading) => set({ heading }),
      setSpeed: (speed) => set({ speed }),
      setAltitude: (altitude) => set({ altitude }),
      setGpsAccuracy: (gpsAccuracy) => set({ gpsAccuracy }),
      
      // ========== Route Actions ==========
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
      
      // ========== Curve Actions ==========
      setActiveCurve: (curve) => set({ activeCurve: curve }),
      setUpcomingCurves: (curves) => set({ upcomingCurves: curves }),
      setLastAnnouncedCurveId: (id) => set({ lastAnnouncedCurveId: id }),
      
      // ========== Simulation Actions ==========
      setSimulationProgress: (progress) => set({ simulationProgress: progress }),
      
      // ========== UI Actions ==========
      setMode: (mode) => {
        console.log('setMode:', mode)
        set({ mode })
      },
      toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
      setSpeaking: (isSpeaking, text = '') => set({ isSpeaking, currentCallout: text }),
      
      // ========== Settings Actions ==========
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
