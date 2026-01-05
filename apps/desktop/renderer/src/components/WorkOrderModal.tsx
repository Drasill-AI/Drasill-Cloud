import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { WorkOrderType, WorkOrderPriority } from '@drasill/shared';
import styles from './WorkOrderModal.module.css';

const WORK_ORDER_TYPES: WorkOrderType[] = ['preventive', 'corrective', 'emergency', 'inspection'];
const PRIORITIES: WorkOrderPriority[] = ['low', 'medium', 'high', 'critical'];

export function WorkOrderModal() {
  const { 
    isWorkOrderModalOpen, 
    setWorkOrderModalOpen, 
    equipment,
    workOrderTemplates,
    selectedEquipmentId,
    showToast,
    refreshWorkOrders,
    editingWorkOrder,
    setEditingWorkOrder,
  } = useAppStore();

  const isEditMode = !!editingWorkOrder;

  const [formData, setFormData] = useState({
    equipmentId: selectedEquipmentId ?? '',
    templateId: '' as string,
    title: '',
    description: '',
    type: 'preventive' as WorkOrderType,
    priority: 'medium' as WorkOrderPriority,
    scheduledStart: '',
    scheduledEnd: '',
    estimatedHours: '',
    technician: '',
    partsRequired: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Update equipment ID when selected equipment changes
  useEffect(() => {
    if (selectedEquipmentId && !editingWorkOrder) {
      setFormData(prev => ({ ...prev, equipmentId: selectedEquipmentId }));
    }
  }, [selectedEquipmentId, editingWorkOrder]);

  // Reset form when modal opens, or populate for editing
  useEffect(() => {
    if (isWorkOrderModalOpen) {
      if (editingWorkOrder) {
        // Edit mode: populate with existing work order data
        setFormData({
          equipmentId: editingWorkOrder.equipmentId,
          templateId: editingWorkOrder.templateId || '',
          title: editingWorkOrder.title,
          description: editingWorkOrder.description || '',
          type: editingWorkOrder.type,
          priority: editingWorkOrder.priority,
          scheduledStart: editingWorkOrder.scheduledStart 
            ? new Date(editingWorkOrder.scheduledStart).toISOString().slice(0, 16) 
            : '',
          scheduledEnd: editingWorkOrder.scheduledEnd 
            ? new Date(editingWorkOrder.scheduledEnd).toISOString().slice(0, 16) 
            : '',
          estimatedHours: editingWorkOrder.estimatedHours?.toString() || '',
          technician: editingWorkOrder.technician || '',
          partsRequired: editingWorkOrder.partsRequired || '',
          notes: editingWorkOrder.notes || '',
        });
      } else {
        // Add mode: reset to defaults
        setFormData({
          equipmentId: selectedEquipmentId ?? (equipment[0]?.id ?? ''),
          templateId: '',
          title: '',
          description: '',
          type: 'preventive',
          priority: 'medium',
          scheduledStart: '',
          scheduledEnd: '',
          estimatedHours: '',
          technician: '',
          partsRequired: '',
          notes: '',
        });
      }
    }
  }, [isWorkOrderModalOpen, editingWorkOrder, selectedEquipmentId, equipment]);

  // Apply template when selected
  const handleTemplateChange = (templateId: string) => {
    setFormData(prev => ({ ...prev, templateId }));
    
    if (templateId) {
      const template = workOrderTemplates.find(t => t.id === templateId);
      if (template) {
        setFormData(prev => ({
          ...prev,
          title: template.name,
          description: template.description || '',
          type: template.type,
          priority: template.priority,
          estimatedHours: template.estimatedHours?.toString() || '',
          partsRequired: template.partsRequired || '',
          notes: template.checklist ? `Checklist:\n${template.checklist}` : '',
        }));
      }
    }
  };

  const handleClose = () => {
    setWorkOrderModalOpen(false);
    setEditingWorkOrder(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.equipmentId) {
      showToast('error', 'Please select a case');
      return;
    }

    if (!formData.title.trim()) {
      showToast('error', 'Please enter a title');
      return;
    }

    setIsSubmitting(true);
    try {
      const workOrderData = {
        equipmentId: formData.equipmentId,
        templateId: formData.templateId || null,
        title: formData.title.trim(),
        description: formData.description || null,
        type: formData.type,
        priority: formData.priority,
        status: editingWorkOrder?.status || 'draft' as const,
        scheduledStart: formData.scheduledStart ? new Date(formData.scheduledStart).toISOString() : null,
        scheduledEnd: formData.scheduledEnd ? new Date(formData.scheduledEnd).toISOString() : null,
        actualStart: editingWorkOrder?.actualStart || null,
        actualEnd: editingWorkOrder?.actualEnd || null,
        estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : null,
        actualHours: editingWorkOrder?.actualHours || null,
        technician: formData.technician || null,
        partsRequired: formData.partsRequired || null,
        notes: formData.notes || null,
      };

      if (isEditMode && editingWorkOrder?.id) {
        await window.electronAPI.updateWorkOrder(editingWorkOrder.id, workOrderData);
        showToast('success', 'Task updated successfully');
      } else {
        await window.electronAPI.addWorkOrder(workOrderData);
        showToast('success', 'Task created successfully');
      }

      handleClose();
      refreshWorkOrders();
    } catch (error) {
      showToast('error', isEditMode ? 'Failed to update task' : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingWorkOrder?.id) return;

    const confirmed = confirm('Are you sure you want to delete this task? This action cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await window.electronAPI.deleteWorkOrder(editingWorkOrder.id);
      showToast('success', 'Task deleted');
      handleClose();
      refreshWorkOrders();
    } catch (error) {
      showToast('error', 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isWorkOrderModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            {isEditMode ? 'Edit Task' : 'Create Task'}
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
            {/* Template Selection (only for new work orders) */}
            {!isEditMode && workOrderTemplates.length > 0 && (
              <div className={styles.formGroup}>
                <label className={styles.label}>Use Template</label>
                <select
                  className={styles.select}
                  value={formData.templateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                >
                  <option value="">-- No Template --</option>
                  {workOrderTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Case <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={formData.equipmentId}
                onChange={(e) => setFormData(prev => ({ ...prev, equipmentId: e.target.value }))}
                required
              >
                <option value="" disabled>Select case...</option>
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.make} {eq.model} {eq.serialNumber ? `(${eq.serialNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Title <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Quarterly Preventive Maintenance"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Type</label>
              <div className={styles.typeOptions}>
                {WORK_ORDER_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`${styles.typeOption} ${styles[type]} ${formData.type === type ? styles.selected : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, type }))}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Priority</label>
              <div className={styles.priorityOptions}>
                {PRIORITIES.map(priority => (
                  <button
                    key={priority}
                    type="button"
                    className={`${styles.priorityOption} ${styles[priority]} ${formData.priority === priority ? styles.selected : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, priority }))}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Attorney</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.technician}
                  onChange={(e) => setFormData(prev => ({ ...prev, technician: e.target.value }))}
                  placeholder="Assigned attorney"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Estimated Hours</label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimatedHours: e.target.value }))}
                  placeholder="e.g., 2.5"
                  min="0"
                  step="0.5"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Scheduled Start</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={formData.scheduledStart}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledStart: e.target.value }))}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Scheduled End</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={formData.scheduledEnd}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Description</label>
              <textarea
                className={styles.textarea}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of the work to be performed..."
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Documents Required</label>
              <input
                type="text"
                className={styles.input}
                value={formData.partsRequired}
                onChange={(e) => setFormData(prev => ({ ...prev, partsRequired: e.target.value }))}
                placeholder="List documents needed (comma separated)"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <textarea
                className={styles.textarea}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes, checklist items, or instructions..."
              />
            </div>
          </div>

          <div className={styles.footer}>
            {isEditMode && (
              <button 
                type="button" 
                className={styles.deleteButton}
                onClick={handleDelete}
                disabled={isDeleting || isSubmitting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <div className={styles.footerActions}>
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
                disabled={isSubmitting || isDeleting || !formData.equipmentId || !formData.title.trim()}
              >
                {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Task' : 'Create Task')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
