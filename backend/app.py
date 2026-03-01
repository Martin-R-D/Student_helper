try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.pool import NullPool
from sqlalchemy import func, cast, Float
from dotenv import load_dotenv
from datetime import timedelta, timezone, datetime
from google import genai
from google.genai import types
from werkzeug.exceptions import HTTPException
import os
import base64
import json
import re
import chromadb
from chromadb.utils import embedding_functions

load_dotenv()

app = Flask(__name__)
CORS(app)


app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config["JWT_SECRET_KEY"] = os.environ.get('JWT_SECRET_KEY')
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "poolclass": NullPool,
    "connect_args": {
        "prepare_threshold": None
    }
}

db = SQLAlchemy(app)
jwt = JWTManager(app)


os.environ["GOOGLE_API_KEY"] = os.getenv("GEMINI_API_KEY")
# os.environ["GOOGLE_GENAI_API_VERSION"] = "v1"

gemini_ef  = embedding_functions.GoogleGenaiEmbeddingFunction(model_name="models/gemini-embedding-001")

chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(name="user_events", embedding_function=gemini_ef)
chat_collection = chroma_client.get_or_create_collection(name="chat_history", embedding_function=gemini_ef)


@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return e
    
    print(f"SERVER CRASH: {e}") 
    
    return {"error": "An unexpected error occurred on the server"}, 500


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    profile_pic = db.Column(db.Text, nullable=True) # Base64 encoded image

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class ChatSession(db.Model):
    id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    messages = db.relationship('ChatMessage', backref='session', lazy=True, cascade="all, delete-orphan")

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(50), db.ForeignKey('chat_session.id'), nullable=False)
    role = db.Column(db.String(20)) 
    content = db.Column(db.Text)
    has_image = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Score(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    subject = db.Column(db.String(100), nullable=False)
    score_value = db.Column(db.Integer, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


@app.post("/auth/register")
def register():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")


    if not isinstance(email, str) or not isinstance(password, str):
        return {"message": "Invalid input"}, 400

    if User.query.filter_by(email=email).first():
        return {"message": "User already exists"}, 400

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return {"message": "User created successfully"}, 201


@app.post("/auth/login")
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")


    if not isinstance(email, str) or not isinstance(password, str):
        return {"message": "Invalid input"}, 400

    if not email or not password:
        return {"message": "Missing credentials"}, 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return {"message": "Invalid credentials"}, 401

    token = create_access_token(identity=str(user.id))
    return {"access_token": token}

@app.route('/events', methods=['GET'])
@jwt_required()
def get_events():
    current_user_id = get_jwt_identity()
    events_from_db = Event.query.filter_by(user_id=current_user_id).all()
    events_by_date = {}
    
    for event in events_from_db:
        if event.date not in events_by_date:
            events_by_date[event.date] = []
        events_by_date[event.date].append({
            "id": event.id,
            "type": event.type,
            "description": event.description
        })
    
    return jsonify(events_by_date)

@app.route('/events', methods=['POST'])
@jwt_required()
def create_event():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    date = data.get("date")
    event_type = data.get("type")
    description = data.get("description")

    if not date or not event_type or not description:
        return {"message": "Missing required fields"}, 400

    if event_type not in ["homework", "test", "project"]:
        return {"message": "Invalid event type"}, 400

    new_event = Event(
        user_id=current_user_id,
        date=date,
        type=event_type,
        description=description
    )
    
    try:
        db.session.add(new_event)
        db.session.commit()

        collection.add(
            ids=[str(new_event.id)],
            documents=[f"Date: {new_event.date}, Task: {new_event.description}"],
            metadatas=[{"user_id": str(current_user_id)}]
        )
        print("Event added")
        return {
            "message": "Event created successfully",
            "data": {
                "id": new_event.id,
                "date": new_event.date,
                "type": new_event.type,
                "description": new_event.description
            }
        }, 201
    except Exception as e:
        db.session.rollback()
        return {"message": "Failed to create event", "error": str(e)}, 500


@app.route('/events/delete', methods=['POST'])
@jwt_required()
def delete_event():
    current_user_id = get_jwt_identity()
    data = request.get_json()

    event_id = data.get('id')
    date = data.get('date')
    description = data.get('description')

    print(f"DELETE REQUEST: id={event_id}, date={date}, desc={description}")

    event_to_delete = None

    if event_id:
        print(f"Attempting delete by ID: {event_id}")
        event_to_delete = Event.query.filter_by(id=event_id, user_id=current_user_id).first()
    elif date and description:
        print(f"Attempting delete by Date/Desc (Fallback): {date}, {description}")
        event_to_delete = Event.query.filter_by(
            user_id=current_user_id,
            date=date,
            description=description
        ).first()
    else:
        print("Missing deletion criteria")
        return jsonify({"error": "Missing event ID, or date and description"}), 400

    if not event_to_delete:
        print("Event not found in DB")
        return jsonify({"error": "Event not found"}), 404
    
    try:
        print(f"Deleting event: {event_to_delete.id}")
        db.session.delete(event_to_delete)
        db.session.commit()

        collection.delete(ids=[str(event_to_delete.id)])

        return jsonify({"success": True, "message": "Event deleted"}), 200
    except Exception as e:
        print(f"Delete Exception: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.get("/auth/myInfo")
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)

    if not user:
        return {"message": "User not found"}, 404

    return {"id": user.id,"email": user.email, "profile_pic": user.profile_pic}

@app.post("/auth/update_profile_pic")
@jwt_required()
def update_profile_pic():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return {"message": "User not found"}, 404

    data = request.get_json()
    profile_pic = data.get("profile_pic")
    
    user.profile_pic = profile_pic
    db.session.commit()
    
    return {"message": "Profile picture updated successfully"}



@app.post("/auth/change_password")
@jwt_required()
def change_password():
    data = request.get_json()
    new_password = data.get("password")

    if not isinstance(new_password, str):
        return {"message": "Invalid password"}, 400

    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)

    if not user:
        return {"message": "User not found"}, 404

    user.set_password(new_password)
    db.session.commit()

    return {"message": "Password updated successfully"}



client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

@app.route('/chat/message', methods=['POST'])
@jwt_required()
def handle_chat():
    user_id = str(get_jwt_identity())
    data_in = request.json
    
    session_id = data_in.get("session_id")
    image_b64 = data_in.get("image")
    user_text = data_in.get("message", "").strip()

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    day_name = now.strftime("%A")


    if not user_text and not image_b64:
        return jsonify({"error": "Empty message"}), 400

    chat_session = db.session.get(ChatSession, session_id)
    if not chat_session:
        title_preview = user_text[:30] if user_text else "Image Shared"
        chat_session = ChatSession(id=session_id, user_id=user_id, title=title_preview)
        db.session.add(chat_session)
        db.session.flush()

    gemini_history = []

    if user_text:
        history_results = chat_collection.query(
            query_texts=[user_text],
            n_results = 10,
            where = {"$and": [{"user_id":user_id}, {"session_id":str(chat_session.id)}]}
        )
        if history_results['documents'] and history_results['documents'][0]:
            for doc, meta, dist in zip(history_results['documents'][0], history_results['metadatas'][0], history_results['distances'][0]):
                if dist <= 1:
                    role = "user" if meta['role'] == "user" else "model"
                    gemini_history.append(types.Content(role=role, parts=[types.Part.from_text(text=doc)]))

    print(f"GEN history len: {len(gemini_history)}")
    user_db_msg = ChatMessage(session_id=session_id, role='user', content=user_text)
    db.session.add(user_db_msg)
    db.session.flush()

    chat_collection.add(
        ids=[str(chat_session.id) + "_" + str(user_db_msg.id)],
        documents=[user_text],
        metadatas=[{"role":"user", "user_id":str(user_id), "session_id":str(chat_session.id)}]
    )

    context = ""
    if user_text:
        search_results = collection.query(
            query_texts=[user_text], 
            n_results=10, 
            where={"user_id": str(user_id)} 
        )
        relevant_docs = []
        if search_results['documents'] and search_results['documents'][0]:
            print(len(search_results['documents'][0]))
            print(search_results['distances'])
            for doc, distance in zip(search_results['documents'][0], search_results['distances'][0]):
                if distance <= 1.5:
                    relevant_docs.append(doc)

            if relevant_docs:
                context += "\nUse this relevant context from your calendar:\n" + "\n".join(relevant_docs)
                print(context)

    current_parts = []
    if user_text:
        current_parts.append(types.Part.from_text(text=user_text))
    
    if image_b64:
        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]
        
        image_data = base64.b64decode(image_b64.strip())
        current_parts.append(types.Part.from_bytes(data=image_data, mime_type="image/jpeg"))
        
        if not user_text:
            current_parts.insert(0, types.Part.from_text(text="Describe this image."))

    models_to_try = [
        "gemini-flash-latest", 
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite"  
    ]

    ai_reply = None
    last_error = None

    for model_name in models_to_try:
        try:
            print(f"Trying chat with model: {model_name}")
            chat = client.chats.create(
                model=model_name,
                config=types.GenerateContentConfig(
                    system_instruction=f"""
                    You are a helpful student assistant, focus on giving short and clear answers. 
                    Note that today's date is : {today_str} ({day_name}).
                    {context}.
                    IMPORTANT: Always format mathematical formulas using standard Markdown code blocks or inline backticks. 
                    Example: `x = y^2`. Strictly avoid LaTeX symbols like $, $$.
                    """
                ),
                history=gemini_history
            )

            response = chat.send_message(message=current_parts)
            ai_reply = response.text
            break 

        except Exception as e:
            print(f"Model {model_name} failed: {e}")
            last_error = e
            continue

    if not ai_reply:
        return jsonify({"error": f"All AI models failed. Last error: {str(last_error)}"}), 500

    try: 
        ai_db_msg = ChatMessage(session_id=session_id, role='assistant', content=ai_reply)
        db.session.add(ai_db_msg)
        db.session.flush()
        chat_collection.add(
            ids=[str(chat_session.id) + "_" + str(ai_db_msg.id) + "1"],
            documents=[ai_db_msg.content],
            metadatas=[{"role":"ai", "user_id":str(user_id), "session_id":str(chat_session.id)}]
        )

        db.session.commit()

        return jsonify({
            "status": "success", 
            "id": ai_db_msg.id, 
            "reply": ai_reply
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500



@app.route('/chat/history', methods=['GET'])
@jwt_required()
def get_chat_history():
    user_id = get_jwt_identity()
    sessions = ChatSession.query.filter_by(user_id=user_id).order_by(ChatSession.created_at.desc()).all()
    
    result = []
    for s in sessions:
        msgs = [{"id": m.id, "role": m.role, "content": m.content} for m in s.messages]
        
        result.append({"id": s.id, "title": s.title, "date": s.created_at.strftime("%Y-%m-%d"), "messages": msgs})
    return jsonify(result)




@app.post("/chat/extract-events")
@jwt_required()
def extract_events():
    current_user_id = get_jwt_identity()
    data_in = request.json
    image_b64 = data_in.get("image")
    
    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]
    image_data = base64.b64decode(image_b64.strip())

    prompt = (
        "Analyze this school-related image. Extract events and return them in a JSON format. If the image is NOT a school schedule or contains no relevant tasks, return an empty list for 'events'!!!"
        "Rules: "
        "1. 'date' must be in 'YYYY-MM-DD' format. "
        "2. 'type' must be EXACTLY one of these strings: 'homework', 'test', 'project'. "
        "3. 'description' should be a short Bulgarian summary of the task. "
        "Format: {'events': [{'date': '...', 'type': '...', 'description': '...'}]}"
    )

    extracted = None
    last_error = None

    models_to_try = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
    for model_name in models_to_try:
        try:
            print(f"Trying extraction with model: {model_name}")
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            
            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]
            
            extracted = json.loads(raw_text)
            break 

        except Exception as e:
            print(f"Model {model_name} failed: {e}")
            last_error = e
            continue

    if not extracted:
        return jsonify({"error": f"AI extraction failed on all models: {str(last_error)}"}), 500
    
    try:
        added_events = []
        print(extracted)
        for item in extracted.get("events", []):
            new_event = Event(
                user_id=current_user_id,
                date=item['date'],         
                type=item['type'],      
                description=item['description'] 
            )
            db.session.add(new_event)
            db.session.flush()

            collection.add(
                ids=[str(new_event.id)],
                documents=[f"Date: {item['date']}, Type: {item['type']}, Task: {item['description']}"],
                metadatas=[{"user_id": str(current_user_id)}]
            )
            added_events.append(item)
            print("Event added")

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": f"Added {len(added_events)} events to your calendar",
            "events": added_events
        })
    except Exception as e:
        print(f"AI Extraction Error: {e}")
        db.session.rollback()
        return jsonify({"error": "Could not process image"}), 500

