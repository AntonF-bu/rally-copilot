// Auth Screen - Tramo Brand Identity
// Clean dark sign-in/sign-up screen with minimal accents

import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, signUp } from '../../services/authService'

export function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGoogleSignIn = async () => {
    setError(null)
    setIsLoading(true)

    try {
      await signInWithGoogle()
      // OAuth redirects, so we don't need to do anything here
    } catch (err) {
      setError(err.message || 'Failed to sign in with Google')
      setIsLoading(false)
    }
  }

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please enter email and password')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        const result = await signUp(email, password)
        // Check if email confirmation is required
        if (result.user && !result.session) {
          setError('Check your email for a confirmation link')
          setIsLoading(false)
          return
        }
      }
      // Auth state change will handle the rest
    } catch (err) {
      setError(err.message || `Failed to ${mode === 'signin' ? 'sign in' : 'create account'}`)
      setIsLoading(false)
    }
  }

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
  }

  // Tramo Brand Styles
  const containerStyle = {
    position: 'fixed',
    inset: 0,
    background: '#0A0A0A',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    paddingTop: 'env(safe-area-inset-top, 24px)',
    paddingBottom: 'env(safe-area-inset-bottom, 24px)',
  }

  const logoContainerStyle = {
    marginBottom: '40px',
    textAlign: 'center',
    position: 'relative',
  }

  // Subtle radial glow behind logo
  const logoGlowStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '200px',
    height: '200px',
    background: 'radial-gradient(circle, rgba(232,98,44,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  }

  const logoStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #E8622C 0%, #F0854E 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    position: 'relative',
    zIndex: 1,
  }

  const titleStyle = {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '28px',
    fontWeight: 600,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: '8px',
    position: 'relative',
    zIndex: 1,
  }

  const taglineStyle = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    letterSpacing: '0.2em',
    color: '#666666',
    textTransform: 'uppercase',
    margin: 0,
    position: 'relative',
    zIndex: 1,
  }

  const formStyle = {
    width: '100%',
    maxWidth: '320px',
  }

  const googleButtonStyle = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#0A0A0A',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '15px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    opacity: isLoading ? 0.7 : 1,
  }

  const dividerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    margin: '24px 0',
    color: '#666666',
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
  }

  const dividerLineStyle = {
    flex: 1,
    height: '1px',
    background: '#1A1A1A',
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: '#111111',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    marginBottom: '12px',
    boxSizing: 'border-box',
  }

  const submitButtonStyle = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '8px',
    border: '1px solid #2A2A2A',
    background: 'transparent',
    color: '#888888',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '8px',
    opacity: isLoading ? 0.7 : 1,
  }

  const errorStyle = {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#EF4444',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    marginBottom: '16px',
    textAlign: 'center',
  }

  const toggleStyle = {
    marginTop: '24px',
    textAlign: 'center',
  }

  const toggleTextStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#666666',
    margin: 0,
  }

  const toggleLinkStyle = {
    background: 'none',
    border: 'none',
    color: '#E8622C',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginLeft: '4px',
  }

  return (
    <div style={containerStyle}>
      {/* Logo and branding */}
      <div style={logoContainerStyle}>
        <div style={logoGlowStyle} />
        <div style={logoStyle}>
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            {/* T letterform */}
            <path
              d="M12 10H36V16H28V38H20V16H12V10Z"
              fill="#0A0A0A"
            />
            {/* Racing line */}
            <path
              d="M8 26C12 22 18 20 24 22C30 24 36 28 42 24"
              stroke="#0A0A0A"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
        <h1 style={titleStyle}>Tramo</h1>
        <p style={taglineStyle}>Know the road before you see it</p>
      </div>

      {/* Auth form */}
      <form style={formStyle} onSubmit={handleEmailAuth}>
        {/* Error message */}
        {error && <div style={errorStyle}>{error}</div>}

        {/* Google sign-in */}
        <button
          type="button"
          style={googleButtonStyle}
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={dividerStyle}>
          <div style={dividerLineStyle} />
          <span>or</span>
          <div style={dividerLineStyle} />
        </div>

        {/* Email input */}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          disabled={isLoading}
          autoComplete="email"
        />

        {/* Password input */}
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          disabled={isLoading}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />

        {/* Submit button */}
        <button type="submit" style={submitButtonStyle} disabled={isLoading}>
          {isLoading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
        </button>

        {/* Toggle between sign-in and sign-up */}
        <div style={toggleStyle}>
          <p style={toggleTextStyle}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            <button type="button" style={toggleLinkStyle} onClick={toggleMode}>
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}

export default AuthScreen
