-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'dm', 'group')),
  name TEXT,
  created_by TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select conversations for workspace members" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = conversations.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow insert conversations for workspace members" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = conversations.workspace_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- Create conversation_members mapping table
CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (conversation_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select conversation_members for workspace members" ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      JOIN public.workspace_members ON workspace_members.workspace_id = conversations.workspace_id
      WHERE conversations.id = conversation_members.conversation_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow insert conversation_members for self" ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- Add reference_type and reference_id columns to notifications table if they don't exist
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body TEXT;

-- Alter messages table for direct messages (DMs/groups)
ALTER TABLE public.messages ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

-- Add policy on messages to allow select for conversation members
CREATE POLICY "Allow select messages for conversation members" ON public.messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IS NULL OR EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_members.conversation_id = messages.conversation_id
      AND conversation_members.profile_id = auth.jwt() ->> 'sub'
    )
  );

-- Add policy on messages to allow insert for conversation members
CREATE POLICY "Allow insert messages for conversation members" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    conversation_id IS NULL OR (
      profile_id = auth.jwt() ->> 'sub'
      AND EXISTS (
        SELECT 1 FROM public.conversation_members
        WHERE conversation_members.conversation_id = messages.conversation_id
        AND conversation_members.profile_id = auth.jwt() ->> 'sub'
      )
    )
  );

-- Create typing_indicators table
CREATE TABLE IF NOT EXISTS public.typing_indicators (
  conversation_id UUID NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (conversation_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow typing indicators select for workspace members" ON public.typing_indicators
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow typing indicators write for self" ON public.typing_indicators
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- Alter message_reads table to support tracking DM/group conversation read markers
ALTER TABLE public.message_reads ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE public.message_reads ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.message_reads DROP CONSTRAINT IF EXISTS message_reads_channel_id_profile_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_reads_channel_profile_idx ON public.message_reads (channel_id, profile_id) WHERE channel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS message_reads_conversation_profile_idx ON public.message_reads (conversation_id, profile_id) WHERE conversation_id IS NOT NULL;

