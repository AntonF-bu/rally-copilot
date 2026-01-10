import useStore from '../store'

// ================================
// Voice Indicator
// ================================

export default function VoiceIndicator() {
  const { isSpeaking, lastSpokenText, mode } = useStore()

  if (!isSpeaking) return null

  const modeColors = {
    cruise: '#00d4ff',
    fast: '#ffd500',
    race: '#ff3366'
  }

  const color = modeColors[mode] || modeColors.cruise

  return (
    <div className="voice-indicator">
      <div className="voice-waves">
        {[0, 1, 2, 3].map(i => (
          <div 
            key={i} 
            className="voice-wave"
            style={{ 
              background: color,
              animationDelay: `${i * 0.1}s`
            }}
          />
        ))}
      </div>
      <span className="text-sm text-white font-medium">
        {lastSpokenText}
      </span>
    </div>
  )
}
