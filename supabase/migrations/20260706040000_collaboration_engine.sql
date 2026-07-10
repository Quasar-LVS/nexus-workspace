-- 1. Alter public.messages to support reply chains (Slack threads)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.messages(id) ON DELETE CASCADE;

-- 2. Create Message Reactions Table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(message_id, profile_id, emoji)
);

-- 3. Create Pinned Messages Table
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  pinned_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(channel_id, message_id)
);

-- 4. Create Saved Messages Table (Bookmarks)
CREATE TABLE IF NOT EXISTS public.saved_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(profile_id, message_id)
);

-- 5. Create Notifications Table (In-app Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- mention, reply, alert
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  target_url TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 6. Define Row Level Security Policies

-- MESSAGE REACTIONS Policies
CREATE POLICY "Allow select for workspace members" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages 
      JOIN public.channels ON channels.id = messages.channel_id
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE messages.id = message_reactions.message_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow write for self" ON public.message_reactions
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- PINNED MESSAGES Policies
CREATE POLICY "Allow pinned select for workspace members" ON public.pinned_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = (SELECT workspace_id FROM public.channels WHERE id = channel_id)
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow pinned write for workspace members" ON public.pinned_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_members.workspace_id = (SELECT workspace_id FROM public.channels WHERE id = channel_id)
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- SAVED MESSAGES Policies
CREATE POLICY "Allow saved write for owner" ON public.saved_messages
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- NOTIFICATIONS Policies
CREATE POLICY "Allow notifications write for owner" ON public.notifications
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');
