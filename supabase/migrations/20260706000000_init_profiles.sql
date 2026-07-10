-- Initialize profiles table to sync with Clerk Authentication
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY, -- Clerk User ID is a string (e.g. user_2...)
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1. Select Policy: Allow authenticated users to view profiles
CREATE POLICY "Allow select for authenticated users" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- 2. Update Policy: Allow users to edit their own profile details
CREATE POLICY "Allow update for owners" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated 
  USING (auth.jwt() ->> 'sub' = id) 
  WITH CHECK (auth.jwt() ->> 'sub' = id);
