// Auth Service
// Supabase authentication and user profile management

import { supabase } from './supabase'

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  console.log('🔐 Initiating Google OAuth sign-in...')

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      console.error('🔐 Google sign-in error:', error.message)
      throw error
    }

    console.log('🔐 Google OAuth initiated')
    return data
  } catch (error) {
    console.error('🔐 Failed to sign in with Google:', error)
    throw error
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  console.log('🔐 Signing in with email...')

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('🔐 Email sign-in error:', error.message)
      throw error
    }

    console.log('🔐 Email sign-in successful')
    return data
  } catch (error) {
    console.error('🔐 Failed to sign in with email:', error)
    throw error
  }
}

/**
 * Sign up with email and password
 */
export async function signUp(email, password) {
  console.log('🔐 Creating new account...')

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      console.error('🔐 Sign-up error:', error.message)
      throw error
    }

    console.log('🔐 Account created successfully')
    return data
  } catch (error) {
    console.error('🔐 Failed to create account:', error)
    throw error
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  console.log('🔐 Signing out...')

  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('🔐 Sign-out error:', error.message)
      throw error
    }

    console.log('🔐 Signed out successfully')
    return true
  } catch (error) {
    console.error('🔐 Failed to sign out:', error)
    throw error
  }
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser() {
  console.log('🔐 Getting current user...')

  try {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.error('🔐 Get user error:', error.message)
      throw error
    }

    if (user) {
      console.log('🔐 Current user:', user.email)
    } else {
      console.log('🔐 No user signed in')
    }

    return user
  } catch (error) {
    console.error('🔐 Failed to get current user:', error)
    throw error
  }
}

/**
 * Get the current session
 */
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      console.error('🔐 Get session error:', error.message)
      throw error
    }

    return session
  } catch (error) {
    console.error('🔐 Failed to get session:', error)
    throw error
  }
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Called with (event, session) on auth changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
  console.log('🔐 Subscribing to auth state changes...')

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    console.log('🔐 Auth state changed:', event)
    callback(event, session)
  })

  return () => {
    console.log('🔐 Unsubscribing from auth state changes')
    subscription.unsubscribe()
  }
}

/**
 * Fetch user profile from profiles table
 */
export async function getProfile(userId) {
  console.log('🔐 Fetching profile for user:', userId)

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      // Profile might not exist yet (PGRST116 = row not found)
      if (error.code === 'PGRST116') {
        console.log('🔐 No profile found for user')
        return null
      }
      console.error('🔐 Get profile error:', error.message)
      throw error
    }

    console.log('🔐 Profile fetched:', data?.display_name || data?.username)
    return data
  } catch (error) {
    console.error('🔐 Failed to fetch profile:', error)
    throw error
  }
}

/**
 * Update user profile
 */
export async function updateProfile(userId, updates) {
  console.log('🔐 Updating profile for user:', userId)

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('🔐 Update profile error:', error.message)
      throw error
    }

    console.log('🔐 Profile updated successfully')
    return data
  } catch (error) {
    console.error('🔐 Failed to update profile:', error)
    throw error
  }
}

/**
 * Create a new profile (called when user signs up)
 */
export async function createProfile(userId, profileData) {
  console.log('🔐 Creating profile for user:', userId)

  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        ...profileData,
      })
      .select()
      .single()

    if (error) {
      console.error('🔐 Create profile error:', error.message)
      throw error
    }

    console.log('🔐 Profile created successfully')
    return data
  } catch (error) {
    console.error('🔐 Failed to create profile:', error)
    throw error
  }
}
