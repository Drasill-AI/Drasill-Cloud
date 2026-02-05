import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { 
  KnowledgeProfile, 
  KnowledgeDocument, 
  KnowledgeProfileType 
} from '@drasill/shared';
import styles from './KnowledgeBaseModal.module.css';

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROFILE_TYPE_ICONS: Record<KnowledgeProfileType, string> = {
  base: 'BASE',
  cre: 'CRE',
  pe: 'PE',
  vc: 'VC',
  c_and_i: 'C&I',
  sba: 'SBA',
  custom: 'CU',
};

const PROFILE_TYPE_LABELS: Record<KnowledgeProfileType, string> = {
  base: 'Base',
  cre: 'CRE',
  pe: 'PE',
  vc: 'VC',
  c_and_i: 'C&I',
  sba: 'SBA',
  custom: 'Custom',
};

type TabType = 'settings' | 'documents';

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({ isOpen, onClose }) => {
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state for editing
  const [editForm, setEditForm] = useState<Partial<KnowledgeProfile>>({});

  // Load profiles on mount
  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    }
  }, [isOpen]);

  // Load documents when profile changes
  useEffect(() => {
    if (selectedProfileId) {
      loadDocuments(selectedProfileId);
    } else {
      setDocuments([]);
    }
  }, [selectedProfileId]);

  // Update form when selection changes
  useEffect(() => {
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (profile) {
      setEditForm({ ...profile });
      setHasChanges(false);
    }
  }, [selectedProfileId, profiles]);

  const loadProfiles = async () => {
    try {
      const result = await window.electronAPI.knowledgeProfileGetAll();
      setProfiles(result);
      // Select first profile if none selected
      if (!selectedProfileId && result.length > 0) {
        setSelectedProfileId(result[0].id);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const loadDocuments = async (profileId: string) => {
    try {
      const result = await window.electronAPI.knowledgeDocGetByProfile(profileId);
      setDocuments(result);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const handleFormChange = (field: keyof KnowledgeProfile, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedProfileId || !hasChanges) return;
    
    setIsLoading(true);
    try {
      await window.electronAPI.knowledgeProfileUpdate(selectedProfileId, editForm);
      await loadProfiles();
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    setIsLoading(true);
    try {
      const newProfile = await window.electronAPI.knowledgeProfileCreate({
        name: 'New Profile',
        type: 'custom',
        guidelines: 'Add your guidelines here...',
        sortOrder: profiles.length,
      });
      await loadProfiles();
      setSelectedProfileId(newProfile.id);
    } catch (error) {
      console.error('Failed to create profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return;
    
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (!profile) return;

    if (!window.confirm(`Delete profile "${profile.name}"? This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await window.electronAPI.knowledgeProfileDelete(selectedProfileId);
      setSelectedProfileId(null);
      await loadProfiles();
    } catch (error) {
      console.error('Failed to delete profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetActive = async () => {
    if (!selectedProfileId) return;
    
    setIsLoading(true);
    try {
      await window.electronAPI.knowledgeProfileSetActive(selectedProfileId);
      await loadProfiles();
    } catch (error) {
      console.error('Failed to set active profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.knowledgeProfileSetActive(null);
      await loadProfiles();
    } catch (error) {
      console.error('Failed to deactivate profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!selectedProfileId) return;

    // Use IPC for file dialog
    try {
      const result = await window.electronAPI.selectFiles({
        title: 'Add Document to Knowledge Base',
        filters: [
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (result && result.length > 0) {
        for (const filePath of result) {
          const fileName = filePath.split(/[/\\]/).pop() || 'Unknown';
          await window.electronAPI.knowledgeDocAdd({
            profileId: selectedProfileId,
            fileName,
            filePath,
            category: 'other',
            source: 'local',
          });
        }
        await loadDocuments(selectedProfileId);
      }
    } catch (error) {
      console.error('Failed to add document:', error);
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    try {
      await window.electronAPI.knowledgeDocRemove(docId);
      if (selectedProfileId) {
        await loadDocuments(selectedProfileId);
      }
    } catch (error) {
      console.error('Failed to remove document:', error);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Knowledge Base
          </h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {/* Sidebar with profiles */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>Profiles</span>
              <button className={styles.addButton} onClick={handleCreateProfile} title="Add Profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div className={styles.profileList}>
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  className={`${styles.profileItem} ${profile.id === selectedProfileId ? styles.selected : ''} ${profile.isActive ? styles.active : ''}`}
                  onClick={() => setSelectedProfileId(profile.id)}
                >
                  <div className={`${styles.profileIcon} ${styles[profile.type]}`}>
                    {PROFILE_TYPE_ICONS[profile.type]}
                  </div>
                  <div className={styles.profileInfo}>
                    <div className={styles.profileName}>{profile.name}</div>
                    <div className={styles.profileType}>{PROFILE_TYPE_LABELS[profile.type]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          {selectedProfile ? (
            <div className={styles.mainContent}>
              <div className={styles.contentHeader}>
                <h3 className={styles.contentTitle}>{selectedProfile.name}</h3>
                <div className={styles.headerActions}>
                  {selectedProfile.isActive ? (
                    <>
                      <span className={styles.activeIndicator}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                        Active
                      </span>
                      <button className={`${styles.actionButton} ${styles.deactivateButton}`} onClick={handleDeactivate}>
                        Deactivate
                      </button>
                    </>
                  ) : (
                    <button className={`${styles.actionButton} ${styles.activateButton}`} onClick={handleSetActive}>
                      Set Active
                    </button>
                  )}
                  <button className={`${styles.actionButton} ${styles.deleteButton}`} onClick={handleDeleteProfile}>
                    Delete
                  </button>
                </div>
              </div>

              <div className={styles.tabs}>
                <button
                  className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
                  onClick={() => setActiveTab('settings')}
                >
                  Settings
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'documents' ? styles.active : ''}`}
                  onClick={() => setActiveTab('documents')}
                >
                  Documents ({documents.length})
                </button>
              </div>

              {activeTab === 'settings' && (
                <div className={styles.tabPanel}>
                  <div className={styles.section}>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label className={styles.label}>Profile Name</label>
                        <input
                          type="text"
                          className={styles.input}
                          value={editForm.name || ''}
                          onChange={e => handleFormChange('name', e.target.value)}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Type</label>
                        <select
                          className={styles.select}
                          value={editForm.type || 'custom'}
                          onChange={e => handleFormChange('type', e.target.value)}
                        >
                          <option value="base">Base</option>
                          <option value="cre">Commercial Real Estate (CRE)</option>
                          <option value="pe">Private Equity (PE)</option>
                          <option value="vc">Venture Capital (VC)</option>
                          <option value="c_and_i">C&I Lending</option>
                          <option value="sba">SBA Lending</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Description</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={editForm.description || ''}
                        onChange={e => handleFormChange('description', e.target.value)}
                        placeholder="Brief description of this profile's purpose"
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Parent Profile (for inheritance)</label>
                      <select
                        className={styles.select}
                        value={editForm.parentId || ''}
                        onChange={e => handleFormChange('parentId', e.target.value || null)}
                      >
                        <option value="">None</option>
                        {profiles
                          .filter(p => p.id !== selectedProfileId)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                      <p className={styles.helpText}>
                        If set, this profile will inherit guidelines from its parent profile.
                      </p>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Guidelines (Soft Guardrails)</h4>
                    <div className={styles.field}>
                      <label className={styles.label}>Guidelines for AI</label>
                      <textarea
                        className={`${styles.textarea} ${styles.textareaLarge}`}
                        value={editForm.guidelines || ''}
                        onChange={e => handleFormChange('guidelines', e.target.value)}
                        placeholder="Enter guidelines the AI should follow when this profile is active. These are suggestions, not strict rules."
                      />
                      <p className={styles.helpText}>
                        These guidelines will be included in the AI's context for all conversations when this profile is active.
                        They act as soft guardrails - suggestions to help ensure consistency and accuracy.
                      </p>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Additional Context</h4>
                    <div className={styles.field}>
                      <label className={styles.label}>Key Terminology</label>
                      <textarea
                        className={styles.textarea}
                        value={editForm.terminology || ''}
                        onChange={e => handleFormChange('terminology', e.target.value)}
                        placeholder="Key terms and acronyms specific to this profile (e.g., DSCR, LTV, NOI)"
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Compliance Considerations</label>
                      <textarea
                        className={styles.textarea}
                        value={editForm.complianceChecks || ''}
                        onChange={e => handleFormChange('complianceChecks', e.target.value)}
                        placeholder="Soft compliance reminders (e.g., 'Verify borrower information is complete')"
                      />
                      <p className={styles.helpText}>
                        These are soft reminders shown to help ensure compliance, not blocking requirements.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'documents' && (
                <div className={styles.tabPanel}>
                  <div className={styles.section}>
                    <div className={styles.documentsHeader}>
                      <h4 className={styles.sectionTitle}>Profile Documents</h4>
                      <button className={styles.addDocButton} onClick={handleAddDocument}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Document
                      </button>
                    </div>

                    {documents.length > 0 ? (
                      <div className={styles.documentsList}>
                        {documents.map(doc => (
                          <div key={doc.id} className={styles.documentItem}>
                            <div className={styles.documentIcon}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            </div>
                            <div className={styles.documentInfo}>
                              <div className={styles.documentName}>{doc.fileName}</div>
                              <div className={styles.documentMeta}>
                                <span>{doc.category}</span>
                                <span>{doc.source}</span>
                              </div>
                            </div>
                            {doc.isIndexed && (
                              <span className={styles.indexedBadge}>
                                <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                                Indexed
                              </span>
                            )}
                            <button
                              className={styles.removeDocButton}
                              onClick={() => handleRemoveDocument(doc.id)}
                              title="Remove document"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyDocs}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <p>No documents added yet. Add policies, procedures, or example documents to enhance this profile's context.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <h3>No Profile Selected</h3>
              <p>Select a profile from the sidebar or create a new one to get started.</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerInfo}>
            {hasChanges && <span>⚠ Unsaved changes</span>}
          </div>
          <div className={styles.footerActions}>
            <button className={styles.cancelButton} onClick={onClose}>
              Close
            </button>
            {hasChanges && (
              <button className={styles.saveButton} onClick={handleSave} disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default KnowledgeBaseModal;
