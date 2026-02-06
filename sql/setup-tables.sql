-- Tramo Database Setup
-- Run this in Supabase SQL Editor

-- ================================
-- PROFILES TABLE
-- ================================
-- Stores user profile data linked to auth.users

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ================================
-- DRIVE_LOGS TABLE
-- ================================
-- Stores completed drive sessions

CREATE TABLE IF NOT EXISTS public.drive_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  distance_miles NUMERIC(6,2),
  avg_speed_mph NUMERIC(5,1),
  max_speed_mph NUMERIC(5,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.drive_logs ENABLE ROW LEVEL SECURITY;

-- Policies for drive_logs
CREATE POLICY "Users can view their own drive logs"
  ON public.drive_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own drive logs"
  ON public.drive_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drive logs"
  ON public.drive_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drive logs"
  ON public.drive_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS drive_logs_user_id_idx ON public.drive_logs(user_id);
CREATE INDEX IF NOT EXISTS drive_logs_route_id_idx ON public.drive_logs(route_id);


-- ================================
-- ROUTE_RATINGS TABLE
-- ================================
-- Stores user ratings and reviews for routes

CREATE TABLE IF NOT EXISTS public.route_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  driven_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, route_id)
);

-- Enable RLS
ALTER TABLE public.route_ratings ENABLE ROW LEVEL SECURITY;

-- Policies for route_ratings
CREATE POLICY "Anyone can view ratings"
  ON public.route_ratings FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own ratings"
  ON public.route_ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ratings"
  ON public.route_ratings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings"
  ON public.route_ratings FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS route_ratings_route_id_idx ON public.route_ratings(route_id);
CREATE INDEX IF NOT EXISTS route_ratings_user_id_idx ON public.route_ratings(user_id);


-- ================================
-- SAVED_ROUTES TABLE (optional)
-- ================================
-- If you want server-side saved routes instead of localStorage

CREATE TABLE IF NOT EXISTS public.saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, route_id)
);

-- Enable RLS
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

-- Policies for saved_routes
CREATE POLICY "Users can view their saved routes"
  ON public.saved_routes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save routes"
  ON public.saved_routes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave routes"
  ON public.saved_routes FOR DELETE
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS saved_routes_user_id_idx ON public.saved_routes(user_id);


-- ================================
-- UPDATE ROUTES TABLE (if needed)
-- ================================
-- Add missing columns to existing routes table

DO $$
BEGIN
  -- Add curve_count if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'curve_count'
  ) THEN
    ALTER TABLE public.routes ADD COLUMN curve_count INTEGER;
  END IF;

  -- Add elevation_gain if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routes' AND column_name = 'elevation_gain'
  ) THEN
    ALTER TABLE public.routes ADD COLUMN elevation_gain INTEGER;
  END IF;
END $$;
