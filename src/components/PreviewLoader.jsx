import { useEffect, useState } from 'react'
import { colors, fonts, glassPanel, transitions } from '../styles/theme'

// ================================
// Preview Loader - Shows while route is being analyzed
// Displays progress for zones, curves, and AI enhancement
// Refactored to use theme system
// ================================

export default function PreviewLoader({
  isLoading,
  stages = {},
  routeName = 'Route'
}) {
  const [dots, setDots] = useState('')

  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [isLoading])

  if (!isLoading) return null

  // Stage definitions (no emojis for clean look)
  const stageConfig = [
    { key: 'route', label: 'Loading route' },
    { key: 'curves', label: 'Detecting curves' },
    { key: 'zones', label: 'Analyzing zones' },
    { key: 'aiZones', label: 'AI zone validation' },
    { key: 'highway', label: 'Finding sweepers' },
    { key: 'aiCurves', label: 'AI curve enhancement' },
  ]

  // Find current active stage
  const activeStageIndex = stageConfig.findIndex(s => stages[s.key] === 'loading')

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: colors.bgDeep }}
    >
      {/* Animated background gradient - using accent orange */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accent} 0%, #8b5cf6 50%, transparent 70%)`,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'pulse 3s ease-in-out infinite'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-md w-full">

        {/* Route name */}
        <h2
          className="mb-1 text-center truncate max-w-full"
          style={{
            color: colors.textPrimary,
            fontSize: '18px',
            fontWeight: 500,
            fontFamily: fonts.body,
          }}
        >
          {routeName}
        </h2>

        {/* Main status */}
        <div
          className="mb-8"
          style={{
            color: colors.accent,
            fontSize: '14px',
            fontFamily: fonts.heading,
            letterSpacing: '0.05em',
          }}
        >
          Preparing your co-pilot{dots}
        </div>

        {/* Progress stages */}
        <div className="w-full space-y-2 mb-8">
          {stageConfig.map((stage, index) => {
            const status = stages[stage.key]
            const isActive = status === 'loading'
            const isComplete = status === 'complete'
            const isPending = !status || status === 'pending'

            // Skip stages that haven't started and aren't next
            if (isPending && index > activeStageIndex + 1) return null

            return (
              <div
                key={stage.key}
                className="flex items-center gap-3 px-4 py-2 rounded-lg"
                style={{
                  ...glassPanel,
                  borderColor: isActive ? `${colors.accent}50` : colors.glassBorder,
                  opacity: isComplete ? 0.6 : isPending ? 0.3 : 1,
                  transition: transitions.smooth,
                }}
              >
                {/* Status indicator */}
                <div className="w-6 h-6 flex items-center justify-center">
                  {isComplete ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  ) : isActive ? (
                    <div
                      className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
                    />
                  ) : (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: colors.textMuted }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className="text-sm flex-1"
                  style={{
                    color: isActive ? colors.textPrimary : colors.textSecondary,
                    fontFamily: fonts.body,
                  }}
                >
                  {stage.label}
                </span>

                {/* AI badge for AI stages */}
                {(stage.key === 'aiZones' || stage.key === 'aiCurves') && isComplete && (
                  <span
                    className="px-1.5 py-0.5 rounded font-medium"
                    style={{
                      fontSize: '9px',
                      background: 'rgba(139, 92, 246, 0.2)',
                      color: '#a78bfa',
                      fontFamily: fonts.heading,
                      letterSpacing: '0.05em',
                    }}
                  >
                    AI
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Tip */}
        <div style={{ color: colors.textMuted, fontSize: '12px', textAlign: 'center' }}>
          AI analysis makes your callouts smarter and more accurate
        </div>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.2; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
