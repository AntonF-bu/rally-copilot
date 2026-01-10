import { useMemo } from 'react'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Racing HUD - Compact Design
// ================================

export default function CalloutOverlay() {
  const { 
    isRunning, 
    activeCurve, 
    upcomingCurves, 
    mode, 
    settings, 
    getRecommendedSpeed, 
    simulationProgress,
    routeData,
    routeMode
  } = useStore()

  const curve = activeCurve || upcomingCurves[0]
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  const getBrakingZone = (severity) => {
    if (severity <= 2) return { show: false, start: 0 }
    if (severity <= 3) return { show: true, start: 75 }
    if (severity <= 4) return { show: true, start: 60 }
    if (severity <= 5) return { show: true, start: 50 }
    return { show: true, start: 40 }
  }

  // Generate elevation data from route or use placeholder
  const elevationData = useMemo(() => {
    const coords = routeData?.coordinates || []
    const points = []
    const numPoints = 20
    
    if (coords.length > 0) {
      for (let i = 0; i < numPoints; i++) {
        const idx = Math.floor((i / numPoints) * coords.length)
        const coord = coords[Math.min(idx, coords.length - 1)]
        points.push(800 + Math.sin(coord[0] * 100) * 150 + Math.cos(coord[1] * 80) * 100)
      }
    } else {
      // Placeholder data
      for (let i = 0; i < numPoints; i++) {
        points.push(800 + Math.sin(i * 0.5) * 100)
      }
    }
    return points
  }, [routeData])

  const elevationPosition = Math.min(Math.floor(simulationProgress * 20), 19)

  if (!isRunning) return null

  // If no curves detected yet, show waiting state
  if (!curve && upcomingCurves.length === 0) {
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            <span className="text-white/50 text-sm">
              {routeMode === 'lookahead' ? 'Analyzing road ahead...' : 'Detecting curves...'}
            </span>
          </div>
        </div>
        
        {/* Elevation still shows */}
        <div className="absolute top-20 right-3 hud-glass rounded-xl px-2 py-2 w-[100px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] font-semibold text-white/30 tracking-wider">ELEV</span>
          </div>
          <div className="h-8">
            <svg viewBox="0 0 80 24" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elevGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={modeColor} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path
                d={`M 0 24 ${elevationData.map((el, i) => `L ${(i / 19) * 80} ${24 - ((el - 700) / 300) * 18}`).join(' ')} L 80 24 Z`}
                fill="url(#elevGrad)"
              />
              <path
                d={`M ${elevationData.map((el, i) => `${i === 0 ? '' : 'L '}${(i / 19) * 80} ${24 - ((el - 700) / 300) * 18}`).join(' ')}`}
                fill="none" stroke={modeColor} strokeWidth="1.5" strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <style>{`
          .hud-glass {
            background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.06);
            box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
          }
        `}</style>
      </div>
    )
  }

  const recommendedSpeed = curve ? getRecommendedSpeed(curve) : 0
  const isLeft = curve?.direction === 'LEFT'
  const severityColor = curve ? getCurveColor(curve.severity) : modeColor
  const brakingZone = curve ? getBrakingZone(curve.severity) : { show: false }
  
  const maxDistance = 400
  const progress = curve ? Math.min(100, Math.max(0, ((maxDistance - curve.distance) / maxDistance) * 100)) : 0
  const inBrakingZone = brakingZone.show && progress >= brakingZone.start

  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
      
      {/* Main HUD Bar */}
      {curve && (
        <div className="hud-glass rounded-2xl overflow-hidden">
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              
              {/* Direction + Severity */}
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
                    border: `1.5px solid ${severityColor}50`,
                    boxShadow: `0 0 20px ${severityColor}30`
                  }}
                >
                  <svg 
                    width="28" height="28" viewBox="0 0 24 24" 
                    fill={severityColor}
                    style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}
                  >
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </div>
                
                <div className="flex flex-col">
                  <div 
                    className="text-4xl font-bold tracking-tight leading-none"
                    style={{ color: severityColor, textShadow: `0 0 30px ${severityColor}50` }}
                  >
                    {curve.severity}
                  </div>
                  {curve.modifier && (
                    <div className="text-[10px] font-bold tracking-wider mt-0.5" style={{ color: severityColor }}>
                      {curve.modifier}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="flex-1 px-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-white/40 tracking-wider">DISTANCE</span>
                  <span 
                    className="text-lg font-bold tracking-tight"
                    style={{ color: inBrakingZone ? '#ff3366' : 'white' }}
                  >
                    {curve.distance}<span className="text-xs text-white/40 ml-1">m</span>
                  </span>
                </div>
                
                <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden relative">
                  {brakingZone.show && (
                    <div 
                      className="absolute top-0 bottom-0 rounded-r-full"
                      style={{
                        left: `${brakingZone.start}%`,
                        right: 0,
                        background: `linear-gradient(90deg, #ffd50030 0%, #ff336650 50%, #ff336680 100%)`
                      }}
                    />
                  )}
                  
                  <div 
                    className="h-full rounded-full transition-all duration-150"
                    style={{ 
                      width: `${progress}%`,
                      background: inBrakingZone 
                        ? `linear-gradient(90deg, ${modeColor}, #ffd500, #ff3366)`
                        : `linear-gradient(90deg, ${modeColor}90, ${modeColor})`,
                      boxShadow: inBrakingZone ? '0 0 15px #ff336680' : `0 0 10px ${modeColor}50`
                    }}
                  />
                  
                  {inBrakingZone && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2">
                      <span className="text-[9px] font-black text-white tracking-wider animate-pulse">BRAKE</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Speed */}
              <div className="text-right pl-2">
                <div 
                  className="text-4xl font-bold tracking-tight leading-none"
                  style={{ color: modeColor, textShadow: `0 0 30px ${modeColor}50` }}
                >
                  {recommendedSpeed}
                </div>
                <div className="text-[10px] font-semibold text-white/40 tracking-wider mt-0.5">
                  {settings.speedUnit.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Curves - Left side */}
      {upcomingCurves.length > 1 && (
        <div className="absolute top-24 left-3 hud-glass rounded-xl px-3 py-2">
          <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
          <div className="flex flex-col gap-1">
            {upcomingCurves.slice(1, 4).map((next) => {
              const nextColor = getCurveColor(next.severity)
              const nextIsLeft = next.direction === 'LEFT'
              return (
                <div key={next.id} className="flex items-center gap-2">
                  <svg 
                    width="10" height="10" viewBox="0 0 24 24" 
                    fill={nextColor}
                    style={{ transform: nextIsLeft ? 'scaleX(-1)' : 'none' }}
                  >
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                  <span className="text-sm font-bold" style={{ color: nextColor }}>{next.severity}</span>
                  <span className="text-[10px] text-white/30">{next.distance}m</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Elevation - Right side, fixed size */}
      <div className="absolute top-24 right-3 hud-glass rounded-xl px-2 py-2 w-[100px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-semibold text-white/30 tracking-wider">ELEV</span>
          <span className="text-[8px] text-white/40">+{Math.round(Math.sin(simulationProgress * Math.PI * 2) * 80 + 120)}ft</span>
        </div>
        <div className="h-8">
          <svg viewBox="0 0 80 24" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="elevGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={modeColor} stopOpacity="0.3"/>
                <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path
              d={`M 0 24 ${elevationData.map((el, i) => `L ${(i / 19) * 80} ${24 - ((el - 700) / 300) * 18}`).join(' ')} L 80 24 Z`}
              fill="url(#elevGrad2)"
            />
            <path
              d={`M ${elevationData.map((el, i) => `${i === 0 ? '' : 'L '}${(i / 19) * 80} ${24 - ((el - 700) / 300) * 18}`).join(' ')}`}
              fill="none" stroke={modeColor} strokeWidth="1.5" strokeLinecap="round"
            />
            <circle cx={(elevationPosition / 19) * 80} cy={24 - ((elevationData[elevationPosition] - 700) / 300) * 18} r="2.5" fill={modeColor}/>
          </svg>
        </div>
      </div>

      <style>{`
        .hud-glass {
          background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  )
}
