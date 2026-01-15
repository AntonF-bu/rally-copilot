// ================================
// Highway Store - Updated for Chatter
// 
// Changes from original:
// - chatter: true (was false) in companion mode defaults
// - Added comments explaining chatter feature
// ================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Highway modes
export const HIGHWAY_MODE = {
  BASIC: 'basic',       // Just sweeper callouts
  COMPANION: 'companion' // Full co-pilot experience with chatter
}

/**
 * Create default highway stats object
 */
export function createHighwayStats() {
  return {
    sweepersHit: 0,
    sweepersTotal: 0,
    highwayMiles: 0,
    highwayStartTime: null,
    bestSweeperTime: null,
    currentStreak: 0
  }
}

/**
 * Highway Mode Store
 * Manages highway-specific state and companion features
 */
const useHighwayStore = create(
  persist(
    (set, get) => ({
      // ================================
      // SETTINGS (persisted)
      // ================================
      
      // Highway mode setting: 'basic' or 'companion'
      highwayMode: HIGHWAY_MODE.BASIC,
      
      // Feature toggles (user can override defaults)
      highwayFeatures: {
        sweepers: true,       // Sweeper callouts (both modes)
        elevation: true,      // Crest/dip/grade callouts (future)
        progress: true,       // Progress milestones
        chatter: false,       // Companion chatter - OFF by default, enabled when companion mode selected
        apex: false,          // Apex timing (Companion only)
        stats: false,         // Stats callouts (Companion only)
        feedback: false       // Sweeper feedback (Companion only)
      },
      
      // ================================
      // RUNTIME STATE (not persisted)
      // ================================
      
      // Current highway stats for this trip
      highwayStats: createHighwayStats(),
      
      // Tracking for callout timing
      lastCalloutTime: 0,
      lastChatterTime: 0,
      lastStatsCalloutTime: 0,
      
      // Progress tracking
      announcedMilestones: new Set(),
      
      // Are we currently in a highway zone?
      inHighwayZone: false,
      
      // Current route's enhanced sweepers (from Preview analysis)
      routeSweepers: [],
      
      // ================================
      // ACTIONS
      // ================================
      
      // Set highway mode and update features accordingly
      setHighwayMode: (mode) => {
        const features = mode === HIGHWAY_MODE.COMPANION
          ? {
              sweepers: true,
              elevation: true,
              progress: true,
              chatter: true,    // ENABLED in companion mode
              apex: false,      // Future feature
              stats: false,     // Future feature
              feedback: false   // Future feature
            }
          : {
              sweepers: true,
              elevation: true,
              progress: true,
              chatter: false,   // DISABLED in basic mode
              apex: false,
              stats: false,
              feedback: false
            }
        
        set({ 
          highwayMode: mode,
          highwayFeatures: features
        })
        
        console.log(`🛣️ Highway mode: ${mode}, chatter: ${features.chatter}`)
      },
      
      // Toggle individual feature
      toggleFeature: (feature) => {
        const { highwayFeatures } = get()
        set({
          highwayFeatures: {
            ...highwayFeatures,
            [feature]: !highwayFeatures[feature]
          }
        })
      },
      
      // Set feature directly
      setFeature: (feature, enabled) => {
        const { highwayFeatures } = get()
        set({
          highwayFeatures: {
            ...highwayFeatures,
            [feature]: enabled
          }
        })
      },
      
      // Update highway stats
      updateHighwayStats: (updates) => {
        const { highwayStats } = get()
        set({ highwayStats: { ...highwayStats, ...updates } })
      },
      
      // Record sweeper completion
      recordSweeperHit: () => {
        const { highwayStats } = get()
        set({
          highwayStats: {
            ...highwayStats,
            sweepersHit: highwayStats.sweepersHit + 1,
            currentStreak: highwayStats.currentStreak + 1
          }
        })
      },
      
      // Track zone transitions
      setInHighwayZone: (inZone) => {
        const { inHighwayZone, highwayStats } = get()
        
        // Entering highway
        if (inZone && !inHighwayZone) {
          set({
            inHighwayZone: true,
            highwayStats: {
              ...highwayStats,
              highwayStartTime: Date.now()
            }
          })
        }
        
        // Exiting highway
        if (!inZone && inHighwayZone) {
          set({ inHighwayZone: false })
        }
      },
      
      // Store enhanced sweepers for current route
      setRouteSweepers: (sweepers) => {
        set({ routeSweepers: sweepers })
      },
      
      // Reset for new trip
      resetHighwayTrip: () => {
        set({
          highwayStats: createHighwayStats(),
          lastCalloutTime: 0,
          lastChatterTime: 0,
          lastStatsCalloutTime: 0,
          announcedMilestones: new Set(),
          inHighwayZone: false,
          routeSweepers: []
        })
      },
      
      // Get current config based on mode
      getActiveConfig: () => {
        const { highwayMode, highwayFeatures } = get()
        return {
          mode: highwayMode,
          features: highwayFeatures
        }
      },
      
      // Check if chatter is enabled
      isChatterEnabled: () => {
        const { highwayMode, highwayFeatures } = get()
        return highwayMode === HIGHWAY_MODE.COMPANION && highwayFeatures.chatter
      }
    }),
    {
      name: 'rally-copilot-highway-storage',
      // Only persist settings, not runtime state
      partialize: (state) => ({
        highwayMode: state.highwayMode,
        highwayFeatures: state.highwayFeatures
      })
    }
  )
)

export default useHighwayStore
