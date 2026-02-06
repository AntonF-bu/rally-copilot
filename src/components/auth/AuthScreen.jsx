// Auth Screen - Night Stage Design
// Premium dark aesthetic sign-in/sign-up screen

import { useState } from 'react'
import { signInWithGoogle, signInWithEmail, signUp } from '../../services/authService'
import { colors, fonts, transitions } from '../../styles/theme'

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

  // Styles
  const containerStyle = {
    position: 'fixed',
    inset: 0,
    background: '#0A0A0F',
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
  }

  const logoStyle = {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: `linear-gradient(135deg, ${colors.accent} 0%, #FF8F5C 100%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    boxShadow: `0 8px 32px ${colors.accent}40`,
  }

  const titleStyle = {
    fontFamily: fonts.primary,
    fontSize: '28px',
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
    marginBottom: '8px',
  }

  const taglineStyle = {
    fontFamily: fonts.primary,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    margin: 0,
  }

  const formStyle = {
    width: '100%',
    maxWidth: '320px',
  }

  const googleButtonStyle = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '12px',
    border: 'none',
    background: colors.accent,
    color: '#0A0A0F',
    fontFamily: fonts.primary,
    fontSize: '15px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: transitions.smooth,
    opacity: isLoading ? 0.7 : 1,
  }

  const dividerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    margin: '24px 0',
    color: 'rgba(255,255,255,0.3)',
    fontSize: '12px',
    fontFamily: fonts.mono,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  }

  const dividerLineStyle = {
    flex: 1,
    height: '1px',
    background: 'rgba(255,255,255,0.1)',
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: '14px',
    outline: 'none',
    transition: transitions.smooth,
    marginBottom: '12px',
    boxSizing: 'border-box',
  }

  const submitButtonStyle = {
    width: '100%',
    padding: '14px 20px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: colors.textPrimary,
    fontFamily: fonts.primary,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: transitions.smooth,
    marginTop: '8px',
    opacity: isLoading ? 0.7 : 1,
  }

  const errorStyle = {
    padding: '12px 16px',
    borderRadius: '10px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    color: '#EF4444',
    fontFamily: fonts.mono,
    fontSize: '12px',
    marginBottom: '16px',
    textAlign: 'center',
  }

  const toggleStyle = {
    marginTop: '24px',
    textAlign: 'center',
  }

  const toggleTextStyle = {
    fontFamily: fonts.primary,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.5)',
    margin: 0,
  }

  const toggleLinkStyle = {
    background: 'none',
    border: 'none',
    color: colors.accent,
    fontFamily: fonts.primary,
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
        <div style={logoStyle}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#0A0A0F">
            <path d="M12 2L4 7l8 5 8-5-8-5z" />
            <path d="M4 12l8 5 8-5" />
            <path d="M4 17l8 5 8-5" />
          </svg>
        </div>
        <h1 style={titleStyle}>Rally Co-Pilot</h1>
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
