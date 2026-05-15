import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { dungeonsAPI, quizzesAPI, incrementQuests } from '../api'
import { useAuthStore } from '../store/authStore'
import { useSound } from '../hooks/useSound'
import { useToast } from '../components/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Room {
  topic: string; mastery: number; state: string; question_count: number; accessible?: boolean
}
interface MatchingPair { term: string; definition: string }
interface Question {
  id: number; question_text: string; options: string[]
  topic: string; material_title?: string
  question_type: string        // mcq | true_false | matching | open_ended
  matching_pairs?: MatchingPair[]
  correct_answer?: number
  model_answer?: string
  key_concepts?: string[]
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
interface TopicSummary {
  topic: string; material_title: string
  total_questions: number; mastered_questions: number; mastery_percentage: number
  key_terms: Array<{term: string; definition: string}>
  topic_content: string
}

type QuizMode  = 'normal' | 'timed' | 'survival' | 'sudden_death'
type TimerSecs = 15 | 30 | 45
type Phase     = 'map' | 'mode_picker' | 'summary' | 'quiz' | 'results'
type DoorEmoji = '🚪' | '👹' | '✅'

const MAX_LIVES        = 3
const UNLOCK_THRESHOLD = 0.7
const LETTERS          = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// ─── Timer component ──────────────────────────────────────────────────────────
function QuestionTimer({
  seconds, onExpire, paused,
}: { seconds: number; onExpire: () => void; paused: boolean }) {
  const [left, setLeft] = useState(seconds)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLeft(seconds)
  }, [seconds])

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

  const pct  = (left / seconds) * 100
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

