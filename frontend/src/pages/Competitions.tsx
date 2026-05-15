// examai/frontend/src/pages/Competitions.tsx
// Real-time Quiz Competition Arena

import { useEffect, useState, useRef, useCallback } from 'react'
import { socialAPI, materialsAPI, quizzesAPI } from '../api'
import { useAuthStore } from '../store/authStore'
import { useSound } from '../hooks/useSound'
import { useToast } from '../components/Toast'

interface Competition {
  id: number; title: string; creator_id: number; creator_name: string
  material_id: number | null; status: string; max_players: number
  duration_s: number; participant_count: number; starts_at: string | null; created_at: string
  material_title?: string
}

interface Participant {
  user_id: number; name: string; rank: string; score: number; answered: number
}

interface Result {
  position: number; user_id: number; name: string; rank: string
  score: number; total: number; accuracy: number; xp_earned: number; finished_at: string | null
}

interface Question {
  id: number; question_text: string; options: string[]
  topic: string; question_type: string; correct_answer?: number
  explanation?: string
}

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--emerald)', active: 'var(--amber)', finished: 'var(--text3)',
}
const STATUS_ICON: Record<string, string> = { open: '🟢', active: '⚡', finished: '🏁' }

const LETTERS = ['A', 'B', 'C', 'D']

