/**
 * Chat Tools - OpenAI Function Calling for Equipment & Logs Management
 * Enables natural language interaction with the equipment database
 */
import OpenAI from 'openai';
import {
  getAllEquipment,
  getEquipment,
  updateEquipment,
  createMaintenanceLog,
  getAllMaintenanceLogs,
  getMaintenanceLogsForEquipment,
  createFailureEvent,
  calculateEquipmentAnalytics,
  Equipment,
  MaintenanceLog,
} from './database';

// ============ Tool Definitions ============

export const CHAT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_equipment_list',
      description: 'Get a list of all equipment/assets in the system. Use this to see what equipment is available before taking actions.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: {
            type: 'string',
            enum: ['all', 'operational', 'maintenance', 'down', 'retired'],
            description: 'Optional filter by equipment status. Default is "all".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_equipment_by_name',
      description: 'Search for equipment by name, make, or model using fuzzy matching. Use this when the user refers to equipment by a partial or informal name.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'The name, make, model, or partial identifier to search for.',
          },
        },
        required: ['search_term'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equipment_details',
      description: 'Get detailed information about a specific piece of equipment including its status, location, and recent maintenance.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The unique ID of the equipment.',
          },
        },
        required: ['equipment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_maintenance_log',
      description: 'Create a new maintenance log entry for a piece of equipment. Use this when the user wants to record maintenance activity.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the equipment this log is for.',
          },
          type: {
            type: 'string',
            enum: ['preventive', 'corrective', 'emergency', 'inspection'],
            description: 'The type of maintenance performed.',
          },
          notes: {
            type: 'string',
            description: 'Description of the maintenance work, observations, or notes.',
          },
          technician: {
            type: 'string',
            description: 'Name of the technician who performed the work (optional).',
          },
          duration_minutes: {
            type: 'number',
            description: 'Duration of the maintenance in minutes (optional).',
          },
          parts_used: {
            type: 'string',
            description: 'Comma-separated list of parts used (optional).',
          },
          started_at: {
            type: 'string',
            description: 'ISO timestamp when maintenance started. Defaults to now if not provided.',
          },
          completed_at: {
            type: 'string',
            description: 'ISO timestamp when maintenance was completed (optional).',
          },
        },
        required: ['equipment_id', 'type', 'notes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_equipment_status',
      description: 'Update the status of a piece of equipment. IMPORTANT: This requires user confirmation before executing.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the equipment to update.',
          },
          new_status: {
            type: 'string',
            enum: ['operational', 'maintenance', 'down', 'retired'],
            description: 'The new status for the equipment.',
          },
          reason: {
            type: 'string',
            description: 'Reason for the status change.',
          },
          confirmed: {
            type: 'boolean',
            description: 'Whether the user has confirmed this action. Must be true to execute.',
          },
        },
        required: ['equipment_id', 'new_status', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equipment_analytics',
      description: 'Get analytics and metrics for equipment including MTBF (Mean Time Between Failures), MTTR (Mean Time To Repair), and availability percentage.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the equipment. If not provided, returns analytics for all equipment.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_maintenance_logs',
      description: 'Get maintenance logs, optionally filtered by equipment.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'Optional equipment ID to filter logs. If not provided, returns all logs.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of logs to return. Default is 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_failure_event',
      description: 'Record a failure event for equipment. This is used for MTBF calculations.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the equipment that failed.',
          },
          root_cause: {
            type: 'string',
            description: 'Description of what caused the failure.',
          },
          occurred_at: {
            type: 'string',
            description: 'ISO timestamp when the failure occurred. Defaults to now.',
          },
        },
        required: ['equipment_id'],
      },
    },
  },
];

// ============ Fuzzy Matching ============

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

/**
 * Find equipment by fuzzy name matching
 */
