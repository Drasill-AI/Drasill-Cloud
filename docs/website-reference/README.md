# Drasill Finance Website Reference

Reference implementation for drasillai.com authentication and payment pages.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Auth**: Supabase Auth
- **Payments**: Stripe via Supabase Edge Functions
- **Styling**: Tailwind CSS

## Setup

### 1. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 2. Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://fqjkhutfkizuxhyyziyj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 3. Supabase Configuration

In Supabase Dashboard > Authentication > URL Configuration, add:

```
Site URL: https://drasillai.com

Redirect URLs:
- https://drasillai.com/auth/callback
- https://drasillai.com/signup
- https://drasillai.com/pricing
- drasill://auth-callback (for desktop app)
```

## Pages

| Route | Purpose |
|-------|---------|
| `/signup` | New user registration |
| `/signin` | Web sign-in (for subscription management) |
| `/auth/callback` | Email confirmation handler |
| `/auth/confirmed` | Post-confirmation success page |
| `/pricing` | Subscription pricing & checkout |
| `/checkout/success` | Post-payment success |
| `/checkout/cancel` | Cancelled checkout |

## Flow

### New User Signup
1. User visits `/signup`
2. Fills form, submits
3. Receives confirmation email
4. Clicks link → `/auth/callback`
5. Redirected to `/auth/confirmed`
6. Opens desktop app to sign in

### Subscription Purchase
1. User clicks upgrade in desktop app
2. Opens `/pricing` in browser
3. Clicks "Start Free Trial"
4. Redirected to Stripe Checkout
5. Completes payment
6. Redirected to `/checkout/success`
7. Opens desktop app (subscription active)

## Deep Links

The website uses custom protocol `drasill://` to communicate with the desktop app:

- `drasill://auth-callback` - Open app after email confirmation
- `drasill://subscription-activated` - Open app after subscription

## Edge Functions Used

| Function | Purpose |
|----------|---------|
| `create-checkout` | Creates Stripe Checkout session |
| `subscription-status` | Checks user's subscription status |
| `stripe-webhook` | Handles Stripe events (payment, cancellation) |

## Security Notes

- The website uses the **anon key** (public) for client-side operations
- Edge Functions use **service role key** for admin operations
- All sensitive operations happen server-side in Edge Functions
