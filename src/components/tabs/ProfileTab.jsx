// Profile Tab - Night Stage Design
// Logbook stats, badges, settings with premium dark aesthetic

import { useMemo } from 'react'
import { colors, fonts, transitions } from '../../styles/theme'

export function ProfileTab({ onNavigateToSettings, logbookStats, recentRoutes = [] }) {
  // Use provided stats or show zeros honestly
  const stats = logbookStats || {
    rank: 'Rookie',
    totalMiles: 0,
    nextRank: 'Road Scout',
    nextRankMiles: 100,
    routeCount: 0,
    totalCurves: 0,
    weekMiles: 0,
    weekChange: null,
  }

  const hasData = stats.routeCount > 0
  const progressPercent = stats.nextRankMiles > 0 ? (stats.totalMiles / stats.nextRankMiles) * 100 : 0
  const milesRemaining = Math.max(0, stats.nextRankMiles - stats.totalMiles)

  // Compute earned badges based on actual achievements
  const earnedBadges = useMemo(() => {
    const badges = []

    // First Drive badge - any route completed
    if (stats.routeCount >= 1) {
      badges.push({
        id: 'first-drive',
        name: 'First Drive',
        icon: 'play',
        earned: true,
      })
    }

    // Night Owl - driven after 9pm (check recent routes)
    const hasNightDrive = recentRoutes?.some(r => {
      if (!r.timestamp) return false
      const hour = new Date(r.timestamp).getHours()
      return hour >= 21 || hour < 5
    })
    if (hasNightDrive) {
      badges.push({
        id: 'night-owl',
        name: 'Night Owl',
        icon: 'moon',
        earned: true,
      })
    }

    // Curve Master - 100+ curves total
    if (stats.totalCurves >= 100) {
      badges.push({
        id: 'curve-master',
        name: 'Curve Master',
        icon: 'zap',
        earned: true,
      })
    }

    // Road Warrior - 10+ routes
    if (stats.routeCount >= 10) {
      badges.push({
        id: 'road-warrior',
        name: 'Road Warrior',
        icon: 'award',
        earned: true,
      })
    }

    // Century Club - 100+ miles
    if (stats.totalMiles >= 100) {
      badges.push({
        id: 'century-club',
        name: 'Century Club',
        icon: 'target',
        earned: true,
      })
    }

    // Explorer - 5+ unique routes
    if (stats.routeCount >= 5) {
      badges.push({
        id: 'explorer',
        name: 'Explorer',
        icon: 'compass',
        earned: true,
      })
    }

    // Early Adopter - always earned
    badges.push({
      id: 'early-adopter',
      name: 'Early Adopter',
      icon: 'star',
      earned: true,
    })

    return badges
  }, [stats, recentRoutes])

  // Available badges that haven't been earned yet
  const availableBadges = useMemo(() => {
    const allBadges = [
      { id: 'first-drive', name: 'First Drive', icon: 'play', condition: '1 route' },
      { id: 'night-owl', name: 'Night Owl', icon: 'moon', condition: 'Drive after 9pm' },
      { id: 'curve-master', name: 'Curve Master', icon: 'zap', condition: '100 curves' },
      { id: 'road-warrior', name: 'Road Warrior', icon: 'award', condition: '10 routes' },
      { id: 'century-club', name: 'Century Club', icon: 'target', condition: '100 miles' },
      { id: 'explorer', name: 'Explorer', icon: 'compass', condition: '5 routes' },
    ]
    const earnedIds = earnedBadges.map(b => b.id)
    return allBadges.filter(b => !earnedIds.includes(b.id))
  }, [earnedBadges])

  // Time ago formatter
  const timeAgo = (timestamp) => {
    if (!timestamp) return ''
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
  }

  // Badge icon component
  const BadgeIcon = ({ type, size = 14 }) => {
    switch (type) {
      case 'moon':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      case 'zap':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      case 'award':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
      case 'target':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
      case 'compass':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
      case 'star':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      case 'play':
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      default:
        return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
    }
  }

  // Glass card style
  const glassCard = {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '16px',
  }

  return (
    <div style={{ padding: '16px 16px 100px', paddingTop: 'calc(env(safe-area-inset-top, 20px) + 8px)' }}>
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
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <span style={{
            fontFamily: fonts.mono,
            fontSize: '10px',
            color: 'rgba(255,255,255,0.4)',
          }}>
            {earnedBadges.length} earned
          </span>
        </div>

        {/* Earned badge items */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {earnedBadges.map(badge => (
            <span
              key={badge.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                background: 'rgba(249,115,22,0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(249,115,22,0.2)',
                fontFamily: fonts.mono,
                fontSize: '10px',
                fontWeight: 500,
                color: colors.accent,
              }}
            >
              <BadgeIcon type={badge.icon} />
              {badge.name}
            </span>
          ))}
        </div>

        {/* Show next badges to earn */}
        {availableBadges.length > 0 && (
          <>
            <p style={{
              fontFamily: fonts.mono,
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.3)',
              marginTop: '12px',
              marginBottom: '8px',
            }}>
              Next to unlock
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {availableBadges.slice(0, 3).map(badge => (
                <span
                  key={badge.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    fontFamily: fonts.mono,
                    fontSize: '10px',
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  <BadgeIcon type={badge.icon} />
                  <span>{badge.name}</span>
                  <span style={{ fontSize: '8px', opacity: 0.6 }}>({badge.condition})</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Recent Activity Card */}
      {recentRoutes?.length > 0 && (
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
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span style={{
              fontFamily: fonts.primary,
              fontSize: '14px',
              fontWeight: 500,
              color: colors.textPrimary,
            }}>
              Recent Activity
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentRoutes.slice(0, 5).map((route, idx) => {
              const miles = route.distance ? Math.round(route.distance / 1609.34) : 0
              return (
                <div
                  key={route.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(249,115,22,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.accent}
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="10" r="3"/>
                      <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 11 8 12 1-1 8-6.6 8-12a8 8 0 0 0-8-8z"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: fonts.primary,
                      fontSize: '13px',
                      fontWeight: 500,
                      color: colors.textPrimary,
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {route.name || route.destination || 'Unknown Route'}
                    </p>
                    <p style={{
                      fontFamily: fonts.mono,
                      fontSize: '10px',
                      color: 'rgba(255,255,255,0.4)',
                      margin: '2px 0 0',
                    }}>
                      {miles} mi · {route.curveCount || 0} curves
                    </p>
                  </div>
                  <span style={{
                    fontFamily: fonts.mono,
                    fontSize: '10px',
                    color: 'rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}>
                    {timeAgo(route.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
