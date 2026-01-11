import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { useSpeech } from '../hooks/useSpeech'

// ================================
// Route Preview Screen
// v4: Pre-downloads audio for offline use
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function RoutePreview({ onStartNavigation, onBack }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  
  // Download states
  const [downloadState, setDownloadState] = useState('idle') // idle, downloading, ready, error
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0, cached: 0 })
  
  const { routeData, mode } = useStore()
  const { preloadRouteAudio, getCacheStatus, initAudio } = useSpeech()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  const routeStats = {
    distance: routeData?.distance ? (routeData.distance / 1609.34).toFixed(1) : 0,
    duration: routeData?.duration ? Math.round(routeData.duration / 60) : 0,
    curves: routeData?.curves?.length || 0,
    sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0,
    chicanes: routeData?.curves?.filter(c => c.isChicane).length || 0
  }

  const severityBreakdown = {
    easy: routeData?.curves?.filter(c => c.severity <= 2).length || 0,
    medium: routeData?.curves?.filter(c => c.severity === 3 || c.severity === 4).length || 0,
    hard: routeData?.curves?.filter(c => c.severity >= 5).length || 0
  }

  // Initialize map
  useEffect(() => {
    if (map.current || !routeData?.coordinates) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: routeData.coordinates[0],
      zoom: 10,
      pitch: 0,
      bearing: 0,
      antialias: true,
      interactive: true
    })

    map.current.on('load', () => {
      setMapLoaded(true)

      map.current.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeData.coordinates }
        }
      })

      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': modeColor, 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.4 }
      })

      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': modeColor, 'line-width': 4, 'line-opacity': 1 }
      })

      const bounds = routeData.coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord)
      }, new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))

      map.current.fitBounds(bounds, {
        padding: { top: 100, bottom: 380, left: 40, right: 40 },
        duration: 1000
      })

      // Start marker
      const startEl = document.createElement('div')
      startEl.innerHTML = `<div style="width: 24px; height: 24px; background: #22c55e; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 10px rgba(34,197,94,0.5);"></div>`
      new mapboxgl.Marker({ element: startEl }).setLngLat(routeData.coordinates[0]).addTo(map.current)

      // End marker
      const endEl = document.createElement('div')
      endEl.innerHTML = `<div style="width: 24px; height: 24px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 10px rgba(239,68,68,0.5);"></div>`
      new mapboxgl.Marker({ element: endEl }).setLngLat(routeData.coordinates[routeData.coordinates.length - 1]).addTo(map.current)

      // Curve markers
      if (routeData.curves) {
        routeData.curves.forEach((curve) => {
          const color = getCurveColor(curve.severity)
          const el = document.createElement('div')
          
          if (curve.isChicane) {
            const dirChar = curve.startDirection === 'LEFT' ? '←' : '→'
            const typeLabel = curve.chicaneType === 'CHICANE' ? 'CH' : 'S'
            el.innerHTML = `
              <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.85);padding:4px 8px;border-radius:8px;border:2px solid ${color};box-shadow:0 2px 10px ${color}40;">
                <span style="font-size:8px;font-weight:700;color:${color};letter-spacing:0.5px;">${typeLabel}${dirChar}</span>
                <span style="font-size:12px;font-weight:700;color:${color};">${curve.severitySequence}</span>
              </div>
            `
          } else {
            const isLeft = curve.direction === 'LEFT'
            let modifierBadge = ''
            if (curve.modifier === 'TIGHTENS') modifierBadge = '<div style="font-size:7px;color:#f97316;font-weight:700;margin-top:1px;">⟩</div>'
            else if (curve.modifier === 'OPENS') modifierBadge = '<div style="font-size:7px;color:#22c55e;font-weight:700;margin-top:1px;">⟨</div>'
            
            el.innerHTML = `
              <div style="display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.85);padding:4px 8px;border-radius:8px;border:2px solid ${color};box-shadow:0 2px 10px ${color}40;">
                <div style="display:flex;align-items:center;gap:2px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="${color}" style="transform:${isLeft ? 'scaleX(-1)' : 'none'}">
                    <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                  </svg>
                  <span style="font-size:14px;font-weight:700;color:${color};">${curve.severity}</span>
                </div>
                ${modifierBadge}
              </div>
            `
          }
          
          new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(curve.position)
            .addTo(map.current)
        })
      }
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [routeData, modeColor])

  // Handle download for offline
  const handleDownloadAudio = async () => {
    if (!routeData?.curves || routeData.curves.length === 0) {
      setDownloadState('ready')
      return
    }

    setDownloadState('downloading')
    
    try {
      const result = await preloadRouteAudio(routeData.curves, (current, total, cached) => {
        setDownloadProgress({ current, total, cached: cached || 0 })
      })

      if (result.success) {
        setDownloadState('ready')
      } else {
        setDownloadState('error')
      }
    } catch (err) {
      console.error('Download error:', err)
      setDownloadState('error')
    }
  }

  // Start navigation (with or without download)
  const handleStart = async () => {
    // Initialize audio on user interaction (required for iOS)
    await initAudio()
    onStartNavigation()
  }

  // Skip download and start anyway
  const handleSkipAndStart = async () => {
    await initAudio()
    onStartNavigation()
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Back Button */}
      <button
        onClick={onBack}
        className="absolute top-12 left-4 z-20 w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M19 12H5m0 0l7 7m-7-7l7-7"/>
        </svg>
      </button>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent pt-16 pb-6 px-4">
          
          {/* Route Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{routeStats.distance}</div>
              <div className="text-[10px] text-white/40 tracking-wider">MILES</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{routeStats.duration}</div>
              <div className="text-[10px] text-white/40 tracking-wider">MIN</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-white">{routeStats.curves}</div>
              <div className="text-[10px] text-white/40 tracking-wider">CURVES</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-red-400">{routeStats.sharpCurves}</div>
              <div className="text-[10px] text-white/40 tracking-wider">SHARP</div>
            </div>
          </div>

          {/* Severity Breakdown */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden flex">
              <div className="bg-green-500 h-full" style={{ width: `${(severityBreakdown.easy / routeStats.curves) * 100 || 0}%` }} />
              <div className="bg-yellow-500 h-full" style={{ width: `${(severityBreakdown.medium / routeStats.curves) * 100 || 0}%` }} />
              <div className="bg-red-500 h-full" style={{ width: `${(severityBreakdown.hard / routeStats.curves) * 100 || 0}%` }} />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-white/40 mb-4">
            <span>{severityBreakdown.easy} Easy</span>
            <span>{severityBreakdown.medium} Medium</span>
            <span>{severityBreakdown.hard} Hard</span>
            {routeStats.chicanes > 0 && <span>{routeStats.chicanes} Chicanes</span>}
          </div>

          {/* Download / Start Section */}
          {downloadState === 'idle' && (
            <div className="space-y-2">
              {/* Main Start Button */}
              <button
                onClick={handleSkipAndStart}
                className="w-full py-4 rounded-xl font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2"
                style={{ background: modeColor }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                START NAVIGATION
              </button>
              
              {/* Optional Download Button */}
              {navigator.onLine && routeStats.curves > 0 && (
                <button
                  onClick={handleDownloadAudio}
                  className="w-full py-3 rounded-xl font-medium text-sm tracking-wider transition-all flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white/60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download voice for offline (optional)
                </button>
              )}
            </div>
          )}

          {downloadState === 'downloading' && (
            <div className="space-y-3">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/70">Downloading voice callouts...</span>
                  <span className="text-sm text-white/50">
                    {downloadProgress.current}/{downloadProgress.total}
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-white/30 mt-2">
                  This ensures voice works even without cell signal
                </p>
              </div>
            </div>
          )}

          {downloadState === 'ready' && (
            <div className="space-y-2">
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <div>
                  <div className="text-sm font-semibold text-green-400">Ready for Offline</div>
                  <div className="text-[10px] text-white/40">
                    {downloadProgress.cached || getCacheStatus().cachedCount} callouts downloaded
                  </div>
                </div>
              </div>
              
              <button
                onClick={handleStart}
                className="w-full py-4 rounded-xl font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2"
                style={{ background: modeColor }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                START NAVIGATION
              </button>
            </div>
          )}

          {downloadState === 'error' && (
            <div className="space-y-2">
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>
                  <div className="text-sm font-semibold text-red-400">Download Failed</div>
                  <div className="text-[10px] text-white/40">
                    Voice will fall back to device speaker when offline
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadAudio}
                  className="flex-1 py-3 rounded-xl font-bold text-sm tracking-wider bg-white/10 border border-white/20 text-white"
                >
                  Retry
                </button>
                <button
                  onClick={handleStart}
                  className="flex-1 py-3 rounded-xl font-bold text-sm tracking-wider"
                  style={{ background: modeColor }}
                >
                  Start Anyway
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">Loading route preview...</p>
          </div>
        </div>
      )}
    </div>
  )
}
