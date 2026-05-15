import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { dungeonsAPI, quizzesAPI, incrementQuests } from '../api'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../components/Toast'
import { useSound } from '../hooks/useSound'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchingPair { term: string; definition: string }
interface Question {
  id: number; question_text: string; options: string[]; topic: string
  question_type: string
  matching_pairs?: MatchingPair[]
  correct_answer?: number
  explanation?: string
}
interface AnswerResult {
  is_correct: boolean; correct_answer: number; explanation: string
  xp_gained: number; new_total_xp: number; new_badges: string[]
}
interface OpenAnswerResult {
  is_correct: boolean; score: number; feedback: string
  correct_answer: string; explanation: string
  xp_gained: number; new_total_xp: number; new_badges: string[]
}

type QuizMode = 'normal' | 'timed' | 'sudden_death'
type TimerSecs = 15 | 30 | 45

const BOSS_NAMES = ['The Ancient Guardian', 'Shadow Keeper', 'Dungeon Overlord', 'Void Warden', 'Stone Colossus']
const LETTERS = ['A', 'B', 'C', 'D']

// ─── Timer component ──────────────────────────────────────────────────────────
function QuestionTimer({ seconds, onExpire, paused }: { seconds: number; onExpire: () => void; paused: boolean }) {
  const [left, setLeft] = useState(seconds)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setLeft(seconds) }, [seconds])

  useEffect(() => {
    if (paused) {
      if (ref.current) clearInterval(ref.current)
      return
    }
    ref.current = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) {
          clearInterval(ref.current!)
          onExpire()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [paused, onExpire])

  const pct = (left / seconds) * 100
  const color = pct > 50 ? 'var(--emerald)' : pct > 25 ? 'var(--amber)' : 'var(--red)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `3px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color,
        transition: 'border-color 0.3s',
      }}>
        {left}
      </div>
    </div>
  )
}

