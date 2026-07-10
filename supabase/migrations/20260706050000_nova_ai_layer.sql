-- 1. Create AI Summaries Table
CREATE TABLE IF NOT EXISTS public.ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL, -- channel_catch_up, thread_summary
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create AI Insights Table
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  insight_type TEXT NOT NULL, -- productivity, sentiment, general
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create AI Action Suggestions Table (Approval Cards)
CREATE TABLE IF NOT EXISTS public.ai_action_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  suggested_title TEXT NOT NULL,
  suggested_description TEXT NOT NULL,
  assignee_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' NOT NULL, -- pending, approved, rejected
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create Conversation Snapshots Table
CREATE TABLE IF NOT EXISTS public.conversation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  message_ids UUID[] NOT NULL,
  snapshot_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_snapshots ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- AI SUMMARIES Policies
CREATE POLICY "Allow view for workspace members" ON public.ai_summaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = ai_summaries.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- AI INSIGHTS Policies
CREATE POLICY "Allow insights view for workspace members" ON public.ai_insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = ai_insights.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- AI ACTION SUGGESTIONS Policies
CREATE POLICY "Allow suggestions view for workspace members" ON public.ai_action_suggestions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = ai_action_suggestions.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow update suggestions for workspace members" ON public.ai_action_suggestions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = ai_action_suggestions.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = ai_action_suggestions.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- CONVERSATION SNAPSHOTS Policies
CREATE POLICY "Allow snapshots view for workspace members" ON public.conversation_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE channels.id = conversation_snapshots.channel_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );
