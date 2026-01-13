import { useEffect, useState } from 'react'

// ================================
// Preview Loader - Shows while route is being analyzed
// Displays progress for zones, curves, and AI enhancement
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
    <div className="fixed inset-0 bg-[#0a0a0f] z-50 flex flex-col items-center justify-center">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute w-[600px] h-[600px] rounded-full blur-[120px] opacity-20"
          style={{
            background: 'radial-gradient(circle, #00d4ff 0%, #8b5cf6 50%, transparent 70%)',
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
        <h2 className="text-white/90 text-lg font-medium mb-1 text-center truncate max-w-full">
          {routeName}
        </h2>
        
        {/* Main status */}
        <div className="text-cyan-400 text-sm mb-8">
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
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? 'bg-white/10 border border-cyan-500/30' 
                    : isComplete 
                      ? 'bg-white/5 opacity-60' 
                      : 'opacity-30'
                }`}
              >
                {/* Status indicator */}
                <div className="w-6 h-6 flex items-center justify-center">
                  {isComplete ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                  ) : isActive ? (
                    <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                  )}
                </div>
                
                {/* Label */}
                <span className={`text-sm flex-1 ${isActive ? 'text-white' : 'text-white/70'}`}>
                  {stage.label}
                </span>
                
                {/* AI badge for AI stages */}
                {(stage.key === 'aiZones' || stage.key === 'aiCurves') && isComplete && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">
                    AI
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Tip */}
        <div className="text-white/30 text-xs text-center">
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
