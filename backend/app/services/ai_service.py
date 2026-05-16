import os
import json
import httpx
from typing import List, Optional
from groq import AsyncGroq

GROQ_API_KEY  = os.getenv("GROQ_API_KEY") or os.getenv("OPENAI_API_KEY")
GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL      = "llama-3.3-70b-versatile"
GROQ_FAST_MODEL = "llama-3.1-8b-instant"


def _clean(raw: str) -> str:
    return raw.replace("```json", "").replace("```", "").strip()


async def _chat(prompt: str, system: str = "You are a JSON-only response system. Return only valid JSON.", fast: bool = True) -> str:
    client = AsyncGroq(api_key=GROQ_API_KEY)
    model  = GROQ_FAST_MODEL if fast else GROQ_MODEL
    resp   = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.7,
    )
    return resp.choices[0].message.content


async def generate_all_question_types_for_topic(
    content: str, 
    title: str, 
    topic: str,
    num_questions: int,
) -> List[dict]:
    """
    Generate a mix of all 4 question types for a topic in a single API call.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    
    # Calculate distribution
    n_mcq   = max(1, round(num_questions * 0.40))
    n_tf    = max(1, round(num_questions * 0.25))
    n_match = max(1, round(num_questions * 0.20))
    n_open  = max(1, num_questions - n_mcq - n_tf - n_match)
    
    prompt = f"""You are an expert teacher creating quiz questions.

CRITICAL INSTRUCTION: Generate questions ONLY about this specific topic: "{topic}"
IGNORE all other topics in the material. Every question MUST be directly about "{topic}".

Material Title: {title}
Target Topic (MUST focus only on this): {topic}

Target: Generate exactly {num_questions} questions with this distribution:
- {n_mcq} Multiple Choice Questions (MCQ) about "{topic}"
- {n_tf} True/False Questions about "{topic}"
- {n_match} Matching Questions about "{topic}" (each with exactly 4 term-definition pairs)
- {n_open} Open-ended Short Answer Questions about "{topic}"

Material Content (find information about "{topic}" here, ignore other topics):
{content[:12000]}

IMPORTANT: 
1. EVERY question MUST be about "{topic}" - nothing else
2. Do NOT mix topics from outside "{topic}"
3. Return ONLY valid JSON. No markdown, no explanations.

Use EXACTLY these field names:

For MCQ:
{{"question": "question text about {topic}?", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_answer": 0, "explanation": "Why this is correct", "topic": "{topic}", "question_type": "mcq"}}

For True/False:
{{"question": "Statement about {topic} to evaluate", "options": ["True", "False"], "correct_answer": 0, "explanation": "Why this is true/false", "topic": "{topic}", "question_type": "true_false"}}

For Matching:
{{"question": "Match each term about {topic} with its definition.", "options": ["Term A", "Term B", "Term C", "Term D"], "correct_answer": 0, "explanation": "Brief explanation", "topic": "{topic}", "question_type": "matching", "matching_pairs": [{{"term": "Term A", "definition": "Definition of A"}}, {{"term": "Term B", "definition": "Definition of B"}}, {{"term": "Term C", "definition": "Definition of C"}}, {{"term": "Term D", "definition": "Definition of D"}}]}}

For Open-ended:
{{"question": "Explain this concept about {topic}?", "options": [], "correct_answer": 0, "model_answer": "Ideal 1-2 sentence answer about {topic}", "explanation": "Detailed explanation about {topic}", "topic": "{topic}", "question_type": "open_ended", "key_concepts": ["concept1", "concept2", "concept3"]}}

Return a JSON array with exactly {num_questions} objects. Do not include any text outside the JSON array."""

    raw = await _chat(prompt, fast=True)
    questions = json.loads(_clean(raw))
    
    # Validate and ensure all required fields are present
    validated_questions = []
    for q in questions[:num_questions]:
        # Force the topic field to be the specified topic
        q["topic"] = topic
        q.setdefault("question_type", "mcq")
        q.setdefault("explanation", "No explanation provided.")
        q.setdefault("correct_answer", 0)
        
        if q["question_type"] == "open_ended":
            q.setdefault("options", [])
            q.setdefault("model_answer", f"Review the material about {topic}.")
            q.setdefault("key_concepts", [])
        elif q["question_type"] == "matching":
            q.setdefault("options", [])
            q.setdefault("matching_pairs", [])
        else:
            q.setdefault("options", ["Option A", "Option B", "Option C", "Option D"])
        
        validated_questions.append(q)
    
    # Final safety check - if no questions were generated, return a fallback
    if not validated_questions:
        validated_questions = [{
            "question": f"What is a key concept about {topic}?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_answer": 0,
            "explanation": "Review the material to find the correct answer.",
            "topic": topic,
            "question_type": "mcq"
        }]
    
    return validated_questions

# ─────────────────────────────────────────────────────────────
# Legacy individual generators (kept for backward compatibility)
# ─────────────────────────────────────────────────────────────
async def generate_mcq_questions(
    content: str, title: str, num_questions: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    topic_instr = f"\nFocus EXCLUSIVELY on the topic: '{specific_topic}'." if specific_topic else ""
    prompt = f"""Generate {num_questions} multiple choice questions from the following material.
Title: {title}{topic_instr}
Material:
{content[:10000]}

Return a JSON array:
[
    {{
        "question": "Question text?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_answer": 0,
        "explanation": "Why this is correct",
        "topic": "Topic name"
    }}
]
Rules:
- correct_answer is 0-indexed (0=A, 1=B, 2=C, 3=D)
- Questions test understanding, not just memorization
- Return ONLY valid JSON array, no markdown."""
    raw = await _chat(prompt)
    return json.loads(_clean(raw))[:num_questions]


async def generate_true_false_questions(
    content: str, title: str, num_questions: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    topic_instr = f"\nFocus EXCLUSIVELY on the topic: '{specific_topic}'." if specific_topic else ""
    prompt = f"""Generate {num_questions} True/False questions from the following material.
Title: {title}{topic_instr}
Material:
{content[:10000]}

Return a JSON array:
[
    {{
        "question": "Statement to evaluate as true or false.",
        "options": ["True", "False"],
        "correct_answer": 0,
        "explanation": "Why this is true/false",
        "topic": "Topic name"
    }}
]
Rules:
- correct_answer: 0 = True, 1 = False
- Mix roughly half true, half false statements
- Statements should be clear and unambiguous
- Return ONLY valid JSON array, no markdown."""
    raw = await _chat(prompt)
    questions = json.loads(_clean(raw))[:num_questions]
    for q in questions:
        q["options"] = ["True", "False"]
        q["question_type"] = "true_false"
    return questions


async def generate_matching_questions(
    content: str, title: str, num_questions: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    topic_instr = f"\nFocus EXCLUSIVELY on the topic: '{specific_topic}'." if specific_topic else ""
    prompt = f"""Generate {num_questions} matching questions from the following material.
Title: {title}{topic_instr}
Material:
{content[:10000]}

Each matching question has exactly 4 term-definition pairs that the student must match.
Return a JSON array:
[
    {{
        "question": "Match each term with its correct definition.",
        "options": ["Term A", "Term B", "Term C", "Term D"],
        "correct_answer": 0,
        "explanation": "Brief explanation of all 4 pairs",
        "topic": "Topic name",
        "matching_pairs": [
            {{"term": "Term A", "definition": "Definition of A"}},
            {{"term": "Term B", "definition": "Definition of B"}},
            {{"term": "Term C", "definition": "Definition of C"}},
            {{"term": "Term D", "definition": "Definition of D"}}
        ]
    }}
]
Rules:
- Each matching_pairs must have EXACTLY 4 objects with "term" and "definition" keys
- Terms and definitions should be concise (under 10 words each)
- correct_answer set to 0 (matching is judged differently in frontend)
- options array should list the 4 terms
- Return ONLY valid JSON array, no markdown."""
    raw = await _chat(prompt)
    questions = json.loads(_clean(raw))[:num_questions]
    for q in questions:
        q["question_type"] = "matching"
        if "matching_pairs" not in q or len(q.get("matching_pairs", [])) != 4:
            q["matching_pairs"] = q.get("matching_pairs", [])
    return questions


async def generate_open_ended_questions(
    content: str, title: str, num_questions: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    topic_instr = f"\nFocus EXCLUSIVELY on the topic: '{specific_topic}'." if specific_topic else ""
    prompt = f"""Generate {num_questions} open-ended short-answer questions from the following material.
Title: {title}{topic_instr}
Material:
{content[:10000]}

Return a JSON array:
[
    {{
        "question": "Explain or describe something specific?",
        "options": [],
        "correct_answer": 0,
        "model_answer": "The ideal 1-2 sentence answer a student should give.",
        "explanation": "Detailed explanation with key points the answer must cover",
        "topic": "Topic name",
        "key_concepts": ["concept1", "concept2", "concept3"]
    }}
]
Rules:
- Questions should require a 1-3 sentence answer
- model_answer is the ideal concise answer
- key_concepts lists 2-4 essential ideas the student's answer should touch on
- Questions should test understanding and application, not just recall
- Return ONLY valid JSON array, no markdown."""
    raw = await _chat(prompt)
    questions = json.loads(_clean(raw))[:num_questions]
    for q in questions:
        q["question_type"] = "open_ended"
        q["options"] = []
    return questions


# ─────────────────────────────────────────────────────────────
# Combined generator - OPTIMIZED version using single API call per topic
# ─────────────────────────────────────────────────────────────
async def generate_questions_all_types(
    content: str, title: str, num_per_topic: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    """
    Generate a mix of all 4 question types for a given topic.
    OPTIMIZED: Uses a single API call per topic instead of 4 separate calls.
    """
    topic = specific_topic if specific_topic else "the material"
    return await generate_all_question_types_for_topic(
        content=content,
        title=title,
        topic=topic,
        num_questions=num_per_topic
    )


# Backward-compat alias
async def generate_questions(
    content: str, title: str, num_questions: int,
    specific_topic: Optional[str] = None,
) -> List[dict]:
    qs = await generate_mcq_questions(content, title, num_questions, specific_topic)
    for q in qs:
        q.setdefault("question_type", "mcq")
    return qs


# ─────────────────────────────────────────────────────────────
# Open-ended AI judge (unchanged)
# ─────────────────────────────────────────────────────────────
async def judge_open_answer(
    question_text: str,
    model_answer: str,
    key_concepts: List[str],
    student_answer: str,
    explanation: str,
) -> dict:
    """
    AI-judge a student's open-ended answer.
    Returns {is_correct, score, feedback, correct_answer, explanation}
    """
    if not GROQ_API_KEY:
        # Fallback: keyword match
        hits = sum(1 for k in key_concepts if k.lower() in student_answer.lower())
        score = hits / max(len(key_concepts), 1)
        return {
            "is_correct": score >= 0.5,
            "score": score,
            "feedback": "Good effort!" if score >= 0.5 else "Review the key concepts.",
            "correct_answer": model_answer,
            "explanation": explanation,
        }

    prompt = f"""You are a fair and encouraging teacher grading a student's short-answer response.

Question: {question_text}
Model Answer: {model_answer}
Key Concepts to cover: {', '.join(key_concepts)}
Explanation: {explanation}

Student's Answer: {student_answer}

Grade the student's answer. Be lenient — award credit for partial understanding and correct concepts
even if wording differs. Spelling mistakes and informal phrasing are fine.

Return ONLY this JSON object:
{{
    "is_correct": true or false,
    "score": 0.0 to 1.0,
    "feedback": "1-2 sentence encouraging feedback explaining what was right/wrong",
    "correct_answer": "{model_answer}"
}}

Rules:
- score >= 0.6 → is_correct = true (partial credit counts)
- Be specific in feedback about which key concepts were hit or missed
- Tone: encouraging, educational, not harsh
- Return ONLY valid JSON, no markdown."""

    raw = await _chat(prompt, fast=True)
    result = json.loads(_clean(raw))
    result.setdefault("correct_answer", model_answer)
    result.setdefault("explanation", explanation)
    return result


# ─────────────────────────────────────────────────────────────
# OCR, recommendations, topic analysis, summaries
# ─────────────────────────────────────────────────────────────
async def ocr_image_bytes(image_bytes: bytes, mime_type: str) -> str:
    if not GROQ_API_KEY:
        return ""
    import base64
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                GROQ_BASE_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.2-11b-vision-preview",
                    "messages": [{"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                        {"type": "text", "text": "Extract all text from this image. Return only the extracted text, no commentary."},
                    ]}],
                    "max_tokens": 2048,
                },
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return ""


async def get_ai_recommendation(weak_topics: list[dict]) -> str:
    if not weak_topics:
        return "Great job! You're performing well across all topics. Keep practicing to maintain your streak."
    if not GROQ_API_KEY:
        topics = [t["topic"] for t in weak_topics[:3]]
        return f"Focus on improving: {', '.join(topics)}. Review the materials and try more quizzes."
    topics_str = "\n".join(f"- {t['topic']}: {round(t['accuracy'] * 100)}% accuracy" for t in weak_topics[:5])
    prompt = f"""A student is studying and has the following weak topics:\n{topics_str}\n\nWrite a short, encouraging 2-3 sentence study recommendation. Be specific about which topics to focus on first and why. Keep it motivating and practical. No lists, just natural prose."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GROQ_BASE_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.6, "max_tokens": 200},
            )
            response.raise_for_status()
            return response.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        topics = [t["topic"] for t in weak_topics[:3]]
        return f"Focus on improving in {', '.join(topics)}. Review the materials and try more quizzes."


async def analyze_material_topics(text: str, title: str, num_topics: int) -> dict:
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not set.")
    client = AsyncGroq(api_key=GROQ_API_KEY)
    prompt = f"""You are a study material analyzer. Analyze the following text and create a dungeon blueprint.

Title: {title}
Number of topics to extract: {num_topics}

Text to analyze:
{text[:8000]}

Return a JSON object with EXACTLY this structure (no extra text, no markdown):
{{
    "topics": [
        {{
            "topic": "Topic name",
            "estimated_questions": 5,
            "sample_question": "Example multiple choice question about this topic with 4 options?\\nA) Option 1\\nB) Option 2\\nC) Option 3\\nD) Option 4"
        }}
    ],
    "summary": "A 2-3 sentence summary of what this dungeon will teach",
    "estimated_difficulty": "easy" or "medium" or "hard"
}}

Requirements:
- Extract exactly {num_topics} distinct topics from the material
- Each sample question MUST be a complete multiple choice question with 4 labeled options (A, B, C, D)
- estimated_questions should be 3-8 per topic based on content density
- difficulty: easy = basic concepts, medium = requires understanding, hard = complex applications

Return ONLY valid JSON, no markdown formatting."""
    response = await client.chat.completions.create(
        model=GROQ_FAST_MODEL,
        messages=[
            {"role": "system", "content": "You are a JSON-only response system. Never include markdown, code blocks, or explanatory text. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
    )
    content_str = _clean(response.choices[0].message.content)
    result = json.loads(content_str)
    if "topics" not in result or len(result["topics"]) != num_topics:
        raise ValueError(f"AI returned {len(result.get('topics', []))} topics, expected {num_topics}")
    result["total_questions"] = sum(t.get("estimated_questions", 5) for t in result["topics"])
    result["title"] = title
    return result


async def generate_topic_summary(content: str, topic: str) -> str:
    if not GROQ_API_KEY:
        return ""
    client = AsyncGroq(api_key=GROQ_API_KEY)
    prompt = f"""You are a helpful teacher summarizing study material for a student.

Topic: "{topic}"

Source material (may be messy/raw):
{content[:3000]}

Write a clean, engaging 3-4 sentence summary of this topic that:
- Explains the core concept clearly
- Mentions the most important ideas or principles
- Uses plain language a student can understand
- Reads as natural, flowing prose (no bullet points, no headers)

Return ONLY the summary text, nothing else."""
    try:
        response = await client.chat.completions.create(
            model=GROQ_FAST_MODEL,
            messages=[
                {"role": "system", "content": "You write clear, student-friendly topic summaries. Return only the summary text."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.5,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Summary generation error: {e}")
        return ""


async def generate_key_terms(content: str, topic: str) -> list:
    if not GROQ_API_KEY:
        return []
    client = AsyncGroq(api_key=GROQ_API_KEY)
    prompt = f"""You are an expert teacher. Extract the 5 most important key terms from this text about "{topic}".

Text:
{content[:2500]}

For each term, provide a clear, student-friendly definition (1 sentence max).

Return a JSON array:
[
    {{"term": "Term 1", "definition": "Clear, concise definition."}},
    {{"term": "Term 2", "definition": "Another clear definition."}}
]

Return ONLY valid JSON array, no markdown, no extra text."""
    try:
        response = await client.chat.completions.create(
            model=GROQ_FAST_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful teacher who creates clear, student-friendly definitions. Return only valid JSON arrays."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1000,
        )
        content_str = _clean(response.choices[0].message.content)
        try:
            key_terms = json.loads(content_str)
            if isinstance(key_terms, list) and all("term" in k and "definition" in k for k in key_terms):
                return key_terms[:5]
        except json.JSONDecodeError:
            import re
            matches = re.findall(r'"term":\s*"([^"]+)"', content_str)
            defs    = re.findall(r'"definition":\s*"([^"]+)"', content_str)
            return [{"term": matches[i], "definition": defs[i]} for i in range(min(len(matches), len(defs), 5))]
        return []
    except Exception as e:
        print(f"Key terms generation error: {e}")
        return []