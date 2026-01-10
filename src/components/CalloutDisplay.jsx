import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Callout Display - Top Overlay
// ================================

export default function CalloutDisplay() {
  const {
    isRunning,
    activeCurve,
    upcomingCurves,
    mode,
    settings,
    getRecommendedSpeed
  } = useStore()

  const curve = activeCurve || upcomingCurves[0]
  
  if (!isRunning || !curve) return null

  const recommendedSpeed = getRecommendedSpeed(curve)
  const color = curve.direction === 'LEFT' ? '#00d4ff' : '#ff6b35'
  const severityColor = getCurveColor(curve.severity)

  return (
    <div className="callout-container safe-top">
      <div className="callout-card">
        <div className="flex items-center justify-between">
          {/* Direction and Severity */}
          <div className="flex items-center gap-4">
            {/* Direction Arrow */}
            <div 
              className="text-5xl font-black"
              style={{ 
                color,
                textShadow: `0 0 20px ${color}50`
              }}
            >
              {curve.direction === 'LEFT' ? '←' : '→'}
            </div>
            
            {/* Severity Number */}
            <div>
              <div 
                className="text-4xl font-black font-display"
                style={{ color: severityColor }}
              >
                {curve.severity}
              </div>
              {curve.modifier && (
                <div 
                  className="text-sm font-semibold tracking-wider"
                  style={{ 
                    color: curve.modifier === 'TIGHTENS' ? '#ff3366' :
                           curve.modifier === 'OPENS' ? '#00ff88' :
                           curve.modifier === 'HAIRPIN' ? '#ff3366' : '#ffd500'
                  }}
                >
                  {curve.modifier}
                </div>
              )}
            </div>
          </div>

          {/* Recommended Speed */}
          <div className="text-right">
            <div 
              className="text-4xl font-bold font-display"
              style={{ color: getModeColor(mode) }}
            >
              {recommendedSpeed}
            </div>
            <div className="text-xs text-gray-400 tracking-wider">
              {settings.speedUnit.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Distance Bar */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>DISTANCE</span>
            <span>{curve.distance}m</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.max(5, 100 - (curve.distance / 3))}%`,
                background: `linear-gradient(90deg, #00ff88, #ffd500, #ff3366)`
              }}
            />
          </div>
        </div>
      </div>

      {/* Sequence Preview (next 2 curves) */}
      {upcomingCurves.length > 1 && (
        <div className="flex gap-2 mt-2">
          {upcomingCurves.slice(1, 3).map((nextCurve, i) => (
            <div 
              key={nextCurve.id}
              className="flex-1 glass rounded-lg px-3 py-2 flex items-center gap-2 opacity-70"
            >
              <span 
                className="font-bold"
                style={{ color: nextCurve.direction === 'LEFT' ? '#00d4ff' : '#ff6b35' }}
              >
                {nextCurve.direction[0]}{nextCurve.severity}
              </span>
              <span className="text-xs text-gray-400">
                {nextCurve.distance}m
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Helper to get mode color
function getModeColor(mode) {
  const colors = {
    cruise: '#00d4ff',
    fast: '#ffd500',
    race: '#ff3366'
  }
  return colors[mode] || colors.cruise
}
