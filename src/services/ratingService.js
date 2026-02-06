// Rating Service - Supabase integration for route ratings
// Handles submitting, fetching, and aggregating rating data

import { supabase } from './supabase'

/**
 * Submit or update a rating for a route
 * Uses upsert to avoid duplicates (user can only have one rating per route)
 */
export async function submitRating(userId, routeSlug, rating, review = null) {
  if (!userId || !routeSlug || !rating) {
    console.log('🗄️ Rating skipped: missing required fields')
    return null
  }

  try {
    // Look up route UUID from slug
    const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('slug', routeSlug)
      .single()

    if (routeError || !routeData) {
      console.error('🗄️ Rating failed: route not found for slug', routeSlug)
      return null
    }

    const routeId = routeData.id

    // Upsert the rating (update if exists, insert if not)
    const { data, error } = await supabase
      .from('route_ratings')
      .upsert(
        {
          user_id: userId,
          route_id: routeId,
          rating: Math.min(5, Math.max(1, Math.round(rating))),
          review: review?.trim() || null,
          driven_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,route_id',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('🗄️ Failed to submit rating:', error)
      throw error
    }

    console.log(`🗄️ Rating saved: ${rating} stars for ${routeSlug}`)
    return data
  } catch (error) {
    console.error('🗄️ Rating submit error:', error)
    throw error
  }
}

/**
 * Fetch average rating and total ratings for a route
 */
export async function fetchRouteRating(routeSlug) {
  if (!routeSlug) {
    return { averageRating: 0, totalRatings: 0 }
  }

  try {
    // Look up route UUID from slug
    const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('slug', routeSlug)
      .single()

    if (routeError || !routeData) {
      return { averageRating: 0, totalRatings: 0 }
    }

    // Fetch all ratings for this route
    const { data: ratings, error } = await supabase
      .from('route_ratings')
      .select('rating')
      .eq('route_id', routeData.id)

    if (error || !ratings || ratings.length === 0) {
      return { averageRating: 0, totalRatings: 0 }
    }

    const totalRatings = ratings.length
    const averageRating =
      ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings

    console.log(`🗄️ Route ${routeSlug}: ${averageRating.toFixed(1)} avg (${totalRatings} ratings)`)

    return {
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings,
    }
  } catch (error) {
    console.error('🗄️ Fetch route rating error:', error)
    return { averageRating: 0, totalRatings: 0 }
  }
}

/**
 * Fetch a user's rating for a specific route
 */
export async function fetchUserRatingForRoute(userId, routeSlug) {
  if (!userId || !routeSlug) {
    return null
  }

  try {
    // Look up route UUID from slug
    const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('slug', routeSlug)
      .single()

    if (routeError || !routeData) {
      return null
    }

    // Fetch user's rating for this route (may not exist)
    const { data, error } = await supabase
      .from('route_ratings')
      .select('rating, review')
      .eq('user_id', userId)
      .eq('route_id', routeData.id)
      .maybeSingle()

    if (error) {
      console.error('🗄️ Fetch user rating error:', error)
      return null
    }

    if (!data) {
      return null
    }

    console.log(`🗄️ User rating for ${routeSlug}: ${data.rating} stars`)
    return data
  } catch (error) {
    console.error('🗄️ Fetch user rating error:', error)
    return null
  }
}

/**
 * Batch fetch stats for all routes (ratings + drive counts)
 * Returns a map of routeSlug → { averageRating, totalRatings, driveCount }
 * This is optimized to use only 3 queries instead of N queries per route
 */
export async function fetchAllRouteStats() {
  try {
    // Query 1: Get all routes with their slugs
    const { data: routes, error: routesError } = await supabase
      .from('routes')
      .select('id, slug')

    if (routesError || !routes) {
      console.error('🗄️ Failed to fetch routes:', routesError)
      return {}
    }

    // Create a map of route_id → slug for lookups
    const routeIdToSlug = {}
    routes.forEach((r) => {
      routeIdToSlug[r.id] = r.slug
    })

    // Query 2: Get all ratings grouped by route
    const { data: ratings, error: ratingsError } = await supabase
      .from('route_ratings')
      .select('route_id, rating')

    if (ratingsError) {
      console.error('🗄️ Failed to fetch ratings:', ratingsError)
    }

    // Query 3: Get all drive counts grouped by route
    const { data: drives, error: drivesError } = await supabase
      .from('drive_logs')
      .select('route_id')
      .not('route_id', 'is', null)

    if (drivesError) {
      console.error('🗄️ Failed to fetch drive counts:', drivesError)
    }

    // Aggregate ratings by route_id
    const ratingsByRoute = {}
    ;(ratings || []).forEach((r) => {
      if (!ratingsByRoute[r.route_id]) {
        ratingsByRoute[r.route_id] = []
      }
      ratingsByRoute[r.route_id].push(r.rating)
    })

    // Count drives by route_id
    const driveCountByRoute = {}
    ;(drives || []).forEach((d) => {
      driveCountByRoute[d.route_id] = (driveCountByRoute[d.route_id] || 0) + 1
    })

    // Build the final map keyed by slug
    const statsMap = {}
    routes.forEach((route) => {
      const routeRatings = ratingsByRoute[route.id] || []
      const totalRatings = routeRatings.length
      const averageRating =
        totalRatings > 0
          ? routeRatings.reduce((sum, r) => sum + r, 0) / totalRatings
          : 0

      statsMap[route.slug] = {
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        driveCount: driveCountByRoute[route.id] || 0,
      }
    })

    console.log(`🗄️ Fetched stats for ${Object.keys(statsMap).length} routes`)
    return statsMap
  } catch (error) {
    console.error('🗄️ Fetch all route stats error:', error)
    return {}
  }
}
