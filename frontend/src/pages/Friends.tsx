// examai/frontend/src/pages/Friends.tsx
// ─────────────────────────────────────────────────────────────
//  Add to App.tsx:
//    import Friends from './pages/Friends'
//    <Route path="friends" element={<Friends />} />
//  Add to Layout.tsx nav:
//    { to: '/friends', label: 'Guild', icon: '🤝' },
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { socialAPI } from '../api'

interface Friend  { id: number; name: string; rank: string; xp: number; streak_days: number }
interface Request { id: number; requester_id: number; requester_name: string; created_at: string }
interface SearchResult {
  id: number; name: string; rank: string; xp: number; friendship_status: string | null
}

const RANK_COLORS: Record<string, string> = {
  Apprentice: '#8a7060', Knight: '#c0c0c0', Wizard: '#9b59b6', Archmage: '#e8a030',
}
const RANK_ICONS: Record<string, string> = {
  Apprentice: '🗡️', Knight: '⚔️', Wizard: '🔮', Archmage: '👑',
}

function PlayerCard({ id, name, rank, xp, extra, onAction, actionLabel, actionStyle }: {
  id: number; name: string; rank: string; xp: number; extra?: string
  onAction?: () => void; actionLabel?: string; actionStyle?: 'primary' | 'ghost'
}) {
  const navigate = useNavigate()
  const color = RANK_COLORS[rank] ?? '#8a7060'
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div
        onClick={() => navigate(`/profile/${id}`)}
        style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: `linear-gradient(135deg, ${color}30, rgba(155,89,182,0.2))`,
          border: `1.5px solid ${color}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, cursor: 'pointer',
        }}
      >
        {RANK_ICONS[rank] ?? '⚔️'}
      </div>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/profile/${id}`)}>
        <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', fontFamily: 'Syne' }}>{name}</p>
        <p style={{ fontSize: 11, color, fontWeight: 600 }}>
          {rank} · <span style={{ color: 'var(--amber)', fontFamily: 'JetBrains Mono' }}>{xp.toLocaleString()} XP</span>
          {extra && <span style={{ color: 'var(--text3)', marginLeft: 8 }}>{extra}</span>}
        </p>
      </div>
      {onAction && actionLabel && (
        <button onClick={onAction} style={{
          padding: '6px 14px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer',
          border: actionStyle === 'primary' ? '1px solid var(--cyan)' : '1px solid var(--border)',
          background: actionStyle === 'primary' ? 'rgba(0,220,200,0.08)' : 'var(--surface)',
          color: actionStyle === 'primary' ? 'var(--cyan)' : 'var(--text3)',
          transition: 'all 0.15s',
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

export default function Friends() {
  const [friends,  setFriends]  = useState<Friend[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState<number | null>(null)
  const [toast,    setToast]    = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, r] = await Promise.all([socialAPI.friends(), socialAPI.friendRequests()])
      setFriends(f.data)
      setRequests(r.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try { setResults((await socialAPI.searchUsers(query)).data) }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  const sendReq = async (id: number) => {
    setActing(id)
    try {
      await socialAPI.sendFriendRequest(id)
      setResults(r => r.map(u => u.id === id ? { ...u, friendship_status: 'pending' } : u))
      showToast('Friend request sent! ⚔️')
    } catch (e: any) {
      showToast(e?.response?.data?.detail ?? 'Error')
    } finally { setActing(null) }
  }

  const respond = async (reqId: number, action: 'accept' | 'reject') => {
    setActing(reqId)
    try {
      await socialAPI.respondToRequest(reqId, action)
      showToast(action === 'accept' ? 'Friend added! 🤝' : 'Request declined.')
      load()
    } finally { setActing(null) }
  }

  const unfriend = async (friendId: number) => {
    setActing(friendId)
    try {
      await socialAPI.removeFriend(friendId)
      setFriends(f => f.filter(u => u.id !== friendId))
      showToast('Unfriended.')
    } finally { setActing(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680, margin: '0 auto' }}>

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

      {/* Header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '20px 26px',
      }} className="anim-up d-0">
        <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>🤝 Guild</h1>
        <p className="t-secondary" style={{ fontSize: 13 }}>
          {friends.length} companion{friends.length !== 1 ? 's' : ''}
          {requests.length > 0 && ` · `}
          {requests.length > 0 && (
            <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{requests.length} pending</span>
          )}
        </p>
      </div>

      {/* Search */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 20,
      }} className="anim-up d-1">
        <p className="section-label" style={{ marginBottom: 12 }}>Find Players</p>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍  Search by name (min 2 chars)…"
          style={{
            width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
            fontFamily: 'JetBrains Mono', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {searching && (
          <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 10 }}>Searching…</p>
        )}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {results.map(u => {
              const fs = u.friendship_status
              return (
                <PlayerCard
                  key={u.id} id={u.id} name={u.name} rank={u.rank} xp={u.xp}
                  onAction={!fs ? () => sendReq(u.id) : undefined}
                  actionLabel={acting === u.id ? '…' : !fs ? '+ Add' : fs === 'accepted' ? '🤝' : fs === 'pending' ? '⏳' : undefined}
                  actionStyle="primary"
                />
              )
            })}
          </div>
        )}
        {query.length >= 2 && !searching && results.length === 0 && (
          <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 10 }}>No players found for "{query}"</p>
        )}
      </div>

      {/* Pending requests */}
      {requests.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid rgba(232,160,48,0.3)',
          borderRadius: 16, padding: 20,
        }} className="anim-up d-2">
          <p className="section-label" style={{ marginBottom: 12 }}>
            Incoming Requests <span style={{ color: 'var(--amber)' }}>({requests.length})</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map(req => (
              <div key={req.id} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', fontFamily: 'Syne' }}>
                    {req.requester_name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {new Date(req.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => respond(req.id, 'accept')} disabled={acting === req.id} style={{
                    padding: '6px 14px', borderRadius: 9, border: '1px solid var(--green)',
                    background: 'rgba(0,200,100,0.08)', color: 'var(--green)',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  }}>Accept</button>
                  <button onClick={() => respond(req.id, 'reject')} disabled={acting === req.id} style={{
                    padding: '6px 14px', borderRadius: 9, border: '1px solid var(--border)',
                    background: 'var(--surface)', color: 'var(--text3)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 20,
      }} className="anim-up d-3">
        <p className="section-label" style={{ marginBottom: 12 }}>My Guild ({friends.length})</p>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <span className="spin" style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
          </div>
        ) : friends.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>🏰</p>
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>Your guild is empty. Search for players to add!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends
              .sort((a, b) => b.xp - a.xp)
              .map(f => (
                <PlayerCard
                  key={f.id} id={f.id} name={f.name} rank={f.rank} xp={f.xp}
                  extra={`${f.streak_days}🔥`}
                  onAction={() => unfriend(f.id)}
                  actionLabel={acting === f.id ? '…' : 'Remove'}
                  actionStyle="ghost"
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}