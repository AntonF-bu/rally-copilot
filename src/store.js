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
      
      routeData: null,
      routeMode: null,
      destination: null,
      
      activeCurve: null,
      upcomingCurves: [],
      lastAnnouncedCurveId: null,
      
      simulationProgress: 0,
      simulationSpeed: 1,      // 0.5x, 1x, 2x, 4x
      simulationPaused: false,
      
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
          isRunning: true,
          simulationProgress: 0,
          lastAnnouncedCurveId: null
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
