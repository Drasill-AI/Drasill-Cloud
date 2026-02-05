import { useState } from 'react';
import styles from './AuthScreen.module.css';
import logo from '../assets/logo.png';

interface AuthScreenProps {
  onAuthSuccess: (user: any) => void;
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await window.electronAPI.authSignIn(email, password);
      if (result.success) {
        onAuthSuccess(result.user);
      } else {
        setError(result.error || 'Sign in failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await window.electronAPI.authResetPassword(email);
      if (result.success) {
        setResetSent(true);
      } else {
        setError(result.error || 'Failed to send reset email');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = () => {
    window.open('https://drasillai.com', '_blank');
  };

  const handleBackToSignIn = () => {
    setShowForgotPassword(false);
    setResetSent(false);
    setError(null);
  };

  // Forgot Password View
  if (showForgotPassword) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <img src={logo} alt="Drasill Finance" className={styles.logoImage} />
            <p>AI-Powered Deal Intelligence</p>
          </div>

          {resetSent ? (
            <div className={styles.form}>
              <h2>Check Your Email</h2>
              <div className={styles.successMessage}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p>We've sent a password reset link to <strong>{email}</strong></p>
                <p className={styles.subtext}>Check your inbox and follow the instructions to reset your password.</p>
              </div>
              <button 
                type="button" 
                className={styles.button}
                onClick={handleBackToSignIn}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className={styles.form}>
              <h2>Reset Password</h2>
              <p className={styles.formSubtext}>Enter your email and we'll send you a link to reset your password.</p>

              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>

              <button 
                type="button" 
                className={styles.backLink}
                onClick={handleBackToSignIn}
              >
                ← Back to Sign In
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Sign In View
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src={logo} alt="Drasill Finance" className={styles.logoImage} />
          <p>AI-Powered Deal Intelligence</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <h2>Welcome Back</h2>

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button 
            type="button" 
            className={styles.forgotPassword}
            onClick={() => setShowForgotPassword(true)}
          >
            Forgot password?
          </button>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className={styles.toggle}>
          <p>
            Don't have an account?{' '}
            <button onClick={handleCreateAccount}>Sign up at drasillai.com</button>
          </p>
        </div>
      </div>
    </div>
  );
}
