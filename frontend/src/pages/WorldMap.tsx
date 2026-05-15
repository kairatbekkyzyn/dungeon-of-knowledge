import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useSound } from '../hooks/useSound'
import { dungeonsAPI, questsAPI, materialsAPI } from '../api'
import { useToast } from '../components/Toast'

interface Room { topic: string; mastery: number; state: string }
interface Dungeon {
  id: number; title: string; rooms: Room[]
  overall_mastery: number; boss_unlocked: boolean
  state: 'new' | 'active' | 'mastered'; dungeon_order: number
}
interface Quest { id: number; description: string; progress_pct: number; completed: boolean; xp_reward: number }

const RANK_COLORS: Record<string, string> = {
  Apprentice: '#8a7060', Knight: '#c0c0c0', Wizard: '#9b59b6', Archmage: '#e8a030'
}
const DUNGEON_ICONS = ['🏰','⛩️','🗼','🏯','🌋','🗺️','🏟️','🔮']

function MasteryRing({ mastery, size = 60 }: { mastery: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - mastery)
  const color = mastery >= 0.8 ? '#50c878' : mastery > 0 ? '#e8a030' : '#4a3828'
  return (
    <svg width={size} height={size} style={{ position:'absolute', top:0, left:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth={4} strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition:'stroke-dashoffset 0.8s ease' }}/>
    </svg>
  )
}

