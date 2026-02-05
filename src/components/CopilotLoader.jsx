import { useState, useEffect } from 'react'
import { colors, fonts, transitions } from '../styles/theme'

// ================================
// Copilot Loader - "Waking up your co-pilot"
// Shows while pre-caching voice callouts
// Refactored to use theme system
// ================================

const LOADING_MESSAGES = [
  "Waking up your co-pilot...",
  "Analyzing route curves...",
  "Preparing voice callouts...",
  "Calibrating timing...",
  "Almost ready..."
]

export default function CopilotLoader({ progress = 0, isComplete = false, onComplete }) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [dots, setDots] = useState('')

  // Cycle through messages based on progress
  useEffect(() => {
    const idx = Math.min(
      Math.floor((progress / 100) * LOADING_MESSAGES.length),
      LOADING_MESSAGES.length - 1
    )
    setMessageIndex(idx)
  }, [progress])

  // Animate dots
  useEffect(() => {
    if (isComplete) return
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [isComplete])

  // Auto-complete after animation
  useEffect(() => {
    if (isComplete && onComplete) {
      const timer = setTimeout(onComplete, 800)
      return () => clearTimeout(timer)
    }
  }, [isComplete, onComplete])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: colors.bgDeep }}
    >
      {/* Background glow - using accent orange */}
      <div
        className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{
          background: `radial-gradient(circle, ${colors.accent} 0%, transparent 70%)`,
          animation: 'pulse 2s ease-in-out infinite'
        }}
      />

      {/* Animated co-pilot icon */}
      <div className="relative mb-8">
        {/* Outer ring */}
        <div
          className="w-32 h-32 rounded-full"
          style={{
            border: `4px solid ${colors.accentGlow}`,
            animation: isComplete ? 'none' : 'spin 3s linear infinite'
          }}
        />

        {/* Progress ring */}
        <svg className="absolute inset-0 w-32 h-32 -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="60"
            fill="none"
            stroke={colors.accent}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${progress * 3.77} 377`}
            style={{ transition: transitions.smooth }}
          />
        </svg>

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: isComplete ? colors.accent : colors.accentGlow,
              transform: isComplete ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.5s ease',
            }}
          >
            {isComplete ? (
              // Checkmark
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={colors.bgDeep} strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              // Microphone/speaker icon
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="text-center">
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: colors.textPrimary,
            marginBottom: '8px',
            fontFamily: fonts.body,
          }}
        >
          {isComplete ? "Co-pilot ready!" : LOADING_MESSAGES[messageIndex]}
          {!isComplete && <span style={{ color: colors.accent }}>{dots}</span>}
        </h2>

        {!isComplete && (
          <p style={{ color: colors.textSecondary, fontSize: '14px' }}>
            {progress < 100 ? `${Math.round(progress)}% complete` : 'Finalizing...'}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {!isComplete && (
        <div
          className="w-64 h-1 rounded-full mt-6 overflow-hidden"
          style={{ background: colors.glassBorder }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(to right, ${colors.accent}, ${colors.accentSoft})`,
              transition: transitions.smooth,
            }}
          />
        </div>
      )}

      {/* Voice style indicators */}
      {!isComplete && progress > 20 && (
        <div className="flex gap-4 mt-8">
          <VoiceStyleBadge
            label="Relaxed"
            active={progress > 30}
            color="#3b82f6"
          />
          <VoiceStyleBadge
            label="Alert"
            active={progress > 50}
            color="#fbbf24"
          />
          <VoiceStyleBadge
            label="Urgent"
            active={progress > 70}
            color="#ef4444"
          />
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.1); opacity: 0.3; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function VoiceStyleBadge({ label, active, color }) {
  return (
    <div
      className="px-3 py-1 rounded-full text-xs font-medium"
      style={{
        background: active ? `${color}20` : 'transparent',
        color: active ? color : colors.textMuted,
        border: `1px solid ${active ? color : colors.glassBorder}`,
        opacity: active ? 1 : 0.3,
        fontFamily: fonts.heading,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        transition: 'all 0.5s ease',
      }}
    >
      {active && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
          style={{ background: color }}
        />
      )}
      {label}
    </div>
  )
}
