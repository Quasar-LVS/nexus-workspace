-- 1. Extend notifications table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- 2. Extend activity_logs table
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- 3. Create Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON public.notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_id ON public.notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_id ON public.activity_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at);

-- 4. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 5. Set RLS Policies
DROP POLICY IF EXISTS "Allow notifications view for owner" ON public.notifications;
CREATE POLICY "Allow notifications view for owner" ON public.notifications
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS "Allow notifications update for owner" ON public.notifications;
CREATE POLICY "Allow notifications update for owner" ON public.notifications
  FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()::text))
  WITH CHECK (profile_id = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS "Allow notifications delete for owner" ON public.notifications;
CREATE POLICY "Allow notifications delete for owner" ON public.notifications
  FOR DELETE TO authenticated
  USING (profile_id = (SELECT auth.uid()::text));

-- Enable Realtime publications safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
    END IF;
  END IF;
END $$;
