import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../store';
import styles from './ChatHistory.module.css';

interface ChatHistoryProps {
  onClose: () => void;
}

/**
 * Format date for display - groups by Today, Yesterday, This Week, etc.
 */
function formatDateGroup(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return 'Older';
}

/**
 * Format time for display
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

/**
 * Format full date for export
 */
function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({ onClose }) => {
  const { 
    chatSessions, 
    loadChatSessions, 
    loadSession, 
    deleteSession,
    currentSessionId,
    showToast,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return chatSessions;
    const query = searchQuery.toLowerCase();
    return chatSessions.filter(session => 
      session.title?.toLowerCase().includes(query) ||
      session.firstMessage?.toLowerCase().includes(query) ||
      session.dealName?.toLowerCase().includes(query) ||
      session.sources?.some(s => s.fileName?.toLowerCase().includes(query))
    );
  }, [chatSessions, searchQuery]);

  // Group sessions by date
  const groupedSessions = filteredSessions.reduce((groups, session) => {
    const group = formatDateGroup(session.updatedAt);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(session);
    return groups;
  }, {} as Record<string, typeof chatSessions>);

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];

  const handleSessionClick = (sessionId: string) => {
    loadSession(sessionId);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirm('Delete this chat?')) {
      deleteSession(sessionId);
    }
  };

  // Export all chat history as Markdown
  const handleExportAllHistory = async () => {
    try {
      let markdown = '# Drasill Finance - Chat History Export\n\n';
      markdown += `_Exported on ${formatFullDate(new Date().toISOString())}_\n\n`;
      markdown += `Total Sessions: ${chatSessions.length}\n\n---\n\n`;

      for (const session of chatSessions) {
        markdown += `## ${session.title || session.firstMessage || 'Untitled Chat'}\n\n`;
        markdown += `**Date:** ${formatFullDate(session.updatedAt)}\n`;
        markdown += `**Messages:** ${session.messageCount}\n`;
        if (session.dealName) {
          markdown += `**Deal:** ${session.dealName}\n`;
        }
        if (session.sources && session.sources.length > 0) {
          markdown += `**Sources:** ${session.sources.map(s => s.fileName).join(', ')}\n`;
        }
        markdown += '\n';
        
        // Load full session to get messages
        try {
          const fullSession = await window.electronAPI.getChatSession(session.id);
          if (fullSession?.messages) {
            for (const msg of fullSession.messages) {
              const role = msg.role === 'user' ? '**You:**' : '**Lonnie:**';
              markdown += `${role} ${msg.content}\n\n`;
            }
          }
        } catch {
          markdown += '_Unable to load full session messages_\n\n';
        }
        
        markdown += '---\n\n';
      }

      // Download as file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-history-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('success', 'Chat history exported successfully');
    } catch (error) {
      showToast('error', 'Failed to export chat history');
    }
  };

  // Export single session
  const handleExportSession = async (e: React.MouseEvent, sessionId: string, sessionTitle: string) => {
    e.stopPropagation();
    try {
      const fullSession = await window.electronAPI.getChatSession(sessionId);
      if (!fullSession) {
        showToast('error', 'Failed to load session');
        return;
      }

      let markdown = `# ${sessionTitle || 'Chat Session'}\n\n`;
      markdown += `_Exported on ${formatFullDate(new Date().toISOString())}_\n\n`;
      
      if (fullSession.dealName) {
        markdown += `**Deal:** ${fullSession.dealName}\n\n`;
      }
      
      if (fullSession.sources && fullSession.sources.length > 0) {
        markdown += `**Sources:**\n`;
        for (const source of fullSession.sources) {
          markdown += `- ${source.fileName}\n`;
        }
        markdown += '\n';
      }

      markdown += '---\n\n';

      for (const msg of fullSession.messages) {
        const role = msg.role === 'user' ? '**You:**' : '**Lonnie:**';
        markdown += `${role} ${msg.content}\n\n`;
      }

      // Download as file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (sessionTitle || 'chat').replace(/[^a-z0-9]/gi, '-').toLowerCase();
      a.download = `${safeTitle}-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('success', 'Chat exported');
    } catch (error) {
      showToast('error', 'Failed to export chat');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>💬 Chat History</h3>
        <div className={styles.headerActions}>
          {chatSessions.length > 0 && (
            <button 
              className={styles.exportAllButton}
              onClick={handleExportAllHistory}
              title="Export all chats"
            >
              📥 Export All
            </button>
          )}
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button 
            className={styles.clearSearch}
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>
      
      <div className={styles.content}>
        {filteredSessions.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery ? (
              <>
                <p>No chats found</p>
                <p className={styles.hint}>Try a different search term</p>
              </>
            ) : (
              <>
                <p>No chat history yet</p>
                <p className={styles.hint}>Start a conversation to see it here</p>
              </>
            )}
          </div>
        ) : (
          groupOrder.map(group => {
            const sessions = groupedSessions[group];
            if (!sessions || sessions.length === 0) return null;
            
            return (
              <div key={group} className={styles.group}>
                <div className={styles.groupHeader}>{group}</div>
                {sessions.map(session => (
                  <div 
                    key={session.id}
                    className={`${styles.sessionItem} ${session.id === currentSessionId ? styles.active : ''}`}
                    onClick={() => handleSessionClick(session.id)}
                  >
                    <div className={styles.sessionMain}>
                      <div className={styles.sessionIcon}>
                        {session.dealName ? '📄' : '💬'}
                      </div>
                      <div className={styles.sessionInfo}>
                        <div className={styles.sessionTitle}>
                          {session.title || session.firstMessage || 'New Chat'}
                        </div>
                        {session.dealName && (
                          <div className={styles.sessionDeal}>
                            Deal: {session.dealName}
                          </div>
                        )}
                        {session.sources && session.sources.length > 0 && (
                          <div className={styles.sessionSources}>
                            📚 {session.sources.length} source{session.sources.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        {session.firstMessage && session.title !== session.firstMessage && (
                          <div className={styles.sessionPreview}>
                            {session.firstMessage.slice(0, 60)}
                            {session.firstMessage.length > 60 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.sessionMeta}>
                      <span className={styles.sessionTime}>
                        {formatTime(session.updatedAt)}
                      </span>
                      <span className={styles.sessionCount}>
                        {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                      </span>
                      <button 
                        className={styles.exportButton}
                        onClick={(e) => handleExportSession(e, session.id, session.title || session.firstMessage || 'chat')}
                        title="Export chat"
                      >
                        📥
                      </button>
                      <button 
                        className={styles.deleteButton}
                        onClick={(e) => handleDelete(e, session.id)}
                        title="Delete chat"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
