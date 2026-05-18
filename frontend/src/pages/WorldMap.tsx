/**
 * WorldMap.tsx  (REPLACEMENT — drop this file into frontend/src/pages/)
 *
 * Changes from original:
 *  • Dungeons section replaced with a vertical winding-road SVG that shows
 *    each dungeon as a stop on the player's journey (like the reference image).
 *  • All API calls, auth, delete modal, quest scrolls, and header are kept
 *    exactly as before — only the dungeon grid is swapped out.
 *  • No new dependencies needed.
 */

import { useEffect, useState } from 'react'
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

// ─── MasteryRing ──────────────────────────────────────────────────────────────
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

// ─── WorldRoadMap ─────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function buildPath(pts: {x:number;y:number}[]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i-1], c = pts[i]
    const cy = lerp(p.y, c.y, 0.5)
    d += ` C ${p.x} ${cy}, ${c.x} ${cy}, ${c.x} ${c.y}`
  }
  return d
}

interface WorldRoadMapProps {
  dungeons: Dungeon[]
  onSelect: (d: Dungeon) => void
  onDelete: (d: Dungeon) => void
  onAdd: () => void
}

function WorldRoadMap({ dungeons, onSelect, onDelete, onAdd }: WorldRoadMapProps) {
  const [hovered, setHovered] = useState<number|null>(null)
  const [popped,  setPopped]  = useState<Set<number>>(new Set())

  useEffect(() => {
    dungeons.forEach((_, i) => {
      setTimeout(() => setPopped(prev => new Set(prev).add(i)), i * 100 + 100)
    })
  }, [dungeons.length])

  const W      = 360
  const TOP    = 70
  const GAP    = 130
  const LEFT   = W * 0.27
  const RIGHT  = W * 0.73

  const stops = dungeons.map((_, i) => ({
    x: i % 2 === 0 ? LEFT : RIGHT,
    y: TOP + i * GAP,
  }))

  // Plus-button node
  const addY    = TOP + dungeons.length * GAP
  const addStop = { x: W / 2, y: addY }
  const allPts  = [...stops, addStop]
  const totalH  = addY + 90

  const roadPath = buildPath(allPts)

  const masteredCount = dungeons.filter(d => d.state === 'mastered').length

  return (
    <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="wm-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="rgba(255,255,255,0.025)"/>
          </pattern>
          <filter id="wm-glow">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <rect width={W} height={totalH} fill="url(#wm-dots)" rx={0}/>

        {/* Road layers */}
        <path d={roadPath} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={24}
          strokeLinecap="round" strokeLinejoin="round"/>
        <path d={roadPath} fill="none" stroke="#1c2030" strokeWidth={20}
          strokeLinecap="round" strokeLinejoin="round"/>
        <path d={roadPath} fill="none" stroke="rgba(255,220,80,0.2)" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14 18"/>

        {/* Completed road glow */}
        {masteredCount > 0 && stops.length > 0 && (
          <path
            d={buildPath(stops.slice(0, masteredCount + 1))}
            fill="none" stroke="rgba(80,200,120,0.45)" strokeWidth={7}
            strokeLinecap="round" filter="url(#wm-glow)"
          />
        )}

        {/* Start label */}
        <text x={stops[0]?.x ?? W/2} y={TOP - 30}
          textAnchor="middle" fill="rgba(255,255,255,0.18)"
          style={{ fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
          ▼ YOUR JOURNEY
        </text>

        {/* Dungeon stops */}
        {dungeons.map((d, i) => {
          const { x, y } = stops[i]
          const icon      = DUNGEON_ICONS[i % DUNGEON_ICONS.length]
          const isHov     = hovered === d.id
          const didPop    = popped.has(i)

          const ringColor =
            d.state === 'mastered'    ? '#10b981' :
            d.state === 'active'      ? '#f59e0b' : 'rgba(255,255,255,0.1)'

          const glowColor =
            d.state === 'mastered' ? 'rgba(16,185,129,0.55)' :
            d.state === 'active'   ? 'rgba(245,158,11,0.5)'  : 'rgba(255,255,255,0.06)'

          const nodeSize  = 64
          const r         = (nodeSize - 10) / 2
          const circ      = 2 * Math.PI * r

          const labelText = d.title.length > 22 ? d.title.slice(0,20)+'…' : d.title

          return (
            <g key={d.id}
              onMouseEnter={() => setHovered(d.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}>

              {/* Glow */}
              {(isHov || d.state === 'mastered') && (
                <circle cx={x} cy={y} r={nodeSize/2 + 14}
                  fill={glowColor} style={{ filter:'blur(14px)', opacity: isHov ? 1 : 0.55 }}/>
              )}

              {/* Boss pulse if unlocked */}
              {d.boss_unlocked && (
                <>
                  <circle cx={x} cy={y} r={nodeSize/2 + 6}
                    fill="none" stroke="rgba(192,57,43,0.5)" strokeWidth={2}
                    style={{ animation:'radar 1.8s ease-out infinite' }}/>
                  <circle cx={x} cy={y} r={nodeSize/2 + 12}
                    fill="none" stroke="rgba(192,57,43,0.25)" strokeWidth={1.5}
                    style={{ animation:'radar 1.8s ease-out infinite', animationDelay:'0.6s' }}/>
                </>
              )}

              {/* Mastery ring */}
              <circle cx={x} cy={y} r={r}
                fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5}/>
              <circle cx={x} cy={y} r={r}
                fill="none" stroke={ringColor} strokeWidth={5}
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - d.overall_mastery)}
                strokeLinecap="round"
                transform={`rotate(-90 ${x} ${y})`}
                style={{ transition:'stroke-dashoffset 1.2s ease 0.3s' }}/>

              {/* Main circle — rendered as foreignObject for emoji + bg */}
              <foreignObject
                x={x - nodeSize/2 + 5}
                y={y - nodeSize/2 + 5}
                width={nodeSize - 10}
                height={nodeSize - 10}
                onClick={() => onSelect(d)}>
                <div style={{
                  width:'100%', height:'100%', borderRadius:'50%',
                  background:
                    d.state === 'mastered' ? 'radial-gradient(135deg at 30% 30%, #10b981, #065f46)' :
                    d.state === 'active'   ? 'radial-gradient(135deg at 30% 30%, #f59e0b, #92400e)' :
                                             'radial-gradient(135deg at 30% 30%, #2d3557, #1a1d27)',
                  border:`2px solid ${
                    d.state==='mastered' ? 'rgba(16,185,129,0.5)' :
                    d.state==='active'   ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize: 24,
                  transform: didPop
                    ? (isHov ? 'scale(1.14)' : 'scale(1)')
                    : 'scale(0)',
                  transition:'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                  boxSizing:'border-box',
                }}>
                  {d.state === 'mastered' ? '✅' : icon}
                </div>
              </foreignObject>

              {/* Step number badge */}
              <circle cx={x + nodeSize/2 - 5} cy={y - nodeSize/2 + 5} r={11}
                fill="var(--bg)" stroke="var(--border2)" strokeWidth={1}/>
              <text x={x + nodeSize/2 - 5} y={y - nodeSize/2 + 9}
                textAnchor="middle" fill="var(--text2)"
                style={{ fontSize:9, fontFamily:'JetBrains Mono', fontWeight:700 }}>
                {i+1}
              </text>

              {/* Delete button — appears on hover, right side */}
              {isHov && (
                <g onClick={e => { (e as any).stopPropagation(); onDelete(d) }}>
                  <circle cx={x + nodeSize/2 + 8} cy={y + nodeSize/2 - 8} r={11}
                    fill="rgba(192,57,43,0.85)" stroke="rgba(192,57,43,0.4)" strokeWidth={1}/>
                  <text x={x + nodeSize/2 + 8} y={y + nodeSize/2 - 4}
                    textAnchor="middle" style={{ fontSize:10 }}>🗑</text>
                </g>
              )}

              {/* Label card */}
              <foreignObject
                x={x - 70}
                y={y + nodeSize/2 + 6}
                width={140}
                height={50}
                onClick={() => onSelect(d)}>
                <div style={{
                  background: 'rgba(15,17,23,0.82)',
                  border: `1px solid ${
                    d.state==='mastered' ? 'rgba(16,185,129,0.3)' :
                    d.state==='active'   ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10,
                  padding: '5px 8px',
                  backdropFilter: 'blur(8px)',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: 'Syne, sans-serif', fontWeight: 700,
                    fontSize: 11, color: 'var(--text)',
                    lineHeight: 1.3, marginBottom: 2,
                  }}>{labelText}</div>
                  <div style={{
                    fontSize: 10, fontFamily: 'JetBrains Mono',
                    color: d.state==='mastered' ? 'var(--emerald)' :
                           d.state==='active'   ? 'var(--amber)'   : 'var(--text3)',
                  }}>
                    {Math.round(d.overall_mastery * 100)}%
                    {d.boss_unlocked && ' · ⚡Boss'}
                  </div>
                </div>
              </foreignObject>
            </g>
          )
        })}

        {/* Add new dungeon node */}
        <g onClick={onAdd} style={{ cursor:'pointer' }}>
          <circle cx={addStop.x} cy={addStop.y} r={28}
            fill="transparent"
            stroke="var(--border)"
            strokeWidth={2}
            strokeDasharray="6 6"
            style={{ transition:'stroke 0.2s' }}/>
          <text x={addStop.x} y={addStop.y + 5}
            textAnchor="middle"
            fill="var(--text3)"
            style={{ fontSize: 22 }}>+</text>
          <text x={addStop.x} y={addStop.y + 50}
            textAnchor="middle"
            fill="var(--text3)"
            style={{ fontSize: 10, fontFamily:'JetBrains Mono', fontWeight:700 }}>
            FORGE NEW
          </text>
        </g>

        {/* Finish flag */}
        <text x={W/2} y={totalH - 8}
          textAnchor="middle" fill="rgba(255,255,255,0.1)"
          style={{ fontSize:10, fontFamily:'JetBrains Mono', fontWeight:700 }}>
          🏁
        </text>
      </svg>
    </div>
  )
}

// ─── Main WorldMap page ────────────────────────────────────────────────────────
export default function WorldMap() {
  const { user } = useAuthStore()
  const navigate  = useNavigate()
  const { playSound } = useSound()
  const { addToast } = useToast()
  const [dungeons, setDungeons] = useState<Dungeon[]>([])
  const [quests,   setQuests]   = useState<Quest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Dungeon | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [xpDisplay, setXpDisplay] = useState(0)

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

  const level     = Math.floor((user?.xp ?? 0) / 100) + 1
  const rankColor = RANK_COLORS[(user as any)?.rank ?? 'Apprentice'] ?? '#8a7060'
  const todayQuests = quests.length
  const doneQuests  = quests.filter(q => q.completed).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Explorer header — unchanged */}
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

      {/* Daily Quests — unchanged */}
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

      {/* ── DUNGEON JOURNEY ROAD MAP (replaces the old grid) ── */}
      <div>
        <p className="section-label" style={{ marginBottom:16 }}>🗺️ Your Journey</p>

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

        {!loading && dungeons.length > 0 && (
          <div style={{
            background:'var(--surface)',
            border:'1px solid var(--border)',
            borderRadius:20,
            padding:'24px 16px 32px',
            overflow:'hidden',
            position:'relative',
          }}>
            {/* Subtle radial glow top-right */}
            <div style={{
              position:'absolute', top:-60, right:-60, width:260, height:260,
              borderRadius:'50%',
              background:'radial-gradient(circle, rgba(232,160,48,0.06), transparent 70%)',
              pointerEvents:'none',
            }}/>

            <WorldRoadMap
              dungeons={dungeons}
              onSelect={d => { playSound('dungeonOpen', 0.75); navigate(`/dungeon/${d.id}`) }}
              onDelete={d => { playSound('click', 0.55); setDeleteTarget(d) }}
              onAdd={() => { playSound('click', 0.55); navigate('/forge') }}
            />

            {/* Legend */}
            <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:20, flexWrap:'wrap' }}>
              {[
                { color:'var(--emerald)', label:'Mastered' },
                { color:'var(--amber)',   label:'In Progress' },
                { color:'var(--text3)',   label:'New' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:color }}/>
                  <span style={{ fontSize:11, color:'var(--text2)', fontFamily:'JetBrains Mono' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal — unchanged */}
      {deleteTarget && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:9999, padding:20,
        }} onClick={() => !deleting && setDeleteTarget(null)}>
          <div style={{
            background:'var(--surface)', border:'1.5px solid rgba(192,57,43,0.4)',
            borderRadius:20, padding:28, maxWidth:400, width:'100%',
            textAlign:'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:48, marginBottom:12 }}>🗑️</div>
            <h3 style={{ fontFamily:'Syne', fontSize:18, fontWeight:800, marginBottom:8 }}>
              Delete this dungeon?
            </h3>
            <p style={{ fontSize:14, color:'var(--amber)', fontWeight:700, marginBottom:6 }}>
              "{deleteTarget.title}"
            </p>
            <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:24 }}>
              This will permanently delete the dungeon, all its questions, and your progress. This cannot be undone.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}
                disabled={deleting} style={{ flex:1, padding:'12px' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} style={{
                flex:1, padding:'12px', borderRadius:12, border:'none',
                background: deleting ? 'rgba(192,57,43,0.4)' : 'rgba(192,57,43,0.85)',
                color:'#fff', fontWeight:700, fontSize:14,
                cursor: deleting ? 'not-allowed' : 'pointer', fontFamily:'Manrope',
              }}>
                {deleting ? 'Deleting…' : '🗑️ Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}