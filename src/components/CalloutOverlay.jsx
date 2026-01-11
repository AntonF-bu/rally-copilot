import { useMemo, useState, useEffect } from 'react'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Racing HUD - v7
// Fixed chicane directions + Technical sections
// ================================

export default function CalloutOverlay() {
  const { 
    isRunning, 
    activeCurve, 
    upcomingCurves, 
    mode, 
    settings, 
    getRecommendedSpeed,
    getSpeedUnit,
    formatDistance,
    simulationProgress,
    routeData,
    routeMode,
    gpsAccuracy,
    altitude,
    speed
  } = useStore()

  const [isOnline, setIsOnline] = useState(true)
  
  // Derived values
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

  const getBrakingZone = (severity) => {
    if (severity <= 2) return { show: false, start: 0 }
    if (severity <= 3) return { show: true, start: 75 }
    if (severity <= 4) return { show: true, start: 60 }
    if (severity <= 5) return { show: true, start: 50 }
    return { show: true, start: 40 }
  }

  // Get current speed in correct units
  const currentSpeedDisplay = isMetric 
    ? Math.round((speed || 0) * 1.609) 
    : Math.round(speed || 0)

  // Elevation in correct units
  const currentElevationDisplay = altitude !== null 
    ? (isMetric ? Math.round(altitude) : Math.round(altitude * 3.28084))
    : null
  const elevationUnit = isMetric ? 'm' : 'ft'

  if (!isRunning) return null

  const hasNetworkIssue = !isOnline

  if (!curve) {
    // Minimal HUD when no curves
    if (settings.hudStyle === 'minimal') {
      return (
        <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
          <div className="hud-glass rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-white/40 text-xs">Clear ahead</span>
              </div>
              {settings.showSpeedometer !== false && (
                <div className="text-right">
                  <span className="text-2xl font-bold" style={{ color: modeColor }}>
                    {currentSpeedDisplay}
                  </span>
                  <span className="text-[10px] text-white/40 ml-1">{speedUnit}</span>
                </div>
              )}
            </div>
          </div>
          <style>{hudStyles}</style>
        </div>
      )
    }

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
              <span className="text-white/30 text-xs">• No curves ahead</span>
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
        </div>
        {settings.showElevation !== false && (
          <ElevationWidget 
            elevationData={elevationData}
            totalElevation={totalElevation}
            currentElevation={currentElevationDisplay}
            elevationPosition={elevationPosition}
            modeColor={modeColor}
            unit={elevationUnit}
          />
        )}
        <style>{hudStyles}</style>
      </div>
    )
  }

  const recommendedSpeed = getRecommendedSpeed(curve)
  const severityColor = getCurveColor(curve.severity)
  const brakingZone = getBrakingZone(curve.severity)
  
  // Convert distance to display units
  const distanceDisplay = isMetric 
    ? Math.round(curve.distance) 
    : Math.round(curve.distance * 3.28084)
  
  const maxDistance = 400
  const progress = Math.min(100, Math.max(0, ((maxDistance - curve.distance) / maxDistance) * 100))
  const inBrakingZone = brakingZone.show && progress >= brakingZone.start

  // FIXED: Use startDirection for chicanes, direction for regular curves
  const displayDirection = curve.isChicane ? curve.startDirection : curve.direction
  const isLeft = displayDirection === 'LEFT'
  
  // Elevation data
  const { elevationData, totalElevation, elevationPosition } = useMemo(() => {
    const numPoints = 20
    const points = []
    const baseElev = altitude !== null ? altitude : 50
    for (let i = 0; i < numPoints; i++) {
      const variation = Math.sin(i * 0.5) * 20 + Math.cos(i * 0.3) * 10
      points.push(baseElev + variation)
    }
    const minElev = Math.min(...points)
    const maxElev = Math.max(...points)
    const pos = Math.min(Math.floor(simulationProgress * numPoints), numPoints - 1)
    const elevRange = isMetric 
      ? Math.round(maxElev - minElev)
      : Math.round((maxElev - minElev) * 3.28084)
    return {
      elevationData: points,
      totalElevation: elevRange,
      elevationPosition: pos
    }
  }, [altitude, simulationProgress, isMetric])

  return (
    <div className="absolute top-0 left-0 right-0 p-3 safe-top z-20 pointer-events-none">
      {hasNetworkIssue && <StatusWarnings hasNetworkIssue={hasNetworkIssue} />}

      <div className="hud-glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-4">
            
            <div className="flex items-center gap-3">
              {curve.isTechnicalSection ? (
                <TechnicalSectionDisplay curve={curve} severityColor={severityColor} isLeft={isLeft} />
              ) : curve.isChicane ? (
                <ChicaneDisplay curve={curve} severityColor={severityColor} isLeft={isLeft} />
              ) : (
                <CurveDisplay curve={curve} severityColor={severityColor} isLeft={isLeft} />
              )}
            </div>

            <div className="flex-1 px-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-white/40 tracking-wider">DISTANCE</span>
                <span className="text-lg font-bold tracking-tight" style={{ color: inBrakingZone ? '#ff3366' : 'white' }}>
                  {distanceDisplay}<span className="text-xs text-white/40 ml-1">{distanceUnit}</span>
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

            {/* Speed Display - Current + Recommended */}
            <div className="text-right pl-2 flex flex-col items-end">
              {/* Current Speed (large) */}
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
              {/* Recommended Speed (small, below) */}
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-white/40">TARGET</span>
                <span 
                  className="text-sm font-bold"
                  style={{ color: modeColor }}
                >
                  {recommendedSpeed}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {upcomingCurves.length > 1 && (
        <div className="absolute top-24 left-3 hud-glass rounded-xl px-3 py-2">
          <div className="text-[8px] font-semibold text-white/30 tracking-wider mb-1">NEXT</div>
          <div className="flex flex-col gap-1">
            {upcomingCurves.slice(1, 4).map((next) => (
              <UpcomingCurveRow key={next.id} curve={next} />
            ))}
          </div>
        </div>
      )}

      {settings.showElevation !== false && (
        <ElevationWidget 
          elevationData={elevationData}
          totalElevation={totalElevation}
          currentElevation={currentElevationDisplay}
          elevationPosition={elevationPosition}
          modeColor={modeColor}
          unit={elevationUnit}
        />
      )}

      <style>{hudStyles}</style>
    </div>
  )
}

