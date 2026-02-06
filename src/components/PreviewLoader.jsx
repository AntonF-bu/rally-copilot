import { useEffect, useState } from 'react'

// ================================
// Preview Loader - Shows while route is being analyzed
// Displays progress for zones, curves, and AI enhancement
// Tramo Brand Design
// ================================

// Tramo brand colors
const ACCENT = '#E8622C'
const BG_DEEP = '#0A0A0A'
const TEXT_PRIMARY = '#FFFFFF'
const TEXT_SECONDARY = '#888888'
const TEXT_MUTED = '#666666'
const GLASS_BORDER = '#1A1A1A'

// Glass panel style
const glassPanel = {
  background: 'rgba(17, 17, 17, 0.9)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: '12px',
}

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
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: BG_DEEP }}
    >
      {/* Animated background gradient - using accent orange */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${ACCENT} 0%, #8b5cf6 50%, transparent 70%)`,
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
            color: TEXT_PRIMARY,
            fontSize: '18px',
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {routeName}
        </h2>

        {/* Main status */}
        <div
          className="mb-8"
          style={{
            color: ACCENT,
            fontSize: '14px',
            fontFamily: "'DM Sans', sans-serif",
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
                  borderColor: isActive ? `${ACCENT}50` : GLASS_BORDER,
                  opacity: isComplete ? 0.6 : isPending ? 0.3 : 1,
                  transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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
                      style={{ borderColor: `${ACCENT} transparent ${ACCENT} ${ACCENT}` }}
                    />
                  ) : (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: TEXT_MUTED }}
                    />
                  )}
                </div>

                {/* Label */}
                <span
                  className="text-sm flex-1"
                  style={{
                    color: isActive ? TEXT_PRIMARY : TEXT_SECONDARY,
                    fontFamily: "'DM Sans', sans-serif",
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
                      fontFamily: "'DM Sans', sans-serif",
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
        <div style={{ color: TEXT_MUTED, fontSize: '12px', textAlign: 'center' }}>
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
