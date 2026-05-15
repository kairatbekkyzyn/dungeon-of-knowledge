import api from './client'

export const authAPI = {
  register:  (data: object) => api.post('/auth/register', data),
  verifyOtp: (data: object) => api.post('/auth/verify-otp', data),
  resendOtp: (data: object) => api.post('/auth/resend-otp', data),
  login:     (data: object) => api.post('/auth/login', data),
  me:        ()              => api.get('/auth/me'),
}

export const materialsAPI = {
  list:   () => api.get('/materials/'),
  get:    (id: number) => api.get(`/materials/${id}`),
  create: (data: { title: string; content: string; num_questions: number }) =>
    api.post('/materials/', data),
  upload: (formData: FormData) =>
    api.post('/materials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id: number) => api.delete(`/materials/${id}`),

  analyze: (formData: FormData) =>
    api.post('/materials/analyze', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  analyzeText: (data: { title: string; content: string; num_topics: number }) =>
    api.post('/materials/analyze-text', data),
  forgeWithTopics: (formData: FormData) =>
    api.post('/materials/forge-with-topics', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

export const quizzesAPI = {
  next: (
    materialId?: number,
    seenIds: string = "",
    topic?: string,
    reviewMode = false,
    questionType?: string,
  ) =>
    api.get('/quizzes/next', { params: {
      ...(materialId   ? { material_id:   materialId   } : {}),
      ...(seenIds      ? { seen_ids:      seenIds      } : {}),
      ...(topic        ? { topic                       } : {}),
      ...(reviewMode   ? { review_mode:   true         } : {}),
      ...(questionType ? { question_type: questionType } : {}),
    }}),

  answer: (data: {
    question_id: number;
    selected_answer: number;
    quiz_mode?: string;
  }) => api.post('/quizzes/answer', data),

  answerOpen: (data: {
    question_id: number;
    answer_text: string;
    quiz_mode?: string;
  }) => api.post('/quizzes/answer-open', data),

  badges: () => api.get('/quizzes/badges'),
}

export const statsAPI = {
  get: () => api.get('/stats/'),
}

export const dungeonsAPI = {
  list: () => api.get('/dungeons/'),
  rooms: (id: number) => api.get(`/dungeons/${id}/rooms`),
  updateMastery: (data: object) => api.post('/dungeons/mastery/update', data),
  monsterLog: () => api.get('/dungeons/monster-log'),
  getTopicSummary: (materialId: number, topic: string) =>
    api.get(`/dungeons/${materialId}/topics/${encodeURIComponent(topic)}/summary`),
}

export const questsAPI = {
  get:      ()                               => api.get('/quests/'),
  progress: (id: number, increment: number)  => api.post(`/quests/${id}/progress`, { increment }),
}

export async function incrementQuests(type: 'volume' | 'accuracy' | 'topic' | 'speed', amount = 1) {
  try {
    const res = await questsAPI.get()
    const quests: any[] = res.data
    await Promise.all(
      quests
        .filter(q => !q.completed && q.quest_type === type)
        .map(q => questsAPI.progress(q.id, amount))
    )
  } catch {
    // best-effort
  }
}

export const socialAPI = {
  leaderboard: (scope: 'global' | 'friends' = 'global', period: 'all' | 'week' = 'all') =>
    api.get('/social/leaderboard', { params: { scope, period } }),
  myRank: () =>
    api.get('/social/leaderboard/my-rank'),
  publicProfile: (userId: number) =>
    api.get(`/social/profile/${userId}`),
  friends: () =>
    api.get('/social/friends'),
  friendRequests: () =>
    api.get('/social/friends/requests'),
  sendFriendRequest: (addresseeId: number) =>
    api.post(`/social/friends/request/${addresseeId}`),
  respondToRequest: (friendshipId: number, action: 'accept' | 'reject') =>
    api.post(`/social/friends/respond/${friendshipId}`, null, { params: { action } }),
  removeFriend: (friendId: number) =>
    api.delete(`/social/friends/${friendId}`),
  searchUsers: (q: string) =>
    api.get('/social/search', { params: { q } }),
  competitions: (status: 'open' | 'active' | 'finished' | 'all' = 'open') =>
    api.get('/social/competitions', { params: { status } }),
  createCompetition: (data: { title: string; material_id?: number; max_players?: number; duration_s?: number }) =>
    api.post('/social/competitions', data),
  joinCompetition: (compId: number) =>
    api.post(`/social/competitions/${compId}/join`),
  startCompetition: (compId: number) =>
    api.post(`/social/competitions/${compId}/start`),
  submitScore: (compId: number, score: number, total: number) =>
    api.post(`/social/competitions/${compId}/submit`, { score, total }),
  results: (compId: number) =>
    api.get(`/social/competitions/${compId}/results`),
  competitionParticipants: (id: number) => 
    api.get(`/competitions/${id}/participants`),   
  recordAnswer: (compId: number, questionId: number, isCorrect: boolean) =>
    api.post(`/competitions/${compId}/answer`, { question_id: questionId, is_correct: isCorrect }),  
  joinCompetitionByCode: (code: string) =>
    api.post(`/competitions/join/${code}`),
}