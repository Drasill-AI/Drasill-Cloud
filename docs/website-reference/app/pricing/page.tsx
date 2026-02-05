/**
 * Pricing Page - drasillai.com/pricing
 * 
 * Displays pricing and initiates Stripe Checkout
 */

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

const features = [
  'Unlimited AI chat & document analysis',
  'RAG-powered knowledge base search',
  'Deal pipeline management',
  'OneDrive & SharePoint integration',
  'Financial Q&A with sources & citations',
  'Priority support',
]

export default function PricingPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    // Check if user is already signed in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setCheckingAuth(false)
    }
    checkUser()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleCheckout = async () => {
    if (!user) {
      // Redirect to signup if not logged in
      window.location.href = '/signup?redirect=/pricing'
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Get the access token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No session found')
      }

      // Call the create-checkout edge function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout/cancel`,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 py-16 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Unlock AI-Powered Deal Intelligence
          </h1>
          <p className="text-xl text-gray-400">
            Everything you need to analyze deals faster and smarter
          </p>
        </div>

        {/* Pricing Card */}
        <div className="max-w-md mx-auto bg-gray-800 rounded-2xl p-8 border border-gray-700">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Pro Plan</h2>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-5xl font-bold text-white">$99</span>
              <span className="text-gray-400">/user/month</span>
            </div>
            <p className="text-green-400 mt-2">14-day free trial included</p>
          </div>

          {/* Features */}
          <ul className="space-y-4 mb-8">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-gray-300">{feature}</span>
              </li>
            ))}
          </ul>

          {/* CTA Button */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-lg"
          >
            {loading ? 'Processing...' : user ? 'Start Free Trial' : 'Sign Up to Start Trial'}
          </button>

          {user && (
            <p className="text-center text-gray-500 text-sm mt-4">
              Signed in as {user.email}
            </p>
          )}

          <p className="text-center text-gray-500 text-sm mt-4">
            Cancel anytime. No questions asked.
          </p>
        </div>

        {/* FAQ or additional info */}
        <div className="mt-16 text-center">
          <p className="text-gray-400">
            Questions? Contact us at{' '}
            <a href="mailto:support@drasillai.com" className="text-blue-400 hover:underline">
              support@drasillai.com
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
