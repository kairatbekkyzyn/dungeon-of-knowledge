import { useState, useRef, DragEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSound } from '../hooks/useSound'
import { materialsAPI } from '../api'

type ForgePhase = 'idle' | 'analyzing' | 'preview' | 'forging' | 'reading' | 'shaping' | 'sealing' | 'done'

const FILE_ICONS: Record<string,string> = {
  pdf:'📄', docx:'📝', txt:'📃', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', webp:'🖼️'
}

const PHASES: Record<ForgePhase, { label: string; icon: string }> = {
  idle:      { label: '', icon: '' },
  analyzing: { label: 'Analyzing your material…', icon: '🔍' },
  preview:   { label: 'Review your dungeon blueprint', icon: '📋' },
  forging:   { label: 'Forging the dungeon…', icon: '⚒️' },
  reading:   { label: 'Reading the ancient tomes…', icon: '📖' },
  shaping:   { label: 'Carving rooms from knowledge…', icon: '🏗️' },
  sealing:   { label: 'Sealing with arcane magic…', icon: '🔒' },
  done:      { label: 'Your dungeon is ready!', icon: '🏰' },
}

interface TopicPreview {
  topic: string
  estimated_questions: number
  sample_question: string
}

interface DungeonBlueprint {
  title: string
  total_questions: number
  topics: TopicPreview[]
  summary: string
  estimated_difficulty: 'easy' | 'medium' | 'hard'
}

