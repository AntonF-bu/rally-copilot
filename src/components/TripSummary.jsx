import { useMemo } from 'react'
import useStore from '../store'

// ================================
// Trip Summary - Minimalist HUD Style
// With Strava-like route outline
// ================================

export default function TripSummary() {
  const { getTripSummary, closeTripSummary, goToMenu, mode, routeData, tripStats } = useStore()
  
  const summary = getTripSummary()
  
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Generate SVG path from route coordinates
  const routePath = useMemo(() => {
    const coords = routeData?.coordinates
    if (!coords || coords.length < 2) return null
    
    // Find bounds
    let minLng = Infinity, maxLng = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    
    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    })
    
    const padding = 0.1
    const width = maxLng - minLng || 0.01
    const height = maxLat - minLat || 0.01
    
    // Scale to viewBox (200x120 with padding)
    const viewWidth = 200
    const viewHeight = 120
    const scale = Math.min(
      (viewWidth * (1 - padding * 2)) / width,
      (viewHeight * (1 - padding * 2)) / height
    )
    
    const offsetX = (viewWidth - width * scale) / 2
    const offsetY = (viewHeight - height * scale) / 2
    
    // Build path - sample every Nth point for smoothness
    const sampleRate = Math.max(1, Math.floor(coords.length / 100))
    const points = coords
      .filter((_, i) => i % sampleRate === 0 || i === coords.length - 1)
      .map(([lng, lat]) => [
        offsetX + (lng - minLng) * scale,
        viewHeight - (offsetY + (lat - minLat) * scale) // Flip Y
      ])
    
    if (points.length < 2) return null
    
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    
    return {
      d: pathD,
      start: points[0],
      end: points[points.length - 1]
    }
  }, [routeData])

  if (!summary) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-white/30 text-sm">No trip data</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      
      {/* Route Visualization */}
      <div className="flex-shrink-0 px-6 pt-12 pb-4 safe-top">
        <div className="relative">
          {/* Route SVG */}
          <svg 
            viewBox="0 0 200 120" 
            className="w-full h-32"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Glow effect */}
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {routePath ? (
              <>
                {/* Route line glow */}
                <path
                  d={routePath.d}
                  fill="none"
                  stroke={modeColor}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.3"
                  filter="url(#glow)"
                />
                {/* Route line */}
                <path
                  d={routePath.d}
                  fill="none"
                  stroke={modeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Start point */}
                <circle
                  cx={routePath.start[0]}
                  cy={routePath.start[1]}
                  r="4"
                  fill="#0a0a0f"
                  stroke="#22c55e"
                  strokeWidth="2"
                />
                {/* End point */}
                <circle
                  cx={routePath.end[0]}
                  cy={routePath.end[1]}
                  r="4"
                  fill="#0a0a0f"
                  stroke={modeColor}
                  strokeWidth="2"
                />
              </>
            ) : (
              <text x="100" y="60" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="12">
                Route
              </text>
            )}
          </svg>
          
          {/* Finish label */}
          <div className="absolute top-2 right-0 flex items-center gap-2">
            <span className="text-[10px] tracking-widest text-white/30">COMPLETE</span>
            <div className="w-2 h-2 rounded-full" style={{ background: modeColor }} />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex-1 px-4 overflow-auto">
        
        {/* Primary Stats - Large */}
        <div className="hud-glass rounded-2xl p-5 mb-3">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-white/30 text-[10px] tracking-widest mb-1">DISTANCE</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{summary.distance.toFixed(1)}</span>
                <span className="text-white/40 text-sm">{summary.distanceUnit}</span>
              </div>
            </div>
            <div>
              <div className="text-white/30 text-[10px] tracking-widest mb-1">TIME</div>
              <div className="text-3xl font-bold text-white">{summary.durationFormatted}</div>
            </div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="hud-glass rounded-xl p-3 text-center">
            <div className="text-white/30 text-[9px] tracking-widest mb-1">AVG</div>
            <div className="text-xl font-bold" style={{ color: modeColor }}>{summary.avgSpeed}</div>
            <div className="text-white/30 text-[9px]">{summary.speedUnit}</div>
          </div>
          <div className="hud-glass rounded-xl p-3 text-center">
            <div className="text-white/30 text-[9px] tracking-widest mb-1">MAX</div>
            <div className="text-xl font-bold text-white">{summary.maxSpeed}</div>
            <div className="text-white/30 text-[9px]">{summary.speedUnit}</div>
          </div>
          <div className="hud-glass rounded-xl p-3 text-center">
            <div className="text-white/30 text-[9px] tracking-widest mb-1">CURVES</div>
            <div className="text-xl font-bold" style={{ color: modeColor }}>{summary.curvesCompleted}</div>
            <div className="text-white/30 text-[9px]">of {summary.totalCurves}</div>
          </div>
        </div>

        {/* Sharpest Curve Badge */}
        {summary.sharpestCurve && summary.sharpestCurve >= 3 && (
          <div className="hud-glass rounded-xl p-3 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ 
                  background: `${getSeverityColor(summary.sharpestCurve)}20`,
                  border: `1px solid ${getSeverityColor(summary.sharpestCurve)}40`
                }}
              >
                <span 
                  className="text-lg font-bold"
                  style={{ color: getSeverityColor(summary.sharpestCurve) }}
                >
                  {summary.sharpestCurve}
                </span>
              </div>
              <div>
                <div className="text-white/30 text-[9px] tracking-widest">SHARPEST CURVE</div>
                <div className="text-white/60 text-sm">{getSeverityLabel(summary.sharpestCurve)}</div>
              </div>
            </div>
            <svg 
              width="20" height="20" viewBox="0 0 24 24" 
              fill={getSeverityColor(summary.sharpestCurve)}
            >
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
          </div>
        )}

        {/* Curve Progress */}
        {summary.totalCurves > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-white/30 mb-1">
              <span>CURVE PROGRESS</span>
              <span>{Math.round((summary.curvesCompleted / summary.totalCurves) * 100)}%</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: `${(summary.curvesCompleted / summary.totalCurves) * 100}%`,
                  background: `linear-gradient(90deg, ${modeColor}80, ${modeColor})`
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="p-4 pb-6 safe-bottom">
        <button
          onClick={closeTripSummary}
          className="w-full py-4 rounded-xl font-semibold text-sm tracking-wider transition-all active:scale-[0.98]"
          style={{ 
            background: `linear-gradient(135deg, ${modeColor}, ${modeColor}cc)`,
            boxShadow: `0 4px 20px ${modeColor}40`
          }}
        >
          DRIVE AGAIN
        </button>
        
        <button
          onClick={goToMenu}
          className="w-full mt-2 py-3 rounded-xl text-sm tracking-wider text-white/40 active:text-white/60 transition-colors"
        >
          Back to Menu
        </button>
      </div>

      <style>{`
        .hud-glass {
          background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
        .safe-bottom { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
      `}</style>
    </div>
  )
}

// Severity color
function getSeverityColor(severity) {
  if (severity <= 2) return '#22c55e'
  if (severity <= 3) return '#84cc16'
  if (severity <= 4) return '#ffd500'
  if (severity <= 5) return '#f97316'
  return '#ff3366'
}

// Severity label
function getSeverityLabel(severity) {
  const labels = {
    1: 'Gentle bend',
    2: 'Easy curve', 
    3: 'Moderate turn',
    4: 'Tight corner',
    5: 'Sharp turn',
    6: 'Hairpin'
  }
  return labels[severity] || 'Curve'
}
