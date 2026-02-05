import React, { useState, useEffect } from 'react';
import { 
  DocumentTemplate, 
  GeneratedMemo, 
  Deal
} from '@drasill/shared';
import styles from './MemoGenerator.module.css';

interface MemoGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  deal: Deal;
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

type Step = 'select' | 'fields' | 'generate' | 'preview';

export const MemoGenerator: React.FC<MemoGeneratorProps> = ({ isOpen, onClose, deal }) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [existingMemos, setExistingMemos] = useState<GeneratedMemo[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('select');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [_isGenerating, setIsGenerating] = useState(false);
  const [generatedMemo, setGeneratedMemo] = useState<GeneratedMemo | null>(null);
  const [previewContent, setPreviewContent] = useState('');

  useEffect(() => {
    if (isOpen && deal) {
      loadTemplates();
      loadExistingMemos();
      // Reset state
      setCurrentStep('select');
      setSelectedTemplateId(null);
      setFieldValues({});
      setAdditionalInstructions('');
      setGeneratedMemo(null);
      setPreviewContent('');
    }
  }, [isOpen, deal]);

  const loadTemplates = async () => {
    try {
      const result = await window.electronAPI.templateGetAll();
      setTemplates(result.filter((t: DocumentTemplate) => t.isActive));
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadExistingMemos = async () => {
    try {
      const result = await window.electronAPI.memoGetByDeal(deal.id);
      setExistingMemos(result);
    } catch (error) {
      console.error('Failed to load memos:', error);
    }
  };

  // Infer field values from deal context
  const inferFieldValues = (template: DocumentTemplate): Record<string, string> => {
    const inferred: Record<string, string> = {};
    const defaultFields = template.defaultFields || [];
    
    // Map common field names to deal properties
    const fieldMappings: Record<string, string> = {
      borrower_name: deal.borrowerName,
      loan_amount: deal.loanAmount ? `$${deal.loanAmount.toLocaleString()}` : '',
      interest_rate: deal.interestRate ? `${deal.interestRate}%` : '',
      term_months: deal.termMonths ? String(deal.termMonths) : '',
      collateral_description: deal.collateralDescription || '',
      deal_number: deal.dealNumber,
      stage: deal.stage,
      priority: deal.priority || 'medium',
      assigned_to: deal.assignedTo || '',
      expected_close_date: deal.expectedCloseDate || '',
      borrower_contact: deal.borrowerContact || '',
    };

    for (const field of defaultFields) {
      const lowerField = field.toLowerCase();
      if (fieldMappings[lowerField]) {
        inferred[field] = fieldMappings[lowerField];
      }
    }

    return inferred;
  };

  // Extract variables from template content
  const extractVariables = (content: string): string[] => {
    const matches = content?.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const inferred = inferFieldValues(template);
      setFieldValues(inferred);
    }
  };

  const handleNextStep = () => {
    if (currentStep === 'select' && selectedTemplateId) {
      setCurrentStep('fields');
    } else if (currentStep === 'fields') {
      handleGenerate();
    }
  };

  const handleBackStep = () => {
    if (currentStep === 'fields') {
      setCurrentStep('select');
    } else if (currentStep === 'preview') {
      setCurrentStep('fields');
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId) return;
    
    setCurrentStep('generate');
    setIsGenerating(true);

    try {
      // Create the memo record
      const memo = await window.electronAPI.memoGenerate({
        dealId: deal.id,
        templateId: selectedTemplateId,
        fieldValues,
        additionalInstructions,
      });

      // Fill in the template content with field values
      const template = templates.find(t => t.id === selectedTemplateId);
      let content = template?.content || '';
      
      // Replace variables with values
      Object.entries(fieldValues).forEach(([key, value]) => {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `[${key}]`);
      });

      // Update memo with filled content
      const updatedMemo = await window.electronAPI.memoUpdate(memo.id, {
        content,
        inferredFields: inferFieldValues(template!),
        manualFields: fieldValues,
      });

      setGeneratedMemo(updatedMemo);
      setPreviewContent(content);
      setCurrentStep('preview');
    } catch (error) {
      console.error('Failed to generate memo:', error);
      setCurrentStep('fields');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    if (!generatedMemo) return;
    
    try {
      const result = await window.electronAPI.memoExport(generatedMemo.id, 'md');
      if (result) {
        await loadExistingMemos();
      }
    } catch (error) {
      console.error('Failed to export memo:', error);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(previewContent);
  };

  const handleDeleteMemo = async (memoId: string) => {
    if (!window.confirm('Delete this memo?')) return;
    
    try {
      await window.electronAPI.memoDelete(memoId);
      await loadExistingMemos();
    } catch (error) {
      console.error('Failed to delete memo:', error);
    }
  };

  const handleViewMemo = async (memo: GeneratedMemo) => {
    setGeneratedMemo(memo);
    setPreviewContent(memo.content);
    setSelectedTemplateId(memo.templateId);
    setCurrentStep('preview');
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const templateVariables = selectedTemplate ? extractVariables(selectedTemplate.content || '') : [];

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Generate Document
          </h2>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {/* Deal Banner */}
          <div className={styles.dealBanner}>
            <div className={styles.dealBannerIcon}>💼</div>
            <div className={styles.dealBannerInfo}>
              <div className={styles.dealBannerName}>{deal.borrowerName}</div>
              <div className={styles.dealBannerMeta}>
                {deal.dealNumber} • ${deal.loanAmount.toLocaleString()} • {deal.stage}
              </div>
            </div>
          </div>

          {/* Steps Indicator */}
          <div className={styles.steps}>
            <div className={`${styles.step} ${currentStep === 'select' ? styles.active : ''} ${['fields', 'generate', 'preview'].includes(currentStep) ? styles.completed : ''}`}>
              <span className={styles.stepNumber}>1</span>
              <span>Select Template</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.step} ${currentStep === 'fields' ? styles.active : ''} ${['generate', 'preview'].includes(currentStep) ? styles.completed : ''}`}>
              <span className={styles.stepNumber}>2</span>
              <span>Fill Fields</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.step} ${currentStep === 'preview' ? styles.active : ''}`}>
              <span className={styles.stepNumber}>3</span>
              <span>Review & Export</span>
            </div>
          </div>

          {/* Step 1: Select Template */}
          {currentStep === 'select' && (
            <>
              <h3 className={styles.sectionTitle}>Select a Template</h3>
              <div className={styles.templateGrid}>
                {templates.map(template => (
                  <div
                    key={template.id}
                    className={`${styles.templateCard} ${template.id === selectedTemplateId ? styles.selected : ''}`}
                    onClick={() => handleSelectTemplate(template.id)}
                  >
                    <div className={`${styles.templateCardIcon} ${styles[template.templateType]}`}>
                      {TEMPLATE_TYPE_ICONS[template.templateType] || 'CU'}
                    </div>
                    <div className={styles.templateCardTitle}>{template.name}</div>
                    <div className={styles.templateCardType}>
                      {TEMPLATE_TYPE_LABELS[template.templateType] || template.templateType}
                    </div>
                  </div>
                ))}
              </div>

              {/* Existing Memos */}
              {existingMemos.length > 0 && (
                <div className={styles.existingMemos}>
                  <div className={styles.existingMemosTitle}>Previously Generated</div>
                  <div className={styles.memoList}>
                    {existingMemos.map(memo => (
                      <div key={memo.id} className={styles.memoItem} onClick={() => handleViewMemo(memo)}>
                        <div className={styles.memoIcon}>📄</div>
                        <div className={styles.memoInfo}>
                          <div className={styles.memoName}>{memo.templateName || 'Document'}</div>
                          <div className={styles.memoMeta}>
                            <span>v{memo.version}</span>
                            <span>{new Date(memo.createdAt!).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <span className={`${styles.statusBadge} ${styles[memo.status]}`}>
                          {memo.status}
                        </span>
                        <div className={styles.memoActions}>
                          <button 
                            className={`${styles.memoAction} ${styles.delete}`}
                            onClick={(e) => { e.stopPropagation(); handleDeleteMemo(memo.id); }}
                            title="Delete"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 2: Fill Fields */}
          {currentStep === 'fields' && selectedTemplate && (
            <>
              <h3 className={styles.sectionTitle}>Fill in Document Fields</h3>
              <div className={styles.fieldsForm}>
                {templateVariables.map(variable => {
                  const inferred = inferFieldValues(selectedTemplate);
                  const isInferred = !!inferred[variable];
                  
                  return (
                    <div key={variable} className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>
                        {variable.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        {isInferred && (
                          <span className={styles.inferredBadge}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            Auto-filled
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        className={`${styles.fieldInput} ${isInferred ? styles.inferred : ''}`}
                        value={fieldValues[variable] || ''}
                        onChange={e => setFieldValues(prev => ({ ...prev, [variable]: e.target.value }))}
                        placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                      />
                    </div>
                  );
                })}
              </div>

              <div className={styles.additionalSection}>
                <label className={styles.additionalLabel}>Additional Instructions (Optional)</label>
                <textarea
                  className={styles.additionalTextarea}
                  value={additionalInstructions}
                  onChange={e => setAdditionalInstructions(e.target.value)}
                  placeholder="Any specific instructions for the AI when generating this document..."
                />
              </div>
            </>
          )}

          {/* Step 3: Generating */}
          {currentStep === 'generate' && (
            <div className={styles.generatingState}>
              <div className={styles.spinner} />
              <div className={styles.generatingText}>Generating Document...</div>
              <div className={styles.generatingSubtext}>Filling in template with deal information</div>
            </div>
          )}

          {/* Step 4: Preview */}
          {currentStep === 'preview' && (
            <>
              <div className={styles.previewContainer}>
                <div className={styles.previewHeader}>
                  <span className={styles.previewTitle}>
                    {generatedMemo?.templateName || selectedTemplate?.name || 'Document'}
                  </span>
                  <div className={styles.previewActions}>
                    <button className={styles.previewAction} onClick={handleCopyToClipboard}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
                <div className={styles.previewContent}>
                  {previewContent}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <div>
            {currentStep !== 'select' && currentStep !== 'generate' && (
              <button className={styles.backButton} onClick={handleBackStep}>
                ← Back
              </button>
            )}
          </div>
          <div className={styles.footerActions}>
            <button className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            {currentStep === 'select' && (
              <button 
                className={styles.nextButton} 
                onClick={handleNextStep}
                disabled={!selectedTemplateId}
              >
                Next →
              </button>
            )}
            {currentStep === 'fields' && (
              <button className={styles.generateButton} onClick={handleNextStep}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate
              </button>
            )}
            {currentStep === 'preview' && (
              <button className={styles.exportButton} onClick={handleExport}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoGenerator;
