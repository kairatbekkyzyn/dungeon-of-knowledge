import { useState, useEffect } from 'react'
import { dungeonsAPI, quizzesAPI, incrementQuests } from '../api'
import { useAuthStore } from '../store/authStore'

interface Monster {
  id: number; question_id: number; material_id: number; question_text: string
  options: string[]; correct_answer: number; explanation: string
  topic: string; times_wrong: number; last_seen: string
}

const MONSTER_SPRITES = ['👾','🧟','🐉','💀','🕷️','🦇','👿','🧌','🐺','🦂']

export default function MonsterLog() {
  const { updateXP }  = useAuthStore()
  const [monsters, setMonsters]   = useState<Monster[]>([])
  const [loading,  setLoading]    = useState(true)
  const [active,   setActive]     = useState<Monster | null>(null)
  const [selected, setSelected]   = useState<number | null>(null)
  const [result,   setResult]     = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [defeatedIds, setDefeatedIds] = useState<number[]>([])

  useEffect(() => {
    dungeonsAPI.monsterLog()
      .then(r => setMonsters(r.data))
      .finally(() => setLoading(false))
  }, [])

  const fight = (m: Monster) => {
    setActive(m); setSelected(null); setResult(null)
  }

  const handleAnswer = async (idx: number) => {
    if (!active || submitting || result) return
    setSelected(idx); setSubmitting(true)
    try {
      const res = await quizzesAPI.answer({ question_id: active.question_id, selected_answer: idx })
      setResult(res.data)
      updateXP(res.data.new_total_xp)
      // Update mastery and monster log in DB
      await dungeonsAPI.updateMastery({
        material_id: active.material_id,
        topic:       active.topic,
        question_id: active.question_id,
        is_correct:  res.data.is_correct,
      })
      if (res.data.is_correct) {
        setDefeatedIds(prev => [...prev, active.id])
        incrementQuests('volume')
      }
    } finally { setSubmitting(false) }
  }

  const getMonsterSprite = (timesWrong: number) => {
    if (timesWrong >= 5) return '👾'  // Alien - hard
    if (timesWrong >= 3) return '🐉'  // Dragon - medium
    return '👹'  // Orc - easy
  }

  const getMonsterBorder = (timesWrong: number) => {
    if (timesWrong >= 5) return '2px solid #c0392b'  // Red - epic
    if (timesWrong >= 3) return '2px solid #9b59b6'  // Purple - rare
    return '1px solid var(--border)'  // Normal
  }

  const closeAndNext = () => {
    if (result?.is_correct) {
      setMonsters(prev => prev.filter(m => m.id !== active!.id))
    }
    setActive(null); setSelected(null); setResult(null)
  }

  const alive  = monsters.filter(m => !defeatedIds.includes(m.id))
  const LETTERS = ['A','B','C','D']

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'80px 0' }}>
      <span className="spin" style={{ display:'inline-block', width:28, height:28, border:'2px solid var(--border2)', borderTopColor:'var(--cyan)', borderRadius:'50%' }}/>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div className="anim-up d-0">
        <h1 className="h1" style={{ marginBottom:4 }}>📖 Monster Log</h1>
        <p className="t-secondary" style={{ fontSize:13 }}>
          Questions you've answered wrong. Defeat them to clear them from the log.
        </p>
      </div>

      {/* Stats bar */}
      <div style={{
        background:'rgba(192,57,43,0.06)', border:'1px solid rgba(192,57,43,0.18)',
        borderRadius:14, padding:'14px 20px', display:'flex', gap:24, alignItems:'center'
      }} className="anim-up d-1">
        <div style={{ fontSize:32 }}>👹</div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <p style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>
              {alive.length} monster{alive.length !== 1 ? 's' : ''} remaining
            </p>
            <span style={{ fontSize:12, fontFamily:'JetBrains Mono', color:'var(--red)' }}>
              {defeatedIds.length} defeated
            </span>
          </div>
          <div style={{ height:5, background:'rgba(255,255,255,0.05)', borderRadius:5, overflow:'hidden' }}>
            <div style={{
              height:'100%', borderRadius:5, background:'var(--emerald)',
              transition:'width 0.6s',
              width: monsters.length > 0
                ? `${(defeatedIds.length / (monsters.length + defeatedIds.length)) * 100}%`
                : '0%'
            }}/>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {alive.length === 0 && !loading && (
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:18, padding:'60px 40px', textAlign:'center'
        }} className="anim-scale">
          <p style={{ fontSize:52, marginBottom:14 }}>🏆</p>
          <h3 className="h3" style={{ marginBottom:8 }}>Monster Log is clear!</h3>
          <p className="t-secondary" style={{ fontSize:13 }}>
            You've defeated all your mistakes. Keep studying to stay sharp.
          </p>
        </div>
      )}

      {/* Monster grid */}
      {alive.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:12 }}>
          {alive.map((m, i) => {
            const sprite   = MONSTER_SPRITES[i % MONSTER_SPRITES.length]
            const danger   = m.times_wrong >= 4 ? 'epic' : m.times_wrong >= 2 ? 'rare' : 'common'
            const dangerColors = {
              epic:   { bg:'rgba(192,57,43,0.12)',  border:'rgba(192,57,43,0.3)',  label:'EPIC',   color:'var(--red)' },
              rare:   { bg:'rgba(155,89,182,0.10)', border:'rgba(155,89,182,0.25)',label:'RARE',   color:'var(--purple)' },
              common: { bg:'var(--surface2)',        border:'var(--border)',         label:'COMMON', color:'var(--text2)' },
            }[danger]

            return (
              <div key={m.id} className="anim-up" style={{
                background: dangerColors.bg,
                border:`1.5px solid ${dangerColors.border}`,
                borderRadius:14, padding:18,
                transition:'all 0.2s', cursor:'pointer',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform='none'}
              onClick={() => fight(m)}
              >
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
                  <div style={{
                    width:48, height:48, borderRadius:12, flexShrink:0,
                    background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:24
                  }} className={m.times_wrong >= 3 ? 'torch' : ''}>
                    {sprite}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                      <span style={{
                        fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:4,
                        background: `${dangerColors.border}`, color: dangerColors.color,
                        letterSpacing:'0.06em'
                      }}>{dangerColors.label}</span>
                      <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'JetBrains Mono' }}>
                        ✗{m.times_wrong}
                      </span>
                    </div>
                    <p style={{ fontSize:12, color:'var(--text2)', marginBottom:4 }}>{m.topic}</p>
                    <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any }}>
                      {m.question_text}
                    </p>
                  </div>
                </div>

                <button style={{
                  width:'100%', padding:'8px', borderRadius:9,
                  border:'1px solid rgba(232,160,48,0.3)',
                  background:'rgba(232,160,48,0.08)', color:'var(--amber)',
                  cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'Manrope',
                  transition:'all 0.15s'
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='rgba(232,160,48,0.15)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='rgba(232,160,48,0.08)' }}
                onClick={e => { e.stopPropagation(); fight(m) }}>
                  ⚔️ Fight
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Battle modal */}
      {active && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1000, padding:20
        }} onClick={() => !result && setActive(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--surface)', border:'1px solid rgba(192,57,43,0.3)',
            borderRadius:20, padding:28, width:'100%', maxWidth:520,
            maxHeight:'90vh', overflowY:'auto'
          }} className="anim-scale">

            {/* Monster header */}
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:52, marginBottom:8 }}>
                {MONSTER_SPRITES[monsters.indexOf(active) % MONSTER_SPRITES.length]}
              </div>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>
                {active.topic}
              </p>
              <div style={{ display:'flex', justifyContent:'center', gap:6 }}>
                {Array.from({length: active.times_wrong}).map((_,i) => (
                  <span key={i} style={{ fontSize:12 }}>💢</span>
                ))}
              </div>
              <p style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>
                Defeated you {active.times_wrong} time{active.times_wrong !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Question */}
            <p style={{ fontFamily:'Syne', fontSize:15, fontWeight:600, color:'var(--text)', lineHeight:1.6, marginBottom:18 }}>
              {active.question_text}
            </p>

            {/* Options */}
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
              {active.options.map((opt, idx) => {
                const state =
                  result ? (
                    idx === result.correct_answer ? 'correct' :
                    idx === selected && !result.is_correct ? 'wrong' : 'idle'
                  ) : idx === selected ? 'selected' : 'idle'
                return (
                  <div key={idx} onClick={() => handleAnswer(idx)} style={{
                    display:'flex', alignItems:'flex-start', gap:12,
                    padding:'12px 14px', borderRadius:10,
                    cursor: result ? 'default' : 'pointer',
                    border:`1.5px solid ${
                      state==='correct' ? 'var(--emerald)' :
                      state==='wrong'   ? 'var(--red)'     :
                      state==='selected'? 'var(--cyan)'    : 'var(--border)'
                    }`,
                    background:
                      state==='correct' ? 'rgba(80,200,120,0.08)' :
                      state==='wrong'   ? 'rgba(192,57,43,0.08)'  :
                      state==='selected'? 'rgba(232,160,48,0.08)' : 'var(--surface2)',
                    transition:'all 0.15s',
                  }}>
                    <span style={{
                      width:22, height:22, borderRadius:5, flexShrink:0, fontSize:10,
                      fontWeight:700, fontFamily:'JetBrains Mono',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background:'rgba(255,255,255,0.06)', color:'var(--text2)'
                    }}>{LETTERS[idx]}</span>
                    <span style={{ fontSize:13, color:'var(--text)', flex:1 }}>{opt}</span>
                  </div>
                )
              })}
            </div>

            {/* Result */}
            {result && (
              <div style={{
                padding:14, borderRadius:12, marginBottom:14,
                background: result.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)',
                border:`1px solid ${result.is_correct ? 'rgba(80,200,120,0.2)' : 'rgba(192,57,43,0.2)'}`
              }}>
                <p style={{ fontSize:14, fontWeight:700, marginBottom:6,
                  color: result.is_correct ? 'var(--emerald)' : 'var(--red)' }}>
                  {result.is_correct ? '⚔️ Monster defeated! It leaves your log.' : '💢 Still not right. Study the explanation.'}
                </p>
                <p style={{ fontSize:12, color:'var(--text2)', lineHeight:1.6 }}>{result.explanation}</p>
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              {result ? (
                <button className="btn-primary" onClick={closeAndNext}
                  style={{ flex:1, height:42, fontSize:13 }}>
                  {result.is_correct ? '✓ Dismissed' : '← Back to Log'}
                </button>
              ) : (
                <button className="btn-ghost" onClick={() => setActive(null)}
                  style={{ flex:1, height:42, fontSize:13 }}>
                  Retreat
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}