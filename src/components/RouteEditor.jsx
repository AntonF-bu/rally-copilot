import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore from '../store'
import { getCurveColor } from '../data/routes'
import { detectZones, ZONE_TYPES, ZONE_COLORS, ZONE_BEHAVIORS, createZoneOverride } from '../services/zoneService'

// ================================
// Route Editor - Mission Customization
// Edit curves, zones, add custom callouts
// ================================

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

const CUSTOM_CALLOUT_TYPES = [
  { id: 'caution', label: 'Caution', icon: '⚠️', color: '#f59e0b' },
  { id: 'bump', label: 'Bump', icon: '⬆️', color: '#f97316' },
  { id: 'narrow', label: 'Narrow', icon: '↔️', color: '#ef4444' },
  { id: 'crest', label: 'Blind Crest', icon: '⛰️', color: '#8b5cf6' },
  { id: 'dip', label: 'Dip', icon: '⬇️', color: '#06b6d4' },
  { id: 'slippery', label: 'Slippery', icon: '💧', color: '#3b82f6' },
]

export default function RouteEditor({ onBack, onSave }) {
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const zoneLayersRef = useRef([])
  const [mapContainer, setMapContainer] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  
  const [activeTab, setActiveTab] = useState('curves') // 'curves', 'zones', 'callouts'
  const [selectedItem, setSelectedItem] = useState(null)
  const [isLoadingZones, setIsLoadingZones] = useState(false)
  const [addingCallout, setAddingCallout] = useState(null) // callout type being added
  
  const {
    routeData, settings,
    routeZones, setRouteZones,
    globalZoneOverrides, addGlobalZoneOverride, removeGlobalZoneOverride,
    routeZoneOverrides, addRouteZoneOverride, removeRouteZoneOverride,
    editedCurves, updateEditedCurve, deleteCurve, restoreCurve,
    customCallouts, addCustomCallout, removeCustomCallout,
    clearRouteEdits
  } = useStore()

  const mapContainerRef = useCallback((node) => { if (node) setMapContainer(node) }, [])

  // Get effective curves (original + edits)
  const effectiveCurves = useMemo(() => {
    if (!routeData?.curves) return []
    
    return routeData.curves.map(curve => {
      const edit = editedCurves.find(e => e.id === curve.id)
      if (edit?.isDeleted) return null
      if (edit) return { ...curve, ...edit }
      return curve
    }).filter(Boolean)
  }, [routeData?.curves, editedCurves])

  // Load zones on mount
  useEffect(() => {
    if (routeData?.coordinates && routeZones.length === 0) {
      loadZones()
    }
  }, [routeData?.coordinates])

  const loadZones = async () => {
    if (!routeData?.coordinates) return
    setIsLoadingZones(true)
    try {
      const allOverrides = [...globalZoneOverrides, ...routeZoneOverrides]
      const zones = await detectZones(routeData.coordinates, allOverrides)
      setRouteZones(zones)
    } catch (err) {
      console.error('Zone detection error:', err)
    } finally {
      setIsLoadingZones(false)
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapContainer || !routeData?.coordinates || mapRef.current) return
    
    mapRef.current = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: routeData.coordinates[Math.floor(routeData.coordinates.length / 2)],
      zoom: 11,
      pitch: 0
    })
    
    mapRef.current.on('load', () => {
      setMapLoaded(true)
      addRouteToMap()
      addZonesToMap()
      addMarkersToMap()
    })

    // Click handler for adding callouts
    mapRef.current.on('click', handleMapClick)
    
    return () => {
      markersRef.current.forEach(m => m.remove())
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [mapContainer, routeData])

  // Update zones on map when they change
  useEffect(() => {
    if (mapLoaded && routeZones.length > 0) {
      addZonesToMap()
    }
  }, [routeZones, mapLoaded])

  // Update markers when curves/callouts change
  useEffect(() => {
    if (mapLoaded) {
      addMarkersToMap()
    }
  }, [effectiveCurves, customCallouts, mapLoaded])

  const handleMapClick = (e) => {
    if (!addingCallout) return
    
    const coord = [e.lngLat.lng, e.lngLat.lat]
    
    // Find distance along route for this point
    const distance = findDistanceAlongRoute(coord, routeData.coordinates)
    
    addCustomCallout({
      type: addingCallout,
      position: coord,
      distanceFromStart: distance,
      label: CUSTOM_CALLOUT_TYPES.find(t => t.id === addingCallout)?.label || 'Callout'
    })
    
    setAddingCallout(null)
  }

  const findDistanceAlongRoute = (point, coordinates) => {
    let minDist = Infinity
    let closestIdx = 0
    
    coordinates.forEach((coord, i) => {
      const dist = Math.sqrt(Math.pow(coord[0] - point[0], 2) + Math.pow(coord[1] - point[1], 2))
      if (dist < minDist) {
        minDist = dist
        closestIdx = i
      }
    })
    
    return (closestIdx / coordinates.length) * (routeData?.distance || 15000)
  }

  const addRouteToMap = () => {
    if (!mapRef.current || !routeData?.coordinates) return
    
    // Add route line
    if (!mapRef.current.getSource('route')) {
      mapRef.current.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: routeData.coordinates } }
      })
      mapRef.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 0.8 }
      })
    }
    
    // Fit bounds
    const bounds = routeData.coordinates.reduce((b, c) => b.extend(c), 
      new mapboxgl.LngLatBounds(routeData.coordinates[0], routeData.coordinates[0]))
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 1000 })
  }

  const addZonesToMap = () => {
    if (!mapRef.current || !routeZones.length) return
    
    // Remove old zone layers
    zoneLayersRef.current.forEach(id => {
      if (mapRef.current.getLayer(id)) mapRef.current.removeLayer(id)
      if (mapRef.current.getSource(id)) mapRef.current.removeSource(id)
    })
    zoneLayersRef.current = []
    
    // Add zone overlays
    routeZones.forEach((zone, i) => {
      if (!zone.coordinates?.length) return
      
      const colors = ZONE_COLORS[zone.type] || ZONE_COLORS.rural
      const sourceId = `zone-${i}`
      const fillId = `zone-fill-${i}`
      const lineId = `zone-line-${i}`
      
      // Create a buffer around the route for this zone
      const bufferCoords = createRouteBuffer(zone.coordinates, 0.0008) // ~80m buffer
      
      mapRef.current.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [bufferCoords] } }
      })
      
      // Fill layer
      mapRef.current.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': colors.fill.replace('rgba', 'rgb').replace(/,[^,]+\)/, ')'), 'fill-opacity': 0.15 }
      }, 'route-line')
      
      // Border line
      mapRef.current.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': colors.border, 'line-width': 2, 'line-dasharray': [2, 2] }
      }, 'route-line')
      
      zoneLayersRef.current.push(sourceId, fillId, lineId)
    })
  }

  // Create a polygon buffer around route coordinates
  const createRouteBuffer = (coords, bufferSize) => {
    if (!coords?.length) return []
    
    const left = [], right = []
    
    for (let i = 0; i < coords.length; i++) {
      const curr = coords[i]
      const next = coords[i + 1] || coords[i]
      const prev = coords[i - 1] || coords[i]
      
      // Calculate perpendicular direction
      const dx = next[0] - prev[0]
      const dy = next[1] - prev[1]
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      
      const perpX = -dy / len * bufferSize
      const perpY = dx / len * bufferSize
      
      left.push([curr[0] + perpX, curr[1] + perpY])
      right.push([curr[0] - perpX, curr[1] - perpY])
    }
    
    return [...left, ...right.reverse(), left[0]]
  }

  const addMarkersToMap = () => {
    if (!mapRef.current) return
    
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []
    
    // Add curve markers
    effectiveCurves.forEach(curve => {
      if (!curve.position) return
      const color = getCurveColor(curve.severity)
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      el.className = curve.isEdited ? 'edited-marker' : ''
      
      const editBadge = curve.isEdited ? '<div style="position:absolute;top:-4px;right:-4px;width:8px;height:8px;background:#ffd500;border-radius:50%;"></div>' : ''
      
      if (curve.isChicane) {
        el.innerHTML = `<div style="position:relative;background:#000d;padding:2px 5px;border-radius:5px;border:2px solid ${color};font-size:9px;font-weight:700;color:${color};text-align:center;">${editBadge}${curve.chicaneType === 'CHICANE' ? 'CH' : 'S'}${curve.startDirection === 'LEFT' ? '←' : '→'}<br/>${curve.severitySequence}</div>`
      } else {
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;gap:2px;background:#000d;padding:3px 6px;border-radius:5px;border:2px solid ${color};">${editBadge}<svg width="10" height="10" viewBox="0 0 24 24" fill="${color}" style="transform:${curve.direction === 'LEFT' ? 'scaleX(-1)' : 'none'}"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg><span style="font-size:12px;font-weight:700;color:${color};">${curve.severity}</span></div>`
      }
      
      el.onclick = () => setSelectedItem({ type: 'curve', data: curve })
      markersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(curve.position).addTo(mapRef.current))
    })
    
    // Add custom callout markers
    customCallouts.forEach(callout => {
      const calloutType = CUSTOM_CALLOUT_TYPES.find(t => t.id === callout.type)
      const el = document.createElement('div')
      el.style.cursor = 'pointer'
      el.innerHTML = `<div style="background:${calloutType?.color || '#666'};padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;color:white;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${calloutType?.icon || '📍'} ${callout.label}</div>`
      el.onclick = () => setSelectedItem({ type: 'callout', data: callout })
      markersRef.current.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(callout.position).addTo(mapRef.current))
    })
    
    // Add zone labels
    routeZones.forEach(zone => {
      if (!zone.coordinates?.length) return
      const midIdx = Math.floor(zone.coordinates.length / 2)
      const midPoint = zone.coordinates[midIdx]
      const colors = ZONE_COLORS[zone.type]
      
      const el = document.createElement('div')
      el.innerHTML = `<div style="background:${colors.label}20;border:1px solid ${colors.label};padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;color:${colors.label};text-transform:uppercase;">${zone.isOverride ? '⭐ ' : ''}${zone.type}</div>`
      el.style.cursor = 'pointer'
      el.onclick = () => setSelectedItem({ type: 'zone', data: zone })
      markersRef.current.push(new mapboxgl.Marker({ element: el }).setLngLat(midPoint).addTo(mapRef.current))
    })
  }

  const handleZoneTypeChange = (zone, newType) => {
    const override = createZoneOverride(zone, newType)
    addRouteZoneOverride(override)
    
    // Update local zones
    setRouteZones(routeZones.map(z => 
      z.id === zone.id 
        ? { ...z, type: newType, behavior: ZONE_BEHAVIORS[newType], isOverride: true }
        : z
    ))
    setSelectedItem(null)
  }

  const handleMakeGlobal = (zone) => {
    const override = createZoneOverride(zone, zone.type)
    override.name = `${zone.type} zone` // User can rename
    override.isGlobal = true
    addGlobalZoneOverride(override)
    setSelectedItem(null)
  }

  const handleSaveRoute = () => {
    // Compile all edits into route data
    const savedRoute = {
      ...routeData,
      curves: effectiveCurves,
      customCallouts: customCallouts,
      zoneOverrides: routeZoneOverrides,
      isEdited: true,
      editedAt: Date.now()
    }
    onSave?.(savedRoute)
  }

  const handleResetEdits = () => {
    if (confirm('Reset all edits to this route?')) {
      clearRouteEdits()
      setSelectedItem(null)
    }
  }

  const deletedCount = editedCurves.filter(e => e.isDeleted).length
  const editedCount = editedCurves.filter(e => !e.isDeleted && e.isEdited).length

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-[#0a0a0f] to-transparent p-3 pt-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
            </button>
            <div>
              <h1 className="text-white font-bold text-lg">Route Editor</h1>
              <p className="text-white/50 text-xs">{routeData?.name || 'Editing route'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {(editedCount > 0 || deletedCount > 0 || customCallouts.length > 0) && (
              <button onClick={handleResetEdits} className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium">
                Reset
              </button>
            )}
            <button onClick={handleSaveRoute} className="px-4 py-1.5 rounded-lg bg-cyan-500 text-black text-xs font-bold">
              Save Route
            </button>
          </div>
        </div>

        {/* Edit Stats */}
        {(editedCount > 0 || deletedCount > 0 || customCallouts.length > 0 || routeZoneOverrides.length > 0) && (
          <div className="flex items-center gap-3 mt-2 text-xs">
            {editedCount > 0 && <span className="text-yellow-400">{editedCount} edited</span>}
            {deletedCount > 0 && <span className="text-red-400">{deletedCount} deleted</span>}
            {customCallouts.length > 0 && <span className="text-purple-400">{customCallouts.length} callouts</span>}
            {routeZoneOverrides.length > 0 && <span className="text-amber-400">{routeZoneOverrides.length} zone changes</span>}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="absolute top-32 left-3 z-20">
        <div className="flex flex-col gap-1 bg-black/80 rounded-xl p-1 border border-white/10">
          {[
            { id: 'curves', icon: '↗️', label: 'Curves' },
            { id: 'zones', icon: '🗺️', label: 'Zones' },
            { id: 'callouts', icon: '⚠️', label: 'Callouts' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone Loading Indicator */}
      {isLoadingZones && (
        <div className="absolute top-32 right-3 z-20 bg-black/80 rounded-lg px-3 py-2 border border-white/10 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-white/60">Detecting zones...</span>
        </div>
      )}

      {/* Add Callout Mode Indicator */}
      {addingCallout && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="bg-black/90 rounded-xl p-4 border border-amber-500/50 text-center">
            <p className="text-white font-medium mb-2">Tap on map to place callout</p>
            <p className="text-amber-400 text-sm mb-3">{CUSTOM_CALLOUT_TYPES.find(t => t.id === addingCallout)?.label}</p>
            <button onClick={() => setAddingCallout(null)} className="px-4 py-1.5 bg-white/10 rounded-lg text-white/70 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Bottom Panel - Context Sensitive */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/95 to-transparent pt-8 pb-4 px-3">
        
        {/* Callout Types (when tab is callouts) */}
        {activeTab === 'callouts' && !selectedItem && (
          <div>
            <p className="text-white/50 text-xs mb-2">Tap to add custom callout:</p>
            <div className="grid grid-cols-3 gap-2">
              {CUSTOM_CALLOUT_TYPES.map(type => (
                <button
                  key={type.id}
                  onClick={() => setAddingCallout(type.id)}
                  className="p-2 rounded-lg border text-center transition-all hover:scale-105"
                  style={{ background: `${type.color}20`, borderColor: `${type.color}50` }}
                >
                  <span className="text-lg">{type.icon}</span>
                  <p className="text-xs font-medium mt-1" style={{ color: type.color }}>{type.label}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Zone List (when tab is zones) */}
        {activeTab === 'zones' && !selectedItem && (
          <div>
            <p className="text-white/50 text-xs mb-2">Route zones ({routeZones.length}):</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {routeZones.map((zone, i) => {
                const colors = ZONE_COLORS[zone.type]
                const dist = settings.units === 'metric' 
                  ? `${((zone.endDistance - zone.startDistance) / 1000).toFixed(1)}km`
                  : `${((zone.endDistance - zone.startDistance) / 1609).toFixed(1)}mi`
                return (
                  <button
                    key={zone.id}
                    onClick={() => setSelectedItem({ type: 'zone', data: zone })}
                    className="flex-shrink-0 p-2 rounded-lg border text-left"
                    style={{ background: `${colors.label}15`, borderColor: `${colors.label}40` }}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {zone.isOverride && <span className="text-xs">⭐</span>}
                      <span className="text-xs font-bold uppercase" style={{ color: colors.label }}>{zone.type}</span>
                    </div>
                    <p className="text-white/50 text-[10px]">{dist}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Curve List (when tab is curves) */}
        {activeTab === 'curves' && !selectedItem && (
          <div>
            <p className="text-white/50 text-xs mb-2">Curves ({effectiveCurves.length}) - tap on map to edit:</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {effectiveCurves.slice(0, 15).map(curve => {
                const color = getCurveColor(curve.severity)
                return (
                  <button
                    key={curve.id}
                    onClick={() => {
                      setSelectedItem({ type: 'curve', data: curve })
                      if (mapRef.current && curve.position) {
                        mapRef.current.flyTo({ center: curve.position, zoom: 15, duration: 500 })
                      }
                    }}
                    className="flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center relative"
                    style={{ background: `${color}20`, borderColor: color }}
                  >
                    {curve.isEdited && <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full" />}
                    <span className="font-bold" style={{ color }}>{curve.severity}</span>
                  </button>
                )
              })}
              {effectiveCurves.length > 15 && (
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <span className="text-white/40 text-xs">+{effectiveCurves.length - 15}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected Item Editor */}
        {selectedItem && (
          <SelectedItemEditor
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onUpdateCurve={updateEditedCurve}
            onDeleteCurve={deleteCurve}
            onRestoreCurve={restoreCurve}
            onZoneTypeChange={handleZoneTypeChange}
            onMakeGlobal={handleMakeGlobal}
            onDeleteCallout={removeCustomCallout}
            settings={settings}
          />
        )}
      </div>

      {!mapLoaded && (
        <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-40">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// Selected Item Editor Component
function SelectedItemEditor({ item, onClose, onUpdateCurve, onDeleteCurve, onRestoreCurve, onZoneTypeChange, onMakeGlobal, onDeleteCallout, settings }) {
  const { type, data } = item

  if (type === 'curve') {
    const color = getCurveColor(data.severity)
    const isDeleted = data.isDeleted
    
    return (
      <div className="bg-black/90 rounded-xl border p-3" style={{ borderColor: `${color}50` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold" style={{ background: `${color}20`, border: `2px solid ${color}`, color }}>
              {data.severity}
            </div>
            <div>
              <p className="text-white font-medium">{data.direction} {data.severity}</p>
              <p className="text-white/50 text-xs">{data.modifier || 'Standard curve'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Severity Adjuster */}
        <div className="mb-3">
          <p className="text-white/50 text-xs mb-1">Adjust Severity:</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map(sev => (
              <button
                key={sev}
                onClick={() => onUpdateCurve(data.id, { severity: sev })}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${data.severity === sev ? 'ring-2 ring-white' : ''}`}
                style={{ background: getCurveColor(sev), color: sev <= 2 ? 'black' : 'white' }}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Direction Toggle */}
        <div className="mb-3">
          <p className="text-white/50 text-xs mb-1">Direction:</p>
          <div className="flex gap-2">
            {['LEFT', 'RIGHT'].map(dir => (
              <button
                key={dir}
                onClick={() => onUpdateCurve(data.id, { direction: dir })}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-all ${data.direction === dir ? 'bg-white/20 text-white' : 'bg-white/5 text-white/50'}`}
              >
                {dir === 'LEFT' ? '← Left' : 'Right →'}
              </button>
            ))}
          </div>
        </div>

        {/* Modifier */}
        <div className="mb-3">
          <p className="text-white/50 text-xs mb-1">Modifier:</p>
          <div className="flex gap-1 flex-wrap">
            {[null, 'TIGHTENS', 'OPENS', 'LONG', 'SHARP', 'HAIRPIN'].map(mod => (
              <button
                key={mod || 'none'}
                onClick={() => onUpdateCurve(data.id, { modifier: mod })}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${data.modifier === mod ? 'bg-white/20 text-white' : 'bg-white/5 text-white/50'}`}
              >
                {mod || 'None'}
              </button>
            ))}
          </div>
        </div>

        {/* Delete / Restore */}
        <div className="flex gap-2">
          {isDeleted ? (
            <button onClick={() => onRestoreCurve(data.id)} className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium">
              Restore Curve
            </button>
          ) : (
            <button onClick={() => onDeleteCurve(data.id)} className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium">
              Delete Curve
            </button>
          )}
        </div>
      </div>
    )
  }

  if (type === 'zone') {
    const colors = ZONE_COLORS[data.type]
    const dist = settings.units === 'metric' 
      ? `${((data.endDistance - data.startDistance) / 1000).toFixed(1)}km`
      : `${((data.endDistance - data.startDistance) / 1609).toFixed(1)}mi`

    return (
      <div className="bg-black/90 rounded-xl border p-3" style={{ borderColor: `${colors.label}50` }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              {data.isOverride && <span className="text-amber-400">⭐</span>}
              <p className="text-white font-medium uppercase">{data.type} Zone</p>
            </div>
            <p className="text-white/50 text-xs">{dist} • {data.roadClass || 'Mixed roads'}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Zone Type Selector */}
        <div className="mb-3">
          <p className="text-white/50 text-xs mb-1">Change Zone Type:</p>
          <div className="grid grid-cols-4 gap-1">
            {Object.entries(ZONE_TYPES).map(([key, value]) => {
              const zColors = ZONE_COLORS[value]
              return (
                <button
                  key={value}
                  onClick={() => onZoneTypeChange(data, value)}
                  className={`py-2 rounded text-[10px] font-bold uppercase transition-all ${data.type === value ? 'ring-2 ring-white' : ''}`}
                  style={{ background: `${zColors.label}30`, color: zColors.label }}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </div>

        {/* Behavior Preview */}
        <div className="bg-white/5 rounded-lg p-2 mb-3">
          <p className="text-white/50 text-[10px] mb-1">Zone Behavior:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-white/40">Min Severity:</span> <span className="text-white">{data.behavior?.minSeverity}+</span></div>
            <div><span className="text-white/40">Speed:</span> <span className="text-white">{Math.round((data.behavior?.speedMultiplier || 1) * 100)}%</span></div>
          </div>
        </div>

        {/* Make Global */}
        {!data.isOverride && (
          <button onClick={() => onMakeGlobal(data)} className="w-full py-2 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium">
            ⭐ Save as Global Exception
          </button>
        )}
      </div>
    )
  }

  if (type === 'callout') {
    const calloutType = CUSTOM_CALLOUT_TYPES.find(t => t.id === data.type)
    
    return (
      <div className="bg-black/90 rounded-xl border p-3" style={{ borderColor: `${calloutType?.color}50` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{calloutType?.icon}</span>
            <div>
              <p className="text-white font-medium">{data.label}</p>
              <p className="text-white/50 text-xs">Custom callout</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <button onClick={() => onDeleteCallout(data.id)} className="w-full py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium">
          Delete Callout
        </button>
      </div>
    )
  }

  return null
}
