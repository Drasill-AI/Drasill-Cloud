import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import styles from './LogEntryModal.module.css';

const LOG_TYPES = ['preventive', 'corrective', 'emergency', 'inspection'] as const;
type LogType = typeof LOG_TYPES[number];

export function LogEntryModal() {
  const { 
    isLogModalOpen, 
    setLogModalOpen, 
    equipment, 
    selectedEquipmentId,
    showToast,
    refreshLogs,
  } = useAppStore();

  const [formData, setFormData] = useState({
    equipmentId: selectedEquipmentId ?? '',
    type: 'preventive' as LogType,
    technician: '',
    startedAt: new Date().toISOString().slice(0, 16),
    completedAt: '',
    durationMinutes: '',
    partsUsed: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update equipment ID when selected equipment changes
  useEffect(() => {
    if (selectedEquipmentId) {
      setFormData(prev => ({ ...prev, equipmentId: selectedEquipmentId }));
    }
  }, [selectedEquipmentId]);

  // Reset form when modal opens
  useEffect(() => {
    if (isLogModalOpen) {
      setFormData({
        equipmentId: selectedEquipmentId ?? (equipment[0]?.id ?? ''),
        type: 'preventive',
        technician: '',
        startedAt: new Date().toISOString().slice(0, 16),
        completedAt: '',
        durationMinutes: '',
        partsUsed: '',
        notes: '',
      });
    }
  }, [isLogModalOpen, selectedEquipmentId, equipment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.equipmentId) {
      showToast('error', 'Please select equipment');
      return;
    }

    setIsSubmitting(true);
    try {
      await window.electronAPI.addMaintenanceLog({
        equipmentId: formData.equipmentId,
        type: formData.type,
        startedAt: new Date(formData.startedAt).toISOString(),
        completedAt: formData.completedAt ? new Date(formData.completedAt).toISOString() : null,
        durationMinutes: formData.durationMinutes ? parseInt(formData.durationMinutes) : null,
        technician: formData.technician || null,
        partsUsed: formData.partsUsed || null,
        notes: formData.notes || null,
      });

      showToast('success', 'Maintenance log added successfully');
      setLogModalOpen(false);
      refreshLogs();
    } catch (error) {
      showToast('error', 'Failed to add maintenance log');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLogModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => setLogModalOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Add Maintenance Log
          </span>
          <button className={styles.closeButton} onClick={() => setLogModalOpen(false)}>
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
                Equipment <span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={formData.equipmentId}
                onChange={(e) => setFormData(prev => ({ ...prev, equipmentId: e.target.value }))}
                required
              >
                <option value="" disabled>Select equipment...</option>
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>
                    {eq.make} {eq.model} {eq.serialNumber ? `(${eq.serialNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Maintenance Type</label>
              <div className={styles.typeOptions}>
                {LOG_TYPES.map(type => (
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

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Technician</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.technician}
                  onChange={(e) => setFormData(prev => ({ ...prev, technician: e.target.value }))}
                  placeholder="Technician name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Duration (minutes)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData(prev => ({ ...prev, durationMinutes: e.target.value }))}
                  placeholder="e.g., 60"
                  min="0"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Start Time <span className={styles.required}>*</span>
                </label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={formData.startedAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, startedAt: e.target.value }))}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>End Time</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={formData.completedAt}
                  onChange={(e) => setFormData(prev => ({ ...prev, completedAt: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Parts Used</label>
              <input
                type="text"
                className={styles.input}
                value={formData.partsUsed}
                onChange={(e) => setFormData(prev => ({ ...prev, partsUsed: e.target.value }))}
                placeholder="List parts used (comma separated)"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <textarea
                className={styles.textarea}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes or observations..."
              />
            </div>
          </div>

          <div className={styles.footer}>
            <button 
              type="button" 
              className={styles.cancelButton}
              onClick={() => setLogModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={isSubmitting || !formData.equipmentId}
            >
              {isSubmitting ? 'Saving...' : 'Save Log Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
