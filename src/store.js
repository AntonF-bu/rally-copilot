import { create } from 'zustand'

// ================================
// Rally Co-Pilot Store
// ================================

const useStore = create((set, get) => ({
  // ================================
  // Route Selection State
  // ================================
  routeMode: null, // 'destination' | 'lookahead' | 'imported' | 'demo'
  showRouteSelector: true,
  showRoutePreview: false,
  routeData: null,
  
  setRouteMode: (mode) => set({ routeMode: mode }),
  setShowRouteSelector: (show) => set({ showRouteSelector: show }),
  setShowRoutePreview: (show) => set({ showRoutePreview: show }),
  setRouteData: (data) => set({ routeData: data }),

  // ================================
  // Driving State
  // ================================
  isRunning: false,
  mode: 'cruise', // 'cruise' | 'fast' | 'race'
  
  // Position & Movement
  position: null,
  heading: 0,
  speed: 0,
  
  // Simulation
  useSimulation: true,
  simulationProgress: 0,
  
  // Curves
  upcomingCurves: [],
  activeCurve: null,
  lastAnnouncedCurveId: null,
  
  // UI State
  showSettings: false,
  speaking: false,
  speakingText: '',

  // ================================
  // Settings
  // ================================
  settings: {
    voiceEnabled: true,
    hapticFeedback: true,
    speedUnit: 'mph', // 'mph' | 'kmh'
    calloutTiming: 5, // seconds before curve
    gpsLagOffset: 0.5, // seconds
    volume: 1.0,
  },

  // ================================
  // Actions - Driving
  // ================================
  startDrive: () => set({ 
    isRunning: true, 
    simulationProgress: 0,
    lastAnnouncedCurveId: null 
  }),
  
  stopDrive: () => set({ 
    isRunning: false,
    activeCurve: null,
    upcomingCurves: [],
    simulationProgress: 0
  }),
  
  setMode: (mode) => set({ mode }),
  
  setPosition: (position) => set({ position }),
  setHeading: (heading) => set({ heading }),
  setSpeed: (speed) => set({ speed }),
  
  setSimulationProgress: (progress) => set({ simulationProgress: progress }),
  
  setUpcomingCurves: (curves) => set({ upcomingCurves: curves }),
  setActiveCurve: (curve) => set({ activeCurve: curve }),
  setLastAnnouncedCurveId: (id) => set({ lastAnnouncedCurveId: id }),

  // ================================
  // Actions - UI
  // ================================
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
  closeSettings: () => set({ showSettings: false }),
  
  setSpeaking: (speaking, text = '') => set({ speaking, speakingText: text }),

  // ================================
  // Actions - Settings
  // ================================
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),

  // ================================
  // Computed Values
  // ================================
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
    const speed = curve[speedKey] || curve.speedCruise || 30
    
    if (settings.speedUnit === 'kmh') {
      return Math.round(speed * 1.609)
    }
    return Math.round(speed)
  },

  // ================================
  // Reset - Full reset to route selector
  // ================================
  resetToRouteSelector: () => set({
    showRouteSelector: true,
    showRoutePreview: false,
    isRunning: false,
    routeMode: null,
    routeData: null,
    simulationProgress: 0,
    upcomingCurves: [],
    activeCurve: null,
    lastAnnouncedCurveId: null,
    speed: 0,
    heading: 0
    // Note: we keep 'position' so GPS location persists
  }),

  // ================================
  // Clear route data only (for mode switching)
  // ================================
  clearRouteData: () => set({
    routeData: null,
    upcomingCurves: [],
    activeCurve: null,
    lastAnnouncedCurveId: null,
    simulationProgress: 0
  })
}))

export default useStore
