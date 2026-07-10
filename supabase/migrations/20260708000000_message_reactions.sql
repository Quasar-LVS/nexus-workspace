-- Add parent_message_id to messages if it doesn't exist
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE;

-- Create Message Reactions Table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(message_id, profile_id, emoji)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- 1. Select Policy: Allow workspace members to view reactions for messages they can view
CREATE POLICY "Allow reactions select for workspace members" ON public.message_reactions
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

-- 2. Insert Policy: Allow channel members to add reactions
CREATE POLICY "Allow reactions insert for channel members" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.jwt() ->> 'sub'
    AND EXISTS (
      SELECT 1 FROM public.messages
      JOIN public.channel_members ON channel_members.channel_id = messages.channel_id
      WHERE messages.id = message_reactions.message_id
      AND channel_members.profile_id = auth.jwt() ->> 'sub'
    )
  );

-- 3. Delete Policy: Allow users to remove their own reactions
CREATE POLICY "Allow reactions delete for self" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub');