function fmt(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function Competitions() {
  const me = useAuthStore(s => s.user)
  const updateXP = useAuthStore(s => s.updateXP)
  const { playSound } = useSound()
  const { addToast } = useToast()

  const [tab, setTab] = useState<'open' | 'active' | 'finished'>('open')
  const [comps, setComps] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [materials, setMaterials] = useState<{ id: number; title: string }[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', material_id: '', max_players: '10', duration_s: '300' })

  // Active competition quiz state
  const [activeComp, setActiveComp] = useState<Competition | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; explanation: string } | null>(null)
  const [quizScore, setQuizScore] = useState(0)
  const [quizTotal, setQuizTotal] = useState(0)
  const [quizDone, setQuizDone] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [myRank, setMyRank] = useState<number | null>(null)
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await socialAPI.competitions(tab)
      // Fetch material titles for each competition
      const compsWithTitles = await Promise.all(
        res.data.map(async (comp: Competition) => {
          if (comp.material_id) {
            try {
              const matRes = await materialsAPI.get(comp.material_id)
              return { ...comp, material_title: matRes.data.title }
            } catch { return comp }
          }
          return comp
        })
      )
      setComps(compsWithTitles)
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    materialsAPI.list().then(r => setMaterials(r.data)).catch(() => {})
  }, [])

  // Poll for participant updates during active competition
  useEffect(() => {
    if (activeComp && activeComp.status === 'active' && !quizDone) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await socialAPI.competitionParticipants(activeComp.id)
          setParticipants(res.data)
          const myParticipant = res.data.find((p: Participant) => p.user_id === me?.id)
          if (myParticipant) {
            setQuizScore(myParticipant.score)
            setQuizTotal(myParticipant.answered)
            const rank = res.data.sort((a: Participant, b: Participant) => b.score - a.score)
              .findIndex((p: Participant) => p.user_id === me?.id) + 1
            setMyRank(rank)
          }
        } catch (err: any) {
          // Don't log 404 errors repeatedly
          if (err.response?.status !== 404) {
            console.error('Failed to fetch participants:', err)
          }
          // Optionally stop polling if endpoint doesn't exist
          if (err.response?.status === 404 && pollRef.current) {
            clearInterval(pollRef.current)
          }
        }
      }, 2000)
      return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }
  }, [activeComp, quizDone])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setCreating(true)
    try {
      await socialAPI.createCompetition({
        title: form.title,
        material_id: form.material_id ? Number(form.material_id) : undefined,
        max_players: Number(form.max_players),
        duration_s: Number(form.duration_s),
      })
      setShowCreate(false)
      setForm({ title: '', material_id: '', max_players: '10', duration_s: '300' })
      addToast('Competition created! Share the code with friends.', 'success')
      load()
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to create competition', 'error')
    } finally { setCreating(false) }
  }

  const handleJoin = async (comp: Competition) => {
    try {
      await socialAPI.joinCompetition(comp.id)
      addToast(`Joined ${comp.title}!`, 'success')
      load()
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to join', 'error')
    }
  }

  const handleStart = async (comp: Competition) => {
    try {
      await socialAPI.startCompetition(comp.id)
      addToast('Competition started! Get ready!', 'success')
      load()
      handleEnter(comp)
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to start', 'error')
    }
  }

  const handleEnter = async (comp: Competition) => {
    setActiveComp(comp)
    setQuizScore(0)
    setQuizTotal(0)
    setQuizDone(false)
    setCurrentQuestion(null)
    setSelectedAnswer(null)
    setAnswerResult(null)
    setTimeLeft(comp.duration_s)
    
    // Load first question
    await loadNextQuestion(comp)
    
    // Start timer
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          handleTimeUp()
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  const loadNextQuestion = async (comp: Competition) => {
    setQuestionLoading(true)
    setSelectedAnswer(null)
    setAnswerResult(null)
    try {
      const res = await quizzesAPI.next(
        comp.material_id || undefined,
        '', // seen_ids - will be managed by backend
        undefined, // topic
        false, // review_mode
        undefined // question_type - get mixed types
      )
      setCurrentQuestion(res.data)
    } catch (err) {
      // No more questions - finish competition
      handleSubmit()
    } finally {
      setQuestionLoading(false)
    }
  }

  const handleAnswer = async (answerIdx: number) => {
    if (!currentQuestion || selectedAnswer !== null || questionLoading) return
    
    setSelectedAnswer(answerIdx)
    playSound('click', 0.6)
    
    const isCorrect = answerIdx === currentQuestion.correct_answer
    
    try {
      // Record answer in competition
      const res = await socialAPI.recordAnswer(activeComp!.id, currentQuestion.id, isCorrect)
      setQuizScore(res.data.score)
      setQuizTotal(res.data.answered)
      
      setAnswerResult({
        correct: isCorrect,
        explanation: currentQuestion.explanation || (isCorrect ? 'Correct!' : 'Wrong answer!')
      })
      
      if (isCorrect) {
        playSound('correct', 0.8)
        addToast('✅ Correct! +10 points', 'xp')
      } else {
        playSound('wrong', 0.7)
        addToast(`❌ Wrong! The correct answer was: ${currentQuestion.options[currentQuestion.correct_answer || 0]}`, 'error')
      }
      
      // Load next question after delay
      setTimeout(async () => {
        await loadNextQuestion(activeComp!)
      }, 1500)
      
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to record answer', 'error')
    }
  }

  const handleTimeUp = async () => {
    addToast('⏰ Time\'s up! Submitting your final score...', 'error')
    await handleSubmit()
  }

  const handleSubmit = async () => {
    if (!activeComp || submitting) return
    setSubmitting(true)
    clearInterval(timerRef.current!)
    if (pollRef.current) clearInterval(pollRef.current)
    
    try {
      const res = await socialAPI.submitScore(activeComp.id, quizScore, quizTotal)
      updateXP((me?.xp ?? 0) + res.data.xp_earned)
      addToast(`🏁 Competition finished! You earned ${res.data.xp_earned} XP!`, 'success')
      
      const resultsRes = await socialAPI.results(activeComp.id)
      setResults(resultsRes.data.results)
      setQuizDone(true)
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to submit score', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Active competition overlay ────────────────────────────
  if (activeComp && !quizDone) {
    const pct = (timeLeft / activeComp.duration_s) * 100
    const urgent = timeLeft < 60
    
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header with timer and score */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p className="section-label" style={{ marginBottom: 4 }}>⚡ {activeComp.title}</p>
              {myRank && <p style={{ fontSize: 11, color: 'var(--text3)' }}>Current rank: #{myRank}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'JetBrains Mono', fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>
                {quizScore} pts
              </p>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>{quizTotal} answered</p>
            </div>
          </div>
          
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 8, transition: 'width 1s linear',
              width: `${pct}%`,
              background: urgent ? 'var(--red)' : 'linear-gradient(90deg, var(--cyan), var(--amber))',
            }} />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: urgent ? 'var(--red)' : 'var(--cyan)' }}>
              ⏱ {fmt(timeLeft)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>
              👥 {participants.length} players
            </span>
          </div>
        </div>

        {/* Live leaderboard */}
        {participants.length > 0 && (
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, padding: 16,
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase' }}>
              📊 Live Rankings
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {participants.slice(0, 5).map((p, idx) => {
                const isMe = p.user_id === me?.id
                return (
                  <div key={p.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '6px 10px', borderRadius: 8,
                    background: isMe ? 'rgba(56,189,248,0.1)' : 'transparent',
                  }}>
                    <span style={{ width: 30, fontSize: 14, fontWeight: 700, color: idx === 0 ? 'var(--amber)' : 'var(--text2)' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 700 : 400, color: 'var(--text)' }}>
                      {p.name} {isMe && '(you)'}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>
                      {p.score}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Question card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 28,
        }}>
          {questionLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="spin" style={{ display: 'inline-block', width: 28, height: 28, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
              <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text2)' }}>Loading next question...</p>
            </div>
          ) : currentQuestion ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <span className="chip-cyan" style={{ fontSize: 11 }}>
                  {currentQuestion.question_type === 'true_false' ? '✅ True/False' :
                   currentQuestion.question_type === 'matching' ? '🔗 Matching' :
                   currentQuestion.question_type === 'open_ended' ? '✍️ Open Ended' :
                   '🔘 Multiple Choice'}
                </span>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)' }}>{currentQuestion.topic}</span>
              </div>
              
              <p style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6, marginBottom: 24 }}>
                {currentQuestion.question_text}
              </p>

              {/* MCQ / True-False options */}
              {currentQuestion.options && currentQuestion.options.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentQuestion.options.map((opt, idx) => {
                    const isSelected = selectedAnswer === idx
                    const isCorrect = answerResult?.correct && isSelected
                    const isWrong = answerResult && !answerResult.correct && isSelected
                    
                    return (
                      <div
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px 18px', borderRadius: 12,
                          cursor: selectedAnswer !== null ? 'default' : 'pointer',
                          border: `2px solid ${
                            isCorrect ? 'var(--emerald)' :
                            isWrong ? 'var(--red)' :
                            isSelected ? 'var(--cyan)' : 'var(--border)'
                          }`,
                          background: isCorrect ? 'rgba(80,200,120,0.1)' :
                                     isWrong ? 'rgba(192,57,43,0.1)' :
                                     isSelected ? 'rgba(56,189,248,0.1)' : 'var(--surface2)',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: 6,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          background: 'rgba(255,255,255,0.08)',
                          color: 'var(--text2)',
                        }}>
                          {currentQuestion.question_type === 'true_false' ? (idx === 0 ? 'T' : 'F') : LETTERS[idx]}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--text)', flex: 1 }}>{opt}</span>
                        {isCorrect && <span style={{ fontSize: 20, color: 'var(--emerald)' }}>✓</span>}
                        {isWrong && <span style={{ fontSize: 20, color: 'var(--red)' }}>✗</span>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Result explanation */}
              {answerResult && (
                <div className="anim-up" style={{
                  marginTop: 20, padding: 14, borderRadius: 12,
                  background: answerResult.correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)',
                }}>
                  <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                    {answerResult.explanation}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>🏁</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>
                All questions answered!
              </p>
              <p className="t-secondary" style={{ fontSize: 13 }}>Your final score is being submitted...</p>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '14px', borderRadius: 12, border: '1px solid var(--amber)',
            background: 'rgba(232,160,48,0.1)', color: 'var(--amber)',
            fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.2)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.1)')}
        >
          {submitting ? 'Submitting...' : '🏁 Finish Early & Submit'}
        </button>
      </div>
    )
  }

  // ── Results overlay ───────────────────────────────────────
  if (activeComp && quizDone) {
    const myResult = results.find(r => r.user_id === me?.id)
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 28,
        }} className="anim-up">
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span style={{ fontSize: 48 }}>{myResult?.position === 1 ? '🏆' : myResult?.position === 2 ? '🥈' : myResult?.position === 3 ? '🥉' : '📊'}</span>
            <p className="section-label" style={{ marginTop: 8 }}>Competition Results — {activeComp.title}</p>
          </div>

          {myResult && (
            <div style={{
              background: 'rgba(232,160,48,0.08)', border: '1px solid rgba(232,160,48,0.2)',
              borderRadius: 12, padding: '14px 18px', marginBottom: 18,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <p style={{ fontWeight: 800, color: 'var(--text)', fontSize: 15 }}>Your result</p>
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>
                  Position #{myResult.position} · {myResult.score}/{myResult.total} correct
                  · {Math.round(myResult.accuracy * 100)}% accuracy
                </p>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, color: 'var(--amber)', fontSize: 20 }}>
                +{myResult.xp_earned} XP
              </p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Final Rankings</p>
            {results.map(r => (
              <div key={r.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '10px 14px', borderRadius: 10,
                background: r.user_id === me?.id ? 'rgba(56,189,248,0.08)' : 'var(--surface2)',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16, minWidth: 40, color: 'var(--text2)' }}>
                  {r.position <= 3 ? ['🥇', '🥈', '🥉'][r.position - 1] : `#${r.position}`}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    {r.name}{r.user_id === me?.id ? ' (you)' : ''}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {r.score}/{r.total} · {Math.round(r.accuracy * 100)}% accuracy
                  </p>
                </div>
                <p style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, color: 'var(--amber)', fontSize: 14 }}>
                  +{r.xp_earned} XP
                </p>
              </div>
            ))}
          </div>

          <button onClick={() => { setActiveComp(null); setQuizDone(false); load() }} style={{
            marginTop: 20, width: '100%', padding: '12px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}
          >
            ← Back to Arena
          </button>
        </div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '20px 26px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }} className="anim-up">
        <div>
          <h1 className="h1" style={{ fontSize: 22, marginBottom: 4 }}>⚡ Arena</h1>
          <p className="t-secondary" style={{ fontSize: 13 }}>Compete with other players in real-time quiz battles</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '9px 18px', borderRadius: 10,
          border: '1px solid var(--cyan)', background: 'rgba(56,189,248,0.08)',
          color: 'var(--cyan)', fontFamily: 'JetBrains Mono', fontSize: 12,
          fontWeight: 800, cursor: 'pointer', transition: 'all 0.18s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.16)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.08)')}
        >+ Create Competition</button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 24,
        }} className="anim-up">
          <p className="section-label" style={{ marginBottom: 16 }}>🏟️ New Competition</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Competition title (e.g., 'Friday Night Quiz Battle')"
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 14px', color: 'var(--text)', fontFamily: 'Manrope', fontSize: 13, outline: 'none',
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select value={form.material_id} onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none',
                }}>
                <option value="">🌍 Any dungeon (mixed questions)</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <select value={form.max_players} onChange={e => setForm(f => ({ ...f, max_players: e.target.value }))}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none',
                }}>
                <option value="4">4 players max</option>
                <option value="8">8 players max</option>
                <option value="12">12 players max</option>
                <option value="20">20 players max</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select value={form.duration_s} onChange={e => setForm(f => ({ ...f, duration_s: e.target.value }))}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none',
                }}>
                <option value="180">3 minutes</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
                <option value="900">15 minutes</option>
              </select>
              <div></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleCreate} disabled={creating || !form.title.trim()} style={{
                flex: 1, padding: '10px', borderRadius: 10,
                border: '1px solid var(--cyan)', background: 'rgba(56,189,248,0.1)',
                color: 'var(--cyan)', fontWeight: 800, cursor: 'pointer', fontSize: 13,
              }}>
                {creating ? 'Creating...' : '⚡ Create Competition'}
              </button>
              <button onClick={() => setShowCreate(false)} style={{
                padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13,
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['open', 'active', 'finished'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: 10, border: '1px solid',
            borderColor: tab === t ? STATUS_COLOR[t] : 'var(--border)',
            background: tab === t ? `${STATUS_COLOR[t]}15` : 'var(--surface)',
            color: tab === t ? STATUS_COLOR[t] : 'var(--text2)',
            fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            textTransform: 'capitalize', transition: 'all 0.15s',
          }}>
            {STATUS_ICON[t]} {t}
          </button>
        ))}
      </div>

      {/* Competitions list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <span className="spin" style={{ display: 'inline-block', width: 28, height: 28, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
        </div>
      ) : comps.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 40, textAlign: 'center',
        }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>⚔️</p>
          <p style={{ color: 'var(--text2)', fontSize: 14 }}>No {tab} competitions right now.</p>
          {tab === 'open' && (
            <button onClick={() => setShowCreate(true)} style={{
              marginTop: 16, padding: '8px 20px', borderRadius: 10,
              border: '1px solid var(--cyan)', background: 'rgba(56,189,248,0.1)',
              color: 'var(--cyan)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              + Create the first competition
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comps.map((c, i) => {
            const isCreator = c.creator_id === me?.id
            const isFull = c.participant_count >= c.max_players
            return (
              <div key={c.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 14, padding: '18px 22px',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              }} className={`anim-up d-${i % 4}`}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, fontFamily: 'JetBrains Mono',
                      color: STATUS_COLOR[c.status], background: `${STATUS_COLOR[c.status]}18`,
                      padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '.06em',
                    }}>
                      {STATUS_ICON[c.status]} {c.status}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>by {c.creator_name}</span>
                    {c.material_title && (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>📚 {c.material_title}</span>
                    )}
                  </div>
                  <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
                    {c.title}
                  </p>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono' }}>
                      ⏱ {fmt(c.duration_s)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono' }}>
                      👥 {c.participant_count}/{c.max_players} players
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {c.status === 'open' && !isCreator && !isFull && (
                    <button onClick={() => handleJoin(c)} style={{
                      padding: '8px 18px', borderRadius: 10, border: '1px solid var(--emerald)',
                      background: 'rgba(80,200,120,0.08)', color: 'var(--emerald)',
                      fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(80,200,120,0.18)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(80,200,120,0.08)')}
                    >Join Battle</button>
                  )}
                  {c.status === 'open' && isCreator && (
                    <button onClick={() => handleStart(c)} style={{
                      padding: '8px 18px', borderRadius: 10, border: '1px solid var(--amber)',
                      background: 'rgba(232,160,48,0.08)', color: 'var(--amber)',
                      fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.18)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.08)')}
                    >⚡ Start Now</button>
                  )}
                  {c.status === 'active' && (
                    <button onClick={() => handleEnter(c)} style={{
                      padding: '8px 18px', borderRadius: 10, border: '1px solid var(--amber)',
                      background: 'rgba(232,160,48,0.1)', color: 'var(--amber)',
                      fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(232,160,48,0.1)')}
                    >⚡ Enter Arena</button>
                  )}
                  {c.status === 'finished' && (
                    <button onClick={async () => {
                      const r = await socialAPI.results(c.id)
                      setResults(r.data.results); setActiveComp(c); setQuizDone(true)
                    }} style={{
                      padding: '8px 18px', borderRadius: 10, border: '1px solid var(--border)',
                      background: 'var(--surface2)', color: 'var(--text2)',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    >📊 View Results</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}