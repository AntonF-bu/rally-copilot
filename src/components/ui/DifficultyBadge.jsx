import { colors, fonts } from '../../styles/theme'

export default function DifficultyBadge({ level = 'moderate', size = 'sm' }) {
  const config = colors.difficulty[level] || colors.difficulty.moderate

  const sizes = {
    sm: { fontSize: '8px', padding: '3px 7px' },
    md: { fontSize: '9px', padding: '3px 10px' },
  }

  return (
    <span style={{
      fontFamily: fonts.heading,
      textTransform: 'uppercase',
      fontWeight: 600,
      letterSpacing: '0.1em',
      borderRadius: '4px',
      display: 'inline-block',
      background: config.bg,
      color: config.text,
      border: `1px solid ${config.border}`,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      ...sizes[size],
    }}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  )
}
