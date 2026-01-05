/**
 * Chat Tools - OpenAI Function Calling for Cases & Activity Logs Management
 * Enables natural language interaction with the case database
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
  // Task imports (Work Orders)
  getAllWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  getWorkOrdersForEquipment,
  completeWorkOrder,
} from './database';
import type { WorkOrder, WorkOrderFormData } from '@drasill/shared';

// ============ Tool Definitions ============

export const CHAT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_equipment_list',
      description: 'Get a list of all cases/matters in the system. Use this to see what cases are available before taking actions.',
      parameters: {
        type: 'object',
        properties: {
          status_filter: {
            type: 'string',
            enum: ['all', 'operational', 'maintenance', 'down', 'retired'],
            description: 'Optional filter by case status (operational=active, maintenance=in review, down=on hold, retired=closed). Default is "all".',
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
      description: 'Search for cases by name, case type, or court using fuzzy matching. Use this when the user refers to a case by a partial or informal name.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'The case name, type, court, or partial identifier to search for.',
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
      description: 'Get detailed information about a specific case/matter including its status, jurisdiction, and recent activity.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The unique ID of the case.',
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
      description: 'Create a new activity log entry for a case. Use this when the user wants to record case activity such as research, filings, hearings, or reviews.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the case this log is for.',
          },
          type: {
            type: 'string',
            enum: ['preventive', 'corrective', 'emergency', 'inspection'],
            description: 'The type of activity (preventive=research, corrective=filing, emergency=hearing, inspection=review).',
          },
          notes: {
            type: 'string',
            description: 'Description of the work done, observations, or notes.',
          },
          technician: {
            type: 'string',
            description: 'Name of the attorney/paralegal who performed the work (optional).',
          },
          duration_minutes: {
            type: 'number',
            description: 'Duration of the work in minutes / billable time (optional).',
          },
          parts_used: {
            type: 'string',
            description: 'Comma-separated list of documents referenced (optional).',
          },
          started_at: {
            type: 'string',
            description: 'ISO timestamp when work started. Defaults to now if not provided.',
          },
          completed_at: {
            type: 'string',
            description: 'ISO timestamp when work was completed (optional).',
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
      description: 'Update the status of a case. IMPORTANT: This requires user confirmation before executing.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the case to update.',
          },
          new_status: {
            type: 'string',
            enum: ['operational', 'maintenance', 'down', 'retired'],
            description: 'The new status for the case (operational=active, maintenance=in review, down=on hold, retired=closed).',
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
      description: 'Get analytics and metrics for cases including total billable hours, average resolution time, and caseload statistics.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the case. If not provided, returns analytics for all cases.',
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
      description: 'Get activity logs, optionally filtered by case.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'Optional case ID to filter logs. If not provided, returns all logs.',
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
      description: 'Record a deadline miss or issue event for a case. This is used for tracking and analytics.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the case with the issue.',
          },
          root_cause: {
            type: 'string',
            description: 'Description of what caused the issue.',
          },
          occurred_at: {
            type: 'string',
            description: 'ISO timestamp when the issue occurred. Defaults to now.',
          },
        },
        required: ['equipment_id'],
      },
    },
  },
  // ============ Task Tools ============
  {
    type: 'function',
    function: {
      name: 'get_work_orders',
      description: 'Get a list of tasks/assignments, optionally filtered by status or case.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'Optional case ID to filter tasks.',
          },
          status: {
            type: 'string',
            enum: ['all', 'draft', 'open', 'in_progress', 'on_hold', 'completed', 'cancelled'],
            description: 'Optional status filter. Default is "all".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_work_order',
      description: 'Create a new task/assignment for a case. Use this when the user wants to schedule or plan work on a case.',
      parameters: {
        type: 'object',
        properties: {
          equipment_id: {
            type: 'string',
            description: 'The ID of the case this task is for.',
          },
          title: {
            type: 'string',
            description: 'Brief title/description of the work to be done.',
          },
          type: {
            type: 'string',
            enum: ['preventive', 'corrective', 'emergency', 'inspection'],
            description: 'The type of legal work (preventive=research, corrective=filing, emergency=hearing, inspection=review).',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Priority level. Default is "medium".',
          },
          description: {
            type: 'string',
            description: 'Detailed description of the work to be performed.',
          },
          scheduled_start: {
            type: 'string',
            description: 'ISO date for when the work should start. Optional.',
          },
          estimated_hours: {
            type: 'number',
            description: 'Estimated hours to complete the work.',
          },
          technician: {
            type: 'string',
            description: 'Name of the assigned attorney/paralegal. Optional.',
          },
        },
        required: ['equipment_id', 'title', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_work_order',
      description: 'Mark a task as completed. This will also create an activity log entry.',
      parameters: {
        type: 'object',
        properties: {
          work_order_id: {
            type: 'string',
            description: 'The ID of the task to complete.',
          },
          actual_hours: {
            type: 'number',
            description: 'Actual hours spent on the work (billable time).',
          },
          notes: {
            type: 'string',
            description: 'Completion notes or observations.',
          },
        },
        required: ['work_order_id', 'actual_hours'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_work_order_status',
      description: 'Update the status of a task (e.g., start work, put on hold, cancel).',
      parameters: {
        type: 'object',
        properties: {
          work_order_id: {
            type: 'string',
            description: 'The ID of the task to update.',
          },
          new_status: {
            type: 'string',
            enum: ['open', 'in_progress', 'on_hold', 'cancelled'],
            description: 'The new status for the task.',
          },
        },
        required: ['work_order_id', 'new_status'],
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
 * Find cases by fuzzy name matching
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

      // Work Order Tools
      case 'get_work_orders':
        return executeGetWorkOrders(args);

      case 'create_work_order':
        return executeCreateWorkOrder(args);

      case 'complete_work_order':
        return executeCompleteWorkOrder(args);

      case 'update_work_order_status':
        return executeUpdateWorkOrderStatus(args);

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
    caseType: eq.make,
    court: eq.model,
    status: eq.status,
    jurisdiction: eq.location,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${filtered.length} cases${statusFilter && statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.`,
  };
}

function executeFindEquipmentByName(searchTerm: string): ToolResult {
  const results = findEquipmentByName(searchTerm);

  if (results.length === 0) {
    return {
      success: true,
      data: [],
      message: `No cases found matching "${searchTerm}".`,
    };
  }

  const matches = results.slice(0, 5).map(r => ({
    id: r.equipment.id,
    name: r.equipment.name,
    caseType: r.equipment.make,
    court: r.equipment.model,
    status: r.equipment.status,
    confidence: Math.round(r.score * 100),
  }));

  return {
    success: true,
    data: matches,
    message: `Found ${results.length} cases matching "${searchTerm}". Top match: ${results[0].equipment.name} (${Math.round(results[0].score * 100)}% confidence).`,
  };
}

function executeGetEquipmentDetails(equipmentId: string): ToolResult {
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Case with ID "${equipmentId}" not found.` };
  }

  // Get recent activity logs
  const logs = getMaintenanceLogsForEquipment(equipmentId).slice(0, 5);

  // Get analytics
  const analytics = calculateEquipmentAnalytics(equipmentId);

  return {
    success: true,
    data: {
      case: equipment,
      recentActivity: logs.map(log => ({
        id: log.id,
        type: log.type,
        date: log.startedAt,
        notes: log.notes,
        attorney: log.technician,
      })),
      analytics: {
        totalHours: analytics.mtbf,
        avgResolutionTime: analytics.mttr,
        progressRate: analytics.availability,
        totalIssues: analytics.totalFailures,
        lastActivity: analytics.lastMaintenanceDate,
      },
    },
    message: `${equipment.name} is currently ${equipment.status}. ${logs.length > 0 ? `Last activity: ${logs[0].type} on ${new Date(logs[0].startedAt).toLocaleDateString()}.` : 'No activity history.'}`,
  };
}

function executeCreateMaintenanceLog(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Case with ID "${equipmentId}" not found.` };
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
    message: `✅ Created ${logData.type} activity log for ${equipment.name}. Log ID: ${log.id}`,
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
    return { success: false, error: `Case with ID "${equipmentId}" not found.` };
  }

  // If not confirmed, ask for confirmation
  if (!confirmed) {
    return {
      success: false,
      requiresConfirmation: true,
      message: `⚠️ Please confirm: Change ${equipment.name} status from "${equipment.status}" to "${newStatus}"${reason ? ` (Reason: ${reason})` : ''}? Reply with "yes" or "confirm" to proceed.`,
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
    return { success: false, error: 'Failed to update case status.' };
  }

  return {
    success: true,
    data: updated,
    message: `✅ Updated ${equipment.name} status from "${equipment.status}" to "${newStatus}".`,
    actionTaken: 'equipment_status_updated',
  };
}

function executeGetEquipmentAnalytics(equipmentId?: string): ToolResult {
  if (equipmentId) {
    const equipment = getEquipment(equipmentId);
    if (!equipment) {
      return { success: false, error: `Case with ID "${equipmentId}" not found.` };
    }

    const analytics = calculateEquipmentAnalytics(equipmentId);

    return {
      success: true,
      data: analytics,
      message: `Analytics for ${equipment.name}: Total Hours: ${analytics.mtbf ? `${analytics.mtbf.toFixed(1)} hours` : 'N/A'}, Avg Resolution: ${analytics.mttr ? `${analytics.mttr.toFixed(1)} hours` : 'N/A'}, Progress: ${analytics.availability ? `${analytics.availability.toFixed(1)}%` : 'N/A'}.`,
    };
  }

  // Get analytics for all cases
  const allEquipment = getAllEquipment();
  const allAnalytics = allEquipment.map(eq => ({
    case: { id: eq.id, name: eq.name, caseType: eq.make, court: eq.model },
    analytics: calculateEquipmentAnalytics(eq.id),
  }));

  return {
    success: true,
    data: allAnalytics,
    message: `Retrieved analytics for ${allEquipment.length} cases.`,
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
      return { success: false, error: `Case with ID "${equipmentId}" not found.` };
    }
    logs = getMaintenanceLogsForEquipment(equipmentId).slice(0, limit);
    contextMessage = `for ${equipment.name}`;
  } else {
    logs = getAllMaintenanceLogs().slice(0, limit);
    contextMessage = 'across all cases';
  }

  const summary = logs.map(log => ({
    id: log.id,
    equipmentId: log.equipmentId,
    type: log.type,
    date: log.startedAt,
    notes: log.notes,
    attorney: log.technician,
    duration: log.durationMinutes,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${logs.length} activity logs ${contextMessage}.`,
  };
}

function executeRecordFailureEvent(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Case with ID "${equipmentId}" not found.` };
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
    message: `⚠️ Recorded issue event for ${equipment.name}. This will be tracked for analytics.`,
    actionTaken: 'failure_event_recorded',
  };
}

// ============ Task Tool Implementations ============

function executeGetWorkOrders(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string | undefined;
  const statusFilter = args.status as string | undefined;

  let workOrders: WorkOrder[];
  let contextMessage: string;

  if (equipmentId) {
    const equipment = getEquipment(equipmentId);
    if (!equipment) {
      return { success: false, error: `Case with ID "${equipmentId}" not found.` };
    }
    workOrders = getWorkOrdersForEquipment(equipmentId);
    contextMessage = `for ${equipment.name}`;
  } else {
    workOrders = getAllWorkOrders();
    contextMessage = 'across all cases';
  }

  // Filter by status if provided
  if (statusFilter && statusFilter !== 'all') {
    workOrders = workOrders.filter(wo => wo.status === statusFilter);
  }

  const summary = workOrders.map(wo => ({
    id: wo.id,
    taskNumber: wo.workOrderNumber,
    title: wo.title,
    type: wo.type,
    priority: wo.priority,
    status: wo.status,
    scheduledStart: wo.scheduledStart,
    caseId: wo.equipmentId,
  }));

  // Count by status
  const statusCounts = {
    open: workOrders.filter(wo => wo.status === 'open').length,
    in_progress: workOrders.filter(wo => wo.status === 'in_progress').length,
    on_hold: workOrders.filter(wo => wo.status === 'on_hold').length,
  };

  return {
    success: true,
    data: summary,
    message: `Found ${workOrders.length} tasks ${contextMessage}. Active: ${statusCounts.open} open, ${statusCounts.in_progress} in progress, ${statusCounts.on_hold} on hold.`,
  };
}

function executeCreateWorkOrder(args: Record<string, unknown>): ToolResult {
  const equipmentId = args.equipment_id as string;
  const equipment = getEquipment(equipmentId);

  if (!equipment) {
    return { success: false, error: `Case with ID "${equipmentId}" not found.` };
  }

  const workOrderData = {
    equipmentId,
    templateId: null,
    title: args.title as string,
    type: args.type as WorkOrder['type'],
    priority: (args.priority as WorkOrder['priority']) || 'medium',
    status: 'open' as WorkOrder['status'],
    description: (args.description as string) || null,
    scheduledStart: (args.scheduled_start as string) || null,
    scheduledEnd: null,
    actualStart: null,
    actualEnd: null,
    estimatedHours: (args.estimated_hours as number) || null,
    actualHours: null,
    technician: (args.technician as string) || null,
    partsRequired: null,
    notes: null,
  };

  const workOrder = createWorkOrder(workOrderData);

  return {
    success: true,
    data: workOrder,
    message: `✅ Created task ${workOrder.workOrderNumber} for ${equipment.name}: "${workOrderData.title}" (${workOrderData.type}, ${workOrderData.priority} priority)`,
    actionTaken: 'work_order_created',
  };
}

function executeCompleteWorkOrder(args: Record<string, unknown>): ToolResult {
  const workOrderId = args.work_order_id as string;
  const workOrder = getWorkOrder(workOrderId);

  if (!workOrder) {
    return { success: false, error: `Task with ID "${workOrderId}" not found.` };
  }

  const equipment = getEquipment(workOrder.equipmentId);
  const actualHours = args.actual_hours as number;
  const notes = (args.notes as string) || null;

  const result = completeWorkOrder(workOrderId, actualHours, notes, true);

  if (!result) {
    return { success: false, error: 'Failed to complete task.' };
  }

  return {
    success: true,
    data: result,
    message: `✅ Completed task ${workOrder.workOrderNumber} for ${equipment?.name}. Billable hours: ${actualHours}. Activity log created.`,
    actionTaken: 'work_order_completed',
  };
}

function executeUpdateWorkOrderStatus(args: Record<string, unknown>): ToolResult {
  const workOrderId = args.work_order_id as string;
  const newStatus = args.new_status as WorkOrder['status'];
  
  const workOrder = getWorkOrder(workOrderId);

  if (!workOrder) {
    return { success: false, error: `Task with ID "${workOrderId}" not found.` };
  }

  const equipment = getEquipment(workOrder.equipmentId);

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    draft: ['open', 'cancelled'],
    open: ['in_progress', 'cancelled'],
    in_progress: ['on_hold', 'completed', 'cancelled'],
    on_hold: ['in_progress', 'cancelled'],
  };

  if (!validTransitions[workOrder.status]?.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${workOrder.status}" to "${newStatus}". Valid next statuses: ${validTransitions[workOrder.status]?.join(', ') || 'none'}`,
    };
  }

  const updates: Partial<WorkOrderFormData> & { status?: WorkOrder['status']; actualStart?: string } = {
    status: newStatus,
  };

  // Set actualStart when starting work
  if (newStatus === 'in_progress' && !workOrder.actualStart) {
    updates.actualStart = new Date().toISOString();
  }

  const updated = updateWorkOrder(workOrderId, updates as Partial<WorkOrder>);

  if (!updated) {
    return { success: false, error: 'Failed to update task.' };
  }

  const statusLabels: Record<string, string> = {
    open: 'opened',
    in_progress: 'started',
    on_hold: 'put on hold',
    cancelled: 'cancelled',
  };

  return {
    success: true,
    data: updated,
    message: `✅ Task ${workOrder.workOrderNumber} for ${equipment?.name} has been ${statusLabels[newStatus] || newStatus}.`,
    actionTaken: 'work_order_updated',
  };
}

// ============ Context Builder ============

/**
 * Build case context for the system prompt
 */
