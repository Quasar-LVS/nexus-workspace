-- Fix shadowing bugs in RLS policies by explicitly qualifying column names

-- 1. Roles table
DROP POLICY IF EXISTS "Allow roles write for owners/admins" ON public.roles;
CREATE POLICY "Allow roles write for owners/admins" ON public.roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = roles.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- 2. Channels table
DROP POLICY IF EXISTS "Allow channels view for workspace members" ON public.channels;
CREATE POLICY "Allow channels view for workspace members" ON public.channels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = channels.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Allow channels insert for owners/admins" ON public.channels;
CREATE POLICY "Allow channels insert for owners/admins" ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = channels.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin') 
      AND workspace_members.deleted_at IS NULL
    )
  );

-- 3. Projects table
DROP POLICY IF EXISTS "Allow projects view for workspace members" ON public.projects;
CREATE POLICY "Allow projects view for workspace members" ON public.projects
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = projects.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Allow projects insert for owners/admins" ON public.projects;
CREATE POLICY "Allow projects insert for owners/admins" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = projects.workspace_id 
      AND workspace_members.profile_id = auth.jwt() ->> 'sub' 
      AND workspace_members.role IN ('owner', 'admin') 
      AND workspace_members.deleted_at IS NULL
    )
  );

-- 4. Channel Members table
-- Add a policy to allow owners/admins to insert into channel_members for any channel (public or private) in their workspace
DROP POLICY IF EXISTS "Allow channel_members insert for owners/admins" ON public.channel_members;
CREATE POLICY "Allow channel_members insert for owners/admins" ON public.channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE channels.id = channel_members.channel_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );
