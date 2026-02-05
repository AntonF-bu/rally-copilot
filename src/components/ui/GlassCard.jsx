import { glass, glassHover, transitions } from '../../styles/theme'

export default function GlassCard({ children, className = '', hoverable = true, onClick, style = {} }) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        ...glass,
        transition: transitions.smooth,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
      onMouseEnter={hoverable ? (e) => {
        Object.assign(e.currentTarget.style, glassHover)
      } : undefined}
      onMouseLeave={hoverable ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      } : undefined}
    >
      {children}
    </div>
  )
}
