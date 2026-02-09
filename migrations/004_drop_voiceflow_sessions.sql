-- Migration 004: Drop the user_voiceflow_sessions table
-- Voiceflow has been fully removed from the project.

DROP TABLE IF EXISTS public.user_voiceflow_sessions;
