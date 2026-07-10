-- Alter public.workspaces to add active AI provider settings column
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'gemini' NOT NULL;
