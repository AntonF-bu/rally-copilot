// RoutePreview Constants
// Tramo Brand Design - Direct color values

export const DEMO_START = [-71.0589, 42.3601]
export const DEMO_END = [-71.3012, 42.3665]

export const MAP_STYLES = {
  dark: 'mapbox://styles/antonflk/cml9m9s1j001401sgggri2ovp',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
}

export const HIGHWAY_BEND_COLOR = '#3b82f6'

export const MODE_COLORS = {
  cruise: '#E8622C',  // Tramo orange (was cyan)
  fast: '#ffd500',
  race: '#ff3366'
}

export const ZONE_COLORS = {
  technical: '#00E68A',
  transit: '#66B3FF',
  urban: '#FF668C',
}

export const DIFFICULTY_RATINGS = {
  easy:        { label: 'Easy',        color: '#6FCF73', threshold: 2 },
  moderate:    { label: 'Moderate',    color: '#FFC107', threshold: 3 },
  challenging: { label: 'Challenging', color: '#FF8B5E', threshold: 4 },
  expert:      { label: 'Expert',      color: '#FF6B6B', threshold: Infinity }
}

// Speed bases by severity
export const SPEED_BASES = {
  1: 60,
  2: 50,
  3: 40,
  4: 32,
  5: 25,
  6: 18
}

// Mode speed multipliers
export const MODE_MULTIPLIERS = {
  cruise: 1,
  fast: 1.15,
  race: 1.3
}

// Callout type colors
export const CALLOUT_COLORS = {
  danger:      '#ef4444',
  significant: '#f59e0b',
  sweeper:     '#3b82f6',
  wake_up:     '#10b981',
  section:     '#8b5cf6',
  sequence:    '#ec4899',
}
