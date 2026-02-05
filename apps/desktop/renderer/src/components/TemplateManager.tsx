import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DocumentTemplate, KnowledgeProfile } from '@drasill/shared';
import styles from './TemplateManager.module.css';

interface TemplateManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const TEMPLATE_TYPE_ICONS: Record<string, string> = {
  credit_memo: 'CM',
  ic_report: 'IC',
  approval_letter: 'AL',
  term_sheet: 'TS',
  commitment_letter: 'CL',
  custom: 'CU',
};

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  credit_memo: 'Credit Memo',
  ic_report: 'IC Report',
  approval_letter: 'Approval Letter',
  term_sheet: 'Term Sheet',
  commitment_letter: 'Commitment Letter',
  custom: 'Custom',
};

type TabType = 'settings' | 'content' | 'preview';

export const TemplateManager: React.FC<TemplateManagerProps> = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [editForm, setEditForm] = useState<Partial<DocumentTemplate>>({});
  const [newSectionInput, setNewSectionInput] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newFieldInput, setNewFieldInput] = useState('');
  const [isAddingField, setIsAddingField] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      loadProfiles();
    }
  }, [isOpen]);

  useEffect(() => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (template) {
      setEditForm({ ...template });
      setHasChanges(false);
    }
  }, [selectedTemplateId, templates]);

  const loadTemplates = async () => {
    try {
      const result = await window.electronAPI.templateGetAll();
      setTemplates(result);
      if (!selectedTemplateId && result.length > 0) {
        setSelectedTemplateId(result[0].id);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadProfiles = async () => {
    try {
      const result = await window.electronAPI.knowledgeProfileGetAll();
      setProfiles(result);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const handleFormChange = (field: keyof DocumentTemplate, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedTemplateId || !hasChanges) return;
    
    setIsLoading(true);
    try {
      await window.electronAPI.templateUpdate(selectedTemplateId, editForm);
      await loadTemplates();
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    setIsLoading(true);
    try {
      const newTemplate = await window.electronAPI.templateCreate({
        name: 'New Template',
        templateType: 'custom',
        content: '# New Template\n\nAdd your template content here.\n\nUse {{variable_name}} for fields that should be filled in.',
        aiInstructions: 'Generate content for this template based on the deal context.',
        isActive: true,
      });
      await loadTemplates();
      setSelectedTemplateId(newTemplate.id);
    } catch (error) {
      console.error('Failed to create template:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    if (!window.confirm(`Delete template "${template.name}"? This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await window.electronAPI.templateDelete(selectedTemplateId);
      setSelectedTemplateId(null);
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateTemplate = async () => {
    if (!selectedTemplateId) return;
    
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    setIsLoading(true);
    try {
      const newTemplate = await window.electronAPI.templateCreate({
        name: `${template.name} (Copy)`,
        templateType: template.templateType,
        profileId: template.profileId,
        content: template.content,
        requiredSections: template.requiredSections,
        aiInstructions: template.aiInstructions,
        defaultFields: template.defaultFields,
        isActive: true,
      });
      await loadTemplates();
      setSelectedTemplateId(newTemplate.id);
    } catch (error) {
      console.error('Failed to duplicate template:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSection = () => {
    if (newSectionInput.trim()) {
      const current = editForm.requiredSections || [];
      // Check for duplicates
      if (!current.includes(newSectionInput.trim())) {
        handleFormChange('requiredSections', [...current, newSectionInput.trim()]);
      }
      setNewSectionInput('');
      setIsAddingSection(false);
    }
  };

  const handleSectionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSection();
    } else if (e.key === 'Escape') {
      setNewSectionInput('');
      setIsAddingSection(false);
    }
  };

  const handleRemoveSection = (index: number) => {
    const current = editForm.requiredSections || [];
    handleFormChange('requiredSections', current.filter((_, i) => i !== index));
  };

  const handleAddField = () => {
    if (newFieldInput.trim()) {
      const current = editForm.defaultFields || [];
      const formattedField = newFieldInput.trim().toLowerCase().replace(/\s+/g, '_');
      // Check for duplicates
      if (!current.includes(formattedField)) {
        handleFormChange('defaultFields', [...current, formattedField]);
      }
      setNewFieldInput('');
      setIsAddingField(false);
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddField();
    } else if (e.key === 'Escape') {
      setNewFieldInput('');
      setIsAddingField(false);
    }
  };

  const handleRemoveField = (index: number) => {
    const current = editForm.defaultFields || [];
    handleFormChange('defaultFields', current.filter((_, i) => i !== index));
  };

  // Extract variables from template content
  const extractVariables = (content: string): string[] => {
    const matches = content?.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  const renderPreview = (content: string): string => {
    return content?.replace(/\{\{(\w+)\}\}/g, '<span class="' + styles.previewVariable + '">{{$1}}</span>') || '';
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Document Templates
          </h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {/* Sidebar */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>Templates</span>
              <button className={styles.addButton} onClick={handleCreateTemplate} title="Add Template">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
            <div className={styles.templateList}>
              {templates.map(template => (
                <div
                  key={template.id}
                  className={`${styles.templateItem} ${template.id === selectedTemplateId ? styles.selected : ''}`}
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className={`${styles.templateIcon} ${styles[template.templateType]}`}>
                    {TEMPLATE_TYPE_ICONS[template.templateType] || '📄'}
                  </div>
                  <div className={styles.templateInfo}>
                    <div className={styles.templateName}>{template.name}</div>
                    <div className={styles.templateType}>
                      {TEMPLATE_TYPE_LABELS[template.templateType] || template.templateType}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          {selectedTemplate ? (
            <div className={styles.mainContent}>
              <div className={styles.contentHeader}>
                <h3 className={styles.contentTitle}>{selectedTemplate.name}</h3>
                <div className={styles.headerActions}>
                  <button className={`${styles.actionButton} ${styles.duplicateButton}`} onClick={handleDuplicateTemplate}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Duplicate
                  </button>
                  <button className={`${styles.actionButton} ${styles.deleteButton}`} onClick={handleDeleteTemplate}>
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
                  className={`${styles.tab} ${activeTab === 'content' ? styles.active : ''}`}
                  onClick={() => setActiveTab('content')}
                >
                  Content
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
              </div>

              {activeTab === 'settings' && (
                <div className={styles.tabPanel}>
                  <div className={styles.section}>
                    <div className={styles.row}>
                      <div className={styles.field}>
                        <label className={styles.label}>Template Name</label>
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
                          value={editForm.templateType || 'custom'}
                          onChange={e => handleFormChange('templateType', e.target.value)}
                        >
                          <option value="credit_memo">Credit Memo</option>
                          <option value="ic_report">IC Report</option>
                          <option value="approval_letter">Approval Letter</option>
                          <option value="term_sheet">Term Sheet</option>
                          <option value="commitment_letter">Commitment Letter</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Associated Profile (optional)</label>
                      <select
                        className={styles.select}
                        value={editForm.profileId || ''}
                        onChange={e => handleFormChange('profileId', e.target.value || null)}
                      >
                        <option value="">Global (All Profiles)</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <p className={styles.helpText}>
                        If set, this template will only appear when the associated profile is active.
                      </p>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Required Sections</h4>
                    <div className={styles.sectionChips}>
                      {(editForm.requiredSections || []).map((section, i) => (
                        <span key={i} className={styles.sectionChip}>
                          {section}
                          <button onClick={() => handleRemoveSection(i)}>×</button>
                        </span>
                      ))}
                      {isAddingSection ? (
                        <div className={styles.inlineInputWrapper}>
                          <input
                            type="text"
                            className={styles.inlineInput}
                            value={newSectionInput}
                            onChange={e => setNewSectionInput(e.target.value)}
                            onKeyDown={handleSectionKeyDown}
                            onBlur={() => {
                              if (!newSectionInput.trim()) {
                                setIsAddingSection(false);
                              }
                            }}
                            placeholder="Section name..."
                            autoFocus
                          />
                          <button className={styles.inlineConfirmButton} onClick={handleAddSection}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                          <button className={styles.inlineCancelButton} onClick={() => { setNewSectionInput(''); setIsAddingSection(false); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button className={styles.addChipButton} onClick={() => setIsAddingSection(true)}>
                          + Add Section
                        </button>
                      )}
                    </div>
                    <p className={styles.helpText}>
                      Sections that should be included in generated documents.
                    </p>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Default Fields</h4>
                    <div className={styles.variablesList}>
                      {(editForm.defaultFields || []).map((field, i) => (
                        <span key={i} className={styles.variableTag}>
                          {`{{${field}}}`}
                          <button onClick={() => handleRemoveField(i)}>×</button>
                        </span>
                      ))}
                      {isAddingField ? (
                        <div className={styles.inlineInputWrapper}>
                          <input
                            type="text"
                            className={styles.inlineInput}
                            value={newFieldInput}
                            onChange={e => setNewFieldInput(e.target.value)}
                            onKeyDown={handleFieldKeyDown}
                            onBlur={() => {
                              if (!newFieldInput.trim()) {
                                setIsAddingField(false);
                              }
                            }}
                            placeholder="field_name"
                            autoFocus
                          />
                          {newFieldInput && (
                            <span className={styles.fieldPreview}>
                              → {`{{${newFieldInput.trim().toLowerCase().replace(/\s+/g, '_')}}}`}
                            </span>
                          )}
                          <button className={styles.inlineConfirmButton} onClick={handleAddField}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </button>
                          <button className={styles.inlineCancelButton} onClick={() => { setNewFieldInput(''); setIsAddingField(false); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button className={styles.addVariableButton} onClick={() => setIsAddingField(true)}>
                          + Add Field
                        </button>
                      )}
                    </div>
                    <p className={styles.helpText}>
                      Fields that will be prompted for manual input if they can't be inferred from context.
                    </p>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>AI Instructions</h4>
                    <div className={styles.field}>
                      <label className={styles.label}>Instructions for AI Generation</label>
                      <textarea
                        className={styles.textarea}
                        value={editForm.aiInstructions || ''}
                        onChange={e => handleFormChange('aiInstructions', e.target.value)}
                        placeholder="Instructions the AI should follow when generating content for this template..."
                      />
                      <p className={styles.helpText}>
                        These instructions help the AI understand how to fill in the template content.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'content' && (
                <div className={styles.tabPanel}>
                  <div className={styles.section}>
                    <div className={styles.field}>
                      <label className={styles.label}>Template Content (Markdown)</label>
                      <textarea
                        className={`${styles.textarea} ${styles.textareaLarge}`}
                        value={editForm.content || ''}
                        onChange={e => handleFormChange('content', e.target.value)}
                        placeholder="# Document Title&#10;&#10;## Section 1&#10;Content with {{variable}} placeholders..."
                      />
                      <p className={styles.helpText}>
                        Use Markdown formatting. Variables use double braces: {`{{variable_name}}`}
                      </p>
                    </div>
                  </div>

                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Detected Variables</h4>
                    <div className={styles.variablesList}>
                      {extractVariables(editForm.content || '').map((v, i) => (
                        <span key={i} className={styles.variableTag}>{`{{${v}}}`}</span>
                      ))}
                      {extractVariables(editForm.content || '').length === 0 && (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          No variables detected. Use {`{{variable_name}}`} syntax.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'preview' && (
                <div className={styles.tabPanel}>
                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Template Preview</h4>
                    <div 
                      className={styles.previewContainer}
                      dangerouslySetInnerHTML={{ __html: renderPreview(editForm.content || '') }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <h3>No Template Selected</h3>
              <p>Select a template from the sidebar or create a new one.</p>
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

export default TemplateManager;
