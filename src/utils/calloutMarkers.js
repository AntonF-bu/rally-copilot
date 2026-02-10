// ================================
// Shared Callout Marker Rendering
// Single source of truth for both RoutePreview and Navigation map
// ================================

// Highway marker color matches zone route line (#66B3FF)
const HIGHWAY_MARKER_COLOR = '#66B3FF'

/**
 * Get a short label for a callout marker on the map.
 * e.g. "L42", "HP", "SEQ", "G3". Returns null for transitions (no marker).
 */
export function getCalloutLabel(callout) {
  const text = callout.text || ''
  const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1

  // Grouped callouts — compound labels
  if (isGrouped) {
    if (text.toLowerCase().includes('hairpin')) return text.includes('DOUBLE') ? '2xHP' : 'HP'
    if (text.toLowerCase().includes('chicane')) return 'CHI'
    if (text.toLowerCase().includes('esses')) return 'ESS'
    if (text.includes('HARD')) {
      const match = text.match(/HARD\s+(LEFT|RIGHT)\s+(\d+)/i)
      return match ? `H${match[1][0]}${match[2]}` : 'HRD'
    }
    return `G${callout.groupedFrom.length}`
  }

  // Special types
  if (callout.type === 'wake_up') return '!'
  if (callout.type === 'sequence') return 'SEQ'
  if (callout.type === 'transition') return null

  // Direction + angle from text
  const dirMatch = text.match(/\b(left|right|L|R)\b/i)
  const angleMatch = text.match(/(\d+)/)

  if (dirMatch && angleMatch) return `${dirMatch[1][0].toUpperCase()}${angleMatch[1]}`
  if (angleMatch) return angleMatch[1]
  if (dirMatch) return dirMatch[1][0].toUpperCase()

  return callout.type?.[0]?.toUpperCase() || '•'
}

/**
 * Get the marker color for a callout.
 * Highway zones: #66B3FF (matches route line)
 * Technical/Urban: severity-based (green / orange / red)
 */
export function getCalloutMarkerColor(callout) {
  if (callout.zone === 'transit' || callout.zone === 'highway') {
    return HIGHWAY_MARKER_COLOR
  }

  const angle = parseInt(callout.text?.match(/\d+/)?.[0]) || 0
  if (angle >= 70 || callout.text?.toLowerCase().includes('hairpin')) return '#ef4444'
  if (angle >= 45 || callout.text?.toLowerCase().includes('chicane')) return '#E8622C'
  return '#22c55e'
}

/**
 * Create the HTML element for a callout marker on the map.
 * Returns a DOM element ready for mapboxgl.Marker({ element }),
 * or null for callout types that shouldn't render a marker (e.g. transitions).
 */
export function createCalloutMarkerElement(callout) {
  const label = getCalloutLabel(callout)
  if (label === null) return null

  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  const color = getCalloutMarkerColor(callout)
  const isGrouped = callout.groupedFrom && callout.groupedFrom.length > 1
  const isHighway = callout.zone === 'transit' || callout.zone === 'highway'

  el.innerHTML = `
    <div style="background: ${isHighway ? color + '30' : color}; padding: ${isGrouped ? '4px 12px' : '4px 10px'}; border-radius: ${isGrouped ? '12px' : '6px'}; border: ${isGrouped ? '3px solid #fff' : '2px solid ' + color}; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.4);">
      <span style="font-size:${isGrouped ? '12px' : '11px'}; font-weight:${isGrouped ? '700' : '600'}; color:${isHighway ? color : '#fff'};">${label}</span>
    </div>
  `

  return el
}
