import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Route Preview Screen
// Shows ALL curves on map
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE'

export default function RoutePreview({ onStartNavigation, onBack }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  
  const { routeData, mode } = useStore()

  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  const routeStats = {
    distance: routeData?.distance ? (routeData.distance / 1609.34).toFixed(1) : 0,
    duration: routeData?.duration ? Math.round(routeData.duration / 60) : 0,
    curves: routeData?.curves?.length || 0,
    sharpCurves: routeData?.curves?.filter(c => c.severity >= 4).length || 0
  }

  const severityBreakdown = {
    easy: routeData?.curves?.filter(c => c.severity <= 2).length || 0,
    medium: routeData?.curves?.filter(c => c.severity === 3 || c.severity === 4).length || 0,
    hard: routeData?.curves?.filter(c => c.severity >= 5).length || 0
  }

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
        padding: { top: 100, bottom: 280, left: 40, right: 40 },
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

      // *** ALL CURVE MARKERS ***
      console.log('Adding curve markers:', routeData.curves?.length || 0)
      
      if (routeData.curves && routeData.curves.length > 0) {
        routeData.curves.forEach((curve, index) => {
          const el = document.createElement('div')
          const color = getCurveColor(curve.severity)
          const isLeft = curve.direction === 'LEFT'
          
          console.log(`Curve ${index + 1}: severity ${curve.severity}, position:`, curve.position)
          
          el.innerHTML = `
            <div style="
              display: flex; 
              align-items: center; 
              gap: 2px; 
              background: rgba(10,10,15,0.95); 
              padding: 4px 8px; 
              border-radius: 8px; 
              border: 1.5px solid ${color}; 
              box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            ">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="${color}" style="transform: ${isLeft ? 'scaleX(-1)' : 'none'}">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
              </svg>
              <span style="font-family: -apple-system, system-ui; font-weight: 700; font-size: 12px; color: ${color}">
                ${curve.severity}
              </span>
            </div>
          `
          
          new mapboxgl.Marker({ element: el })
            .setLngLat(curve.position)
            .addTo(map.current)
        })
      }
    })

    return () => { map.current?.remove(); map.current = null }
  }, [routeData, modeColor])

  if (!routeData) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white/50">No route data</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div ref={mapContainer} className="absolute inset-0" />

      <button onClick={onBack} className="absolute top-4 left-4 z-20 hud-glass w-12 h-12 rounded-xl flex items-center justify-center safe-top">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
      </button>

      <div className="absolute bottom-0 left-0 right-0 z-20 safe-bottom">
        <div className="hud-glass rounded-t-3xl p-4 pb-6">
          
          {routeData.destination && (
            <div className="mb-4">
              <div className="text-[10px] font-semibold text-white/40 tracking-wider mb-1">DESTINATION</div>
              <div className="text-white font-semibold text-lg leading-tight truncate">{routeData.destination}</div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{routeStats.distance}</div>
              <div className="text-[10px] text-white/40 tracking-wider">MILES</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{routeStats.duration}</div>
              <div className="text-[10px] text-white/40 tracking-wider">MIN</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-white">{routeStats.curves}</div>
              <div className="text-[10px] text-white/40 tracking-wider">CURVES</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-red-400">{routeStats.sharpCurves}</div>
              <div className="text-[10px] text-white/40 tracking-wider">SHARP</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden flex">
              {severityBreakdown.easy > 0 && <div className="h-full bg-green-500" style={{ width: `${(severityBreakdown.easy / Math.max(1, routeStats.curves)) * 100}%` }}/>}
              {severityBreakdown.medium > 0 && <div className="h-full bg-yellow-500" style={{ width: `${(severityBreakdown.medium / Math.max(1, routeStats.curves)) * 100}%` }}/>}
              {severityBreakdown.hard > 0 && <div className="h-full bg-red-500" style={{ width: `${(severityBreakdown.hard / Math.max(1, routeStats.curves)) * 100}%` }}/>}
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="text-white/40">{severityBreakdown.easy}</span></span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span><span className="text-white/40">{severityBreakdown.medium}</span></span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span><span className="text-white/40">{severityBreakdown.hard}</span></span>
            </div>
          </div>

          <button
            onClick={onStartNavigation}
            className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${modeColor}, ${modeColor}dd)`,
              boxShadow: `0 4px 25px ${modeColor}50, inset 0 1px 0 rgba(255,255,255,0.2)`,
              color: mode === 'race' ? '#fff' : '#000'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            <span>Start Navigation</span>
          </button>
        </div>
      </div>

      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-white/10 border-t-cyan-500 rounded-full animate-spin" />
            <span className="text-white/30 text-sm font-medium tracking-wider">LOADING PREVIEW</span>
          </div>
        </div>
      )}

      <style>{`
        .hud-glass {
          background: linear-gradient(135deg, rgba(15,15,20,0.95) 0%, rgba(10,10,15,0.98) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 -4px 30px rgba(0,0,0,0.5);
        }
      `}</style>
    </div>
  )
}
