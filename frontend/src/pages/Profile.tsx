import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { quizzesAPI, statsAPI } from '../api'

interface Badge { key:string; name:string; description:string; icon:string; earned:boolean; earned_at?:string }
interface Stats  { total_attempts:number; correct_attempts:number; overall_accuracy:number; streak_days:number }

const RANKS = [
  { name:'Apprentice', minXP:0,    icon:'🗡️',  color:'#8a7060' },
  { name:'Knight',     minXP:500,  icon:'⚔️',  color:'#c0c0c0' },
  { name:'Wizard',     minXP:1500, icon:'🔮',  color:'#9b59b6' },
  { name:'Archmage',   minXP:5000, icon:'👑',  color:'#e8a030' },
]

function currentRank(xp: number) {
  return [...RANKS].reverse().find(r => xp >= r.minXP) ?? RANKS[0]
}
function nextRank(xp: number) {
  return RANKS.find(r => r.minXP > xp) ?? null
}

export default function Profile() {
  const user = useAuthStore(s => s.user)
  const [badges, setBadges]   = useState<Badge[]>([])
  const [stats,  setStats]    = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([quizzesAPI.badges(), statsAPI.get()])
      .then(([b, s]) => { setBadges(b.data); setStats(s.data) })
      .finally(() => setLoading(false))
  }, [])

  const xp       = user?.xp ?? 0
  const rank     = currentRank(xp)
  const next     = nextRank(xp)
  const earned   = badges.filter(b => b.earned)
  const accuracy = stats ? Math.round(stats.overall_accuracy * 100) : 0

  const xpToNext    = next ? next.minXP - xp : 0
  const xpInRange   = next ? xp - rank.minXP : xp - rank.minXP
  const rangeTotal  = next ? next.minXP - rank.minXP : 1
  const rankPct     = next ? Math.min((xpInRange / rangeTotal) * 100, 100) : 100

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'80px 0' }}>
      <span className="spin" style={{ display:'inline-block', width:28, height:28, border:'2px solid var(--border2)', borderTopColor:'var(--cyan)', borderRadius:'50%' }}/>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20, maxWidth:680, margin:'0 auto' }}>

      {/* Character card */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:20, padding:28, position:'relative', overflow:'hidden'
      }} className="anim-up d-0">
        <div style={{
          position:'absolute', top:-30, right:-30, width:200, height:200,
          borderRadius:'50%', background:`radial-gradient(circle, ${rank.color}15, transparent 70%)`,
          pointerEvents:'none'
        }}/>

        <div style={{ display:'flex', gap:24, alignItems:'flex-start', position:'relative', zIndex:1 }}>
          {/* Avatar */}
          <div style={{
            width:88, height:88, borderRadius:22, flexShrink:0,
            background:`linear-gradient(135deg, ${rank.color}30, rgba(155,89,182,0.2))`,
            border:`2px solid ${rank.color}50`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:42,
            position:'relative'
          }} className="torch">
            {rank.icon}
            <div style={{
              position:'absolute', bottom:-10, left:'50%', transform:'translateX(-50%)',
              background:'var(--bg)', border:`1px solid ${rank.color}60`,
              borderRadius:8, padding:'2px 10px', fontSize:10, fontWeight:800,
              color: rank.color, whiteSpace:'nowrap', fontFamily:'JetBrains Mono'
            }}>{rank.name}</div>
          </div>

          <div style={{ flex:1 }}>
            <h1 className="h1" style={{ fontSize:24, marginBottom:4 }}>{user?.name}</h1>
            <p className="t-secondary" style={{ fontSize:13, marginBottom:12 }}>{user?.email}</p>

            {/* Rank progress */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text2)', marginBottom:6 }}>
                <span style={{ color: rank.color, fontWeight:700 }}>{rank.name}</span>
                {next && <span style={{ color: RANKS[RANKS.indexOf(rank)+1]?.color }}>{next.name} — {xpToNext} XP away</span>}
                {!next && <span style={{ color:'var(--amber)' }}>Max rank achieved!</span>}
              </div>
              <div style={{ height:6, background:'rgba(255,255,255,0.05)', borderRadius:6, overflow:'hidden' }}>
                <div style={{
                  height:'100%', borderRadius:6, transition:'width 0.8s',
                  width:`${rankPct}%`, background:`linear-gradient(90deg, ${rank.color}, ${rank.color}99)`
                }}/>
              </div>
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:4, fontFamily:'JetBrains Mono' }}>
                {xp} XP total
              </p>
            </div>

            {/* Quick stats row */}
            <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              {[
                { label:'Streak',    value:`${user?.streak_days ?? 0}🔥` },
                { label:'Accuracy',  value:`${accuracy}%` },
                { label:'Answered',  value: stats?.total_attempts ?? 0 },
                { label:'Badges',    value: earned.length },
              ].map(s => (
                <div key={s.label}>
                  <p style={{ fontSize:16, fontWeight:800, color:'var(--text)', fontFamily:'JetBrains Mono' }}>{s.value}</p>
                  <p style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* All ranks roadmap */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:16, padding:22
      }} className="anim-up d-1">
        <p className="section-label" style={{ marginBottom:14 }}>Rank Progression</p>
        <div style={{ display:'flex', gap:0, position:'relative' }}>
          {/* connector line */}
          <div style={{
            position:'absolute', top:22, left:22, right:22, height:2,
            background:'var(--border)', zIndex:0
          }}/>
          {RANKS.map((r, i) => {
            const unlocked = xp >= r.minXP
            const isCurrent = r.name === rank.name
            return (
              <div key={r.name} style={{ flex:1, textAlign:'center', position:'relative', zIndex:1 }}>
                <div style={{
                  width:44, height:44, borderRadius:12, margin:'0 auto 8px',
                  background: unlocked ? `${r.color}20` : 'var(--surface2)',
                  border:`2px solid ${unlocked ? r.color : 'var(--border)'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:20, filter: unlocked ? 'none' : 'grayscale(1)',
                  opacity: unlocked ? 1 : 0.4,
                  boxShadow: isCurrent ? `0 0 16px ${r.color}40` : 'none'
                }}>
                  {r.icon}
                </div>
                <p style={{ fontSize:11, fontWeight:700, color: unlocked ? r.color : 'var(--text3)' }}>{r.name}</p>
                <p style={{ fontSize:10, color:'var(--text3)', fontFamily:'JetBrains Mono' }}>{r.minXP} XP</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Earned badges showcase */}
      {earned.length > 0 && (
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:16, padding:22
        }} className="anim-up d-2">
          <p className="section-label" style={{ marginBottom:14 }}>Badges Earned ({earned.length})</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:10 }}>
            {earned.map(b => (
              <div key={b.key} style={{
                background:'rgba(232,160,48,0.06)', border:'1px solid rgba(232,160,48,0.18)',
                borderRadius:12, padding:'14px 12px', textAlign:'center'
              }}>
                <span style={{ fontSize:28, display:'block', marginBottom:7 }}>{b.icon}</span>
                <p style={{ fontFamily:'Syne', fontWeight:700, fontSize:12, color:'var(--text)', marginBottom:4 }}>{b.name}</p>
                <p style={{ fontSize:10, color:'var(--text2)', lineHeight:1.4 }}>{b.description}</p>
                {b.earned_at && (
                  <p style={{ fontSize:9, color:'var(--text3)', marginTop:6 }}>
                    {new Date(b.earned_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked badges */}
      {badges.filter(b => !b.earned).length > 0 && (
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:16, padding:22
        }} className="anim-up d-3">
          <p className="section-label" style={{ marginBottom:14 }}>
            Locked ({badges.filter(b=>!b.earned).length})
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {badges.filter(b => !b.earned).map(b => (
              <div key={b.key} style={{
                background:'var(--surface2)', border:'1px solid var(--border)',
                borderRadius:10, padding:'8px 14px',
                display:'flex', alignItems:'center', gap:8,
                opacity:0.4, filter:'grayscale(1)'
              }}>
                <span style={{ fontSize:16 }}>{b.icon}</span>
                <span style={{ fontSize:12, color:'var(--text)', fontWeight:600 }}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}