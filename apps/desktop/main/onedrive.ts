/**
 * OneDrive Integration Module
 * Implements OAuth 2.0 PKCE flow for Microsoft Graph API
 * 
 * Azure App Registration Details:
 * - Client ID: cebfbb57-ffb1-460c-b554-00de4019ab1c
 * - Redirect URI: http://localhost:3847/callback
 */

import { shell } from 'electron';
import * as http from 'http';
import * as crypto from 'crypto';
import * as keytar from 'keytar';
import { URL } from 'url';

// Azure App Registration
const CLIENT_ID = 'cebfbb57-ffb1-460c-b554-00de4019ab1c';
const REDIRECT_PORT = 3847;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = ['Files.Read', 'Files.Read.All', 'Files.ReadWrite.All', 'User.Read', 'Mail.ReadWrite', 'Mail.Send', 'offline_access'];

// Microsoft OAuth endpoints
const AUTHORITY = 'https://login.microsoftonline.com/common';
const AUTH_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/authorize`;
const TOKEN_ENDPOINT = `${AUTHORITY}/oauth2/v2.0/token`;

// Microsoft Graph API
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// Keychain storage
const SERVICE_NAME = 'DrasillCloud';
const ONEDRIVE_ACCESS_TOKEN = 'onedrive-access-token';
const ONEDRIVE_REFRESH_TOKEN = 'onedrive-refresh-token';
const ONEDRIVE_TOKEN_EXPIRY = 'onedrive-token-expiry';
const ONEDRIVE_USER_INFO = 'onedrive-user-info';

// In-memory token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * OneDrive item interface
 */
export interface OneDriveItem {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  mimeType?: string;
  webUrl?: string;
  downloadUrl?: string;
  lastModified?: string;
}

/**
 * OneDrive auth status
 */
export interface OneDriveAuthStatus {
  isAuthenticated: boolean;
  userEmail?: string;
  userName?: string;
}

/**
 * Generate random string for PKCE
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate code challenge for PKCE
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Store tokens in keychain
 */
async function storeTokens(
  access: string,
  refresh: string,
  expiresIn: number,
  userInfo?: { email: string; name: string }
): Promise<void> {
  try {
    const expiry = Date.now() + expiresIn * 1000;
    await keytar.setPassword(SERVICE_NAME, ONEDRIVE_ACCESS_TOKEN, access);
    await keytar.setPassword(SERVICE_NAME, ONEDRIVE_REFRESH_TOKEN, refresh);
    await keytar.setPassword(SERVICE_NAME, ONEDRIVE_TOKEN_EXPIRY, expiry.toString());
    if (userInfo) {
      await keytar.setPassword(SERVICE_NAME, ONEDRIVE_USER_INFO, JSON.stringify(userInfo));
    }
    accessToken = access;
    tokenExpiry = expiry;
    console.log('[OneDrive] Tokens stored successfully');
  } catch (error) {
    console.error('[OneDrive] Failed to store tokens:', error);
    throw error;
  }
}

/**
 * Load tokens from keychain
 */
async function loadTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  expiry: number;
}> {
  try {
    const access = await keytar.getPassword(SERVICE_NAME, ONEDRIVE_ACCESS_TOKEN);
    const refresh = await keytar.getPassword(SERVICE_NAME, ONEDRIVE_REFRESH_TOKEN);
    const expiryStr = await keytar.getPassword(SERVICE_NAME, ONEDRIVE_TOKEN_EXPIRY);
    const expiry = expiryStr ? parseInt(expiryStr, 10) : 0;
    return { accessToken: access, refreshToken: refresh, expiry };
  } catch (error) {
    console.error('[OneDrive] Failed to load tokens:', error);
    return { accessToken: null, refreshToken: null, expiry: 0 };
  }
}

/**
 * Clear tokens from keychain
 */
async function clearTokens(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, ONEDRIVE_ACCESS_TOKEN);
    await keytar.deletePassword(SERVICE_NAME, ONEDRIVE_REFRESH_TOKEN);
    await keytar.deletePassword(SERVICE_NAME, ONEDRIVE_TOKEN_EXPIRY);
    await keytar.deletePassword(SERVICE_NAME, ONEDRIVE_USER_INFO);
    accessToken = null;
    tokenExpiry = 0;
    console.log('[OneDrive] Tokens cleared');
  } catch (error) {
    console.error('[OneDrive] Failed to clear tokens:', error);
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OneDrive] Token exchange failed:', error);
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OneDrive] Token refresh failed:', error);
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
  };
}

/**
 * Get valid access token (refresh if needed)
 */
async function getValidAccessToken(): Promise<string | null> {
  // Check in-memory cache first
  if (accessToken && tokenExpiry > Date.now() + 60000) {
    return accessToken;
  }

  // Load from keychain
  const tokens = await loadTokens();
  
  if (!tokens.accessToken) {
    return null;
  }

  // If token is still valid, use it
  if (tokens.expiry > Date.now() + 60000) {
    accessToken = tokens.accessToken;
    tokenExpiry = tokens.expiry;
    return accessToken;
  }

  // Token expired, try to refresh
  if (tokens.refreshToken) {
    try {
      const newTokens = await refreshAccessToken(tokens.refreshToken);
      await storeTokens(newTokens.accessToken, newTokens.refreshToken, newTokens.expiresIn);
      return newTokens.accessToken;
    } catch (error) {
      console.error('[OneDrive] Failed to refresh token:', error);
      await clearTokens();
      return null;
    }
  }

  return null;
}

/**
 * Get an authenticated fetch function for Microsoft Graph API
 * Used by other modules (e.g., outlook.ts) to make authenticated requests
 */
export async function getAuthenticatedFetch(): Promise<typeof fetch | null> {
  const token = await getValidAccessToken();
  if (!token) {
    return null;
  }

  // Return a fetch function that automatically adds the auth header
  return (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
}

/**
 * Get user info from Microsoft Graph
 */
async function getUserInfo(token: string): Promise<{ email: string; name: string }> {
  const response = await fetch(`${GRAPH_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  const data = await response.json();
  return {
    email: data.mail || data.userPrincipalName || '',
    name: data.displayName || '',
  };
}

