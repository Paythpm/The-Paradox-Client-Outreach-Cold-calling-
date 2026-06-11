-- Run this in Supabase SQL Editor after schema.sql

-- Increment Groq key usage atomically
CREATE OR REPLACE FUNCTION increment_groq_usage(p_key_id UUID, p_tokens INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE groq_keys
  SET calls_today = calls_today + 1,
      tokens_today = tokens_today + p_tokens,
      last_used_at = NOW(),
      consecutive_errors = 0
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment errors and deactivate if threshold reached
CREATE OR REPLACE FUNCTION increment_groq_errors(p_key_id UUID, p_threshold INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE groq_keys
  SET consecutive_errors = consecutive_errors + 1,
      is_active = CASE WHEN consecutive_errors + 1 >= p_threshold THEN false ELSE is_active END
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- pg_cron: send reminders every 15 minutes
-- Run this AFTER enabling pg_cron and pg_net extensions in Supabase Dashboard > Extensions
-- Replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY with actual values

/*
SELECT cron.schedule(
  'send-meeting-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);

-- Daily Groq key usage reset
SELECT cron.schedule(
  'reset-groq-key-usage',
  '0 0 * * *',
  $$
  UPDATE groq_keys
  SET calls_today = 0,
      tokens_today = 0,
      is_cooling = false,
      cooling_until = NULL,
      last_reset_at = NOW()
  WHERE last_reset_at < NOW() - INTERVAL '24 hours';
  $$
);
*/
