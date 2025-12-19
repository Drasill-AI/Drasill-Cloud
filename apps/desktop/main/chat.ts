import OpenAI from 'openai';
import { BrowserWindow } from 'electron';
import { ChatRequest, IPC_CHANNELS, FileContext } from '@drasill/shared';
import { getRAGContext, getIndexingStatus } from './rag';
import * as keychain from './keychain';
import { CHAT_TOOLS, executeTool, buildEquipmentContext } from './chatTools';

let openai: OpenAI | null = null;
let abortController: AbortController | null = null;

/**
 * Initialize OpenAI client with stored API key
 */
async function initializeOpenAI(): Promise<boolean> {
  const apiKey = await keychain.getApiKey();
  if (apiKey) {
    openai = new OpenAI({ apiKey });
    return true;
  }
  return false;
}

/**
 * Set the OpenAI API key (stores in OS keychain)
 */
export async function setApiKey(apiKey: string): Promise<boolean> {
  const success = await keychain.setApiKey(apiKey);
  if (success) {
    openai = new OpenAI({ apiKey });
  }
  return success;
}

/**
 * Get the OpenAI API key (masked)
 */
export async function getApiKey(): Promise<string | null> {
  return keychain.getMaskedApiKey();
}

/**
 * Check if API key is configured
 */
export async function hasApiKey(): Promise<boolean> {
  return keychain.hasApiKey();
}

/**
 * Build the system prompt with optional file context and RAG context
 */
async function buildSystemPrompt(context?: FileContext, userQuery?: string): Promise<string> {
  let systemPrompt = `You are Lonnie, an AI assistant for Drasill Cloud - an equipment documentation and maintenance management system.

Your capabilities:
- Explain technical concepts in documentation
- Summarize long documents
- Answer questions about equipment specifications
- Help find specific information in documents
- Create maintenance logs and update equipment status via function calls
- Provide analytics on equipment performance (MTBF, MTTR, availability)

When users want to create logs or update equipment, use the available tools. For status updates, always ask for confirmation first by calling the tool with confirmed=false.

Be concise, accurate, and helpful. When referencing information from provided context, cite specific sources or file names. Summarize actions you take.`;

  // Add equipment context
  const equipmentContext = buildEquipmentContext();
  systemPrompt += `\n\n--- EQUIPMENT DATABASE ---\n${equipmentContext}\n--- END EQUIPMENT DATABASE ---`;

  // Add RAG context if available
  const ragStatus = getIndexingStatus();
  if (ragStatus.chunksCount > 0 && userQuery) {
    try {
      const ragContext = await getRAGContext(userQuery);
      if (ragContext) {
        systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---
The following information was retrieved from the user's indexed documentation:

${ragContext}
--- END KNOWLEDGE BASE CONTEXT ---

Use this context to answer the user's question. Cite the source file when referencing information.`;
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

  return systemPrompt;
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
  // Initialize if needed (now async for keychain access)
  if (!openai && !(await initializeOpenAI())) {
    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_ERROR, {
      error: 'OpenAI API key not configured. Please set your API key in settings.',
    });
    return;
  }

  // Create abort controller for cancellation
  abortController = new AbortController();

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Build system prompt with RAG context
    const systemPrompt = await buildSystemPrompt(request.context, request.message);
    
    // Build messages array
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...request.history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: request.message },
    ];

    // First call - may return tool calls
    let response = await openai!.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages,
        tools: CHAT_TOOLS,
        tool_choice: 'auto',
        max_tokens: 2048,
        temperature: 0.7,
      },
      { signal: abortController.signal }
    );

    let assistantMessage = response.choices[0].message;
    
    // Handle tool calls iteratively (max 5 iterations to prevent infinite loops)
    let iterations = 0;
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iterations < 5) {
      iterations++;
      
      // Add assistant message with tool calls to conversation
      messages.push(assistantMessage);
      
      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error('Failed to parse tool arguments:', e);
        }
        
        const result = executeTool(toolCall.function.name, args);
        
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
      
      // Get next response
      response = await openai!.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages,
          tools: CHAT_TOOLS,
          tool_choice: 'auto',
          max_tokens: 2048,
          temperature: 0.7,
        },
        { signal: abortController.signal }
      );
      
      assistantMessage = response.choices[0].message;
    }

    // Stream the final text response
    if (assistantMessage.content) {
      // Send as chunks for consistency with streaming UI
      const content = assistantMessage.content;
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

    // Signal stream complete
    window.webContents.send(IPC_CHANNELS.CHAT_STREAM_END, {
      id: messageId,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
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
