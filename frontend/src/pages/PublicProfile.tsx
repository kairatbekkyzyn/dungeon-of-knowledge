// examai/frontend/src/pages/PublicProfile.tsx
// ─────────────────────────────────────────────────────────────
//  Add to App.tsx:
//    import PublicProfile from './pages/PublicProfile'
//    <Route path="profile/:userId" element={<PublicProfile />} />
//  (The existing /profile route stays for self-profile)
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { socialAPI } from '../api'
import { useAuthStore } from '../store/authStore'

interface ProfileData {
  id: number; name: string; rank: string; xp: number
  streak_days: number; created_at: string
  badges: { key: string; name: string; icon: string; rarity: string; earned_at: string }[]
  total_attempts: number; correct_attempts: number; accuracy: number
  friendship_status: string | null; friendship_id: number | null; is_me: boolean
}

const RANK_COLORS: Record<string, string> = {
  Apprentice: '#8a7060', Knight: '#c0c0c0', Wizard: '#9b59b6', Archmage: '#e8a030',
}
const RANK_ICONS: Record<string, string> = {
  Apprentice: '🗡️', Knight: '⚔️', Wizard: '🔮', Archmage: '👑',
}
const RANKS = [
  { name: 'Apprentice', minXP: 0 },
  { name: 'Knight',     minXP: 500 },
  { name: 'Wizard',     minXP: 1500 },
  { name: 'Archmage',   minXP: 5000 },
]

