-- 1. Create attachments Table
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  uploader_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  bucket TEXT NOT NULL DEFAULT 'workspace-files',
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT NOT NULL,
  entity_type TEXT NOT NULL, -- 'channel', 'dm', 'task', 'project', 'message'
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_attachments_workspace_id ON public.attachments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity_type_id ON public.attachments(entity_type, entity_id);

-- 3. Enable RLS
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- 4. Setup Row Level Security Policies
DROP POLICY IF EXISTS "Allow select for workspace members on attachments" ON public.attachments;
CREATE POLICY "Allow select for workspace members on attachments" ON public.attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = attachments.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Allow insert for workspace members on attachments" ON public.attachments;
CREATE POLICY "Allow insert for workspace members on attachments" ON public.attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = attachments.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Allow delete for uploader or workspace admin on attachments" ON public.attachments;
CREATE POLICY "Allow delete for uploader or workspace admin on attachments" ON public.attachments
  FOR DELETE TO authenticated
  USING (
    uploader_id = auth.jwt() ->> 'sub'
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = attachments.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.role IN ('owner', 'admin')
      AND workspace_members.deleted_at IS NULL
    )
  );

-- 5. Programmatically verify and create 'workspace-files' private bucket
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('workspace-files', 'workspace-files', false, 52428800, NULL) -- 50MB limit
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 6. Add attachments table to supabase_realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'attachments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
    END IF;
  END IF;
END $$;
