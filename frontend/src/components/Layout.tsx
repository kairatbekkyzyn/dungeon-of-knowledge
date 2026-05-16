import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSound } from '../hooks/useSound'

const nav = [
  { to: '/',             label: 'World',    icon: '🗺️' },
  { to: '/forge',        label: 'Forge',    icon: '⚒️' },
  { to: '/monsters',     label: 'Monsters', icon: '👾' },
  { to: '/stats',        label: 'Progress', icon: '📊' },
  { to: '/profile',      label: 'Explorer', icon: '⚔️' },
  { to: '/leaderboard',  label: 'Rankings', icon: '🏆' },
  { to: '/competitions', label: 'Arena',    icon: '⚡' },
  { to: '/friends',      label: 'Guild',    icon: '🤝' },
]

const RANK_COLORS: Record<string,string> = {
  Apprentice:'#8a7060', Knight:'#c0c0c0', Wizard:'#9b59b6', Archmage:'#e8a030'
}

export default function Layout() {
  const { user, logout, theme, toggleTheme } = useAuthStore()
  const navigate = useNavigate()
  const { playSound } = useSound()

  const THEME_NEXT_ICON: Record<string, string>  = { dark:'☀️', light:'🏰', dungeon:'🌙' }
  const THEME_NEXT_LABEL: Record<string, string> = { dark:'Light mode', light:'Dungeon mode', dungeon:'Dark mode' }
  const rank      = user?.rank ?? 'Apprentice'
  const rankColor = RANK_COLORS[rank] ?? '#8a7060'
  const xpInLevel = (user?.xp ?? 0) % 100
  const level     = Math.floor((user?.xp ?? 0) / 100) + 1

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'var(--bg)' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 180, flexShrink: 0, display:'flex', flexDirection:'column',
        background:'var(--surface)', borderRight:'1px solid var(--border)',
      }}>

        {/* Logo + theme */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 14px', borderBottom:'1px solid var(--border)'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:32, height:32, borderRadius:9, flexShrink:0,
              background:'linear-gradient(135deg, var(--cyan), #9b59b6)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:17
            }} className="torch">🏰</div>
            <span style={{
              fontFamily:'Syne', fontSize:17, fontWeight:800,
              color:'var(--text)', letterSpacing:'-0.02em'
            }}>ExamAI</span>
          </div>
          <button onClick={() => { toggleTheme(); playSound('click', 0.65) }}
            title={THEME_NEXT_LABEL[theme]} style={{
              width:30, height:30, borderRadius:8, border:'1px solid var(--border)',
              background:'var(--surface2)', cursor:'pointer', fontSize:14,
              display:'flex', alignItems:'center', justifyContent:'center'
            }}>
            {THEME_NEXT_ICON[theme]}
          </button>
        </div>

        {/* Explorer card */}
        <div style={{
          margin:'10px 10px 0',
          background:'var(--surface2)', border:'1px solid var(--border)',
          borderRadius:12, padding:12
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:34, height:34, borderRadius:10, flexShrink:0,
              background:`linear-gradient(135deg, ${rankColor}30, rgba(155,89,182,0.2))`,
              border:`1.5px solid ${rankColor}50`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:17
            }}>⚔️</div>
            <div style={{ minWidth:0 }}>
              <p style={{
                color:'var(--text)', fontSize:13, fontWeight:700,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'
              }}>{user?.name}</p>
              <p style={{ fontSize:11, color: rankColor, fontWeight:600 }}>{rank}</p>
            </div>
          </div>
          <div style={{ marginTop:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text3)', marginBottom:4 }}>
              <span>Lv {level}</span>
              <span style={{ fontFamily:'JetBrains Mono' }}>{xpInLevel}/100</span>
            </div>
            <div style={{ height:5, background:'var(--surface)', borderRadius:4, overflow:'hidden', border:'1px solid var(--border)' }}>
              <div style={{
                height:'100%', borderRadius:4,
                background:`linear-gradient(90deg, var(--cyan), #9b59b6)`,
                width:`${xpInLevel}%`, transition:'width 0.8s'
              }}/>
            </div>
          </div>
          {(user?.streak_days ?? 0) > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8, fontSize:12, color:'#fb923c' }}>
              🔥 <span>{user?.streak_days}d streak</span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display:'flex', flexDirection:'column', gap:3, padding:'10px 8px', flex:1, overflowY:'auto' }}>
          {nav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              onClick={() => playSound('click', 0.45)}
              style={({ isActive }) => ({
                display:'flex', flexDirection:'column', alignItems:'center',
                justifyContent:'center', gap:4, padding:'10px 6px',
                borderRadius:12, textDecoration:'none', transition:'all 0.18s',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(232,160,48,0.15), rgba(155,89,182,0.1))'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(232,160,48,0.25)'
                  : '1px solid transparent',
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{
                    fontSize:28, lineHeight:1,
                    opacity: isActive ? 1 : 0.5,
                    transition:'all 0.18s',
                    filter: isActive ? 'drop-shadow(0 0 6px rgba(232,160,48,0.5))' : 'none'
                  }}>{icon}</span>
                  <span style={{
                    fontFamily:'Manrope', fontSize:12, fontWeight:700,
                    letterSpacing:'0.02em', textAlign:'center',
                    color: isActive ? 'var(--cyan)' : 'var(--text)',
                    opacity: isActive ? 1 : 0.6,
                    transition:'all 0.18s',
                  }}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding:'8px 8px 14px', borderTop:'1px solid var(--border)' }}>
          <button onClick={() => { logout(); navigate('/login'); playSound('click', 0.7) }} style={{
            width:'100%', display:'flex', alignItems:'center', gap:8,
            padding:'10px 12px', borderRadius:9, border:'none', cursor:'pointer',
            background:'transparent', color:'var(--text2)', fontSize:13,
            fontFamily:'Manrope', fontWeight:600, transition:'all 0.15s'
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='var(--surface2)'; el.style.color='var(--text)' }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color='var(--text2)' }}>
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex:1, overflowY:'auto', background:'var(--bg)' }}>
        <div style={{ width:'100%', maxWidth:1200, margin:'0 auto', padding:'32px 40px', boxSizing:'border-box' }} className="anim-up">
          <Outlet />
        </div>
      </main>
    </div>
  )
}