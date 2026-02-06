// AuthCallback Component - Tramo Brand Identity
// Handles OAuth and email confirmation redirects

import { useEffect, useState } from 'react'
import { supabase } from '../services/supabase'
import TramoLogo from './TramoLogo'

/**
 * AuthCallback handles the redirect after:
 * - Email confirmation (magic link or signup verification)
 * - OAuth provider callbacks (Google, etc.)
 *
 * Mount this component at a route like /auth/callback
 * and configure Supabase redirect URLs to point here.
 */
export function AuthCallback({ onComplete }) {
  const [status, setStatus] = useState('processing')
  const [error, setError] = useState(null)

  useEffect(() => {
    const handleCallback = async () => {
      console.log('🔐 AuthCallback: Processing auth callback...')

      try {
        // Get the hash fragment from the URL (contains tokens for OAuth/magic link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const errorCode = hashParams.get('error')
        const errorDescription = hashParams.get('error_description')

        // Check for errors in the callback
        if (errorCode) {
          console.error('🔐 AuthCallback: Error in callback:', errorCode, errorDescription)
          setError(errorDescription || 'Authentication failed')
          setStatus('error')
          return
        }

        // Check URL params for code exchange (PKCE flow)
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')

        if (code) {
          console.log('🔐 AuthCallback: Exchanging code for session...')
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            console.error('🔐 AuthCallback: Code exchange error:', exchangeError.message)
            setError(exchangeError.message)
            setStatus('error')
            return
          }

          console.log('🔐 AuthCallback: Code exchange successful')
        } else if (accessToken) {
          // Hash-based token (implicit flow or magic link)
          console.log('🔐 AuthCallback: Setting session from tokens...')
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            console.error('🔐 AuthCallback: Session error:', sessionError.message)
            setError(sessionError.message)
            setStatus('error')
            return
          }

          console.log('🔐 AuthCallback: Session set successfully')
        }

        // Verify we have a valid session now
        const { data: { session }, error: getSessionError } = await supabase.auth.getSession()

        if (getSessionError || !session) {
          console.error('🔐 AuthCallback: No session after callback')
          setError('Could not establish session')
          setStatus('error')
          return
        }

        console.log('🔐 AuthCallback: Auth complete, user:', session.user.email)
        setStatus('success')

        // Clear the URL hash/params
        window.history.replaceState({}, document.title, window.location.pathname)

        // Notify parent or redirect
        if (onComplete) {
          onComplete(session)
        } else {
          // Default: redirect to home after a short delay
          setTimeout(() => {
            window.location.href = '/'
          }, 1500)
        }
      } catch (err) {
        console.error('🔐 AuthCallback: Unexpected error:', err)
        setError(err.message || 'An unexpected error occurred')
        setStatus('error')
      }
    }

    handleCallback()
  }, [onComplete])

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <TramoLogo size={48} bgColor="#0A0A0A" />

        {status === 'processing' && (
          <>
            <div style={styles.spinner} />
            <h2 style={styles.title}>Signing you in...</h2>
            <p style={styles.subtitle}>Please wait a moment</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={styles.successIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 style={styles.title}>Welcome back!</h2>
            <p style={styles.subtitle}>Redirecting to the app...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={styles.errorIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.errorText}>{error}</p>
            <button onClick={() => window.location.href = '/'} style={styles.button}>
              Back to App
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0A0A0A',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '32px',
    gap: '20px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '3px solid #1A1A1A',
    borderTopColor: '#E8622C',
    animation: 'spin 1s linear infinite',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(34, 197, 94, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '24px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
  },
  subtitle: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#666666',
    margin: 0,
  },
  errorText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    color: '#ef4444',
    margin: 0,
    maxWidth: '280px',
    wordBreak: 'break-word',
  },
  button: {
    marginTop: '8px',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}

// Add keyframes for spinner
if (typeof document !== 'undefined') {
  const styleId = 'auth-callback-styles'
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style')
    styleSheet.id = styleId
    styleSheet.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(styleSheet)
  }
}

export default AuthCallback