@app.route('/chat/generate-test', methods=['POST'])
@jwt_required()
def generate_test():
    user_id = get_jwt_identity()
    data = request.json
    subject = data.get('subject', 'General Topic')
    context = data.get('context', '')
    questionsCount = data.get('questionsCount', 5)
    images = data.get('images', [])

    if not context and not images:
        return jsonify({"error": "No study material provided"}), 400
    
    prompt = f"""
    You are an expert teacher. Create a multiple-choice quiz based ONLY on the following study material.

    IMPORTANT: I have provided study materials as TEXT and/or IMAGES. 
    Please analyze both carefully. If there are images (like handwritten notes or diagrams), 
    prioritize the information found in them.

    Subject: {subject}
    Study Material: {context}

    Return exactly {questionsCount} questions in valid JSON format. 
    Each question must have:
    - "question": the text of the question
    - "options": an array of 4 possible answers
    - "correct": the text of the correct answer (must match one of the options exactly)

    Response format:
    {{
        "questions": [
            {{
                "question": "example",
                "options": ["a", "b", "c", "d"],
                "correct": "a"
            }}
        ]
    }}
    """

    contents = [
        types.Part.from_text(text=prompt)
    ]

    for img_base64 in images:
        image_b64 = ''
        if "," in img_base64:
            image_b64 = img_base64.split(",")[1]
        else:
            image_b64 = img_base64
            
        image_data = base64.b64decode(image_b64.strip())
            
        contents.append(
            types.Part.from_bytes(
                data=image_data,
                mime_type='image/jpeg'
            )
        )

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=contents
        )
        
        raw_text = response.text
        json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        
        if json_match:
            quiz_data = json.loads(json_match.group())
            return jsonify(quiz_data)
        else:
            return jsonify({"error": "AI returned invalid format"}), 500

    except Exception as e:
        print(f"Error generating test: {e}")
        return jsonify({"error": "Failed to connect to AI"}), 500



