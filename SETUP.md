# DentIQ Platform — Setup Guide

## Step 1 — Run Database Schema in Supabase

1. Go to: supabase.com → your project → SQL Editor → New Query
2. Paste contents of `supabase/schema.sql` and run it
3. Then paste contents of `supabase/groq_helpers.sql` and run it
4. Enable extensions: Dashboard → Database → Extensions → enable `pg_cron` and `pg_net`

## Step 2 — Fill in .env.local

Edit `dentiq-src/.env.local`:

```
REACT_APP_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
REACT_APP_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
REACT_APP_TWILIO_NUMBER_AU=+19124201502
```

Get these from: Supabase Dashboard → Settings → API

## Step 3 — Seed Groq Keys

1. Copy `scripts/groq_keys.json.example` → `scripts/groq_keys.json`
2. Fill in your 9-10 real Groq API keys
3. Run: `node scripts/seedGroqKeys.js`

## Step 4 — Deploy Supabase Edge Functions

Install Supabase CLI first: https://supabase.com/docs/guides/cli

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID

# Deploy all functions
supabase functions deploy groq-key-manager --no-verify-jwt
supabase functions deploy generate-script --no-verify-jwt
supabase functions deploy twilio-voice --no-verify-jwt
supabase functions deploy twilio-access-token --no-verify-jwt
supabase functions deploy twilio-status-callback --no-verify-jwt
supabase functions deploy send-meeting-confirmation --no-verify-jwt
supabase functions deploy twilio-message-webhook --no-verify-jwt
supabase functions deploy send-reminders --no-verify-jwt
```

## Step 5 — Set Edge Function Secrets

```bash
supabase secrets set \
  TWILIO_ACCOUNT_SID=AC55ea45eb2e9c6cd466fe2cff7ae7edfc \
  TWILIO_AUTH_TOKEN=your_auth_token \
  TWILIO_API_KEY_SID=SKxxxxxxx \
  TWILIO_API_KEY_SECRET=xxxxxxx \
  TWILIO_TWIML_APP_SID=APxxxxxxx \
  TWILIO_NUMBER_AU=+19124201502 \
  TWILIO_NUMBER_CA=+1xxxxxxxxxx \
  TWILIO_NUMBER_UK=+44xxxxxxxxx \
  TWILIO_WHATSAPP_NUMBER=+14155238886 \
  SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Step 6 — Set up Cron Jobs (after pg_cron is enabled)

Run this in Supabase SQL Editor (replace the placeholders):

```sql
SELECT cron.schedule(
  'send-meeting-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('source', 'cron')
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'reset-groq-key-usage',
  '0 0 * * *',
  $$
  UPDATE groq_keys
  SET calls_today = 0, tokens_today = 0, is_cooling = false,
      cooling_until = NULL, last_reset_at = NOW()
  WHERE last_reset_at < NOW() - INTERVAL '24 hours';
  $$
);
```

## Step 7 — Set up Twilio TwiML App

1. Go to: Twilio Console → Voice → TwiML Apps → Create
2. Name: "DentIQ Dialer"
3. Voice Request URL: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/twilio-voice`
4. Copy the TwiML App SID (starts with AP) → add to Step 5 secrets

## Step 8 — Build and Run

```bash
cd dentiq-src
npm run build
npx serve build -p 3000
```

Or for team deployment, push to GitHub and connect to Netlify/Vercel.
Set all `REACT_APP_*` env vars in the Netlify/Vercel dashboard.

## What the app does in each mode

**CSV Mode (no Supabase keys):** Works exactly like before — upload CSV, analyze reviews, view per-business breakdown. No auth required.

**Platform Mode (Supabase configured):** Full CRM — login, import leads from Excel, AI scripts via Groq, click-to-call via Twilio, meeting scheduling with SMS confirmation, real-time status updates, analytics dashboard.
