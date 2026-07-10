-- Sprint 3.2: Incremental migration — Tasks table, workspace DELETE policy, indexes
-- IMPORTANT: Does NOT recreate existing tables or duplicate existing policies.

-- ============================================
-- 1. Create Tasks Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',       -- backlog, todo, in-progress, in-review, done
  priority TEXT NOT NULL DEFAULT 'medium',   -- low, medium, high, urgent
  assignee_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ
);

-- Enable RLS on tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Tasks: workspace members can view
CREATE POLICY "Allow tasks view for workspace members" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Tasks: workspace members can insert tasks in their workspace
CREATE POLICY "Allow tasks insert for workspace members" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Tasks: assignees or owners/admins/managers can update tasks
CREATE POLICY "Allow tasks update for assignee or managers" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.jwt() ->> 'sub'
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.role IN ('owner', 'admin', 'manager')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Tasks: only owners/admins can delete tasks
CREATE POLICY "Allow tasks delete for owners and admins" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = tasks.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- ============================================
-- 2. Workspace DELETE Policy (owner only)
-- ============================================
CREATE POLICY "Allow workspaces delete for owner only" ON public.workspaces
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.role = 'owner'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- ============================================
-- 3. Performance Indexes (IF NOT EXISTS)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
  ON public.workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_profile_id
  ON public.workspace_members(profile_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_id
  ON public.activity_logs(workspace_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id
  ON public.tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id
  ON public.tasks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id
  ON public.tasks(assignee_id);