@app.route('/save-score', methods=['POST'])
@jwt_required()
def save_score():
    user_id = get_jwt_identity()
    data = request.json
    
    subject = data.get('subject')
    score_value = data.get('score')
    total = data.get('total') 
    print(total)
    new_entry = Score(
        user_id=user_id,
        subject=subject,
        score_value=score_value,
        total=total
    )
    
    db.session.add(new_entry)
    db.session.commit()
    return jsonify({"message": "Score saved!", "id": new_entry.id}), 201


@app.route('/recent-scores', methods=['GET'])
@jwt_required()
def get_user_stats():
    user_id = get_jwt_identity()
    
    stats = db.session.query(
        func.count(Score.id).label('total_tests'),
        func.avg(cast(Score.score_value, Float) / Score.total).label('avg_score')
    ).filter(Score.user_id == user_id).first()

    avg_perc = round((stats.avg_score or 0) * 100, 1)

    return jsonify({
        "total_tests": stats.total_tests or 0,
        "avg_percentage": avg_perc
    })



class SchoolworkAnalysis(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    subject = db.Column(db.String(100), nullable=False)
    topic = db.Column(db.String(200))
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

@app.route('/chat/analyze-schoolwork', methods=['POST'])
@jwt_required()
def analyze_schoolwork():
    user_id = get_jwt_identity()
    data = request.json
    
    work_type = data.get('type')
    subject = data.get('subject')
    
    # Optional fields
    grade = data.get('grade')
    mistakes = data.get('mistakes') 
    notes = data.get('notes')
    topic = data.get('topic') 
    images = data.get('images', [])

    if not work_type or not subject:
        return jsonify({"error": "Missing type or subject"}), 400

    # Smart Filtering: Fetch scores that roughly match the subject
    # Simple case-insensitive match for now (SQLAlchemy ILIKE equivalent)
    # The user asked for "synonyms", doing a basic contains check is a good start for SQL.
    # We could use AI to find synonyms, but let's keep it fast for now with partial matching.
    subject_term = subject.lower().strip()
    
    # Fetch all user scores to filter in python or do a simple LIKE query
    # Using 'ilike' for case-insensitive matching if available, else manual filter
    all_scores = Score.query.filter_by(user_id=user_id).all()
    
    # Python-side fuzzy filtering
    relevant_scores = []
    for s in all_scores:
        db_subj = s.subject.lower()
        # Check for direct inclusion or overlap
        if subject_term in db_subj or db_subj in subject_term:
            relevant_scores.append(s)
            
    # Sort by recent
    relevant_scores.sort(key=lambda x: x.timestamp, reverse=True)
    relevant_scores = relevant_scores[:5]

    score_summary = "\n".join([f"- {s.subject}: {s.score_value}/{s.total}" for s in relevant_scores])

    prompt = f"""
    You are an expert academic tutor. Analyze the following schoolwork and provide insights, resources, and advice.
    
    User Context (Past Performance in {subject}):
    {score_summary if score_summary else f"No specific past test data found for {subject}."}

    Current Schoolwork Info:
    - Type: {work_type}
    - Subject: {subject}
    """
    
    if work_type == 'past_exam':
        prompt += f"""
        - Grade: {grade}
        - User Notes: {notes}
        - Mistakes/Weaknesses described: {mistakes}
        
        Please provide:
        1. Analysis of the mistakes (if provided).
        2. Specific study tips to improve from this grade.
        3. 3-5 useful links or search terms.
        """
    elif work_type == 'project':
        prompt += f"""
        - Topic: {topic}
        - User Notes: {notes}
        
        Please provide:
        1. Creative ideas or structure suggestions.
        2. Key points to cover for a high grade.
        3. Useful resources/references.
        """
    elif work_type == 'homework':
        prompt += f"""
        - Topic: {topic}
        - Key Notes: {notes}
        
        Please provide:
        1. Explanation of the key concepts.
        2. Step-by-step guidance.
        3. Further reading.
        """

    prompt += "\n\nIMPORTANT FORMATTING RULES:\n"
    prompt += "1. Use clear Markdown headings (##, ###).\n"
    prompt += "2. When providing links, they MUST be clickable Markdown links. Format: `[Title](URL)`.\n"
    prompt += "3. Ensure the tone is encouraging but highly practical.\n"
    prompt += "4. If you suggest resources, provide REAL valid URLs or specific search queries formatted as `[Search for Topic](https://www.google.com/search?q=Topic)` if a direct link is unavailable.\n"

    contents = [types.Part.from_text(text=prompt)]

    for img_base64 in images:
        if not img_base64: continue
        image_b64 = ''
        if "," in img_base64:
            image_b64 = img_base64.split(",")[1]
        else:
            image_b64 = img_base64
            
        try:
            image_data = base64.b64decode(image_b64.strip())
            contents.append(
                types.Part.from_bytes(data=image_data, mime_type='image/jpeg')
            )
        except Exception as e:
            print(f"Image decode error: {e}")

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=contents
        )
        ai_text = response.text
        
        # Save analysis
        new_analysis = SchoolworkAnalysis(
            user_id=user_id,
            type=work_type,
            subject=subject,
            topic=topic or "",
            content=ai_text
        )
        db.session.add(new_analysis)
        db.session.commit()
        
        return jsonify({"analysis": ai_text, "id": new_analysis.id})

    except Exception as e:
        print(f"Error analyzing schoolwork: {e}")
        db.session.rollback()
        return jsonify({"error": "Failed to connect to AI"}), 500

