import { useState, useEffect } from 'react'

// ================================
// Copilot Loader - "Waking up your co-pilot"
// Shows while pre-caching voice callouts
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
    <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col items-center justify-center">
      {/* Background glow */}
      <div 
        className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
        style={{ 
          background: 'radial-gradient(circle, #00d4ff 0%, transparent 70%)',
          animation: 'pulse 2s ease-in-out infinite'
        }}
      />
      
      {/* Animated co-pilot icon */}
      <div className="relative mb-8">
        {/* Outer ring */}
        <div 
          className="w-32 h-32 rounded-full border-4 border-cyan-500/30"
          style={{
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
            stroke="#00d4ff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${progress * 3.77} 377`}
            className="transition-all duration-300"
          />
        </svg>
        
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div 
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500 ${
              isComplete ? 'bg-cyan-500 scale-110' : 'bg-cyan-500/20'
            }`}
          >
            {isComplete ? (
              // Checkmark
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              // Microphone/speaker icon
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2">
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
        <h2 className="text-xl font-semibold text-white mb-2">
          {isComplete ? "Co-pilot ready!" : LOADING_MESSAGES[messageIndex]}
          {!isComplete && <span className="text-cyan-400">{dots}</span>}
        </h2>
        
        {!isComplete && (
          <p className="text-white/50 text-sm">
            {progress < 100 ? `${Math.round(progress)}% complete` : 'Finalizing...'}
          </p>
        )}
      </div>
      
      {/* Progress bar */}
      {!isComplete && (
        <div className="w-64 h-1 bg-white/10 rounded-full mt-6 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
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
      className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-500 ${
        active ? 'opacity-100' : 'opacity-30'
      }`}
      style={{ 
        background: active ? `${color}20` : 'transparent',
        color: active ? color : '#666',
        border: `1px solid ${active ? color : '#333'}`
      }}
    >
      {active && (
        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: color }} />
      )}
      {label}
    </div>
  )
}
