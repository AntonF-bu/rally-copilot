// useAuth Hook
// Manages authentication state and syncs with Supabase

import { useEffect, useState, useCallback } from 'react'
import useStore from '../store'
import { getSession, onAuthStateChange, getProfile, createProfile } from '../services/authService'

/**
 * Hook that manages authentication state
 * - Checks for existing session on mount
 * - Subscribes to auth state changes
 * - Fetches and updates user profile
 * - Auto-creates profile if one doesn't exist
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

  // Fetch profile for a user, auto-create if doesn't exist
  const fetchProfile = useCallback(async (userId, userEmail, userMetadata = {}) => {
    try {
      const profileData = await getProfile(userId)

      if (profileData) {
        console.log('🔐 useAuth: Profile loaded:', profileData.display_name || profileData.email)
        setProfile(profileData)
        return profileData
      }

      // No profile found - auto-create one
      console.log('🔐 useAuth: No profile found, creating one...')

      // Extract display name from user metadata or email
      const displayName = userMetadata?.full_name ||
                          userMetadata?.name ||
                          userMetadata?.display_name ||
                          (userEmail ? userEmail.split('@')[0] : 'Driver')

      // Extract avatar from metadata (Google, etc.)
      const avatarUrl = userMetadata?.avatar_url ||
                        userMetadata?.picture ||
                        null

      try {
        const newProfile = await createProfile(userId, {
          email: userEmail,
          display_name: displayName,
          avatar_url: avatarUrl,
        })

        console.log('🔐 useAuth: Profile auto-created:', newProfile.display_name)
        setProfile(newProfile)
        return newProfile
      } catch (createError) {
        // Profile creation might fail if there's a race condition
        // (e.g., database trigger already created it)
        console.warn('🔐 useAuth: Profile creation failed, retrying fetch:', createError.message)

        // Try fetching again in case it was created by a trigger
        const retryProfile = await getProfile(userId)
        if (retryProfile) {
          console.log('🔐 useAuth: Profile found on retry:', retryProfile.display_name)
          setProfile(retryProfile)
          return retryProfile
        }

        // If still no profile, set to null
        console.error('🔐 useAuth: Could not create or fetch profile')
        setProfile(null)
        return null
      }
    } catch (error) {
      console.error('🔐 useAuth: Failed to fetch profile:', error)
      setProfile(null)
      return null
    }
  }, [setProfile])

  // Handle auth state change
  const handleAuthChange = useCallback(async (event, session) => {
    console.log('🔐 useAuth: Auth event:', event)

    if (session?.user) {
      setUser(session.user)
      setIsAuthenticated(true)
      await fetchProfile(
        session.user.id,
        session.user.email,
        session.user.user_metadata
      )
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
          await fetchProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata
          )
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
      await fetchProfile(user.id, user.email, user.user_metadata)
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
