/**
 * Chat Tools - OpenAI Function Calling for Deal & Activity Management
 * Enables natural language interaction with the deal database
 */
import OpenAI from 'openai';
import type { Deal, DealActivity, DealStage, SchematicToolCall } from '@drasill/shared';
import {
  getAllDeals,
  getDeal,
  updateDeal,
  createDealActivity,
  getAllActivities,
  getActivitiesForDeal,
  calculatePipelineAnalytics,
  addActivitySource,
  getRelevanceThresholds,
} from './database';
import { processSchematicToolCall } from './schematic';
import { createAndOpenEmailDraft, generateEmailBody, type EmailDraft } from './outlook';
import { createOneDriveSharingLinks } from './onedrive';

// ============ Tool Definitions ============

export const CHAT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_deals',
      description: 'Get a list of all deals in the pipeline. Use this to see what deals are available before taking actions.',
      parameters: {
        type: 'object',
        properties: {
          stage_filter: {
            type: 'string',
            enum: ['all', 'lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'],
            description: 'Optional filter by deal stage. Default is "all".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_deal_by_name',
      description: 'Search for a deal by borrower name using fuzzy matching. Use this when the user refers to a deal by a partial or informal name.',
      parameters: {
        type: 'object',
        properties: {
          search_term: {
            type: 'string',
            description: 'The borrower name or partial identifier to search for.',
          },
        },
        required: ['search_term'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_deal_details',
      description: 'Get detailed information about a specific deal including its stage, loan amount, and recent activity.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'The unique ID of the deal.',
          },
        },
        required: ['deal_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_deal_activity',
      description: 'Add a new activity entry for a deal. Use this when the user wants to record a call, meeting, note, email, or document. IMPORTANT: When creating activities from conversation context, set use_chat_sources=true to automatically attach any documents referenced in the chat as citations.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'The ID of the deal this activity is for.',
          },
          type: {
            type: 'string',
            enum: ['note', 'call', 'email', 'document', 'meeting'],
            description: 'The type of activity.',
          },
          description: {
            type: 'string',
            description: 'Description of the activity, observations, or notes. Should summarize the relevant conversation context.',
          },
          performed_by: {
            type: 'string',
            description: 'Name of the person who performed the activity (optional).',
          },
          performed_at: {
            type: 'string',
            description: 'ISO timestamp when activity occurred. Defaults to now if not provided.',
          },
          use_chat_sources: {
            type: 'boolean',
            description: 'If true, automatically attach any documents referenced in the current chat conversation as citations/sources for this activity. Default true when creating from chat context.',
          },
        },
        required: ['deal_id', 'type', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_deal_stage',
      description: 'Update the stage of a deal in the pipeline. IMPORTANT: This requires user confirmation before executing.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'The ID of the deal to update.',
          },
          new_stage: {
            type: 'string',
            enum: ['lead', 'application', 'underwriting', 'approved', 'funded', 'closed', 'declined'],
            description: 'The new stage for the deal.',
          },
          reason: {
            type: 'string',
            description: 'Reason for the stage change.',
          },
          confirmed: {
            type: 'boolean',
            description: 'Whether the user has confirmed this action. Must be true to execute.',
          },
        },
        required: ['deal_id', 'new_stage', 'confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_analytics',
      description: 'Get pipeline analytics including days in stage, activity counts, and deal values.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'The ID of a specific deal. If not provided, returns analytics for all deals.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_deal_activities',
      description: 'Get activity history, optionally filtered by deal.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'Optional deal ID to filter activities. If not provided, returns all activities.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of activities to return. Default is 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_schematic',
      description: 'Retrieve a schematic diagram and service documentation for a machine component. Use this when the user asks about parts, components, maintenance procedures, or service information for equipment.',
      parameters: {
        type: 'object',
        properties: {
          component_name: {
            type: 'string',
            description: 'The name of the component or part to look up (e.g., "hydraulic pump", "motor assembly", "control valve").',
          },
          machine_model: {
            type: 'string',
            description: 'The machine model or equipment identifier (optional).',
          },
          additional_context: {
            type: 'string',
            description: 'Any additional context about what the user is looking for (e.g., "replacement procedure", "wiring diagram").',
          },
        },
        required: ['component_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'Draft an email with a summary of research and findings from the current conversation. Use this when the user wants to send an email summarizing the discussion, analysis, or recommendations. The email will be created as a draft in Outlook with sources/citations from documents referenced in the chat.',
      parameters: {
        type: 'object',
        properties: {
          deal_id: {
            type: 'string',
            description: 'Optional deal ID to associate this email with. Used to fetch deal details for context.',
          },
          to: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of recipient email addresses.',
          },
          subject: {
            type: 'string',
            description: 'Email subject line.',
          },
          summary: {
            type: 'string',
            description: 'The main content/summary to include in the email body. Should be well-formatted and professional.',
          },
          recipient_name: {
            type: 'string',
            description: 'Optional name of the recipient for personalized greeting.',
          },
          include_sources: {
            type: 'boolean',
            description: 'Whether to include document citations/sources at the end of the email. Default is true.',
          },
        },
        required: ['to', 'subject', 'summary'],
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
 * Find deal by fuzzy name matching
 */
function findDealByName(searchTerm: string): { deal: Deal; score: number }[] {
  const allDeals = getAllDeals();
  const results: { deal: Deal; score: number }[] = [];
  const searchLower = searchTerm.toLowerCase();

  for (const deal of allDeals) {
    // Check various fields for matches
    const fields = [
      deal.borrowerName,
      deal.dealNumber,
      deal.assignedTo || '',
      deal.collateralDescription || '',
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
      results.push({ deal, score: bestScore });
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
 * Chat context passed to tool execution
 * Contains sources referenced during the conversation
 */
export interface ChatToolContext {
  ragSources: Array<{
    fileName: string;
    filePath: string;
    section?: string;
    pageNumber?: number;
    source?: 'local' | 'onedrive';
    oneDriveId?: string;
    relevanceScore?: number;
    fromOtherDeal?: boolean;
    dealId?: string;
  }>;
}

/**
 * Execute a tool call and return the result
 */
export async function executeTool(
  toolName: string, 
  args: Record<string, unknown>,
  context?: ChatToolContext
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'get_deals':
        return executeGetDeals(args.stage_filter as string | undefined);

      case 'find_deal_by_name':
        return executeFindDealByName(args.search_term as string);

      case 'get_deal_details':
        return executeGetDealDetails(args.deal_id as string);

      case 'add_deal_activity':
        return executeAddDealActivity(args, context);

      case 'update_deal_stage':
        return executeUpdateDealStage(args);

      case 'get_pipeline_analytics':
        return executeGetPipelineAnalytics(args.deal_id as string | undefined);

      case 'get_deal_activities':
        return executeGetDealActivities(args);

      case 'retrieve_schematic':
        return executeRetrieveSchematic(args);

      case 'draft_email':
        return executeDraftEmail(args, context);

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

function executeGetDeals(stageFilter?: string): ToolResult {
  const allDeals = getAllDeals();

  let filtered = allDeals;
  if (stageFilter && stageFilter !== 'all') {
    filtered = allDeals.filter(deal => deal.stage === stageFilter);
  }

  const summary = filtered.map(deal => ({
    id: deal.id,
    dealNumber: deal.dealNumber,
    borrowerName: deal.borrowerName,
    loanAmount: deal.loanAmount,
    stage: deal.stage,
    priority: deal.priority,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${filtered.length} deals${stageFilter && stageFilter !== 'all' ? ` in "${stageFilter}" stage` : ''}.`,
  };
}

function executeFindDealByName(searchTerm: string): ToolResult {
  const results = findDealByName(searchTerm);

  if (results.length === 0) {
    return {
      success: true,
      data: [],
      message: `No deals found matching "${searchTerm}".`,
    };
  }

  const matches = results.slice(0, 5).map(r => ({
    id: r.deal.id,
    dealNumber: r.deal.dealNumber,
    borrowerName: r.deal.borrowerName,
    loanAmount: r.deal.loanAmount,
    stage: r.deal.stage,
    confidence: Math.round(r.score * 100),
  }));

  return {
    success: true,
    data: matches,
    message: `Found ${results.length} deals matching "${searchTerm}". Top match: ${results[0].deal.borrowerName} (${Math.round(results[0].score * 100)}% confidence).`,
  };
}

function executeGetDealDetails(dealId: string): ToolResult {
  const deal = getDeal(dealId);

  if (!deal) {
    return { success: false, error: `Deal with ID "${dealId}" not found.` };
  }

  // Get recent activities
  const activities = getActivitiesForDeal(dealId).slice(0, 5);

  // Calculate basic analytics
  const daysSinceCreated = deal.createdAt 
    ? Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  const allActivities = getActivitiesForDeal(dealId);
  const lastActivity = allActivities[0];
  const daysSinceLastActivity = lastActivity?.performedAt
    ? Math.floor((Date.now() - new Date(lastActivity.performedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    success: true,
    data: {
      deal,
      recentActivities: activities.map((activity: DealActivity) => ({
        id: activity.id,
        type: activity.type,
        date: activity.performedAt,
        description: activity.description,
        performedBy: activity.performedBy,
      })),
      analytics: {
        daysSinceCreated,
        daysSinceLastActivity,
        totalActivities: allActivities.length,
      },
    },
    message: `${deal.borrowerName} - $${deal.loanAmount.toLocaleString()} loan is currently in "${deal.stage}" stage. ${activities.length > 0 ? `Last activity: ${activities[0].type} on ${new Date(activities[0].performedAt).toLocaleDateString()}.` : 'No activity recorded yet.'}`,
  };
}

function executeAddDealActivity(args: Record<string, unknown>, context?: ChatToolContext): ToolResult {
  const dealId = args.deal_id as string;
  const deal = getDeal(dealId);

  if (!deal) {
    return { success: false, error: `Deal with ID "${dealId}" not found.` };
  }

  const useChatSources = args.use_chat_sources !== false; // Default to true

  const activityData = {
    dealId,
    type: args.type as DealActivity['type'],
    description: args.description as string,
    performedBy: (args.performed_by as string) || null,
    performedAt: (args.performed_at as string) || new Date().toISOString(),
    metadata: null,
  };

  const activity = createDealActivity(activityData);

  // Attach sources from chat context if requested
  // Filter to high-relevance sources only (>= activity threshold) and exclude sources from other deals
  let sourcesAdded = 0;
  if (useChatSources && context?.ragSources && context.ragSources.length > 0 && activity.id) {
    const { activityThreshold } = getRelevanceThresholds();
    
    // Filter and sort by relevance score
    const highRelevanceSources = context.ragSources
      .filter(s => {
        // Include if no score (backwards compat) or above threshold
        const hasGoodScore = s.relevanceScore === undefined || s.relevanceScore >= activityThreshold;
        // Exclude sources from other deals
        const isCurrentDeal = !s.fromOtherDeal;
        return hasGoodScore && isCurrentDeal;
      })
      .sort((a, b) => (b.relevanceScore ?? 1) - (a.relevanceScore ?? 1));
    
    // De-duplicate sources by file path
    const seenPaths = new Set<string>();
    for (const ragSource of highRelevanceSources) {
      if (!seenPaths.has(ragSource.filePath)) {
        seenPaths.add(ragSource.filePath);
        try {
          addActivitySource(activity.id, {
            fileName: ragSource.fileName,
            filePath: ragSource.filePath,
            section: ragSource.section,
            pageNumber: ragSource.pageNumber,
            source: ragSource.source,
            oneDriveId: ragSource.oneDriveId,
          });
          sourcesAdded++;
        } catch (err) {
          console.error('[ChatTools] Failed to add activity source:', err);
        }
      }
    }
    
    const skippedCount = context.ragSources.length - highRelevanceSources.length;
    if (skippedCount > 0) {
      console.log(`[ChatTools] Skipped ${skippedCount} low-relevance or other-deal sources for activity`);
    }
  }

  const sourceMsg = sourcesAdded > 0 
    ? ` Attached ${sourcesAdded} document citation${sourcesAdded > 1 ? 's' : ''} from the conversation.` 
    : '';

  return {
    success: true,
    data: { ...activity, sourcesAdded },
    message: `✅ Added ${activityData.type} activity for ${deal.borrowerName}'s deal.${sourceMsg}`,
    actionTaken: 'activity_created',
  };
}

function executeUpdateDealStage(args: Record<string, unknown>): ToolResult {
  const dealId = args.deal_id as string;
  const newStage = args.new_stage as DealStage;
  const confirmed = args.confirmed as boolean;
  const reason = args.reason as string | undefined;

  const deal = getDeal(dealId);

  if (!deal) {
    return { success: false, error: `Deal with ID "${dealId}" not found.` };
  }

  // If not confirmed, ask for confirmation
  if (!confirmed) {
    return {
      success: false,
      requiresConfirmation: true,
      message: `⚠️ Please confirm: Move ${deal.borrowerName}'s deal from "${deal.stage}" to "${newStage}"${reason ? ` (Reason: ${reason})` : ''}? Reply with "yes" or "confirm" to proceed.`,
      data: {
        pendingAction: 'update_deal_stage',
        deal_id: dealId,
        current_stage: deal.stage,
        new_stage: newStage,
        reason,
      },
    };
  }

  // Execute the update
  const updated = updateDeal(dealId, { stage: newStage });

  if (!updated) {
    return { success: false, error: 'Failed to update deal stage.' };
  }

  return {
    success: true,
    data: updated,
    message: `✅ Moved ${deal.borrowerName}'s deal from "${deal.stage}" to "${newStage}".`,
    actionTaken: 'deal_stage_updated',
  };
}

function executeGetPipelineAnalytics(dealId?: string): ToolResult {
  if (dealId) {
    const deal = getDeal(dealId);
    if (!deal) {
      return { success: false, error: `Deal with ID "${dealId}" not found.` };
    }

    const activities = getActivitiesForDeal(dealId);
    const daysSinceCreated = deal.createdAt 
      ? Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      success: true,
      data: {
        deal,
        daysSinceCreated,
        totalActivities: activities.length,
      },
      message: `Analytics for ${deal.borrowerName}: ${daysSinceCreated} days in pipeline, ${activities.length} total activities, currently in "${deal.stage}" stage.`,
    };
  }

  // Get analytics for all deals
  const analytics = calculatePipelineAnalytics();

  const stageMessages = Object.entries(analytics.byStage)
    .filter(([_, data]) => data.count > 0)
    .map(([stage, data]) => `${stage}: ${data.count} ($${data.totalValue.toLocaleString()})`)
    .join(', ');

  return {
    success: true,
    data: analytics,
    message: `Pipeline has ${analytics.totalDeals} deals totaling $${analytics.totalPipelineValue.toLocaleString()}. ${stageMessages || 'No deals in pipeline.'}`,
  };
}

function executeGetDealActivities(args: Record<string, unknown>): ToolResult {
  const dealId = args.deal_id as string | undefined;
  const limit = (args.limit as number) || 20;

  let activities: DealActivity[];
  let contextMessage: string;

  if (dealId) {
    const deal = getDeal(dealId);
    if (!deal) {
      return { success: false, error: `Deal with ID "${dealId}" not found.` };
    }
    activities = getActivitiesForDeal(dealId).slice(0, limit);
    contextMessage = `for ${deal.borrowerName}'s deal`;
  } else {
    activities = getAllActivities().slice(0, limit);
    contextMessage = 'across all deals';
  }

  const summary = activities.map(activity => ({
    id: activity.id,
    dealId: activity.dealId,
    type: activity.type,
    date: activity.performedAt,
    description: activity.description,
    performedBy: activity.performedBy,
  }));

  return {
    success: true,
    data: summary,
    message: `Found ${activities.length} activities ${contextMessage}.`,
  };
}

async function executeRetrieveSchematic(args: Record<string, unknown>): Promise<ToolResult> {
  const componentName = args.component_name as string;
  const machineModel = args.machine_model as string | undefined;
  const additionalContext = args.additional_context as string | undefined;

  if (!componentName) {
    return { success: false, error: 'Component name is required.' };
  }

  const toolCall: SchematicToolCall = {
    component_name: componentName,
    machine_model: machineModel,
    additional_context: additionalContext,
  };

  const response = await processSchematicToolCall(toolCall);

  if (response.status === 'error') {
    return {
      success: false,
      error: response.message || 'Failed to retrieve schematic.',
    };
  }

  return {
    success: true,
    data: {
      componentId: response.component_id,
      componentName: response.component_name || componentName,
      machineModel: response.machine_model || machineModel,
      imagePath: response.image_path,
      manualContext: response.manual_context,
    },
    message: `Retrieved schematic for ${response.component_name || componentName}${response.machine_model ? ` (${response.machine_model})` : ''}.`,
    actionTaken: 'schematic_retrieved',
  };
}

async function executeDraftEmail(args: Record<string, unknown>, context?: ChatToolContext): Promise<ToolResult> {
  const to = args.to as string[];
  const subject = args.subject as string;
  const summary = args.summary as string;
  const recipientName = args.recipient_name as string | undefined;
  const includeSources = args.include_sources !== false; // Default to true
  const dealId = args.deal_id as string | undefined;

  if (!to || to.length === 0) {
    return { success: false, error: 'At least one recipient email address is required.' };
  }

  if (!subject) {
    return { success: false, error: 'Email subject is required.' };
  }

  if (!summary) {
    return { success: false, error: 'Email summary/body content is required.' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = to.filter(email => !emailRegex.test(email));
  if (invalidEmails.length > 0) {
    return { success: false, error: `Invalid email address(es): ${invalidEmails.join(', ')}` };
  }

  // Get deal context if provided
  let dealContext = '';
  if (dealId) {
    const deal = getDeal(dealId);
    if (deal) {
      dealContext = `\n\nDeal Reference: ${deal.borrowerName} - ${deal.dealNumber}`;
    }
  }

  // Build sources from chat context
  const sources = includeSources && context?.ragSources ? context.ragSources : [];

  // Create OneDrive sharing links for sources that have oneDriveId
  const oneDriveSourceIds = sources
    .filter(s => (s as { oneDriveId?: string }).oneDriveId)
    .map(s => (s as { oneDriveId: string }).oneDriveId);
  
  let sharingLinks = new Map<string, string>();
  if (oneDriveSourceIds.length > 0) {
    console.log('[ChatTools] Creating sharing links for', oneDriveSourceIds.length, 'OneDrive sources');
    sharingLinks = await createOneDriveSharingLinks(oneDriveSourceIds);
    console.log('[ChatTools] Created', sharingLinks.size, 'sharing links');
  }

  // Build sources with sharing links
  const sourcesWithLinks = sources.map(s => {
    const oneDriveId = (s as { oneDriveId?: string }).oneDriveId;
    return {
      fileName: s.fileName,
      filePath: s.filePath,
      section: s.section,
      shareLink: oneDriveId ? sharingLinks.get(oneDriveId) : undefined,
    };
  });

  // Generate email body with summary and sources (including sharing links)
  const emailBody = generateEmailBody(
    summary + dealContext,
    sourcesWithLinks,
    true,
    recipientName
  );

  // Create the draft in Outlook AND open compose window
  const draft: EmailDraft = {
    to,
    subject,
    body: emailBody,
    bodyType: 'text',
  };

  const result = await createAndOpenEmailDraft(draft);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Failed to create email draft.',
    };
  }

  // Log email activity if we have a deal - use current timestamp for proper ordering
  if (dealId) {
    try {
      const now = new Date().toISOString();
      const activityData = {
        dealId,
        type: 'email' as const,
        description: `Email drafted to ${to.join(', ')}: "${subject}"`,
        performedBy: null,
        performedAt: now,
        metadata: JSON.stringify({
          draftId: result.data?.id,
          recipients: to,
          subject,
          action: 'drafted',
        }),
      };
      const activity = createDealActivity(activityData);
      console.log('[ChatTools] Email activity logged:', activity.id);
    } catch (err) {
      console.error('[ChatTools] Failed to log email activity:', err);
    }
  }

  const sourcesMsg = sources.length > 0 
    ? ` Included ${sources.length} document citation${sources.length > 1 ? 's' : ''}.` 
    : '';

  return {
    success: true,
    data: {
      draftId: result.data?.id,
      webLink: result.data?.webLink,
      to,
      subject,
      sourcesIncluded: sources.length,
    },
    message: `✅ Email compose window opened for ${to.join(', ')}.${sourcesMsg} Review and send from the Outlook window.`,
    actionTaken: 'email_drafted',
  };
}

// ============ Context Builder ============

/**
 * Build deal context for the system prompt
 * @param currentDealId - Optional ID of the currently focused deal
 */
export function buildDealContext(currentDealId?: string): string {
  const deals = getAllDeals();

  if (deals.length === 0) {
    return 'No deals have been added to the pipeline yet.';
  }

  // Find the current deal if specified
  const currentDeal = currentDealId ? deals.find(d => d.id === currentDealId) : null;
  
  // Build current deal focus section if applicable
  let currentDealSection = '';
  if (currentDeal) {
    currentDealSection = `\n--- CURRENT DEAL FOCUS ---\nYou are currently focused on: ${currentDeal.borrowerName} (${currentDeal.dealNumber})\nStage: ${currentDeal.stage} | Amount: $${currentDeal.loanAmount.toLocaleString()}${currentDeal.priority === 'high' ? ' | ⚠️ HIGH PRIORITY' : ''}\nWhen answering questions, prioritize information related to this deal.\n--- END CURRENT DEAL FOCUS ---\n`;
  }

  const dealList = deals.map(deal => {
    const isCurrent = deal.id === currentDealId;
    const marker = isCurrent ? '▶ ' : '- ';
    return `${marker}${deal.borrowerName} [${deal.dealNumber}] - $${deal.loanAmount.toLocaleString()} - Stage: ${deal.stage}${deal.priority === 'high' ? ' ⚠️ HIGH PRIORITY' : ''}${isCurrent ? ' (CURRENT)' : ''}`;
  }).join('\n');

  // Get recent activities across all deals
  const recentActivities = getAllActivities().slice(0, 5);
  const recentActivitiesText = recentActivities.length > 0
    ? '\n\nRecent activity:\n' + recentActivities.map(activity => {
        const deal = getDeal(activity.dealId);
        return `- ${new Date(activity.performedAt).toLocaleDateString()}: ${activity.type} for ${deal?.borrowerName || 'Unknown'} - ${activity.description}`;
      }).join('\n')
    : '';

  return `${currentDealSection}Deal Pipeline (${deals.length} deals):\n${dealList}${recentActivitiesText}`;
}