// ─── Mode Picker for Boss Room ────────────────────────────────────────────────
function BossModePicker({ onStart }: { onStart: (mode: QuizMode, tSecs: TimerSecs) => void }) {
  const [mode, setMode] = useState<QuizMode>('normal')
  const [tsecs, setTsecs] = useState<TimerSecs>(30)

  const modes = [
    { id: 'normal' as QuizMode, label: 'Normal', icon: '⚔️', desc: 'Classic boss battle' },
    { id: 'timed' as QuizMode, label: 'Timed', icon: '⏱️', desc: 'Answer before time runs out' },
    { id: 'sudden_death' as QuizMode, label: 'Sudden Death', icon: '💀', desc: 'One wrong answer = defeated' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
      <div style={{ maxWidth: 500, width: '100%' }} className="anim-up">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 72, marginBottom: 8 }}>👹</div>
          <h2 style={{ fontFamily: 'Syne', fontSize: 26, fontWeight: 900, color: 'var(--red)', marginBottom: 6 }}>BOSS BATTLE</h2>
          <p className="t-secondary" style={{ fontSize: 13 }}>Choose how you want to face the guardian</p>
          <p className="t-muted" style={{ fontSize: 11, marginTop: 8 }}>Mixed question types: MCQ, True/False, Matching & Open-Ended</p>
        </div>

        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Game Mode</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {modes.map(m => (
            <div key={m.id} onClick={() => setMode(m.id)} style={{
              padding: '13px 16px', borderRadius: 12, cursor: 'pointer',
              border: `2px solid ${mode === m.id ? 'var(--red)' : 'var(--border)'}`,
              background: mode === m.id ? 'rgba(192,57,43,0.08)' : 'var(--surface2)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: mode === m.id ? 'var(--red)' : 'var(--text)', marginBottom: 2 }}>{m.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>{m.desc}</p>
              </div>
              {mode === m.id && <span style={{ color: 'var(--red)' }}>✓</span>}
            </div>
          ))}
        </div>

        {mode === 'timed' && (
          <div style={{ marginBottom: 20 }} className="anim-up">
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Time Per Question</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {([15, 30, 45] as TimerSecs[]).map(t => (
                <button key={t} onClick={() => setTsecs(t)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  border: `2px solid ${tsecs === t ? 'var(--amber)' : 'var(--border)'}`,
                  background: tsecs === t ? 'rgba(245,158,11,0.1)' : 'var(--surface2)',
                  color: tsecs === t ? 'var(--amber)' : 'var(--text2)',
                }}>{t}s</button>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={() => onStart(mode, tsecs)} style={{ width: '100%', fontSize: 16, padding: '14px 0', fontWeight: 800, background: 'var(--red)', borderColor: 'var(--red)' }}>
          ⚔️ Enter Boss Room
        </button>
      </div>
    </div>
  )
}

// ─── Matching for Boss Room ───────────────────────────────────────────────────
function BossMatchingQuestion({ pairs, onSubmit }: { pairs: MatchingPair[]; onSubmit: (correct: boolean) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const [matched, setMatched] = useState<Record<string, string>>({})
  const [wrong, setWrong] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [shuffled] = useState([...pairs.map(p => p.definition)].sort(() => Math.random() - 0.5))

  const handleDef = (def: string) => {
    if (done || !sel) return
    const ex = Object.entries(matched).find(([, d]) => d === def)
    const m = { ...matched }
    if (ex) delete m[ex[0]]
    m[sel] = def
    setMatched(m)
    setSel(null)
  }

  const submit = () => {
    if (Object.keys(matched).length < pairs.length) return
    const bad = pairs.filter(p => matched[p.term] !== p.definition).map(p => p.term)
    setWrong(bad)
    setDone(true)
    onSubmit(bad.length === 0)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
        {done ? '' : 'Tap a term, then tap its matching definition.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pairs.map(p => (
            <div key={p.term} onClick={() => !done && setSel(prev => prev === p.term ? null : p.term)} style={{
              padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              cursor: done ? 'default' : 'pointer',
              border: `2px solid ${done ? (wrong.includes(p.term) ? 'var(--red)' : 'var(--emerald)') : sel === p.term ? 'var(--cyan)' : matched[p.term] ? 'var(--amber)' : 'var(--border)'}`,
              background: sel === p.term ? 'rgba(56,189,248,0.1)' : matched[p.term] ? 'rgba(245,158,11,0.07)' : 'var(--surface2)',
              minHeight: 52, display: 'flex', alignItems: 'center',
            }}>{p.term}</div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shuffled.map(def => {
            const linked = Object.entries(matched).find(([, d]) => d === def)?.[0]
            const isWrong = done && linked && wrong.includes(linked)
            const isCorrect = done && linked && !wrong.includes(linked)
            return (
              <div key={def} onClick={() => handleDef(def)} style={{
                padding: '10px 12px', borderRadius: 10, fontSize: 12,
                cursor: done ? 'default' : sel ? 'pointer' : 'default',
                border: `2px solid ${isCorrect ? 'var(--emerald)' : isWrong ? 'var(--red)' : linked ? 'var(--amber)' : sel ? 'rgba(56,189,248,0.4)' : 'var(--border)'}`,
                background: isCorrect ? 'rgba(80,200,120,0.08)' : isWrong ? 'rgba(192,57,43,0.08)' : linked ? 'rgba(245,158,11,0.07)' : 'var(--surface2)',
                color: 'var(--text2)', minHeight: 52, display: 'flex', alignItems: 'center',
              }}>{def}</div>
            )
          })}
        </div>
      </div>
      {!done && (
        <button className="btn-primary" onClick={submit} disabled={Object.keys(matched).length < pairs.length}
          style={{ width: '100%', marginTop: 16, opacity: Object.keys(matched).length < pairs.length ? 0.5 : 1 }}>
          Submit ({Object.keys(matched).length}/{pairs.length})
        </button>
      )}
    </div>
  )
}

// ─── Open-ended for Boss Room ─────────────────────────────────────────────────
function BossOpenQuestion({ question, quizMode, onResult }: { question: Question; quizMode: string; onResult: (r: OpenAnswerResult) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<OpenAnswerResult | null>(null)

  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const res = await quizzesAPI.answerOpen({ question_id: question.id, answer_text: text, quiz_mode: quizMode })
      const r = res.data as OpenAnswerResult
      setDone(r)
      onResult(r)
    } finally { setBusy(false) }
  }

  if (done) {
    const sc = done.score
    const color = sc >= 0.8 ? 'var(--emerald)' : sc >= 0.5 ? 'var(--amber)' : 'var(--red)'
    return (
      <div className="anim-up">
        <div style={{ padding: '14px 16px', borderRadius: 12, background: done.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>{done.is_correct ? '✅' : sc >= 0.5 ? '🟡' : '❌'}</span>
            <span style={{ fontWeight: 700, color }}>Score: {Math.round(sc * 100)}% — {done.is_correct ? 'Correct!' : sc >= 0.5 ? 'Partial Credit' : 'Incorrect'}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{done.feedback}</p>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Model Answer</p>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{done.correct_answer}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <textarea value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder="Type your answer here…" rows={4}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'vertical', border: '2px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, lineHeight: 1.6, outline: 'none', boxSizing: 'border-box' }} />
      <button className="btn-primary" onClick={submit} disabled={!text.trim() || busy}
        style={{ width: '100%', marginTop: 10, opacity: !text.trim() ? 0.5 : 1 }}>
        {busy ? 'AI Judging…' : 'Submit Answer'}
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BossRoom() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { updateXP } = useAuthStore()
  const { addToast } = useToast()
  const { playSound } = useSound()
  const matId = id ? Number(id) : 0

  const [question, setQuestion] = useState<Question | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [openResult, setOpenResult] = useState<OpenAnswerResult | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [bossHp, setBossHp] = useState(100)
  const [playerHp, setPlayerHp] = useState(100)
  const [phase, setPhase] = useState<'mode_pick' | 'entrance' | 'battle' | 'victory' | 'defeat'>('mode_pick')
  const [entranceStep, setEntranceStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [bossName] = useState(BOSS_NAMES[matId % BOSS_NAMES.length])
  const [shake, setShake] = useState<'boss' | 'player' | null>(null)
  const [dungeonTitle, setDungeonTitle] = useState('')
  const [flashClass, setFlashClass] = useState('')
  const [xpPops, setXpPops] = useState<{ id: number; val: number }[]>([])
  const [newBadges, setNewBadges] = useState<string[]>([])
  const xpPopId = useRef(0)
  const battleStarted = useRef(false)
  const seenIdsRef = useRef<number[]>([])

  // Mode config
  const [quizMode, setQuizMode] = useState<QuizMode>('normal')
  const [timerSecs, setTimerSecs] = useState<TimerSecs>(30)
  const [timerPaused, setTimerPaused] = useState(false)
  const [timerExpired, setTimerExp] = useState(false)

  useEffect(() => {
    dungeonsAPI.rooms(matId).then(r => setDungeonTitle(r.data.dungeon_title)).catch(() => {})
  }, [matId])

  useEffect(() => {
    if (phase === 'battle' && !battleStarted.current) {
      battleStarted.current = true
      loadQuestion()
    }
  }, [phase])

  const handleModeStart = (mode: QuizMode, tSecs: TimerSecs) => {
    setQuizMode(mode)
    setTimerSecs(tSecs)
    playSound('bossEntrance', 0.75)
    setPhase('entrance')
    const timings = [400, 800, 1300, 1800, 2400]
    timings.forEach((t, i) => setTimeout(() => setEntranceStep(i + 1), t))
    setTimeout(() => setPhase('battle'), 2800)
  }

  const loadQuestion = async () => {
    setQuestionLoading(true)
    setTimerPaused(false)
    setTimerExp(false)
    setResult(null)
    setOpenResult(null)
    setSelected(null)
    try {
      const res = await quizzesAPI.next(matId, seenIdsRef.current.join(','), undefined, true, undefined)
      setQuestion(res.data)
    } catch (err: any) {
      if (seenIdsRef.current.length > 0) {
        seenIdsRef.current = []
        try {
          const res = await quizzesAPI.next(matId, '', undefined, true, undefined)
          setQuestion(res.data)
        } catch {
          addToast('⚠️ No more questions available! Victory!', 'success')
          setPhase('victory')
        }
      } else {
        addToast('⚠️ This dungeon has no questions yet. Complete some rooms first!', 'error')
        if (id) navigate(`/dungeon/${id}`)
      }
    } finally {
      setQuestionLoading(false)
    }
  }

  const triggerFlash = (cls: string) => { setFlashClass(cls); setTimeout(() => setFlashClass(''), 400) }
  const popXp = (val: number) => {
    const pid = xpPopId.current++
    setXpPops(prev => [...prev, { id: pid, val }])
    setTimeout(() => setXpPops(prev => prev.filter(x => x.id !== pid)), 1300)
  }

  const onCorrect = (xp: number, badges: string[], totalXp: number) => {
    playSound('correct', 0.85)
    triggerFlash('flash-green')
    popXp(xp)
    updateXP(totalXp)
    if (badges?.length) {
      badges.forEach(b => addToast(`🏅 Badge: ${b}`, 'badge'))
      setNewBadges(badges)
      setTimeout(() => setNewBadges([]), 3000)
    }
    const dmg = Math.floor(Math.random() * 15) + 20
    const newBoss = Math.max(0, bossHp - dmg)
    setBossHp(newBoss)
    setShake('boss'); setTimeout(() => setShake(null), 500)
    incrementQuests('volume')
    addToast(`⚔️ You dealt ${dmg} damage!`, 'xp')
    if (newBoss <= 0) setTimeout(() => setPhase('victory'), 700)
  }

  const onWrong = () => {
    playSound('wrong', 0.85)
    triggerFlash('flash-red')
    const dmg = Math.floor(Math.random() * 20) + 15
    const newPlayer = Math.max(0, playerHp - dmg)
    setPlayerHp(newPlayer)
    setShake('player'); setTimeout(() => setShake(null), 500)
    addToast(`💢 Boss deals ${dmg} damage!`, 'error')
    if (quizMode === 'sudden_death') {
      setTimeout(() => setPhase('defeat'), 700)
    } else if (newPlayer <= 0) {
      setTimeout(() => setPhase('defeat'), 700)
    }
  }

  const handleTimerExpire = useCallback(() => {
    if (result || openResult) return
    setTimerExp(true)
    setTimerPaused(true)
    playSound('wrong', 0.75)
    addToast('⏰ Time\'s up! The boss strikes!', 'error')
    onWrong()
  }, [result, openResult, playerHp, quizMode, playSound])

  const handleAnswer = async (idx: number) => {
    if (!question || submitting || result || timerExpired) return
    setSelected(idx)
    setSubmitting(true)
    setTimerPaused(true)
    try {
      const res = await quizzesAPI.answer({ question_id: question.id, selected_answer: idx, quiz_mode: quizMode })
      const r = res.data as AnswerResult
      setResult(r)
      seenIdsRef.current = [...seenIdsRef.current, question.id]
      await dungeonsAPI.updateMastery({ material_id: matId, topic: question.topic, question_id: question.id, is_correct: r.is_correct })
      if (r.is_correct) onCorrect(r.xp_gained, r.new_badges, r.new_total_xp)
      else onWrong()
    } finally { setSubmitting(false) }
  }

  const handleMatchingResult = async (correct: boolean) => {
    if (!question) return
    seenIdsRef.current = [...seenIdsRef.current, question.id]
    try {
      const res = await quizzesAPI.answer({ question_id: question.id, selected_answer: correct ? 0 : -1, quiz_mode: quizMode })
      const r = res.data as AnswerResult
      setResult(r)
      await dungeonsAPI.updateMastery({ material_id: matId, topic: question.topic, question_id: question.id, is_correct: r.is_correct })
      if (r.is_correct) onCorrect(r.xp_gained, r.new_badges, r.new_total_xp)
      else onWrong()
    } catch { /* ignore */ }
  }

  const handleOpenResult = async (r: OpenAnswerResult) => {
    setOpenResult(r)
    seenIdsRef.current = [...seenIdsRef.current, question!.id]
    await dungeonsAPI.updateMastery({ material_id: matId, topic: question!.topic, question_id: question!.id, is_correct: r.is_correct })
    if (r.is_correct) onCorrect(r.xp_gained, r.new_badges, r.new_total_xp)
    else onWrong()
  }

  const resetAndRetry = () => {
    playSound('click', 0.55)
    setBossHp(100)
    setPlayerHp(100)
    seenIdsRef.current = []
    setQuestion(null)
    setResult(null)
    setOpenResult(null)
    battleStarted.current = false
    setEntranceStep(0)
    setPhase('mode_pick')
  }

  const answered = !!(result || openResult)

  useEffect(() => {
    if (phase === 'victory') playSound('victory', 0.9)
    if (phase === 'defeat') playSound('defeat', 0.9)
  }, [phase, playSound])

  // ── Mode Picker ────────────────────────────────────────────────────────────
  if (phase === 'mode_pick') return <BossModePicker onStart={handleModeStart} />

  // ── Entrance ───────────────────────────────────────────────────────────────
  if (phase === 'entrance') return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflow: 'hidden' }}>
      {entranceStep >= 1 && <div className="fog-in" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 0% 50%, rgba(192,57,43,0.4) 0%, transparent 55%), radial-gradient(ellipse at 100% 50%, rgba(192,57,43,0.4) 0%, transparent 55%)' }} />}
      {entranceStep >= 2 && <div className="boss-drop" style={{ fontSize: 100, lineHeight: 1, marginBottom: 16, position: 'relative', zIndex: 2 }}>👹</div>}
      {entranceStep >= 3 && <h1 className="battle-text" style={{ fontFamily: 'Syne', fontSize: 38, fontWeight: 900, color: 'var(--red)', letterSpacing: '0.15em', textShadow: '0 0 40px rgba(192,57,43,0.8)', zIndex: 2, marginBottom: 8 }}>BOSS BATTLE</h1>}
      {entranceStep >= 4 && <p className="anim-up" style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', zIndex: 2, letterSpacing: '0.05em' }}>{bossName}</p>}
      {entranceStep >= 5 && <p className="anim-up" style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 8, zIndex: 2 }}>
        {quizMode === 'sudden_death' ? '💀 SUDDEN DEATH MODE' : quizMode === 'timed' ? `⏱️ ${timerSecs}s PER QUESTION` : 'MIXED QUESTION TYPES'}
      </p>}
    </div>
  )

  // ── Victory ────────────────────────────────────────────────────────────────
  if (phase === 'victory') return (
    <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
      <div className="scale-bounce" style={{ fontSize: 80, marginBottom: 16, display: 'inline-block' }}>🏆</div>
      <h1 className="h1 anim-up" style={{ fontSize: 32, color: 'var(--amber)', marginBottom: 8, textShadow: '0 0 30px rgba(232,160,48,0.5)' }}>Victory!</h1>
      <p className="anim-up" style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 6 }}>
        You defeated <strong style={{ color: 'var(--text)' }}>{bossName}</strong>
      </p>
      <p className="anim-up" style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 32 }}>
        <strong style={{ color: 'var(--amber)' }}>{dungeonTitle}</strong> is fully conquered.
      </p>
      <div className="anim-up" style={{ background: 'rgba(232,160,48,0.08)', border: '1px solid rgba(232,160,48,0.25)', borderRadius: 16, padding: 24, marginBottom: 28, display: 'flex', justifyContent: 'center', gap: 40 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Boss HP</p>
          <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)', fontFamily: 'JetBrains Mono' }}>0</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Your HP</p>
          <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--emerald)', fontFamily: 'JetBrains Mono' }}>{playerHp}</p>
        </div>
      </div>
      <button className="btn-primary" onClick={() => navigate('/dungeons')} style={{ fontSize: 15, padding: '14px 36px' }}>
        🗺️ Return to Dungeons
      </button>
    </div>
  )

  // ── Defeat ─────────────────────────────────────────────────────────────────
  if (phase === 'defeat') return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(60,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="scale-bounce" style={{ fontSize: 90, marginBottom: 20 }}>💀</div>
      <h1 style={{ fontFamily: 'Syne', fontSize: 34, fontWeight: 900, color: '#ff4444', letterSpacing: '0.1em', textShadow: '0 0 40px rgba(255,68,68,0.6)', marginBottom: 12 }}>
        {quizMode === 'sudden_death' ? 'SUDDEN DEATH!' : 'YOU HAVE FALLEN'}
      </h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', marginBottom: 40 }}>
        {bossName} has defeated you. Study and return stronger.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={resetAndRetry} style={{ fontSize: 14, padding: '13px 28px' }}>🔄 Try Again</button>
        {id && <button className="btn-ghost" onClick={() => navigate(`/dungeon/${id}`)} style={{ fontSize: 14, padding: '13px 24px' }}>← Retreat</button>}
      </div>
    </div>
  )

  // ── Battle ─────────────────────────────────────────────────────────────────
  const showTimer = quizMode === 'timed' && !answered && !timerExpired && !!question

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      {flashClass && <div className={flashClass} style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none', background: flashClass === 'flash-red' ? 'rgba(192,57,43,0.18)' : 'rgba(80,200,120,0.12)' }} />}
      {xpPops.map(p => (
        <div key={p.id} className="xp-pop" style={{ position: 'fixed', top: '20%', right: 60, zIndex: 300, fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 22, color: 'var(--amber)', textShadow: '0 0 12px rgba(232,160,48,0.7)', pointerEvents: 'none' }}>+{p.val} XP</div>
      ))}
      {newBadges.map(b => (
        <div key={b} className="anim-right" style={{ background: 'rgba(232,160,48,0.1)', border: '1px solid rgba(232,160,48,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>🏅</span>
          <p style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>Badge unlocked: {b}</p>
        </div>
      ))}

      {/* Mode badge */}
      {quizMode !== 'normal' && (
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: quizMode === 'sudden_death' ? 'rgba(192,57,43,0.15)' : 'rgba(245,158,11,0.15)', color: quizMode === 'sudden_death' ? 'var(--red)' : 'var(--amber)' }}>
            {quizMode === 'sudden_death' ? '💀 SUDDEN DEATH' : `⏱️ TIMED ${timerSecs}s`}
          </span>
        </div>
      )}

      {/* HP Bars */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ animation: shake === 'boss' ? 'door-shake 0.4s' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="torch">👹</span> {bossName}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {showTimer && <QuestionTimer seconds={timerSecs} onExpire={handleTimerExpire} paused={timerPaused || !!result || !!openResult} key="question-timer" />}
              <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', color: 'var(--red)' }}>{bossHp}/100</span>
            </div>
          </div>
          <div style={{ height: 10, background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${bossHp}%`, height: '100%', borderRadius: 6, transition: 'width 0.5s ease', background: 'linear-gradient(90deg, #c0392b, #e74c3c)' }} />
          </div>
        </div>
        <div style={{ animation: shake === 'player' ? 'door-shake 0.4s' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>⚔️ You</span>
            <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', color: 'var(--emerald)' }}>{playerHp}/100</span>
          </div>
          <div style={{ height: 10, background: 'rgba(80,200,120,0.1)', border: '1px solid rgba(80,200,120,0.2)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${playerHp}%`, height: '100%', borderRadius: 6, transition: 'width 0.5s ease', background: 'linear-gradient(90deg, #27ae60, #50c878)' }} />
          </div>
        </div>
      </div>

      {/* Question card */}
      <div key={question?.id} className={question && !questionLoading ? 'slide-right' : ''} style={{ background: 'var(--surface)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 18, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          <span className="chip-cyan" style={{ fontSize: 11 }}>⚔️ Boss Challenge</span>
          {question && (
            <>
              <span style={{ color: 'var(--text2)', fontSize: 11 }}>{question.topic}</span>
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text3)' }}>
                {question.question_type === 'true_false' ? '✅ T/F' : question.question_type === 'matching' ? '🔗 Matching' : question.question_type === 'open_ended' ? '✍️ Open' : '🔘 MCQ'}
              </span>
            </>
          )}
        </div>

        {questionLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <span className="spin" style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid var(--border2)', borderTopColor: 'var(--amber)', borderRadius: '50%' }} />
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>Summoning the next challenge...</p>
          </div>
        )}

        {question && !questionLoading && (
          <>
            <p style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6, marginBottom: 20, textAlign: 'center' }}>
              {question.question_text}
            </p>

            {/* Timer expired */}
            {timerExpired && (
              <div className="anim-up" style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(192,57,43,0.07)', marginBottom: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>⏰ Time's up! The boss strikes!</p>
              </div>
            )}

            {/* MCQ / True-False */}
            {!timerExpired && (question.question_type === 'mcq' || question.question_type === 'true_false') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {question.options.map((opt, idx) => {
                  const isCorrectResult = result && idx === result.correct_answer
                  const isWrongResult = result && idx === selected && !result.is_correct
                  const isSelected = !result && idx === selected
                  return (
                    <div key={idx} onClick={() => !result && !submitting && handleAnswer(idx)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12,
                      cursor: result ? 'default' : 'pointer',
                      border: `2px solid ${isCorrectResult ? 'var(--emerald)' : isWrongResult ? 'var(--red)' : isSelected ? 'var(--cyan)' : 'var(--border)'}`,
                      background: isCorrectResult ? 'rgba(80,200,120,0.1)' : isWrongResult ? 'rgba(192,57,43,0.1)' : isSelected ? 'rgba(232,160,48,0.1)' : 'var(--surface2)',
                      transition: 'all 0.15s',
                    }}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.08)', color: 'var(--text2)' }}>
                        {question.question_type === 'true_false' ? (idx === 0 ? 'T' : 'F') : LETTERS[idx]}
                      </span>
                      <span style={{ fontSize: 15, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{opt}</span>
                      {isCorrectResult && <span style={{ fontSize: 20, color: 'var(--emerald)' }}>✓</span>}
                      {isWrongResult && <span style={{ fontSize: 20, color: 'var(--red)' }}>✗</span>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Matching */}
            {!timerExpired && question.question_type === 'matching' && question.matching_pairs && (
              <BossMatchingQuestion pairs={question.matching_pairs} onSubmit={handleMatchingResult} />
            )}

            {/* Open-ended */}
            {!timerExpired && question.question_type === 'open_ended' && (
              <BossOpenQuestion question={question} quizMode={quizMode} onResult={handleOpenResult} />
            )}

            {/* Result feedback for MCQ/T-F/Matching */}
            {result && (question.question_type === 'mcq' || question.question_type === 'true_false' || question.question_type === 'matching') && (
              <div className="anim-up" style={{ marginTop: 20, padding: 16, borderRadius: 12, background: result.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)', border: `1px solid ${result.is_correct ? 'rgba(80,200,120,0.2)' : 'rgba(192,57,43,0.2)'}` }}>
                <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: result.is_correct ? 'var(--emerald)' : 'var(--red)' }}>
                  {result.is_correct ? `⚔️ Hit! Boss HP: ${bossHp}/100` : `💢 Boss strikes back! Your HP: ${playerHp}/100`}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{result.explanation}</p>
                {bossHp > 0 && playerHp > 0 && quizMode !== 'sudden_death' && (
                  <button className="btn-primary" onClick={loadQuestion} style={{ width: '100%', marginTop: 14, fontSize: 14, height: 44 }}>
                    Next Attack →
                  </button>
                )}
              </div>
            )}

            {/* Next button after open result */}
            {openResult && bossHp > 0 && playerHp > 0 && quizMode !== 'sudden_death' && (
              <button className="btn-primary" onClick={loadQuestion} style={{ width: '100%', marginTop: 14, fontSize: 14, height: 44 }}>
                Next Attack →
              </button>
            )}

            {/* Next button after timer expired */}
            {timerExpired && bossHp > 0 && playerHp > 0 && quizMode !== 'sudden_death' && (
              <button className="btn-primary" onClick={loadQuestion} style={{ width: '100%', marginTop: 14, fontSize: 14, height: 44 }}>
                Next Attack →
              </button>
            )}
          </>
        )}
      </div>

      {id && <button className="btn-ghost" onClick={() => navigate(`/dungeon/${id}`)} style={{ fontSize: 13, padding: '10px' }}>
        ← Retreat to Dungeon
      </button>}
    </div>
  )
}