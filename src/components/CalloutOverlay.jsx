import { useMemo } from 'react'
import useStore from '../store'
import { getCurveColor, MOHAWK_TRAIL } from '../data/routes'

// ================================
// Racing HUD - Premium Glass Design
// Braking zones + Elevation graph
// ================================

export default function CalloutOverlay() {
  const { isRunning, activeCurve, upcomingCurves, mode, settings, getRecommendedSpeed, simulationProgress } = useStore()

  const curve = activeCurve || upcomingCurves[0]
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  // Calculate braking zone based on severity
  const getBrakingZone = (severity) => {
    if (severity <= 2) return { show: false, start: 0 }
    if (severity <= 3) return { show: true, start: 75, intensity: 0.5 }
    if (severity <= 4) return { show: true, start: 60, intensity: 0.7 }
    if (severity <= 5) return { show: true, start: 50, intensity: 0.85 }
    return { show: true, start: 40, intensity: 1 }
  }

  // Generate elevation data points for mini graph
  const elevationData = useMemo(() => {
    const coords = MOHAWK_TRAIL.coordinates
    const points = []
    const numPoints = 20
    
    for (let i = 0; i < numPoints; i++) {
      const idx = Math.floor((i / numPoints) * coords.length)
      const coord = coords[Math.min(idx, coords.length - 1)]
      const elevation = 800 + Math.sin(coord[0] * 100) * 150 + Math.cos(coord[1] * 80) * 100
      points.push(elevation)
    }
    return points
  }, [])

  const elevationPosition = Math.floor(simulationProgress * 20)

  if (!isRunning) return null

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
                  className="w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden"
                  style={{ 
                    background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
                    border: `1.5px solid ${severityColor}50`,
                    boxShadow: `0 0 20px ${severityColor}30, inset 0 1px 0 ${severityColor}20`
                  }}
                >
                  <svg 
                    width="28" 
                    height="28" 
                    viewBox="0 0 24 24" 
                    fill={severityColor}
                    style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}
                    className="drop-shadow-lg"
                  >
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                </div>
                
                <div className="flex flex-col">
                  <div 
                    className="text-4xl font-bold tracking-tight leading-none"
                    style={{ 
                      fontFamily: 'SF Pro Display, -apple-system, system-ui',
                      color: severityColor,
                      textShadow: `0 0 30px ${severityColor}50`
                    }}
                  >
                    {curve.severity}
                  </div>
                  {curve.modifier && (
                    <div 
                      className="text-[10px] font-bold tracking-wider mt-0.5"
                      style={{ color: severityColor }}
                    >
                      {curve.modifier}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar with Braking Zone */}
              <div className="flex-1 px-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-white/40 tracking-wider">DISTANCE</span>
                  <span 
                    className="text-lg font-bold tracking-tight"
                    style={{ 
                      fontFamily: 'SF Mono, monospace',
                      color: inBrakingZone ? '#ff3366' : 'white'
                    }}
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
                    className="h-full rounded-full transition-all duration-150 relative"
                    style={{ 
                      width: `${progress}%`,
                      background: inBrakingZone 
                        ? `linear-gradient(90deg, ${modeColor}, #ffd500, #ff3366)`
                        : `linear-gradient(90deg, ${modeColor}90, ${modeColor})`,
                      boxShadow: inBrakingZone 
                        ? '0 0 15px #ff336680' 
                        : `0 0 10px ${modeColor}50`
                    }}
                  />
                  
                  {inBrakingZone && (
                    <div className="absolute inset-0 flex items-center justify-end pr-2">
                      <span className="text-[9px] font-black text-white tracking-wider animate-pulse">
                        BRAKE
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Speed Recommendation */}
              <div className="text-right pl-2">
                <div 
                  className="text-4xl font-bold tracking-tight leading-none"
                  style={{ 
                    fontFamily: 'SF Pro Display, -apple-system, system-ui',
                    color: modeColor,
                    textShadow: `0 0 30px ${modeColor}50`
                  }}
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

      {/* Upcoming Curves Strip */}
      {upcomingCurves.length > 1 && (
        <div className="hud-glass rounded-xl mt-2 px-3 py-2">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold text-white/30 tracking-wider mr-2">NEXT</span>
            <div className="flex items-center gap-2 overflow-x-auto">
              {upcomingCurves.slice(1, 5).map((next) => {
                const nextColor = getCurveColor(next.severity)
                const nextIsLeft = next.direction === 'LEFT'
                const nextBrake = getBrakingZone(next.severity)
                
                return (
                  <div 
                    key={next.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
                    style={{ 
                      background: `${nextColor}15`,
                      border: `1px solid ${nextColor}30`
                    }}
                  >
                    <svg 
                      width="12" height="12" viewBox="0 0 24 24" 
                      fill={nextColor}
                      style={{ transform: nextIsLeft ? 'scaleX(-1)' : 'none' }}
                    >
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                    </svg>
                    <span className="text-sm font-bold" style={{ color: nextColor }}>
                      {next.severity}
                    </span>
                    <span className="text-[10px] text-white/30 font-medium">{next.distance}m</span>
                    {nextBrake.show && (
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Elevation Graph */}
      <div className="hud-glass rounded-xl mt-2 px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-semibold text-white/30 tracking-wider">ELEVATION</span>
          <span className="text-[10px] font-medium text-white/50">
            +{Math.round(Math.sin(simulationProgress * Math.PI * 2) * 80 + 120)}ft ahead
          </span>
        </div>
        
        <div className="h-10 relative">
          <svg viewBox="0 0 200 40" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="elevGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={modeColor} stopOpacity="0.4"/>
                <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={modeColor} stopOpacity="0.3"/>
                <stop offset={`${elevationPosition * 5}%`} stopColor={modeColor} stopOpacity="1"/>
                <stop offset="100%" stopColor={modeColor} stopOpacity="0.5"/>
              </linearGradient>
            </defs>
            
            <path
              d={`M 0 40 ${elevationData.map((el, i) => {
                const x = (i / (elevationData.length - 1)) * 200
                const y = 40 - ((el - 700) / 300) * 35
                return `L ${x} ${y}`
              }).join(' ')} L 200 40 Z`}
              fill="url(#elevGradient)"
            />
            
            <path
              d={`M ${elevationData.map((el, i) => {
                const x = (i / (elevationData.length - 1)) * 200
                const y = 40 - ((el - 700) / 300) * 35
                return `${i === 0 ? '' : 'L '}${x} ${y}`
              }).join(' ')}`}
              fill="none"
              stroke="url(#lineGradient)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            
            <circle
              cx={elevationPosition * 10}
              cy={40 - ((elevationData[elevationPosition] - 700) / 300) * 35}
              r="4"
              fill={modeColor}
              className="drop-shadow-lg"
            >
              <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite"/>
            </circle>
            
            <line
              x1={elevationPosition * 10}
              y1="0"
              x2={elevationPosition * 10}
              y2="40"
              stroke={modeColor}
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.5"
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
