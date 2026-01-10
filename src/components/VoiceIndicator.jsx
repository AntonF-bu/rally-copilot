import useStore from '../store'

// ================================
// Voice Indicator - Shows when speaking
// ================================

export default function VoiceIndicator() {
  const { isSpeaking, lastSpokenText, mode } = useStore()

  if (!isSpeaking) return null

  const colors = {
    cruise: '#00d4ff',
    fast: '#ffd500',
    race: '#ff3366'
  }
  const color = colors[mode] || colors.cruise

  return (
    <div 
      className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ bottom: '180px' }}
    >
      <div 
        className="bg-black/90 backdrop-blur-xl px-5 py-3 rounded-full flex items-center gap-3 border border-white/10"
        style={{ boxShadow: `0 4px 20px ${color}30` }}
      >
        {/* Audio waves */}
        <div className="flex gap-1 items-center h-5">
          {[0, 1, 2, 3, 4].map(i => (
            <div 
              key={i}
              className="w-1 rounded-full"
              style={{ 
                background: color,
                height: '100%',
                animation: `wave 0.5s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
        
        {/* Text */}
        <span className="text-sm font-medium text-white">
          {lastSpokenText}
        </span>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  )
}
