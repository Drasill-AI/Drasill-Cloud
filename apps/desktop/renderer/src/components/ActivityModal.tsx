import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { DealActivityType, DealActivity, ActivitySource, ACTIVITY_TEMPLATES } from '@drasill/shared';
import styles from './ActivityModal.module.css';

const ACTIVITY_TYPES: { value: DealActivityType; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'document', label: 'Document' },
  { value: 'meeting', label: 'Meeting' },
];

export function ActivityModal() {
  const { 
    isActivityModalOpen, 
    setActivityModalOpen, 
    deals, 
    selectedDealId,
    showToast,
    refreshActivities,
    editingActivity,
    setEditingActivity,
    tabs,
  } = useAppStore();

  const isEditMode = !!editingActivity;

  const [formData, setFormData] = useState({
    dealId: selectedDealId ?? '',
    type: 'note' as DealActivityType,
    performedBy: '',
    performedAt: new Date().toISOString().slice(0, 16),
    description: '',
  });

  // Sources to attach to the activity (from open tabs)
  const [selectedSources, setSelectedSources] = useState<ActivitySource[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update deal ID when selected deal changes
  useEffect(() => {
    if (selectedDealId && !editingActivity) {
      setFormData(prev => ({ ...prev, dealId: selectedDealId }));
    }
  }, [selectedDealId, editingActivity]);

  // Reset form when modal opens, or populate for editing
  useEffect(() => {
    if (isActivityModalOpen) {
      if (editingActivity) {
        // Edit mode: populate with existing activity data
        setFormData({
          dealId: editingActivity.dealId,
          type: editingActivity.type as DealActivityType,
          performedBy: editingActivity.performedBy || '',
          performedAt: editingActivity.performedAt ? new Date(editingActivity.performedAt).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
          description: editingActivity.description || '',
        });
        // Load existing sources
        setSelectedSources(editingActivity.sources || []);
      } else {
        // Add mode: reset to defaults
        setFormData({
          dealId: selectedDealId ?? (deals[0]?.id ?? ''),
          type: 'note',
          performedBy: '',
          performedAt: new Date().toISOString().slice(0, 16),
          description: '',
        });
        setSelectedSources([]);
      }
    }
  }, [isActivityModalOpen, editingActivity, selectedDealId, deals]);

  const handleClose = () => {
    setActivityModalOpen(false);
    setEditingActivity(null);
    setSelectedSources([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.dealId) {
      showToast('error', 'Please select a deal');
      return;
    }

    if (!formData.description) {
      showToast('error', 'Please enter a description');
      return;
    }

    setIsSubmitting(true);
    try {
      const activityData = {
        dealId: formData.dealId,
        type: formData.type,
        performedAt: new Date(formData.performedAt).toISOString(),
        performedBy: formData.performedBy || null,
        description: formData.description,
        metadata: null,
      };

      let activityId: string;

      if (isEditMode && editingActivity?.id) {
        await window.electronAPI.updateDealActivity(editingActivity.id, activityData);
        activityId = editingActivity.id;
        
        // Remove existing sources and add new ones
        const existingSources = editingActivity.sources || [];
        for (const source of existingSources) {
          if (source.id) {
            await window.electronAPI.removeActivitySource(source.id);
          }
        }
        
        showToast('success', 'Activity updated successfully');
      } else {
        const newActivity = await window.electronAPI.addDealActivity(activityData);
        activityId = newActivity.id;
        showToast('success', 'Activity added successfully');
      }

      // Add selected sources to the activity
      for (const source of selectedSources) {
        await window.electronAPI.addActivitySource(activityId, source);
      }

      handleClose();
      refreshActivities();
    } catch (error) {
      showToast('error', isEditMode ? 'Failed to update activity' : 'Failed to add activity');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingActivity?.id) return;

    const confirmed = confirm('Are you sure you want to delete this activity? This action cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await window.electronAPI.deleteDealActivity(editingActivity.id);
      showToast('success', 'Activity deleted');
      handleClose();
      refreshActivities();
    } catch (error) {
      showToast('error', 'Failed to delete activity');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isActivityModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            {isEditMode ? 'Edit Activity' : 'Add Activity'}
          </span>
          <button className={styles.closeButton} onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className={styles.content} onSubmit={handleSubmit}>
          <div className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Deal <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={formData.dealId}
                onChange={(e) => setFormData(prev => ({ ...prev, dealId: e.target.value }))}
                required
              >
                <option value="">Select a deal...</option>
                {deals.map(deal => (
                  <option key={deal.id} value={deal.id}>
                    {deal.borrowerName} - ${deal.loanAmount?.toLocaleString()} ({deal.stage})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Activity Type <span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as DealActivityType }))}
                  required
                >
                  {ACTIVITY_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Date & Time</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={formData.performedAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, performedAt: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Performed By</label>
              <input
                type="text"
                className={styles.input}
                value={formData.performedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, performedBy: e.target.value }))}
                placeholder="e.g., John Smith"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Description <span className={styles.required}>*</span>
              </label>
              {/* Quick Templates */}
              <div className={styles.templateSection}>
                <select
                  className={styles.templateSelect}
                  value=""
                  onChange={(e) => {
                    const template = ACTIVITY_TEMPLATES.find(t => t.label === e.target.value);
                    if (template) {
                      setFormData(prev => ({
                        ...prev,
                        description: template.label,
                        type: template.type,
                      }));
                    }
                  }}
                >
                  <option value="">Use template...</option>
                  {ACTIVITY_TEMPLATES.map((template, idx) => (
                    <option key={idx} value={template.label}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                className={styles.textarea}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the activity..."
                rows={4}
                required
              />
            </div>

            {/* Document Sources / Citations */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Document Citations
                <span className={styles.labelHint}>(optional)</span>
              </label>
              
              {/* Selected sources */}
              {selectedSources.length > 0 && (
                <div className={styles.sourcesList}>
                  {selectedSources.map((source, index) => (
                    <div key={index} className={styles.sourceItem}>
                      <span className={styles.sourceFileName}>{source.fileName}</span>
                      {source.pageNumber && (
                        <span className={styles.sourcePage}>p.{source.pageNumber}</span>
                      )}
                      <button
                        type="button"
                        className={styles.removeSourceButton}
                        onClick={() => setSelectedSources(prev => prev.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add from open tabs */}
              {tabs.length > 0 && (
                <div className={styles.addSourceSection}>
                  <select
                    className={styles.sourceSelect}
                    value=""
                    onChange={(e) => {
                      const tab = tabs.find(t => t.id === e.target.value);
                      if (tab && !selectedSources.some(s => s.filePath === tab.path)) {
                        setSelectedSources(prev => [...prev, {
                          fileName: tab.name,
                          filePath: tab.path,
                        }]);
                      }
                    }}
                  >
                    <option value="">Add source from open tabs...</option>
                    {tabs
                      .filter(tab => !selectedSources.some(s => s.filePath === tab.path))
                      .map(tab => (
                        <option key={tab.id} value={tab.id}>
                          {tab.name}
                        </option>
                      ))
                    }
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            {isEditMode && (
              <button 
                type="button" 
                className={styles.deleteButton}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <button 
              type="button" 
              className={styles.cancelButton}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Add Activity')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
