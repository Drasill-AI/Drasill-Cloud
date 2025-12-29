import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { WorkOrderStatus, WorkOrderPriority } from '@drasill/shared';
import styles from './WorkOrdersPanel.module.css';

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ALL_STATUSES: WorkOrderStatus[] = ['draft', 'open', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const ALL_PRIORITIES: WorkOrderPriority[] = ['low', 'medium', 'high', 'critical'];

export function WorkOrdersPanel() {
  const { 
    workOrders, 
    equipment,
    workOrdersRefreshTrigger,
    loadWorkOrders,
    openWorkOrderViewer,
    setWorkOrderModalOpen,
    setTemplateModalOpen,
  } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<WorkOrderPriority | 'all'>('all');
  const [equipmentFilter, setEquipmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWorkOrders();
  }, [workOrdersRefreshTrigger, loadWorkOrders]);

  const getEquipmentName = (equipmentId: string) => {
    const eq = equipment.find(e => e.id === equipmentId);
    return eq ? `${eq.make} ${eq.model}` : 'Unknown';
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    if (statusFilter !== 'all' && wo.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && wo.priority !== priorityFilter) return false;
    if (equipmentFilter !== 'all' && wo.equipmentId !== equipmentFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesNumber = wo.workOrderNumber.toLowerCase().includes(query);
      const matchesTitle = wo.title.toLowerCase().includes(query);
      const matchesTechnician = wo.technician?.toLowerCase().includes(query);
      if (!matchesNumber && !matchesTitle && !matchesTechnician) return false;
    }
    return true;
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusCounts = () => {
    const counts: Record<string, number> = {};
    ALL_STATUSES.forEach(s => {
      counts[s] = workOrders.filter(wo => wo.status === s).length;
    });
    return counts;
  };

  const statusCounts = getStatusCounts();

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Work Orders
          </h2>
          <span className={styles.count}>{workOrders.length} total</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.templatesButton} onClick={() => setTemplateModalOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Templates
          </button>
          <button className={styles.createButton} onClick={() => setWorkOrderModalOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Work Order
          </button>
        </div>
      </div>

      {/* Status Summary */}
      <div className={styles.statusSummary}>
        {ALL_STATUSES.filter(s => s !== 'cancelled').map(status => (
          <button
            key={status}
            className={`${styles.statusCard} ${styles[status]} ${statusFilter === status ? styles.active : ''}`}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
          >
            <span className={styles.statusCount}>{statusCounts[status]}</span>
            <span className={styles.statusName}>{STATUS_LABELS[status]}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by WO#, title, or technician..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className={styles.filterSelect}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as WorkOrderPriority | 'all')}
        >
          <option value="all">All Priorities</option>
          {ALL_PRIORITIES.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={equipmentFilter}
          onChange={(e) => setEquipmentFilter(e.target.value)}
        >
          <option value="all">All Equipment</option>
          {equipment.map(eq => (
            <option key={eq.id} value={eq.id}>{eq.make} {eq.model}</option>
          ))}
        </select>

        {(statusFilter !== 'all' || priorityFilter !== 'all' || equipmentFilter !== 'all' || searchQuery) && (
          <button
            className={styles.clearFilters}
            onClick={() => {
              setStatusFilter('all');
              setPriorityFilter('all');
              setEquipmentFilter('all');
              setSearchQuery('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Work Orders Table */}
      <div className={styles.tableContainer}>
        {filteredWorkOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
            <p>No work orders found</p>
            <button onClick={() => setWorkOrderModalOpen(true)}>
              Create your first work order
            </button>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>WO #</th>
                <th>Title</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Technician</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkOrders.map(wo => (
                <tr 
                  key={wo.id} 
                  onClick={() => wo.id && openWorkOrderViewer(wo.id)}
                  className={styles.tableRow}
                >
                  <td className={styles.woNumber}>{wo.workOrderNumber}</td>
                  <td className={styles.woTitle}>{wo.title}</td>
                  <td>{getEquipmentName(wo.equipmentId)}</td>
                  <td>
                    <span className={`${styles.typeBadge} ${styles[wo.type]}`}>
                      {wo.type}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.priorityBadge} ${styles[wo.priority]}`}>
                      {wo.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[wo.status]}`}>
                      {STATUS_LABELS[wo.status]}
                    </span>
                  </td>
                  <td>{formatDate(wo.scheduledStart)}</td>
                  <td>{wo.technician || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
