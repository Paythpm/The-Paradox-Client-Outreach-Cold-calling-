-- ═══════════════════════════════════════════════════════════════════
-- DentIQ Cold Caller Platform — Complete Database Schema
-- Run this entire file in: Supabase Dashboard > SQL Editor > New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── ENUMS ───────────────────────────────────────────────────────────

CREATE TYPE call_status AS ENUM (
  'not_called',
  'calling',
  'no_answer',
  'callback_requested',
  'interested',
  'meeting_booked',
  'not_interested',
  'wrong_number',
  'do_not_call'
);

CREATE TYPE meeting_channel AS ENUM ('sms', 'whatsapp', 'email');

CREATE TYPE meeting_status AS ENUM (
  'pending_confirmation',
  'confirmed',
  'rescheduled',
  'no_show',
  'completed',
  'cancelled'
);

CREATE TYPE call_outcome AS ENUM (
  'answered_interested',
  'answered_not_interested',
  'answered_callback',
  'no_answer',
  'voicemail_left',
  'wrong_number',
  'busy'
);

-- ── TABLE: callers ───────────────────────────────────────────────────

CREATE TABLE callers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  assigned_countries TEXT[] DEFAULT ARRAY['AU','CA','UK','US'],
  daily_call_target INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: businesses ────────────────────────────────────────────────

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identity
  business_name TEXT NOT NULL,
  category TEXT,
  city TEXT,
  country_code TEXT NOT NULL DEFAULT 'AU',

  -- Contact
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  website TEXT,

  -- Social
  instagram TEXT,
  linkedin TEXT,
  facebook TEXT,
  twitter TEXT,

  -- Location
  address TEXT,
  google_maps_url TEXT,

  -- Review data
  rating NUMERIC(3,2),
  reviews INTEGER,
  notes TEXT,

  -- Pain point data (from DentIQ analysis)
  pain_points JSONB DEFAULT '[]',
  top_pain_point TEXT,
  negative_pct NUMERIC(5,2),
  health_score INTEGER,
  industry_avg_rating NUMERIC(3,2),

  -- Call management
  call_status call_status DEFAULT 'not_called',
  assigned_to UUID REFERENCES callers(id),
  last_called_at TIMESTAMPTZ,
  call_count INTEGER DEFAULT 0,
  locked_by UUID REFERENCES callers(id),
  locked_at TIMESTAMPTZ,

  -- Data freshness
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  data_source TEXT DEFAULT 'manual_import',
  is_duplicate BOOLEAN DEFAULT false,
  do_not_call BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: call_logs ─────────────────────────────────────────────────

CREATE TABLE call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES callers(id),

  -- Twilio data
  twilio_call_sid TEXT UNIQUE,
  twilio_recording_url TEXT,
  twilio_recording_sid TEXT,
  duration_seconds INTEGER DEFAULT 0,
  call_direction TEXT DEFAULT 'outbound',

  -- Call details
  outcome call_outcome,
  notes TEXT,
  ai_script_used JSONB,
  ai_script_rating INTEGER,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: groq_keys ─────────────────────────────────────────────────

CREATE TABLE groq_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key TEXT NOT NULL UNIQUE,
  account_email TEXT NOT NULL,
  display_label TEXT,

  -- Usage tracking
  calls_today INTEGER DEFAULT 0,
  tokens_today INTEGER DEFAULT 0,
  daily_call_limit INTEGER DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Health
  is_active BOOLEAN DEFAULT true,
  is_cooling BOOLEAN DEFAULT false,
  cooling_until TIMESTAMPTZ,
  consecutive_errors INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: ai_scripts ────────────────────────────────────────────────

