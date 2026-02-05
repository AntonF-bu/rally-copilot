// src/styles/theme.js — Rally Co-Pilot Design System
// SINGLE SOURCE OF TRUTH. Every component imports from here.
// Night Stage v2 — Premium dark aesthetic

// ================================
// COLORS
// ================================
export const colors = {
  // Backgrounds
  bgDeep: '#080B12',
  bgPrimary: '#0B1120',
  bgCard: 'rgba(16, 20, 30, 0.85)',
  bgGlass: 'rgba(16, 20, 30, 0.5)',
  bgNav: 'rgba(18, 18, 26, 0.88)',

  // Brand — Standardized orange #F97316
  accent: '#F97316',
  accentSoft: '#FB923C',
  accentGlow: 'rgba(249, 115, 22, 0.15)',
  accentDim: 'rgba(249, 115, 22, 0.06)',

  // Info/secondary
  cyan: '#00D4FF',
  cyanDim: 'rgba(0, 212, 255, 0.5)',

  // Text hierarchy
  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.35)',
  textDim: 'rgba(255,255,255,0.22)',

  // Borders
  glassBorder: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.08)',
  warmBorder: 'rgba(249,115,22,0.15)',

  // Zone colors (route analysis)
  zones: {
    technical: '#22d3ee',
    transit: '#3b82f6',
    urban: '#f472b6',
  },

  // Difficulty badges
  difficulty: {
    easy:        { bg: 'rgba(76,175,80,0.15)',  text: '#6FCF73', border: 'rgba(76,175,80,0.2)' },
    moderate:    { bg: 'rgba(255,193,7,0.15)',  text: '#FFC107', border: 'rgba(255,193,7,0.2)' },
    hard:        { bg: 'rgba(255,107,53,0.2)',  text: '#FF8B5E', border: 'rgba(255,107,53,0.25)' },
    challenging: { bg: 'rgba(255,107,53,0.2)',  text: '#FF8B5E', border: 'rgba(255,107,53,0.25)' },
    expert:      { bg: 'rgba(244,67,54,0.15)',  text: '#FF6B6B', border: 'rgba(244,67,54,0.2)' },
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

// ================================
// FONTS
// ================================
export const fonts = {
  // Night Stage design system fonts
  primary: "'Sora', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
  // Unified font system - Sora for all UI
  heading: "'Sora', -apple-system, sans-serif",
  body: "'Sora', -apple-system, sans-serif",
}

// ================================
// MAPBOX
// ================================
export const mapboxStyle = 'mapbox://styles/antonflk/cml9m9s1j001401sgggri2ovp'

// ================================
// GLASS EFFECTS
// ================================

// Glass card effect — use for all cards, panels, modals
export const glass = {
  background: colors.bgCard,
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: '16px',
}

// Glass card hover state additions
export const glassHover = {
  borderColor: colors.warmBorder,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(249,115,22,0.06)',
  transform: 'translateY(-2px)',
}

// Smaller glass panel (settings rows, inputs, chips)
export const glassPanel = {
  background: colors.bgGlass,
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: '12px',
}

// ================================
// TYPOGRAPHY STYLES
// ================================

// Section label style ("VIBES", "REGION", etc.)
export const sectionLabel = {
  fontFamily: fonts.mono,
  textTransform: 'uppercase',
  fontSize: '9px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: colors.textMuted,
  marginBottom: '8px',
}

// Page title style
export const pageTitle = {
  fontFamily: fonts.primary,
  fontSize: '24px',
  fontWeight: 700,
  color: colors.textPrimary,
  lineHeight: 1.2,
}

// Page subtitle
export const pageSubtitle = {
  fontFamily: fonts.primary,
  fontSize: '13px',
  fontWeight: 400,
  color: colors.textMuted,
}

// ================================
// COMPONENT STYLES
// ================================

// Gradient divider
export const dividerStyle = {
  height: '1px',
  background: 'linear-gradient(90deg, transparent 0%, rgba(249,115,22,0.1) 30%, rgba(255,255,255,0.03) 70%, transparent 100%)',
}

// Active chip
export const chipActive = {
  background: 'rgba(249,115,22,0.1)',
  border: '1px solid rgba(249,115,22,0.25)',
  color: colors.accent,
  boxShadow: '0 0 12px rgba(249,115,22,0.08)',
}

// Inactive chip
export const chipInactive = {
  background: 'transparent',
  border: `1px solid ${colors.borderLight}`,
  color: colors.textDim,
}

// Toggle colors
export const toggle = {
  activeColor: colors.accent,
  inactiveColor: 'rgba(255,255,255,0.15)',
  thumbColor: '#FFFFFF',
}

// ================================
// TRANSITIONS
// ================================
export const transitions = {
  smooth: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  snappy: 'all 0.15s ease',
  springy: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
}

// ================================
// LAYOUT
// ================================
export const layout = {
  maxWidth: '420px',
  contentPadding: '16px',
  navHeight: '70px',
}
