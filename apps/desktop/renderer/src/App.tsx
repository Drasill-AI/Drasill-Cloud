import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { Toast } from './components/Toast';
import { AuthScreen } from './components/AuthScreen';
import { SubscriptionGate } from './components/SubscriptionGate';
import { OnboardingModal } from './components/OnboardingModal';
import { useAppStore } from './store';
import { setupPdfExtractionListener } from './utils/pdfExtractor';

interface User {
  id: string;
  email: string;
}

interface Subscription {
  status: string;
  hasActiveSubscription: boolean;
  plan?: string;
  current_period_end?: string;
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('Initializing auth...');
        // Initialize Supabase and restore session if exists
        await window.electronAPI.authInit();
        
        // Check if user is logged in
        const currentUser = await window.electronAPI.authGetCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          
          // Check subscription status
          const subStatus = await window.electronAPI.authCheckSubscription();
          setSubscription(subStatus);
        }
        
        setReady(true);
      } catch (err) {
        console.error('Error in auth init:', err);
        // Don't block the app on auth errors - just proceed without auth
        setReady(true);
      } finally {
        setAuthLoading(false);
      }
    };
    
    initAuth();
  }, []);

  const handleAuthSuccess = async (authenticatedUser: User) => {
    setUser(authenticatedUser);
    // Check subscription after login
    const subStatus = await window.electronAPI.authCheckSubscription();
    setSubscription(subStatus);
  };

  const handleSignOut = async () => {
    await window.electronAPI.authSignOut();
    setUser(null);
    setSubscription(null);
  };

  const handleUpgrade = async () => {
    await window.electronAPI.authOpenCheckout();
  };

  // Show loading state until ready
  if (error) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        background: '#1E1E1E', 
        color: 'red',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',
        fontFamily: 'monospace'
      }}>
        Error: {error}
      </div>
    );
  }

  if (!ready || authLoading) {
    return (
      <div style={{ 
        width: '100vw', 
        height: '100vh', 
        background: '#1E1E1E', 
        color: '#4C8DFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        fontFamily: 'monospace'
      }}>
        Loading Drasill Cloud...
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // User is authenticated - go straight to app
  return <AppContent user={user} subscription={subscription} onSignOut={handleSignOut} />;
}

interface AppContentProps {
  user: User;
  subscription: Subscription | null;
  onSignOut: () => void;
}

function AppContent({ user, subscription, onSignOut }: AppContentProps) {
  const { 
    openWorkspace, 
    closeActiveTab, 
    toggleCommandPalette,
    isCommandPaletteOpen,
    deals,
    hasCompletedOnboarding,
    isOnboardingOpen,
    setOnboardingOpen,
    completeOnboarding
  } = useAppStore();

  // Setup PDF extraction listener for RAG indexing
  useEffect(() => {
    const unsubscribePdfExtractor = setupPdfExtractionListener();
    return () => {
      unsubscribePdfExtractor();
    };
  }, []);

  // Show onboarding for new users (no deals and hasn't completed onboarding)
  useEffect(() => {
    if (deals.length === 0 && !hasCompletedOnboarding && !isOnboardingOpen) {
      // Small delay to let the app settle before showing onboarding
      const timer = setTimeout(() => {
        setOnboardingOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [deals.length, hasCompletedOnboarding, isOnboardingOpen, setOnboardingOpen]);

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

    const unsubscribeSignOut = window.electronAPI.onMenuSignOut(() => {
      onSignOut();
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
      unsubscribeSignOut();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openWorkspace, closeActiveTab, toggleCommandPalette, isCommandPaletteOpen, onSignOut]);

  console.log('App rendering...');

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#1E1E1E' }}>
      <Layout />
      <CommandPalette />
      <Toast />
      {isOnboardingOpen && (
        <OnboardingModal 
          onClose={() => setOnboardingOpen(false)}
          onComplete={completeOnboarding}
        />
      )}
    </div>
  );
}

export default App;
