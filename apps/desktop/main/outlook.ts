/**
 * Outlook Email Integration Module
 * Uses Microsoft Graph API for email drafting and sending
 * Leverages existing OneDrive OAuth tokens (same Azure app registration)
 */

import { shell } from 'electron';
import { getAuthenticatedFetch } from './onedrive';

// Microsoft Graph API
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Email draft interface
 */
export interface EmailDraft {
  id?: string;
  subject: string;
  body: string;
  bodyType?: 'text' | 'html';
  to: string[];
  cc?: string[];
  bcc?: string[];
  importance?: 'low' | 'normal' | 'high';
}

/**
 * Email draft response from Graph API
 */
export interface EmailDraftResponse {
  id: string;
  webLink: string;
  subject: string;
  createdDateTime: string;
}

/**
 * Result of email operations
 */
export interface EmailResult {
  success: boolean;
  data?: EmailDraftResponse;
  error?: string;
}

/**
 * Create an email draft in Outlook
 * The draft will appear in the user's Drafts folder
 */
export async function createEmailDraft(draft: EmailDraft): Promise<EmailResult> {
  try {
    const authenticatedFetch = await getAuthenticatedFetch();
    
    if (!authenticatedFetch) {
      return {
        success: false,
        error: 'Not authenticated with Microsoft. Please sign in to OneDrive/Outlook first.',
      };
    }

    // Build the message object for Graph API
    const message = {
      subject: draft.subject,
      body: {
        contentType: draft.bodyType === 'html' ? 'HTML' : 'Text',
        content: draft.body,
      },
      toRecipients: draft.to.map(email => ({
        emailAddress: { address: email },
      })),
      ccRecipients: draft.cc?.map(email => ({
        emailAddress: { address: email },
      })) || [],
      bccRecipients: draft.bcc?.map(email => ({
        emailAddress: { address: email },
      })) || [],
      importance: draft.importance || 'normal',
    };

    const response = await authenticatedFetch(`${GRAPH_BASE_URL}/me/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Failed to create draft:', errorText);
      
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'Mail permissions not granted. Please sign out and sign back in to grant email access.',
        };
      }
      
      return {
        success: false,
        error: `Failed to create email draft: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    console.log('[Outlook] Email draft created:', data.id);

    return {
      success: true,
      data: {
        id: data.id,
        webLink: data.webLink || `https://outlook.office.com/mail/drafts/id/${data.id}`,
        subject: data.subject,
        createdDateTime: data.createdDateTime,
      },
    };
  } catch (error) {
    console.error('[Outlook] Error creating email draft:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error creating email draft',
    };
  }
}

/**
 * Create an email draft and open it in Outlook for editing/sending
 * This opens Outlook to the drafts folder where the user can click to edit/send
 */
export async function createAndOpenEmailDraft(draft: EmailDraft): Promise<EmailResult> {
  // First create the draft
  const result = await createEmailDraft(draft);
  
  if (!result.success || !result.data) {
    return result;
  }

  // Open Outlook to the Drafts folder - the user's new draft will be at the top
  // This is more reliable than trying to open a specific draft URL which often has issues
  const draftsUrl = 'https://outlook.office.com/mail/drafts';
  
  try {
    await shell.openExternal(draftsUrl);
    console.log('[Outlook] Opened Outlook Drafts folder');
  } catch (error) {
    console.error('[Outlook] Failed to open drafts:', error);
    // Still return success since the draft was created
  }

  return result;
}

/**
 * Send an email draft that was previously created
 */
export async function sendEmailDraft(draftId: string): Promise<EmailResult> {
  try {
    const authenticatedFetch = await getAuthenticatedFetch();
    
    if (!authenticatedFetch) {
      return {
        success: false,
        error: 'Not authenticated with Microsoft. Please sign in first.',
      };
    }

    const response = await authenticatedFetch(`${GRAPH_BASE_URL}/me/messages/${draftId}/send`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Failed to send draft:', errorText);
      return {
        success: false,
        error: `Failed to send email: ${response.status} ${response.statusText}`,
      };
    }

    console.log('[Outlook] Email sent successfully:', draftId);
    return { success: true };
  } catch (error) {
    console.error('[Outlook] Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending email',
    };
  }
}

/**
 * Send an email directly without creating a draft first
 */
export async function sendEmailDirect(draft: EmailDraft): Promise<EmailResult> {
  try {
    const authenticatedFetch = await getAuthenticatedFetch();
    
    if (!authenticatedFetch) {
      return {
        success: false,
        error: 'Not authenticated with Microsoft. Please sign in first.',
      };
    }

    // Build the message object for Graph API
    const payload = {
      message: {
        subject: draft.subject,
        body: {
          contentType: draft.bodyType === 'html' ? 'HTML' : 'Text',
          content: draft.body,
        },
        toRecipients: draft.to.map(email => ({
          emailAddress: { address: email },
        })),
        ccRecipients: draft.cc?.map(email => ({
          emailAddress: { address: email },
        })) || [],
        bccRecipients: draft.bcc?.map(email => ({
          emailAddress: { address: email },
        })) || [],
        importance: draft.importance || 'normal',
      },
      saveToSentItems: true,
    };

    const response = await authenticatedFetch(`${GRAPH_BASE_URL}/me/sendMail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Failed to send email:', errorText);
      
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'Mail permissions not granted. Please sign out and sign back in to grant email access.',
        };
      }
      
      return {
        success: false,
        error: `Failed to send email: ${response.status} ${response.statusText}`,
      };
    }

    console.log('[Outlook] Email sent directly');
    return { success: true };
  } catch (error) {
    console.error('[Outlook] Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error sending email',
    };
  }
}

/**
 * Delete an email draft
 */
export async function deleteEmailDraft(draftId: string): Promise<EmailResult> {
  try {
    const authenticatedFetch = await getAuthenticatedFetch();
    
    if (!authenticatedFetch) {
      return {
        success: false,
        error: 'Not authenticated with Microsoft. Please sign in first.',
      };
    }

    const response = await authenticatedFetch(`${GRAPH_BASE_URL}/me/messages/${draftId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Failed to delete draft:', errorText);
      return {
        success: false,
        error: `Failed to delete email draft: ${response.status} ${response.statusText}`,
      };
    }

    console.log('[Outlook] Email draft deleted:', draftId);
    return { success: true };
  } catch (error) {
    console.error('[Outlook] Error deleting draft:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error deleting draft',
    };
  }
}

/**
 * Get user's email drafts
 */
export async function getEmailDrafts(limit: number = 10): Promise<{ success: boolean; drafts?: EmailDraftResponse[]; error?: string }> {
  try {
    const authenticatedFetch = await getAuthenticatedFetch();
    
    if (!authenticatedFetch) {
      return {
        success: false,
        error: 'Not authenticated with Microsoft. Please sign in first.',
      };
    }

    const response = await authenticatedFetch(
      `${GRAPH_BASE_URL}/me/mailFolders/drafts/messages?$top=${limit}&$select=id,subject,createdDateTime,webLink`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Outlook] Failed to get drafts:', errorText);
      return {
        success: false,
        error: `Failed to get email drafts: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    const drafts: EmailDraftResponse[] = data.value.map((msg: { id: string; subject: string; createdDateTime: string; webLink?: string }) => ({
      id: msg.id,
      subject: msg.subject,
      createdDateTime: msg.createdDateTime,
      webLink: msg.webLink || `https://outlook.office.com/mail/drafts/id/${msg.id}`,
    }));

    return { success: true, drafts };
  } catch (error) {
    console.error('[Outlook] Error getting drafts:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error getting drafts',
    };
  }
}

