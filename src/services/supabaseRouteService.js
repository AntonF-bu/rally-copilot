// Supabase Route Service
// Service layer for fetching and managing routes from Supabase

import { supabase } from './supabase'

/**
 * Maps a flat DB route record to the nested format the app expects
 * DB: { start_lat, start_lng, start_label, end_lat, end_lng, end_label, slug, distance_miles, duration_minutes, ... }
 * App: { id, start: { lat, lng, label }, end: { lat, lng, label }, distance, duration, ... }
 */
function mapDbRouteToAppRoute(dbRoute) {
  return {
    // Use slug as the app's id (for consistency with DISCOVERY_ROUTES)
    id: dbRoute.slug || dbRoute.id,
    name: dbRoute.name,
    region: dbRoute.region,
    start: {
      lat: dbRoute.start_lat,
      lng: dbRoute.start_lng,
      label: dbRoute.start_label,
    },
    end: {
      lat: dbRoute.end_lat,
      lng: dbRoute.end_lng,
      label: dbRoute.end_label,
    },
    waypoints: dbRoute.waypoints || [],
    geometry: dbRoute.geometry || null,
    // Map back to app field names
    distance: dbRoute.distance_miles,
    duration: dbRoute.duration_minutes,
    difficulty: dbRoute.difficulty,
    tags: dbRoute.tags || [],
    description: dbRoute.description,
    // Include DB metadata
    dbId: dbRoute.id, // Keep the actual UUID for DB operations
    created_at: dbRoute.created_at,
    updated_at: dbRoute.updated_at,
    is_published: dbRoute.is_published,
  }
}

/**
 * Maps app route format to flat DB schema for insertion
 * App: { start: { lat, lng, label }, end: { lat, lng, label }, distance, duration, ... }
 * DB: { start_lat, start_lng, start_label, end_lat, end_lng, end_label, distance_miles, duration_minutes, ... }
 */
function mapAppRouteToDbRoute(appRoute) {
  return {
    slug: appRoute.id,
    name: appRoute.name,
    region: appRoute.region,
    start_lat: appRoute.start.lat,
    start_lng: appRoute.start.lng,
    start_label: appRoute.start.label,
    end_lat: appRoute.end.lat,
    end_lng: appRoute.end.lng,
    end_label: appRoute.end.label,
    waypoints: appRoute.waypoints || [],
    geometry: appRoute.geometry || null,
    distance_miles: appRoute.distance,
    duration_minutes: appRoute.duration,
    difficulty: appRoute.difficulty,
    tags: appRoute.tags || [],
    description: appRoute.description,
    is_published: true,
  }
}

/**
 * Fetches all published routes from Supabase
 * Returns routes mapped to the app's expected format
 */
export async function fetchPublishedRoutes() {
  console.log('🗄️ Fetching published routes from Supabase...')

  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('🗄️ Supabase fetch error:', error.message)
      throw error
    }

    console.log(`🗄️ Fetched ${data?.length || 0} routes from Supabase`)

    // Map each DB record to app format
    return (data || []).map(mapDbRouteToAppRoute)
  } catch (error) {
    console.error('🗄️ Failed to fetch routes:', error)
    throw error
  }
}

/**
 * Fetches a single route by slug or ID
 */
export async function fetchRouteById(id) {
  console.log(`🗄️ Fetching route by ID: ${id}`)

  try {
    // Try to fetch by slug first (app-friendly id)
    let { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('slug', id)
      .single()

    // If not found by slug, try by UUID
    if (error && error.code === 'PGRST116') {
      const result = await supabase
        .from('routes')
        .select('*')
        .eq('id', id)
        .single()
      data = result.data
      error = result.error
    }

    if (error) {
      console.error('🗄️ Supabase fetch error:', error.message)
      throw error
    }

    if (!data) {
      console.log('🗄️ Route not found')
      return null
    }

    console.log(`🗄️ Found route: ${data.name}`)
    return mapDbRouteToAppRoute(data)
  } catch (error) {
    console.error('🗄️ Failed to fetch route:', error)
    throw error
  }
}

/**
 * Fetches routes by region (for "Routes Near You" feature)
 */
export async function fetchRoutesByRegion(region) {
  console.log(`🗄️ Fetching routes for region: ${region}`)

  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('region', region)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('🗄️ Supabase fetch error:', error.message)
      throw error
    }

    console.log(`🗄️ Fetched ${data?.length || 0} routes for region ${region}`)
    return (data || []).map(mapDbRouteToAppRoute)
  } catch (error) {
    console.error('🗄️ Failed to fetch routes by region:', error)
    throw error
  }
}

/**
 * Seeds routes from the DISCOVERY_ROUTES array into Supabase
 * This is a one-time migration helper
 */
export async function seedRoutesFromDiscovery(discoveryRoutes) {
  console.log(`🗄️ Seeding ${discoveryRoutes.length} routes to Supabase...`)

  try {
    // Map all routes to DB format
    const dbRoutes = discoveryRoutes.map(mapAppRouteToDbRoute)

    // Upsert to handle both insert and update cases
    const { data, error } = await supabase
      .from('routes')
      .upsert(dbRoutes, { onConflict: 'slug' })
      .select()

    if (error) {
      console.error('🗄️ Supabase seed error:', error.message)
      throw error
    }

    console.log(`🗄️ Successfully seeded ${data?.length || 0} routes`)
    return data
  } catch (error) {
    console.error('🗄️ Failed to seed routes:', error)
    throw error
  }
}
