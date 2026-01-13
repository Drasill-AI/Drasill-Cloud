import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmProvider } from './components/ConfirmDialog';
import { FirstRunWizard } from './components/FirstRunWizard';
import { useAppStore } from './store';
import { initPdfExtractor } from './services/pdfExtractor';

function App() {
  const [showWizard, setShowWizard] = useState(false);
  const [isCheckingFirstRun, setIsCheckingFirstRun] = useState(true);
  const { 
    openWorkspace, 
    closeActiveTab, 
    toggleCommandPalette,
    isCommandPaletteOpen 
  } = useAppStore();

  useEffect(() => {
    // Initialize PDF extractor for RAG indexing
    initPdfExtractor();
  }, []);

  useEffect(() => {
    // Check if first run
    const checkFirstRun = async () => {
      try {
        const state = await window.electronAPI.loadState();
        if (!state?.firstRunComplete) {
          setShowWizard(true);
        }
      } catch (error) {
        console.error('Error checking first run state:', error);
        // Show wizard if we can't determine state
        setShowWizard(true);
      } finally {
        setIsCheckingFirstRun(false);
      }
    };
    checkFirstRun();
  }, []);

  useEffect(() => {
    // Listen for menu events from main process
    const unsubscribeOpenWorkspace = window.electronAPI.onMenuOpenWorkspace(() => {
      openWorkspace();
    });

    const unsubscribeCloseTab = window.electronAPI.onMenuCloseTab(() => {
      closeActiveTab();
    });

    const unsubscribeCommandPalette = window.electronAPI.onMenuCommandPalette(() => {
      toggleCommandPalette();
    });

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      
      if (isMod && e.key === 'p') {
        e.preventDefault();
        toggleCommandPalette();
      }
      
      if (isMod && e.key === 'w') {
        e.preventDefault();
        closeActiveTab();
      }

      if (e.key === 'Escape' && isCommandPaletteOpen) {
        toggleCommandPalette();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribeOpenWorkspace();
      unsubscribeCloseTab();
      unsubscribeCommandPalette();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openWorkspace, closeActiveTab, toggleCommandPalette, isCommandPaletteOpen]);

  const handleWizardComplete = () => {
    setShowWizard(false);
  };

  // Show nothing while checking first run state
  if (isCheckingFirstRun) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ConfirmProvider>
        {showWizard && <FirstRunWizard onComplete={handleWizardComplete} />}
        {!showWizard && (
          <>
            <Layout />
            <CommandPalette />
            <Toast />
          </>
        )}
      </ConfirmProvider>
    </ErrorBoundary>
  );
}

export default App;
