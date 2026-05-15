// examai/frontend/src/pages/Leaderboard.tsx
// ─────────────────────────────────────────────────────────────
//  Add to App.tsx:
//    import Leaderboard from './pages/Leaderboard'
//    <Route path="leaderboard" element={<Leaderboard />} />
//  Add to Layout.tsx nav:
//    { to: '/leaderboard', label: 'Rankings', icon: '🏆' },
// ─────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { socialAPI } from '../api'
import { useAuthStore } from '../store/authStore'

interface Entry {
  rank_position: number
  user_id: number
  name: string
  rank: string
  xp: number
  streak_days: number
  total_correct: number
  accuracy: number
  is_friend: boolean
  is_me: boolean
}

const RANK_COLORS: Record<string, string> = {
  Apprentice: '#8a7060',
  Knight:     '#c0c0c0',
  Wizard:     '#9b59b6',
  Archmage:   '#e8a030',
}
const RANK_ICONS: Record<string, string> = {
  Apprentice: '🗡️', Knight: '⚔️', Wizard: '🔮', Archmage: '👑',
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const navigate = useNavigate()
  const me = useAuthStore(s => s.user)

  const [scope, setScope]     = useState<'global' | 'friends'>('global')
  const [entries, setEntries] = useState<Entry[]>([])
  const [myRank, setMyRank]   = useState<{ rank_position: number; xp: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lb, mr] = await Promise.all([
        socialAPI.leaderboard(scope),
        socialAPI.myRank(),
      ])
      setEntries(lb.data)
      setMyRank(mr.data)
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => { load() }, [load])

  const filtered = entries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  const myEntry = entries.find(e => e.is_me)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '22px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }} className="anim-up d-0">
        <div>
          <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>🏆 Rankings</h1>
          {myRank && (
            <p className="t-secondary" style={{ fontSize: 13 }}>
              You're <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>#{myRank.rank_position}</span> globally
              with <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{myRank.xp} XP</span>
            </p>
          )}
        </div>

        {/* Scope toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['global', 'friends'] as const).map(s => (
            <button key={s} onClick={() => setScope(s)} style={{
              padding: '7px 16px', borderRadius: 10, border: '1px solid',
              borderColor: scope === s ? 'var(--cyan)' : 'var(--border)',
              background: scope === s ? 'rgba(0,220,200,0.08)' : 'var(--surface2)',
              color: scope === s ? 'var(--cyan)' : 'var(--text2)',
              fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.18s',
              textTransform: 'capitalize',
            }}>
              {s === 'global' ? '🌍 Global' : '🤝 Friends'}
            </button>
          ))}
        </div>
      </div>

      {/* Top 3 podium */}
      {!loading && filtered.length >= 3 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10,
        }} className="anim-up d-1">
          {[filtered[1], filtered[0], filtered[2]].map((e, i) => {
            const isCenter = i === 1
            const color = RANK_COLORS[e.rank] ?? '#8a7060'
            return (
              <div key={e.user_id} onClick={() => navigate(`/profile/${e.user_id}`)}
                style={{
                  background: 'var(--surface)', border: `1px solid ${isCenter ? color + '50' : 'var(--border)'}`,
                  borderRadius: 16, padding: '18px 12px', textAlign: 'center',
                  cursor: 'pointer', transition: 'transform 0.18s',
                  transform: isCenter ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: isCenter ? `0 0 20px ${color}20` : 'none',
                  marginTop: isCenter ? 0 : 16,
                }}
                onMouseEnter={el => (el.currentTarget.style.transform = isCenter ? 'scale(1.07)' : 'scale(1.03)')}
                onMouseLeave={el => (el.currentTarget.style.transform = isCenter ? 'scale(1.04)' : 'scale(1)')}
              >
                <div style={{ fontSize: isCenter ? 36 : 28, marginBottom: 6 }}>
                  {MEDAL[e.rank_position - 1] ?? e.rank_position}
                </div>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                  background: `linear-gradient(135deg, ${color}30, rgba(155,89,182,0.2))`,
                  border: `2px solid ${color}50`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>
                  {RANK_ICONS[e.rank] ?? '⚔️'}
                </div>
                <p style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)', marginBottom: 4, fontFamily: 'Syne' }}>
                  {e.name}{e.is_me ? ' (you)' : ''}
                </p>
                <p style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 6 }}>{e.rank}</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--amber)', fontFamily: 'JetBrains Mono' }}>
                  {e.xp.toLocaleString()} XP
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* Search + full table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, overflow: 'hidden',
      }} className="anim-up d-2">
        {/* Search bar */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Search players..."
            style={{
              width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '8px 14px', color: 'var(--text)',
              fontFamily: 'JetBrains Mono', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <span className="spin" style={{ display: 'inline-block', width: 28, height: 28, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['#', 'Player', 'Rank', 'XP', 'Streak', 'Correct', 'Accuracy'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 10,
                      color: 'var(--text3)', fontFamily: 'JetBrains Mono',
                      letterSpacing: '.08em', textTransform: 'uppercase',
                      fontWeight: 700, borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const color = RANK_COLORS[e.rank] ?? '#8a7060'
                  const rowBg = e.is_me
                    ? 'rgba(0,220,200,0.05)'
                    : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                  return (
                    <tr key={e.user_id}
                      onClick={() => navigate(`/profile/${e.user_id}`)}
                      style={{
                        background: rowBg, cursor: 'pointer',
                        transition: 'background 0.12s',
                        outline: e.is_me ? '1px solid rgba(0,220,200,0.2)' : 'none',
                      }}
                      onMouseEnter={el => (el.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                      onMouseLeave={el => (el.currentTarget.style.background = rowBg)}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--text3)', fontWeight: 700 }}>
                        {e.rank_position <= 3 ? MEDAL[e.rank_position - 1] : e.rank_position}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            background: `linear-gradient(135deg, ${color}30, rgba(155,89,182,0.2))`,
                            border: `1.5px solid ${color}50`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          }}>
                            {RANK_ICONS[e.rank] ?? '⚔️'}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Syne' }}>
                              {e.name}
                              {e.is_me && <span style={{ color: 'var(--cyan)', marginLeft: 6, fontSize: 10 }}>you</span>}
                              {e.is_friend && !e.is_me && <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 10 }}>🤝</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color, fontWeight: 700 }}>{e.rank}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--amber)', fontWeight: 800 }}>
                        {e.xp.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--text2)' }}>
                        {e.streak_days}🔥
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--text2)' }}>
                        {e.total_correct}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, background: 'var(--surface2)', borderRadius: 4, minWidth: 60 }}>
                            <div style={{
                              height: '100%', borderRadius: 4,
                              width: `${Math.round(e.accuracy * 100)}%`,
                              background: e.accuracy >= 0.8 ? 'var(--green)' : e.accuracy >= 0.5 ? 'var(--amber)' : 'var(--red)',
                            }} />
                          </div>
                          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--text3)', minWidth: 32 }}>
                            {Math.round(e.accuracy * 100)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontSize: 14 }}>
                {scope === 'friends' ? 'Add some friends to see their ranks here!' : 'No players found.'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* My position callout (if not in top visible) */}
      {myEntry && myEntry.rank_position > 10 && (
        <div style={{
          background: 'rgba(0,220,200,0.06)', border: '1px solid rgba(0,220,200,0.2)',
          borderRadius: 12, padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }} className="anim-up d-3">
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>
            Your position: <span style={{ color: 'var(--cyan)', fontWeight: 800 }}>#{myEntry.rank_position}</span>
          </p>
          <p style={{ color: 'var(--amber)', fontWeight: 800, fontFamily: 'JetBrains Mono', fontSize: 14 }}>
            {myEntry.xp.toLocaleString()} XP
          </p>
        </div>
      )}
    </div>
  )
}