/**
 * Start OneDrive OAuth flow
 * Opens browser for Microsoft login and handles callback
 */
export async function startOneDriveAuth(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateRandomString(64);
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    // Build authorization URL
    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', SCOPES.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    let server: http.Server | null = null;
    let resolved = false;

    const cleanup = () => {
      if (server) {
        server.close();
        server = null;
      }
    };

    // Start local server to receive callback
    server = http.createServer(async (req, res) => {
      if (resolved) return;

      const url = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);
      
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>${errorDescription || error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          resolved = true;
          cleanup();
          resolve({ success: false, error: errorDescription || error });
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Invalid Response</h1>
                <p>Invalid authorization response. Please try again.</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          resolved = true;
          cleanup();
          resolve({ success: false, error: 'Invalid authorization response' });
          return;
        }

        try {
          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, codeVerifier);
          
          // Get user info
          const userInfo = await getUserInfo(tokens.accessToken);
          
          // Store tokens
          await storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn, userInfo);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>✅ Authentication Successful!</h1>
                <p>Welcome, ${userInfo.name}!</p>
                <p>You can close this window and return to Drasill Finance.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);

          resolved = true;
          cleanup();
          resolve({ success: true });
        } catch (err) {
          console.error('[OneDrive] Auth error:', err);
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Error</h1>
                <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          resolved = true;
          cleanup();
          resolve({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`[OneDrive] Auth callback server listening on port ${REDIRECT_PORT}`);
      // Open browser for login
      shell.openExternal(authUrl.toString());
    });

    server.on('error', (err) => {
      console.error('[OneDrive] Server error:', err);
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: `Server error: ${err.message}` });
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Authentication timed out' });
      }
    }, 5 * 60 * 1000);
  });
}

/**
 * Get OneDrive authentication status
 */
export async function getOneDriveAuthStatus(): Promise<OneDriveAuthStatus> {
  const token = await getValidAccessToken();
  
  if (!token) {
    return { isAuthenticated: false };
  }

  try {
    const userInfoStr = await keytar.getPassword(SERVICE_NAME, ONEDRIVE_USER_INFO);
    if (userInfoStr) {
      const userInfo = JSON.parse(userInfoStr);
      return {
        isAuthenticated: true,
        userEmail: userInfo.email,
        userName: userInfo.name,
      };
    }

    // Fetch user info if not cached
    const userInfo = await getUserInfo(token);
    await keytar.setPassword(SERVICE_NAME, ONEDRIVE_USER_INFO, JSON.stringify(userInfo));
    
    return {
      isAuthenticated: true,
      userEmail: userInfo.email,
      userName: userInfo.name,
    };
  } catch (error) {
    console.error('[OneDrive] Failed to get auth status:', error);
    return { isAuthenticated: false };
  }
}

