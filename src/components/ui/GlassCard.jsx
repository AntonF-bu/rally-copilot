// GlassCard component - Tramo Brand Design
// Solid background instead of glass effect

export default function GlassCard({ children, className = '', hoverable = true, onClick, style = {} }) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: '#111111',
        border: '1px solid #1A1A1A',
        borderRadius: '12px',
        transition: 'all 0.3s ease',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={hoverable ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(232,98,44,0.3)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      } : undefined}
      onMouseLeave={hoverable ? (e) => {
        e.currentTarget.style.borderColor = '#1A1A1A'
        e.currentTarget.style.transform = 'none'
      } : undefined}
    >
      {children}
    </div>
  )
}
