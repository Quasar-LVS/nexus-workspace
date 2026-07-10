-- Create project_columns table
CREATE TABLE IF NOT EXISTS public.project_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0 NOT NULL,
  is_archived BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_columns ENABLE ROW LEVEL SECURITY;

-- Columns policies
CREATE POLICY "Allow select columns for workspace members" ON public.project_columns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      JOIN public.workspace_members ON workspace_members.workspace_id = projects.workspace_id
      WHERE projects.id = project_columns.project_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow write columns for workspace members" ON public.project_columns
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      JOIN public.workspace_members ON workspace_members.workspace_id = projects.workspace_id
      WHERE projects.id = project_columns.project_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Enhance tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS column_id UUID REFERENCES public.project_columns(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reporter_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0 NOT NULL;

-- Create task_comments
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow task_comments select for workspace members" ON public.task_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      JOIN public.workspace_members ON workspace_members.workspace_id = tasks.workspace_id
      WHERE tasks.id = task_comments.task_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow task_comments write for self" ON public.task_comments
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- Create task_attachments
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow task_attachments select for workspace members" ON public.task_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      JOIN public.workspace_members ON workspace_members.workspace_id = tasks.workspace_id
      WHERE tasks.id = task_attachments.task_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow task_attachments write for workspace members" ON public.task_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      JOIN public.workspace_members ON workspace_members.workspace_id = tasks.workspace_id
      WHERE tasks.id = task_attachments.task_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Create task_labels
CREATE TABLE IF NOT EXISTS public.task_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow task_labels select for workspace members" ON public.task_labels
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = task_labels.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow task_labels write for workspace members" ON public.task_labels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = task_labels.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Create task_label_mapping
CREATE TABLE IF NOT EXISTS public.task_label_mapping (
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  label_id UUID REFERENCES public.task_labels(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (task_id, label_id)
);

ALTER TABLE public.task_label_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow task_label_mapping select for workspace members" ON public.task_label_mapping
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      JOIN public.workspace_members ON workspace_members.workspace_id = tasks.workspace_id
      WHERE tasks.id = task_label_mapping.task_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow task_label_mapping write for workspace members" ON public.task_label_mapping
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      JOIN public.workspace_members ON workspace_members.workspace_id = tasks.workspace_id
      WHERE tasks.id = task_label_mapping.task_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );
