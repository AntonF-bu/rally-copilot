#!/usr/bin/env node

/**
 * Seed Routes Script
 *
 * Seeds the 10 curated New England routes into Supabase.
 * First DELETES all existing rows, then inserts fresh data.
 * Run with: node src/scripts/seedRoutes.js
 *
 * Make sure .env file exists with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DISCOVERY_ROUTES } from '../data/discoveryRoutes.js'

// Get credentials from environment
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('🗄️ ERROR: Missing Supabase credentials in .env file')
  console.error('🗄️ Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

console.log('🗄️ Tramo Route Seeder')
console.log('================================')
console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`)
console.log(`🗄️ Routes to seed: ${DISCOVERY_ROUTES.length}`)
console.log('')

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Maps app route format to flat DB schema for insertion
 * App format: { start: { lat, lng, label }, end: { lat, lng, label }, ... }
 * DB format: { start_lat, start_lng, start_label, end_lat, end_lng, end_label, ... }
 */
function mapAppRouteToDbRoute(appRoute) {
  return {
    // Use route.id as slug identifier (not primary key - let Supabase generate UUID)
    slug: appRoute.id,
    name: appRoute.name,
    region: appRoute.region,
    // Flatten start coordinates
    start_lat: appRoute.start.lat,
    start_lng: appRoute.start.lng,
    start_label: appRoute.start.label,
    // Flatten end coordinates
    end_lat: appRoute.end.lat,
    end_lng: appRoute.end.lng,
    end_label: appRoute.end.label,
    // Store waypoints as JSONB
    waypoints: appRoute.waypoints || [],
    // Route metadata
    distance_miles: appRoute.distance,
    duration_minutes: appRoute.duration,
    difficulty: appRoute.difficulty,
    // Tags as postgres text array
    tags: appRoute.tags || [],
    description: appRoute.description,
    // Additional route data
    curve_count: appRoute.curveCount || null,
    elevation_gain: appRoute.elevationGain || null,
    // Publishing flag
    is_published: true,
  }
}

async function deleteAllRoutes() {
  console.log('🗄️ Deleting all existing routes...')

  try {
    const { error } = await supabase
      .from('routes')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all rows

    if (error) {
      console.error('🗄️ Delete error:', error.message)
      throw error
    }

    console.log('🗄️ All existing routes deleted')
    return true
  } catch (error) {
    console.error('🗄️ Failed to delete routes:', error.message)
    throw error
  }
}

async function seedRoutes() {
  console.log('🗄️ Inserting new routes...')
  console.log('')

  const results = { success: [], failed: [] }

  for (const route of DISCOVERY_ROUTES) {
    const dbRoute = mapAppRouteToDbRoute(route)

    try {
      const { data, error } = await supabase
        .from('routes')
        .insert(dbRoute)
        .select()
        .single()

      if (error) {
        console.error(`🗄️ ❌ FAILED: ${route.name}`)
        console.error(`   Error: ${error.message}`)
        results.failed.push({ name: route.name, error: error.message })
      } else {
        console.log(`🗄️ ✓ SUCCESS: ${route.name} (${route.region})`)
        results.success.push({ name: route.name, id: data.id })
      }
    } catch (error) {
      console.error(`🗄️ ❌ FAILED: ${route.name}`)
      console.error(`   Error: ${error.message}`)
      results.failed.push({ name: route.name, error: error.message })
    }
  }

  console.log('')
  console.log('🗄️ ================================')
  console.log(`🗄️ Results: ${results.success.length} succeeded, ${results.failed.length} failed`)

  if (results.failed.length > 0) {
    console.log('')
    console.log('🗄️ Failed routes:')
    results.failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`))
  }

  return results
}

// Verify connection first
async function verifyConnection() {
  console.log('🗄️ Verifying Supabase connection...')

  try {
    const { count, error } = await supabase
      .from('routes')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('🗄️ Connection test failed:', error.message)
      return false
    }

    console.log(`🗄️ Connection successful! Current routes in DB: ${count || 0}`)
    console.log('')
    return true
  } catch (error) {
    console.error('🗄️ Connection error:', error.message)
    return false
  }
}

// Main execution
async function main() {
  const connected = await verifyConnection()

  if (!connected) {
    console.error('🗄️ Could not connect to Supabase. Check your credentials.')
    process.exit(1)
  }

  // Delete existing routes first
  await deleteAllRoutes()

  // Seed fresh routes
  const results = await seedRoutes()

  console.log('')
  if (results.failed.length === 0) {
    console.log('🗄️ Done! All routes seeded successfully.')
  } else {
    console.log('🗄️ Done with errors. Check failed routes above.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('🗄️ Fatal error:', err)
  process.exit(1)
})
