/**
 * Auth Callback - drasillai.com/auth/callback
 * 
 * Handles email confirmation redirects from Supabase
 * This is a Next.js API route (App Router)
 */

import { createServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/'

  if (code) {
    const supabase = createServerClient()
    
    // Exchange the code for a session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successfully confirmed - redirect to success page
      return NextResponse.redirect(new URL('/auth/confirmed', request.url))
    }
  }

  // If there's an error or no code, redirect to error page
  return NextResponse.redirect(new URL('/auth/error', request.url))
}