export default function PublicProfile() {
  const { userId } = useParams<{ userId: string }>()
  const navigate   = useNavigate()
  const me         = useAuthStore(s => s.user)

  const [data, setData]       = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => {
    if (!userId) return
    // If viewing own profile, redirect to the self-profile page
    if (me && Number(userId) === me.id) {
      navigate('/profile', { replace: true })
      return
    }
    setLoading(true)
    socialAPI.publicProfile(Number(userId))
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [userId, me, navigate])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const sendRequest = async () => {
    if (!data) return
    setActing(true)
    try {
      await socialAPI.sendFriendRequest(data.id)
      setData(d => d ? { ...d, friendship_status: 'pending' } : d)
      showToast('Friend request sent! ⚔️')
    } catch (e: any) {
      showToast(e?.response?.data?.detail ?? 'Error')
    } finally { setActing(false) }
  }

  const respond = async (action: 'accept' | 'reject') => {
    if (!data?.friendship_id) return
    setActing(true)
    try {
      await socialAPI.respondToRequest(data.friendship_id, action)
      setData(d => d ? { ...d, friendship_status: action === 'accept' ? 'accepted' : 'rejected' } : d)
      showToast(action === 'accept' ? 'Now friends! 🤝' : 'Request declined.')
    } finally { setActing(false) }
  }

  const unfriend = async () => {
    if (!data) return
    setActing(true)
    try {
      await socialAPI.removeFriend(data.id)
      setData(d => d ? { ...d, friendship_status: null, friendship_id: null } : d)
      showToast('Unfriended.')
    } finally { setActing(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
      <span className="spin" style={{ display: 'inline-block', width: 28, height: 28, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
    </div>
  )
  if (!data) return <p style={{ textAlign: 'center', color: 'var(--text3)', padding: 60 }}>User not found.</p>

  const color   = RANK_COLORS[data.rank] ?? '#8a7060'
  const icon    = RANK_ICONS[data.rank]  ?? '⚔️'
  const rankObj = RANKS.find(r => r.name === data.rank) ?? RANKS[0]
  const nextRk  = RANKS.find(r => r.minXP > data.xp)
  const rangeTotal = nextRk ? nextRk.minXP - rankObj.minXP : 1
  const inRange    = nextRk ? data.xp - rankObj.minXP : rangeTotal
  const pct        = Math.min((inRange / rangeTotal) * 100, 100)

  const fs = data.friendship_status

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '12px 20px',
          fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--text)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}

      {/* Back */}
      <button onClick={() => navigate(-1)} style={{
        alignSelf: 'flex-start', background: 'none', border: 'none',
        color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: 0,
      }}>← Back</button>

      {/* Profile card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden',
      }} className="anim-up d-0">
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 200, height: 200,
          borderRadius: '50%', background: `radial-gradient(circle, ${color}15, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          {/* Avatar */}
          <div style={{
            width: 88, height: 88, borderRadius: 22, flexShrink: 0,
            background: `linear-gradient(135deg, ${color}30, rgba(155,89,182,0.2))`,
            border: `2px solid ${color}50`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42,
            position: 'relative',
          }} className="torch">
            {icon}
            <div style={{
              position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--bg)', border: `1px solid ${color}60`,
              borderRadius: 8, padding: '2px 10px', fontSize: 10, fontWeight: 800,
              color, whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono',
            }}>{data.rank}</div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              <h1 className="h1" style={{ fontSize: 24 }}>{data.name}</h1>

              {/* Friend actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {!fs && (
                  <button onClick={sendRequest} disabled={acting} style={{
                    padding: '7px 16px', borderRadius: 10, border: '1px solid var(--cyan)',
                    background: 'rgba(0,220,200,0.08)', color: 'var(--cyan)',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}>
                    {acting ? '…' : '+ Add Friend'}
                  </button>
                )}
                {fs === 'pending' && (
                  <span style={{
                    padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--text3)', fontSize: 12, fontWeight: 700,
                  }}>⏳ Pending</span>
                )}
                {fs === 'accepted' && (
                  <button onClick={unfriend} disabled={acting} style={{
                    padding: '7px 16px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: 'var(--text3)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                    🤝 Friends · Remove
                  </button>
                )}
                {/* Incoming request to me */}
                {fs === 'pending' && data.friendship_id && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => respond('accept')} disabled={acting} style={{
                      padding: '7px 14px', borderRadius: 10, border: '1px solid var(--green)',
                      background: 'rgba(0,200,100,0.08)', color: 'var(--green)',
                      fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    }}>Accept</button>
                    <button onClick={() => respond('reject')} disabled={acting} style={{
                      padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
                      background: 'var(--surface2)', color: 'var(--text3)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>Decline</button>
                  </div>
                )}
              </div>
            </div>

            {/* XP bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                <span style={{ color, fontWeight: 700 }}>{data.rank}</span>
                {nextRk
                  ? <span>→ {nextRk.name} ({nextRk.minXP - data.xp} XP away)</span>
                  : <span style={{ color: 'var(--amber)' }}>Max rank! 👑</span>
                }
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 6, transition: 'width 0.8s',
                  width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}99)`,
                }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, fontFamily: 'JetBrains Mono' }}>
                {data.xp.toLocaleString()} XP
              </p>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Streak',   value: `${data.streak_days}🔥` },
                { label: 'Accuracy', value: `${Math.round(data.accuracy * 100)}%` },
                { label: 'Answered', value: data.total_attempts },
                { label: 'Correct',  value: data.correct_attempts },
              ].map(s => (
                <div key={s.label}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'JetBrains Mono' }}>{s.value}</p>
                  <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Badges */}
      {data.badges.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 22,
        }} className="anim-up d-1">
          <p className="section-label" style={{ marginBottom: 14 }}>Badges ({data.badges.length})</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px,1fr))', gap: 10 }}>
            {data.badges.map(b => (
              <div key={b.key} style={{
                background: 'rgba(232,160,48,0.06)', border: '1px solid rgba(232,160,48,0.18)',
                borderRadius: 12, padding: '14px 12px', textAlign: 'center',
              }}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 7 }}>{b.icon}</span>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 11, color: 'var(--text)', marginBottom: 4 }}>{b.name}</p>
                <p style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4 }}>
                  {new Date(b.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member since */}
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>
        Member since {new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </p>
    </div>
  )
}