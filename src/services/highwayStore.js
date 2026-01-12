// ================================
// Highway Mode Store Extension
// Manages highway-specific state without modifying main store.js
// ================================

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { HIGHWAY_MODE, createHighwayStats } from './highwayModeService'

/**
 * Highway Mode Store
 * Separate from main store to keep highway features isolated
 */
const useHighwayStore = create(
  persist(
    (set, get) => ({
      // ================================
      // SETTINGS (persisted)
      // ================================
      
      // Highway mode setting: 'basic' or 'companion'
      highwayMode: HIGHWAY_MODE.BASIC,
      
      // Feature toggles (all default to mode defaults, user can override)
      highwayFeatures: {
        sweepers: true,       // Sweeper callouts
        elevation: true,      // Crest/dip/grade callouts (future)
        progress: true,       // Progress milestones
        chatter: false,       // Silence breaker chatter (Companion only)
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
      
      // Sweepers for current route (enhanced curves)
      routeSweepers: [],
      
      // ================================
      // ACTIONS
      // ================================
      
      // Set highway mode (basic/companion)
      setHighwayMode: (mode) => {
        const isCompanion = mode === HIGHWAY_MODE.COMPANION
        set({ 
          highwayMode: mode,
          // Auto-enable/disable companion features based on mode
          highwayFeatures: {
            sweepers: true,
            elevation: true,
            progress: true,
            chatter: isCompanion,
            apex: isCompanion,
            stats: isCompanion,
            feedback: isCompanion
          }
        })
      },
      
      // Toggle individual feature
      toggleHighwayFeature: (feature) => {
        const { highwayFeatures } = get()
        set({
          highwayFeatures: {
            ...highwayFeatures,
            [feature]: !highwayFeatures[feature]
          }
        })
      },
      
      // Set feature directly
      setHighwayFeature: (feature, enabled) => {
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
        set({
          highwayStats: {
            ...highwayStats,
            ...updates
          }
        })
      },
      
      // Increment sweeper count
      incrementSweepersCleared: () => {
        const { highwayStats } = get()
        set({
          highwayStats: {
            ...highwayStats,
            sweepersCleared: highwayStats.sweepersCleared + 1
          }
        })
      },
      
      // Add speed sample for averaging
      addSpeedSample: (speed) => {
        const { highwayStats } = get()
        const newSamples = [...highwayStats.speedSamples, speed].slice(-50)
        const avgSpeed = newSamples.reduce((a, b) => a + b, 0) / newSamples.length
        set({
          highwayStats: {
            ...highwayStats,
            speedSamples: newSamples,
            averageSpeed: avgSpeed
          }
        })
      },
      
      // Record callout time
      recordCalloutTime: () => {
        set({ lastCalloutTime: Date.now() })
      },
      
      // Record chatter time
      recordChatterTime: () => {
        set({ lastChatterTime: Date.now() })
      },
      
      // Record stats callout time
      recordStatsCalloutTime: () => {
        set({ lastStatsCalloutTime: Date.now() })
      },
      
      // Add announced milestone
      addAnnouncedMilestone: (milestoneId) => {
        const { announcedMilestones } = get()
        const newSet = new Set(announcedMilestones)
        newSet.add(milestoneId)
        set({ announcedMilestones: newSet })
      },
      
      // Enter/exit highway zone
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
