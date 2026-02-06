// DifficultyBadge component - Tramo Brand Design

// Difficulty color configurations
const DIFFICULTY_COLORS = {
  easy:        { bg: 'rgba(76,175,80,0.15)',  text: '#6FCF73', border: 'rgba(76,175,80,0.2)' },
  moderate:    { bg: 'rgba(255,193,7,0.15)',  text: '#FFC107', border: 'rgba(255,193,7,0.2)' },
  hard:        { bg: 'rgba(255,107,53,0.2)',  text: '#FF8B5E', border: 'rgba(255,107,53,0.25)' },
  challenging: { bg: 'rgba(255,107,53,0.2)',  text: '#FF8B5E', border: 'rgba(255,107,53,0.25)' },
  expert:      { bg: 'rgba(244,67,54,0.15)',  text: '#FF6B6B', border: 'rgba(244,67,54,0.2)' },
}

export default function DifficultyBadge({ level = 'moderate', size = 'sm' }) {
  const config = DIFFICULTY_COLORS[level] || DIFFICULTY_COLORS.moderate

  const sizes = {
    sm: { fontSize: '8px', padding: '3px 7px' },
    md: { fontSize: '9px', padding: '3px 10px' },
  }

  return (
    <span style={{
      fontFamily: "'DM Sans', sans-serif",
      textTransform: 'uppercase',
      fontWeight: 600,
      letterSpacing: '0.1em',
      borderRadius: '4px',
      display: 'inline-block',
      background: config.bg,
      color: config.text,
      border: `1px solid ${config.border}`,
      ...sizes[size],
    }}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  )
}