CREATE TABLE ai_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Generated content
  opening_line TEXT NOT NULL,
  talking_points JSONB NOT NULL DEFAULT '[]',
  objection_handlers JSONB NOT NULL DEFAULT '{}',
  qa_facts JSONB NOT NULL DEFAULT '[]',
  suggested_close TEXT,

  -- Metadata
  model_used TEXT DEFAULT 'llama-3.3-70b-versatile',
  groq_key_id UUID REFERENCES groq_keys(id),
  prompt_version TEXT DEFAULT 'v1',
  tokens_used INTEGER,
  generation_ms INTEGER,

  -- Quality
  avg_rating NUMERIC(3,2),
  rating_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: meetings ──────────────────────────────────────────────────

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_log_id UUID REFERENCES call_logs(id),
  booked_by UUID NOT NULL REFERENCES callers(id),

  -- Meeting details
  scheduled_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  duration_minutes INTEGER DEFAULT 15,
  topic TEXT,
  meeting_link TEXT,

  -- Status
  status meeting_status DEFAULT 'pending_confirmation',
  channel meeting_channel DEFAULT 'sms',

  -- Confirmation tracking
  confirmation_sent_at TIMESTAMPTZ,
  confirmation_message_sid TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_via TEXT,

  -- Reminders
  reminder_24h_sent_at TIMESTAMPTZ,
  reminder_1h_sent_at TIMESTAMPTZ,
  reschedule_offer_sent_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE: do_not_call_list ──────────────────────────────────────────

CREATE TABLE do_not_call_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  business_name TEXT,
  reason TEXT,
  added_by UUID REFERENCES callers(id),
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ──────────────────────────────────────────────────────────

CREATE INDEX idx_businesses_call_status ON businesses(call_status);
CREATE INDEX idx_businesses_country ON businesses(country_code);
CREATE INDEX idx_businesses_category ON businesses(category);
CREATE INDEX idx_businesses_assigned_to ON businesses(assigned_to);
CREATE INDEX idx_businesses_phone ON businesses(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_businesses_health_score ON businesses(health_score);
CREATE INDEX idx_call_logs_business ON call_logs(business_id);
CREATE INDEX idx_call_logs_caller ON call_logs(caller_id);
CREATE INDEX idx_call_logs_started_at ON call_logs(started_at DESC);
CREATE INDEX idx_ai_scripts_business ON ai_scripts(business_id) WHERE is_active = true;
CREATE INDEX idx_meetings_scheduled ON meetings(scheduled_at);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_groq_keys_active ON groq_keys(is_active, is_cooling, last_used_at);

-- ── AUTO-UPDATE updated_at ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_callers_updated BEFORE UPDATE ON callers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_groq_keys_updated BEFORE UPDATE ON groq_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_scripts_updated BEFORE UPDATE ON ai_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── AUTH: auto-create caller on first login ───────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.callers (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── DNC helper function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_do_not_call(phone_number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM do_not_call_list WHERE phone = phone_number
  ) OR EXISTS (
    SELECT 1 FROM businesses
    WHERE phone = phone_number AND do_not_call = true
  );
END;
$$ LANGUAGE plpgsql;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────────

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE groq_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE callers ENABLE ROW LEVEL SECURITY;

-- Businesses: authenticated can read and update
CREATE POLICY "Authenticated can read businesses"
  ON businesses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update businesses"
  ON businesses FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert businesses"
  ON businesses FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Call logs: authenticated can read/insert/update
CREATE POLICY "Authenticated can read call_logs"
  ON call_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert call_logs"
  ON call_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update own call_logs"
  ON call_logs FOR UPDATE USING (auth.role() = 'authenticated');

-- AI scripts: readable by all authenticated
CREATE POLICY "Authenticated can read ai_scripts"
  ON ai_scripts FOR SELECT USING (auth.role() = 'authenticated');

-- Meetings: authenticated can read/insert/update
CREATE POLICY "Authenticated can read meetings"
  ON meetings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert meetings"
  ON meetings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can update meetings"
  ON meetings FOR UPDATE USING (auth.role() = 'authenticated');

-- Groq keys: service role only (never expose to browser)
CREATE POLICY "Service role only for groq_keys"
  ON groq_keys FOR ALL USING (auth.role() = 'service_role');

-- Callers: authenticated can read all, update own
CREATE POLICY "Authenticated can read callers"
  ON callers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Callers can update own record"
  ON callers FOR UPDATE USING (auth.uid() = id);