function findEquipmentByName(searchTerm: string): { equipment: Equipment; score: number }[] {
  const allEquipment = getAllEquipment();
  const results: { equipment: Equipment; score: number }[] = [];
  const searchLower = searchTerm.toLowerCase();

  for (const eq of allEquipment) {
    // Check various fields for matches
    const fields = [
      eq.name,
      eq.make,
      eq.model,
      `${eq.make} ${eq.model}`,
      eq.serialNumber || '',
    ];

    let bestScore = 0;

    for (const field of fields) {
      // Exact substring match
      if (field.toLowerCase().includes(searchLower)) {
        bestScore = Math.max(bestScore, 0.9);
      }

      // Word-level matching
      const fieldWords = field.toLowerCase().split(/\s+/);
      const searchWords = searchLower.split(/\s+/);

      for (const searchWord of searchWords) {
        for (const fieldWord of fieldWords) {
          if (fieldWord.includes(searchWord) || searchWord.includes(fieldWord)) {
            bestScore = Math.max(bestScore, 0.8);
          }
          // Fuzzy match
          const score = similarityScore(searchWord, fieldWord);
          if (score > 0.6) {
            bestScore = Math.max(bestScore, score * 0.85);
          }
        }
      }
    }

    if (bestScore > 0.5) {
      results.push({ equipment: eq, score: bestScore });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ============ Tool Executor ============

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  requiresConfirmation?: boolean;
  actionTaken?: string; // Description of action for UI refresh
}

/**
 * Execute a tool call and return the result
 */
export function executeTool(toolName: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (toolName) {
      case 'get_equipment_list':
        return executeGetEquipmentList(args.status_filter as string | undefined);

      case 'find_equipment_by_name':
        return executeFindEquipmentByName(args.search_term as string);

      case 'get_equipment_details':
        return executeGetEquipmentDetails(args.equipment_id as string);

      case 'create_maintenance_log':
        return executeCreateMaintenanceLog(args);

      case 'update_equipment_status':
        return executeUpdateEquipmentStatus(args);

      case 'get_equipment_analytics':
        return executeGetEquipmentAnalytics(args.equipment_id as string | undefined);

      case 'get_maintenance_logs':
        return executeGetMaintenanceLogs(args);

      case 'record_failure_event':
        return executeRecordFailureEvent(args);

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============ Tool Implementations ============

function executeGetEquipmentList(statusFilter?: string): ToolResult {
  const allEquipment = getAllEquipment();

  let filtered = allEquipment;
  if (statusFilter && statusFilter !== 'all') {
    filtered = allEquipment.filter(eq => eq.status === statusFilter);
  }

  const summary = filtered.map(eq => ({
    id: eq.id,
    name: eq.name,
    make: eq.make,
    model: eq.model,
    status: eq.status,
    location: eq.location,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${filtered.length} equipment items${statusFilter && statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.`,
  };
}

function executeFindEquipmentByName(searchTerm: string): ToolResult {
  const results = findEquipmentByName(searchTerm);

  if (results.length === 0) {
    return {
      success: true,
      data: [],
      message: `No equipment found matching "${searchTerm}".`,
    };
  }

  const matches = results.slice(0, 5).map(r => ({
    id: r.equipment.id,
    name: r.equipment.name,
    make: r.equipment.make,
    model: r.equipment.model,
    status: r.equipment.status,
    confidence: Math.round(r.score * 100),
  }));

  return {
    success: true,
    data: matches,
    message: `Found ${results.length} equipment matching "${searchTerm}". Top match: ${results[0].equipment.make} ${results[0].equipment.model} (${Math.round(results[0].score * 100)}% confidence).`,
  };
}

function executeGetEquipmentDetails(equipmentId: string): ToolResult {
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
  }

  // Get recent maintenance logs
  const logs = getMaintenanceLogsForEquipment(equipmentId).slice(0, 5);

  // Get analytics
  const analytics = calculateEquipmentAnalytics(equipmentId);

  return {
    success: true,
    data: {
      equipment,
      recentLogs: logs.map(log => ({
        id: log.id,
        type: log.type,
        date: log.startedAt,
        notes: log.notes,
        technician: log.technician,
      })),
      analytics: {
        mtbf: analytics.mtbf,
        mttr: analytics.mttr,
        availability: analytics.availability,
        totalFailures: analytics.totalFailures,
        lastMaintenance: analytics.lastMaintenanceDate,
      },
    },
    message: `${equipment.make} ${equipment.model} is currently ${equipment.status}. ${logs.length > 0 ? `Last maintenance: ${logs[0].type} on ${new Date(logs[0].startedAt).toLocaleDateString()}.` : 'No maintenance history.'}`,
  };
}

function executeCreateMaintenanceLog(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
  }

  const logData = {
    equipmentId,
    type: args.type as MaintenanceLog['type'],
    notes: (args.notes as string) || null,
    technician: (args.technician as string) || null,
    durationMinutes: (args.duration_minutes as number) || null,
    partsUsed: (args.parts_used as string) || null,
    startedAt: (args.started_at as string) || new Date().toISOString(),
    completedAt: (args.completed_at as string) || null,
  };

  const log = createMaintenanceLog(logData);

  return {
    success: true,
    data: log,
    message: `✅ Created ${logData.type} maintenance log for ${equipment.make} ${equipment.model}. Log ID: ${log.id}`,
    actionTaken: 'maintenance_log_created',
  };
}

function executeUpdateEquipmentStatus(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const newStatus = args.new_status as Equipment['status'];
  const confirmed = args.confirmed as boolean;
  const reason = args.reason as string | undefined;

  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
  }

  // If not confirmed, ask for confirmation
  if (!confirmed) {
    return {
      success: false,
      requiresConfirmation: true,
      message: `⚠️ Please confirm: Change ${equipment.make} ${equipment.model} status from "${equipment.status}" to "${newStatus}"${reason ? ` (Reason: ${reason})` : ''}? Reply with "yes" or "confirm" to proceed.`,
      data: {
        pendingAction: 'update_equipment_status',
        equipment_id: equipmentId,
        current_status: equipment.status,
        new_status: newStatus,
        reason,
      },
    };
  }

  // Execute the update
  const updated = updateEquipment(equipmentId, { status: newStatus });

  if (!updated) {
    return { success: false, error: 'Failed to update equipment status.' };
  }

  return {
    success: true,
    data: updated,
    message: `✅ Updated ${equipment.make} ${equipment.model} status from "${equipment.status}" to "${newStatus}".`,
    actionTaken: 'equipment_status_updated',
  };
}

function executeGetEquipmentAnalytics(equipmentId?: string): ToolResult {
  if (equipmentId) {
    const equipment = getEquipment(equipmentId);
    if (!equipment) {
      return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
    }

    const analytics = calculateEquipmentAnalytics(equipmentId);

    return {
      success: true,
      data: analytics,
      message: `Analytics for ${equipment.make} ${equipment.model}: MTBF: ${analytics.mtbf ? `${analytics.mtbf.toFixed(1)} hours` : 'N/A'}, MTTR: ${analytics.mttr ? `${analytics.mttr.toFixed(1)} hours` : 'N/A'}, Availability: ${analytics.availability ? `${analytics.availability.toFixed(1)}%` : 'N/A'}.`,
    };
  }

  // Get analytics for all equipment
  const allEquipment = getAllEquipment();
  const allAnalytics = allEquipment.map(eq => ({
    equipment: { id: eq.id, name: eq.name, make: eq.make, model: eq.model },
    analytics: calculateEquipmentAnalytics(eq.id),
  }));

  return {
    success: true,
    data: allAnalytics,
    message: `Retrieved analytics for ${allEquipment.length} equipment items.`,
  };
}

function executeGetMaintenanceLogs(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string | undefined;
  const limit = (args.limit as number) || 20;

  let logs: MaintenanceLog[];
  let contextMessage: string;

  if (equipmentId) {
    const equipment = getEquipment(equipmentId);
    if (!equipment) {
      return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
    }
    logs = getMaintenanceLogsForEquipment(equipmentId).slice(0, limit);
    contextMessage = `for ${equipment.make} ${equipment.model}`;
  } else {
    logs = getAllMaintenanceLogs().slice(0, limit);
    contextMessage = 'across all equipment';
  }

  const summary = logs.map(log => ({
    id: log.id,
    equipmentId: log.equipmentId,
    type: log.type,
    date: log.startedAt,
    notes: log.notes,
    technician: log.technician,
    duration: log.durationMinutes,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${logs.length} maintenance logs ${contextMessage}.`,
  };
}

function executeRecordFailureEvent(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Equipment with ID "${equipmentId}" not found.` };
  }

  const failureData = {
    equipmentId,
    occurredAt: (args.occurred_at as string) || new Date().toISOString(),
    resolvedAt: null,
    rootCause: (args.root_cause as string) || null,
    maintenanceLogId: null,
  };

  const event = createFailureEvent(failureData);

  return {
    success: true,
    data: event,
    message: `⚠️ Recorded failure event for ${equipment.make} ${equipment.model}. This will be used for MTBF calculations.`,
    actionTaken: 'failure_event_recorded',
  };
}

// ============ Context Builder ============

/**
 * Build equipment context for the system prompt
 */
export function buildEquipmentContext(): string {
  const equipment = getAllEquipment();

  if (equipment.length === 0) {
    return 'No equipment has been registered in the system yet.';
  }

  const equipmentList = equipment.map(eq =>
    `- ${eq.make} ${eq.model}${eq.name !== `${eq.make} ${eq.model}` ? ` (${eq.name})` : ''} [ID: ${eq.id}] - Status: ${eq.status}${eq.location ? `, Location: ${eq.location}` : ''}`
  ).join('\n');

  // Get recent logs across all equipment
  const recentLogs = getAllMaintenanceLogs().slice(0, 5);
  const recentLogsText = recentLogs.length > 0
    ? '\n\nRecent maintenance activity:\n' + recentLogs.map(log => {
        const eq = getEquipment(log.equipmentId);
        return `- ${new Date(log.startedAt).toLocaleDateString()}: ${log.type} on ${eq?.make} ${eq?.model} - ${log.notes || 'No notes'}`;
      }).join('\n')
    : '';

  return `Registered Equipment (${equipment.length} items):\n${equipmentList}${recentLogsText}`;
}