@app.route('/schoolwork/recents', methods=['GET'])
@jwt_required()
def get_recent_schoolwork():
    user_id = get_jwt_identity()
    recents = SchoolworkAnalysis.query.filter_by(user_id=user_id).order_by(SchoolworkAnalysis.created_at.desc()).limit(10).all()
    
    result = []
    for r in recents:
        result.append({
            "id": r.id,
            "type": r.type,
            "subject": r.subject,
            "topic": r.topic,
            "date": r.created_at.strftime("%Y-%m-%d"),
            "preview": r.content[:100] + "..."
        })
    return jsonify(result)

@app.route('/schoolwork/<int:id>', methods=['GET'])
@jwt_required()
def get_schoolwork_detail(id):
    user_id = get_jwt_identity()
    item = db.session.get(SchoolworkAnalysis, id)
    if not item or item.user_id != int(user_id):
        return jsonify({"error": "Not found"}), 404
        
    return jsonify({
        "id": item.id,
        "type": item.type,
        "subject": item.subject,
        "topic": item.topic,
        "content": item.content,
        "date": item.created_at.strftime("%Y-%m-%d")
    })


with app.app_context():
    db.create_all() 

    collection = chroma_client.get_or_create_collection(
        name="user_events", 
        embedding_function=gemini_ef
    )
    
    if collection.count() == 0:
        print("ChromaDB is empty. Syncing from SQL...")
        all_events = Event.query.all()
        if all_events:
            collection.add(
                ids=[str(e.id) for e in all_events],
                documents=[f"Date: {e.date}, Type: {e.type}, Task: {e.description}" for e in all_events],
                metadatas=[{"user_id": str(e.user_id)} for e in all_events]
            )
            print(f"Synced {len(all_events)} events to ChromaDB.")
    else:
        print(f"ChromaDB already contains {collection.count()} events. Skipping sync.")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)