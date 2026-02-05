/**
 * Supabase Authentication and API Client
 * Handles user authentication, subscription verification, and AI proxy
 */

import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import * as keytar from 'keytar';

const SUPABASE_URL = 'https://fqjkhutfkizuxhyyziyj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxamtodXRma2l6dXhoeXl6aXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMTA0MjYsImV4cCI6MjA4NDY4NjQyNn0.jyzI-YpvVxycFcnzmhSsso_wzG6TQqOp7tyzrEPJc-0';

const SERVICE_NAME = 'DrasillCloud';
const SUPABASE_SESSION_KEY = 'supabase-session';

let supabase: SupabaseClient;

/**
 * Initialize Supabase client
 */
export function initSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false, // We handle persistence ourselves via keytar
      },
    });
  }
  return supabase;
}

/**
 * Get the Supabase client instance
 */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    return initSupabase();
  }
  return supabase;
}

/**
 * Save session to secure storage
 */
async function saveSession(session: Session | null): Promise<void> {
  if (session) {
    await keytar.setPassword(SERVICE_NAME, SUPABASE_SESSION_KEY, JSON.stringify(session));
  } else {
    await keytar.deletePassword(SERVICE_NAME, SUPABASE_SESSION_KEY);
  }
}

/**
 * Load session from secure storage
 */
async function loadSession(): Promise<Session | null> {
  try {
    const sessionStr = await keytar.getPassword(SERVICE_NAME, SUPABASE_SESSION_KEY);
    if (sessionStr) {
      const session = JSON.parse(sessionStr) as Session;
      return session;
    }
  } catch (error) {
    console.error('[Supabase] Error loading session:', error);
  }
  return null;
}

/**
 * Initialize auth state from stored session
 */
export async function initAuthState(): Promise<{ user: any; session: Session } | null> {
  const client = getSupabase();
  
  // Try to load stored session
  const storedSession = await loadSession();
  
  if (storedSession) {
    // Set the session in Supabase client
    const { data, error } = await client.auth.setSession({
      access_token: storedSession.access_token,
      refresh_token: storedSession.refresh_token,
    });
    
    if (error) {
      console.error('[Supabase] Session restoration failed:', error);
      await saveSession(null);
      return null;
    }
    
    if (data.session) {
      await saveSession(data.session);
      console.log('[Supabase] Session restored for:', data.user?.email);
      return { user: data.user, session: data.session };
    }
  }
  
  return null;
}

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, fullName?: string): Promise<{ success: boolean; error?: string; user?: any }> {
  const client = getSupabase();
  
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  
  if (error) {
    console.error('[Supabase] Sign up error:', error);
    return { success: false, error: error.message };
  }
  
  if (data.session) {
    await saveSession(data.session);
  }
  
  console.log('[Supabase] Sign up successful:', data.user?.email);
  return { success: true, user: data.user };
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string; user?: any; session?: Session }> {
  const client = getSupabase();
  
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  
  if (error) {
    console.error('[Supabase] Sign in error:', error);
    return { success: false, error: error.message };
  }
  
  if (data.session) {
    await saveSession(data.session);
  }
  
  console.log('[Supabase] Sign in successful:', data.user?.email);
  return { success: true, user: data.user, session: data.session };
}

/**
 * Sign out
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase();
  
  const { error } = await client.auth.signOut();
  
  if (error) {
    console.error('[Supabase] Sign out error:', error);
    return { success: false, error: error.message };
  }
  
  await saveSession(null);
  console.log('[Supabase] Sign out successful');
  return { success: true };
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
  const client = getSupabase();
  
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://drasillai.com/auth/reset-callback',
  });
  
  if (error) {
    console.error('[Supabase] Password reset error:', error);
    return { success: false, error: error.message };
  }
  
  console.log('[Supabase] Password reset email sent to:', email);
  return { success: true };
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<{ user: any; session: Session } | null> {
  const client = getSupabase();
  
  const { data: { user } } = await client.auth.getUser();
  const session = await getSession();
  
  if (user && session) {
    return { user, session };
  }
  
  return null;
}

/**
 * Get current session - fetches fresh session from Supabase client
 */
