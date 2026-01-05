import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Equipment } from '@drasill/shared';
import styles from './LogEntryModal.module.css'; // Reuse modal styles

export function EquipmentModal() {
  const { 
    isEquipmentModalOpen, 
    setEquipmentModalOpen, 
    showToast,
    loadEquipment,
  } = useAppStore();

  const [formData, setFormData] = useState({
    name: '',
    make: '',
    model: '',
    serialNumber: '',
    installDate: '',
    location: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isEquipmentModalOpen) {
      setFormData({
        name: '',
        make: '',
        model: '',
        serialNumber: '',
        installDate: '',
        location: '',
        notes: '',
      });
    }
  }, [isEquipmentModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.make || !formData.model) {
      showToast('error', 'Please fill in case type and court');
      return;
    }

    setIsSubmitting(true);
    try {
      const equipment: Equipment = {
        name: formData.name || `${formData.make} ${formData.model}`,
        make: formData.make,
        model: formData.model,
        serialNumber: formData.serialNumber || undefined,
        installDate: formData.installDate || undefined,
        location: formData.location || undefined,
        notes: formData.notes || undefined,
      };

      await window.electronAPI.addEquipment(equipment);
      showToast('success', 'Case added successfully');
      setEquipmentModalOpen(false);
      loadEquipment();
    } catch (error) {
      showToast('error', 'Failed to add case');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isEquipmentModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => setEquipmentModalOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Add Case
          </span>
          <button className={styles.closeButton} onClick={() => setEquipmentModalOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className={styles.content} onSubmit={handleSubmit}>
          <div className={styles.form}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Case Type <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.make}
                  onChange={(e) => setFormData(prev => ({ ...prev, make: e.target.value }))}
                  placeholder="e.g., Civil, Criminal, Corporate"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Court <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.model}
                  onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="e.g., District Court"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Case Name</label>
              <input
                type="text"
                className={styles.input}
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Smith v. Jones"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Case/Docket Number</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.serialNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, serialNumber: e.target.value }))}
                  placeholder="e.g., 2024-CV-12345"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Filing Date</label>
                <input
                  type="date"
                  className={styles.input}
                  value={formData.installDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, installDate: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Jurisdiction</label>
              <input
                type="text"
                className={styles.input}
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Southern District of New York"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <textarea
                className={styles.textarea}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this case..."
              />
            </div>
          </div>

          <div className={styles.footer}>
            <button 
              type="button" 
              className={styles.cancelButton}
              onClick={() => setEquipmentModalOpen(false)}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className={styles.submitButton}
              disabled={isSubmitting || !formData.make || !formData.model}
            >
              {isSubmitting ? 'Saving...' : 'Add Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