// ─── Mode Picker ──────────────────────────────────────────────────────────────
function ModePicker({
  room,
  onStart,
  onBack,
}: {
  room: Room
  onStart: (mode: QuizMode, timerSecs: TimerSecs) => void
  onBack: () => void
}) {
  const [selectedMode,  setMode]  = useState<QuizMode>('normal')
  const [timerSecs,     setTimer] = useState<TimerSecs>(30)

  const modes: { id: QuizMode; label: string; icon: string; desc: string }[] = [
    { id: 'normal',      label: 'Normal',      icon: '⚔️',  desc: 'Classic quiz — answer questions, gain XP' },
    { id: 'timed',       label: 'Timed',       icon: '⏱️',  desc: 'Answer before the clock runs out' },
    { id: 'survival',    label: 'Survival',    icon: '❤️',  desc: '3 hearts — wrong answer costs a life, combo multipliers' },
    { id: 'sudden_death',label: 'Sudden Death',icon: '💀',  desc: 'One wrong answer = back to entrance' },
  ]

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }} className="anim-up">
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, marginBottom: 20 }}>
        ← Back
      </button>

      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏰</div>
        <h2 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{room.topic}</h2>
        <p className="t-secondary" style={{ fontSize: 13 }}>Choose your challenge mode</p>
        <p className="t-muted" style={{ fontSize: 11, marginTop: 8 }}>Mixed question types: MCQ, True/False, Matching & Open-Ended</p>
      </div>

      {/* Mode */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Game Mode
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modes.map(m => (
            <div
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${selectedMode === m.id ? 'var(--cyan)' : 'var(--border)'}`,
                background: selectedMode === m.id ? 'rgba(56,189,248,0.07)' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', gap: 14,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 24 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: selectedMode === m.id ? 'var(--cyan)' : 'var(--text)', marginBottom: 2 }}>{m.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>{m.desc}</p>
              </div>
              {selectedMode === m.id && <span style={{ fontSize: 18, color: 'var(--cyan)' }}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Timer options for timed mode */}
      {selectedMode === 'timed' && (
        <div style={{ marginBottom: 24 }} className="anim-up">
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Time Per Question
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {([15, 30, 45] as TimerSecs[]).map(t => (
              <button
                key={t}
                onClick={() => setTimer(t)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 15, fontWeight: 700,
                  cursor: 'pointer',
                  border: `2px solid ${timerSecs === t ? 'var(--amber)' : 'var(--border)'}`,
                  background: timerSecs === t ? 'rgba(245,158,11,0.1)' : 'var(--surface2)',
                  color: timerSecs === t ? 'var(--amber)' : 'var(--text2)',
                  transition: 'all 0.15s',
                }}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={() => onStart(selectedMode, timerSecs)}
        style={{ width: '100%', fontSize: 16, padding: '14px 0', fontWeight: 800 }}
      >
        Enter Room →
      </button>
    </div>
  )
}

// ─── Matching Renderer ────────────────────────────────────────────────────────
function MatchingQuestion({
  pairs,
  disabled,
  onSubmit,
}: {
  pairs: MatchingPair[]
  disabled: boolean
  onSubmit: (correct: boolean, userMap: Record<string, string>) => void
}) {
  const [selected, setSelected]   = useState<string | null>(null)
  const [matched,  setMatched]    = useState<Record<string, string>>({})
  const [incorrect,setIncorrect]  = useState<string[]>([])
  const [submitted,setSubmitted]  = useState(false)

  const terms       = pairs.map((p, i) => p.term?.trim() || `Term ${i + 1}`)
  const definitions = [...pairs.map((p, i) => p.definition?.trim() || `Definition ${i + 1}`)].sort(() => Math.random() - 0.5)
  const [shuffled]  = useState(definitions)

  const handleTermClick = (term: string) => {
    if (disabled || submitted) return
    setSelected(prev => prev === term ? null : term)
  }

  const handleDefClick = (def: string) => {
    if (disabled || submitted || !selected) return
    const existing = Object.entries(matched).find(([, d]) => d === def)
    const newMap = { ...matched }
    if (existing) delete newMap[existing[0]]
    newMap[selected] = def
    setMatched(newMap)
    setSelected(null)
  }

  const handleSubmit = () => {
    if (Object.keys(matched).length < pairs.length) return
    const correctMap: Record<string, string> = {}
    pairs.forEach(p => { correctMap[p.term] = p.definition })
    const wrong = pairs.filter(p => matched[p.term] !== p.definition).map(p => p.term)
    setIncorrect(wrong)
    setSubmitted(true)
    const allCorrect = wrong.length === 0
    onSubmit(allCorrect, matched)
  }

  const termColor = (term: string) => {
    if (!submitted) return selected === term ? 'var(--cyan)' : matched[term] ? 'var(--amber)' : 'var(--border)'
    return incorrect.includes(term) ? 'var(--red)' : 'var(--emerald)'
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, textAlign: 'center' }}>
        {submitted ? '' : 'Tap a term, then tap its matching definition.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {terms.map(term => (
            <div
              key={term}
              onClick={() => handleTermClick(term)}
              style={{
                padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: `2px solid ${termColor(term)}`,
                background: selected === term ? 'rgba(56,189,248,0.1)' : 'var(--surface2)',
                cursor: submitted ? 'default' : 'pointer',
                transition: 'all 0.15s',
                minHeight: 52, display: 'flex', alignItems: 'center',
              }}
            >
              {term}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shuffled.map(def => {
            const linkedTerm = Object.entries(matched).find(([, d]) => d === def)?.[0]
            const isWrongDef = submitted && linkedTerm && incorrect.includes(linkedTerm)
            const isCorrectDef = submitted && linkedTerm && !incorrect.includes(linkedTerm)
            return (
              <div
                key={def}
                onClick={() => handleDefClick(def)}
                style={{
                  padding: '10px 12px', borderRadius: 10, fontSize: 12,
                  border: `2px solid ${isCorrectDef ? 'var(--emerald)' : isWrongDef ? 'var(--red)' : linkedTerm ? 'var(--amber)' : selected ? 'rgba(56,189,248,0.4)' : 'var(--border)'}`,
                  background: isCorrectDef ? 'rgba(80,200,120,0.08)' : isWrongDef ? 'rgba(192,57,43,0.08)' : linkedTerm ? 'rgba(245,158,11,0.07)' : 'var(--surface2)',
                  cursor: submitted ? 'default' : selected ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                  minHeight: 52, display: 'flex', alignItems: 'center',
                  color: 'var(--text2)',
                }}
              >
                {def}
              </div>
            )
          })}
        </div>
      </div>

      {!submitted && (
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={Object.keys(matched).length < pairs.length}
          style={{ width: '100%', marginTop: 16, opacity: Object.keys(matched).length < pairs.length ? 0.5 : 1 }}
        >
          Submit Matches ({Object.keys(matched).length}/{pairs.length})
        </button>
      )}
    </div>
  )
}

// ─── Open-Ended Renderer ──────────────────────────────────────────────────────
function OpenEndedQuestion({
  question,
  disabled,
  quizMode,
  onResult,
}: {
  question: Question
  disabled: boolean
  quizMode: string
  onResult: (result: OpenAnswerResult) => void
}) {
  const [text,       setText]    = useState('')
  const [submitting, setSub]     = useState(false)
  const [judged,     setJudged]  = useState<OpenAnswerResult | null>(null)

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return
    setSub(true)
    try {
      const res = await quizzesAPI.answerOpen({
        question_id: question.id,
        answer_text: text,
        quiz_mode: quizMode,
      })
      const r = res.data as OpenAnswerResult
      setJudged(r)
      onResult(r)
    } finally {
      setSub(false)
    }
  }

  const scoreColor = judged
    ? judged.score >= 0.8 ? 'var(--emerald)' : judged.score >= 0.5 ? 'var(--amber)' : 'var(--red)'
    : 'var(--text)'

  return (
    <div>
      {!judged ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={disabled || submitting}
            placeholder="Type your answer here…"
            rows={4}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'vertical',
              border: '2px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', fontSize: 14, lineHeight: 1.6,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{ width: '100%', marginTop: 10, opacity: !text.trim() ? 0.5 : 1 }}
          >
            {submitting ? 'AI Judging…' : 'Submit Answer'}
          </button>
        </>
      ) : (
        <div className="anim-up">
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: judged.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)',
            border: `1px solid ${judged.is_correct ? 'rgba(80,200,120,0.3)' : 'rgba(192,57,43,0.3)'}`,
            marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{judged.is_correct ? '✅' : judged.score >= 0.5 ? '🟡' : '❌'}</span>
              <span style={{ fontWeight: 700, color: scoreColor }}>
                Score: {Math.round(judged.score * 100)}% — {judged.is_correct ? 'Correct!' : judged.score >= 0.5 ? 'Partial Credit' : 'Incorrect'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{judged.feedback}</p>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Model Answer
            </p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{judged.correct_answer}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Results Screen ───────────────────────────────────────────────────────────
function ResultsScreen({
  correctCount,
  totalQuestions,
  onBackToMap,
  onRetry,
}: {
  correctCount: number
  totalQuestions: number
  onBackToMap: () => void
  onRetry: () => void
}) {
  const wrongCount = totalQuestions - correctCount
  const percentage = Math.round((correctCount / totalQuestions) * 100)

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', paddingTop: 40 }} className="anim-up">
      <div style={{ fontSize: 64, marginBottom: 16 }}>
        {percentage >= 80 ? '🏆' : percentage >= 60 ? '📚' : '📖'}
      </div>
      <h2 className="h2" style={{ marginBottom: 8, color: 'var(--amber)' }}>Quiz Complete!</h2>
      
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: 24, marginTop: 20,
        border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, color: 'var(--emerald)' }}>✓</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--emerald)' }}>{correctCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Correct</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, color: 'var(--red)' }}>✗</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{wrongCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Wrong</div>
          </div>
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(90deg, var(--cyan), var(--emerald))', borderRadius: 4 }} />
          </div>
          <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>{percentage}% Accuracy</p>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn-primary" onClick={onRetry} style={{ fontSize: 14, padding: '12px 24px' }}>
            🔄 Try Again
          </button>
          <button className="btn-ghost" onClick={onBackToMap} style={{ fontSize: 14, padding: '12px 24px' }}>
            ← Back to Map
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DungeonInterior() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const { updateXP } = useAuthStore()
  const { playSound } = useSound()
  const { addToast } = useToast()
  const matId        = Number(id)

  const [dungeon,       setDungeon]      = useState<any>(null)
  const [rooms,         setRooms]        = useState<Room[]>([])
  const [phase,         setPhase]        = useState<Phase>('map')
  const [activeRoom,    setActiveRoom]   = useState<Room | null>(null)
  const [topicSummary,  setSummary]      = useState<TopicSummary | null>(null)
  const [question,      setQuestion]     = useState<Question | null>(null)
  const [result,        setResult]       = useState<AnswerResult | null>(null)
  const [openResult,    setOpenResult]   = useState<OpenAnswerResult | null>(null)
  const [selected,      setSelected]     = useState<number | null>(null)

  // mode / config
  const [quizMode,      setQuizMode]     = useState<QuizMode>('normal')
  const [timerSecs,     setTimerSecs]    = useState<TimerSecs>(30)
  const [timerPaused,   setTimerPaused]  = useState(false)
  const [timerExpired,  setTimerExpired] = useState(false)

  const [lives,         setLives]        = useState(MAX_LIVES)
  const [combo,         setCombo]        = useState(0)
  
  // Track stats for current quiz session
  const [correctCount,  setCorrectCount] = useState(0)
  const [wrongCount,    setWrongCount]   = useState(0)
  const [totalQuestionsAnswered, setTotalQuestionsAnswered] = useState(0)
  
  // Track seen IDs to avoid repetition
  const seenIdsRef = useRef<number[]>([])
  const [quizCompleted, setQuizCompleted] = useState(false)

  const getSeenIds = useCallback((): string => seenIdsRef.current.join(','), [])

  const addSeenId = useCallback((id: number) => {
    if (!seenIdsRef.current.includes(id)) {
      seenIdsRef.current = [...seenIdsRef.current, id]
    }
  }, [])

  const resetSeenIds = useCallback(() => {
    seenIdsRef.current = []
  }, [])

  const [doorEmoji,     setDoorEmoji]    = useState<DoorEmoji>('🚪')
  const [doorAnim,      setDoorAnim]     = useState('')
  const [loading,       setLoading]      = useState(true)
  const [qLoading,      setQLoading]     = useState(false)
  const [submitting,    setSubmitting]   = useState(false)
  const [newBadges,     setNewBadges]    = useState<string[]>([])
  const [xpPop,         setXpPop]        = useState<number | null>(null)
  const [flashClass,    setFlashClass]   = useState('')
  const [bossUnlocked,  setBossUnlocked] = useState(false)
  const [isDead,        setIsDead]       = useState(false)
  const [currentRoom,   setCurrentRoom]  = useState<Room | null>(null)
  const [quizError,     setQuizError]    = useState<string | null>(null)
  const [comboEffect,   setComboEffect]  = useState(false)
  const [sdKicked,      setSdKicked]     = useState(false)

  useEffect(() => { loadDungeonData() }, [matId])

  const loadDungeonData = async () => {
    const r = await dungeonsAPI.rooms(matId)
    setDungeon(r.data)
    setRooms(calcAccess(r.data.rooms))
    setBossUnlocked(r.data.boss_unlocked)
    setLoading(false)
  }

  const calcAccess = (rms: Room[]) =>
    rms.map((r, i) => ({ ...r, accessible: i === 0 || rms[i - 1].mastery >= UNLOCK_THRESHOLD }))

  const refreshRooms = useCallback(async () => {
    const r = await dungeonsAPI.rooms(matId)
    setRooms(calcAccess(r.data.rooms))
    setBossUnlocked(r.data.boss_unlocked)
  }, [matId])

  const loadQuestion = useCallback(async (topic: string, isReview = false) => {
    setQuizError(null)
    setQuestion(null)
    setQLoading(true)
    setDoorEmoji('🚪'); setDoorAnim('')
    setTimerPaused(false); setTimerExpired(false)
    try {
      const res = await quizzesAPI.next(
        matId,
        getSeenIds(),
        topic,
        isReview,
        undefined,
      )
      setQuestion(res.data)
    } catch (err: any) {
      if (err.response?.status === 404) {
        // No more questions available - quiz is complete
        setQuestion(null)
        setQuizCompleted(true)
      } else {
        setQuestion(null)
        setQuizError('Failed to load question. Please try again.')
      }
    } finally {
      setQLoading(false)
    }
  }, [matId, getSeenIds])

  const enterRoom = async (room: Room) => {
    if (!room.accessible) return
    setDoorAnim('door-creak'); setTimeout(() => setDoorAnim(''), 300)
    setFlashClass('flash-dark'); setTimeout(() => setFlashClass(''), 400)
    setActiveRoom(room)
    setPhase('mode_picker')
  }

  const handleModeStart = (mode: QuizMode, tSecs: TimerSecs) => {
    setQuizMode(mode)
    setTimerSecs(tSecs)
    const room = activeRoom!
    loadTopicSummary(room, mode, tSecs)
  }

  const loadTopicSummary = async (room: Room, mode: QuizMode, tSecs: TimerSecs) => {
    try {
      const res = await dungeonsAPI.getTopicSummary(matId, room.topic)
      setSummary(res.data)
      setActiveRoom(room)
      setPhase('summary')
    } catch {
      addToast('Failed to load study material. Starting quiz directly.', 'error')
      startQuiz(room, false, mode, tSecs)
    }
  }

  const startQuiz = (room: Room, isReview = false, mode = quizMode, tSecs = timerSecs) => {
    playSound('dungeonOpen', 0.75)
    setPhase('quiz')
    setQuestion(null)
    setResult(null); setOpenResult(null); setSelected(null)
    setIsDead(false); setSdKicked(false); setQuizCompleted(false)
    setLives(MAX_LIVES)
    setCombo(0); resetSeenIds()
    setCorrectCount(0); setWrongCount(0); setTotalQuestionsAnswered(0)
    setDoorEmoji('🚪'); setDoorAnim('')
    setCurrentRoom(room)
    setQuizMode(mode)
    setTimerSecs(tSecs)
    loadQuestion(room.topic, isReview)
  }

  const handleTimerExpire = useCallback(() => {
    if (result || openResult || !question || quizCompleted) return
    addSeenId(question.id)
    setTimerPaused(true)
    setFlashClass('flash-red'); setTimeout(() => setFlashClass(''), 400)
    setDoorEmoji('👹'); setTimeout(() => setDoorEmoji('🚪'), 800)
    setCombo(0)
    
    // Mark as wrong
    setWrongCount(c => c + 1)
    setTotalQuestionsAnswered(c => c + 1)
    
    if (quizMode === 'normal') {
      // Check if quiz is complete
      const room = currentRoom || activeRoom
      if (room && totalQuestionsAnswered + 1 >= room.question_count) {
        setQuizCompleted(true)
        setQuestion(null)
        return
      }
      // Auto-load next question after delay
      setTimeout(() => nextQuestion(), 1500)
    } else if (quizMode === 'sudden_death') {
      setTimeout(() => setSdKicked(true), 900)
    } else if (quizMode === 'survival') {
      const newLives = lives - 1
      setLives(newLives)
      if (newLives <= 0) {
        setTimeout(() => setIsDead(true), 900)
      } else {
        setTimeout(() => nextQuestion(), 1500)
      }
    } else if (quizMode === 'timed') {
      setTimerExpired(true)
      // Show the correct answer before moving on
      setTimeout(() => nextQuestion(), 2000)
    }
    
    addToast('⏰ Time\'s up!', 'error', true)
  }, [result, openResult, lives, quizMode, question, addSeenId, currentRoom, activeRoom, totalQuestionsAnswered, quizCompleted])

  const processCorrectAnswer = (xp: number, newBadgeList: string[], newTotalXp: number) => {
    setCorrectCount(c => c + 1)
    setTotalQuestionsAnswered(c => c + 1)
    playSound('correct', 0.85)
    
    let finalXP = xp
    let bonus = 0
    
    if (quizMode === 'survival') {
      const multiplier = combo >= 9 ? 3 : combo >= 4 ? 2 : combo >= 2 ? 1.5 : 1
      bonus = Math.floor(xp * (multiplier - 1))
      finalXP = xp + bonus
      if (multiplier > 1) { setComboEffect(true); setTimeout(() => setComboEffect(false), 600) }
      setCombo(c => c + 1)
    } else {
      setCombo(0)
    }
    
    updateXP(newTotalXp + bonus)
    setFlashClass('flash-green'); setTimeout(() => setFlashClass(''), 400)
    setDoorAnim('door-open'); setTimeout(() => setDoorAnim(''), 500)
    setDoorEmoji('✅'); setTimeout(() => setDoorEmoji('🚪'), 1000)
    setXpPop(finalXP); setTimeout(() => setXpPop(null), 1500)
    addToast(bonus > 0 ? `+${xp} XP + ${bonus} bonus!` : `+${finalXP} XP`, 'xp')
    incrementQuests('volume')
    if (newBadgeList?.length > 0) {
      newBadgeList.forEach(b => addToast(`🏅 Badge: ${b}`, 'badge'))
      setNewBadges(newBadgeList)
    }
  }

  const processWrongAnswer = (xp: number, newTotalXp: number) => {
    setWrongCount(c => c + 1)
    setTotalQuestionsAnswered(c => c + 1)
    playSound('wrong', 0.85)
    updateXP(newTotalXp)
    setFlashClass('flash-red'); setTimeout(() => setFlashClass(''), 400)
    setDoorAnim('door-shake'); setTimeout(() => setDoorAnim(''), 400)
    setDoorEmoji('👹'); setTimeout(() => setDoorEmoji('🚪'), 800)
    setCombo(0)
    
    if (quizMode === 'normal') {
      addToast(`+${xp} XP`, 'xp')
    } else if (quizMode === 'sudden_death') {
      setTimeout(() => setSdKicked(true), 900)
    } else if (quizMode === 'survival') {
      const newLives = lives - 1
      setLives(newLives)
      addToast(`+${xp} XP (combo broken)`, 'error', true)
      if (newLives <= 0) setTimeout(() => setIsDead(true), 900)
    } else {
      addToast(`+${xp} XP`, 'xp')
    }
  }

  const handleAnswer = async (idx: number) => {
    if (!question || submitting || result || timerExpired || quizCompleted) return
    setSelected(idx); setSubmitting(true); setTimerPaused(true)
    try {
      const res = await quizzesAPI.answer({
        question_id: question.id,
        selected_answer: idx,
        quiz_mode: quizMode,
      })
      const r = res.data as AnswerResult
      setResult(r)
      addSeenId(question.id)

      await dungeonsAPI.updateMastery({
        material_id: matId, topic: question.topic,
        question_id: question.id, is_correct: r.is_correct,
      })

      if (r.is_correct) processCorrectAnswer(r.xp_gained, r.new_badges, r.new_total_xp)
      else              processWrongAnswer(r.xp_gained, r.new_total_xp)
      
      // Auto-advance after 1.5 seconds (except sudden death and survival when dead)
      const shouldAutoAdvance = 
        (quizMode === 'normal') ||
        (quizMode === 'timed') ||
        (quizMode === 'survival' && lives > 0 && r.is_correct) ||
        (quizMode === 'survival' && lives > 1 && !r.is_correct) ||
        (quizMode === 'sudden_death' && r.is_correct)
      
      if (shouldAutoAdvance) {
        // Check if quiz is complete
        const room = currentRoom || activeRoom
        if (room && totalQuestionsAnswered + 1 >= room.question_count) {
          setTimeout(() => {
            setQuizCompleted(true)
            setQuestion(null)
          }, 1500)
        } else {
          setTimeout(() => nextQuestion(), 1500)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenResult = async (r: OpenAnswerResult) => {
    setOpenResult(r)
    addSeenId(question!.id)
    setTimerPaused(true)

    await dungeonsAPI.updateMastery({
      material_id: matId, topic: question!.topic,
      question_id: question!.id, is_correct: r.is_correct,
    })

    if (r.is_correct) processCorrectAnswer(r.xp_gained, r.new_badges, r.new_total_xp)
    else              processWrongAnswer(r.xp_gained, r.new_total_xp)
    
    // Auto-advance
    const shouldAutoAdvance = 
      (quizMode === 'normal') ||
      (quizMode === 'timed') ||
      (quizMode === 'survival' && lives > 0 && r.is_correct) ||
      (quizMode === 'survival' && lives > 1 && !r.is_correct) ||
      (quizMode === 'sudden_death' && r.is_correct)
    
    if (shouldAutoAdvance) {
      const room = currentRoom || activeRoom
      if (room && totalQuestionsAnswered + 1 >= room.question_count) {
        setTimeout(() => {
          setQuizCompleted(true)
          setQuestion(null)
        }, 1500)
      } else {
        setTimeout(() => nextQuestion(), 1500)
      }
    }
  }

  const handleMatchingResult = async (correct: boolean) => {
    if (!question) return
    try {
      const res = await quizzesAPI.answer({
        question_id: question.id,
        selected_answer: correct ? 0 : -1,
        quiz_mode: quizMode,
      })
      const r = res.data as AnswerResult
      setResult(r)
      addSeenId(question.id)

      await dungeonsAPI.updateMastery({
        material_id: matId, topic: question.topic,
        question_id: question.id, is_correct: r.is_correct,
      })

      if (r.is_correct) processCorrectAnswer(r.xp_gained, r.new_badges, r.new_total_xp)
      else              processWrongAnswer(r.xp_gained, r.new_total_xp)
      
      // Auto-advance
      const shouldAutoAdvance = 
        (quizMode === 'normal') ||
        (quizMode === 'timed') ||
        (quizMode === 'survival' && lives > 0 && r.is_correct) ||
        (quizMode === 'survival' && lives > 1 && !r.is_correct) ||
        (quizMode === 'sudden_death' && r.is_correct)
      
      if (shouldAutoAdvance) {
        const room = currentRoom || activeRoom
        if (room && totalQuestionsAnswered + 1 >= room.question_count) {
          setTimeout(() => {
            setQuizCompleted(true)
            setQuestion(null)
          }, 1500)
        } else {
          setTimeout(() => nextQuestion(), 1500)
        }
      }
    } catch { /* ignore */ }
  }

  const nextQuestion = () => {
    setResult(null); setOpenResult(null); setSelected(null)
    setDoorEmoji('🚪'); setDoorAnim('')
    setTimerExpired(false)
    setTimerPaused(false)
    
    const room = currentRoom || activeRoom
    if (room && totalQuestionsAnswered >= room.question_count) {
      setQuizCompleted(true)
      setQuestion(null)
      return
    }
    loadQuestion(activeRoom!.topic, false)
  }

  const backToMap = () => {
    setPhase('map'); setResult(null); setOpenResult(null); setSelected(null)
    setIsDead(false); setSdKicked(false); setSummary(null); setQuizCompleted(false)
    setDoorEmoji('🚪'); setDoorAnim(''); setCurrentRoom(null)
    refreshRooms()
  }

  const comboMultiplier = combo >= 9 ? 3 : combo >= 4 ? 2 : combo >= 2 ? 1.5 : 1

  // ── Results Screen ──────────────────────────────────────────────────────────
  if (quizCompleted && currentRoom) {
    const total = correctCount + wrongCount
    return (
      <ResultsScreen
        correctCount={correctCount}
        totalQuestions={total}
        onBackToMap={backToMap}
        onRetry={() => startQuiz(currentRoom, false, quizMode, timerSecs)}
      />
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <span className="spin" style={{ display: 'inline-block', width: 36, height: 36, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
        <p className="t-secondary" style={{ marginTop: 16, fontSize: 14 }}>Entering dungeon…</p>
      </div>
    </div>
  )

  // ── Sudden Death kick ─────────────────────────────────────────────────────
  if (sdKicked) return (
    <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 60 }} className="anim-up">
      <div style={{ fontSize: 80, marginBottom: 20 }}>💀</div>
      <h2 className="h2" style={{ color: 'var(--red)', marginBottom: 8, fontSize: 28 }}>Sudden Death!</h2>
      <p className="t-secondary" style={{ fontSize: 14, marginBottom: 24 }}>
        One wrong answer ends your run.<br />
        You answered <strong style={{ color: 'var(--emerald)' }}>{correctCount}</strong> correctly before falling.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn-primary" onClick={() => startQuiz(currentRoom || activeRoom!, false, 'sudden_death', timerSecs)} style={{ fontSize: 14, padding: '12px 28px' }}>
          💀 Try Again
        </button>
        <button className="btn-ghost" onClick={backToMap} style={{ fontSize: 14, padding: '12px 24px' }}>
          ← Back to Map
        </button>
      </div>
    </div>
  )

  // ── Death screen ──────────────────────────────────────────────────────────
  if (isDead) return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', paddingTop: 60 }} className="anim-up">
      <div style={{ fontSize: 80, marginBottom: 20 }}>💀</div>
      <h2 className="h2" style={{ color: 'var(--red)', marginBottom: 8, fontSize: 28 }}>You have fallen!</h2>
      <p className="t-secondary" style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
        The dungeon has defeated you in <strong style={{ color: 'var(--text)' }}>{currentRoom?.topic || activeRoom?.topic}</strong>.
      </p>
      <p className="t-secondary" style={{ fontSize: 13, marginBottom: 32 }}>
        You answered <strong style={{ color: 'var(--emerald)' }}>{correctCount}</strong> correctly before falling.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn-primary" onClick={async () => {
          const room = currentRoom || activeRoom
          if (room) {
            try {
              const res = await dungeonsAPI.getTopicSummary(matId, room.topic)
              setSummary(res.data); setActiveRoom(room); setPhase('summary'); setIsDead(false); setCurrentRoom(null)
            } catch { backToMap() }
          }
        }} style={{ fontSize: 14, padding: '12px 28px' }}>
          📖 Study First
        </button>
        <button className="btn-ghost" onClick={backToMap} style={{ fontSize: 14, padding: '12px 24px' }}>
          ← Back to Dungeon Map
        </button>
      </div>
    </div>
  )

  // ── Mode Picker ───────────────────────────────────────────────────────────
  if (phase === 'mode_picker' && activeRoom) return (
    <ModePicker
      room={activeRoom}
      onStart={handleModeStart}
      onBack={() => setPhase('map')}
    />
  )

  // ── Study Summary ─────────────────────────────────────────────────────────
  if (phase === 'summary' && topicSummary) {
    const isMastered = topicSummary.mastery_percentage >= 100
    const cleanText = (text: string) => {
      if (!text) return ""
      let c = text.replace(/\n{3,}/g, '\n\n')
      c = c.replace(/(?<![.!?])\n(?![0-9])/g, ' ')
      c = c.replace(/\s+/g, ' ').trim()
      const sentences = c.split(/(?<=[.!?])\s+/)
      const paragraphs = []
      for (let i = 0; i < sentences.length; i += 4) {
        const p = sentences.slice(i, i + 4).join(' ')
        if (p.length > 50) paragraphs.push(p)
      }
      return paragraphs.slice(0, 3).join('\n\n')
    }

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, overflow: 'auto' }} onClick={backToMap}>
        <div style={{ maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 24, padding: 32, border: '2px solid var(--cyan)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📚</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Syne', marginBottom: 8 }}>{topicSummary.topic}</h1>
            <p className="t-secondary" style={{ fontSize: 13 }}>{topicSummary.material_title}</p>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>📊 Progress</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>{Math.round(topicSummary.mastery_percentage)}%</span>
            </div>
            <div style={{ height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${topicSummary.mastery_percentage}%`, height: '100%', background: topicSummary.mastery_percentage >= 100 ? 'linear-gradient(90deg,var(--emerald),#00ff88)' : 'linear-gradient(90deg,var(--amber),var(--cyan))', borderRadius: 5, transition: 'width 0.5s' }} />
            </div>
          </div>

          {topicSummary.topic_content && (
            <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 14, background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cyan)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📖 Study Notes</p>
              {cleanText(topicSummary.topic_content).split('\n\n').map((p, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 10 }}>{p}</p>
              ))}
            </div>
          )}

          {topicSummary.key_terms?.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔑 Key Terms</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topicSummary.key_terms.map((kt, i) => (
                  <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 700, color: 'var(--amber)', fontSize: 13, minWidth: 100, flexShrink: 0 }}>{kt.term}</span>
                    <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{kt.definition}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" onClick={() => startQuiz(activeRoom!, isMastered)} style={{ flex: 1, fontSize: 14, padding: '12px 0' }}>
              {isMastered ? '🔄 Review Mode' : '⚔️ Start Quiz'}
            </button>
            <button className="btn-ghost" onClick={backToMap} style={{ fontSize: 14, padding: '12px 20px' }}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Dungeon Map ───────────────────────────────────────────────────────────
  if (phase === 'map') return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button onClick={() => navigate('/dungeons')} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>← Dungeons</button>
        <h1 style={{ fontFamily: 'Syne', fontSize: 22, fontWeight: 800, flex: 1 }}>{dungeon?.dungeon_title || 'Dungeon'}</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rooms.map((room, idx) => {
          const isLocked   = !room.accessible
          const isMastered = room.mastery >= 1.0
          return (
            <div key={room.topic} onClick={() => !isLocked && enterRoom(room)} style={{
              borderRadius: 16, border: `2px solid ${isMastered ? 'rgba(80,200,120,0.3)' : isLocked ? 'var(--border)' : 'var(--border2)'}`,
              background: isLocked ? 'rgba(255,255,255,0.01)' : 'var(--surface)',
              padding: '18px 20px', cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: isMastered ? 'rgba(80,200,120,0.15)' : isLocked ? 'rgba(255,255,255,0.05)' : 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {isMastered ? '✅' : isLocked ? '🔒' : '🚪'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{room.topic}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${room.mastery * 100}%`, height: '100%', background: isMastered ? 'var(--emerald)' : 'var(--amber)', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono' }}>{Math.round(room.mastery * 100)}%</span>
                </div>
              </div>
              <div>
                {isMastered ? (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(80,200,120,0.12)', color: 'var(--emerald)' }}>✅ MASTERED · Review →</span>
                ) : isLocked ? (
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>🔒 70% needed</span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--amber)' }}>Enter →</span>
                )}
              </div>
            </div>
          )
        })}

        {bossUnlocked && (
          <div onClick={() => navigate(`/dungeon/${id}/boss`)} style={{ borderRadius: 16, border: '2px solid rgba(192,57,43,0.4)', background: 'rgba(192,57,43,0.06)', padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 40 }}>👹</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: 'var(--red)' }}>BOSS ROOM — {dungeon?.dungeon_title} Guardian</p>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>All rooms mastered! The guardian awaits.</p>
            </div>
            <span style={{ fontSize: 20, color: 'var(--red)' }}>⚔️</span>
          </div>
        )}
      </div>
    </div>
  )

  // ── Quiz screen ───────────────────────────────────────────────────────────
  const answered = !!(result || openResult)
  const showTimer = quizMode === 'timed' && !answered && !timerExpired && !!question

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* HUD */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 18px' }}>
        <button onClick={backToMap} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
          ← {activeRoom?.topic}
        </button>

        {/* Stats: Show correct/wrong count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'var(--emerald)' }}>✓</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{correctCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'var(--red)' }}>✗</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{wrongCount}</span>
          </div>
        </div>

        {/* Lives or mode indicator */}
        {quizMode === 'sudden_death' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 20 }}>💀</span>
            <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>SUDDEN DEATH</span>
          </div>
        ) : quizMode === 'survival' ? (
          <div style={{ display: 'flex', gap: 5 }}>
            {[1, 2, 3].map(h => (
              <span key={h} style={{ fontSize: 20, opacity: h <= lives ? 1 : 0.3 }}>
                {h <= lives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        ) : quizMode === 'timed' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>⏱️</span>
            <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>TIMED</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>⚔️</span>
            <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>NORMAL</span>
          </div>
        )}

        {/* Timer or combo */}
        {showTimer ? (
          <QuestionTimer seconds={timerSecs} onExpire={handleTimerExpire} paused={timerPaused} key={question?.id} />
        ) : quizMode === 'survival' && combo >= 2 ? (
          <div style={{ 
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            background: comboEffect ? 'var(--amber)' : 'var(--cyan)', borderRadius: '50%',
            transition: 'background 0.2s'
          }}>
            <span style={{ fontSize: 12, color: '#fff' }}>{comboMultiplier}×</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            {correctCount + wrongCount}/{currentRoom?.question_count || 0}
          </div>
        )}
      </div>

      {/* Mode badge detail */}
      {quizMode !== 'normal' && !showTimer && (
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: quizMode === 'sudden_death' ? 'rgba(192,57,43,0.15)' : quizMode === 'timed' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.1)', color: quizMode === 'sudden_death' ? 'var(--red)' : quizMode === 'timed' ? 'var(--amber)' : 'var(--cyan)' }}>
            {quizMode === 'sudden_death' ? '💀 SUDDEN DEATH' : quizMode === 'timed' ? `⏱️ TIMED ${timerSecs}s` : '❤️ SURVIVAL'}
          </span>
        </div>
      )}

      {newBadges.map(b => (
        <div key={b} className="anim-right" style={{ background: 'rgba(232,160,48,0.1)', border: '1px solid rgba(232,160,48,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏅</span>
          <p style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 700 }}>Badge unlocked: {b}</p>
        </div>
      ))}

      {/* Flash overlay */}
      {flashClass && (
        <div className={flashClass} style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none', background: flashClass === 'flash-red' ? 'rgba(192,57,43,0.18)' : 'rgba(80,200,120,0.12)' }} />
      )}

      {/* XP pop */}
      {xpPop && (
        <div className="xp-pop" style={{ position: 'fixed', top: '20%', right: '40px', zIndex: 999, fontSize: 22, fontWeight: 800, color: 'var(--amber)', fontFamily: 'JetBrains Mono', textShadow: '0 0 12px rgba(232,160,48,0.7)', pointerEvents: 'none' }}>
          +{xpPop} XP
        </div>
      )}

      {/* Question card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, textAlign: 'center', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <span className={doorAnim} style={{ display: 'inline-block', fontSize: 64 }}>{doorEmoji}</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="chip-cyan" style={{ fontSize: 11 }}>🏰 {activeRoom?.topic}</span>
          {question && (
            <span style={{ marginLeft: 8, fontSize: 11, padding: '3px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text3)' }}>
              {question.question_type === 'true_false' ? '✅ T/F'
                : question.question_type === 'matching'   ? '🔗 Matching'
                : question.question_type === 'open_ended' ? '✍️ Open'
                : '🔘 MCQ'}
            </span>
          )}
        </div>

        {qLoading && (
          <div style={{ padding: '40px 0' }}>
            <span className="spin" style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid var(--border2)', borderTopColor: 'var(--cyan)', borderRadius: '50%' }} />
          </div>
        )}

        {!qLoading && question && (
          <p key={question.id} className="slide-right" style={{ fontFamily: 'Syne', fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.6, marginBottom: 20 }}>
            {question.question_text}
          </p>
        )}

        {!qLoading && !question && !quizCompleted && (
          <div style={{ padding: '30px 0' }} className="anim-up">
            {quizError ? (
              <>
                <p style={{ fontSize: 48, marginBottom: 12 }}>⚠️</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>
                  No Questions Available
                </p>
                <p className="t-secondary" style={{ fontSize: 14, marginBottom: 24 }}>
                  {quizError}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={() => { setPhase('mode_picker'); setQuizError(null); }} style={{ fontSize: 14, padding: '10px 24px' }}>
                    ← Choose another mode
                  </button>
                  <button className="btn-ghost" onClick={backToMap} style={{ fontSize: 14, padding: '10px 24px' }}>
                    Back to Dungeon Map
                  </button>
                </div>
              </>
            ) : (
              <p className="t-secondary">Loading question...</p>
            )}
          </div>
        )}

        {/* ── Renderers by question type ── */}
        {!qLoading && question && !timerExpired && !quizCompleted && (
          <>
            {/* MCQ & True/False */}
            {(question.question_type === 'mcq' || question.question_type === 'true_false') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {question.options.map((opt, idx) => {
                  const isCorrectResult = result && idx === result.correct_answer
                  const isWrongResult   = result && idx === selected && !result.is_correct
                  const isSelected      = !result && idx === selected
                  return (
                    <div key={idx} onClick={() => !result && !submitting && handleAnswer(idx)} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 12,
                      cursor: result ? 'default' : 'pointer',
                      border: `2px solid ${isCorrectResult ? 'var(--emerald)' : isWrongResult ? 'var(--red)' : isSelected ? 'var(--cyan)' : 'var(--border)'}`,
                      background: isCorrectResult ? 'rgba(80,200,120,0.1)' : isWrongResult ? 'rgba(192,57,43,0.1)' : isSelected ? 'rgba(232,160,48,0.1)' : 'var(--surface2)',
                    }}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.08)', color: 'var(--text2)' }}>
                        {question.question_type === 'true_false' ? (idx === 0 ? 'T' : 'F') : LETTERS[idx] ?? String.fromCharCode(65 + idx)}
                      </span>
                      <span style={{ fontSize: 15, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{opt}</span>
                      {isCorrectResult && <span style={{ fontSize: 20, color: 'var(--emerald)' }}>✓</span>}
                      {isWrongResult   && <span style={{ fontSize: 20, color: 'var(--red)' }}>✗</span>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Matching */}
            {question.question_type === 'matching' && question.matching_pairs && (
              <MatchingQuestion
                pairs={question.matching_pairs}
                disabled={!!result}
                onSubmit={(correct) => handleMatchingResult(correct)}
              />
            )}

            {/* Open-ended */}
            {question.question_type === 'open_ended' && (
              <OpenEndedQuestion
                question={question}
                disabled={false}
                quizMode={quizMode}
                onResult={handleOpenResult}
              />
            )}
          </>
        )}

        {/* Timer expired — show correct answer */}
        {!qLoading && question && timerExpired && !quizCompleted && (
          <div className="anim-up" style={{ marginTop: 8, padding: 16, borderRadius: 14, background: 'rgba(192,57,43,0.07)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>⏰ Time's up!</p>
            {question.question_type !== 'open_ended' && question.question_type !== 'matching' && (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Correct answer: <strong style={{ color: 'var(--emerald)' }}>{question.options[question.correct_answer || 0]}</strong>
              </p>
            )}
          </div>
        )}

        {/* Result feedback - just shows the result, no Next button (auto-advance) */}
        {result && (question?.question_type === 'mcq' || question?.question_type === 'true_false' || question?.question_type === 'matching') && (
          <div className="anim-up" style={{ marginTop: 20, padding: 16, borderRadius: 14, background: result.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: result.is_correct ? 'var(--emerald)' : 'var(--red)', marginBottom: 8 }}>
              {result.is_correct ? '✅ Correct!' : 
                quizMode === 'normal' ? '❌ Wrong!' : 
                quizMode === 'sudden_death' ? '💀 Wrong! Run ended.' : 
                `❌ Wrong! ${lives} ${lives === 1 ? 'life' : 'lives'} remaining.`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{result.explanation}</p>
            <p className="t-muted" style={{ fontSize: 11, marginTop: 8 }}>Next question loading...</p>
          </div>
        )}

        {/* Open-ended result feedback */}
        {openResult && (
          <div className="anim-up" style={{ marginTop: 20, padding: 16, borderRadius: 14, background: openResult.is_correct ? 'rgba(80,200,120,0.07)' : 'rgba(192,57,43,0.07)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: openResult.is_correct ? 'var(--emerald)' : 'var(--red)', marginBottom: 8 }}>
              {openResult.is_correct ? '✅ Correct!' : 
                quizMode === 'normal' ? '❌ Wrong!' : 
                quizMode === 'sudden_death' ? '💀 Wrong! Run ended.' : 
                `❌ Wrong! ${lives} ${lives === 1 ? 'life' : 'lives'} remaining.`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{openResult.feedback}</p>
            <p className="t-muted" style={{ fontSize: 11, marginTop: 8 }}>Next question loading...</p>
          </div>
        )}
      </div>
    </div>
  )
}