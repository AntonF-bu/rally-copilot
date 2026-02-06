// SectionLabel component - Tramo Brand Design

export default function SectionLabel({ children, style = {} }) {
  return (
    <p style={{
      fontFamily: "'JetBrains Mono', monospace",
      textTransform: 'uppercase',
      fontSize: '9px',
      fontWeight: 600,
      letterSpacing: '2px',
      color: '#6B7280',
      marginBottom: '8px',
      ...style,
    }}>
      {children}
    </p>
  )
}