/**
 * Logout from OneDrive
 */
export async function logoutOneDrive(): Promise<boolean> {
  await clearTokens();
  return true;
}

/**
 * List folder contents from OneDrive
 * @param folderId - Folder ID (empty or 'root' for root folder)
 */
export async function listOneDriveFolder(folderId?: string): Promise<OneDriveItem[]> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated with OneDrive');
  }

  // Build the API URL
  let url: string;
  if (!folderId || folderId === 'root') {
    url = `${GRAPH_BASE_URL}/me/drive/root/children`;
  } else {
    url = `${GRAPH_BASE_URL}/me/drive/items/${folderId}/children`;
  }

  // Add query parameters for additional data
  const params = new URLSearchParams({
    '$select': 'id,name,folder,file,size,lastModifiedDateTime,webUrl,@microsoft.graph.downloadUrl,parentReference',
    '$orderby': 'name',
  });

  const response = await fetch(`${url}?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[OneDrive] List folder failed:', error);
    throw new Error(`Failed to list folder: ${response.statusText}`);
  }

  const data = await response.json();
  const items: OneDriveItem[] = [];

  for (const item of data.value) {
    const isFolder = !!item.folder;
    const parentPath = item.parentReference?.path?.replace('/drive/root:', '') || '';
    
    items.push({
      id: item.id,
      name: item.name,
      path: `${parentPath}/${item.name}`.replace(/^\//, ''),
      isDirectory: isFolder,
      size: item.size,
      mimeType: item.file?.mimeType,
      webUrl: item.webUrl,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      lastModified: item.lastModifiedDateTime,
    });
  }

  // Sort: folders first, then files
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

/**
 * Read file content from OneDrive
 * @param itemId - OneDrive item ID
 */
export async function readOneDriveFile(itemId: string): Promise<{ content: string; mimeType: string }> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated with OneDrive');
  }

  // First get the file metadata to get download URL and mime type
  const metaResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}?$select=@microsoft.graph.downloadUrl,file,name`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metaResponse.ok) {
    throw new Error(`Failed to get file metadata: ${metaResponse.statusText}`);
  }

  const metadata = await metaResponse.json();
  const downloadUrl = metadata['@microsoft.graph.downloadUrl'];
  const mimeType = metadata.file?.mimeType || 'text/plain';
  const fileName = metadata.name || '';

  // Try direct download URL first, fallback to /content endpoint
  let contentResponse: Response;
  
  if (downloadUrl) {
    contentResponse = await fetch(downloadUrl);
  } else {
    // Fallback: use the /content endpoint (requires auth)
    console.log('[OneDrive] No download URL, using /content endpoint for:', fileName);
    contentResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}/content`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
  
  if (!contentResponse.ok) {
    throw new Error(`Failed to download file: ${contentResponse.statusText}`);
  }

  // For text files, return as string
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    const content = await contentResponse.text();
    return { content, mimeType };
  }

  // For binary files (like PDF), return as base64
  const buffer = await contentResponse.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return { content: base64, mimeType };
}

/**
 * Download OneDrive file to local path
 * @param itemId - OneDrive item ID
 * @param localPath - Local file path to save to
 */
export async function downloadOneDriveFile(itemId: string, localPath: string): Promise<{ success: boolean }> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated with OneDrive');
  }

  // Get download URL
  const metaResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}?$select=@microsoft.graph.downloadUrl,name`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metaResponse.ok) {
    throw new Error(`Failed to get file metadata: ${metaResponse.statusText}`);
  }

  const metadata = await metaResponse.json();
  const downloadUrl = metadata['@microsoft.graph.downloadUrl'];
  const fileName = metadata.name || '';

  // Try direct download URL first, fallback to /content endpoint
  let contentResponse: Response;
  
  if (downloadUrl) {
    contentResponse = await fetch(downloadUrl);
  } else {
    // Fallback: use the /content endpoint (requires auth)
    console.log('[OneDrive] No download URL, using /content endpoint for:', fileName);
    contentResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}/content`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  if (!contentResponse.ok) {
    throw new Error(`Failed to download file: ${contentResponse.statusText}`);
  }

  const buffer = await contentResponse.arrayBuffer();
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, Buffer.from(buffer));

  return { success: true };
}

/**
 * Recursively list all files in a OneDrive folder (for RAG indexing)
 * @param folderId - Root folder ID to start from
 * @param extensions - File extensions to include (e.g., ['.pdf', '.txt', '.md'])
 */
export async function listOneDriveFilesRecursive(
  folderId: string,
  extensions: string[]
): Promise<OneDriveItem[]> {
  const allFiles: OneDriveItem[] = [];
  const extensionSet = new Set(extensions.map(e => e.toLowerCase()));
  
  async function traverseFolder(currentFolderId: string): Promise<void> {
    try {
      const items = await listOneDriveFolder(currentFolderId);
      
      for (const item of items) {
        if (item.isDirectory) {
          // Recursively traverse subfolders
          await traverseFolder(item.id);
        } else {
          // Check if file extension matches
          const ext = '.' + (item.name.split('.').pop()?.toLowerCase() || '');
          if (extensionSet.has(ext)) {
            allFiles.push(item);
          }
        }
      }
    } catch (error) {
      console.error(`[OneDrive] Failed to traverse folder ${currentFolderId}:`, error);
    }
  }
  
  await traverseFolder(folderId);
  return allFiles;
}

/**
 * Get OneDrive folder info by ID
 */
export async function getOneDriveFolderInfo(folderId: string): Promise<{
  id: string;
  name: string;
  path: string;
}> {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated with OneDrive');
  }

  const url = folderId === 'root' 
    ? `${GRAPH_BASE_URL}/me/drive/root`
    : `${GRAPH_BASE_URL}/me/drive/items/${folderId}`;

  const response = await fetch(`${url}?$select=id,name,parentReference`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get folder info: ${response.statusText}`);
  }

  const data = await response.json();
  const parentPath = data.parentReference?.path?.replace('/drive/root:', '') || '';

  return {
    id: data.id,
    name: data.name || 'OneDrive',
    path: folderId === 'root' ? '' : `${parentPath}/${data.name}`.replace(/^\//, ''),
  };
}

