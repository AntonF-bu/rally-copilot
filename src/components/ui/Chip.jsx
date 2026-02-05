import { chipActive, chipInactive, fonts, transitions } from '../../styles/theme'

export default function Chip({ label, active, onClick }) {
  const baseStyle = {
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
    fontSize: '11px',
    fontWeight: 400,
    letterSpacing: '0.08em',
    padding: '5px 13px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: transitions.smooth,
    userSelect: 'none',
  }

  return (
    <span
      onClick={onClick}
      style={{
        ...baseStyle,
        ...(active ? chipActive : chipInactive),
      }}
    >
      {label}
    </span>
  )
}
