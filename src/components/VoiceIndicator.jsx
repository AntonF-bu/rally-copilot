import useStore from '../store'

// ================================
// Voice Indicator - Shows when speaking
// Tramo Brand Design
// ================================

export default function VoiceIndicator() {
  const { isSpeaking, lastSpokenText, mode } = useStore()

  if (!isSpeaking) return null

  // Mode colors - Tramo orange for cruise
  const modeColors = {
    cruise: '#E8622C',
    fast: '#ffd500',
    race: '#ff3366'
  }
  const color = modeColors[mode] || modeColors.cruise

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ bottom: '180px' }}
    >
      <div
        className="px-5 py-3 rounded-full flex items-center gap-3"
        style={{
          background: '#111111',
          border: '1px solid #1A1A1A',
          boxShadow: `0 4px 20px ${color}30`
        }}
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
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          fontWeight: 500,
          color: '#FFFFFF'
        }}>
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
