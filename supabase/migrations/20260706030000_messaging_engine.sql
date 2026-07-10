-- 1. Create Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

-- 2. Create Message Edits History Table
CREATE TABLE IF NOT EXISTS public.message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create Message Attachments Table
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create Message Read Markers Table
CREATE TABLE IF NOT EXISTS public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  profile_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  last_read_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(channel_id, profile_id)
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- 5. Define Row Level Security Policies

-- MESSAGES Policies
CREATE POLICY "Allow select for workspace members" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channels 
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE channels.id = messages.channel_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Allow insert for channel members" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.jwt() ->> 'sub'
    AND EXISTS (
      SELECT 1 FROM public.channel_members 
      WHERE channel_members.channel_id = messages.channel_id 
      AND channel_members.profile_id = auth.jwt() ->> 'sub'
    )
  );

CREATE POLICY "Allow update/delete for author" ON public.messages
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');

-- MESSAGE EDITS Policies
CREATE POLICY "Allow edit history view for workspace members" ON public.message_edits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages 
      JOIN public.channels ON channels.id = messages.channel_id
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE messages.id = message_edits.message_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- MESSAGE ATTACHMENTS Policies
CREATE POLICY "Allow attachments select for workspace members" ON public.message_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages 
      JOIN public.channels ON channels.id = messages.channel_id
      JOIN public.workspace_members ON workspace_members.workspace_id = channels.workspace_id
      WHERE messages.id = message_attachments.message_id
      AND workspace_members.profile_id = auth.jwt() ->> 'sub'
      AND workspace_members.deleted_at IS NULL
    )
  );

-- MESSAGE READS Policies
CREATE POLICY "Allow message_reads write for owners" ON public.message_reads
  FOR ALL TO authenticated
  USING (profile_id = auth.jwt() ->> 'sub')
  WITH CHECK (profile_id = auth.jwt() ->> 'sub');
