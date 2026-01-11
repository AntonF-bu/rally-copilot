import { useMemo, useState, useEffect } from 'react'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Racing HUD - v6
// With status indicators
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
    routeMode,
    gpsAccuracy,
    altitude,
    speed
  } = useStore()

  const [isOnline, setIsOnline] = useState(true)

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

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

  // Current elevation from GPS (convert meters to feet)
  const currentElevationFt = altitude !== null ? Math.round(altitude * 3.28084) : null

  // Generate simple elevation profile for route (estimated from start/end if no real data)
  const { elevationData, totalElevation, elevationPosition } = useMemo(() => {
    const numPoints = 20
    const points = []
    
    // If we have real altitude, use it as reference
    const baseElev = altitude !== null ? altitude : 50 // default 50m if no GPS
    
    // Generate a simple profile (in real app, would fetch from Mapbox Terrain API)
    for (let i = 0; i < numPoints; i++) {
      // Simple variation around current altitude
      const variation = Math.sin(i * 0.5) * 20 + Math.cos(i * 0.3) * 10
      points.push(baseElev + variation)
    }
    
    const minElev = Math.min(...points)
    const maxElev = Math.max(...points)
    const pos = Math.min(Math.floor(simulationProgress * numPoints), numPoints - 1)
    
    return {
      elevationData: points,
      totalElevation: Math.round((maxElev - minElev) * 3.28084), // to feet
      elevationPosition: pos
    }
  }, [altitude, simulationProgress])

  if (!isRunning) return null

  // Status warnings
  const hasGpsIssue = routeMode !== 'demo' && gpsAccuracy && gpsAccuracy > 30
  const hasNetworkIssue = !isOnline

  // Minimal HUD when no curves ahead
  if (!curve) {
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        {/* Status Warnings */}
        {(hasNetworkIssue) && (
          <StatusWarnings hasNetworkIssue={hasNetworkIssue} />
        )}
        
        <div className="hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white/50 text-sm">
                {routeMode === 'demo' ? 'Demo Mode' : 'Route Active'}
              </span>
              <span className="text-white/30 text-xs">• No curves ahead</span>
            </div>
            
            {/* Current Speed */}
            <div className="text-right">
              <span className="text-2xl font-bold" style={{ color: modeColor }}>
                {Math.round(speed || 0)}
              </span>
              <span className="text-xs text-white/40 ml-1">
                {settings.speedUnit?.toUpperCase() || 'MPH'}
              </span>
            </div>
          </div>
        </div>
        
        {/* Elevation widget */}
        <ElevationWidget 
          elevationData={elevationData}
          totalElevation={totalElevation}
          currentElevation={currentElevationFt}
          elevationPosition={elevationPosition}
          modeColor={modeColor}
        />

        <style>{hudStyles}</style>
      </div>
    )
  }

  const recommendedSpeed = getRecommendedSpeed(curve)
  const isLeft = curve.direction === 'LEFT'
  const severityColor = getCurveColor(curve.severity)
  const brakingZone = getBrakingZone(curve.severity)
  
  const maxDistance = 400
  const progress = Math.min(100, Math.max(0, ((maxDistance - curve.distance) / maxDistance) * 100))
  const inBrakingZone = brakingZone.show && progress >= brakingZone.start

  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
      
      {/* Status Warnings */}
      {(hasNetworkIssue) && (
        <StatusWarnings hasNetworkIssue={hasNetworkIssue} />
      )}

      {/* Main HUD Bar */}
      <div className="hud-glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            
            {/* Direction + Severity */}
            <div className="flex items-center gap-3">
              {curve.isChicane ? (
                <div 
                  className="px-3 py-2 rounded-xl flex flex-col items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
                    border: `1.5px solid ${severityColor}50`,
                    boxShadow: `0 0 20px ${severityColor}30`
                  }}
                >
                  <span className="text-[10px] font-bold tracking-wider" style={{ color: severityColor }}>
                    {curve.chicaneType === 'CHICANE' ? 'CHICANE' : 'S-CURVE'}
                  </span>
                  <span className="text-lg font-bold" style={{ color: severityColor }}>
                    {curve.startDirection === 'LEFT' ? '←' : '→'} {curve.severitySequence}
                  </span>
                </div>
              ) : (
                <>
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
                      <div 
                        className="text-[10px] font-bold tracking-wider mt-0.5"
                        style={{ 
                          color: curve.modifier === 'TIGHTENS' ? '#f97316' : 
                                 curve.modifier === 'OPENS' ? '#22c55e' : severityColor 
                        }}
                      >
                        {curve.modifier}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Progress Bar */}
            <div className="flex-1 px-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-white/40 tracking-wider">DISTANCE</span>
                <span 
                  className="text-lg font-bold tracking-tight"
                  style={{ color: inBrakingZone ? '#ff3366' : 'white' }}
                >
                  {Math.round(curve.distance)}<span className="text-xs text-white/40 ml-1">m</span>
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
                {settings.speedUnit?.toUpperCase() || 'MPH'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Curves - Left side */}
      {upcomingCurves.length > 1 && (
        <div className="absolute top-24 left-3 hud-glass rounded-xl px-3 py-2">
          <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
          <div className="flex flex-col gap-1">
            {upcomingCurves.slice(1, 4).map((next) => {
              const nextColor = getCurveColor(next.severity)
              const nextIsLeft = next.direction === 'LEFT'
              
              if (next.isChicane) {
                return (
                  <div key={next.id} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold" style={{ color: nextColor }}>
                      {next.chicaneType === 'CHICANE' ? 'CH' : 'S'}{next.startDirection === 'LEFT' ? '←' : '→'}
                    </span>
                    <span className="text-sm font-bold" style={{ color: nextColor }}>{next.severitySequence}</span>
                    <span className="text-[10px] text-white/30">{Math.round(next.distance)}m</span>
                  </div>
                )
              }
              
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
                  {next.modifier && (
                    <span className="text-[8px]" style={{ 
                      color: next.modifier === 'TIGHTENS' ? '#f97316' : 
                             next.modifier === 'OPENS' ? '#22c55e' : nextColor 
                    }}>
                      {next.modifier === 'TIGHTENS' ? '⟩' : next.modifier === 'OPENS' ? '⟨' : ''}
                    </span>
                  )}
                  <span className="text-[10px] text-white/30">{Math.round(next.distance)}m</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Elevation widget */}
      <ElevationWidget 
        elevationData={elevationData}
        totalElevation={totalElevation}
        currentElevation={currentElevationFt}
        elevationPosition={elevationPosition}
        modeColor={modeColor}
      />

      <style>{hudStyles}</style>
    </div>
  )
}

// Status Warnings Component - only OFFLINE warning (GPS shown in bottom bar)
function StatusWarnings({ hasNetworkIssue }) {
  if (!hasNetworkIssue) return null
  
  return (
    <div className="mb-2">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff3366" strokeWidth="2">
          <path d="M1 1l22 22M9.7 4.7a10 10 0 0 1 12.6 2.6M4.7 9.7a10 10 0 0 1 2-2M16.2 8.2a6 6 0 0 1 3.5 5.8M8.2 11a6 6 0 0 1 3.2-2.8M12 17h.01"/>
        </svg>
        <span className="text-xs font-semibold text-red-400">OFFLINE</span>
      </div>
    </div>
  )
}

// Elevation Widget Component
function ElevationWidget({ elevationData, totalElevation, currentElevation, elevationPosition, modeColor }) {
  // Calculate min/max for proper scaling
  const minElev = Math.min(...elevationData)
  const maxElev = Math.max(...elevationData)
  const range = maxElev - minElev || 1
  
  return (
    <div className="absolute top-24 right-3 hud-glass rounded-xl px-2 py-2 w-[100px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-semibold text-white/30 tracking-wider">ELEV</span>
        <span className="text-[8px] text-white/40">Δ{totalElevation}ft</span>
      </div>
      <div className="h-8">
        <svg viewBox="0 0 80 24" className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="elevGradHud" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={modeColor} stopOpacity="0.3"/>
              <stop offset="100%" stopColor={modeColor} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path
            d={`M 0 24 ${elevationData.map((el, i) => `L ${(i / 19) * 80} ${24 - ((el - minElev) / range) * 18}`).join(' ')} L 80 24 Z`}
            fill="url(#elevGradHud)"
          />
          <path
            d={`M ${elevationData.map((el, i) => `${i === 0 ? '' : 'L '}${(i / 19) * 80} ${24 - ((el - minElev) / range) * 18}`).join(' ')}`}
            fill="none" stroke={modeColor} strokeWidth="1.5" strokeLinecap="round"
          />
          <circle 
            cx={(elevationPosition / 19) * 80} 
            cy={24 - ((elevationData[elevationPosition] - minElev) / range) * 18} 
            r="2.5" 
            fill={modeColor}
          />
        </svg>
      </div>
      <div className="text-[9px] text-white/50 text-center mt-0.5">
        {currentElevation !== null ? `${currentElevation}ft` : '-- ft'}
      </div>
    </div>
  )
}

const hudStyles = `
  .hud-glass {
    background: linear-gradient(135deg, rgba(15,15,20,0.9) 0%, rgba(10,10,15,0.95) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.06);
    box-shadow: 0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .safe-top {
    padding-top: env(safe-area-inset-top, 0px);
  }
`
