// TramoLogo Component
// Tramo Brand Identity System - White T with racing line cut and orange glow

import { memo, useId } from 'react'

/**
 * TramoLogo - The official Tramo brand mark
 * White T letterform with sigmoid curve cut (negative space) and orange glow line
 *
 * @param {Object} props
 * @param {number} props.size - Size in pixels (default 48)
 * @param {string} props.bgColor - Background color for the cut stroke (default "#0a0a0a")
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 */
function TramoLogo({
  size = 48,
  bgColor = '#0a0a0a',
  className = '',
  style = {}
}) {
  // Unique ID for gradient to avoid conflicts when multiple logos render
  const uniqueId = useId()
  const gradientId = `tramo-glow-${uniqueId}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 130 130"
      fill="none"
      className={className}
      style={style}
      aria-label="Tramo Logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E8622C" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#E8622C" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#E8622C" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {/* T shape - white */}
      <rect x="22" y="26" width="86" height="10" rx="5" fill="#ffffff" />
      <rect x="54" y="26" width="22" height="80" rx="5" fill="#ffffff" />
      {/* Curve cut (negative space) - uses background color */}
      <path
        d="M10 16 C45 16, 85 114, 120 114"
        stroke={bgColor}
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      {/* Orange glow line */}
      <path
        d="M10 16 C45 16, 85 114, 120 114"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * TramoWordmark - Full wordmark with logo and "TRAMO" text
 */
export function TramoWordmark({
  size = 'default',
  bgColor = '#0a0a0a',
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
      <TramoLogo size={isLarge ? 48 : 32} bgColor={bgColor} />
      <span style={textStyle}>TRAMO</span>
    </div>
  )
}

/**
 * TramoTagline - Logo with tagline text
 */
export function TramoTagline({
  tagline = 'Know the road before you see it',
  bgColor = '#0a0a0a',
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
        <TramoLogo size={64} bgColor={bgColor} />
      </div>
      <h1 style={titleStyle}>Tramo</h1>
      <p style={taglineStyle}>{tagline}</p>
    </div>
  )
}

export default memo(TramoLogo)
