import { SchematicToolCall, SchematicToolResponse } from '@drasill/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

// Configuration
const JAVA_SERVICE_URL = process.env.JAVA_SCHEMATIC_SERVICE_URL || 'http://localhost:8080';
const JAVA_SERVICE_TIMEOUT = 30000; // 30 seconds

/**
 * Process a schematic tool call from OpenAI by forwarding to Java service
 */
export async function processSchematicToolCall(
  toolCall: SchematicToolCall
): Promise<SchematicToolResponse> {
  try {
    console.log('[Schematic] Processing tool call:', toolCall);

    // Check if Java service is available
    const isServiceAvailable = await checkJavaService();
    if (!isServiceAvailable) {
      console.warn('[Schematic] Java service not available, returning mock data');
      return getMockSchematicResponse(toolCall);
    }

    // Call Java REST API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), JAVA_SERVICE_TIMEOUT);

    try {
      const response = await fetch(`${JAVA_SERVICE_URL}/tool-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  arguments: JSON.stringify(toolCall)
                }
              }]
            }
          }]
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Java service returned ${response.status}: ${response.statusText}`);
      }

      const result: SchematicToolResponse = await response.json();
      console.log('[Schematic] Received response from Java service:', result);

      // Validate response
      if (result.status === 'error') {
        throw new Error(result.message || 'Unknown error from Java service');
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    console.error('[Schematic] Error processing tool call:', error);
    
    // Return error response
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error processing schematic',
    };
  }
}

/**
 * Check if Java service is available
 */
async function checkJavaService(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${JAVA_SERVICE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log('[Schematic] Java service health check failed:', error);
    return false;
  }
}

/**
 * Get schematic image as base64 data URL
 * Note: Path validation should be done by the caller (ipc.ts) before calling this function
 */
export async function getSchematicImage(imagePath: string, workspacePath?: string): Promise<string> {
  try {
    // Validate path is within workspace if workspace is provided
    if (workspacePath) {
      const resolvedPath = path.resolve(imagePath);
      const resolvedWorkspace = path.resolve(workspacePath);
      const normalizedPath = resolvedPath.toLowerCase();
      const normalizedWorkspace = resolvedWorkspace.toLowerCase();
      
      if (!normalizedPath.startsWith(normalizedWorkspace + path.sep) && normalizedPath !== normalizedWorkspace) {
        throw new Error('Access denied: Path is outside the workspace');
      }
    }
    
    // Check if file exists
    await fs.access(imagePath);

    // Read file as buffer
    const buffer = await fs.readFile(imagePath);

    // Determine mime type from extension
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/png';
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.svg':
        mimeType = 'image/svg+xml';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
    }

    // Convert to base64 data URL
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('[Schematic] Error reading image:', error);
    throw new Error(`Failed to read schematic image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mock response for testing without Java service
 */
function getMockSchematicResponse(toolCall: SchematicToolCall): SchematicToolResponse {
  return {
    status: 'success',
    component_name: toolCall.component_name,
    machine_model: toolCall.machine_model || 'Unknown',
    component_id: `MOCK-${Date.now()}`,
    image_path: '/mock/schematic.png',
    manual_context: `
Mock Schematic Data for ${toolCall.component_name}

Component: ${toolCall.component_name}
Model: ${toolCall.machine_model || 'Unknown'}

SERVICE PROCEDURE:
1. Disconnect power supply
2. Remove access panel (4 screws)
3. Locate ${toolCall.component_name} assembly
4. Disconnect electrical connections
5. Remove mounting bolts
6. Install replacement component
7. Reconnect electrical connections
8. Replace access panel
9. Test operation

SAFETY WARNINGS:
⚠️ Always disconnect power before servicing
⚠️ Use proper PPE (gloves, safety glasses)
⚠️ Follow lockout/tagout procedures

TORQUE SPECIFICATIONS:
- Mounting bolts: 25 ft-lbs
- Electrical connections: Hand tight + 1/4 turn

NOTE: This is mock data. Configure Java service for actual schematic retrieval.
    `.trim(),
  };
}

/**
 * Start Java service if not already running (optional feature)
 */
export async function startJavaService(_jarPath?: string): Promise<boolean> {
  // TODO: Implement automatic Java service startup if desired
  // This would spawn a child process to run the Java REST API
  console.log('[Schematic] Java service auto-start not implemented. Please start manually.');
  return false;
}
