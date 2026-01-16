import { useState, useEffect } from 'react'
import { HIGHWAY_MODE } from '../services/highwayModeService'

// ================================
// Loading Screen Component
// Shows progress while preparing route
// ================================

// Fun loading quotes
const LOADING_QUOTES = [
  "The longest journey begins with a single sweeper...",
  "Analyzing every curve so you don't have to...",
  "Teaching AI the racing line...",
  "Calibrating co-driver sass levels...",
  "Mapping the twisties...",
  "Preparing witty remarks...",
  "Studying the road ahead...",
  "Getting the coffee ready...",
  "Checking tire pressures... virtually...",
  "Warming up the pace notes...",
]

// Stage definitions
const STAGES = {
  route: { label: 'Loading route', weight: 5 },
  curves: { label: 'Detecting curves', weight: 10 },
  zones: { label: 'Classifying zones', weight: 15 },
  highway: { label: 'Analyzing highway', weight: 10 },
  callouts: { label: 'Generating callouts', weight: 20 },
  chatter: { label: 'Creating commentary', weight: 35 },
  voices: { label: 'Preparing voices', weight: 5 },
}

export default function LoadingScreen({ 
  stages = {}, 
  mode = HIGHWAY_MODE.BASIC,
  routeData,
  onCancel 
}) {
  const [quote, setQuote] = useState('')
  const [elapsedTime, setElapsedTime] = useState(0)
  
  // Pick random quote on mount and periodically
  useEffect(() => {
    const pickQuote = () => {
      setQuote(LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)])
    }
    pickQuote()
    const interval = setInterval(pickQuote, 8000)
    return () => clearInterval(interval)
  }, [])
  
  // Track elapsed time
  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  
  // Calculate progress
  const calculateProgress = () => {
    let completed = 0
    let total = 0
    
    // Adjust weights based on mode
    const activeStages = { ...STAGES }
    if (mode === HIGHWAY_MODE.BASIC) {
      activeStages.chatter = { ...activeStages.chatter, weight: 0 } // Skip chatter weight
    }
    
    Object.entries(activeStages).forEach(([key, { weight }]) => {
      total += weight
      if (stages[key] === 'complete') {
        completed += weight
      } else if (stages[key] === 'loading') {
        completed += weight * 0.5 // Partial credit for in-progress
      }
    })
    
    return total > 0 ? Math.round((completed / total) * 100) : 0
  }
  
  const progress = calculateProgress()
  
  // Get current stage for display
  const getCurrentStage = () => {
    const stageOrder = ['route', 'curves', 'zones', 'highway', 'callouts', 'chatter', 'voices']
    for (const key of stageOrder) {
      if (stages[key] === 'loading') {
        return { key, ...STAGES[key] }
      }
    }
    // Find first incomplete
    for (const key of stageOrder) {
      if (stages[key] !== 'complete') {
        return { key, ...STAGES[key] }
      }
    }
    return { key: 'voices', label: 'Finalizing...' }
  }
  
  const currentStage = getCurrentStage()
  
  // Estimate remaining time based on route length and mode
  const routeMiles = routeData?.distance ? routeData.distance / 1609.34 : 30
  const baseTime = mode === HIGHWAY_MODE.COMPANION 
    ? Math.max(60, routeMiles * 1.2)  // Companion: ~1-2 min
    : Math.max(15, routeMiles * 0.25)  // Basic: ~15-30 sec
  
  const estimatedRemaining = Math.max(0, Math.round(baseTime - elapsedTime))
  
  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col items-center justify-center p-6">
      {/* Main Content */}
      <div className="w-full max-w-md">
        {/* Title */}
        <h1 className="text-2xl font-light text-white text-center mb-2">
          Preparing Your {mode === HIGHWAY_MODE.COMPANION ? 'Companion' : 'Co-Driver'}
        </h1>
        
        {/* Route info */}
        <p className="text-white/50 text-sm text-center mb-8">
          {routeMiles.toFixed(0)} mile route • {routeData?.curves?.length || '?'} curves
        </p>
        
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                mode === HIGHWAY_MODE.COMPANION 
                  ? 'bg-gradient-to-r from-amber-500 to-amber-400' 
                  : 'bg-gradient-to-r from-cyan-500 to-cyan-400'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm">
            <span className="text-white/60">{progress}%</span>
            <span className="text-white/40">
              {estimatedRemaining > 0 ? `~${formatTime(estimatedRemaining)} remaining` : 'Almost done...'}
            </span>
          </div>
        </div>
        
        {/* Stage Checklist */}
        <div className="bg-white/5 rounded-xl p-4 mb-6">
          <div className="space-y-2">
            {Object.entries(STAGES).map(([key, { label, weight }]) => {
              // Skip chatter stage display for basic mode
              if (key === 'chatter' && mode === HIGHWAY_MODE.BASIC) return null
              
              const status = stages[key]
              const isActive = status === 'loading'
              const isComplete = status === 'complete'
              
              return (
                <div 
                  key={key}
                  className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                    isActive ? 'text-white' : isComplete ? 'text-white/50' : 'text-white/30'
                  }`}
                >
                  <span className="w-5 text-center">
                    {isComplete ? (
                      <span className="text-green-400">✓</span>
                    ) : isActive ? (
                      <span className="inline-block animate-spin">◌</span>
                    ) : (
                      <span className="text-white/20">○</span>
                    )}
                  </span>
                  <span className={isActive ? 'font-medium' : ''}>
                    {label}
                    {isActive && key === 'chatter' && (
                      <span className="text-white/40 ml-2">(this takes a moment)</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        
        {/* Quote */}
        <div className="text-center mb-8">
          <p className="text-white/40 text-sm italic">"{quote}"</p>
        </div>
        
        {/* Elapsed Time */}
        <div className="text-center text-white/30 text-xs">
          Elapsed: {formatTime(elapsedTime)}
        </div>
      </div>
      
      {/* Cancel Button */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute bottom-8 text-white/40 hover:text-white/60 text-sm transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  )
}
