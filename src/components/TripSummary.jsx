import { useMemo, useState, useEffect, useRef } from 'react'
import useStore from '../store'
import { colors } from '../styles/theme'

// ================================
// Trip Summary - Premium Redesign
// Strava-inspired with deeper insights
// Refactored to use theme system
// ================================

// Zone colors for trip summary visualization
const ZONE_COLORS = {
  urban: { primary: '#f59e0b', bg: '#f59e0b20' },
  transit: { primary: '#3b82f6', bg: '#3b82f620' },
  technical: { primary: '#22c55e', bg: '#22c55e20' },
}

export default function TripSummary() {
  const { getTripSummary, closeTripSummary, goToMenu, mode, routeData, routeZones, settings } = useStore()

  const summary = getTripSummary()
  const [animatedStats, setAnimatedStats] = useState({ distance: 0, avgSpeed: 0, maxSpeed: 0 })
  const [showDetails, setShowDetails] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const shareCardRef = useRef(null)

  // Mode colors - cyan for cruise is acceptable for mode visualization
  const modeColors = { cruise: colors.cyan, fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Animate stats on mount
  useEffect(() => {
    if (!summary) return
    const duration = 1200
    const start = Date.now()
    
    const animate = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      
      setAnimatedStats({
        distance: summary.distance * eased,
        avgSpeed: summary.avgSpeed * eased,
        maxSpeed: summary.maxSpeed * eased,
      })
      
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [summary])

  // Delayed reveal for details
  useEffect(() => {
    const timer = setTimeout(() => setShowDetails(true), 600)
    return () => clearTimeout(timer)
  }, [])

  // Generate SVG path string for route
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
    
    return { d: pathD, start: points[0], end: points[points.length - 1], viewWidth, viewHeight }
  }, [routeData])

  // Curve analysis
  const curveInsights = useMemo(() => {
    const curves = routeData?.curves || []
    if (curves.length === 0) return null
    
    const angles = curves.map(c => Math.abs(c.angle || 0))
    
    return {
      total: curves.length,
      completed: summary?.curvesCompleted || 0,
      easy: curves.filter(c => (c.severity || 1) <= 2).length,
      medium: curves.filter(c => (c.severity || 1) >= 3 && (c.severity || 1) <= 4).length,
      hard: curves.filter(c => (c.severity || 1) >= 5).length,
      sharpest: angles.length > 0 ? Math.max(...angles) : 0,
      chicanes: curves.filter(c => c.isChicane).length,
    }
  }, [routeData, summary])

  // Zone breakdown
  const zoneInsights = useMemo(() => {
    if (!routeZones || routeZones.length === 0) return null
    
    const breakdown = { urban: 0, transit: 0, technical: 0 }
    let totalMiles = 0
    
    routeZones.forEach(zone => {
      const miles = (zone.endMile || 0) - (zone.startMile || 0)
      const char = zone.character || 'technical'
      if (breakdown[char] !== undefined) {
        breakdown[char] += miles
      }
      totalMiles += miles
    })
    
    return {
      ...breakdown,
      total: totalMiles,
      dominant: Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'technical',
      segments: routeZones.length,
    }
  }, [routeZones])

  // Performance insights
  const performanceInsights = useMemo(() => {
    if (!summary || !routeData) return null
    
    const estimatedDuration = routeData.duration
    const actualDuration = summary.duration / 1000
    const timeDiff = estimatedDuration ? actualDuration - estimatedDuration : 0
    
    return {
      estimatedMins: estimatedDuration ? Math.round(estimatedDuration / 60) : null,
      actualMins: Math.round(actualDuration / 60),
      timeDiffMins: Math.round(timeDiff / 60),
      faster: timeDiff < 0,
    }
  }, [summary, routeData])

  // Route names
  const routeNames = useMemo(() => {
    const origin = routeData?.origin || routeData?.name?.split(' to ')?.[0] || 'Start'
    const destination = routeData?.destination || routeData?.name?.split(' to ')?.[1] || 'Finish'
    
    const cleanName = (name) => {
      if (!name) return ''
      const parts = name.split(',')
      return parts[0].trim()
    }
    
    return {
      from: cleanName(origin),
      to: cleanName(destination)
    }
  }, [routeData])

  // Share functionality using html2canvas
  const handleShare = async () => {
    setIsSharing(true)
    
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default
      
      if (shareCardRef.current) {
        const canvas = await html2canvas(shareCardRef.current, {
          backgroundColor: '#0a0a0f',
          scale: 2,
          logging: false,
          useCORS: true,
        })
        
        canvas.toBlob(async (blob) => {
          if (!blob) {
            setIsSharing(false)
            return
          }
          
          const file = new File([blob], `rally-copilot-${Date.now()}.png`, { type: 'image/png' })
          
          // Try native share first (mobile)
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: 'Rally Co-Pilot Drive',
                text: `${routeNames.from} → ${routeNames.to}`
              })
              setShareSuccess(true)
            } catch (err) {
              if (err.name !== 'AbortError') {
                downloadImage(blob)
                setShareSuccess(true)
              }
            }
          } else {
            downloadImage(blob)
            setShareSuccess(true)
          }
          
          setIsSharing(false)
          setTimeout(() => setShareSuccess(false), 2000)
        }, 'image/png')
      }
    } catch (err) {
      console.error('Share failed:', err)
      // Fallback to simple canvas if html2canvas fails
      fallbackShare()
    }
  }
  
  const fallbackShare = async () => {
    // Simple fallback that just downloads basic info
    const text = `🏁 Rally Co-Pilot\n${routeNames.from} → ${routeNames.to}\n📏 ${summary.distance.toFixed(1)} ${summary.distanceUnit}\n⏱ ${summary.durationFormatted}\n🏎 Top: ${Math.round(summary.maxSpeed)} ${summary.speedUnit}`
    
    if (navigator.share) {
      try {
        await navigator.share({ text })
        setShareSuccess(true)
      } catch (err) {
        // Copy to clipboard as last resort
        navigator.clipboard?.writeText(text)
        setShareSuccess(true)
      }
    } else {
      navigator.clipboard?.writeText(text)
      setShareSuccess(true)
    }
    
    setIsSharing(false)
    setTimeout(() => setShareSuccess(false), 2000)
  }
  
  const downloadImage = (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rally-copilot-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!summary) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-white/30 text-sm">No trip data</p>
      </div>
    )
  }

  const completionPercent = curveInsights?.total > 0 
    ? Math.round((curveInsights.completed / curveInsights.total) * 100)
    : 100

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col overflow-hidden">
      
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-[100px]"
          style={{ background: `radial-gradient(circle, ${modeColor} 0%, transparent 70%)` }}
        />
        <div 
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-10 blur-[80px]"
          style={{ background: `radial-gradient(circle, #22c55e 0%, transparent 70%)` }}
        />
      </div>

      {/* Header with route visualization */}
      <div className="relative flex-shrink-0">
        <div className="relative h-44 overflow-hidden">
          <svg 
            viewBox={`0 0 ${routePath?.viewWidth || 280} ${routePath?.viewHeight || 140}`} 
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="50%" stopColor={modeColor} />
                <stop offset="100%" stopColor={modeColor} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {routePath ? (
              <>
                <path d={routePath.d} fill="none" stroke={modeColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" filter="url(#glow)"/>
                <path d={routePath.d} fill="none" stroke="url(#routeGradient)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-draw"/>
                <circle cx={routePath.start[0]} cy={routePath.start[1]} r="8" fill="#0a0a0f" stroke="#22c55e" strokeWidth="3"/>
                <circle cx={routePath.end[0]} cy={routePath.end[1]} r="8" fill="#0a0a0f" stroke={modeColor} strokeWidth="3"/>
                <g transform={`translate(${routePath.end[0] - 6}, ${routePath.end[1] - 6})`}>
                  <path d="M4 8l3 3 5-6" fill="none" stroke={modeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
              </>
            ) : (
              <text x="140" y="70" textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="14">Route Complete</text>
            )}
          </svg>
          
          {/* Completion badge */}
          <div className="absolute top-4 right-4 safe-top">
            <div className="px-3 py-1.5 rounded-full backdrop-blur-xl border flex items-center gap-2" style={{ background: `${modeColor}15`, borderColor: `${modeColor}30` }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: modeColor, boxShadow: `0 0 8px ${modeColor}` }}/>
              <span className="text-[11px] font-semibold tracking-wider" style={{ color: modeColor }}>COMPLETE</span>
            </div>
          </div>
          
          {/* Time badge */}
          <div className="absolute top-4 left-4 safe-top">
            <div className="text-white/40 text-[10px]">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
        
        {/* Route Names */}
        <div className="px-4 pb-3 -mt-2">
          <div className="flex items-center justify-center gap-2 text-center">
            <span className="text-white/60 text-sm font-medium truncate max-w-[140px]">{routeNames.from}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2" className="flex-shrink-0">
              <path d="M5 12h14m-7-7l7 7-7 7"/>
            </svg>
            <span className="text-white text-sm font-medium truncate max-w-[140px]">{routeNames.to}</span>
          </div>
        </div>
      </div>

      {/* Stats Content - Scrollable */}
      <div className="flex-1 overflow-auto px-4 pb-6">
        
        {/* Hero Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <div className="text-white/40 text-[10px] tracking-widest mb-1">DISTANCE</div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white tabular-nums">{animatedStats.distance.toFixed(1)}</span>
              <span className="text-white/40 text-sm">{summary.distanceUnit}</span>
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <div className="text-white/40 text-[10px] tracking-widest mb-1">DURATION</div>
            <div className="text-4xl font-bold text-white tabular-nums">{summary.durationFormatted}</div>
            {performanceInsights?.estimatedMins && performanceInsights.timeDiffMins !== 0 && (
              <div className={`text-[10px] mt-1 ${performanceInsights.faster ? 'text-green-400' : 'text-orange-400'}`}>
                {performanceInsights.faster ? '▼' : '▲'} {Math.abs(performanceInsights.timeDiffMins)}m vs estimate
              </div>
            )}
          </div>
        </div>

        {/* Speed Stats */}
        <div className={`grid grid-cols-2 gap-3 mb-4 transition-all duration-500 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-[10px] tracking-widest">AVG SPEED</span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${modeColor}20` }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={modeColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold" style={{ color: modeColor }}>{Math.round(animatedStats.avgSpeed)}</span>
              <span className="text-white/40 text-xs">{summary.speedUnit}</span>
            </div>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-[10px] tracking-widest">TOP SPEED</span>
              <div className="w-6 h-6 rounded-full flex items-center justify-center bg-orange-500/20">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-orange-400">{Math.round(animatedStats.maxSpeed)}</span>
              <span className="text-white/40 text-xs">{summary.speedUnit}</span>
            </div>
          </div>
        </div>

        {/* Zone Breakdown */}
        {zoneInsights && zoneInsights.total > 0 && (
          <div className={`bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 mb-4 transition-all duration-500 delay-100 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/40 text-[10px] tracking-widest">ROAD BREAKDOWN</span>
              <span className="text-white/30 text-[10px]">{zoneInsights.segments} segments</span>
            </div>
            
            <div className="flex h-3 rounded-full overflow-hidden mb-3">
              {zoneInsights.urban > 0 && <div className="h-full" style={{ width: `${(zoneInsights.urban / zoneInsights.total) * 100}%`, background: ZONE_COLORS.urban.primary }}/>}
              {zoneInsights.transit > 0 && <div className="h-full" style={{ width: `${(zoneInsights.transit / zoneInsights.total) * 100}%`, background: ZONE_COLORS.transit.primary }}/>}
              {zoneInsights.technical > 0 && <div className="h-full" style={{ width: `${(zoneInsights.technical / zoneInsights.total) * 100}%`, background: ZONE_COLORS.technical.primary }}/>}
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ZONE_COLORS).map(([zone, colors]) => {
                const miles = zoneInsights[zone] || 0
                if (miles === 0) return null
                const percent = Math.round((miles / zoneInsights.total) * 100)
                return (
                  <div key={zone} className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: colors.primary }} />
                      <span className="text-[10px] text-white/50 uppercase">{zone}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{miles.toFixed(1)} mi</div>
                    <div className="text-[10px] text-white/30">{percent}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Curves Tackled */}
        {curveInsights && curveInsights.total > 0 && (
          <div className={`bg-white/5 backdrop-blur-xl rounded-2xl p-4 border border-white/10 mb-4 transition-all duration-500 delay-200 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/40 text-[10px] tracking-widest">CURVES TACKLED</span>
              <span className="text-white font-semibold">{curveInsights.completed}<span className="text-white/30">/{curveInsights.total}</span></span>
            </div>
            
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
              <div className="h-full rounded-full" style={{ width: `${completionPercent}%`, background: `linear-gradient(90deg, #22c55e, ${modeColor})` }}/>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded-xl bg-green-500/10">
                <div className="text-xl font-bold text-green-400">{curveInsights.easy}</div>
                <div className="text-[9px] text-green-400/60 tracking-wider">EASY</div>
              </div>
              <div className="text-center p-2 rounded-xl bg-yellow-500/10">
                <div className="text-xl font-bold text-yellow-400">{curveInsights.medium}</div>
                <div className="text-[9px] text-yellow-400/60 tracking-wider">MEDIUM</div>
              </div>
              <div className="text-center p-2 rounded-xl bg-red-500/10">
                <div className="text-xl font-bold text-red-400">{curveInsights.hard}</div>
                <div className="text-[9px] text-red-400/60 tracking-wider">HARD</div>
              </div>
              <div className="text-center p-2 rounded-xl bg-purple-500/10">
                <div className="text-xl font-bold text-purple-400">{curveInsights.chicanes}</div>
                <div className="text-[9px] text-purple-400/60 tracking-wider">S-CURVES</div>
              </div>
            </div>
            
            {curveInsights.sharpest > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-white/40 text-[10px]">Sharpest turn</span>
                <span className="text-orange-400 font-bold">{curveInsights.sharpest}°</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className={`space-y-2 transition-all duration-500 delay-300 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button 
            onClick={handleShare}
            disabled={isSharing}
            className="w-full py-3.5 rounded-xl font-semibold text-sm tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ 
              background: shareSuccess ? '#22c55e20' : `linear-gradient(135deg, ${modeColor}20, ${modeColor}10)`,
              border: `1px solid ${shareSuccess ? '#22c55e50' : modeColor + '30'}`,
              color: shareSuccess ? '#22c55e' : modeColor
            }}
          >
            {isSharing ? (
              <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>Creating...</>
            ) : shareSuccess ? (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>Saved!</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>Share Drive</>
            )}
          </button>
          
          <button 
            onClick={() => { closeTripSummary(); goToMenu() }}
            className="w-full py-3.5 rounded-xl bg-white/10 text-white font-semibold text-sm tracking-wide hover:bg-white/15 transition-all border border-white/10"
          >
            Done
          </button>
        </div>
      </div>

      {/* Hidden Share Card - This gets rendered to PNG */}
      <div className="fixed -left-[9999px] top-0">
        <div 
          ref={shareCardRef}
          className="w-[400px] p-6"
          style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #12121a 100%)' }}
        >
          {/* Route visualization */}
          <div className="relative h-[160px] mb-4">
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full"
              style={{ background: `radial-gradient(circle, ${modeColor}30 0%, transparent 70%)` }}
            />
            <svg viewBox={`0 0 ${routePath?.viewWidth || 280} ${routePath?.viewHeight || 140}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              {routePath && (
                <>
                  <path d={routePath.d} fill="none" stroke={modeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                  <circle cx={routePath.start[0]} cy={routePath.start[1]} r="6" fill="#0a0a0f" stroke="#22c55e" strokeWidth="2"/>
                  <circle cx={routePath.end[0]} cy={routePath.end[1]} r="6" fill="#0a0a0f" stroke={modeColor} strokeWidth="2"/>
                </>
              )}
            </svg>
          </div>
          
          {/* Route name */}
          <div className="text-center mb-1">
            <span className="text-white text-lg font-bold">{routeNames.from} → {routeNames.to}</span>
          </div>
          
          {/* Date */}
          <div className="text-center mb-6">
            <span className="text-white/40 text-xs">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">DISTANCE</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{summary.distance.toFixed(1)}</span>
                <span className="text-white/40 text-sm">{summary.distanceUnit}</span>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">DURATION</div>
              <span className="text-3xl font-bold text-white">{summary.durationFormatted}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">AVG SPEED</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold" style={{ color: modeColor }}>{Math.round(summary.avgSpeed)}</span>
                <span className="text-white/40 text-sm">{summary.speedUnit}</span>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4">
              <div className="text-white/40 text-[10px] tracking-widest mb-1">TOP SPEED</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-orange-400">{Math.round(summary.maxSpeed)}</span>
                <span className="text-white/40 text-sm">{summary.speedUnit}</span>
              </div>
            </div>
          </div>
          
          {/* Curves summary */}
          {curveInsights && curveInsights.total > 0 && (
            <div className="text-center mb-6">
              <span className="text-white/50 text-xs">
                {curveInsights.total} curves • {curveInsights.easy} easy • {curveInsights.medium} medium • {curveInsights.hard} hard
              </span>
            </div>
          )}
          
          {/* Branding */}
          <div className="text-center pt-4 border-t border-white/10">
            <div className="font-bold text-sm tracking-wider mb-1" style={{ color: modeColor }}>RALLY CO-PILOT</div>
            <div className="text-white/30 text-[10px] tracking-widest">{mode.toUpperCase()} MODE</div>
          </div>
        </div>
      </div>

      <style>{`
        .safe-top { padding-top: env(safe-area-inset-top, 12px); }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        
        @keyframes draw {
          from { stroke-dashoffset: 1000; }
          to { stroke-dashoffset: 0; }
        }
        .animate-draw {
          stroke-dasharray: 1000;
          animation: draw 2s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