/**
 * Create a view-only sharing link for a OneDrive file
 * Falls back to the file's webUrl if sharing link creation fails
 * @param itemId - OneDrive item ID
 * @returns The sharing link URL or null if failed
 */
export async function createOneDriveSharingLink(itemId: string): Promise<string | null> {
  const token = await getValidAccessToken();
  if (!token) {
    console.error('[OneDrive] Not authenticated - cannot create sharing link');
    return null;
  }

  try {
    // First try to create a sharing link
    const response = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}/createLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'view',
        scope: 'anonymous', // Anyone with the link can view
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[OneDrive] Created anonymous sharing link for:', itemId);
      return data.link?.webUrl || null;
    }

    // If anonymous sharing is disabled, try organization scope
    if (response.status === 403 || response.status === 400) {
      console.log('[OneDrive] Anonymous sharing not allowed, trying organization scope...');
      const orgResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}/createLink`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'view',
          scope: 'organization',
        }),
      });

      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        console.log('[OneDrive] Created organization sharing link for:', itemId);
        return orgData.link?.webUrl || null;
      }
    }
    
    // Fallback: Get the file's webUrl (direct link to OneDrive)
    console.log('[OneDrive] Sharing link failed, falling back to webUrl for:', itemId);
    const fileResponse = await fetch(`${GRAPH_BASE_URL}/me/drive/items/${itemId}?$select=webUrl`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (fileResponse.ok) {
      const fileData = await fileResponse.json();
      if (fileData.webUrl) {
        console.log('[OneDrive] Using file webUrl for:', itemId);
        return fileData.webUrl;
      }
    }

    console.error('[OneDrive] Failed to get any link for:', itemId);
    return null;
  } catch (error) {
    console.error('[OneDrive] Error creating sharing link:', error);
    return null;
  }
}

/**
 * Create sharing links for multiple OneDrive files
 * @param itemIds - Array of OneDrive item IDs
 * @returns Map of itemId to sharing link URL
 */
export async function createOneDriveSharingLinks(itemIds: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  
  // De-duplicate item IDs
  const uniqueIds = [...new Set(itemIds)];
  
  // Create links in parallel (but limit concurrency to avoid rate limiting)
  const batchSize = 5;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (itemId) => {
        const link = await createOneDriveSharingLink(itemId);
        return { itemId, link };
      })
    );
    
    for (const { itemId, link } of results) {
      if (link) {
        links.set(itemId, link);
      }
    }
  }
  
  return links;
}
