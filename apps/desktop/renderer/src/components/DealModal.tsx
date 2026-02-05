import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Deal, DealStage, DealPriority } from '@drasill/shared';
import { MemoGenerator } from './MemoGenerator';
import styles from './DealModal.module.css';

const DEAL_STAGES: { value: DealStage; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'application', label: 'Application' },
  { value: 'underwriting', label: 'Underwriting' },
  { value: 'approved', label: 'Approved' },
  { value: 'funded', label: 'Funded' },
  { value: 'closed', label: 'Closed' },
  { value: 'declined', label: 'Declined' },
];

const DEAL_PRIORITIES: { value: DealPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function DealModal() {
  const { 
    isDealModalOpen, 
    setDealModalOpen, 
    editingDeal,
    setEditingDeal,
    showToast,
    loadDeals,
  } = useAppStore();

  const isEditMode = !!editingDeal;
  const [isCloneMode, setIsCloneMode] = useState(false);

  const [formData, setFormData] = useState({
    borrowerName: '',
    borrowerContact: '',
    loanAmount: '',
    interestRate: '',
    termMonths: '',
    collateralDescription: '',
    stage: 'lead' as DealStage,
    priority: 'medium' as DealPriority,
    assignedTo: '',
    expectedCloseDate: '',
    notes: '',
    documentPath: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMemoGenerator, setShowMemoGenerator] = useState(false);

  // Populate form when modal opens or editingDeal changes
  useEffect(() => {
    if (isDealModalOpen) {
      if (editingDeal) {
        // Edit mode - populate with existing deal data
        setFormData({
          borrowerName: editingDeal.borrowerName || '',
          borrowerContact: editingDeal.borrowerContact || '',
          loanAmount: editingDeal.loanAmount?.toString() || '',
          interestRate: editingDeal.interestRate?.toString() || '',
          termMonths: editingDeal.termMonths?.toString() || '',
          collateralDescription: editingDeal.collateralDescription || '',
          stage: editingDeal.stage || 'lead',
          priority: editingDeal.priority || 'medium',
          assignedTo: editingDeal.assignedTo || '',
          expectedCloseDate: editingDeal.expectedCloseDate || '',
          notes: editingDeal.notes || '',
          documentPath: editingDeal.documentPath || '',
        });
      } else {
        // Add mode - reset form
        setFormData({
          borrowerName: '',
          borrowerContact: '',
          loanAmount: '',
          interestRate: '',
          termMonths: '',
          collateralDescription: '',
          stage: 'lead',
          priority: 'medium',
          assignedTo: '',
          expectedCloseDate: '',
          notes: '',
          documentPath: '',
        });
        setIsCloneMode(false);
      }
      setShowDeleteConfirm(false);
    }
  }, [isDealModalOpen, editingDeal]);

  const handleClose = () => {
    setDealModalOpen(false);
    setEditingDeal(null);
    setShowDeleteConfirm(false);
    setIsCloneMode(false);
  };

  const handleCloneDeal = () => {
    // Switch to clone mode - keep form data but treat as new deal
    setIsCloneMode(true);
    setFormData(prev => ({
      ...prev,
      borrowerName: `${prev.borrowerName} (Copy)`,
      stage: 'lead', // Reset stage for cloned deal
    }));
    showToast('info', 'Creating a copy of this deal');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.borrowerName || !formData.loanAmount) {
      showToast('error', 'Please fill in borrower name and loan amount');
      return;
    }

    setIsSubmitting(true);
    try {
      const dealData: Partial<Deal> = {
        borrowerName: formData.borrowerName,
        borrowerContact: formData.borrowerContact || null,
        loanAmount: parseFloat(formData.loanAmount) || 0,
        interestRate: formData.interestRate ? parseFloat(formData.interestRate) : null,
        termMonths: formData.termMonths ? parseInt(formData.termMonths) : null,
        collateralDescription: formData.collateralDescription || null,
        stage: formData.stage,
        priority: formData.priority,
        assignedTo: formData.assignedTo || null,
        documentPath: formData.documentPath || null,
        notes: formData.notes || null,
        expectedCloseDate: formData.expectedCloseDate || null,
      };

      if (isEditMode && editingDeal?.id && !isCloneMode) {
        // Update existing deal
        await window.electronAPI.updateDeal(editingDeal.id, dealData);
        showToast('success', 'Deal updated successfully');
      } else {
        // Create new deal (including cloned deals)
        await window.electronAPI.addDeal({
          ...dealData,
          actualCloseDate: null,
        } as Omit<Deal, 'id' | 'dealNumber' | 'createdAt' | 'updatedAt'>);
        showToast('success', isCloneMode ? 'Deal cloned successfully' : 'Deal added successfully');
      }
      
      handleClose();
      loadDeals();
    } catch (error) {
      showToast('error', isEditMode ? 'Failed to update deal' : 'Failed to add deal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingDeal?.id) return;
    
    // Confirm before deleting
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${editingDeal.borrowerName}"?\n\nThis will also delete all associated activities and cannot be undone.`
    );
    if (!confirmed) return;
    
    setIsSubmitting(true);
    try {
      await window.electronAPI.deleteDeal(editingDeal.id);
      showToast('success', 'Deal deleted successfully');
      handleClose();
      loadDeals();
    } catch (error) {
      showToast('error', 'Failed to delete deal');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isDealModalOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            {isCloneMode ? 'Clone Deal' : (isEditMode ? 'Edit Deal' : 'Add New Deal')}
          </span>
          <div className={styles.headerActions}>
            {isEditMode && !isCloneMode && (
              <button 
                className={styles.generateDocButton}
                onClick={() => setShowMemoGenerator(true)}
                title="Generate Document"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </button>
            )}
            {isEditMode && !isCloneMode && (
              <button 
                className={styles.cloneButton}
                onClick={handleCloneDeal}
                title="Clone this deal"
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            )}
            <button className={styles.closeButton} onClick={handleClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {isEditMode && editingDeal && (
          <div className={styles.dealInfo}>
            <span className={styles.dealNumber}>{editingDeal.dealNumber}</span>
            <span className={styles.dealCreated}>Created: {new Date(editingDeal.createdAt || '').toLocaleDateString()}</span>
          </div>
        )}

        <form className={styles.content} onSubmit={handleSubmit}>
          <div className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Borrower Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                value={formData.borrowerName}
                onChange={(e) => setFormData(prev => ({ ...prev, borrowerName: e.target.value }))}
                placeholder="e.g., Acme Corporation"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Loan Amount <span className={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.loanAmount}
                  onChange={(e) => setFormData(prev => ({ ...prev, loanAmount: e.target.value }))}
                  placeholder="e.g., 500000"
                  min="0"
                  step="1000"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Interest Rate (%)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.interestRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, interestRate: e.target.value }))}
                  placeholder="e.g., 7.5"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Term (months)</label>
                <input
                  type="number"
                  className={styles.input}
                  value={formData.termMonths}
                  onChange={(e) => setFormData(prev => ({ ...prev, termMonths: e.target.value }))}
                  placeholder="e.g., 60"
                  min="1"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Expected Close Date</label>
                <input
                  type="date"
                  className={styles.input}
                  value={formData.expectedCloseDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, expectedCloseDate: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Stage</label>
                <select
                  className={styles.select}
                  value={formData.stage}
                  onChange={(e) => setFormData(prev => ({ ...prev, stage: e.target.value as DealStage }))}
                >
                  {DEAL_STAGES.map(stage => (
                    <option key={stage.value} value={stage.value}>{stage.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Priority</label>
                <select
                  className={styles.select}
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as DealPriority }))}
                >
                  {DEAL_PRIORITIES.map(priority => (
                    <option key={priority.value} value={priority.value}>{priority.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Borrower Contact</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.borrowerContact}
                  onChange={(e) => setFormData(prev => ({ ...prev, borrowerContact: e.target.value }))}
                  placeholder="e.g., john@acme.com"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Assigned To</label>
                <input
                  type="text"
                  className={styles.input}
                  value={formData.assignedTo}
                  onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder="e.g., Jane Smith"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Collateral Description</label>
              <input
                type="text"
                className={styles.input}
                value={formData.collateralDescription}
                onChange={(e) => setFormData(prev => ({ ...prev, collateralDescription: e.target.value }))}
                placeholder="e.g., Commercial real estate at 123 Main St"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Document Folder Path</label>
              <input
                type="text"
                className={styles.input}
                value={formData.documentPath}
                onChange={(e) => setFormData(prev => ({ ...prev, documentPath: e.target.value }))}
                placeholder="e.g., C:\\Deals\\AcmeCorp"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Notes</label>
              <textarea
                className={styles.textarea}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this deal..."
              />
            </div>
          </div>

          <div className={styles.footer}>
            {isEditMode && !isCloneMode && (
              <div className={styles.deleteSection}>
                {showDeleteConfirm ? (
                  <>
                    <span className={styles.deleteConfirmText}>Delete this deal?</span>
                    <button 
                      type="button" 
                      className={styles.deleteConfirmButton}
                      onClick={handleDelete}
                      disabled={isSubmitting}
                    >
                      Yes, Delete
                    </button>
                    <button 
                      type="button" 
                      className={styles.cancelDeleteButton}
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button 
                    type="button" 
                    className={styles.deleteButton}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    🗑️ Delete Deal
                  </button>
                )}
              </div>
            )}
            <div className={styles.actionButtons}>
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
                {isSubmitting 
                  ? (isCloneMode ? 'Cloning...' : (isEditMode ? 'Saving...' : 'Adding...')) 
                  : (isCloneMode ? 'Clone Deal' : (isEditMode ? 'Save Changes' : 'Add Deal'))}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Memo Generator Modal */}
      {showMemoGenerator && editingDeal && (
        <MemoGenerator
          isOpen={showMemoGenerator}
          onClose={() => setShowMemoGenerator(false)}
          deal={editingDeal}
        />
      )}
    </div>
  );
}
