// Drive Log Service - Supabase integration for drive history
// Handles saving, fetching, and aggregating drive data

import { supabase } from './supabase'

/**
 * Save a completed drive to the database
 */
export async function saveDriveLog({
  userId,
  routeSlug,
  startedAt,
  endedAt,
  durationMinutes,
  distanceMiles,
  avgSpeedMph,
  maxSpeedMph,
  curvesCompleted,
  zoneBreakdown,
}) {
  if (!userId) {
    console.log('🗄️ Drive log skipped: no user ID')
    return null
  }

  try {
    // Look up route UUID from slug (if it's a curated route)
    let routeId = null
    if (routeSlug) {
      const { data: routeData } = await supabase
        .from('routes')
        .select('id')
        .eq('slug', routeSlug)
        .single()

      if (routeData) {
        routeId = routeData.id
      }
    }

    const { data, error } = await supabase
      .from('drive_logs')
      .insert({
        user_id: userId,
        route_id: routeId,
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        duration_minutes: Math.round(durationMinutes),
        distance_miles: parseFloat(distanceMiles.toFixed(2)),
        avg_speed_mph: parseFloat(avgSpeedMph.toFixed(1)),
        max_speed_mph: parseFloat(maxSpeedMph.toFixed(1)),
        notes: JSON.stringify({ curvesCompleted, zoneBreakdown }),
      })
      .select()
      .single()

    if (error) {
      console.error('🗄️ Failed to save drive log:', error)
      throw error
    }

    console.log('🗄️ Drive log saved:', data.id)
    return data
  } catch (error) {
    console.error('🗄️ Drive log save error:', error)
    throw error
  }
}

/**
 * Fetch drive logs for a user, with optional route name lookup
 */
export async function fetchDriveLogs(userId, limit = 20) {
  if (!userId) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('drive_logs')
      .select(`
        *,
        routes (
          name,
          slug,
          region
        )
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('🗄️ Failed to fetch drive logs:', error)
      return []
    }

    console.log(`🗄️ Fetched ${data?.length || 0} drive logs`)
    return data || []
  } catch (error) {
    console.error('🗄️ Drive logs fetch error:', error)
    return []
  }
}

/**
 * Fetch drive count for a specific route by UUID
 */
export async function fetchRouteDriveCount(routeId) {
  if (!routeId) {
    return 0
  }

  try {
    const { count, error } = await supabase
      .from('drive_logs')
      .select('*', { count: 'exact', head: true })
      .eq('route_id', routeId)

    if (error) {
      console.error('🗄️ Failed to fetch route drive count:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('🗄️ Route drive count error:', error)
    return 0
  }
}

/**
 * Fetch drive count for a route by its slug
 */
export async function fetchRouteDriveCountBySlug(slug) {
  if (!slug) {
    return 0
  }

  try {
    // First get the route UUID
    const { data: routeData, error: routeError } = await supabase
      .from('routes')
      .select('id')
      .eq('slug', slug)
      .single()

    if (routeError || !routeData) {
      return 0
    }

    return fetchRouteDriveCount(routeData.id)
  } catch (error) {
    console.error('🗄️ Route drive count by slug error:', error)
    return 0
  }
}

/**
 * Fetch aggregated stats for a user
 * Filters out test entries (0 distance AND 0 duration)
 */
export async function fetchDriverStats(userId) {
  if (!userId) {
    return { totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 }
  }

  try {
    const { data, error } = await supabase
      .from('drive_logs')
      .select('distance_miles, duration_minutes, route_id')
      .eq('user_id', userId)

    if (error || !data) {
      console.error('🗄️ Failed to fetch driver stats:', error)
      return { totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 }
    }

    // Filter out test/empty drives (distance = 0 AND duration = 0)
    const validDrives = data.filter(d => {
      const distance = parseFloat(d.distance_miles) || 0
      const duration = parseFloat(d.duration_minutes) || 0
      return distance > 0 || duration > 0
    })

    const totalMiles = validDrives.reduce(
      (sum, d) => sum + (parseFloat(d.distance_miles) || 0),
      0
    )
    const totalDrives = validDrives.length
    const uniqueRoutes = new Set(
      validDrives.filter((d) => d.route_id).map((d) => d.route_id)
    ).size

    console.log(`🗄️ Driver stats: ${totalMiles.toFixed(1)} mi, ${totalDrives} drives, ${uniqueRoutes} routes (filtered from ${data.length} total)`)

    return {
      totalMiles: Math.round(totalMiles * 10) / 10,
      totalDrives,
      uniqueRoutes,
    }
  } catch (error) {
    console.error('🗄️ Driver stats error:', error)
    return { totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 }
  }
}
