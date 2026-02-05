/**
 * Checkout Success Page - drasillai.com/checkout/success
 * 
 * Shown after successful Stripe payment
 */

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function CheckoutSuccessPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || null)
    }
    getUser()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-lg text-center">
        <div className="text-green-400 text-6xl mb-6">🎉</div>
        <h1 className="text-2xl font-bold text-white mb-4">Welcome to Drasill Pro!</h1>
        <p className="text-gray-300 mb-2">
          Your subscription is now active.
        </p>
        {userEmail && (
          <p className="text-gray-400 text-sm mb-8">
            Account: {userEmail}
          </p>
        )}
        
        <div className="space-y-4">
          <a
            href="drasill://subscription-activated"
            className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Open Drasill Finance App
          </a>
          
          <p className="text-gray-500 text-sm">
            Your 14-day free trial has started. You won't be charged until the trial ends.
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <h3 className="text-white font-medium mb-3">What's Next?</h3>
          <ul className="text-gray-400 text-sm space-y-2 text-left">
            <li>✓ Sign in to the desktop app with your email</li>
            <li>✓ Connect your OneDrive/SharePoint</li>
            <li>✓ Start asking questions about your deals</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
