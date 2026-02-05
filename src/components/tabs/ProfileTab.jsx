// Profile Tab - Night Stage Design
// Logbook stats, badges, settings with premium dark aesthetic

import { colors, fonts, transitions } from '../../styles/theme'

export function ProfileTab({ onNavigateToSettings, logbookStats }) {
  // Use provided stats or show zeros honestly
  const stats = logbookStats || {
    rank: 'Rookie',
    totalMiles: 0,
    nextRank: 'Road Scout',
    nextRankMiles: 100,
    routeCount: 0,
    weekMiles: 0,
    weekChange: null,
  }

  const hasData = stats.routeCount > 0
  const progressPercent = stats.nextRankMiles > 0 ? (stats.totalMiles / stats.nextRankMiles) * 100 : 0
  const milesRemaining = stats.nextRankMiles - stats.totalMiles

  // Glass card style
  const glassCard = {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '16px',
  }

  return (
    <div style={{ padding: '24px 16px 100px' }}>
      {/* Profile Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}>
        {/* Avatar */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(255,107,53,0.2) 0%, rgba(255,107,53,0.05) 100%)',
          border: '2px solid rgba(255,107,53,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: fonts.primary,
            fontSize: '24px',
            fontWeight: 600,
            color: colors.accent,
          }}>
            A
          </span>
        </div>
        <div>
          <h2 style={{
            fontFamily: fonts.primary,
            fontSize: '22px',
            fontWeight: 600,
            color: colors.textPrimary,
            margin: 0,
          }}>
            Anton
          </h2>
          <p style={{
            fontFamily: fonts.mono,
            fontSize: '10px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: colors.accent,
            margin: '4px 0 0',
          }}>
            {stats.rank}
          </p>
        </div>
      </div>

      {/* Logbook Card */}
      <div style={{ ...glassCard, marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
        }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.accent}
            strokeWidth="2"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span style={{
            fontFamily: fonts.primary,
            fontSize: '14px',
            fontWeight: 500,
            color: colors.textPrimary,
          }}>
            Logbook
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}>
            <span style={{
              fontFamily: fonts.primary,
              fontSize: '13px',
              color: colors.textPrimary,
            }}>
              {stats.rank}
            </span>
            <span style={{
              fontFamily: fonts.mono,
              fontSize: '11px',
              color: 'rgba(255,255,255,0.4)',
            }}>
              {stats.totalMiles} / {stats.nextRankMiles} mi
            </span>
          </div>
          <div style={{
            height: '6px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(progressPercent, 100)}%`,
              borderRadius: '3px',
              background: `linear-gradient(90deg, ${colors.accent}, #FF8F5C)`,
              transition: transitions.smooth,
            }} />
          </div>
          <p style={{
            fontFamily: fonts.mono,
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
            marginTop: '6px',
          }}>
            {milesRemaining} mi to {stats.nextRank}
          </p>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '12px',
            padding: '12px',
          }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: '9px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              margin: '0 0 4px',
            }}>
              This Week
            </p>
            <p style={{
              fontFamily: fonts.primary,
              fontSize: '18px',
              fontWeight: 600,
              color: colors.textPrimary,
              margin: 0,
            }}>
              {stats.weekMiles} mi
            </p>
            {stats.weekChange && (
              <p style={{
                fontFamily: fonts.mono,
                fontSize: '10px',
                color: '#4ade80',
                margin: '4px 0 0',
              }}>
                {stats.weekChange}
              </p>
            )}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '12px',
            padding: '12px',
          }}>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: '9px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              margin: '0 0 4px',
            }}>
              Total Routes
            </p>
            <p style={{
              fontFamily: fonts.primary,
              fontSize: '18px',
              fontWeight: 600,
              color: colors.textPrimary,
              margin: 0,
            }}>
              {stats.routeCount}
            </p>
          </div>
        </div>
      </div>

      {/* Badges Card */}
      <div style={{ ...glassCard, marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.accent}
            strokeWidth="2"
          >
            <circle cx="12" cy="8" r="7"/>
            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
          </svg>
          <span style={{
            fontFamily: fonts.primary,
            fontSize: '14px',
            fontWeight: 500,
            color: colors.textPrimary,
          }}>
            Badges
          </span>
        </div>

        {/* Badge items */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            fontFamily: fonts.mono,
            fontSize: '10px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.6)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            Night Owl
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            fontFamily: fonts.mono,
            fontSize: '10px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.6)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Repeat Driver
          </span>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            fontFamily: fonts.mono,
            fontSize: '10px',
            fontWeight: 500,
            color: 'rgba(255,255,255,0.6)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Early Adopter
          </span>
        </div>

        <p style={{
          fontFamily: fonts.primary,
          fontSize: '12px',
          color: 'rgba(255,255,255,0.4)',
          marginTop: '12px',
          margin: '12px 0 0',
        }}>
          Complete drives to earn more badges
        </p>
      </div>

      {/* Settings Row */}
      <button
        onClick={onNavigateToSettings}
        style={{
          ...glassCard,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: transitions.smooth,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span style={{
            fontFamily: fonts.primary,
            fontSize: '14px',
            color: colors.textPrimary,
          }}>
            Settings
          </span>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  )
}
