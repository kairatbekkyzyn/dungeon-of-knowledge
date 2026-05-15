import io
import json
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models import Material, Question, User
from app.schemas import MaterialCreate, MaterialOut
from app.auth import get_current_user
from app.services.ai_service import (
    generate_questions_all_types,
    ocr_image_bytes, analyze_material_topics,
)

router = APIRouter()

IMAGE_TYPES = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}

# ────────────────────────────────────────────────────────────
# Pydantic models for analysis
# ────────────────────────────────────────────────────────────
class TopicPreview(BaseModel):
    topic: str
    estimated_questions: int
    sample_question: str

class DungeonBlueprint(BaseModel):
    title: str
    total_questions: int
    topics: List[TopicPreview]
    summary: str
    estimated_difficulty: str

class AnalyzeTextRequest(BaseModel):
    title: str
    content: str
    num_topics: int

# ────────────────────────────────────────────────────────────
# Helper: Extract text from file
# ────────────────────────────────────────────────────────────
def extract_text_from_pdf(data: bytes) -> tuple[str, list[bytes]]:
    try:
        import fitz
        doc = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        image_pages = []
        for page in doc:
            if len(page.get_text().strip()) < 30:
                pix = page.get_pixmap(dpi=150)
                image_pages.append(pix.tobytes("jpeg"))
        return text, image_pages
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")

