from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy


app = Flask(__name__)
CORS(app)

events = {
    '2025-12-25': [{'title': 'Christmas Party', 'time': '10:00 AM'}],
    '2025-12-31': [{'title': 'New Years Eve', 'time': '11:59 PM'}]
}

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)


app.config["JWT_SECRET_KEY"] = "change-this-later"
jwt = JWTManager(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)



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

    token = create_access_token(identity=user.id)
    return {"access_token": token}

@app.route('/events', methods=['GET'])
def get_events():
    return jsonify(events)

if __name__ == "__main__":
    with app.app_context():
        db.create_all() 
        
    app.run(host="0.0.0.0", port=5000, debug=True)