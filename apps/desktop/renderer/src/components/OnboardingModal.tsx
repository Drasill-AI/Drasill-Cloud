import { useState } from 'react';
import { useAppStore } from '../store';
import styles from './OnboardingModal.module.css';
import logo from '../assets/logo.png';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

type OnboardingStep = 'welcome' | 'onedrive' | 'deal' | 'done';

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [isConnectingOneDrive, setIsConnectingOneDrive] = useState(false);
  
  const { 
    oneDriveStatus, 
    setDealModalOpen,
    deals,
  } = useAppStore();

  const handleConnectOneDrive = async () => {
    setIsConnectingOneDrive(true);
    try {
      await window.electronAPI.startOneDriveAuth();
      // Wait a bit for status to update
      setTimeout(() => {
        setIsConnectingOneDrive(false);
      }, 2000);
    } catch (error) {
      console.error('OneDrive connection error:', error);
      setIsConnectingOneDrive(false);
    }
  };

  const handleCreateDeal = () => {
    setDealModalOpen(true);
  };

  const handleSkip = () => {
    if (currentStep === 'welcome') {
      setCurrentStep('onedrive');
    } else if (currentStep === 'onedrive') {
      setCurrentStep('deal');
    } else if (currentStep === 'deal') {
      setCurrentStep('done');
    }
  };

  const handleNext = () => {
    if (currentStep === 'welcome') {
      setCurrentStep('onedrive');
    } else if (currentStep === 'onedrive') {
      setCurrentStep('deal');
    } else if (currentStep === 'deal') {
      setCurrentStep('done');
    } else {
      onComplete();
    }
  };

  if (!isOpen) return null;

  const getStepNumber = () => {
    const steps: OnboardingStep[] = ['welcome', 'onedrive', 'deal', 'done'];
    return steps.indexOf(currentStep) + 1;
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Progress indicator */}
        <div className={styles.progress}>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${(getStepNumber() / 4) * 100}%` }}
            />
          </div>
          <span className={styles.progressText}>Step {getStepNumber()} of 4</span>
        </div>

        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <div className={styles.step}>
            <div className={styles.stepIcon}>
              <img src={logo} alt="Drasill Finance" className={styles.logoImage} />
            </div>
            <h2>Welcome to Drasill Finance</h2>
            <p className={styles.stepDescription}>
              Your AI-powered deal intelligence platform. Let's get you set up in just a few steps.
            </p>
            <div className={styles.features}>
              <div className={styles.feature}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span>AI Document Analysis</span>
              </div>
              <div className={styles.feature}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Smart Deal Insights</span>
              </div>
              <div className={styles.feature}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>Pipeline Analytics</span>
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={handleNext}>
                Get Started
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* OneDrive Step */}
        {currentStep === 'onedrive' && (
          <div className={styles.step}>
            <div className={styles.stepIconSmall}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
            </div>
            <h2>Connect Your Documents</h2>
            <p className={styles.stepDescription}>
              Connect OneDrive to analyze your credit agreements and deal documents with AI.
            </p>
            
            {oneDriveStatus?.isAuthenticated ? (
              <div className={styles.connectedState}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>OneDrive Connected</span>
                <p className={styles.connectedEmail}>{oneDriveStatus.userEmail}</p>
              </div>
            ) : (
              <button 
                className={styles.connectButton}
                onClick={handleConnectOneDrive}
                disabled={isConnectingOneDrive}
              >
                {isConnectingOneDrive ? (
                  <>
                    <span className={styles.spinner} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                    </svg>
                    Connect OneDrive
                  </>
                )}
              </button>
            )}

            <div className={styles.actions}>
              <button className={styles.skipButton} onClick={handleSkip}>
                Skip for now
              </button>
              <button 
                className={styles.primaryButton} 
                onClick={handleNext}
                disabled={!oneDriveStatus?.isAuthenticated && !true}
              >
                {oneDriveStatus?.isAuthenticated ? 'Continue' : 'Next'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Deal Step */}
        {currentStep === 'deal' && (
          <div className={styles.step}>
            <div className={styles.stepIconSmall}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            </div>
            <h2>Create Your First Deal</h2>
            <p className={styles.stepDescription}>
              Track deals through your pipeline from lead to close. Add borrower details, loan amounts, and more.
            </p>

            {deals.length > 0 ? (
              <div className={styles.connectedState}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>{deals.length} Deal{deals.length > 1 ? 's' : ''} Created</span>
              </div>
            ) : (
              <button 
                className={styles.connectButton}
                onClick={handleCreateDeal}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create a Deal
              </button>
            )}

            <div className={styles.actions}>
              <button className={styles.skipButton} onClick={handleSkip}>
                Skip for now
              </button>
              <button className={styles.primaryButton} onClick={handleNext}>
                {deals.length > 0 ? 'Continue' : 'Next'}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Done Step */}
        {currentStep === 'done' && (
          <div className={styles.step}>
            <div className={styles.stepIconSuccess}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>You're All Set!</h2>
            <p className={styles.stepDescription}>
              Start chatting with AI to analyze documents, get deal insights, or track activities.
            </p>

            <div className={styles.tips}>
              <h3>Quick Tips:</h3>
              <ul>
                <li>Type in the chat to ask questions about your documents</li>
                <li>Use the bottom panel to track activities and view pipeline</li>
                <li>Click on citation links to jump to source documents</li>
                <li>Press <kbd>Cmd/Ctrl + K</kbd> to open the command palette</li>
              </ul>
            </div>

            <div className={styles.actions}>
              <button className={styles.primaryButton} onClick={onComplete}>
                Start Using Drasill
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