export default function WorldMap() {
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const { playSound } = useSound()
  const { addToast } = useToast()
  const [dungeons, setDungeons] = useState<Dungeon[]>([])
  const [quests,   setQuests]   = useState<Quest[]>([])
  const [hovered,  setHovered]  = useState<number | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Dungeon | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [xpDisplay, setXpDisplay] = useState(0)

  // XP count-up on load
  useEffect(() => {
    const target = user?.xp ?? 0
    if (target === 0) return
    let current = 0
    const step  = Math.ceil(target / 40)
    const timer = setInterval(() => {
      current = Math.min(current + step, target)
      setXpDisplay(current)
      if (current >= target) clearInterval(timer)
    }, 30)
    return () => clearInterval(timer)
  }, [user?.xp])

  useEffect(() => {
    Promise.all([dungeonsAPI.list(), questsAPI.get()])
      .then(([d, q]) => { setDungeons(d.data); setQuests(q.data) })
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await materialsAPI.delete(deleteTarget.id)
      setDungeons(prev => prev.filter(d => d.id !== deleteTarget.id))
      addToast('🗑️ Dungeon destroyed', 'error')
      setDeleteTarget(null)
    } catch (e) {
      console.error('Delete failed', e)
    } finally {
      setDeleting(false)
    }
  }

  const level    = Math.floor((user?.xp ?? 0) / 100) + 1
  const rankColor = RANK_COLORS[(user as any)?.rank ?? 'Apprentice'] ?? '#8a7060'
  const todayQuests = quests.length
  const doneQuests  = quests.filter(q => q.completed).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Explorer header */}
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:20, padding:24, display:'flex', gap:20, alignItems:'center',
        position:'relative', overflow:'hidden'
      }}>
        <div style={{
          position:'absolute', top:-40, right:-40, width:200, height:200,
          borderRadius:'50%', background:'radial-gradient(circle, rgba(232,160,48,0.08), transparent 70%)',
          pointerEvents:'none'
        }}/>

        {/* Character avatar */}
        <div style={{
          width:64, height:64, borderRadius:18, flexShrink:0, position:'relative',
          background:'linear-gradient(135deg, rgba(155,89,182,0.3), rgba(232,160,48,0.2))',
          border:'2px solid var(--border2)', display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:28
        }}>
          ⚔️
          <div style={{
            position:'absolute', bottom:-6, left:'50%', transform:'translateX(-50%)',
            background:'var(--bg)', border:'1px solid var(--border2)',
            borderRadius:6, padding:'1px 6px', fontSize:9, fontWeight:700,
            color: rankColor, whiteSpace:'nowrap', fontFamily:'JetBrains Mono'
          }}>
            {(user as any)?.rank ?? 'Apprentice'}
          </div>
        </div>

        <div style={{ flex:1 }}>
          <h1 className="h1" style={{ fontSize:22, marginBottom:4 }}>
            {user?.name}'s World
          </h1>
          <p className="t-secondary" style={{ fontSize:13 }}>
            Level {level} Explorer · <span style={{ color:'var(--amber)', fontFamily:'JetBrains Mono', fontWeight:700 }}>{xpDisplay}</span> XP · {dungeons.length} dungeon{dungeons.length !== 1 ? 's' : ''}
          </p>
          <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
            <span style={{
              fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:6,
              background:'rgba(80,200,120,0.12)', color:'var(--emerald)',
              border:'1px solid rgba(80,200,120,0.2)'
            }}>
              {dungeons.filter(d => d.state === 'mastered').length} mastered
            </span>
            <span style={{
              fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:6,
              background:'rgba(232,160,48,0.12)', color:'var(--amber)',
              border:'1px solid rgba(232,160,48,0.2)'
            }}>
              🔥 {user?.streak_days ?? 0} day streak
            </span>
            {doneQuests === todayQuests && todayQuests > 0 && (
              <span style={{
                fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:6,
                background:'rgba(155,89,182,0.12)', color:'var(--purple)',
                border:'1px solid rgba(155,89,182,0.2)'
              }}>
                ✨ All quests done!
              </span>
            )}
          </div>
        </div>

        {/* Quest scroll summary */}
        {todayQuests > 0 && (
          <div style={{
            background:'var(--surface2)', border:'1px solid var(--border)',
            borderRadius:14, padding:'14px 18px', textAlign:'center', flexShrink:0
          }}>
            <p style={{ fontSize:11, color:'var(--text2)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>
              Daily Quests
            </p>
            <p style={{ fontSize:24, fontWeight:800, color: doneQuests === todayQuests ? 'var(--emerald)' : 'var(--amber)', fontFamily:'JetBrains Mono' }}>
              {doneQuests}/{todayQuests}
            </p>
            <p style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>complete</p>
          </div>
        )}
      </div>

      {/* Daily Quests */}
      {quests.length > 0 && (
        <div>
          <p className="section-label" style={{ marginBottom:10 }}>📜 Daily Quests</p>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {quests.map(q => (
              <div key={q.id} className={`quest-scroll${q.completed ? ' completed' : ''}`}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:18 }}>{q.completed ? '✅' : '📜'}</span>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, color:'var(--text)', fontWeight:q.completed ? 400 : 600 }}>
                      {q.description}
                    </p>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                      <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                        <div style={{
                          height:'100%', borderRadius:4,
                          background: q.completed ? 'var(--emerald)' : 'var(--cyan)',
                          width:`${q.progress_pct}%`, transition:'width 0.5s'
                        }}/>
                      </div>
                      <span style={{ fontSize:10, color:'var(--text2)', fontFamily:'JetBrains Mono', flexShrink:0 }}>
                        {q.progress_pct}%
                      </span>
                    </div>
                  </div>
                  <span style={{
                    fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6,
                    background:'rgba(232,160,48,0.12)', color:'var(--amber)',
                    flexShrink:0
                  }}>+{q.xp_reward} XP</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dungeon map */}
      <div>
        <p className="section-label" style={{ marginBottom:12 }}>🗺️ Your Dungeons</p>

        {loading && (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <span className="spin" style={{ display:'inline-block', width:28, height:28, border:'2px solid var(--border2)', borderTopColor:'var(--cyan)', borderRadius:'50%' }}/>
            <p className="t-secondary" style={{ marginTop:12, fontSize:13 }}>Summoning dungeons…</p>
          </div>
        )}

        {!loading && dungeons.length === 0 && (
          <div style={{
            background:'var(--surface)', border:'2px dashed var(--border2)',
            borderRadius:20, padding:'60px 40px', textAlign:'center'
          }}>
            <p style={{ fontSize:56, marginBottom:14 }} className="float">🏰</p>
            <h3 className="h3" style={{ marginBottom:8 }}>Your adventure awaits, Explorer</h3>
            <p className="t-secondary" style={{ fontSize:13, marginBottom:20 }}>
              Forge your first dungeon by uploading study material
            </p>
            <button className="btn-primary" onClick={() => navigate('/forge')}
              style={{ fontSize:14, padding:'11px 24px' }}>
              ⚒️ Enter the Forge
            </button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:16 }}>
          {dungeons.map((d, i) => {
            const icon      = DUNGEON_ICONS[i % DUNGEON_ICONS.length]
            const isHovered = hovered === d.id
            const borderColor =
              d.state === 'mastered' ? 'rgba(80,200,120,0.35)' :
              d.state === 'active'   ? 'rgba(232,160,48,0.3)'  :
                                       'rgba(180,120,255,0.12)'
            const glowColor =
              d.state === 'mastered' ? 'rgba(80,200,120,0.15)' :
              d.state === 'active'   ? 'rgba(232,160,48,0.12)' : 'transparent'

            return (
              <div key={d.id}
                onMouseEnter={() => setHovered(d.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background:'var(--surface)', border:`1.5px solid ${borderColor}`,
                  borderRadius:18, padding:20, cursor:'pointer',
                  transition:'all 0.25s',
                  boxShadow: d.state === 'mastered'
                    ? `0 0 24px rgba(80,200,120,0.2), ${isHovered ? '0 8px 32px rgba(80,200,120,0.25)' : '0 0 0 transparent'}`
                    : isHovered ? `0 8px 32px ${glowColor}` : 'none',
                  transform: isHovered ? 'translateY(-3px)' : 'none',
                  position: 'relative',
                  animationDelay: `${i * 80}ms`,
                }}
                className="anim-up"
              >
                {/* Delete button — top right corner */}
                <button
                  onClick={e => { e.stopPropagation(); playSound('click', 0.55); setDeleteTarget(d) }}
                  title="Delete dungeon"
                  style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'transparent', border: '1px solid transparent',
                    borderRadius: 8, width: 28, height: 28,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: 14, color: 'var(--text3)',
                    opacity: isHovered ? 1 : 0,
                    transition: 'all 0.2s',
                    zIndex: 2,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--red)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(192,57,43,0.4)'
                    ;(e.currentTarget as HTMLElement).style.background = 'rgba(192,57,43,0.1)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--text3)'
                    ;(e.currentTarget as HTMLElement).style.borderColor = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  🗑️
                </button>

                {/* Clickable area for navigating */}
                <div onClick={() => { playSound('dungeonOpen', 0.75); navigate(`/dungeon/${d.id}`) }}>
                {/* Header */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:16 }}>
                  <div style={{
                    width:56, height:56, borderRadius:14, flexShrink:0,
                    background:'var(--surface2)', border:'1px solid var(--border)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:26, position:'relative',
                  }} className={d.state === 'active' ? 'torch' : ''}>
                    {icon}
                    {/* Boss radar pulse */}
                    {d.boss_unlocked && (
                      <>
                        <span style={{
                          position:'absolute', top:-6, right:-6, fontSize:14,
                          filter:'drop-shadow(0 0 6px rgba(232,160,48,0.8))'
                        }}>⚡</span>
                        <span style={{
                          position:'absolute', top:-4, right:-4,
                          width:10, height:10, borderRadius:'50%',
                          background:'var(--red)',
                        }} />
                        <span style={{
                          position:'absolute', top:-4, right:-4,
                          width:10, height:10, borderRadius:'50%',
                          background:'var(--red)',
                          animation:'radar 1.8s ease-out infinite',
                        }} />
                      </>
                    )}
                    {/* NEW badge */}
                    {d.state === 'new' && (
                      <span style={{
                        position:'absolute', top:-10, left:'50%',
                        transform:'translateX(-50%)',
                        fontSize:11, fontWeight:800, color:'var(--amber)',
                        textShadow:'0 0 8px rgba(232,160,48,0.8)',
                        animation:'float 1.8s ease-in-out infinite',
                      }}>NEW!</span>
                    )}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontFamily:'Syne', fontWeight:700, fontSize:14, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {d.title}
                    </p>
                    <p className="t-secondary" style={{ fontSize:11, marginTop:3 }}>
                      {d.rooms.length} room{d.rooms.length !== 1 ? 's' : ''} · {d.rooms.filter(r => r.state === 'mastered').length} mastered
                    </p>
                  </div>
                  <span style={{
                    fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, flexShrink:0,
                    background:
                      d.state === 'mastered' ? 'rgba(80,200,120,0.15)' :
                      d.state === 'active'   ? 'rgba(232,160,48,0.15)'  : 'rgba(180,120,255,0.1)',
                    color:
                      d.state === 'mastered' ? 'var(--emerald)' :
                      d.state === 'active'   ? 'var(--amber)'   : 'var(--purple)',
                  }}>
                    {d.state === 'mastered' ? '✓ CLEAR' : d.state === 'active' ? 'IN PROGRESS' : 'NEW'}
                  </span>
                </div>

                {/* Room dots */}
                <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:12 }}>
                  {d.rooms.map(r => (
                    <div key={r.topic} title={`${r.topic} — ${Math.round(r.mastery*100)}%`} style={{
                      width:10, height:10, borderRadius:3,
                      background:
                        r.state === 'mastered'    ? 'var(--emerald)' :
                        r.state === 'in_progress' ? 'var(--amber)'   : 'var(--surface2)',
                      border:`1px solid ${
                        r.state === 'mastered'    ? 'rgba(80,200,120,0.5)' :
                        r.state === 'in_progress' ? 'rgba(232,160,48,0.5)' : 'var(--border)'
                      }`,
                      transition:'all 0.3s',
                    }}/>
                  ))}
                </div>

                {/* Mastery bar */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text2)', marginBottom:5 }}>
                    <span>Dungeon mastery</span>
                    <span style={{ fontFamily:'JetBrains Mono' }}>{Math.round(d.overall_mastery * 100)}%</span>
                  </div>
                  <div style={{ height:5, background:'rgba(255,255,255,0.05)', borderRadius:5, overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:5, transition:'width 0.8s ease',
                      width:`${d.overall_mastery * 100}%`,
                      background:
                        d.state === 'mastered' ? 'var(--emerald)' :
                        d.state === 'active'   ? 'linear-gradient(90deg, var(--amber), #c0392b)' :
                                                 'var(--surface2)',
                    }}/>
                  </div>
                </div>

                {d.boss_unlocked && (
                  <div style={{
                    marginTop:12, padding:'8px 12px', borderRadius:10,
                    background:'rgba(192,57,43,0.1)', border:'1px solid rgba(192,57,43,0.25)',
                    display:'flex', alignItems:'center', gap:8
                  }}>
                    <span>👹</span>
                    <span style={{ fontSize:12, color:'var(--red)', fontWeight:700 }}>Boss battle unlocked!</span>
                  </div>
                )}
                </div>{/* end clickable area */}
              </div>
            )
          })}

          {/* Add dungeon card */}
          {!loading && (
            <div onClick={() => { playSound('click', 0.55); navigate('/forge') }} style={{
              background:'transparent', border:'2px dashed var(--border)',
              borderRadius:18, padding:20, cursor:'pointer', display:'flex',
              flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:10, minHeight:160, transition:'all 0.2s',
              color:'var(--text2)'
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor='var(--cyan)';
              (e.currentTarget as HTMLElement).style.color='var(--cyan)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor='var(--border)';
              (e.currentTarget as HTMLElement).style.color='var(--text2)'
            }}>
              <span style={{ fontSize:32 }}>⚒️</span>
              <span style={{ fontSize:13, fontWeight:600 }}>Forge new dungeon</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }} onClick={() => !deleting && setDeleteTarget(null)}>
          <div style={{
            background: 'var(--surface)', border: '1.5px solid rgba(192,57,43,0.4)',
            borderRadius: 20, padding: 28, maxWidth: 400, width: '100%',
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              Delete this dungeon?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--amber)', fontWeight: 700, marginBottom: 6 }}>
              "{deleteTarget.title}"
            </p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
              This will permanently delete the dungeon, all its questions, and your progress. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ flex: 1, padding: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                  background: deleting ? 'rgba(192,57,43,0.4)' : 'rgba(192,57,43,0.85)',
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'Manrope',
                }}
              >
                {deleting ? 'Deleting…' : '🗑️ Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}