-- 1. Create Channel Categories Table
CREATE TABLE IF NOT EXISTS public.channel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(workspace_id, name)
);

-- 2. Alter Channels to include category, archivation, and timestamps
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.channel_categories(id) ON DELETE SET NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. Create Channel Members mapping
CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' NOT NULL, -- owner, member
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(channel_id, profile_id)
);

-- 4. Create Channel Settings Table
CREATE TABLE IF NOT EXISTS public.channel_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  notify_level TEXT DEFAULT 'all' NOT NULL, -- all, mentions, none
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(channel_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;

-- 5. Define Row Level Security Policies

-- CHANNEL CATEGORIES Policies
CREATE POLICY "Allow category select for workspace members" ON public.channel_categories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = channel_categories.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow category write for owners/admins" ON public.channel_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = channel_categories.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- CHANNEL MEMBERS Policies
CREATE POLICY "Allow channel_members select for workspace members" ON public.channel_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels 
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE channels.id = channel_members.channel_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow channel_members insert for self in public channels" ON public.channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.jwt() ->> 'sub'
    AND EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE channels.id = channel_id
      AND channels.is_private = false
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow channel_members delete for self" ON public.channel_members
  FOR DELETE TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub');

-- CHANNEL SETTINGS Policies
CREATE POLICY "Allow channel_settings write for owners" ON public.channel_settings
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');
