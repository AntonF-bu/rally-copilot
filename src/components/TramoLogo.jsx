// TramoLogo Component
// Tramo Brand Identity System - B3 Smooth Sweep Mark
// A "T" letterform with a racing line flowing through it

import { memo } from 'react'

/**
 * TramoLogo - The official Tramo brand mark
 *
 * Variants:
 * - 'icon': 64x64 app icon with rounded corners and glow
 * - 'header': 32x32 header logo
 * - 'hero': 80x80 large hero usage
 * - 'inline': 24x24 inline with text
 *
 * @param {Object} props
 * @param {'icon' | 'header' | 'hero' | 'inline'} props.variant - Size variant
 * @param {boolean} props.glow - Whether to show glow effect
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 */
function TramoLogo({
  variant = 'header',
  glow = false,
  className = '',
  style = {}
}) {
  // Size configurations for each variant
  const sizes = {
    inline: { container: 24, svg: 16, radius: 6 },
    header: { container: 32, svg: 20, radius: 8 },
    icon: { container: 64, svg: 32, radius: 16 },
    hero: { container: 80, svg: 44, radius: 20 },
  }

  const size = sizes[variant] || sizes.header

  // Container styles
  const containerStyle = {
    width: size.container,
    height: size.container,
    borderRadius: size.radius,
    background: 'linear-gradient(135deg, #E8622C 0%, #F0854E 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(glow && {
      boxShadow: '0 8px 32px rgba(232, 98, 44, 0.4)',
    }),
    ...style,
  }

  return (
    <div style={containerStyle} className={className}>
      <svg
        width={size.svg}
        height={size.svg}
        viewBox="0 0 48 48"
        fill="none"
        aria-label="Tramo Logo"
      >
        {/* The T letterform */}
        <path
          d="M12 10H36V16H28V38H20V16H12V10Z"
          fill="#0A0A0A"
        />
        {/* Racing line - smooth sweep through the T */}
        <path
          d="M8 26C12 22 18 20 24 22C30 24 36 28 42 24"
          stroke="#0A0A0A"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

/**
 * TramoWordmark - Full wordmark with logo and "TRAMO" text
 */
export function TramoWordmark({
  size = 'default',
  className = '',
  style = {}
}) {
  const isLarge = size === 'large'

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: isLarge ? 16 : 12,
    ...style,
  }

  const textStyle = {
    fontFamily: "'Outfit', sans-serif",
    fontSize: isLarge ? 28 : 20,
    fontWeight: 600,
    color: '#FFFFFF',
    letterSpacing: '0.02em',
    margin: 0,
  }

  return (
    <div style={containerStyle} className={className}>
      <TramoLogo variant={isLarge ? 'icon' : 'header'} />
      <span style={textStyle}>TRAMO</span>
    </div>
  )
}

/**
 * TramoTagline - Logo with tagline text
 */
export function TramoTagline({
  tagline = 'Know the road before you see it',
  className = '',
  style = {}
}) {
  const containerStyle = {
    textAlign: 'center',
    ...style,
  }

  const logoContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 16,
  }

  const titleStyle = {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: '#FFFFFF',
    margin: 0,
    marginBottom: 8,
  }

  const taglineStyle = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    margin: 0,
  }

  return (
    <div style={containerStyle} className={className}>
      <div style={logoContainerStyle}>
        <TramoLogo variant="icon" glow />
      </div>
      <h1 style={titleStyle}>Rally Co-Pilot</h1>
      <p style={taglineStyle}>{tagline}</p>
    </div>
  )
}

export default memo(TramoLogo)
