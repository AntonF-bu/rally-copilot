// Supabase Client
// Initialized using Vite environment variables

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('🗄️ Supabase credentials not found in environment variables')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

export default supabase
