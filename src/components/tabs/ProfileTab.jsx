// Profile Tab - Night Stage Design
// Logbook stats, badges, settings with premium dark aesthetic

import { useState, useMemo, useCallback } from 'react'
import useStore from '../../store'
import { signOut } from '../../services/authService'
import { updateProfile } from '../../services/authService'
import { supabase } from '../../services/supabase'
import { DISCOVERY_ROUTES } from '../../data/discoveryRoutes'
import { colors, fonts, transitions } from '../../styles/theme'

export function ProfileTab({ onNavigateToSettings, logbookStats, recentRoutes = [] }) {
  // Get profile and user from store
  const profile = useStore((state) => state.profile)
  const user = useStore((state) => state.user)
  const setProfile = useStore((state) => state.setProfile)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editCar, setEditCar] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Seed routes state (temporary)
  const [seedStatus, setSeedStatus] = useState('idle') // idle, seeding, done, error
  const [seedMessage, setSeedMessage] = useState('')

  // Get display values from profile
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Driver'
  const car = profile?.car || ''
  const avatarInitial = displayName.charAt(0).toUpperCase()

  // Use provided stats or show zeros honestly
  const stats = logbookStats || {
    rank: 'Rookie',
    totalMiles: profile?.total_miles || 0,
    nextRank: 'Road Scout',
    nextRankMiles: 100,
    routeCount: profile?.total_drives || 0,
    totalCurves: 0,
    weekMiles: 0,
    weekChange: null,
  }

  const hasData = stats.routeCount > 0
  const progressPercent = stats.nextRankMiles > 0 ? (stats.totalMiles / stats.nextRankMiles) * 100 : 0
  const milesRemaining = Math.max(0, stats.nextRankMiles - stats.totalMiles)

  // Start editing
  const handleStartEdit = () => {
    setEditDisplayName(displayName)
    setEditCar(car)
    setIsEditing(true)
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditDisplayName('')
    setEditCar('')
  }

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!user?.id) return

    setIsSaving(true)
    try {
      const updates = {
        display_name: editDisplayName.trim() || displayName,
        car: editCar.trim(),
      }

      const updatedProfile = await updateProfile(user.id, updates)
      if (updatedProfile) {
        setProfile(updatedProfile)
      }
      setIsEditing(false)
    } catch (error) {
      console.error('🔐 Failed to update profile:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Sign out
  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      // Auth state change will handle the rest
    } catch (error) {
      console.error('🔐 Failed to sign out:', error)
      setIsSigningOut(false)
    }
  }

  // Seed routes (temporary dev function)
  // NOTE: If RLS blocks this, add these policies to your routes table:
  //   CREATE POLICY "Authenticated users can insert routes" ON public.routes FOR INSERT TO authenticated WITH CHECK (true);
  //   CREATE POLICY "Authenticated users can delete routes" ON public.routes FOR DELETE TO authenticated USING (true);
  const handleSeedRoutes = async () => {
    if (!user) return

    setSeedStatus('seeding')
    setSeedMessage('Deleting existing routes...')

    try {
      // Step 1: Delete all existing routes
      const { error: deleteError } = await supabase
        .from('routes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (neq with impossible id)

      if (deleteError) {
        console.error('🗄️ Failed to delete routes:', deleteError)
        throw new Error(`Delete failed: ${deleteError.message}`)
      }

      console.log('🗄️ Deleted existing routes')
      setSeedMessage('Inserting new routes...')

      // Step 2: Map and insert new routes
      const routesToInsert = DISCOVERY_ROUTES.map(route => ({
        slug: route.id,
        name: route.name,
        region: route.region,
        start_lat: route.start.lat,
        start_lng: route.start.lng,
        start_label: route.start.label,
        end_lat: route.end.lat,
        end_lng: route.end.lng,
        end_label: route.end.label,
        waypoints: route.waypoints || [],
        distance_miles: route.distance,
        duration_minutes: route.duration,
        difficulty: route.difficulty,
        tags: route.tags || [],
        description: route.description || '',
        curve_count: route.curveCount || null,
        elevation_gain: route.elevationGain || null,
        is_published: true,
      }))

      const { data, error: insertError } = await supabase
        .from('routes')
        .insert(routesToInsert)
        .select()

      if (insertError) {
        console.error('🗄️ Failed to insert routes:', insertError)
        throw new Error(`Insert failed: ${insertError.message}`)
      }

      console.log(`🗄️ Seeded ${data?.length || 0} routes`)
      setSeedStatus('done')
      setSeedMessage(`Done! ${data?.length || 0} routes seeded`)

      // Reset after 3 seconds
      setTimeout(() => {
        setSeedStatus('idle')
        setSeedMessage('')
      }, 3000)

    } catch (error) {
      console.error('🗄️ Seed failed:', error)
      setSeedStatus('error')
      setSeedMessage(error.message || 'Seeding failed')
    }
  }

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

  // Input style
  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)',
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
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
            {avatarInitial}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontFamily: fonts.primary,
            fontSize: '22px',
            fontWeight: 600,
            color: colors.textPrimary,
            margin: 0,
          }}>
            {displayName}
          </h2>
          {car && (
            <p style={{
              fontFamily: fonts.mono,
              fontSize: '11px',
              color: 'rgba(255,255,255,0.5)',
              margin: '4px 0 0',
            }}>
              {car}
            </p>
          )}
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
        {!isEditing && (
          <button
            onClick={handleStartEdit}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.03)',
              color: 'rgba(255,255,255,0.6)',
              fontFamily: fonts.mono,
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        )}
      </div>

      {/* Edit Profile Section */}
      {isEditing && (
        <div style={{ ...glassCard, marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span style={{
              fontFamily: fonts.primary,
              fontSize: '14px',
              fontWeight: 500,
              color: colors.textPrimary,
            }}>
              Edit Profile
            </span>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{
              fontFamily: fonts.mono,
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              display: 'block',
              marginBottom: '6px',
            }}>
              Display Name
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Your name"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              fontFamily: fonts.mono,
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.4)',
              display: 'block',
              marginBottom: '6px',
            }}>
              Car
            </label>
            <input
              type="text"
              value={editCar}
              onChange={(e) => setEditCar(e.target.value)}
              placeholder="e.g. Miata ND2"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCancelEdit}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.6)',
                fontFamily: fonts.primary,
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: colors.accent,
                color: '#0A0A0F',
                fontFamily: fonts.primary,
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                opacity: isSaving ? 0.7 : 1,
              }}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

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
          marginBottom: '12px',
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

      {/* Seed Routes Button (temporary dev tool) */}
      {user && (
        <button
          onClick={handleSeedRoutes}
          disabled={seedStatus === 'seeding'}
          style={{
            width: '100%',
            padding: '12px 16px',
            marginBottom: '12px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: seedStatus === 'done' ? '#22c55e' : seedStatus === 'error' ? '#ef4444' : 'rgba(255,255,255,0.4)',
            fontFamily: fonts.mono,
            fontSize: '11px',
            fontWeight: 500,
            cursor: seedStatus === 'seeding' ? 'wait' : 'pointer',
            opacity: seedStatus === 'seeding' ? 0.7 : 1,
            textAlign: 'center',
          }}
        >
          {seedStatus === 'idle' && 'Seed Routes (Dev)'}
          {seedStatus === 'seeding' && seedMessage}
          {seedStatus === 'done' && seedMessage}
          {seedStatus === 'error' && seedMessage}
        </button>
      )}

      {/* Sign Out Button */}
      <button
        onClick={handleSignOut}
        disabled={isSigningOut}
        style={{
          ...glassCard,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: 'pointer',
          transition: transitions.smooth,
          border: '1px solid rgba(239,68,68,0.2)',
          opacity: isSigningOut ? 0.7 : 1,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth="2"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span style={{
          fontFamily: fonts.primary,
          fontSize: '14px',
          fontWeight: 500,
          color: '#EF4444',
        }}>
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </span>
      </button>
    </div>
  )
}