// Regular curve display
function CurveDisplay({ curve, severityColor, isLeft }) {
  return (
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
        <div className="text-4xl font-bold tracking-tight leading-none" style={{ color: severityColor, textShadow: `0 0 30px ${severityColor}50` }}>
          {curve.severity}
        </div>
        {curve.modifier && (
          <div className="text-[10px] font-bold tracking-wider mt-0.5" style={{ 
            color: curve.modifier === 'TIGHTENS' ? '#f97316' : curve.modifier === 'OPENS' ? '#22c55e' : severityColor 
          }}>
            {curve.modifier}
          </div>
        )}
      </div>
    </>
  )
}

// Chicane display - FIXED to use startDirection
function ChicaneDisplay({ curve, severityColor, isLeft }) {
  return (
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
        {isLeft ? '←' : '→'} {curve.severitySequence}
      </span>
    </div>
  )
}

// Technical section display
function TechnicalSectionDisplay({ curve, severityColor, isLeft }) {
  const characterLabels = {
    'switchbacks': 'SWITCHBACKS',
    'sweeping': 'SWEEPING',
    'technical': 'TECHNICAL',
    'windy': 'WINDY'
  }
  const label = characterLabels[curve.sectionCharacter] || 'TECHNICAL'
  
  return (
    <div 
      className="px-3 py-2 rounded-xl flex flex-col items-center justify-center"
      style={{ 
        background: `linear-gradient(135deg, ${severityColor}20, ${severityColor}10)`,
        border: `1.5px solid ${severityColor}50`,
        boxShadow: `0 0 20px ${severityColor}30`
      }}
    >
      <span className="text-[9px] font-bold tracking-wider" style={{ color: severityColor }}>
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color: severityColor }}>
        {isLeft ? '←' : '→'} {curve.curveCount} curves
      </span>
      <span className="text-[9px] text-white/50">
        max {curve.severity}
      </span>
    </div>
  )
}

// Upcoming curve row - FIXED directions
function UpcomingCurveRow({ curve }) {
  const nextColor = getCurveColor(curve.severity)
  // FIXED: Use startDirection for chicanes
  const direction = curve.isChicane ? curve.startDirection : curve.direction
  const nextIsLeft = direction === 'LEFT'
  
  if (curve.isTechnicalSection) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold" style={{ color: nextColor }}>
          {nextIsLeft ? '←' : '→'}SEC
        </span>
        <span className="text-sm font-bold" style={{ color: nextColor }}>{curve.curveCount}c</span>
        <span className="text-[10px] text-white/30">{Math.round(curve.distance)}m</span>
      </div>
    )
  }
  
  if (curve.isChicane) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold" style={{ color: nextColor }}>
          {curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}{nextIsLeft ? '←' : '→'}
        </span>
        <span className="text-sm font-bold" style={{ color: nextColor }}>{curve.severitySequence}</span>
        <span className="text-[10px] text-white/30">{Math.round(curve.distance)}m</span>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <svg 
        width="10" height="10" viewBox="0 0 24 24" 
        fill={nextColor}
        style={{ transform: nextIsLeft ? 'scaleX(-1)' : 'none' }}
      >
        <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
      </svg>
      <span className="text-sm font-bold" style={{ color: nextColor }}>{curve.severity}</span>
      {curve.modifier && (
        <span className="text-[8px]" style={{ 
          color: curve.modifier === 'TIGHTENS' ? '#f97316' : curve.modifier === 'OPENS' ? '#22c55e' : nextColor 
        }}>
          {curve.modifier === 'TIGHTENS' ? '⟩' : curve.modifier === 'OPENS' ? '⟨' : ''}
        </span>
      )}
      <span className="text-[10px] text-white/30">{Math.round(curve.distance)}m</span>
    </div>
  )
}

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

function ElevationWidget({ elevationData, totalElevation, currentElevation, elevationPosition, modeColor, unit = 'ft' }) {
  const minElev = Math.min(...elevationData)
  const maxElev = Math.max(...elevationData)
  const range = maxElev - minElev || 1
  
  return (
    <div className="absolute top-24 right-3 hud-glass rounded-xl px-2 py-2 w-[100px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-semibold text-white/30 tracking-wider">ELEV</span>
        <span className="text-[8px] text-white/40">Δ{totalElevation}{unit}</span>
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
        {currentElevation !== null ? `${currentElevation}${unit}` : `-- ${unit}`}
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

// Helper to get correct direction for any curve type
export function getCurveDirection(curve) {
  if (curve.isChicane) return curve.startDirection
  if (curve.isTechnicalSection) return curve.direction
  return curve.direction
}
