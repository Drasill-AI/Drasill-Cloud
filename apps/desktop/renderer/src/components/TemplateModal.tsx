import { useState, useEffect } from 'react';
import { WorkOrderTemplate, WorkOrderType, WorkOrderPriority, ChecklistItem } from '@drasill/shared';
import { useAppStore } from '../store';
import styles from './TemplateModal.module.css';

interface FormData {
  name: string;
  description: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  estimated_hours: string;
  checklist: ChecklistItem[];
}

export function TemplateModal() {
  const isOpen = useAppStore(s => s.isTemplateModalOpen);
  const editingTemplate = useAppStore(s => s.editingTemplate);
  const setTemplateModalOpen = useAppStore(s => s.setTemplateModalOpen);
  const setEditingTemplate = useAppStore(s => s.setEditingTemplate);
  const loadWorkOrderTemplates = useAppStore(s => s.loadWorkOrderTemplates);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    type: 'preventive',
    priority: 'medium',
    estimated_hours: '',
    checklist: []
  });
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingTemplate) {
      // Parse checklist from JSON string
      let checklistItems: ChecklistItem[] = [];
      if (editingTemplate.checklist) {
        try {
          checklistItems = JSON.parse(editingTemplate.checklist);
        } catch {
          checklistItems = [];
        }
      }
      setFormData({
        name: editingTemplate.name,
        description: editingTemplate.description || '',
        type: editingTemplate.type,
        priority: editingTemplate.priority,
        estimated_hours: editingTemplate.estimatedHours?.toString() || '',
        checklist: checklistItems
      });
    } else {
      setFormData({
        name: '',
        description: '',
        type: 'preventive',
        priority: 'medium',
        estimated_hours: '',
        checklist: []
      });
    }
    setErrors({});
  }, [editingTemplate, isOpen]);

  const handleClose = () => {
    setTemplateModalOpen(false);
    setEditingTemplate(null);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Template name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      const templateData: Omit<WorkOrderTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        type: formData.type,
        priority: formData.priority,
        estimatedHours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        checklist: formData.checklist.length > 0 ? JSON.stringify(formData.checklist) : null
      };

      if (editingTemplate?.id) {
        await window.electronAPI.updateWorkOrderTemplate(editingTemplate.id, templateData);
      } else {
        await window.electronAPI.addWorkOrderTemplate(templateData);
      }

      await loadWorkOrderTemplates();
      handleClose();
    } catch (err) {
      console.error('Failed to save template:', err);
      setErrors({ submit: 'Failed to save template' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: `item-${Date.now()}`,
      text: newChecklistItem.trim(),
      required: false
    };
    setFormData(prev => ({
      ...prev,
      checklist: [...prev.checklist, newItem]
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter(item => item.id !== id)
    }));
  };

  const moveChecklistItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formData.checklist.length) return;
    
    const newChecklist = [...formData.checklist];
    [newChecklist[index], newChecklist[newIndex]] = [newChecklist[newIndex], newChecklist[index]];
    setFormData(prev => ({ ...prev, checklist: newChecklist }));
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{editingTemplate ? 'Edit Template' : 'New Template'}</h2>
          <button className={styles.closeButton} onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {/* Template Name */}
          <div className={styles.formGroup}>
            <label>Template Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Monthly PM Inspection"
              className={errors.name ? styles.inputError : ''}
            />
            {errors.name && <span className={styles.error}>{errors.name}</span>}
          </div>

          {/* Description */}
          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what this template is for..."
              rows={2}
            />
          </div>

          {/* Type & Priority Row */}
          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label>Work Order Type</label>
              <div className={styles.optionButtons}>
                {(['preventive', 'corrective', 'inspection', 'emergency'] as WorkOrderType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`${styles.optionButton} ${formData.type === type ? styles.selected : ''} ${styles[type]}`}
                    onClick={() => setFormData(prev => ({ ...prev, type }))}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Default Priority</label>
              <div className={styles.optionButtons}>
                {(['low', 'medium', 'high', 'critical'] as WorkOrderPriority[]).map(priority => (
                  <button
                    key={priority}
                    type="button"
                    className={`${styles.optionButton} ${formData.priority === priority ? styles.selected : ''} ${styles[priority]}`}
                    onClick={() => setFormData(prev => ({ ...prev, priority }))}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Estimated Hours */}
          <div className={styles.formGroup} style={{ maxWidth: '200px' }}>
            <label>Estimated Hours</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value={formData.estimated_hours}
              onChange={(e) => setFormData(prev => ({ ...prev, estimated_hours: e.target.value }))}
              placeholder="0.0"
            />
          </div>

          {/* Checklist */}
          <div className={styles.formGroup}>
            <label>Checklist Items</label>
            <div className={styles.checklistBuilder}>
              <div className={styles.checklistInput}>
                <input
                  type="text"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  placeholder="Add checklist item..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChecklistItem())}
                />
                <button type="button" onClick={addChecklistItem}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add
                </button>
              </div>
              
              {formData.checklist.length > 0 && (
                <ul className={styles.checklistItems}>
                  {formData.checklist.map((item, index) => (
                    <li key={item.id} className={styles.checklistItem}>
                      <span className={styles.itemNumber}>{index + 1}.</span>
                      <span className={styles.itemText}>{item.text}</span>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          onClick={() => moveChecklistItem(index, 'up')}
                          disabled={index === 0}
                          title="Move up"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveChecklistItem(index, 'down')}
                          disabled={index === formData.checklist.length - 1}
                          title="Move down"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(item.id)}
                          title="Remove"
                          className={styles.removeButton}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              
              {formData.checklist.length === 0 && (
                <p className={styles.noItems}>No checklist items yet. Add items above.</p>
              )}
            </div>
          </div>

          {errors.submit && (
            <div className={styles.submitError}>{errors.submit}</div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={handleClose}>
            Cancel
          </button>
          <button
            className={styles.saveButton}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
