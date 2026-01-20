// ElevationWidget - Mini elevation profile chart

export default function ElevationWidget({ data, color, className = '' }) {
  if (!data?.length) return null

  const max = Math.max(...data.map(d => d.elevation))
  const min = Math.min(...data.map(d => d.elevation))
  const range = max - min || 1

  // Generate path points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 80
    const y = 20 - ((d.elevation - min) / range) * 16
    return { x, y }
  })

  // Create fill path (closed polygon)
  const fillPath = `M 0 20 ${points.map(p => `L ${p.x} ${p.y}`).join(' ')} L 80 20 Z`

  // Create line path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox="0 0 80 20" className={`w-full h-6 ${className}`}>
      <defs>
        <linearGradient id="elevation-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#elevation-gradient)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}
