-- 1. Alter typing_indicators table to support channel-scoped typing indicators

ALTER TABLE public.typing_indicators DROP CONSTRAINT IF EXISTS typing_indicators_pkey;

-- Add surrogate UUID primary key if not exists
ALTER TABLE public.typing_indicators ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();

-- Make conversation_id nullable to allow channel-scoped typing indicators
ALTER TABLE public.typing_indicators ALTER COLUMN conversation_id DROP NOT NULL;

-- Add channel_id column linked to channels table
ALTER TABLE public.typing_indicators ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE;

-- Create unique index constraints to prevent duplicate typing entries for a profile
CREATE UNIQUE INDEX IF NOT EXISTS typing_indicators_conv_profile_idx ON public.typing_indicators (conversation_id, profile_id) WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS typing_indicators_chan_profile_idx ON public.typing_indicators (channel_id, profile_id) WHERE channel_id IS NOT NULL;


-- 2. Add collaboration tables to supabase_realtime publication idempotently

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  -- Add public.notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  -- Add public.activity_logs
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;

  -- Add public.typing_indicators
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'typing_indicators'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
  END IF;

  -- Add public.message_reads
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
  END IF;

  -- Add public.messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
