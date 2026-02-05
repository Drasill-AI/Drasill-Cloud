/**
 * Supabase Edge Function: chat
 * Proxies chat requests to OpenAI using server-side API key
 * 
 * Deploy to Supabase:
 * 1. Go to Supabase Dashboard > Edge Functions
 * 2. Create new function named "chat"
 * 3. IMPORTANT: Disable "Enforce JWT Verification" in function settings
 * 4. Paste this code
 * 5. Add secret: OPENAI_API_KEY
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: body.model || 'gpt-4o-mini',
        messages: body.messages,
        tools: body.tools,
        tool_choice: body.tool_choice,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: true,
      }),
    })

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text()
      return new Response(JSON.stringify({ error: 'OpenAI error', details: err }), 
        { status: openaiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(openaiResponse.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
