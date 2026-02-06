#!/usr/bin/env node

/**
 * Seed Routes Script
 *
 * Seeds the 10 existing discovery routes from discoveryRoutes.js into Supabase.
 * Run with: node src/scripts/seedRoutes.js
 *
 * Make sure .env file exists with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { DISCOVERY_ROUTES } from '../data/discoveryRoutes.js'

// Get credentials from environment or use fallback
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zptvbgbkccubrclruzsl.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_ucI8kKuOmzxy9lDtJsYF0g_Xhift7Qu'

console.log('🗄️ Rally Co-Pilot Route Seeder')
console.log('================================')
console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`)
console.log(`🗄️ Routes to seed: ${DISCOVERY_ROUTES.length}`)
console.log('')

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Maps app route format to flat DB schema for insertion
 */
function mapAppRouteToDbRoute(appRoute) {
  return {
    id: appRoute.id,
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
    distance: appRoute.distance,
    duration: appRoute.duration,
    difficulty: appRoute.difficulty,
    tags: appRoute.tags || [],
    description: appRoute.description,
    is_published: true,
  }
}

async function seedRoutes() {
  console.log('🗄️ Starting route seed...')

  try {
    // Map all routes to DB format
    const dbRoutes = DISCOVERY_ROUTES.map(mapAppRouteToDbRoute)

    console.log('🗄️ Mapped routes to DB format:')
    dbRoutes.forEach((route, i) => {
      console.log(`   ${i + 1}. ${route.name} (${route.region})`)
    })
    console.log('')

    // Upsert to handle both insert and update cases
    console.log('🗄️ Upserting routes to Supabase...')
    const { data, error } = await supabase
      .from('routes')
      .upsert(dbRoutes, { onConflict: 'id' })
      .select()

    if (error) {
      console.error('🗄️ Supabase error:', error.message)
      console.error('🗄️ Error details:', error)
      process.exit(1)
    }

    console.log('')
    console.log('🗄️ Successfully seeded routes!')
    console.log(`🗄️ Total routes in response: ${data?.length || 0}`)
    console.log('')
    console.log('🗄️ Seeded routes:')
    data?.forEach((route, i) => {
      console.log(`   ${i + 1}. ${route.name} - ${route.id}`)
    })

  } catch (error) {
    console.error('🗄️ Failed to seed routes:', error.message)
    process.exit(1)
  }
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

  await seedRoutes()

  console.log('')
  console.log('🗄️ Done!')
}

main()
