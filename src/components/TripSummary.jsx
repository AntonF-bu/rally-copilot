import { useMemo } from 'react'
import useStore from '../store'

// ================================
// Trip Summary - Premium Design
// Strava-inspired with route map
// ================================

export default function TripSummary() {
  const { getTripSummary, closeTripSummary, goToMenu, mode, routeData } = useStore()
  
  const summary = getTripSummary()
  
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  const modeNames = { cruise: 'Cruise', fast: 'Fast', race: 'Race' }

  // Generate SVG path from route coordinates
  const routePath = useMemo(() => {
    const coords = routeData?.coordinates
    if (!coords || coords.length < 2) return null
    
    let minLng = Infinity, maxLng = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    
    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    })
    
    const padding = 0.15
    const width = maxLng - minLng || 0.01
    const height = maxLat - minLat || 0.01
    
    const viewWidth = 280
    const viewHeight = 160
    const scale = Math.min(
      (viewWidth * (1 - padding * 2)) / width,
      (viewHeight * (1 - padding * 2)) / height
    )
    
    const offsetX = (viewWidth - width * scale) / 2
    const offsetY = (viewHeight - height * scale) / 2
    
    const sampleRate = Math.max(1, Math.floor(coords.length / 120))
    const points = coords
      .filter((_, i) => i % sampleRate === 0 || i === coords.length - 1)
      .map(([lng, lat]) => [
        offsetX + (lng - minLng) * scale,
        viewHeight - (offsetY + (lat - minLat) * scale)
      ])
    
    if (points.length < 2) return null
    
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    
    return { d: pathD, start: points[0], end: points[points.length - 1] }
  }, [routeData])

  // Curve breakdown by severity
  const curveBreakdown = useMemo(() => {
    const curves = routeData?.curves || []
    return {
      easy: curves.filter(c => c.severity <= 2 && !c.isChicane).length,
      medium: curves.filter(c => (c.severity === 3 || c.severity === 4) && !c.isChicane).length,
      hard: curves.filter(c => c.severity >= 5 && !c.isChicane).length,
      chicanes: curves.filter(c => c.isChicane).length,
    }
  }, [routeData])

  if (!summary) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-white/30 text-sm">No trip data</p>
      </div>
    )
  }

  const completionPercent = summary.totalCurves > 0 
    ? Math.round((summary.curvesCompleted / summary.totalCurves) * 100) 
    : 100

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-hidden">
      
      {/* Header with route visualization */}
      <div className="relative flex-shrink-0">
        {/* Background gradient */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{ 
            background: `radial-gradient(ellipse at top, ${modeColor}40 0%, transparent 70%)`
          }}
        />
        
        <div className="relative px-4 pt-10 pb-6 safe-top">
          {/* Status badge */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div 
              className="px-3 py-1 rounded-full text-[10px] tracking-widest font-semibold"
              style={{ background: `${modeColor}20`, color: modeColor }}
            >
              {modeNames[mode]} MODE
            </div>
          </div>
          
          {/* Route SVG */}
          <div className="flex justify-center">
            <svg 
              viewBox="0 0 280 160" 
              className="w-full max-w-[320px] h-40"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22c55e" />
                  <stop offset="100%" stopColor={modeColor} />
                </linearGradient>
              </defs>
              
              {routePath ? (
                <>
                  <path
                    d={routePath.d}
                    fill="none"
                    stroke={modeColor}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.2"
                    filter="url(#routeGlow)"
                  />
                  <path
                    d={routePath.d}
                    fill="none"
                    stroke="url(#routeGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={routePath.start[0]} cy={routePath.start[1]} r="6" fill="#0a0a0f" stroke="#22c55e" strokeWidth="3" />
                  <circle cx={routePath.end[0]} cy={routePath.end[1]} r="6" fill="#0a0a0f" stroke={modeColor} strokeWidth="3" />
                </>
              ) : (
                <text x="140" y="80" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="14">Route Complete</text>
              )}
            </svg>
          </div>
          
          {/* Completion badge */}
          <div className="absolute top-10 right-4 safe-top flex items-center gap-2">
            <span className="text-[10px] tracking-widest text-white/40">COMPLETE</span>
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: modeColor, boxShadow: `0 0 8px ${modeColor}` }} />
          </div>
        </div>
      </div>

      {/* Stats Content */}
      <div className="flex-1 px-4 pb-4 overflow-auto">
        
        {/* Primary Stats */}
        <div className="hud-glass rounded-2xl p-4 mb-3">
          <div className="grid grid-cols-2 divide-x divide-white/10">
            <div className="pr-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">DISTANCE</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-white">{summary.distance.toFixed(1)}</span>
                <span className="text-white/50 text-sm">{summary.distanceUnit}</span>
              </div>
            </div>
            <div className="pl-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">DURATION</div>
              <div className="text-4xl font-bold text-white">{summary.durationFormatted}</div>
            </div>
          </div>
        </div>

        {/* Speed Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="hud-glass rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/40 text-[10px] tracking-widest">AVG SPEED</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2" opacity="0.6">
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold" style={{ color: modeColor }}>{summary.avgSpeed}</span>
              <span className="text-white/40 text-xs">{summary.speedUnit}</span>
            </div>
          </div>
          <div className="hud-glass rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/40 text-[10px] tracking-widest">TOP SPEED</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.6">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white">{summary.maxSpeed}</span>
              <span className="text-white/40 text-xs">{summary.speedUnit}</span>
            </div>
          </div>
        </div>

        {/* Curves Section */}
        <div className="hud-glass rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/40 text-[10px] tracking-widest">CURVES TACKLED</span>
            <span className="text-white/60 text-sm">
              {summary.curvesCompleted}<span className="text-white/30">/{summary.totalCurves}</span>
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${completionPercent}%`,
                background: `linear-gradient(90deg, #22c55e, ${modeColor})`
              }}
            />
          </div>
          
          {/* Curve breakdown */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-green-400">{curveBreakdown.easy}</div>
              <div className="text-[9px] text-white/30">EASY</div>
            </div>
            <div>
              <div className="text-lg font-bold text-yellow-400">{curveBreakdown.medium}</div>
              <div className="text-[9px] text-white/30">MEDIUM</div>
            </div>
            <div>
              <div className="text-lg font-bold text-red-400">{curveBreakdown.hard}</div>
              <div className="text-[9px] text-white/30">HARD</div>
            </div>
            <div>
              <div className="text-lg font-bold text-purple-400">{curveBreakdown.chicanes}</div>
              <div className="text-[9px] text-white/30">S-CURVES</div>
            </div>
          </div>
        </div>

        {/* Sharpest Curve Achievement */}
        {summary.sharpestCurve && summary.sharpestCurve >= 3 && (
          <div 
            className="rounded-xl p-4 mb-3 flex items-center gap-4"
            style={{ 
              background: `linear-gradient(135deg, ${getSeverityColor(summary.sharpestCurve)}15, transparent)`,
              border: `1px solid ${getSeverityColor(summary.sharpestCurve)}30`
            }}
          >
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ 
                background: `${getSeverityColor(summary.sharpestCurve)}20`,
              }}
            >
              <span 
                className="text-2xl font-bold"
                style={{ color: getSeverityColor(summary.sharpestCurve) }}
              >
                {summary.sharpestCurve}
              </span>
            </div>
            <div className="flex-1">
              <div className="text-white/40 text-[10px] tracking-widest">SHARPEST CURVE</div>
              <div className="text-white font-medium">{getSeverityLabel(summary.sharpestCurve)}</div>
              <div className="text-white/40 text-xs mt-0.5">
                {summary.sharpestCurve >= 5 ? 'Expert handling!' : summary.sharpestCurve >= 4 ? 'Nice control' : 'Smooth driving'}
              </div>
            </div>
            <svg 
              width="24" height="24" viewBox="0 0 24 24" 
              fill={getSeverityColor(summary.sharpestCurve)}
              opacity="0.6"
            >
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex-shrink-0 p-4 pb-6 safe-bottom">
        <button
          onClick={closeTripSummary}
          className="w-full py-4 rounded-2xl font-semibold text-sm tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{ 
            background: `linear-gradient(135deg, ${modeColor}, ${modeColor}dd)`,
            boxShadow: `0 4px 24px ${modeColor}50`
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>
            <path d="M12 8v4l3 3"/>
          </svg>
          DRIVE AGAIN
        </button>
        
        <button
          onClick={goToMenu}
          className="w-full mt-3 py-3 text-sm text-white/40 active:text-white/60 transition-colors"
        >
          Back to Menu
        </button>
      </div>

      <style>{`
        .hud-glass {
          background: linear-gradient(135deg, rgba(18,18,24,0.95) 0%, rgba(12,12,16,0.98) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.05);
        }
        .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
        .safe-bottom { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-pulse { animation: pulse 2s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

function getSeverityColor(severity) {
  if (severity <= 2) return '#22c55e'
  if (severity <= 3) return '#84cc16'
  if (severity <= 4) return '#ffd500'
  if (severity <= 5) return '#f97316'
  return '#ff3366'
}

function getSeverityLabel(severity) {
  const labels = {
    1: 'Gentle Bend',
    2: 'Easy Curve', 
    3: 'Moderate Turn',
    4: 'Tight Corner',
    5: 'Sharp Turn',
    6: 'Hairpin'
  }
  return labels[severity] || 'Curve'
}
