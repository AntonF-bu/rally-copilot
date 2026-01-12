import { useMemo, useState, useEffect } from 'react'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { getBehaviorForCurve, CHARACTER_COLORS, ROUTE_CHARACTER } from '../services/zoneService'
import { useHighwayMode } from '../hooks/useHighwayMode'

// ================================
// Racing HUD - v11
// NEW: Highway mode support - shows SW, S-SWEEP, ACTIVE sections
// ================================

// Highway colors
const HIGHWAY_BEND_COLOR = '#3b82f6'  // Blue for sweepers
const ACTIVE_SECTION_COLOR = '#f59e0b'  // Amber for active sections

// Character labels for zone badge
const CHARACTER_LABELS = {
  [ROUTE_CHARACTER.TECHNICAL]: { label: 'TECHNICAL', short: 'TECH' },
  [ROUTE_CHARACTER.TRANSIT]: { label: 'HIGHWAY', short: 'HWY' },
  [ROUTE_CHARACTER.URBAN]: { label: 'URBAN', short: 'CITY' }
}

export default function CalloutOverlay({ currentDrivingMode, userDistance = 0 }) {
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
    routeZones,
    gpsAccuracy,
    altitude,
    speed,
    position,
    elevationData
  } = useStore()

  // NEW: Get highway data
  const { highwayBends, isHighwayActive } = useHighwayMode()

  const [isOnline, setIsOnline] = useState(true)
  
  const isMetric = settings.units === 'metric'
  const speedUnit = isMetric ? 'KM/H' : 'MPH'
  const distanceUnit = isMetric ? 'm' : 'ft'

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

  // Get current route character using userDistance (for GPS) or simulationProgress (for demo)
  const currentCharacter = useMemo(() => {
    if (!routeZones?.length) return null
    
    const totalDist = routeData?.distance || 15000
    const currentDist = userDistance > 0 ? userDistance : ((simulationProgress || 0) * totalDist)
    
    const segment = routeZones.find(s => 
      currentDist >= s.startDistance && currentDist <= s.endDistance
    )
    return segment?.character || routeZones[0]?.character || null
  }, [routeZones, simulationProgress, routeData?.distance, userDistance])
  
  const characterColors = currentCharacter ? CHARACTER_COLORS[currentCharacter] : null
  const characterLabel = currentCharacter ? CHARACTER_LABELS[currentCharacter] : null

  // NEW: Find upcoming highway bend
  const upcomingHighwayBend = useMemo(() => {
    if (!highwayBends?.length) return null
    
    const upcoming = highwayBends
      .filter(bend => {
        const distanceToBend = bend.distanceFromStart - userDistance
        return distanceToBend > 0 && distanceToBend < 800  // Look ahead 800m
      })
      .sort((a, b) => a.distanceFromStart - b.distanceFromStart)
    
    return upcoming[0] || null
  }, [highwayBends, userDistance])

  // NEW: Get next few highway bends for "upcoming" display
  const upcomingHighwayBends = useMemo(() => {
    if (!highwayBends?.length) return []
    
    return highwayBends
      .filter(bend => {
        const distanceToBend = bend.distanceFromStart - userDistance
        return distanceToBend > 0 && distanceToBend < 2000
      })
      .sort((a, b) => a.distanceFromStart - b.distanceFromStart)
      .slice(0, 4)
  }, [highwayBends, userDistance])

  // Calculate route progress
  const routeProgress = useMemo(() => {
    const totalDist = routeData?.distance || 15000
    const currentDist = userDistance > 0 ? userDistance : ((simulationProgress || 0) * totalDist)
    const progress = currentDist / totalDist
    const remainingDist = totalDist - currentDist
    const totalTime = routeData?.duration || 1800
    const remainingTime = totalTime * (1 - progress)
    
    return {
      percent: Math.round(progress * 100),
      remainingDist: isMetric ? Math.round(remainingDist) : Math.round(remainingDist * 3.28084),
      remainingDistUnit: isMetric ? 'm' : 'ft',
      remainingTime: Math.round(remainingTime / 60),
      totalCurves: routeData?.curves?.length || 0,
      curvesPassed: Math.round((routeData?.curves?.length || 0) * progress)
    }
  }, [simulationProgress, routeData, isMetric, userDistance])

  // Elevation data
  const { elevationStats } = useMemo(() => {
    let points = []
    
    if (elevationData?.length > 0) {
      points = elevationData.map(e => e.elevation)
    } else {
      const numPoints = 20
      const baseElev = altitude !== null ? altitude : 50
      for (let i = 0; i < numPoints; i++) {
        const variation = Math.sin(i * 0.5) * 20 + Math.cos(i * 0.3) * 10
        points.push(baseElev + variation)
      }
    }
    
    const minElev = Math.min(...points)
    const maxElev = Math.max(...points)
    const gain = maxElev - minElev
    const currentIdx = Math.min(Math.floor((simulationProgress || 0) * points.length), points.length - 1)
    
    return {
      elevationStats: {
        gain: isMetric ? Math.round(gain) : Math.round(gain * 3.28084),
        current: isMetric ? Math.round(points[currentIdx] || 0) : Math.round((points[currentIdx] || 0) * 3.28084)
      }
    }
  }, [elevationData, altitude, simulationProgress, isMetric])

  const currentSpeedDisplay = isMetric 
    ? Math.round((speed || 0) * 1.609) 
    : Math.round(speed || 0)

  const elevationUnit = isMetric ? 'm' : 'ft'

  if (!isRunning) return null

  const hasNetworkIssue = !isOnline

  // Determine if we're in a highway zone
  const inHighwayZone = currentCharacter === ROUTE_CHARACTER.TRANSIT
  
  // ========================================
  // HIGHWAY HUD - when in transit zone
  // ========================================
  if (inHighwayZone) {
    // If there's an upcoming bend, show it
    if (upcomingHighwayBend) {
      const bend = upcomingHighwayBend
      const distanceToBend = bend.distanceFromStart - userDistance
      const distanceDisplay = isMetric 
        ? Math.round(distanceToBend) 
        : Math.round(distanceToBend * 3.28084)
      
      const bendColor = bend.isSection ? ACTIVE_SECTION_COLOR : HIGHWAY_BEND_COLOR
      const targetSpeed = bend.optimalSpeed || 70
      
      const maxDistance = 500
      const progress = Math.min(100, Math.max(0, ((maxDistance - distanceToBend) / maxDistance) * 100))

    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        {hasNetworkIssue && <StatusWarnings hasNetworkIssue={hasNetworkIssue} />}

        <div className="hud-glass rounded-2xl overflow-hidden">
          {/* Top row: Zone badge + stats */}
          <div className="px-4 pt-2 pb-1 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-2">
              <ZoneBadge colors={CHARACTER_COLORS[ROUTE_CHARACTER.TRANSIT]} label="HIGHWAY" />
            </div>
            <div className="flex items-center gap-4 text-white/40 text-xs">
              <span>{routeProgress.percent}%</span>
              <span>{routeProgress.remainingTime}min</span>
              {settings.showElevation !== false && (
                <span style={{ color: modeColor }}>↑{elevationStats.current}{elevationUnit}</span>
              )}
            </div>
          </div>

          {/* Main highway bend info */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              
              {/* Bend type display */}
              <HighwayBendDisplay bend={bend} color={bendColor} />
              
              {/* Distance and type info */}
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ color: bendColor }}>
                    {bend.isSection ? `${bend.bendCount} bends` : 
                     bend.isSSweep ? 'S-SWEEP' : 
                     `${bend.angle}°`}
                  </span>
                  {bend.isSection && (
                    <span className="text-sm text-white/60">{bend.length}m</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white/50 text-sm">DISTANCE</span>
                  <span className="text-white font-bold">{distanceDisplay}</span>
                  <span className="text-white/40 text-xs">{distanceUnit}</span>
                </div>
                
                {/* Progress bar */}
                <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{ 
                      width: `${progress}%`,
                      background: bendColor
                    }}
                  />
                </div>
              </div>
              
              {/* Speed display */}
              {settings.showSpeedometer !== false ? (
                <div className="text-right pl-2 flex flex-col items-end">
                  <div className="flex items-baseline gap-1">
                    <div 
                      className="text-4xl font-bold tracking-tight leading-none"
                      style={{ 
                        color: currentSpeedDisplay > targetSpeed + 10 ? '#ff3366' : 
                               currentSpeedDisplay < targetSpeed - 10 ? '#22c55e' : 'white',
                        textShadow: '0 0 20px rgba(255,255,255,0.3)'
                      }}
                    >
                      {currentSpeedDisplay}
                    </div>
                    <span className="text-xs text-white/40">{speedUnit}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] text-white/40">TARGET</span>
                    <span className="text-sm font-bold" style={{ color: bendColor }}>{targetSpeed}</span>
                  </div>
                </div>
              ) : (
                <div className="text-right pl-2">
                  <div className="text-3xl font-bold tracking-tight leading-none" style={{ color: bendColor, textShadow: `0 0 20px ${bendColor}30` }}>
                    {targetSpeed}
                  </div>
                  <span className="text-[10px] text-white/40">{speedUnit}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Progress bar at bottom */}
          <div className="px-4 pb-2">
            <ProgressBar 
              percent={routeProgress.percent} 
              modeColor={bendColor}
              compact
            />
          </div>
        </div>

        {/* Upcoming highway bends */}
        {upcomingHighwayBends.length > 1 && (
          <div className="mt-2 hud-glass rounded-xl px-3 py-2 inline-block">
            <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
            <div className="flex flex-col gap-1">
              {upcomingHighwayBends.slice(1, 4).map((next) => (
                <UpcomingHighwayBendRow key={next.id} bend={next} userDistance={userDistance} isMetric={isMetric} />
              ))}
            </div>
          </div>
        )}

        <style>{hudStyles}</style>
      </div>
    )
    }
    
    // Highway zone but no immediate bend - show "clear" state
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        {hasNetworkIssue && <StatusWarnings hasNetworkIssue={hasNetworkIssue} />}
        
        <div className="hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ZoneBadge colors={CHARACTER_COLORS[ROUTE_CHARACTER.TRANSIT]} label="HIGHWAY" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-white/50 text-sm">Clear ahead</span>
            </div>
            {settings.showSpeedometer !== false && (
              <div className="text-right">
                <span className="text-2xl font-bold" style={{ color: HIGHWAY_BEND_COLOR }}>
                  {currentSpeedDisplay}
                </span>
                <span className="text-xs text-white/40 ml-1">{speedUnit}</span>
              </div>
            )}
          </div>
          
          <div className="mt-3">
            <ProgressBar 
              percent={routeProgress.percent} 
              modeColor={HIGHWAY_BEND_COLOR}
              remainingDist={routeProgress.remainingDist}
              remainingDistUnit={routeProgress.remainingDistUnit}
              remainingTime={routeProgress.remainingTime}
            />
          </div>
        </div>

        {/* Show upcoming highway bends if any */}
        {upcomingHighwayBends.length > 0 && (
          <div className="mt-2 hud-glass rounded-xl px-3 py-2 inline-block">
            <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">AHEAD</div>
            <div className="flex flex-col gap-1">
              {upcomingHighwayBends.slice(0, 3).map((next) => (
                <UpcomingHighwayBendRow key={next.id} bend={next} userDistance={userDistance} isMetric={isMetric} />
              ))}
            </div>
          </div>
        )}
        
        <style>{hudStyles}</style>
      </div>
    )
  }

  // ========================================
  // REGULAR CURVE HUD - non-highway zones
  // ========================================
  
  // No curve view
  if (!curve) {
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        {hasNetworkIssue && <StatusWarnings hasNetworkIssue={hasNetworkIssue} />}
        
        <div className="hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-white/50 text-sm">
                {routeMode === 'demo' ? 'Demo Mode' : 'Route Active'}
              </span>
              {characterColors && characterLabel && (
                <ZoneBadge colors={characterColors} label={characterLabel.short} />
              )}
            </div>
            {settings.showSpeedometer !== false && (
              <div className="text-right">
                <span className="text-2xl font-bold" style={{ color: modeColor }}>
                  {currentSpeedDisplay}
                </span>
                <span className="text-xs text-white/40 ml-1">{speedUnit}</span>
              </div>
            )}
          </div>
          
          <div className="mt-3">
            <ProgressBar 
              percent={routeProgress.percent} 
              modeColor={modeColor}
              remainingDist={routeProgress.remainingDist}
              remainingDistUnit={routeProgress.remainingDistUnit}
              remainingTime={routeProgress.remainingTime}
            />
          </div>
        </div>
        
        <style>{hudStyles}</style>
      </div>
    )
  }

  const recommendedSpeed = getRecommendedSpeed(curve)
  const severityColor = getCurveColor(curve.severity)
  
  const distanceDisplay = isMetric 
    ? Math.round(curve.distance) 
    : Math.round(curve.distance * 3.28084)
  
  const maxDistance = 400
  const progress = Math.min(100, Math.max(0, ((maxDistance - curve.distance) / maxDistance) * 100))
  
  const getBrakingZone = (severity) => {
    if (severity <= 2) return { show: false, start: 0 }
    if (severity <= 3) return { show: true, start: 75 }
    if (severity <= 4) return { show: true, start: 60 }
    if (severity <= 5) return { show: true, start: 50 }
    return { show: true, start: 40 }
  }
  
  const brakingZone = getBrakingZone(curve.severity)
  const inBrakingZone = brakingZone.show && progress >= brakingZone.start

  const displayDirection = curve.isChicane ? curve.startDirection : curve.direction
  const isLeft = displayDirection === 'LEFT'

  // Minimal HUD mode
  if (settings.hudStyle === 'minimal') {
    return (
      <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
        <div className="hud-glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {curve.isChicane ? (
                <span className="text-2xl font-bold" style={{ color: severityColor }}>
                  {isLeft ? '←' : '→'}{curve.severitySequence}
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={severityColor} style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}>
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                  <span className="text-2xl font-bold" style={{ color: severityColor }}>{curve.severity}</span>
                </div>
              )}
              <span className="text-lg text-white/60">{distanceDisplay}{distanceUnit}</span>
              {characterColors && characterLabel && (
                <ZoneBadge colors={characterColors} label={characterLabel.short} size="small" />
              )}
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold" style={{ color: modeColor }}>{recommendedSpeed}</span>
              <span className="text-xs text-white/40 ml-1">{speedUnit}</span>
            </div>
          </div>
        </div>
        <style>{hudStyles}</style>
      </div>
    )
  }

  // Full HUD mode
  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
      {hasNetworkIssue && <StatusWarnings hasNetworkIssue={hasNetworkIssue} />}

      <div className="hud-glass rounded-2xl overflow-hidden">
        {/* Top row: Zone badge + stats */}
        <div className="px-4 pt-2 pb-1 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            {characterColors && characterLabel && (
              <ZoneBadge colors={characterColors} label={characterLabel.label} />
            )}
          </div>
          <div className="flex items-center gap-4 text-white/40 text-xs">
            <span>{routeProgress.curvesPassed}/{routeProgress.totalCurves} curves</span>
            <span>{routeProgress.remainingTime}min</span>
            {settings.showElevation !== false && (
              <span style={{ color: modeColor }}>↑{elevationStats.current}{elevationUnit}</span>
            )}
          </div>
        </div>

        {/* Main curve info */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            
            {/* Curve display */}
            {curve.isChicane ? (
              <ChicaneDisplay curve={curve} severityColor={severityColor} isLeft={isLeft} />
            ) : (
              <CurveDisplay curve={curve} severityColor={severityColor} isLeft={isLeft} />
            )}
            
            {/* Distance and severity info */}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold" style={{ color: severityColor }}>
                  {curve.isChicane ? curve.severitySequence : curve.severity}
                </span>
                {curve.modifier && (
                  <span className="text-sm text-white/60 uppercase">{curve.modifier}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-white/50 text-sm">DISTANCE</span>
                <span className="text-white font-bold">{distanceDisplay}</span>
                <span className="text-white/40 text-xs">{distanceUnit}</span>
              </div>
              
              {/* Braking progress bar */}
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${progress}%`,
                    background: inBrakingZone 
                      ? `linear-gradient(90deg, ${severityColor}, #ff3366)` 
                      : severityColor
                  }}
                />
              </div>
              {inBrakingZone && (
                <div className="text-xs font-bold text-red-400 mt-1 animate-pulse">BRAKE</div>
              )}
            </div>
            
            {/* Speed display */}
            {settings.showSpeedometer !== false ? (
              <div className="text-right pl-2 flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                  <div 
                    className="text-4xl font-bold tracking-tight leading-none"
                    style={{ 
                      color: currentSpeedDisplay > recommendedSpeed + 10 ? '#ff3366' : 
                             currentSpeedDisplay < recommendedSpeed - 10 ? '#22c55e' : 'white',
                      textShadow: '0 0 20px rgba(255,255,255,0.3)'
                    }}
                  >
                    {currentSpeedDisplay}
                  </div>
                  <span className="text-xs text-white/40">{speedUnit}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-white/40">TARGET</span>
                  <span className="text-sm font-bold" style={{ color: modeColor }}>{recommendedSpeed}</span>
                </div>
              </div>
            ) : (
              <div className="text-right pl-2">
                <div className="text-3xl font-bold tracking-tight leading-none" style={{ color: modeColor, textShadow: `0 0 20px ${modeColor}30` }}>
                  {recommendedSpeed}
                </div>
                <span className="text-[10px] text-white/40">{speedUnit}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Progress bar at bottom */}
        <div className="px-4 pb-2">
          <ProgressBar 
            percent={routeProgress.percent} 
            modeColor={modeColor}
            compact
          />
        </div>
      </div>

      {/* Upcoming curves */}
      {upcomingCurves.length > 1 && (
        <div className="mt-2 hud-glass rounded-xl px-3 py-2 inline-block">
          <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
          <div className="flex flex-col gap-1">
            {upcomingCurves.slice(1, 4).map((next) => (
              <UpcomingCurveRow key={next.id} curve={next} />
            ))}
          </div>
        </div>
      )}

      <style>{hudStyles}</style>
    </div>
  )
}

// ========================================
// NEW: Highway Bend Display Component
// ========================================
function HighwayBendDisplay({ bend, color }) {
  if (bend.isSection) {
    // Active Section display
    return (
      <div 
        className="px-3 py-2 rounded-xl min-w-[60px]"
        style={{ 
          background: `linear-gradient(135deg, ${color}20, ${color}10)`,
          border: `2px solid ${color}60`,
          boxShadow: `0 0 25px ${color}40`
        }}
      >
        <div className="text-center">
          <span className="text-[10px] font-bold tracking-wider" style={{ color }}>ACTIVE</span>
          <div className="text-xl font-bold" style={{ color }}>{bend.bendCount}</div>
        </div>
      </div>
    )
  }
  
  if (bend.isSSweep) {
    // S-Sweep display
    const dir1 = bend.firstBend?.direction === 'LEFT' ? '←' : '→'
    const dir2 = bend.secondBend?.direction === 'LEFT' ? '←' : '→'
    return (
      <div 
        className="px-3 py-2 rounded-xl"
        style={{ 
          background: `linear-gradient(135deg, ${color}20, ${color}10)`,
          border: `2px solid ${color}60`,
          boxShadow: `0 0 25px ${color}40`
        }}
      >
        <div className="text-center">
          <span className="text-[10px] font-bold tracking-wider" style={{ color }}>S-SWEEP</span>
          <div className="text-lg font-bold" style={{ color }}>{dir1}{dir2}</div>
        </div>
      </div>
    )
  }
  
  // Regular sweeper display
  const isLeft = bend.direction === 'LEFT'
  const dirArrow = isLeft ? '←' : '→'
  
  return (
    <div 
      className="w-14 h-14 rounded-xl flex flex-col items-center justify-center"
      style={{ 
        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
        border: `2px solid ${color}60`,
        boxShadow: `0 0 25px ${color}40`
      }}
    >
      <span className="text-[10px] font-bold" style={{ color }}>SW</span>
      <span className="text-xl font-bold" style={{ color }}>{dirArrow}</span>
    </div>
  )
}

// ========================================
// NEW: Upcoming Highway Bend Row
// ========================================
function UpcomingHighwayBendRow({ bend, userDistance, isMetric }) {
  const distanceToBend = bend.distanceFromStart - userDistance
  const dist = isMetric ? Math.round(distanceToBend) : Math.round(distanceToBend * 3.28084)
  const unit = isMetric ? 'm' : 'ft'
  const color = bend.isSection ? ACTIVE_SECTION_COLOR : HIGHWAY_BEND_COLOR
  
  if (bend.isSection) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}30`, color }}>ACTIVE</span>
        <span className="text-[10px] font-bold" style={{ color }}>{bend.bendCount}</span>
        <span className="text-[10px] text-white/40">{dist}{unit}</span>
      </div>
    )
  }
  
  if (bend.isSSweep) {
    const dir1 = bend.firstBend?.direction === 'LEFT' ? '←' : '→'
    const dir2 = bend.secondBend?.direction === 'LEFT' ? '←' : '→'
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold" style={{ color }}>S{dir1}{dir2}</span>
        <span className="text-[10px] text-white/40">{dist}{unit}</span>
      </div>
    )
  }
  
  const isLeft = bend.direction === 'LEFT'
  const dirArrow = isLeft ? '←' : '→'
  
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold" style={{ color }}>SW{dirArrow}</span>
      <span className="text-[10px]" style={{ color }}>{bend.angle}°</span>
      <span className="text-[10px] text-white/40">{dist}{unit}</span>
    </div>
  )
}

// Zone Badge Component
function ZoneBadge({ colors, label, size = 'normal' }) {
  const padding = size === 'small' ? 'px-1.5 py-0.5' : 'px-2 py-1'
  const fontSize = size === 'small' ? 'text-[8px]' : 'text-[10px]'
  
  return (
    <span 
      className={`${padding} rounded ${fontSize} font-bold tracking-wider`}
      style={{ 
        background: `${colors.primary}25`, 
        color: colors.primary,
        border: `1px solid ${colors.primary}50`
      }}
    >
      {label}
    </span>
  )
}

// Progress Bar Component
function ProgressBar({ percent, modeColor, remainingDist, remainingDistUnit, remainingTime, compact }) {
  if (compact) {
    return (
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: modeColor }}
        />
      </div>
    )
  }
  
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
        <span>{percent}% complete</span>
        {remainingTime !== undefined && (
          <span>{remainingDist?.toLocaleString()}{remainingDistUnit} • {remainingTime}min</span>
        )}
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${modeColor}80, ${modeColor})` }}
        />
      </div>
    </div>
  )
}

