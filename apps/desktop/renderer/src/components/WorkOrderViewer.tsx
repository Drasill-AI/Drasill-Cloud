import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store';
import { WorkOrder, WorkOrderStatus, Equipment } from '@drasill/shared';
import styles from './WorkOrderViewer.module.css';

interface WorkOrderViewerProps {
  workOrderId: string;
}

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['in_progress', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function WorkOrderViewer({ workOrderId }: WorkOrderViewerProps) {
  const { 
    workOrders, 
    equipment, 
    showToast, 
    refreshWorkOrders, 
    refreshLogs,
    setWorkOrderModalOpen,
    setEditingWorkOrder,
    openEquipmentViewer,
  } = useAppStore();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [equipmentData, setEquipmentData] = useState<Equipment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeData, setCompleteData] = useState({ actualHours: '', notes: '' });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const wo = await window.electronAPI.getWorkOrder(workOrderId);
      setWorkOrder(wo);
      
      if (wo) {
        const eq = equipment.find(e => e.id === wo.equipmentId);
        setEquipmentData(eq || null);
      }
    } catch (error) {
      console.error('Failed to load work order:', error);
      showToast('error', 'Failed to load task');
    } finally {
      setIsLoading(false);
    }
  }, [workOrderId, equipment, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when work orders list updates
  useEffect(() => {
    const wo = workOrders.find(w => w.id === workOrderId);
    if (wo) {
      setWorkOrder(wo);
    }
  }, [workOrders, workOrderId]);

  const handleStatusChange = async (newStatus: WorkOrderStatus) => {
    if (!workOrder?.id) return;

    if (newStatus === 'completed') {
      setShowCompleteModal(true);
      return;
    }

    setIsUpdating(true);
    try {
      const updates: Partial<WorkOrder> = { status: newStatus };
      
      if (newStatus === 'in_progress' && !workOrder.actualStart) {
        updates.actualStart = new Date().toISOString();
      }

      await window.electronAPI.updateWorkOrder(workOrder.id, updates);
      showToast('success', `Task status changed to ${STATUS_LABELS[newStatus]}`);
      refreshWorkOrders();
      loadData();
    } catch (error) {
      showToast('error', 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleComplete = async () => {
    if (!workOrder?.id) return;
    
    const hours = parseFloat(completeData.actualHours);
    if (isNaN(hours) || hours < 0) {
      showToast('error', 'Please enter valid actual hours');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await window.electronAPI.completeWorkOrder(
        workOrder.id,
        {
          actualHours: hours,
          notes: completeData.notes || null,
          createMaintenanceLog: true
        }
      );

      if (result) {
        showToast('success', 'Task completed! Activity log created.');
        setShowCompleteModal(false);
        setCompleteData({ actualHours: '', notes: '' });
        refreshWorkOrders();
        refreshLogs();
        loadData();
      }
    } catch (error) {
      showToast('error', 'Failed to complete task');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEdit = () => {
    if (workOrder) {
      setEditingWorkOrder(workOrder);
      setWorkOrderModalOpen(true);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading task...</p>
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h3>Task Not Found</h3>
          <p>The task with ID "{workOrderId}" could not be found.</p>
        </div>
      </div>
    );
  }

  const availableTransitions = STATUS_TRANSITIONS[workOrder.status] || [];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.workOrderNumber}>{workOrder.workOrderNumber}</h2>
          <span className={`${styles.statusBadge} ${styles[workOrder.status]}`}>
            {STATUS_LABELS[workOrder.status]}
          </span>
          <span className={`${styles.priorityBadge} ${styles[workOrder.priority]}`}>
            {workOrder.priority.toUpperCase()}
          </span>
        </div>
        <div className={styles.headerActions}>
          {workOrder.status !== 'completed' && workOrder.status !== 'cancelled' && (
            <button className={styles.editButton} onClick={handleEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className={styles.titleSection}>
        <h1 className={styles.title}>{workOrder.title}</h1>
        <span className={`${styles.typeBadge} ${styles[workOrder.type]}`}>
          {workOrder.type.charAt(0).toUpperCase() + workOrder.type.slice(1)}
        </span>
      </div>

      {/* Status Actions */}
      {availableTransitions.length > 0 && (
        <div className={styles.statusActions}>
          <span className={styles.statusLabel}>Actions:</span>
          {availableTransitions.map(status => (
            <button
              key={status}
              className={`${styles.statusButton} ${styles[status]}`}
              onClick={() => handleStatusChange(status)}
              disabled={isUpdating}
            >
              {status === 'in_progress' && 'Start Work'}
              {status === 'on_hold' && 'Put On Hold'}
              {status === 'completed' && 'Complete'}
              {status === 'cancelled' && 'Cancel'}
              {status === 'open' && 'Open'}
            </button>
          ))}
        </div>
      )}

      {/* Content Grid */}
      <div className={styles.contentGrid}>
        {/* Left Column - Details */}
        <div className={styles.detailsSection}>
          <h3 className={styles.sectionTitle}>Details</h3>
          
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Case</span>
            <span className={styles.detailValue}>
              {equipmentData ? (
                <button 
                  className={styles.equipmentLink}
                  onClick={() => equipmentData.id && openEquipmentViewer(equipmentData.id)}
                >
                  {equipmentData.make} {equipmentData.model}
                  {equipmentData.serialNumber && ` (${equipmentData.serialNumber})`}
                </button>
              ) : '-'}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Attorney</span>
            <span className={styles.detailValue}>{workOrder.technician || '-'}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Estimated Hours</span>
            <span className={styles.detailValue}>
              {workOrder.estimatedHours ? `${workOrder.estimatedHours} hrs` : '-'}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Actual Hours</span>
            <span className={styles.detailValue}>
              {workOrder.actualHours ? `${workOrder.actualHours} hrs` : '-'}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Documents Required</span>
            <span className={styles.detailValue}>{workOrder.partsRequired || '-'}</span>
          </div>
        </div>

        {/* Right Column - Schedule */}
        <div className={styles.scheduleSection}>
          <h3 className={styles.sectionTitle}>Schedule</h3>
          
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Scheduled Start</span>
            <span className={styles.detailValue}>{formatDate(workOrder.scheduledStart)}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Scheduled End</span>
            <span className={styles.detailValue}>{formatDate(workOrder.scheduledEnd)}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Actual Start</span>
            <span className={styles.detailValue}>{formatDate(workOrder.actualStart)}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Actual End</span>
            <span className={styles.detailValue}>{formatDate(workOrder.actualEnd)}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Created</span>
            <span className={styles.detailValue}>{formatDate(workOrder.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      {workOrder.description && (
        <div className={styles.descriptionSection}>
          <h3 className={styles.sectionTitle}>Description</h3>
          <p className={styles.description}>{workOrder.description}</p>
        </div>
      )}

      {/* Notes */}
      {workOrder.notes && (
        <div className={styles.notesSection}>
          <h3 className={styles.sectionTitle}>Notes</h3>
          <pre className={styles.notes}>{workOrder.notes}</pre>
        </div>
      )}

      {/* Linked Activity Log */}
      {workOrder.maintenanceLogId && (
        <div className={styles.linkedLogSection}>
          <h3 className={styles.sectionTitle}>Linked Activity Log</h3>
          <p className={styles.linkedLogInfo}>
            ✅ Activity log created on completion (ID: {workOrder.maintenanceLogId})
          </p>
        </div>
      )}

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCompleteModal(false)}>
          <div className={styles.completeModal} onClick={e => e.stopPropagation()}>
            <h3>Complete Task</h3>
            <p>Enter the actual hours worked to complete this task. An activity log will be created automatically.</p>
            
            <div className={styles.formGroup}>
              <label>Actual Hours Worked *</label>
              <input
                type="number"
                value={completeData.actualHours}
                onChange={(e) => setCompleteData(prev => ({ ...prev, actualHours: e.target.value }))}
                placeholder="e.g., 2.5"
                min="0"
                step="0.5"
                autoFocus
              />
            </div>

            <div className={styles.formGroup}>
              <label>Completion Notes</label>
              <textarea
                value={completeData.notes}
                onChange={(e) => setCompleteData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any notes about the completed work..."
              />
            </div>

            <div className={styles.modalActions}>
              <button 
                className={styles.cancelButton}
                onClick={() => setShowCompleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.completeButton}
                onClick={handleComplete}
                disabled={isUpdating || !completeData.actualHours}
              >
                {isUpdating ? 'Completing...' : 'Complete & Create Activity Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