def extract_text_from_docx(data: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read DOCX: {e}")

async def extract_text_from_upload(file: UploadFile) -> tuple[str, str]:
    """Extract text from uploaded file. Returns (text, detected_title)"""
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower()
    allowed = {"pdf", "docx", "txt"} | set(IMAGE_TYPES.keys())
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    
    raw = await file.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")
    
    text = ""
    if ext == "pdf":
        text, image_pages = extract_text_from_pdf(raw)
        if image_pages:
            ocr_parts = []
            for img_bytes in image_pages[:8]:
                try:
                    ocr_text = await ocr_image_bytes(img_bytes, "image/jpeg")
                    if ocr_text:
                        ocr_parts.append(ocr_text)
                except:
                    pass
            if ocr_parts:
                text = (text + "\n\n" + "\n\n".join(ocr_parts)).strip()
    elif ext == "docx":
        text = extract_text_from_docx(raw)
    elif ext == "txt":
        text = raw.decode("utf-8", errors="ignore")
    else:
        text = await ocr_image_bytes(raw, IMAGE_TYPES[ext])
    
    title = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
    return text, title

# ────────────────────────────────────────────────────────────
# NEW ENDPOINT 1: Analyze file (preview without saving)
# ────────────────────────────────────────────────────────────
@router.post("/analyze", response_model=DungeonBlueprint)
async def analyze_file(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    num_topics: int = Form(8, ge=3, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview topics from a file without creating the dungeon."""
    text, detected_title = await extract_text_from_upload(file)
    if len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract enough text from the file. Minimum 50 characters required.")
    
    final_title = title or detected_title or "Untitled Dungeon"
    
    try:
        analysis = await analyze_material_topics(text, final_title, num_topics)
        return DungeonBlueprint(**analysis)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {str(e)}")

# ────────────────────────────────────────────────────────────
# NEW ENDPOINT 2: Analyze text (preview without saving)
# ────────────────────────────────────────────────────────────
@router.post("/analyze-text", response_model=DungeonBlueprint)
async def analyze_text(
    request: AnalyzeTextRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview topics from pasted text without creating the dungeon."""
    if len(request.content.strip()) < 100:
        raise HTTPException(status_code=400, detail="Need at least 100 characters of text for meaningful analysis.")
    
    if request.num_topics < 3 or request.num_topics > 12:
        raise HTTPException(status_code=400, detail="num_topics must be between 3 and 12")
    
    try:
        analysis = await analyze_material_topics(request.content, request.title, request.num_topics)
        return DungeonBlueprint(**analysis)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {str(e)}")

# NEW ENDPOINT 3: Forge with custom topic configuration
@router.post("/forge-with-topics", response_model=MaterialOut)
async def forge_with_topics(
    file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    topics_config: str = Form(...),
    content: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a dungeon with custom per-topic question configuration."""
    import traceback
    
    # Parse topics config
    try:
        topics = json.loads(topics_config)
        if not isinstance(topics, list) or len(topics) == 0:
            raise ValueError()
    except:
        raise HTTPException(status_code=400, detail="Invalid topics_config. Must be JSON array of {name, questions}")
    
    # Extract text
    if file:
        text, detected_title = await extract_text_from_upload(file)
        final_title = title or detected_title
    elif content:
        text = content
        final_title = title or "Untitled Dungeon"
    else:
        raise HTTPException(status_code=400, detail="Either file or content must be provided")
    
    if len(text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract enough text.")
    
    # Generate questions for each topic
    all_questions = []
    total_questions = sum(t["questions"] for t in topics)
    
    if total_questions > 200:
        raise HTTPException(status_code=400, detail="Too many questions total (max 200)")
    
    for topic_config in topics:
        topic_name = topic_config["name"]
        num_q = min(topic_config["questions"], 50)
        
        if num_q > 0:
            try:
                questions = await generate_questions_all_types(
                    text,
                    f"{final_title} - {topic_name}",
                    num_q,
                    specific_topic=topic_name,
                )
                
                if not questions:
                    print(f"WARNING: No questions generated for {topic_name}")
                    continue
                    
                print(f"Generated {len(questions)} questions for {topic_name}")
                
                for q in questions:
                    q["topic"] = topic_name
                all_questions.extend(questions)
            except Exception as e:
                print(f"Error generating questions for {topic_name}: {e}")
                traceback.print_exc()
                raise HTTPException(status_code=502, detail=f"AI generation failed for topic '{topic_name}': {str(e)}")
    
    if not all_questions:
        raise HTTPException(status_code=502, detail="AI failed to generate any questions.")
    
    print(f"Total questions generated: {len(all_questions)}")
    
    # Save to database
    count_res = await db.execute(select(Material).where(Material.user_id == current_user.id))
    order = len(count_res.scalars().all())
    
    material = Material(
        user_id=current_user.id, 
        title=final_title, 
        content=text,
        question_count=len(all_questions), 
        dungeon_order=order
    )
    db.add(material)
    await db.flush()
    
    for idx, q in enumerate(all_questions):
        try:
            qtype = q.get("question_type", "mcq")
            
            # Handle different field name possibilities
            question_text = q.get("question") or q.get("question_text", "")
            if not question_text:
                print(f"Warning: Question {idx} has no text: {q}")
                continue
                
            options = q.get("options", [])
            correct_answer = q.get("correct_answer", 0)
            explanation = q.get("explanation", "")
            topic_name = q.get("topic", "General")
            matching_pairs = q.get("matching_pairs", None)
            
            # Handle open-ended questions
            if qtype == "open_ended":
                model_answer = q.get("model_answer", q.get("explanation", ""))
                options = [model_answer] if model_answer else []
                key_concepts = q.get("key_concepts", [])
                if key_concepts:
                    matching_pairs = [{"term": kc, "definition": ""} for kc in key_concepts]
            
            # Convert options and matching_pairs to JSON string if needed
            if options and not isinstance(options, str):
                options = json.dumps(options)
            if matching_pairs and not isinstance(matching_pairs, str):
                matching_pairs = json.dumps(matching_pairs)
            
            db.add(Question(
                material_id=material.id,
                user_id=current_user.id,
                question_text=question_text,
                options=options,
                correct_answer=correct_answer,
                explanation=explanation,
                topic=topic_name,
                question_type=qtype,
                matching_pairs=matching_pairs,
            ))
        except Exception as e:
            print(f"Error saving question {idx}: {e}")
            print(f"Question data: {q}")
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to save question: {str(e)}")
    
    await db.commit()
    await db.refresh(material)
    
    if not material.id:
        raise HTTPException(status_code=500, detail="Failed to create material")
    
    return material

# ────────────────────────────────────────────────────────────
# Existing endpoints
# ────────────────────────────────────────────────────────────
async def _save_material(db, user, title, content, num_questions):
    if len(content.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract enough text from the file.")
    num_q = max(12, min(num_questions, 50))
    raw_questions = await generate_questions_all_types(content, title, num_q)
    if not raw_questions:
        raise HTTPException(status_code=502, detail="AI failed to generate questions. Check your Groq API key.")

    count_res = await db.execute(select(Material).where(Material.user_id == user.id))
    order = len(count_res.scalars().all())

    material = Material(user_id=user.id, title=title, content=content,
                        question_count=len(raw_questions), dungeon_order=order)
    db.add(material)
    await db.flush()
    for q in raw_questions:
        qtype = q.get("question_type", "mcq")
        options = q.get("options", [])
        matching_pairs = q.get("matching_pairs", None)

        if qtype == "open_ended":
            model_answer = q.get("model_answer", q.get("explanation", ""))
            options = [model_answer]
            key_concepts = q.get("key_concepts", [])
            matching_pairs = [{"term": kc, "definition": ""} for kc in key_concepts]

        db.add(Question(
            material_id=material.id,
            user_id=user.id,
            question_text=q["question"],
            options=options,
            correct_answer=q.get("correct_answer", 0),
            explanation=q["explanation"],
            topic=q["topic"],
            question_type=qtype,
            matching_pairs=matching_pairs,
        ))
    await db.commit()
    await db.refresh(material)
    return material

@router.post("/", response_model=MaterialOut)
async def create_material(data: MaterialCreate, db: AsyncSession=Depends(get_db),
                          current_user: User=Depends(get_current_user)):
    return await _save_material(db, current_user, data.title, data.content, data.num_questions)

@router.post("/upload", response_model=MaterialOut)
async def upload_file(file: UploadFile=File(...), title: Optional[str]=Form(None),
                      num_questions: int=Form(8), db: AsyncSession=Depends(get_db),
                      current_user: User=Depends(get_current_user)):
    text, detected_title = await extract_text_from_upload(file)
    mat_title = title or detected_title or "Untitled"
    return await _save_material(db, current_user, mat_title, text, num_questions)

@router.get("/", response_model=List[MaterialOut])
async def list_materials(db: AsyncSession=Depends(get_db), current_user: User=Depends(get_current_user)):
    result = await db.execute(select(Material).where(Material.user_id==current_user.id)
                              .order_by(Material.created_at.desc()))
    return result.scalars().all()

@router.get("/{material_id}", response_model=MaterialOut)
async def get_material(material_id: int, db: AsyncSession=Depends(get_db),
                       current_user: User=Depends(get_current_user)):
    result = await db.execute(select(Material).where(Material.id==material_id,
                                                      Material.user_id==current_user.id))
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material

@router.delete("/{material_id}")
async def delete_material(material_id: int, db: AsyncSession=Depends(get_db),
                          current_user: User=Depends(get_current_user)):
    result = await db.execute(select(Material).where(Material.id==material_id,
                                                      Material.user_id==current_user.id))
    material = result.scalar_one_or_none()
    if not material: raise HTTPException(status_code=404, detail="Material not found")
    await db.delete(material)
    await db.commit()
    return {"message": "Deleted"}