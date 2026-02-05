import { BrowserWindow } from 'electron';
import { ChatRequest, IPC_CHANNELS, FileContext } from '@drasill/shared';
import { getRAGContext, getIndexingStatus } from './rag';
import { CHAT_TOOLS, executeTool, buildDealContext, ChatToolContext } from './chatTools';
import { proxyChatRequest, getSession } from './supabase';
import { incrementUsage } from './usage';
import { getActiveProfileWithInheritance } from './database';

let abortController: AbortController | null = null;

/**
 * Check if user is authenticated (replaces API key check)
 */
export async function hasApiKey(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Get masked API key info (for display - now shows auth status)
 */
export async function getApiKey(): Promise<string | null> {
  const session = await getSession();
  return session ? 'Using Drasill Cloud API' : null;
}

/**
 * Set API key - no longer needed with proxy, but kept for compatibility
 */
export async function setApiKey(_apiKey: string): Promise<boolean> {
  // No longer needed - using cloud proxy
  return true;
}

/**
 * RAG source citation info
 */
interface RAGSource {
  fileName: string;
  filePath: string;
  section: string;
  pageNumber?: number;
  source?: 'local' | 'onedrive';
  oneDriveId?: string;
  relevanceScore?: number;
  fromOtherDeal?: boolean;
  dealId?: string;
}

/**
 * Build the system prompt with optional file context and RAG context
 * Returns both the prompt and any RAG sources for citation
 * @param context - Current file context if any
 * @param userQuery - The user's query for RAG search
 * @param currentDealId - Optional deal ID for deal-scoped search
 */
async function buildSystemPrompt(context?: FileContext, userQuery?: string, currentDealId?: string): Promise<{ prompt: string; ragSources: RAGSource[] }> {
  let systemPrompt = `You are an AI assistant for Drasill - a lending deal flow management and underwriting system.

Your capabilities:
- Analyze loan documents and underwriting materials
- Summarize deal information and documentation
- Answer questions about deals, borrowers, and lending terms
- Help find specific information in indexed documents
- Manage deals through the pipeline via function calls (add activities, update stages)
- Provide pipeline analytics and deal tracking

When users want to add activities or update deal stages, use the available tools. For stage changes, always ask for confirmation first by calling the tool with confirmed=false.

Be concise, accurate, and helpful. When referencing information from provided context, cite specific sources or file names using [[1]], [[2]] format. Summarize actions you take.`;

  // Add active knowledge profile context (soft guardrails)
  const { profile: activeProfile, fullGuidelines } = getActiveProfileWithInheritance();
  if (activeProfile && fullGuidelines) {
    systemPrompt += `\n\n--- KNOWLEDGE PROFILE: ${activeProfile.name.toUpperCase()} ---
The following contextual guidelines apply to this conversation. These are suggestions to help ensure consistency and accuracy, not strict rules:

${fullGuidelines}`;
    
    if (activeProfile.terminology) {
      systemPrompt += `\n\nKey Terminology:\n${activeProfile.terminology}`;
    }
    
    if (activeProfile.complianceChecks) {
      systemPrompt += `\n\nCompliance Considerations (soft reminders, not blocking requirements):\n${activeProfile.complianceChecks}`;
    }
    
    systemPrompt += `\n--- END KNOWLEDGE PROFILE ---`;
  }

  // Add deal pipeline context
  const dealContext = buildDealContext(currentDealId);
  systemPrompt += `\n\n--- DEAL PIPELINE ---\n${dealContext}\n--- END DEAL PIPELINE ---`;

  // Add RAG context if available
  const ragStatus = getIndexingStatus();
  let ragSources: RAGSource[] = [];
  
  if (ragStatus.chunksCount > 0 && userQuery) {
    try {
      // Pass dealId for deal-scoped search
      const ragResult = await getRAGContext(userQuery, currentDealId);
      if (ragResult.context) {
        ragSources = ragResult.sources;
        
        // Add note about sources from other deals if present
        const hasOtherDealSources = ragSources.some(s => s.fromOtherDeal);
        const otherDealNote = hasOtherDealSources 
          ? '\n\nNote: Some sources marked [FROM OTHER DEAL] are from deals other than the current focus.'
          : '';
        
        systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---
The following numbered sources were retrieved from the user's indexed documentation:

${ragResult.context}
--- END KNOWLEDGE BASE CONTEXT ---

IMPORTANT: When referencing information from the knowledge base, cite using the format [[1]], [[2]], etc. corresponding to the source numbers above. Always cite your sources when providing information from the documentation.${otherDealNote}`;
      }
    } catch (error) {
      console.error('Failed to get RAG context:', error);
    }
  }

  if (context) {
    const contentPreview = context.content.length > 6000 
      ? context.content.slice(0, 6000) + '\n\n[... content truncated ...]'
      : context.content;

    systemPrompt += `\n\n--- CURRENT FILE CONTEXT ---
File: ${context.fileName}
Path: ${context.filePath}
Type: ${context.fileType}

Content:
${contentPreview}
--- END FILE CONTEXT ---

The user is viewing this file. Answer questions with reference to this content when relevant.`;
  }

  return { prompt: systemPrompt, ragSources };
}

/**
 * Cancel ongoing stream
 */
export function cancelStream(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

/**
 * Send a chat message with streaming response and tool support
 */
export async function sendChatMessage(
  window: BrowserWindow,
  request: ChatRequest
): Promise<void> {
  // Check if authenticated
  const session = await getSession();
  if (!session) {
    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, {
      error: 'Not authenticated. Please sign in to use chat.',
    });
    return;
  }

  // Create abort controller for cancellation
  abortController = new AbortController();

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Build system prompt with RAG context (pass dealId for deal-scoped search)
    const { prompt: systemPrompt, ragSources } = await buildSystemPrompt(request.context, request.message, request.dealId);
    
    // Send RAG sources to frontend if available (for citation linking)
    if (ragSources.length > 0) {
      console.log('[Chat] Sending RAG sources to frontend:', JSON.stringify(ragSources, null, 2));
      window.webContents.send(IPC_CHANNELS.CHAT_STREAM_START, {
        messageId,
        ragSources,
      });
    }
    
    // Aggregate RAG sources from conversation history for activity creation
    const allRagSources: RAGSource[] = [...ragSources];
    for (const msg of request.history) {
      if (msg.ragSources && msg.ragSources.length > 0) {
        allRagSources.push(...msg.ragSources.map(s => ({
          fileName: s.fileName,
          filePath: s.filePath,
          section: s.section || '',
          pageNumber: s.pageNumber,
          source: s.source,
          oneDriveId: s.oneDriveId,
          relevanceScore: s.relevanceScore,
          fromOtherDeal: s.fromOtherDeal,
          dealId: s.dealId,
        })));
      }
    }
    
    // Build messages array
    const messages: Array<{ role: string; content: string | null; tool_calls?: any[]; tool_call_id?: string }> = [
      { role: 'system', content: systemPrompt },
      ...request.history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: request.message },
    ];

    // Convert CHAT_TOOLS to the format expected by the API
    const tools = CHAT_TOOLS.map(tool => ({
      type: 'function' as const,
      function: tool.function,
    }));

    // Build tool context with cumulative RAG sources for activity creation
    const toolContext: ChatToolContext = {
      ragSources: allRagSources,
    };
    
    // Handle tool calls iteratively (max 5 iterations to prevent infinite loops)
    let iterations = 0;
    let continueLoop = true;
    
    while (continueLoop && iterations < 5) {
      iterations++;
      
      // Call via proxy
      const response = await proxyChatRequest(
        messages,
        {
          model: 'gpt-4o-mini',
          tools,
          tool_choice: 'auto',
          max_tokens: 2048,
          temperature: 0.7,
        },
        undefined, // No streaming callback for tool calls
        abortController.signal
      );

      if (!response.success) {
        throw new Error(response.error || 'Chat request failed');
      }

      // Check if we have tool calls to process
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.tool_calls,
        });
        
        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            console.error('Failed to parse tool arguments:', e);
          }
          
          const result = await executeTool(toolCall.function.name, args, toolContext);
          
          // Notify renderer if action was taken
          if (result.actionTaken) {
            window.webContents.send('chat-tool-executed', {
              action: result.actionTaken,
              data: result.data,
            });
          }
          
          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      } else {
        // No tool calls - we have the final response
        continueLoop = false;
        
        // Stream the final text response
        if (response.content) {
          const content = response.content;
          const chunkSize = 20;
          for (let i = 0; i < content.length; i += chunkSize) {
            window.webContents.send(IPC_CHANNELS.CHAT_STREAM_CHUNK, {
              id: messageId,
              delta: content.slice(i, i + chunkSize),
              done: false,
            });
            // Small delay for smooth streaming effect
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    }

    // Track AI message usage
    incrementUsage('ai_messages');

    // Signal stream complete
    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_END, {
      id: messageId,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError' || (error as Error).message === 'Request cancelled') {
      // Stream was cancelled
      window.webContents.send(IPC_CHANNELS.CHAT_STREAM_END, {
        id: messageId,
        cancelled: true,
      });
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, {
        id: messageId,
        error: errorMessage,
      });
    }
  } finally {
    abortController = null;
  }
}
