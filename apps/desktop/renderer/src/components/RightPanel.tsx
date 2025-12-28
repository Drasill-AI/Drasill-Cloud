import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store';
import { FileContext, RAGSource } from '@drasill/shared';
import styles from './RightPanel.module.css';
import lonnieIcon from '../assets/lonnie.png';

export function RightPanel() {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [selectedContextPaths, setSelectedContextPaths] = useState<Set<string>>(new Set());
  const [apiKeyInput, setApiKeyInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    chatMessages,
    isChatLoading,
    chatError,
    hasApiKey,
    sendMessage,
    clearChat,
    cancelChat,
    setApiKey,
    activeTabId,
    tabs,
    fileContents,
    workspacePath,
    isIndexing,
    indexingProgress,
    ragChunksCount,
    indexWorkspace,
    clearRagIndex,
    openFile,
    isOnline,
    showToast,
  } = useAppStore();

  // Get current file context - supports multiple files
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  // Build combined context from selected files
  const fileContext: FileContext | undefined = useMemo(() => {
    // If no files selected, use active tab as default
    if (selectedContextPaths.size === 0 && activeTab) {
      const content = fileContents.get(activeTab.path);
      if (content) {
        return {
          filePath: activeTab.path,
          fileName: activeTab.name,
          fileType: activeTab.type,
          content: content.slice(0, 8000),
        };
      }
      return undefined;
    }
    
    // Combine content from all selected files
    const selectedTabs = tabs.filter(t => selectedContextPaths.has(t.path));
    if (selectedTabs.length === 0) return undefined;
    
    const combinedContent: string[] = [];
    let totalLength = 0;
    const maxTotal = 16000; // Combined limit
    
    for (const tab of selectedTabs) {
      const content = fileContents.get(tab.path);
      if (content) {
        const header = `\n--- ${tab.name} ---\n`;
        const remaining = maxTotal - totalLength - header.length;
        if (remaining <= 0) break;
        const sliced = content.slice(0, remaining);
        combinedContent.push(header + sliced);
        totalLength += header.length + sliced.length;
      }
    }
    
    return {
      filePath: selectedTabs.map(t => t.path).join(', '),
      fileName: selectedTabs.length === 1 ? selectedTabs[0].name : `${selectedTabs.length} files`,
      fileType: 'multiple',
      content: combinedContent.join('\n'),
    };
  }, [selectedContextPaths, tabs, fileContents, activeTab]);
  
  // Toggle file selection for context
  const toggleContextFile = useCallback((path: string) => {
    setSelectedContextPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isChatLoading) return;
    if (!isOnline) {
      showToast('warning', 'AI features unavailable while offline');
      return;
    }
    sendMessage(input.trim(), fileContext);
    setInput('');
  }, [input, isChatLoading, isOnline, sendMessage, fileContext, showToast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setShowSettings(false);
    }
  };

  // Helper function to handle citation clicks
  const handleCitationClick = useCallback((source: RAGSource) => {
    // Extract filename from path for the tab
    const fileName = source.fileName;
    openFile(source.filePath, fileName);
  }, [openFile]);

  // Render message content with clickable citations
  const renderMessageContent = useCallback((content: string, ragSources?: RAGSource[]) => {
    if (!ragSources || ragSources.length === 0) {
      return content;
    }

    // Parse citations like [[1]], [[2]], etc.
    const parts = content.split(/(\[\[\d+\]\])/g);
    
    return parts.map((part, index) => {
      const match = part.match(/^\[\[(\d+)\]\]$/);
      if (match) {
        const sourceIndex = parseInt(match[1], 10) - 1; // 1-indexed in text
        const source = ragSources[sourceIndex];
        if (source) {
          return (
            <button
              key={index}
              className={styles.citationLink}
              onClick={() => handleCitationClick(source)}
              title={`${source.fileName} (${source.section})`}
            >
              [{match[1]}]
            </button>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  }, [handleCitationClick]);

  // Settings modal
  if (showSettings) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>API SETTINGS</span>
          <button 
            className={styles.closeButton}
            onClick={() => setShowSettings(false)}
          >
            ✕
          </button>
        </div>
        <div className={styles.settingsContent}>
          <div className={styles.settingsForm}>
            <label className={styles.label}>OpenAI API Key</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-..."
              className={styles.input}
            />
            <p className={styles.hint}>
              Your API key is encrypted and stored locally on your device.
            </p>
            <button 
              className={styles.saveButton}
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim()}
            >
              Save API Key
            </button>
            {hasApiKey && (
              <p className={styles.success}>✓ API key is configured</p>
            )}

            {/* RAG Settings */}
            <div className={styles.divider} />
            <label className={styles.label}>Knowledge Base</label>
            {ragChunksCount > 0 ? (
              <>
                <p className={styles.ragStatus}>
                  📚 {ragChunksCount} chunks indexed
                </p>
                <div className={styles.ragButtons}>
                  <button 
                    className={styles.reindexButton}
                    onClick={() => { indexWorkspace(); setShowSettings(false); }}
                    disabled={isIndexing || !hasApiKey}
                  >
                    Re-index
                  </button>
                  <button 
                    className={styles.clearRagButton}
                    onClick={clearRagIndex}
                    disabled={isIndexing}
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.hint}>
                  Index your workspace to enable AI-powered document search.
                </p>
                <button 
                  className={styles.indexButton}
                  onClick={() => { indexWorkspace(); setShowSettings(false); }}
                  disabled={isIndexing || !hasApiKey || !workspacePath}
                >
                  {!workspacePath ? 'Open a workspace first' : 'Index Workspace'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>TROUBLESHOOTING LONNIE</span>
        <div className={styles.headerActions}>
          {ragChunksCount > 0 && (
            <span className={styles.ragBadge} title={`${ragChunksCount} chunks indexed`}>
              📚
            </span>
          )}
          <button 
            className={styles.settingsButton}
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Indexing progress */}
      {isIndexing && indexingProgress && (
        <div className={styles.indexingBar}>
          <div className={styles.indexingText}>
            Indexing: {indexingProgress.fileName} ({indexingProgress.percentage}%)
          </div>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${indexingProgress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* File context indicator and selector */}
      {tabs.length > 0 && (
        <div className={styles.contextSection}>
          <button 
            className={styles.contextBar}
            onClick={() => setShowContextSelector(!showContextSelector)}
          >
            <span className={styles.contextIcon}>📄</span>
            <span className={styles.contextFile}>
              {selectedContextPaths.size === 0 
                ? (activeTab?.name || 'No file selected')
                : selectedContextPaths.size === 1 
                  ? tabs.find(t => selectedContextPaths.has(t.path))?.name 
                  : `${selectedContextPaths.size} files selected`
              }
            </span>
            <span className={styles.contextLabel}>
              {selectedContextPaths.size === 0 ? 'Auto' : 'Context'}
            </span>
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              width="14" 
              height="14"
              className={`${styles.contextChevron} ${showContextSelector ? styles.open : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          
          {showContextSelector && (
            <div className={styles.contextSelector}>
              <div className={styles.contextSelectorHeader}>
                <span>Select files to include in context:</span>
                {selectedContextPaths.size > 0 && (
                  <button 
                    className={styles.clearSelection}
                    onClick={() => setSelectedContextPaths(new Set())}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className={styles.contextFileList}>
                {tabs.map(tab => (
                  <label key={tab.id} className={styles.contextFileItem}>
                    <input
                      type="checkbox"
                      checked={selectedContextPaths.has(tab.path)}
                      onChange={() => toggleContextFile(tab.path)}
                    />
                    <span className={styles.contextFileName}>{tab.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className={styles.content}>
        {chatMessages.length === 0 ? (
          <div className={styles.placeholder}>
            <img src={lonnieIcon} alt="Lonnie" className={styles.lonnieIcon} />
            <h3>Troubleshooting Lonnie</h3>
            <p>Ask questions about your documents</p>
            {!hasApiKey && (
              <button 
                className={styles.configureButton}
                onClick={() => setShowSettings(true)}
              >
                Configure API Key
              </button>
            )}
            {hasApiKey && ragChunksCount === 0 && workspacePath && (
              <button 
                className={styles.indexButton}
                onClick={indexWorkspace}
                disabled={isIndexing}
              >
                {isIndexing ? 'Indexing...' : 'Index Workspace for AI'}
              </button>
            )}
            {hasApiKey && ragChunksCount > 0 && (
              <p className={styles.ragHint}>
                📚 {ragChunksCount} chunks indexed - Ready to answer questions!
              </p>
            )}
            {hasApiKey && fileContext && (
              <p className={styles.contextHint}>
                Currently viewing: {fileContext.fileName}
              </p>
            )}
          </div>
        ) : (
          <div className={styles.messages}>
            {chatMessages.map((msg) => (
              <div 
                key={msg.id} 
                className={`${styles.message} ${styles[msg.role]}`}
              >
                <div className={styles.messageHeader}>
                  {msg.role === 'user' ? '👤 You' : <><img src={lonnieIcon} alt="Lonnie" className={styles.lonnieAvatar} /> Lonnie</>}
                </div>
                <div className={styles.messageContent}>
                  {msg.content ? (
                    msg.role === 'assistant' && msg.ragSources ? (
                      renderMessageContent(msg.content, msg.ragSources)
                    ) : (
                      msg.content
                    )
                  ) : (isChatLoading && msg.role === 'assistant' ? (
                    <span className={styles.typing}>Thinking...</span>
                  ) : null)}
                </div>
                {msg.role === 'assistant' && msg.ragSources && msg.ragSources.length > 0 && (
                  <div className={styles.sourcesList}>
                    <span className={styles.sourcesLabel}>Sources:</span>
                    {msg.ragSources.map((source, idx) => (
                      <button
                        key={idx}
                        className={styles.sourceButton}
                        onClick={() => handleCitationClick(source)}
                        title={source.section}
                      >
                        [{idx + 1}] {source.fileName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {chatError && (
        <div className={styles.errorBar}>
          {chatError}
        </div>
      )}

      {chatMessages.length > 0 && (
        <div className={styles.actionBar}>
          <button 
            className={styles.clearButton}
            onClick={clearChat}
            disabled={isChatLoading}
          >
            Clear Chat
          </button>
          {isChatLoading && (
            <button 
              className={styles.cancelButton}
              onClick={cancelChat}
            >
              Stop
            </button>
          )}
        </div>
      )}
      
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasApiKey ? "Ask a question..." : "Configure API key first..."}
          className={styles.input}
          disabled={!hasApiKey || isChatLoading}
          rows={1}
        />
        <button 
          className={styles.sendButton} 
          onClick={handleSend}
          disabled={!hasApiKey || !input.trim() || isChatLoading}
        >
          {isChatLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
