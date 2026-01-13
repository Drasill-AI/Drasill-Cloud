import { useState } from 'react';
import { useAppStore } from '../store';
import logoImage from '../assets/logo.png';
import styles from './FirstRunWizard.module.css';

interface FirstRunWizardProps {
  onComplete: () => void;
}

type WizardStep = 'welcome' | 'workspace' | 'apiKey' | 'equipment' | 'complete';

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSettingKey, setIsSettingKey] = useState(false);
  const [skipApiKey, setSkipApiKey] = useState(false);
  const { workspacePath, openWorkspace, setApiKey, hasApiKey } = useAppStore();

  const steps: WizardStep[] = ['welcome', 'workspace', 'apiKey', 'equipment', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const handleSelectWorkspace = async () => {
    await openWorkspace();
  };

  const handleSetApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsSettingKey(true);
    try {
      await setApiKey(apiKeyInput.trim());
      handleNext();
    } catch (error) {
      console.error('Failed to set API key:', error);
    } finally {
      setIsSettingKey(false);
    }
  };

  const handleSkipApiKey = () => {
    setSkipApiKey(true);
    handleNext();
  };

  const handleFinish = async () => {
    // Load existing state to preserve tabs, then mark first run as complete
    try {
      const existingState = await window.electronAPI.loadState();
      await window.electronAPI.saveState({
        workspacePath: workspacePath || existingState?.workspacePath || null,
        openTabs: existingState?.openTabs || [],
        activeTabId: existingState?.activeTabId || null,
        sidebarWidth: existingState?.sidebarWidth,
        rightPanelWidth: existingState?.rightPanelWidth,
        firstRunComplete: true,
      });
    } catch (error) {
      console.error('Failed to save first run state:', error);
    }
    onComplete();
  };

  const renderStepIndicator = () => (
    <div className={styles.stepIndicator}>
      {steps.slice(0, -1).map((step, index) => (
        <div
          key={step}
          className={`${styles.stepDot} ${index <= currentStepIndex ? styles.active : ''} ${index < currentStepIndex ? styles.completed : ''}`}
        />
      ))}
    </div>
  );

  const renderWelcome = () => (
    <div className={styles.stepContent}>
      <img src={logoImage} alt="Drasill" className={styles.logo} />
      <h1 className={styles.title}>Welcome to Drasill Cloud</h1>
      <p className={styles.subtitle}>AI-Powered Equipment Fleet Management</p>
      <div className={styles.features}>
        <div className={styles.feature}>
          <span className={styles.featureNumber}>01</span>
          <div>
            <h3>Document Management</h3>
            <p>Organize manuals, schematics, and technical documents</p>
          </div>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureNumber}>02</span>
          <div>
            <h3>Equipment Tracking</h3>
            <p>Track your fleet with maintenance logs and work orders</p>
          </div>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureNumber}>03</span>
          <div>
            <h3>AI Assistant</h3>
            <p>Get instant answers from your technical documentation</p>
          </div>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureNumber}>04</span>
          <div>
            <h3>CV Detection</h3>
            <p>Automatically identify equipment from schematics</p>
          </div>
        </div>
      </div>
      <button className={styles.primaryButton} onClick={handleNext}>
        Get Started
        <span className={styles.arrow}>→</span>
      </button>
    </div>
  );

  const renderWorkspace = () => (
    <div className={styles.stepContent}>
      <span className={styles.stepNumber}>1</span>
      <h2 className={styles.stepTitle}>Select Your Workspace</h2>
      <p className={styles.stepDescription}>
        Choose a folder containing your equipment manuals, schematics, and technical documents.
        Drasill Cloud will index these files for AI-powered search and analysis.
      </p>
      
      {workspacePath ? (
        <div className={styles.selectedPath}>
          <span className={styles.checkIcon}>✓</span>
          <span className={styles.pathText}>{workspacePath}</span>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No workspace selected</p>
        </div>
      )}

      <button className={styles.secondaryButton} onClick={handleSelectWorkspace}>
        {workspacePath ? 'Change Folder' : 'Select Folder'}
      </button>

      <div className={styles.buttonRow}>
        <button className={styles.backButton} onClick={handleBack}>
          ← Back
        </button>
        <button 
          className={styles.primaryButton} 
          onClick={handleNext}
          disabled={!workspacePath}
        >
          Continue →
        </button>
      </div>
    </div>
  );

  const renderApiKey = () => (
    <div className={styles.stepContent}>
      <span className={styles.stepNumber}>2</span>
      <h2 className={styles.stepTitle}>Connect AI Assistant</h2>
      <p className={styles.stepDescription}>
        Enter your OpenAI API key to enable the AI-powered features.
        Your key is stored securely in your system's keychain.
      </p>

      {hasApiKey && !skipApiKey ? (
        <div className={styles.selectedPath}>
          <span className={styles.checkIcon}>✓</span>
          <span className={styles.pathText}>API key configured</span>
        </div>
      ) : (
        <>
          <input
            type="password"
            className={styles.input}
            placeholder="sk-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <button 
            className={styles.secondaryButton} 
            onClick={handleSetApiKey}
            disabled={!apiKeyInput.trim() || isSettingKey}
          >
            {isSettingKey ? 'Saving...' : 'Save API Key'}
          </button>
        </>
      )}

      <p className={styles.helpText}>
        Don't have an API key?{' '}
        <a 
          href="https://platform.openai.com/api-keys" 
          target="_blank" 
          rel="noopener noreferrer"
          className={styles.link}
        >
          Get one from OpenAI
        </a>
      </p>

      <div className={styles.buttonRow}>
        <button className={styles.backButton} onClick={handleBack}>
          ← Back
        </button>
        <button 
          className={styles.skipButton} 
          onClick={handleSkipApiKey}
        >
          Skip for now
        </button>
        <button 
          className={styles.primaryButton} 
          onClick={handleNext}
          disabled={!hasApiKey && !skipApiKey}
        >
          Continue →
        </button>
      </div>
    </div>
  );

  const renderEquipment = () => (
    <div className={styles.stepContent}>
      <span className={styles.stepNumber}>3</span>
      <h2 className={styles.stepTitle}>Equipment Setup</h2>
      <p className={styles.stepDescription}>
        You can add equipment manually or import from a CSV file.
        Equipment can also be added later from the Equipment panel.
      </p>

      <div className={styles.optionCards}>
        <div className={styles.optionCard}>
          <h3>Add Manually</h3>
          <p>Add equipment one at a time with full details</p>
        </div>
        <div className={styles.optionCard}>
          <h3>Import CSV</h3>
          <p>Bulk import from spreadsheet</p>
        </div>
      </div>

      <p className={styles.optionNote}>Both options available in the Equipment panel</p>

      <div className={styles.buttonRow}>
        <button className={styles.backButton} onClick={handleBack}>
          ← Back
        </button>
        <button className={styles.primaryButton} onClick={handleNext}>
          Continue →
        </button>
      </div>
    </div>
  );

  const renderComplete = () => (
    <div className={styles.stepContent}>
      <span className={styles.completeCheck}>✓</span>
      <h2 className={styles.stepTitle}>You're All Set</h2>
      <p className={styles.stepDescription}>
        Drasill Cloud is ready to help you manage your equipment fleet.
      </p>

      <div className={styles.quickTips}>
        <h3>Quick Tips</h3>
        <ul>
          <li><kbd>Ctrl+P</kbd> — Open command palette</li>
          <li><kbd>Ctrl+W</kbd> — Close current tab</li>
          <li>Click a PDF to view and chat about it</li>
          <li>Right-click files for more options</li>
        </ul>
      </div>

      <button className={styles.primaryButton} onClick={handleFinish}>
        Start Using Drasill Cloud
        <span className={styles.arrow}>→</span>
      </button>
    </div>
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        {currentStep !== 'welcome' && currentStep !== 'complete' && renderStepIndicator()}
        
        {currentStep === 'welcome' && renderWelcome()}
        {currentStep === 'workspace' && renderWorkspace()}
        {currentStep === 'apiKey' && renderApiKey()}
        {currentStep === 'equipment' && renderEquipment()}
        {currentStep === 'complete' && renderComplete()}
      </div>
    </div>
  );
}
