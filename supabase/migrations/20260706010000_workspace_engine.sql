-- Enable extensions if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  company_size TEXT,
  industry TEXT,
  timezone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

-- 2. Create Workspace Members table
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- owner, admin, member, guest
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  UNIQUE(workspace_id, profile_id)
);

-- 3. Create Workspace Invitations table
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, expired
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create Activity Logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  actor_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Create Roles, Permissions, and Role Permissions mapping
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE, -- e.g. channel:create, task:delete
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID REFERENCES public.roles(id) ON DELETE CASCADE NOT NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY(role_id, permission_id)
);

-- 6. Create Channels table
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. Create Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 8. Define Row Level Security Policies

-- WORKSPACES Policies
CREATE POLICY "Allow workspaces view for members" ON public.workspaces
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow workspaces insert for authenticated users" ON public.workspaces
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow workspaces update for owners/admins" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- WORKSPACE MEMBERS Policies
CREATE POLICY "Allow workspace_members view for workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members AS wm 
      WHERE wm.workspace_id = workspace_members.workspace_id 
      AND wm.profile_id = auth.jwt() ->> 'sub'
      AND wm.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow workspace_members insert for self" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

CREATE POLICY "Allow workspace_members write for owners/admins" ON public.workspace_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members AS wm 
      WHERE wm.workspace_id = workspace_members.workspace_id 
      AND wm.profile_id = auth.jwt() ->> 'sub' 
      AND wm.role IN ('owner', 'admin')
      AND wm.deleted_at IS NULL
    )
  );

-- WORKSPACE INVITATIONS Policies
CREATE POLICY "Allow invitations view for workspace members" ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow invitations write for owners/admins" ON public.workspace_invitations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- ACTIVITY LOGS Policies
CREATE POLICY "Allow activity_logs view for workspace members" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow activity_logs insert for authenticated users" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.jwt() ->> 'sub');

-- ROLES & PERMISSIONS Policies
CREATE POLICY "Allow roles view for members" ON public.roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow roles write for owners/admins" ON public.roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow permissions select for authenticated users" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow role_permissions select for authenticated users" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- CHANNELS Policies
CREATE POLICY "Allow channels view for workspace members" ON public.channels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow channels insert for owners/admins" ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin') 
      AND workspace_members.deleted_at IS NULL
    )
  );

-- PROJECTS Policies
CREATE POLICY "Allow projects view for workspace members" ON public.projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow projects insert for owners/admins" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin') 
      AND workspace_members.deleted_at IS NULL
    )
  );
