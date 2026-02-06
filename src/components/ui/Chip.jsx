// Chip component - Tramo Brand Design

export default function Chip({ label, active, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        textTransform: 'uppercase',
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.08em',
        padding: '5px 13px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        userSelect: 'none',
        background: active ? '#E8622C' : '#1A1A1A',
        color: active ? '#FFFFFF' : '#9CA3AF',
        border: active ? '1px solid #E8622C' : '1px solid #333333',
      }}
    >
      {label}
    </span>
  )
}
