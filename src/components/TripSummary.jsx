import { useMemo, useState, useEffect } from 'react'
import useStore from '../store'

// ================================
// Trip Summary - v2.0
// Enhanced with real stats, animations, and achievements
// ================================

export default function TripSummary() {
  const { getTripSummary, closeTripSummary, goToMenu, mode, routeData, tripStats } = useStore()
  
  const summary = getTripSummary()
  
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise
  const modeNames = { cruise: 'Cruise', fast: 'Fast', race: 'Race' }

  // Animation state
  const [showContent, setShowContent] = useState(false)
  const [animatedStats, setAnimatedStats] = useState({
    distance: 0,
    avgSpeed: 0,
    topSpeed: 0,
    curves: 0
  })

  // Animate stats on mount
  useEffect(() => {
    setShowContent(true)
    
    const targetStats = {
      distance: summary?.distance || 0,
      avgSpeed: summary?.avgSpeed || 0,
      topSpeed: summary?.maxSpeed || 0,
      curves: summary?.curvesCompleted || 0
    }
    
    const duration = 1500
    const steps = 60
    const stepTime = duration / steps
    let step = 0
    
    const interval = setInterval(() => {
      step++
      const progress = Math.min(step / steps, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // Ease out cubic
      
      setAnimatedStats({
        distance: (targetStats.distance * eased).toFixed(1),
        avgSpeed: Math.round(targetStats.avgSpeed * eased),
        topSpeed: Math.round(targetStats.topSpeed * eased),
        curves: Math.round(targetStats.curves * eased)
      })
      
      if (step >= steps) clearInterval(interval)
    }, stepTime)
    
    return () => clearInterval(interval)
  }, [summary])

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
    const viewHeight = 140
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

  // Calculate achievements
  const achievements = useMemo(() => {
    const earned = []
    
    if (summary?.curvesCompleted >= summary?.totalCurves && summary?.totalCurves > 0) {
      earned.push({ icon: '✓', label: 'Route Complete', color: '#22c55e' })
    }
    
    if (summary?.maxSpeed >= 70) {
      earned.push({ icon: '⚡', label: 'Speed Demon', color: '#f59e0b' })
    }
    
    if (curveBreakdown.hard > 0 && summary?.curvesCompleted > 0) {
      earned.push({ icon: '◆', label: 'Hard Curves', color: '#ef4444' })
    }
    
    const duration = summary?.duration || 0
    if (duration >= 30) {
      earned.push({ icon: '○', label: `${Math.round(duration)} min drive`, color: '#8b5cf6' })
    }
    
    return earned
  }, [summary, curveBreakdown])

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return '0m 0s'
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${mins}m ${secs.toString().padStart(2, '0')}s`
  }

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
          className="absolute inset-0 opacity-30"
          style={{ 
            background: `radial-gradient(ellipse at top, ${modeColor}40 0%, transparent 70%)`
          }}
        />
        
        <div className="relative px-4 pt-12 pb-4">
          {/* Status badge */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <div 
              className="px-4 py-1.5 rounded-full text-xs tracking-widest font-semibold"
              style={{ background: `${modeColor}20`, color: modeColor, border: `1px solid ${modeColor}40` }}
            >
              {modeNames[mode]} MODE
            </div>
          </div>
          
          {/* Route SVG */}
          <div className={`flex justify-center transition-all duration-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <svg 
              viewBox="0 0 280 140" 
              className="w-full max-w-[320px] h-36"
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
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.15"
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
                  <circle cx={routePath.start[0]} cy={routePath.start[1]} r="6" fill="#0a0a0f" stroke="#22c55e" strokeWidth="2.5" />
                  <circle cx={routePath.end[0]} cy={routePath.end[1]} r="6" fill="#0a0a0f" stroke={modeColor} strokeWidth="2.5" />
                </>
              ) : (
                <text x="140" y="70" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="14">Route Complete</text>
              )}
            </svg>
          </div>
          
          {/* Completion badge */}
          <div className="absolute top-12 right-4 flex items-center gap-2">
            <span className="text-[10px] tracking-widest text-white/40">COMPLETE</span>
            <div className="w-2 h-2 rounded-full" style={{ background: modeColor, boxShadow: `0 0 8px ${modeColor}` }} />
          </div>
        </div>
      </div>

      {/* Stats Content */}
      <div className={`flex-1 px-4 pb-4 overflow-auto transition-all duration-500 delay-200 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* Primary Stats - Large Cards */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Distance */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="text-white/40 text-[10px] tracking-widest mb-2">DISTANCE</div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-light text-white">{animatedStats.distance}</span>
              <span className="text-white/40 text-sm">mi</span>
            </div>
          </div>
          
          {/* Duration */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
            <div className="text-white/40 text-[10px] tracking-widest mb-2">DURATION</div>
            <div className="text-3xl font-light text-white">
              {formatDuration(summary.duration)}
            </div>
          </div>
        </div>

        {/* Speed Stats */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Avg Speed */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-[10px] tracking-widest">AVG SPEED</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2" opacity="0.6">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold" style={{ color: modeColor }}>{animatedStats.avgSpeed}</span>
              <span className="text-white/40 text-xs">mph</span>
            </div>
          </div>
          
          {/* Top Speed */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-[10px] tracking-widest">TOP SPEED</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" opacity="0.6">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white">{animatedStats.topSpeed}</span>
              <span className="text-white/40 text-xs">mph</span>
            </div>
          </div>
        </div>

        {/* Curves Section */}
        <div className="bg-white/5 rounded-xl p-4 mb-3 border border-white/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/40 text-[10px] tracking-widest">CURVES TACKLED</span>
            <span className="text-white/60 text-sm font-medium">
              {animatedStats.curves}<span className="text-white/30">/{summary.totalCurves}</span>
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
            <div 
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ 
                width: `${completionPercent}%`,
                background: `linear-gradient(90deg, #22c55e, ${modeColor})`
              }}
            />
          </div>
          
          {/* Curve breakdown */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-green-500/10 rounded-lg py-2">
              <div className="text-xl font-bold text-green-400">{curveBreakdown.easy}</div>
              <div className="text-[9px] text-white/40 tracking-wider">EASY</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg py-2">
              <div className="text-xl font-bold text-yellow-400">{curveBreakdown.medium}</div>
              <div className="text-[9px] text-white/40 tracking-wider">MEDIUM</div>
            </div>
            <div className="bg-red-500/10 rounded-lg py-2">
              <div className="text-xl font-bold text-red-400">{curveBreakdown.hard}</div>
              <div className="text-[9px] text-white/40 tracking-wider">HARD</div>
            </div>
            <div className="bg-purple-500/10 rounded-lg py-2">
              <div className="text-xl font-bold text-purple-400">{curveBreakdown.chicanes}</div>
              <div className="text-[9px] text-white/40 tracking-wider">S-CURVES</div>
            </div>
          </div>
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <div className="bg-white/5 rounded-xl p-4 mb-3 border border-white/5">
            <div className="text-white/40 text-[10px] tracking-widest mb-3">ACHIEVEMENTS</div>
            <div className="flex flex-wrap gap-2">
              {achievements.map((achievement, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                  style={{ 
                    background: `${achievement.color}15`, 
                    border: `1px solid ${achievement.color}30`,
                    color: achievement.color
                  }}
                >
                  <span>{achievement.icon}</span>
                  <span className="text-xs font-medium">{achievement.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Route Info */}
        {routeData?.name && (
          <div className="bg-white/5 rounded-xl p-4 border border-white/5">
            <div className="text-white/40 text-[10px] tracking-widest mb-2">ROUTE</div>
            <div className="text-white font-medium truncate">{routeData.name}</div>
            <div className="text-white/40 text-xs mt-1">
              {(routeData.distance / 1609.34).toFixed(1)} miles total • {routeData.curves?.length || 0} curves mapped
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex-shrink-0 p-4 pb-6 border-t border-white/5">
        {/* Drive Again Button */}
        <button 
          onClick={() => { closeTripSummary(); goToMenu() }}
          className="w-full py-4 rounded-xl font-semibold text-sm tracking-wider flex items-center justify-center gap-2 mb-3 active:scale-[0.98] transition-all"
          style={{ background: modeColor, color: mode === 'fast' ? '#000' : '#fff' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          DRIVE AGAIN
        </button>
        
        {/* Back to Menu */}
        <button 
          onClick={() => { closeTripSummary(); goToMenu() }}
          className="w-full py-3 text-white/50 hover:text-white/70 text-sm transition-colors"
        >
          Back to Menu
        </button>
      </div>

      <style>{`
        .safe-top { padding-top: max(12px, env(safe-area-inset-top)); }
      `}</style>
    </div>
  )
}
