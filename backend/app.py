from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
import requests
import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)

events = {
    '2025-12-25': [{'title': 'Christmas Party', 'time': '10:00 AM'}],
    '2025-12-31': [{'title': 'New Years Eve', 'time': '11:59 PM'}]
}

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = "unique_key_123"


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
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)


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
def get_events():
    return jsonify(events)

@app.get("/auth/myInfo")
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

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
    user = User.query.get(user_id)

    if not user:
        return {"message": "User not found"}, 404

    user.set_password(new_password)
    db.session.commit()

    return {"message": "Password updated successfully"}


@app.route('/chat/history', methods=['GET'])
@jwt_required()
def get_chat_history():
    user_id = int(get_jwt_identity())
    messages = Message.query.filter_by(user_id=user_id).order_by(Message.timestamp.asc()).all()
    
    output = []
    for msg in messages:
        output.append({
            'id': str(msg.id),
            'text': msg.text,
            'from': msg.sender
        })
    
    return jsonify({'messages': output})


@app.route('/chat', methods=['POST'])
@jwt_required()
def chat():
    user_id = int(get_jwt_identity())
    data_in = request.json
    user_message = data_in.get("message")

    if not user_message:
        return jsonify({"error": "No message provided"}), 400


    new_msg = Message(user_id=user_id, text=user_message, sender='user')
    db.session.add(new_msg)
    db.session.commit()



    API_KEY = os.getenv("OPENROUTER_API_KEY") 
    API_URL = 'https://openrouter.ai/api/v1/chat/completions'

    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
    }
    payload = {
        "model": "nex-agi/deepseek-v3.1-nex-n1:free", #deepseek/deepseek-r1-0528:free
        "messages": [
            {"role": "user", "content": user_message}
        ]
    }

    try:
        response = requests.post(API_URL, json=payload, headers=headers)

        if response.status_code == 200:
            result = response.json()
            ai_reply = result['choices'][0]['message']['content']
            
            new_ai_msg = Message(user_id=user_id, text=ai_reply, sender='ai')
            db.session.add(new_ai_msg)
            db.session.commit() 

            return jsonify({
                "status": "success",
                "reply": ai_reply
            })
        else:
            print(f"OpenRouter Error: {response.text}")
            return jsonify({"error": f"API Error: {response.status_code}"}), response.status_code

    except Exception as e:
        print(f"System Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/chat/examAnalyse', methods=['POST'])
@jwt_required()
def anayseExam():
    data_in = request.json
    image_b64 = data_in.get("image")

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400
    
    instruction = "Analyze this exam paper. Identify all incorrect answers, explain why they are wrong, and provide the correct solutions. If there isnt exam paper on the image just say: Please import exam image!"

    content_payload = [
        {
            "type": "text", 
            "text": instruction
        },
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{image_b64}"
            }
        }
    ]

    API_KEY = os.getenv("OPENROUTER_API_KEY")
    API_URL = 'https://openrouter.ai/api/v1/chat/completions'
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json',
    }

    payload = {
        "model": "nvidia/nemotron-nano-12b-v2-vl:free",
        "messages": [
            {
                "role": "user",
                "content": content_payload
            }
        ]
    }

    try:
        response = requests.post(API_URL, json=payload, headers=headers)

        if response.status_code == 200:
            result = response.json()
            ai_reply = result['choices'][0]['message']['content']
            print(ai_reply)
            return jsonify({
                "status": "success",
                "reply": ai_reply
            })
        else:
            return jsonify({"error": "AI Service Error", "details": response.text}), response.status_code

    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == "__main__":
    with app.app_context():
        db.create_all() 
        
    app.run(host="0.0.0.0", port=5000, debug=True)