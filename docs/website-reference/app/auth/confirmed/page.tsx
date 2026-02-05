/**
 * Email Confirmed Page - drasillai.com/auth/confirmed
 * 
 * Shown after user confirms their email
 */

export default function EmailConfirmedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-lg text-center">
        <div className="text-green-400 text-6xl mb-6">✓</div>
        <h1 className="text-2xl font-bold text-white mb-4">Email Confirmed!</h1>
        <p className="text-gray-300 mb-8">
          Your account is now active. You can sign in using the Drasill Finance desktop app.
        </p>
        
        <div className="space-y-4">
          <a
            href="drasill://auth-callback"
            className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Open Drasill Finance App
          </a>
          
          <p className="text-gray-500 text-sm">
            Don't have the app?{' '}
            <a href="/download" className="text-blue-400 hover:underline">
              Download it here
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
