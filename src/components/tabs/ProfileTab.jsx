// Profile Tab - Tramo Brand Identity
// Drive stats, history, and account management

import { useState, useEffect, useCallback } from 'react'
import useStore from '../../store'
import { signOut, updateProfile } from '../../services/authService'
import { supabase } from '../../services/supabase'
import { DISCOVERY_ROUTES } from '../../data/discoveryRoutes'
import { fetchDriverStats, fetchDriveLogs } from '../../services/driveLogService'

export function ProfileTab({ onNavigateToSettings }) {
  // Get profile and user from store
  const profile = useStore((state) => state.profile)
  const user = useStore((state) => state.user)
  const setProfile = useStore((state) => state.setProfile)

  // Stats and drives from database
  const [driverStats, setDriverStats] = useState({ totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 })
  const [driveLogs, setDriveLogs] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editCar, setEditCar] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Seed routes state (temporary)
  const [seedStatus, setSeedStatus] = useState('idle')
  const [seedMessage, setSeedMessage] = useState('')

  // Get display values from profile
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Driver'
  const car = profile?.car || ''
  const avatarInitial = displayName.charAt(0).toUpperCase()

  // Load stats and drive history on mount
  useEffect(() => {
    if (!user?.id) {
      setLoadingStats(false)
      return
    }

    const loadData = async () => {
      setLoadingStats(true)
      try {
        const [stats, logs] = await Promise.all([
          fetchDriverStats(user.id),
          fetchDriveLogs(user.id, 20),
        ])
        setDriverStats(stats)
        setDriveLogs(logs)
      } catch (error) {
        console.error('🗄️ Failed to load profile data:', error)
      } finally {
        setLoadingStats(false)
      }
    }

    loadData()
  }, [user?.id])

  // Format date for drive card
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

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
    } catch (error) {
      console.error('🔐 Failed to sign out:', error)
      setIsSigningOut(false)
    }
  }

  // Seed routes (temporary dev function)
  const handleSeedRoutes = async () => {
    if (!user) return

    setSeedStatus('seeding')
    setSeedMessage('Deleting existing routes...')

    try {
      const { error: deleteError } = await supabase
        .from('routes')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (deleteError) {
        throw new Error(`Delete failed: ${deleteError.message}`)
      }

      setSeedMessage('Inserting new routes...')

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
        is_published: true,
      }))

      const { data, error: insertError } = await supabase
        .from('routes')
        .insert(routesToInsert)
        .select()

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message}`)
      }

      console.log(`🗄️ Seeded ${data?.length || 0} routes`)
      setSeedStatus('done')
      setSeedMessage(`Done! ${data?.length || 0} routes seeded`)

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

  return (
    <div style={styles.container}>
      {/* Profile Header */}
      <div style={styles.header}>
        <div style={styles.avatarContainer}>
          <span style={styles.avatarInitial}>{avatarInitial}</span>
        </div>
        <div style={styles.headerInfo}>
          <h1 style={styles.displayName}>{displayName}</h1>
          {car && <p style={styles.carLabel}>{car}</p>}
        </div>
        {!isEditing && (
          <button onClick={handleStartEdit} style={styles.editButton}>
            Edit
          </button>
        )}
      </div>

      {/* Edit Profile Section */}
      {isEditing && (
        <div style={styles.card}>
          <span style={styles.cardLabel}>EDIT PROFILE</span>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Display Name</label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Your name"
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Car</label>
            <input
              type="text"
              value={editCar}
              onChange={(e) => setEditCar(e.target.value)}
              placeholder="e.g. Miata ND2"
              style={styles.input}
            />
          </div>
          <div style={styles.buttonRow}>
            <button onClick={handleCancelEdit} disabled={isSaving} style={styles.cancelButton}>
              Cancel
            </button>
            <button onClick={handleSaveProfile} disabled={isSaving} style={styles.saveButton}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : Math.round(driverStats.totalMiles)}
          </span>
          <span style={styles.statLabel}>MILES</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : driverStats.totalDrives}
          </span>
          <span style={styles.statLabel}>DRIVES</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : driverStats.uniqueRoutes}
          </span>
          <span style={styles.statLabel}>ROUTES</span>
        </div>
      </div>

      {/* Drive History Section */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>DRIVE HISTORY</span>

        {loadingStats ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Loading drives...</p>
          </div>
        ) : driveLogs.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No drives yet. Hit the road!</p>
          </div>
        ) : (
          <div style={styles.driveList}>
            {driveLogs.map((drive) => {
              const routeName = drive.routes?.name || 'Free Drive'
              const notes = drive.notes ? JSON.parse(drive.notes) : {}

              return (
                <div key={drive.id} style={styles.driveCard}>
                  <div style={styles.driveHeader}>
                    <span style={styles.driveName}>{routeName}</span>
                    <span style={styles.driveDate}>{formatDate(drive.started_at)}</span>
                  </div>
                  <div style={styles.driveStats}>
                    <span style={styles.driveStat}>
                      {drive.distance_miles?.toFixed(1) || '0'} mi
                    </span>
                    <span style={styles.driveStatDivider}>-</span>
                    <span style={styles.driveStat}>
                      {drive.duration_minutes || 0}m
                    </span>
                    <span style={styles.driveStatDivider}>-</span>
                    <span style={styles.driveStat}>
                      {drive.max_speed_mph?.toFixed(0) || '0'} mph max
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Account Section */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>ACCOUNT</span>

        {/* Settings Button */}
        {onNavigateToSettings && (
          <button onClick={onNavigateToSettings} style={styles.menuButton}>
            <div style={styles.menuButtonContent}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888888" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span style={styles.menuButtonText}>Settings</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666666" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}

        {/* Seed Routes (Dev) */}
        {user && (
          <button
            onClick={handleSeedRoutes}
            disabled={seedStatus === 'seeding'}
            style={{
              ...styles.devButton,
              color: seedStatus === 'done' ? '#22c55e' : seedStatus === 'error' ? '#ef4444' : '#666666',
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
            ...styles.signOutButton,
            opacity: isSigningOut ? 0.7 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>{isSigningOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
      </div>

      {/* Bottom spacer for tab bar */}
      <div style={{ height: '100px' }} />
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100%',
    background: '#0A0A0A',
    padding: '16px',
    paddingTop: 'calc(env(safe-area-inset-top, 20px) + 16px)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  },
  avatarContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(232, 98, 44, 0.2) 0%, rgba(232, 98, 44, 0.05) 100%)',
    border: '2px solid rgba(232, 98, 44, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '24px',
    fontWeight: 300,
    color: '#E8622C',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '24px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  carLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    color: '#888888',
    margin: 0,
    marginTop: '4px',
  },
  editButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: '#111111',
    color: '#888888',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    flexShrink: 0,
  },
  card: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
  },
  cardLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    display: 'block',
    marginBottom: '16px',
  },
  inputGroup: {
    marginBottom: '12px',
  },
  inputLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#666666',
    display: 'block',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: '#0A0A0A',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: 'transparent',
    color: '#888888',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '36px',
    color: '#FFFFFF',
    lineHeight: 1,
    letterSpacing: '0.02em',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    marginTop: '6px',
  },
  section: {
    marginBottom: '24px',
  },
  sectionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    display: 'block',
    marginBottom: '12px',
  },
  emptyState: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '32px 16px',
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#666666',
    margin: 0,
  },
  driveList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  driveCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '12px',
  },
  driveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '6px',
  },
  driveName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#FFFFFF',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingRight: '12px',
  },
  driveDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
    flexShrink: 0,
  },
  driveStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  driveStat: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#888888',
  },
  driveStatDivider: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#333333',
  },
  menuButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    cursor: 'pointer',
    marginBottom: '10px',
  },
  menuButtonContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  menuButtonText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#FFFFFF',
  },
  devButton: {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid #1A1A1A',
    background: 'transparent',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'center',
    marginBottom: '10px',
  },
  signOutButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '14px 16px',
    background: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#ef4444',
  },
}