export default function Forge() {
  const navigate   = useNavigate()
  const { playSound } = useSound()
  const fileRef    = useRef<HTMLInputElement>(null)
  const [tab, setTab]           = useState<'file'|'text'>('file')
  const [file, setFile]         = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [title, setTitle]       = useState('')
  const [content, setContent]   = useState('')
  const [numTopics, setNumTopics] = useState(4)  // Number of topics/rooms
  const [questionsPerTopic, setQuestionsPerTopic] = useState(5) // Questions per room
  const [phase, setPhase]       = useState<ForgePhase>('idle')
  const [error, setError]       = useState('')
  const [doneId, setDoneId]     = useState<number | null>(null)
  const [blueprint, setBlueprint] = useState<DungeonBlueprint | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const acceptFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['pdf','docx','txt','jpg','jpeg','png','webp'].includes(ext)) {
      setError('Unsupported file. Use PDF, DOCX, TXT, JPG, PNG, or WEBP.')
      return
    }
    setFile(f); setError('')
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g,' '))
  }

  // Step 1: Analyze material to get topic preview
  const analyzeMaterial = async () => {
    if (tab === 'file' && !file) { 
      setError('Please select a file.'); 
      return 
    }
    if (tab === 'text' && content.length < 100) { 
      setError('Need at least 100 characters.'); 
      return 
    }
    if (!title.trim()) { 
      setError('Please enter a dungeon title.'); 
      return 
    }

    setError('')
    setIsAnalyzing(true)
    setPhase('analyzing')
    playSound('forgeStart', 0.75)

    try {
      let response: any
      if (tab === 'file') {
        const fd = new FormData()
        fd.append('file', file!)
        fd.append('title', title)
        fd.append('num_topics', String(numTopics))
        response = await materialsAPI.analyze(fd)
      } else {
        response = await materialsAPI.analyzeText({ 
          title, 
          content, 
          num_topics: numTopics 
        })
      }
      
      setBlueprint(response.data)
      setPhase('preview')
    } catch (err: any) {
      setPhase('idle')
      setError(err.response?.data?.detail ?? 'Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Step 2: Forge the dungeon with user's per-topic settings
  const handleForge = async () => {
    if (!blueprint) return
    
    setPhase('forging')
    playSound('click', 0.55)
    
    // Start the visual sequence — phases advance automatically,
    // but the API response will always cut to 'done' immediately when ready
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setPhase('reading'),  500))
    timers.push(setTimeout(() => setPhase('shaping'), 2500))
    timers.push(setTimeout(() => setPhase('sealing'), 5000))
    phaseTimerRef.current = timers

    try {
      // Prepare topics config with user's chosen questions per topic
      const topicsConfig = blueprint.topics.map(topic => ({
        name: topic.topic,
        questions: questionsPerTopic
      }))

      let response: any
      if (tab === 'file') {
        const fd = new FormData()
        fd.append('file', file!)
        fd.append('title', title)
        fd.append('topics_config', JSON.stringify(topicsConfig))
        response = await materialsAPI.forgeWithTopics(fd)
      } else {
        const fd = new FormData()
        fd.append('content', content)
        fd.append('title', title)
        fd.append('topics_config', JSON.stringify(topicsConfig))
        response = await materialsAPI.forgeWithTopics(fd)
      }
      
      // Clear timers and show done screen immediately
      phaseTimerRef.current.forEach(t => clearTimeout(t))
      phaseTimerRef.current = []
      setDoneId(response.data.id)
      setPhase('done')
      playSound('forgeComplete', 0.8)
    } catch (err: any) {
      phaseTimerRef.current.forEach(t => clearTimeout(t))
      phaseTimerRef.current = []
      setPhase('preview')
      setError(err.response?.data?.detail ?? 'Forging failed. Check your API key or try a smaller file.')
    }
  }

  const goBackToEdit = () => {
    setPhase('idle')
    setBlueprint(null)
    setError('')
  }

  const totalQuestions = blueprint ? blueprint.topics.length * questionsPerTopic : 0

  // ────────────────────────────────────────────────────────────
  // PREVIEW SCREEN - Shows blueprint before forging
  // ────────────────────────────────────────────────────────────
  if (phase === 'preview' && blueprint) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="anim-up">
          <button onClick={goBackToEdit} style={{
            background: 'none', border: 'none', color: 'var(--text2)',
            cursor: 'pointer', fontSize: 13, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            ← Back to edit
          </button>
          
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,160,48,0.1), rgba(180,120,255,0.05))',
            borderRadius: 20, padding: 24, border: '1px solid rgba(232,160,48,0.2)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <span style={{ fontSize: 48 }}>📋</span>
              <h1 className="h1" style={{ fontSize: 24, marginTop: 8 }}>Dungeon Blueprint</h1>
              <p className="t-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                Review your dungeon before forging
              </p>
            </div>

            {/* Dungeon Summary */}
            <div style={{
              background: 'var(--surface2)', borderRadius: 12, padding: 20, marginBottom: 20
            }}>
              <h3 style={{ fontFamily: 'Syne', fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                🏰 {blueprint.title}
              </h3>
              <p className="t-secondary" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                {blueprint.summary}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span className="chip-cyan" style={{ fontSize: 11 }}>
                  📚 {blueprint.topics.length} topics
                </span>
                <span className="chip-cyan" style={{ fontSize: 11 }}>
                  ❓ {totalQuestions} total questions
                </span>
                <span className="chip-cyan" style={{ fontSize: 11 }}>
                  ⚔️ Difficulty: {blueprint.estimated_difficulty}
                </span>
                <span className="chip-cyan" style={{ fontSize: 11 }}>
                  🎲 Mixed question types (MCQ, T/F, Matching, Open)
                </span>
              </div>
            </div>

            {/* Questions per topic control */}
            <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--surface)', borderRadius: 12 }}>
              <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
                Questions per room:
              </label>
              <input
                type="range"
                min={3}
                max={12}
                value={questionsPerTopic}
                onChange={(e) => setQuestionsPerTopic(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span className="t-muted" style={{ fontSize: 11 }}>3 questions</span>
                <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>{questionsPerTopic} questions per room</span>
                <span className="t-muted" style={{ fontSize: 11 }}>12 questions</span>
              </div>
              <p className="t-muted" style={{ fontSize: 11, marginTop: 8 }}>
                Total: {totalQuestions} questions across {blueprint.topics.length} rooms
              </p>
            </div>

            {/* Topics breakdown */}
            <h3 style={{ fontFamily: 'Syne', fontSize: 16, marginBottom: 16 }}>
              🧩 Rooms to conquer
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              {blueprint.topics.map((topic, idx) => (
                <div key={idx} style={{
                  background: 'var(--surface)', borderRadius: 12, padding: 16,
                  border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 24, marginRight: 12 }}>
                      {['📚', '⚡', '🔮', '💎', '🗡️', '🛡️', '🏹', '🧙'][idx % 8]}
                    </span>
                    <strong style={{ color: 'var(--text)', fontSize: 15, flex: 1 }}>{topic.topic}</strong>
                    <span className="chip-cyan" style={{ fontSize: 11 }}>
                      {questionsPerTopic} questions
                    </span>
                  </div>
                  
                  {topic.sample_question && (
                    <div style={{
                      background: 'rgba(232,160,48,0.05)', borderRadius: 8, padding: 10,
                      marginTop: 8, fontSize: 12, color: 'var(--text2)'
                    }}>
                      <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Sample: </span>
                      {topic.sample_question}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Forging controls */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-ghost" onClick={() => { playSound('click', 0.55); goBackToEdit() }} style={{ flex: 1 }}>
                ✏️ Edit Material
              </button>
              <button className="btn-primary" onClick={handleForge} style={{ flex: 2 }}>
                ⚒️ Forge Dungeon ({totalQuestions} questions)
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // FORGING ANIMATION SCREEN
  // ────────────────────────────────────────────────────────────
  if (phase !== 'idle' && phase !== 'done' && phase !== 'preview') {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <div style={{
          width: 120, height: 120, borderRadius: 24, margin: '0 auto 28px',
          background: 'linear-gradient(135deg, rgba(192,57,43,0.3), rgba(232,160,48,0.2))',
          border: '2px solid rgba(232,160,48,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56,
        }} className="forge-active torch">
          {PHASES[phase]?.icon || '⚒️'}
        </div>

        <h2 className="h2" style={{ marginBottom: 8, color: 'var(--amber)' }}>
          {PHASES[phase]?.icon} {PHASES[phase]?.label}
        </h2>
        <p className="t-secondary" style={{ fontSize: 13, marginBottom: 32 }}>
          {phase === 'analyzing' && 'The AI is reading your material and planning the dungeon layout…'}
          {phase === 'forging' && 'Carving your knowledge into dungeon rooms…'}
          {phase === 'reading' && 'Ancient texts are being transcribed into knowledge…'}
          {phase === 'shaping' && 'Each topic becomes a room filled with challenges…'}
          {phase === 'sealing' && 'The dungeon is stabilizing. Soon it will be ready…'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)',
              animation: `torch-flicker ${1 + i*0.3}s ease-in-out infinite`,
              animationDelay: `${i*0.2}s`
            }}/>
          ))}
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // DONE SCREEN
  // ────────────────────────────────────────────────────────────
  if (phase === 'done' && doneId) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 80, marginBottom: 20 }} className="anim-up">🏰</div>
        <h2 className="h2 anim-up" style={{ marginBottom: 8, color: 'var(--amber)', animationDelay: '0.1s' }}>
          Dungeon Forged!
        </h2>
        <p className="t-secondary anim-up" style={{ fontSize: 14, marginBottom: 8, animationDelay: '0.2s' }}>
          <strong style={{ color: 'var(--text)' }}>{title}</strong> is ready to explore.
        </p>
        <p className="t-secondary anim-up" style={{ fontSize: 13, marginBottom: 32, animationDelay: '0.3s' }}>
          {blueprint?.topics.length} rooms • {totalQuestions} questions • Difficulty: {blueprint?.estimated_difficulty} • Mixed question types
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }} className="anim-up">
          <button className="btn-primary" onClick={() => { playSound('dungeonOpen', 0.8); navigate(`/dungeon/${doneId}`) }}
            style={{ fontSize: 14, padding: '12px 28px' }}>
            ⚔️ Enter Dungeon →
          </button>
          <button className="btn-ghost" onClick={() => {
            playSound('click', 0.55)
            setPhase('idle'); setBlueprint(null); setFile(null); setTitle(''); setContent('')
          }} style={{ fontSize: 14, padding: '12px 20px' }}>
            ⚒️ Forge Another
          </button>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────
  // MAIN FORGE FORM (IDLE)
  // ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div>
        <h1 className="h1" style={{ marginBottom: 4 }}>⚒️ The Forge</h1>
        <p className="t-secondary" style={{ fontSize: 13 }}>
          Upload your study material — the AI will carve it into a dungeon of questions
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid rgba(232,160,48,0.2)',
        borderRadius: 20, padding: 28
      }}>
        <div style={{
          display: 'flex', background: 'var(--surface2)', borderRadius: 12,
          padding: 4, marginBottom: 24, gap: 4, border: '1px solid var(--border)'
        }}>
          {(['file','text'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} style={{
              flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'Manrope', fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
              background: tab===t ? 'var(--surface)' : 'transparent',
              color: tab===t ? 'var(--text)' : 'var(--text2)',
              boxShadow: tab===t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none'
            }}>
              {t==='file' ? '📁 Upload File' : '📋 Paste Text'}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            background: 'var(--red-dim)', border: '1px solid rgba(192,57,43,0.25)',
            borderRadius: 10, padding: '11px 15px', marginBottom: 18,
            color: 'var(--red)', fontSize: 13
          }}>⚠ {error}</div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); analyzeMaterial(); }} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {tab === 'file' ? (
            <>
              <div
                className={`drop-zone${dragging ? ' dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e: DragEvent<HTMLDivElement>) => {
                  e.preventDefault(); setDragging(false)
                  const f = e.dataTransfer.files[0]; if (f) acceptFile(f)
                }}
              >
                <input ref={fileRef} type="file"
                  accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
                  style={{ display:'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f) }}/>
                {file ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:44 }}>{FILE_ICONS[file.name.split('.').pop()!.toLowerCase()] ?? '📎'}</span>
                    <p style={{ color:'var(--text)', fontWeight:600, fontSize:14 }}>{file.name}</p>
                    <p className="t-secondary" style={{ fontSize:12 }}>{(file.size/1024).toFixed(0)} KB</p>
                    <button type="button" onClick={e => { e.stopPropagation(); setFile(null) }}
                      style={{
                        background:'rgba(192,57,43,0.1)', border:'1px solid rgba(192,57,43,0.2)',
                        color:'var(--red)', borderRadius:8, padding:'4px 12px',
                        cursor:'pointer', fontSize:12, fontFamily:'Manrope', fontWeight:600
                      }}>✕ Remove</button>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:48 }}>📜</span>
                    <p style={{ color:'var(--text)', fontWeight:600, fontSize:15 }}>Drop your tome here</p>
                    <p className="t-secondary" style={{ fontSize:13 }}>or click to browse</p>
                    <div style={{ display:'flex', gap:8 }}>
                      {['PDF','DOCX','TXT','JPG','PNG'].map(t => (
                        <span key={t} style={{
                          fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6,
                          background:'rgba(180,120,255,0.1)', color:'var(--purple)',
                          border:'1px solid rgba(180,120,255,0.2)'
                        }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Dungeon Name</label>
                <input className="input" type="text"
                  placeholder="e.g. Database Systems Chapter 3"
                  value={title} onChange={e => setTitle(e.target.value)}/>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Dungeon Name</label>
                <input className="input" type="text" required
                  placeholder="e.g. Operating Systems Lecture 4"
                  value={title} onChange={e => setTitle(e.target.value)}/>
              </div>
              <div>
                <label className="label">Your Study Material</label>
                <textarea className="input"
                  placeholder="Paste your lecture notes, textbook text, or any study material here…"
                  value={content} onChange={e => setContent(e.target.value)} required
                  rows={6}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                  <span className="t-muted" style={{ fontSize:11 }}>{content.length} characters</span>
                  {content.length > 0 && content.length < 100 && (
                    <span style={{ fontSize:11, color:'var(--amber)' }}>{100-content.length} more needed</span>
                  )}
                  {content.length >= 100 && (
                    <span style={{ fontSize:11, color:'var(--emerald)' }}>✓ Ready</span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Number of topics control */}
          <div>
            <label className="label">
              Number of topics to extract —{' '}
              <span style={{ color:'var(--text)', fontFamily:'JetBrains Mono' }}>{numTopics}</span>
            </label>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <span className="t-muted" style={{ fontSize:11 }}>3</span>
              <input type="range" min={3} max={10} value={numTopics}
                onChange={e => setNumTopics(Number(e.target.value))}
                style={{ flex:1, accentColor:'var(--cyan)', cursor:'pointer' }}/>
              <span className="t-muted" style={{ fontSize:11 }}>10</span>
            </div>
            <p className="t-muted" style={{ fontSize:11, marginTop:4 }}>
              Each topic becomes a dungeon room
            </p>
          </div>

          <button type="submit" className="btn-primary"
            style={{ width:'100%', height:48, fontSize:15, marginTop:4 }}
            disabled={isAnalyzing}>
            {isAnalyzing ? '🔍 Analyzing...' : '📋 Preview Dungeon →'}
          </button>
        </form>
      </div>
    </div>
  )
}