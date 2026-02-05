import React from 'react';
import styles from './SubscriptionGate.module.css';
import logo from '../assets/logo.png';

interface SubscriptionGateProps {
  onUpgrade: () => void;
  onSignOut: () => void;
  userEmail?: string;
}

export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({ 
  onUpgrade, 
  onSignOut,
  userEmail 
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src={logo} alt="Drasill Finance" className={styles.logo} />
        <h2 className={styles.title}>Upgrade to Pro</h2>
        <p className={styles.subtitle}>
          Unlock AI-powered deal analysis and document intelligence
        </p>
        
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>Unlimited AI chat & document analysis</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>RAG-powered knowledge base search</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>Deal pipeline management</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>OneDrive & SharePoint integration</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>Financial Q&A with sources & citations</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.check}>✓</span>
            <span>Priority support</span>
          </div>
        </div>

        <div className={styles.pricing}>
          <div className={styles.price}>
            <span className={styles.amount}>$99</span>
            <span className={styles.period}>/user/month</span>
          </div>
          <p className={styles.trial}>14-day free trial • Cancel anytime</p>
        </div>

        <button className={styles.upgradeButton} onClick={() => window.open('https://drasillai.com/pricing', '_blank')}>
          Start Free Trial
        </button>

        <div className={styles.footer}>
          <p className={styles.email}>Signed in as {userEmail}</p>
          <button className={styles.signOutButton} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
