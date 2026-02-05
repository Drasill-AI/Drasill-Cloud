import React, { useState, useRef, useEffect, useCallback, useMemo, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { useAppStore } from '../store';
import { FileContext, RAGSource, KnowledgeProfile } from '@drasill/shared';
import styles from './RightPanel.module.css';
import lonnieLogo from '../assets/lonnie.png';
import { ChatHistory } from './ChatHistory';
import { UsageStats } from './UsageStats';
import { KnowledgeBaseModal } from './KnowledgeBaseModal';
import { TemplateManager } from './TemplateManager';

/**
 * Parse simple markdown-like formatting into React elements
 */
function parseMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = '';
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const items = listItems.map((item, i) => (
        <li key={i}>{formatInlineText(item)}</li>
      ));
      if (listType === 'ul') {
        elements.push(<ul key={elements.length} className={styles.markdownList}>{items}</ul>);
      } else {
        elements.push(<ol key={elements.length} className={styles.markdownList}>{items}</ol>);
      }
      listItems = [];
      listType = null;
    }
  };

  const formatInlineText = (text: string): ReactNode => {
    // Bold: **text** or __text__
    // Italic: *text* or _text_
    // Inline code: `code`
    const parts: ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Check for inline code first
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        parts.push(<code key={key++} className={styles.inlineCode}>{codeMatch[1]}</code>);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Check for bold
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Check for italic
      const italicMatch = remaining.match(/^\*(.+?)\*/);
      if (italicMatch) {
        parts.push(<em key={key++}>{italicMatch[1]}</em>);
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Find next special character
      const nextSpecial = remaining.search(/[`*]/);
      if (nextSpecial === -1) {
        parts.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        // Special char but didn't match pattern, add it literally
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        parts.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block start/end
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        flushList();
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
        codeContent = [];
      } else {
        elements.push(
          <pre key={elements.length} className={styles.codeBlock}>
            <code className={codeLanguage ? styles[`lang-${codeLanguage}`] : ''}>
              {codeContent.join('\n')}
            </code>
          </pre>
        );
        inCodeBlock = false;
        codeContent = [];
        codeLanguage = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const content = headerMatch[2];
      if (level === 1) {
        elements.push(<h3 key={elements.length} className={styles.markdownH1}>{content}</h3>);
      } else if (level === 2) {
        elements.push(<h4 key={elements.length} className={styles.markdownH2}>{content}</h4>);
      } else {
        elements.push(<h5 key={elements.length} className={styles.markdownH3}>{content}</h5>);
      }
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(olMatch[1]);
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      flushList();
      elements.push(<hr key={elements.length} className={styles.markdownHr} />);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<p key={elements.length} className={styles.markdownP}>{formatInlineText(line)}</p>);
  }

  // Flush any remaining list
  flushList();

  // If still in code block, close it
  if (inCodeBlock && codeContent.length > 0) {
    elements.push(
      <pre key={elements.length} className={styles.codeBlock}>
        <code>{codeContent.join('\n')}</code>
      </pre>
    );
  }

  return elements;
}

export function RightPanel() {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [selectedContextPaths, setSelectedContextPaths] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Knowledge Base state
  const [isKnowledgeBaseOpen, setIsKnowledgeBaseOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [profiles, setProfiles] = useState<KnowledgeProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<KnowledgeProfile | null>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  
  const {
    chatMessages,
    isChatLoading,
    chatError,
    sendMessage,
    clearChat,
    cancelChat,
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
    openOneDriveFile,
    isHistoryOpen,
    toggleHistory,
    currentSessionId: _currentSessionId,
    loadChatSessions,
    openFileInSplitView,
  } = useAppStore();

  // Source context menu state
  const [sourceContextMenu, setSourceContextMenu] = useState<{
    x: number;
    y: number;
    source: RAGSource;
  } | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setSourceContextMenu(null);
      }
    };
    if (sourceContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sourceContextMenu]);

  // Load chat sessions on mount
  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  // Load knowledge profiles
  useEffect(() => {
    loadProfiles();
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
    };
    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileDropdown]);

  const loadProfiles = async () => {
    try {
      const allProfiles = await window.electronAPI.knowledgeProfileGetAll();
      setProfiles(allProfiles);
      const active = allProfiles.find((p: KnowledgeProfile) => p.isActive);
      setActiveProfile(active || null);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const handleSetActiveProfile = async (profileId: string | null) => {
    try {
      await window.electronAPI.knowledgeProfileSetActive(profileId);
      await loadProfiles();
      setShowProfileDropdown(false);
    } catch (error) {
      console.error('Failed to set active profile:', error);
    }
  };

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
    sendMessage(input.trim(), fileContext);
    setInput('');
  }, [input, isChatLoading, sendMessage, fileContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper function to handle citation clicks
  const handleCitationClick = useCallback((source: RAGSource) => {
    console.log('[RightPanel] Citation clicked:', source);
    
    // Check if this is an OneDrive file
    if (source.source === 'onedrive' && source.oneDriveId) {
      console.log('[RightPanel] Opening OneDrive file:', source.oneDriveId, 'page:', source.pageNumber);
      // Create a TreeNode-like object for openOneDriveFile
      const ext = source.fileName.split('.').pop()?.toLowerCase() || '';
      openOneDriveFile({
        id: source.oneDriveId,
        name: source.fileName,
        path: source.filePath,
        isDirectory: false,
        extension: ext,
        source: 'onedrive',
        oneDriveId: source.oneDriveId,
      }, source.pageNumber);
    } else {
      console.log('[RightPanel] Opening local file:', source.filePath);
      // Local file - use regular openFile
      openFile(source.filePath, source.fileName);
    }
  }, [openFile, openOneDriveFile]);

  // Handle opening source in split view
  const handleOpenInSplitView = useCallback((source: RAGSource) => {
    console.log('[RightPanel] Opening in split view:', source);
    openFileInSplitView(
      source.filePath,
      source.fileName,
      source.source,
      source.oneDriveId,
      source.pageNumber
    );
    setSourceContextMenu(null);
  }, [openFileInSplitView]);

  // Handle source right-click for context menu
  const handleSourceContextMenu = useCallback((e: React.MouseEvent, source: RAGSource) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[RightPanel] Context menu triggered at:', e.clientX, e.clientY, 'for source:', source.fileName);
    setSourceContextMenu({
      x: e.clientX,
      y: e.clientY,
      source,
    });
  }, []);

  // Render message content with markdown and clickable citations
  const renderMessageContent = useCallback((content: string, ragSources?: RAGSource[]) => {
    // First, handle citations if present
    let processedContent = content;
    
    if (ragSources && ragSources.length > 0) {
      // Replace [[1]], [[2]], or [1], [2] etc. with placeholder markers
      // We'll render these as clickable links
      const citationElements: Map<string, ReactNode> = new Map();
      
      // Match both [[1]] and [1] formats (but not inside links like [text](url))
      processedContent = content.replace(/\[\[(\d+)\]\]|\[(\d+)\](?!\()/g, (match, doubleNum, singleNum) => {
        const num = doubleNum || singleNum;
        const sourceIndex = parseInt(num, 10) - 1;
        const source = ragSources[sourceIndex];
        if (source) {
          const placeholder = `__CITATION_${num}__`;
          const clickHandler = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[RightPanel] Citation button clicked!', num, source);
            handleCitationClick(source);
          };
          citationElements.set(placeholder, (
            <button
              key={`citation-${num}`}
              className={styles.citationLink}
              onClick={clickHandler}
              title={`${source.fileName} (${source.section})${source.source === 'onedrive' ? ' - OneDrive' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              [{num}]
            </button>
          ));
          return placeholder;
        }
        return match;
      });

      // Parse markdown then replace citation placeholders
      const parsed = parseMarkdown(processedContent);
      
      // Replace placeholders in parsed content
      const replacePlaceholders = (node: ReactNode): ReactNode => {
        if (typeof node === 'string') {
          const parts: ReactNode[] = [];
          let remaining = node;
          let key = 0;
          
          while (remaining.length > 0) {
            const match = remaining.match(/__CITATION_(\d+)__/);
            if (match && match.index !== undefined) {
              if (match.index > 0) {
                parts.push(remaining.slice(0, match.index));
              }
              const citation = citationElements.get(match[0]);
              if (citation) {
                parts.push(<span key={key++}>{citation}</span>);
              }
              remaining = remaining.slice(match.index + match[0].length);
            } else {
              parts.push(remaining);
              break;
            }
          }
          
          return parts.length === 1 ? parts[0] : <>{parts}</>;
        }
        
        if (Array.isArray(node)) {
          return node.map((child, i) => <span key={i}>{replacePlaceholders(child)}</span>);
        }
        
        if (React.isValidElement(node)) {
          const element = node as React.ReactElement<{ children?: ReactNode }>;
          if (element.props.children) {
            return React.cloneElement(element, {
              ...element.props,
              children: replacePlaceholders(element.props.children)
            });
          }
        }
        
        return node;
      };

      return <div className={styles.markdownContent}>{parsed.map((el, i) => <span key={i}>{replacePlaceholders(el)}</span>)}</div>;
    }

    // No citations, just parse markdown
    return <div className={styles.markdownContent}>{parseMarkdown(content)}</div>;
  }, [handleCitationClick]);

  // Settings modal (RAG settings only)
  if (showSettings) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>SETTINGS</span>
          <button 
            className={styles.closeButton}
            onClick={() => setShowSettings(false)}
          >
            ✕
          </button>
        </div>
        <div className={styles.settingsContent}>
          {/* Usage Stats Section */}
          <UsageStats />
          
          <div className={styles.settingsForm} style={{ marginTop: '16px' }}>
            <label className={styles.label}>Knowledge Base</label>
            {ragChunksCount > 0 ? (
              <>
                <p className={styles.ragStatus}>
                  {ragChunksCount} chunks indexed
                </p>
                <div className={styles.ragButtons}>
                  <button 
                    className={styles.reindexButton}
                    onClick={() => { indexWorkspace(); setShowSettings(false); }}
                    disabled={isIndexing}
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
                  disabled={isIndexing || !workspacePath}
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
        <span className={styles.title}>DEAL ASSISTANT</span>
        <div className={styles.headerActions}>
          {/* Profile Switcher */}
          <div className={styles.profileSwitcher} ref={profileDropdownRef}>
            <button 
              className={`${styles.profileButton} ${activeProfile ? styles.active : ''}`}
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              title={activeProfile ? `Profile: ${activeProfile.name}` : 'No profile active'}
            >
              {activeProfile && <span className={styles.profileButtonDot} />}
              <span>{activeProfile?.name || 'Profile'}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showProfileDropdown && (
              <div className={styles.profileDropdown}>
                {profiles.map(profile => (
                  <div
                    key={profile.id}
                    className={`${styles.profileDropdownItem} ${profile.isActive ? styles.selected : ''}`}
                    onClick={() => handleSetActiveProfile(profile.isActive ? null : profile.id)}
                  >
                    <span className={styles.profileDropdownName}>{profile.name}</span>
                    {profile.isActive && (
                      <svg className={styles.profileDropdownCheck} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </div>
                ))}
                <div className={styles.profileDropdownDivider} />
                <div 
                  className={styles.profileDropdownAction}
                  onClick={() => { setIsKnowledgeBaseOpen(true); setShowProfileDropdown(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  Manage Knowledge Base
                </div>
                <div 
                  className={styles.profileDropdownAction}
                  onClick={() => { setIsTemplateManagerOpen(true); setShowProfileDropdown(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Document Templates
                </div>
              </div>
            )}
          </div>
          <button 
            className={`${styles.historyButton} ${isHistoryOpen ? styles.active : ''}`}
            onClick={toggleHistory}
            title="Chat History"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          {ragChunksCount > 0 && (
            <button 
              className={styles.ragBadge} 
              title={`${ragChunksCount} chunks indexed. Click to re-index.`}
              onClick={() => indexWorkspace(true)}
              disabled={isIndexing}
            >
              🔄 {ragChunksCount}
            </button>
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

      {/* Knowledge Base Modal */}
      <KnowledgeBaseModal 
        isOpen={isKnowledgeBaseOpen} 
        onClose={() => { setIsKnowledgeBaseOpen(false); loadProfiles(); }} 
      />
      
      {/* Template Manager Modal */}
      <TemplateManager 
        isOpen={isTemplateManagerOpen} 
        onClose={() => setIsTemplateManagerOpen(false)} 
      />

      {/* Chat History Panel */}
      {isHistoryOpen && (
        <div className={styles.historyPanel}>
          <ChatHistory onClose={toggleHistory} />
        </div>
      )}

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
            <img src={lonnieLogo} alt="Lonnie" className={styles.lonnieIcon} />
            <h3>Lonnie - Deal Assistant</h3>
            <p>Ask questions about your deals and documents</p>
            {ragChunksCount === 0 && workspacePath && (
              <button 
                className={styles.indexButton}
                onClick={() => indexWorkspace()}
                disabled={isIndexing}
              >
                {isIndexing ? 'Indexing...' : 'Index Workspace for AI'}
              </button>
            )}
            {ragChunksCount > 0 && (
              <p className={styles.ragHint}>
                {ragChunksCount} chunks indexed - Ready to answer questions!
              </p>
            )}
            {fileContext && (
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
                  {msg.role === 'user' ? '👤 You' : <><img src={lonnieLogo} alt="Lonnie" className={styles.lonnieAvatar} /> Lonnie</>}
                </div>
                <div className={styles.messageContent}>
                  {msg.content ? (
                    msg.role === 'assistant' ? (
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
                        className={`${styles.sourceButton} ${source.fromOtherDeal ? styles.otherDealSource : ''}`}
                        onClick={() => handleCitationClick(source)}
                        onContextMenu={(e) => handleSourceContextMenu(e, source)}
                        title={`${source.section}${source.source === 'onedrive' ? ' (OneDrive)' : ''}${source.fromOtherDeal ? ' (From other deal)' : ''}${source.relevanceScore ? ` - ${Math.round(source.relevanceScore * 100)}% relevant` : ''} - Right-click for more options`}
                      >
                        {source.source === 'onedrive' && <span className={styles.cloudIcon}>☁️</span>}
                        {source.fromOtherDeal && <span className={styles.otherDealIcon}>⚠️</span>}
                        [{idx + 1}] {source.fileName}
                        {source.relevanceScore !== undefined && (
                          <span className={styles.relevanceScore}>
                            {Math.round(source.relevanceScore * 100)}%
                          </span>
                        )}
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
            className={styles.newChatButton}
            onClick={clearChat}
            disabled={isChatLoading}
            title="Start new chat"
          >
            + New Chat
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
          data-chat-input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question... (Ctrl+/)"
          className={styles.input}
          disabled={isChatLoading}
          rows={1}
        />
        <button 
          className={styles.sendButton} 
          onClick={handleSend}
          disabled={!input.trim() || isChatLoading}
        >
          {isChatLoading ? '...' : 'Send'}
        </button>
      </div>

      {/* Source Context Menu - Using Portal to escape overflow:hidden */}
      {sourceContextMenu && ReactDOM.createPortal(
        <div 
          ref={sourceMenuRef}
          className={styles.sourceContextMenu}
          style={{ 
            top: sourceContextMenu.y, 
            left: sourceContextMenu.x 
          }}
        >
          <button 
            className={styles.contextMenuItem}
            onClick={() => handleOpenInSplitView(sourceContextMenu.source)}
          >
            📄 Open in Split View
          </button>
          <button 
            className={styles.contextMenuItem}
            onClick={() => {
              handleCitationClick(sourceContextMenu.source);
              setSourceContextMenu(null);
            }}
          >
            📂 Open in Main View
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