// Curve display
function CurveDisplay({ curve, severityColor, isLeft }) {
  return (
    <div 
      className="w-12 h-12 rounded-xl flex items-center justify-center"
      style={{ 
        background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
        border: `1.5px solid ${severityColor}50`,
        boxShadow: `0 0 20px ${severityColor}30`
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill={severityColor} style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}>
        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
      </svg>
    </div>
  )
}

// Chicane display
function ChicaneDisplay({ curve, severityColor, isLeft }) {
  const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
  return (
    <div 
      className="px-3 py-2 rounded-xl"
      style={{ 
        background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
        border: `1.5px solid ${severityColor}50`,
        boxShadow: `0 0 20px ${severityColor}30`
      }}
    >
      <div className="text-center">
        <span className="text-xs font-bold" style={{ color: severityColor }}>{typeLabel}{isLeft ? '←' : '→'}</span>
        <div className="text-lg font-bold" style={{ color: severityColor }}>{curve.severitySequence}</div>
      </div>
    </div>
  )
}

// Upcoming curve row
function UpcomingCurveRow({ curve }) {
  const isMetric = useStore.getState().settings?.units === 'metric'
  const color = getCurveColor(curve.severity)
  const isLeft = curve.isChicane ? curve.startDirection === 'LEFT' : curve.direction === 'LEFT'
  const dist = isMetric ? Math.round(curve.distance) : Math.round(curve.distance * 3.28084)
  const unit = isMetric ? 'm' : 'ft'
  
  if (curve.isChicane) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold" style={{ color }}>{curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}{isLeft ? '←' : '→'}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{curve.severitySequence}</span>
        <span className="text-[10px] text-white/40">{dist}{unit}</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <svg width="10" height="10" viewBox="0 0 24 24" fill={color} style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}>
        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
      </svg>
      <span className="text-sm font-bold" style={{ color }}>{curve.severity}</span>
      <span className="text-[10px] text-white/40">{dist}{unit}</span>
    </div>
  )
}

// Status warnings
function StatusWarnings({ hasNetworkIssue }) {
  if (!hasNetworkIssue) return null
  
  return (
    <div className="mb-2 px-3 py-2 bg-amber-500/20 border border-amber-500/50 rounded-lg">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-amber-400 text-xs font-medium">Offline - using cached data</span>
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

export function getCurveDirection(curve) {
  if (curve.isChicane) return curve.startDirection
  return curve.direction
}
