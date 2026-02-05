/**
 * Supabase Edge Function: stripe-webhook
 * Handles Stripe webhook events to sync subscription status
 * 
 * Deploy to Supabase:
 * 1. Go to Supabase Dashboard > Edge Functions
 * 2. Create new function named "stripe-webhook"
 * 3. IMPORTANT: Disable "Enforce JWT Verification" (webhooks don't have JWT)
 * 4. Paste this code
 * 5. Add secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
 * 
 * Configure in Stripe:
 * 1. Go to Stripe Dashboard > Developers > Webhooks
 * 2. Add endpoint: https://fqjkhutfkizuxhyyziyj.supabase.co/functions/v1/stripe-webhook
 * 3. Select events: customer.subscription.created, customer.subscription.updated, 
 *    customer.subscription.deleted, checkout.session.completed
 * 4. Copy the signing secret to STRIPE_WEBHOOK_SECRET in Supabase
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@13.10.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!signature || !webhookSecret) {
    console.error('Missing signature or webhook secret')
    return new Response('Missing signature', { status: 400 })
  }

  try {
    const body = await req.text()
    
    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    
    console.log('Received event:', event.type)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout completed:', session.id)
        
        // Get the subscription details
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
          await updateSubscriptionStatus(subscription)
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription update:', subscription.id, subscription.status)
        await updateSubscriptionStatus(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription deleted:', subscription.id)
        await cancelSubscription(subscription)
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function updateSubscriptionStatus(subscription: Stripe.Subscription) {
  // Get user ID from subscription metadata or customer
  let userId = subscription.metadata?.supabase_user_id

  if (!userId) {
    // Try to find user by customer ID
    const customerId = subscription.customer as string
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single()

    if (profile) {
      userId = profile.id
    }
  }

  if (!userId) {
    console.error('Could not find user for subscription:', subscription.id)
    return
  }

  // Map Stripe status to our status
  const status = mapSubscriptionStatus(subscription.status)
  const endDate = new Date(subscription.current_period_end * 1000).toISOString()

  console.log(`Updating user ${userId}: status=${status}, end=${endDate}`)

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: status,
      subscription_end: endDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    console.error('Error updating profile:', error)
  } else {
    console.log('Successfully updated subscription status')
  }
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!profile) {
    console.error('Could not find user for cancelled subscription')
    return
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)

  if (error) {
    console.error('Error canceling subscription:', error)
  }
}

function mapSubscriptionStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
      return 'canceled'
    default:
      return stripeStatus
  }
}
