# Supabase + Stripe Integration Setup Guide

## Overview
This document describes the paywall implementation for Drasill Finance using Supabase for authentication and Stripe for payments.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Electron App                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Renderer Process                │  Main Process                        │
│  ├── AuthScreen.tsx              │  ├── supabase.ts (auth client)       │
│  ├── SubscriptionGate.tsx        │  ├── ipc.ts (auth handlers)          │
│  └── App.tsx (auth flow)         │  └── keychain.ts (session storage)   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Supabase                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Auth (email/password)           │  Database (PostgreSQL)               │
│  ├── Sign up                     │  ├── profiles                        │
│  ├── Sign in                     │  ├── subscriptions                   │
│  └── Session management          │  └── usage                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Edge Functions                                                          │
│  ├── subscription-status   - Check if user has active subscription      │
│  ├── chat                  - AI proxy with subscription check            │
│  ├── stripe-webhook        - Handle Stripe events                        │
│  └── create-checkout       - Create Stripe Checkout sessions             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Stripe                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ├── Products & Prices                                                   │
│  ├── Checkout Sessions (with 14-day trial)                               │
│  ├── Subscriptions                                                       │
│  └── Webhooks → Supabase Edge Function                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Supabase Project Details

- **Project URL**: https://fqjkhutfkizuxhyyziyj.supabase.co
- **Anon Key**: (stored in apps/desktop/main/supabase.ts)

## Database Schema

### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### subscriptions
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  status TEXT NOT NULL, -- 'trialing', 'active', 'canceled', 'past_due'
  price_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### usage
```sql
CREATE TABLE usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens_used INTEGER DEFAULT 0,
  requests_count INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Edge Functions

### Already Deployed (via Dashboard):
1. **subscription-status** - Returns user's subscription status
2. **chat** - AI proxy that checks subscription before proxying to OpenAI
3. **stripe-webhook** - Handles Stripe webhook events

### Need to Deploy:
4. **create-checkout** - Creates Stripe Checkout sessions
   - Code is in: `docs/edge-functions/create-checkout.ts`
   - Deploy via Supabase Dashboard > Edge Functions

## Secrets to Configure

In Supabase Dashboard > Edge Functions > Secrets:
- `OPENAI_API_KEY` - Your OpenAI API key (for AI proxy)
- `STRIPE_SECRET_KEY` - Stripe secret key (sk_live_xxx or sk_test_xxx)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (whsec_xxx)
- `STRIPE_PRICE_ID` - Default price ID for subscriptions

## Stripe Setup

### 1. Create Product & Price
In Stripe Dashboard:
1. Go to Products > Add Product
2. Name: "Drasill Pro"
3. Pricing: $199/month (recurring)
4. Copy the Price ID (price_xxx)

### 2. Configure Webhook
1. Go to Developers > Webhooks
2. Add endpoint: `https://fqjkhutfkizuxhyyziyj.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy webhook signing secret → add to Supabase secrets

### 3. Add Secrets to Supabase
```bash
# In Supabase Dashboard > Edge Functions > Secrets
STRIPE_PRICE_ID=price_xxx
```

## Auth Flow

1. **App Start**: 
   - `initAuthState()` restores session from Windows Credential Manager
   - If session exists, verify with Supabase and check subscription

2. **No User**: Show `AuthScreen` (login/signup)

3. **User without Subscription**: Show `SubscriptionGate` (upgrade prompt)

4. **User with Active Subscription**: Show main app (Layout)

## Testing

### Test Signup Flow
1. Start app: `npm run dev`
2. Create account with test email
3. Check Supabase Auth dashboard for new user

### Test Subscription Flow
1. Sign in with test account
2. Click "Start Free Trial" on SubscriptionGate
3. Complete Stripe Checkout with test card: 4242 4242 4242 4242
4. Webhook should update subscription in Supabase
5. Refresh app - should show main content

### Test Cards (Stripe Test Mode)
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002
- 3D Secure: 4000 0027 6000 3184

## Files Modified/Created

### New Files:
- `apps/desktop/main/supabase.ts` - Supabase client and auth functions
- `apps/desktop/renderer/src/components/AuthScreen.tsx` - Login/signup UI
- `apps/desktop/renderer/src/components/AuthScreen.module.css`
- `apps/desktop/renderer/src/components/SubscriptionGate.tsx` - Upgrade prompt
- `apps/desktop/renderer/src/components/SubscriptionGate.module.css`
- `docs/edge-functions/create-checkout.ts` - Edge function code to deploy

### Modified Files:
- `apps/desktop/main/ipc.ts` - Added auth IPC handlers
- `apps/desktop/preload/index.ts` - Exposed auth APIs
- `apps/desktop/renderer/src/App.tsx` - Auth flow integration
- `apps/desktop/package.json` - Added @supabase/supabase-js

## Next Steps

1. **Deploy create-checkout Edge Function**
   - Go to Supabase Dashboard > Edge Functions
   - Create new function named "create-checkout"
   - Paste code from `docs/edge-functions/create-checkout.ts`

2. **Create Stripe Product & Price**
   - Create product in Stripe Dashboard
   - Add STRIPE_PRICE_ID to Supabase secrets

3. **Configure Auth URLs**
   - In Supabase > Auth > URL Configuration
   - Add redirect URLs for your app

4. **Test End-to-End**
   - Sign up → Subscribe → Use AI features

5. **Production Checklist**
   - Switch Stripe to live mode
   - Update webhook URL for production
   - Update Stripe keys in secrets

## Troubleshooting

### "Unauthorized" errors
- Check session is being stored/restored correctly
- Verify Supabase anon key is correct

### Checkout not working
- Verify create-checkout function is deployed
- Check STRIPE_SECRET_KEY secret is set
- Look at Edge Function logs in Supabase

### Subscription not updating
- Check Stripe webhook is configured correctly
- Verify webhook secret matches
- Look at Edge Function logs for stripe-webhook