/**
 * Format sources as a clean citation list for email body
 * Only includes SharePoint/OneDrive links (no local file paths)
 */
export function formatSourcesForEmail(
  sources: Array<{ fileName: string; filePath: string; section?: string; pageNumber?: number; shareLink?: string }>
): string {
  if (!sources || sources.length === 0) {
    return '';
  }

  // Filter to only sources with SharePoint/OneDrive links
  const sourcesWithLinks = sources.filter(s => s.shareLink);
  
  if (sourcesWithLinks.length === 0) {
    return '';
  }

  const lines = ['', '────────────────────────────────', '', 'Sources:', ''];
  
  sourcesWithLinks.forEach((source) => {
    let citation = `  • ${source.fileName}`;
    if (source.pageNumber) {
      citation += ` (p. ${source.pageNumber})`;
    }
    lines.push(citation);
    lines.push(`    ${source.shareLink}`);
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate a clean, professional email body with summary and sources
 */
export function generateEmailBody(
  summary: string,
  sources: Array<{ fileName: string; filePath: string; section?: string; pageNumber?: number; shareLink?: string }>,
  includeGreeting: boolean = true,
  recipientName?: string
): string {
  const parts: string[] = [];

  // Greeting
  if (includeGreeting) {
    parts.push(recipientName ? `Hi ${recipientName},` : 'Hi,');
    parts.push('');
  }

  // Main content - the summary
  parts.push(summary);

  // Sources section (only if there are SharePoint links)
  const sourcesSection = formatSourcesForEmail(sources);
  if (sourcesSection) {
    parts.push(sourcesSection);
  }

  // Sign-off
  parts.push('');
  parts.push('Best regards');

  return parts.join('\n');
}
