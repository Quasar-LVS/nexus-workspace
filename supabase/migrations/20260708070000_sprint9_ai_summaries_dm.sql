-- Add conversation_id to ai_summaries table for direct message summaries caching
ALTER TABLE public.ai_summaries ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;
