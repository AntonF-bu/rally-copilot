// useAuth Hook
// Manages authentication state and syncs with Supabase

import { useEffect, useState, useCallback } from 'react'
import useStore from '../store'
import { getSession, onAuthStateChange, getProfile } from '../services/authService'

/**
 * Hook that manages authentication state
 * - Checks for existing session on mount
 * - Subscribes to auth state changes
 * - Fetches and updates user profile
 */
export function useAuth() {
  const [isLoading, setIsLoading] = useState(true)

  const user = useStore((state) => state.user)
  const profile = useStore((state) => state.profile)
  const isAuthenticated = useStore((state) => state.isAuthenticated)
  const setUser = useStore((state) => state.setUser)
  const setProfile = useStore((state) => state.setProfile)
  const setIsAuthenticated = useStore((state) => state.setIsAuthenticated)
  const clearAuth = useStore((state) => state.clearAuth)

  // Fetch profile for a user
  const fetchProfile = useCallback(async (userId) => {
    try {
      const profileData = await getProfile(userId)
      if (profileData) {
        console.log('🔐 useAuth: Profile loaded:', profileData.display_name || profileData.username)
        setProfile(profileData)
      } else {
        console.log('🔐 useAuth: No profile found, user may need to complete setup')
        setProfile(null)
      }
    } catch (error) {
      console.error('🔐 useAuth: Failed to fetch profile:', error)
      setProfile(null)
    }
  }, [setProfile])

  // Handle auth state change
  const handleAuthChange = useCallback(async (event, session) => {
    console.log('🔐 useAuth: Auth event:', event)

    if (session?.user) {
      setUser(session.user)
      setIsAuthenticated(true)
      await fetchProfile(session.user.id)
    } else {
      clearAuth()
    }

    setIsLoading(false)
  }, [setUser, setIsAuthenticated, clearAuth, fetchProfile])

  // Check initial session and subscribe to changes
  useEffect(() => {
    let mounted = true

    const initAuth = async () => {
      console.log('🔐 useAuth: Initializing auth...')

      try {
        const session = await getSession()

        if (!mounted) return

        if (session?.user) {
          console.log('🔐 useAuth: Existing session found:', session.user.email)
          setUser(session.user)
          setIsAuthenticated(true)
          await fetchProfile(session.user.id)
        } else {
          console.log('🔐 useAuth: No existing session')
          clearAuth()
        }
      } catch (error) {
        console.error('🔐 useAuth: Failed to get session:', error)
        clearAuth()
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initAuth()

    // Subscribe to auth changes
    const unsubscribe = onAuthStateChange(handleAuthChange)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [setUser, setIsAuthenticated, clearAuth, fetchProfile, handleAuthChange])

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }, [user, fetchProfile])

  return {
    user,
    profile,
    isAuthenticated,
    isLoading,
    refreshProfile,
  }
}

export default useAuth