export function buildCaseContext(): string {
  const cases = getAllEquipment();

  if (cases.length === 0) {
    return 'No cases have been registered in the system yet.';
  }

  const caseList = cases.map(c =>
    `- ${c.name} (${c.make} - ${c.model}) [ID: ${c.id}] - Status: ${c.status}${c.location ? `, Jurisdiction: ${c.location}` : ''}`
  ).join('\n');

  // Get recent activity across all cases
  const recentLogs = getAllMaintenanceLogs().slice(0, 5);
  const recentLogsText = recentLogs.length > 0
    ? '\n\nRecent case activity:\n' + recentLogs.map(log => {
        const c = getEquipment(log.equipmentId);
        return `- ${new Date(log.startedAt).toLocaleDateString()}: ${log.type} on ${c?.name} - ${log.notes || 'No notes'}`;
      }).join('\n')
    : '';

  // Get active tasks
  const activeTasks = getAllWorkOrders().filter(wo => 
    wo.status === 'open' || wo.status === 'in_progress' || wo.status === 'on_hold'
  );
  const tasksText = activeTasks.length > 0
    ? '\n\nActive Tasks:\n' + activeTasks.slice(0, 5).map(wo => {
        const c = getEquipment(wo.equipmentId);
        return `- ${wo.workOrderNumber}: ${wo.title} (${c?.name}) - ${wo.status.replace('_', ' ')}, ${wo.priority} priority`;
      }).join('\n')
    : '';

  return `Registered Cases (${cases.length} items):\n${caseList}${recentLogsText}${tasksText}`;
}
