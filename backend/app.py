from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from datetime import timedelta, timezone, datetime
from google import genai
from google.genai import types
import os
import base64
import json

load_dotenv()

app = Flask(__name__)
CORS(app)

events = {}

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = "unique_key_123"
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)


db = SQLAlchemy(app)
jwt = JWTManager(app)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    text = db.Column(db.Text, nullable=False)
    sender = db.Column(db.String(10), nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


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

@app.get("/auth/myInfo")
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)

    if not user:
        return {"message": "User not found"}, 404

    return {"id": user.id,"email": user.email}



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
    user_id = get_jwt_identity()
    data_in = request.json
    
    session_id = data_in.get("session_id")
    image_b64 = data_in.get("image")
    user_text = data_in.get("message", "").strip()

    if not user_text and not image_b64:
        return jsonify({"error": "Empty message"}), 400

    chat_session = db.session.get(ChatSession, session_id)
    if not chat_session:
        title_preview = user_text[:30] if user_text else "Image Shared"
        chat_session = ChatSession(id=session_id, user_id=user_id, title=title_preview)
        db.session.add(chat_session)

    user_db_msg = ChatMessage(session_id=session_id, role='user', content=user_text)
    db.session.add(user_db_msg)
    db.session.commit()

    history_msgs = ChatMessage.query.filter_by(session_id=session_id).order_by(ChatMessage.created_at.desc()).limit(10).all()
    
    gemini_history = []
    for msg in history_msgs[:-1]:
        if msg.content and msg.content.strip():
            role = "user" if msg.role == "user" else "model"
            gemini_history.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg.content)])
            )

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

    try:
        chat = client.chats.create(
            model="gemini-flash-latest",
            config=types.GenerateContentConfig(
                system_instruction="""
                You are a helpful student assistant. 
                IMPORTANT: Always format mathematical formulas using standard Markdown code blocks or inline backticks. 
                Example: `x = y^2`. 
                Strictly avoid using LaTeX symbols like $, $$, or \[ \]. 
                """
            ),
            history=gemini_history
        )

        response = chat.send_message(message=current_parts)
        ai_reply = response.text
        
        ai_db_msg = ChatMessage(session_id=session_id, role='assistant', content=ai_reply)
        db.session.add(ai_db_msg)
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
        "Analyze this school-related image. Extract events and return them in a JSON format. "
        "Rules: "
        "1. 'date' must be in 'YYYY-MM-DD' format. "
        "2. 'type' must be EXACTLY one of these strings: 'homework', 'test', 'project'. "
        "3. 'description' should be a short Bulgarian summary of the task. "
        "Format: {'events': [{'date': '...', 'type': '...', 'description': '...'}]}"
    )

    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[
                types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        extracted = json.loads(response.text)
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
            added_events.append(item)

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



if __name__ == "__main__":
    with app.app_context():
        db.create_all() 
        
    app.run(host="0.0.0.0", port=5000, debug=True)