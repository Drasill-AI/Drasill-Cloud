/**
 * Checkout Cancel Page - drasillai.com/checkout/cancel
 * 
 * Shown when user cancels Stripe checkout
 */

import Link from 'next/link'

export default function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-lg text-center">
        <div className="text-yellow-400 text-6xl mb-6">↩</div>
        <h1 className="text-2xl font-bold text-white mb-4">Checkout Cancelled</h1>
        <p className="text-gray-300 mb-8">
          No worries! Your payment was not processed. You can try again whenever you're ready.
        </p>
        
        <div className="space-y-4">
          <Link
            href="/pricing"
            className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Return to Pricing
          </Link>
          
          <Link
            href="/"
            className="block w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Go to Homepage
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <p className="text-gray-400 text-sm">
            Have questions?{' '}
            <a href="mailto:support@drasillai.com" className="text-blue-400 hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
