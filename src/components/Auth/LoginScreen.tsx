import React, { useState } from 'react';
import { signInWithGoogle } from '../../services/authServiceTauri';
import SimpleTitleBar from '../UI/SimpleTitleBar';
import './LoginScreen.css';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  onBack?: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onBack }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(true); // Default to sign-up mode

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      // This will open system browser, wait for callback, and complete sign-in
      await signInWithGoogle();
      setLoading(false);
      onLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);

      if (err.message?.includes('UNAUTHORIZED')) {
        setError('You are not authorized to access this app. Please contact your administrator.');
      } else if (err.message?.includes('timeout')) {
        setError('Sign-in timed out. Please try again.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <SimpleTitleBar />
      <div className="login-container">
        {onBack && (
          <button className="back-button" onClick={onBack} aria-label="Go back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
        )}

        <div className="login-header">
          <img src="/logo.svg" alt="Conceptualize" className="login-logo" />
          <h1>Conceptualize</h1>
          <p className="login-subtitle">Collaborative Knowledge Management</p>
        </div>

        <div className="login-content">
          <h2>{isSignUp ? 'Get Started' : 'Welcome Back'}</h2>
          <p className="login-description">
            {isSignUp
              ? 'Create your account with Google to start collaborating with your team.'
              : 'Sign in with your Google account to access Conceptualize.'
            }
          </p>

          {error && (
            <div className="login-error">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"
                  fill="currentColor"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            className="google-signin-button"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? (
              <div className="button-loading">
                <div className="spinner"></div>
                <span>Signing in...</span>
              </div>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.593.102-1.17.282-1.709V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.335z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  />
                </svg>
                <span>{isSignUp ? 'Sign up with Google' : 'Sign in with Google'}</span>
              </>
            )}
          </button>

          <div className="auth-toggle">
            {isSignUp ? (
              <p>
                Already have an account?{' '}
                <button onClick={() => setIsSignUp(false)} className="toggle-link">
                  Sign in here
                </button>
              </p>
            ) : (
              <p>
                Don't have an account?{' '}
                <button onClick={() => setIsSignUp(true)} className="toggle-link">
                  Sign up here
                </button>
              </p>
            )}
          </div>

          <p className="login-footer">
            Sign up with any Google account to get started.
            <br />
            Your account will be created automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