export async function getSession(): Promise<Session | null> {
  const client = getSupabase();
  const { data: { session }, error } = await client.auth.getSession();
  
  if (error) {
    console.error('[Supabase] getSession error:', error);
  }
  
  console.log('[Supabase] getSession result:', session ? `user=${session.user?.email}` : 'null');
  
  if (session) {
    // Save refreshed session to storage
    await saveSession(session);
  }
  
  return session;
}

/**
 * Check subscription status
 */
export async function checkSubscription(): Promise<{
  hasActiveSubscription: boolean;
  subscription: any | null;
  error?: string;
}> {
  const session = await getSession();
  
  if (!session) {
    return { hasActiveSubscription: false, subscription: null, error: 'Not authenticated' };
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/subscription-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { hasActiveSubscription: false, subscription: null, error: error.error || 'Failed to check subscription' };
    }
    
    const data = await response.json();
    return {
      hasActiveSubscription: data.hasActiveSubscription,
      subscription: data.subscription,
    };
  } catch (error) {
    console.error('[Supabase] Subscription check error:', error);
    return { hasActiveSubscription: false, subscription: null, error: 'Network error' };
  }
}

/**
 * Proxy chat request through Supabase Edge Function
 * This uses OUR OpenAI key, not the user's
 */
export async function proxyChatRequest(
  messages: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }>,
  options: {
    model?: string;
    tools?: any[];
    tool_choice?: string | { type: string; function?: { name: string } };
    temperature?: number;
    max_tokens?: number;
  } = {},
  onChunk?: (chunk: string) => void,
  signal?: AbortSignal
): Promise<{ 
  success: boolean; 
  content?: string; 
  tool_calls?: any[];
  error?: string;
  finish_reason?: string;
}> {
  const session = await getSession();
  
  if (!session) {
    return { success: false, error: 'Not authenticated' };
  }
  
  try {
    console.log('[Supabase] Calling chat proxy...');
    const response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        messages, 
        model: options.model || 'gpt-4o-mini',
        tools: options.tools,
        tool_choice: options.tool_choice,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
      }),
      signal,
    });
    
    console.log('[Supabase] Chat proxy response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Supabase] Chat proxy error response:', errorText);
      try {
        const error = JSON.parse(errorText);
        return { success: false, error: error.error || `Chat request failed (${response.status})` };
      } catch {
        return { success: false, error: errorText || `Chat request failed (${response.status})` };
      }
    }
    
    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let toolCalls: any[] = [];
    let finishReason = '';
    
    if (reader) {
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              
              if (choice) {
                // Handle content delta
                const content = choice.delta?.content || '';
                if (content) {
                  fullContent += content;
                  if (onChunk) {
                    onChunk(content);
                  }
                }
                
                // Handle tool calls delta
                if (choice.delta?.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    const idx = tc.index;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = {
                        id: tc.id || '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      };
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
                
                // Handle finish reason
                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    }
    
    return { 
      success: true, 
      content: fullContent || undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      finish_reason: finishReason || undefined,
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { success: false, error: 'Request cancelled' };
    }
    console.error('[Supabase] Chat proxy error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Get Stripe checkout URL for subscription
 */
export async function createCheckoutSession(): Promise<{ url: string | null; error?: string }> {
  const session = await getSession();
  
  if (!session) {
    console.error('[Supabase] No session for checkout');
    return { url: null, error: 'Not authenticated' };
  }

  try {
    console.log('[Supabase] Creating checkout session...');
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({}),
    });

    const responseText = await response.text();
    console.log('[Supabase] Checkout response status:', response.status);
    console.log('[Supabase] Checkout response:', responseText);

    if (!response.ok) {
      let errorMsg = 'Failed to create checkout session';
      try {
        const error = JSON.parse(responseText);
        errorMsg = error.error || errorMsg;
      } catch {}
      return { url: null, error: errorMsg };
    }

    const data = JSON.parse(responseText);
    return { url: data.url };
  } catch (error) {
    console.error('[Supabase] Checkout error:', error);
    return { url: null, error: 'Network error' };
  }
}

/**
 * Get Stripe customer portal URL
 */
export function getCustomerPortalUrl(): string {
  return 'https://billing.stripe.com/p/login/placeholder';
}
