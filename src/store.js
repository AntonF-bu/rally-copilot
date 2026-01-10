import { create } from 'zustand'

// ================================
// Rally Co-Pilot Global Store
// ================================

export const useStore = create((set, get) => ({
  // ========== Driving State ==========
  isRunning: false,
  mode: 'cruise', // cruise | fast | race
  
  // ========== Position & Movement ==========
  position: null, // { lat, lng }
  heading: 0,
  speed: 0, // Current speed in mph
  accuracy: null, // GPS accuracy in meters
  
  // ========== Simulation ==========
  useSimulation: true,
  simulationProgress: 0, // 0-1 along route
  
  // ========== Curves ==========
  upcomingCurves: [],
  activeCurve: null,
  lastAnnouncedCurveId: null,
  
  // ========== Settings ==========
  settings: {
    calloutTiming: 5, // seconds before curve
    gpsLagOffset: 0, // manual GPS adjustment
    voiceEnabled: true,
    speedUnit: 'mph', // mph | kmh
    mapStyle: 'dark', // dark | satellite
    showSpeedLimit: true,
    hapticFeedback: true,
  },
  
  // ========== UI State ==========
  showSettings: false,
  bottomPanelMinimized: false,
  activeTab: 'drive', // drive | discover | social
  
  // ========== Voice State ==========
  isSpeaking: false,
  lastSpokenText: '',
  
  // ========== Actions ==========
  
  startDrive: () => set({ 
    isRunning: true, 
    lastAnnouncedCurveId: null,
    simulationProgress: 0 
  }),
  
  stopDrive: () => set({ 
    isRunning: false, 
    activeCurve: null 
  }),
  
  setMode: (mode) => set({ mode }),
  
  setPosition: (position) => set({ position }),
  
  setHeading: (heading) => set({ heading }),
  
  setSpeed: (speed) => set({ speed }),
  
  setUpcomingCurves: (curves) => set({ upcomingCurves: curves }),
  
  setActiveCurve: (curve) => set({ activeCurve: curve }),
  
  setLastAnnouncedCurveId: (id) => set({ lastAnnouncedCurveId: id }),
  
  setSimulationProgress: (progress) => set({ simulationProgress: progress }),
  
  updateSettings: (updates) => set((state) => ({
    settings: { ...state.settings, ...updates }
  })),
  
  toggleSettings: () => set((state) => ({ 
    showSettings: !state.showSettings 
  })),
  
  toggleBottomPanel: () => set((state) => ({ 
    bottomPanelMinimized: !state.bottomPanelMinimized 
  })),
  
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  setSpeaking: (isSpeaking, text = '') => set({ 
    isSpeaking, 
    lastSpokenText: text 
  }),
  
  // ========== Computed Getters ==========
  
  getModeConfig: () => {
    const modes = {
      cruise: { 
        name: 'Cruise', 
        color: '#00d4ff', 
        speedKey: 'speedCruise',
        description: 'Relaxed scenic driving'
      },
      fast: { 
        name: 'Fast', 
        color: '#ffd500', 
        speedKey: 'speedFast',
        description: 'Spirited, focused'
      },
      race: { 
        name: 'Race', 
        color: '#ff3366', 
        speedKey: 'speedRace',
        description: 'Full engagement'
      }
    }
    return modes[get().mode]
  },
  
  getDisplaySpeed: () => {
    const { speed, settings } = get()
    return settings.speedUnit === 'kmh' 
      ? Math.round(speed * 1.609) 
      : Math.round(speed)
  },
  
  getRecommendedSpeed: (curve) => {
    if (!curve) return null
    const { mode, settings } = get()
    const speedKey = `speed${mode.charAt(0).toUpperCase() + mode.slice(1)}`
    const speed = curve[speedKey] || curve.speedCruise
    return settings.speedUnit === 'kmh' 
      ? Math.round(speed * 1.609) 
      : speed
  }
}))

export default useStore
