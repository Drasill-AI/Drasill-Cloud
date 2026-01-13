/**
 * Keychain module for secure API key storage using OS-level credential vault
 * - Windows: Windows Credential Manager
 * - macOS: Keychain
 * - Linux: libsecret
 */
import * as keytar from 'keytar';
import Store from 'electron-store';

const SERVICE_NAME = 'DrasillCloud';
const ACCOUNT_NAME = 'openai-api-key';

/**
 * LEGACY: electron-store used to store API keys before v1.1.0
 * This is only used for one-time migration to OS keychain.
 * The encryption key is not sensitive - it only protected the local store file.
 * TODO: Remove this migration code after sufficient user adoption (v1.3+)
 */
const LEGACY_ENCRYPTION_KEY = Buffer.from('ZHJhc2lsbC1jbG91ZC1zZWN1cmUta2V5LTIwMjQ=', 'base64').toString('utf-8');
const legacyStore = new Store({
  name: 'drasill-config',
  encryptionKey: LEGACY_ENCRYPTION_KEY,
});
const LEGACY_API_KEY_STORE_KEY = 'openai-api-key';

let migrationDone = false;

/**
 * Migrate API key from legacy electron-store to OS keychain (one-time)
 */
async function migrateFromLegacyStore(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  try {
    // Check if there's already a key in keychain
    const existingKey = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (existingKey) {
      // Already migrated, clean up legacy store
      legacyStore.delete(LEGACY_API_KEY_STORE_KEY);
      return;
    }

    // Check for legacy key
    const legacyKey = legacyStore.get(LEGACY_API_KEY_STORE_KEY) as string | undefined;
    if (legacyKey) {
      console.log('Migrating API key from legacy store to OS keychain...');
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, legacyKey);
      legacyStore.delete(LEGACY_API_KEY_STORE_KEY);
      console.log('Migration complete. API key now stored in OS keychain.');
    }
  } catch (error) {
    console.error('Failed to migrate API key:', error);
  }
}

/**
 * Get the OpenAI API key from OS keychain
 */
export async function getApiKey(): Promise<string | null> {
  await migrateFromLegacyStore();
  
  try {
    return await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    console.error('Failed to get API key from keychain:', error);
    return null;
  }
}

/**
 * Set the OpenAI API key in OS keychain
 */
export async function setApiKey(apiKey: string): Promise<boolean> {
  try {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
    return true;
  } catch (error) {
    console.error('Failed to set API key in keychain:', error);
    return false;
  }
}

/**
 * Delete the OpenAI API key from OS keychain
 */
export async function deleteApiKey(): Promise<boolean> {
  try {
    return await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    console.error('Failed to delete API key from keychain:', error);
    return false;
  }
}

/**
 * Check if API key is configured
 */
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return !!key;
}

/**
 * Get masked version of API key for display
 */
export async function getMaskedApiKey(): Promise<string | null> {
  const apiKey = await getApiKey();
  if (!apiKey) return null;
  return apiKey.slice(0, 7) + '...' + apiKey.slice(-4);
}
