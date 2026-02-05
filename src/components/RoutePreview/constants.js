// RoutePreview Constants
import { colors, mapboxStyle } from '../../styles/theme'

export const DEMO_START = [-71.0589, 42.3601]
export const DEMO_END = [-71.3012, 42.3665]

export const MAP_STYLES = {
  dark: mapboxStyle,
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
}

export const HIGHWAY_BEND_COLOR = colors.highwayBend

export const MODE_COLORS = {
  cruise: colors.cyan,
  fast: '#ffd500',
  race: '#ff3366'
}

export const ZONE_COLORS = colors.zones

export const DIFFICULTY_RATINGS = {
  easy:        { label: 'Easy',        color: colors.difficulty.easy.text,        threshold: 2 },
  moderate:    { label: 'Moderate',    color: colors.difficulty.moderate.text,    threshold: 3 },
  challenging: { label: 'Challenging', color: colors.difficulty.challenging.text, threshold: 4 },
  expert:      { label: 'Expert',      color: colors.difficulty.expert.text,      threshold: Infinity }
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
export const CALLOUT_COLORS = colors.callouts
