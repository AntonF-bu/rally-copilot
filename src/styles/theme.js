// src/styles/theme.js — Rally Co-Pilot Design System
// SINGLE SOURCE OF TRUTH. Every component imports from here.

export const colors = {
  // Backgrounds
  bgDeep: '#060A13',
  bgPrimary: '#0B1120',
  bgCard: 'rgba(16, 22, 38, 0.7)',
  bgGlass: 'rgba(16, 22, 38, 0.5)',

  // Brand
  accent: '#FF6B35',        // Rally orange — primary brand/action color
  accentSoft: '#FF8B5E',
  accentGlow: 'rgba(255, 107, 53, 0.15)',
  accentDim: 'rgba(255, 107, 53, 0.06)',

  // Info/secondary
  cyan: '#00D4FF',
  cyanDim: 'rgba(0, 212, 255, 0.5)',

  // Text hierarchy
  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.42)',
  textMuted: 'rgba(255,255,255,0.22)',

  // Borders
  glassBorder: 'rgba(255,255,255,0.05)',
  warmBorder: 'rgba(255,107,53,0.06)',

  // Zone colors (route analysis)
  zones: {
    technical: '#22d3ee',
    transit: '#3b82f6',
    urban: '#f472b6',
  },

  // Difficulty badges
  difficulty: {
    easy:        { bg: 'rgba(76,175,80,0.12)',  text: '#6FCF73', border: 'rgba(76,175,80,0.1)' },
    moderate:    { bg: 'rgba(255,107,53,0.15)',  text: '#FF8B5E', border: 'rgba(255,107,53,0.15)' },
    challenging: { bg: 'rgba(255,107,53,0.2)',   text: '#FF8B5E', border: 'rgba(255,107,53,0.2)' },
    expert:      { bg: 'rgba(255,59,59,0.12)',   text: '#FF6B6B', border: 'rgba(255,59,59,0.1)' },
  },

  // Callout severity markers on map
  callouts: {
    danger:      '#ef4444',
    significant: '#f59e0b',
    sweeper:     '#3b82f6',
    wake_up:     '#10b981',
    section:     '#8b5cf6',
    sequence:    '#ec4899',
  },

  // Highway bend markers
  highwayBend: '#3b82f6',
}

export const fonts = {
  heading: "'Barlow Condensed', sans-serif",
  body: "'Barlow', -apple-system, sans-serif",
}

// Glass card effect — use for all cards, panels, modals
export const glass = {
  background: colors.bgCard,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: '12px',
}

// Glass card hover state additions
export const glassHover = {
  borderColor: 'rgba(255,107,53,0.15)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,107,53,0.06)',
  transform: 'translateY(-2px)',
}

// Smaller glass panel (settings rows, inputs, chips)
export const glassPanel = {
  background: colors.bgGlass,
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: '8px',
}

// Section label style ("REGION", "EDITOR'S PICK", etc.)
export const sectionLabel = {
  fontFamily: fonts.heading,
  textTransform: 'uppercase',
  fontSize: '10px',
  fontWeight: 400,
  letterSpacing: '0.2em',
  color: colors.textMuted,
  marginBottom: '10px',
}

// Page title style
export const pageTitle = {
  fontFamily: fonts.heading,
  textTransform: 'uppercase',
  fontSize: '28px',
  fontWeight: 300,
  letterSpacing: '0.14em',
  color: colors.textPrimary,
  lineHeight: 1.1,
}

// Gradient divider
export const dividerStyle = {
  height: '1px',
  background: 'linear-gradient(90deg, transparent 0%, rgba(255,107,53,0.1) 30%, rgba(255,255,255,0.03) 70%, transparent 100%)',
}

// Active chip
export const chipActive = {
  background: 'rgba(255,107,53,0.1)',
  borderColor: 'rgba(255,107,53,0.25)',
  color: colors.accentSoft,
  boxShadow: '0 0 16px rgba(255,107,53,0.05)',
}

// Inactive chip
export const chipInactive = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.35)',
}

// Toggle colors
export const toggle = {
  activeColor: colors.accent,
  inactiveColor: 'rgba(255,255,255,0.15)',
  thumbColor: '#FFFFFF',
}

// Transition presets
export const transitions = {
  smooth: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  snappy: 'all 0.15s ease',
  springy: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
}
