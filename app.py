# backend/app.py
import os
from dotenv import load_dotenv
from flask import Flask, render_template, send_from_directory, jsonify, request, redirect
from werkzeug.exceptions import RequestEntityTooLarge

# load .env
load_dotenv()

# Flask app initialization (keeps your static/template settings)
app = Flask(__name__, 
           template_folder='templates',
           static_folder='dist',
           static_url_path='')

# Basic config
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'simple-secret-key-for-development')

# Database URL handling (keeps your original logic)
database_url = os.getenv('DATABASE_URL', 'sqlite:///interior_design.db')
if database_url.startswith('postgres://'):
    database_url = database_url.replace('postgres://', 'postgresql://', 1)

if database_url.startswith('sqlite:///'):
    if os.path.exists('/tmp'):
        database_url = 'sqlite:////tmp/interior_design.db'
    else:
        database_url = 'sqlite:///interior_design.db'

app.config['SQLALCHEMY_DATABASE_URI'] = database_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Upload limits & folder
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ---- Extensions import and init (expects extensions.py) --------------------
# You should have extensions.py that creates db, login_manager, cors
# Example extensions.py:
# from flask_sqlalchemy import SQLAlchemy
# from flask_login import LoginManager
# from flask_cors import CORS
# db = SQLAlchemy()
# login_manager = LoginManager()
# cors = CORS()
try:
    from extensions import db, login_manager, cors
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    cors.init_app(app)
except Exception as e:
    print("Warning: extensions import failed. Make sure extensions.py exists and defines db, login_manager, cors.")
    print(e)

# Import models after extensions are set up
try:
    from models import User
except Exception as e:
    print("Warning: models import failed (User). Ensure models.py exists and defines User.")
    print(e)

# User loader
try:
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
except Exception:
    pass

# Unauthorized handler
from flask import request as _req
@login_manager.unauthorized_handler
def unauthorized():
    if _req.path.startswith('/api/'):
        return jsonify({'error': 'Authentication required'}), 401
    return redirect('/login')

# Register blueprints if they exist (your project likely defines these)
try:
    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.annotations import annotations_bp
    from routes.qa import qa_bp
    from routes.discussions import discussions_bp
    from routes.ai_design import ai_design_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(annotations_bp, url_prefix='/api/annotations')
    app.register_blueprint(qa_bp, url_prefix='/api/qa')
    app.register_blueprint(discussions_bp, url_prefix='/api/discussions')
    app.register_blueprint(ai_design_bp, url_prefix='/api/ai-design')
except Exception as e:
    print("Blueprints not all registered (some route modules missing). Continue without them.")
    print(e)

# Serve uploads
from flask import send_from_directory
@app.route('/static/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# Basic web routes for SPA
@app.route('/login')
def login_page():
    # Serve index.html from build, fallback to JSON if missing
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({'error': 'Login page not available'}), 500

@app.route('/')
def serve_react_app_root():
    try:
        static_folder_path = app.static_folder
        index_path = os.path.join(static_folder_path, 'index.html')

        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
        else:
            files = []
            if os.path.exists(static_folder_path):
                try:
                    files = os.listdir(static_folder_path)
                except Exception as e:
                    files = [f"Error listing static folder: {e}"]
            return jsonify({
                'error': 'Frontend not built',
                'static_folder': static_folder_path,
                'index_exists': os.path.exists(index_path),
                'files': files,
                'current_working_directory': os.getcwd(),
                'all_files_in_root': os.listdir('.') if os.path.exists('.') else []
            }), 500
    except Exception as e:
        return jsonify({'error': f'Static file error: {str(e)}'}), 500

@app.route('/<path:path>')
def serve_react_app(path):
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')


# Health & test
@app.route('/api/health')
def health():
    try:
        user_count = None
        demo_user = None
        try:
            user_count = User.query.count()
            demo_user = User.query.filter_by(email='demo@example.com').first()
        except Exception:
            user_count = None
            demo_user = None

        return {
            'status': 'ok',
            'environment': os.getenv('FLASK_ENV', 'development'),
            'port': os.getenv('PORT', '5000'),
            'database_url': 'configured' if os.getenv('DATABASE_URL') else 'sqlite',
            'database_status': 'connected' if user_count is not None else 'unavailable',
            'user_count': user_count,
            'demo_user_exists': demo_user is not None if demo_user is not None else False,
            'demo_user_id': demo_user.id if demo_user else None
        }
    except Exception as e:
        return {'status': 'error', 'error': str(e)}, 500

@app.route('/api/test')
def test():
    return {'message': 'App is running successfully!'}


# ---------------------------
# Smart File Reader & Q/A
# ---------------------------
# Install: pip install pandas PyMuPDF openpyxl pdfplumber
import fitz  # PyMuPDF
import pandas as pd
import tempfile
import traceback

def summarize_text(text, max_sentences=4):
    # simple summarizer: cut to the first few sentences
    if not text:
        return "No readable text found."
    sentences = [s.strip() for s in text.replace('\r', '').split('.') if s.strip()]
    summary = '. '.join(sentences[:max_sentences])
    if len(sentences) > max_sentences:
        summary += '...'
    return summary

@app.route('/api/read-file', methods=['POST'])
def read_file():
    """
    Upload single PDF or Excel and return summary + lightweight parsed structure.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded.'}), 400

        file = request.files['file']
        filename = file.filename
        _, ext = os.path.splitext(filename.lower())

        # save temp
        tmp = os.path.join(app.config['UPLOAD_FOLDER'], f"{int(pd.Timestamp.now().timestamp())}_{filename}")
        file.save(tmp)

        if ext == '.pdf':
            # extract text with PyMuPDF
            text = ""
            with fitz.open(tmp) as doc:
                for page in doc:
                    text += page.get_text("text") + "\n"

            # If PDF has no extractable text, we could add OCR later (tesseract)
            data = {
                "file_type": "pdf",
                "summary": summarize_text(text),
                "text_sample": text[:3000]
            }
            return jsonify({"status": "success", "data": data}), 200

        elif ext in ('.xls', '.xlsx'):
            # read all sheets with pandas
            try:
                sheets = pd.read_excel(tmp, sheet_name=None)
            except Exception as e:
                return jsonify({"error": f"Failed to read Excel: {str(e)}"}), 500

            sheet_summaries = {}
            for sheet_name, df in sheets.items():
                df = df.dropna(how='all')
                # clean column names to strings
                df.columns = [str(c).strip() for c in df.columns]
                sheet_summaries[sheet_name] = {
                    "columns": list(df.columns),
                    "rows": len(df),
                    "sample_rows": df.head(5).to_dict(orient='records')
                }

            data = {
                "file_type": "excel",
                "sheets": sheet_summaries
            }
            return jsonify({"status": "success", "data": data}), 200

        else:
            return jsonify({'error': 'Unsupported file type. Use PDF or Excel.'}), 400

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/ask', methods=['POST'])
def ask_about_file():
    """
    Ask question about a previously uploaded file.
    Body: { filename: "<saved filename>", question: "..." }
    (Filename should be the name returned or the original name saved in read-file response.)
    """
    try:
        body = request.get_json(force=True)
        filename = body.get('filename')
        question = body.get('question', '').strip()
        if not filename or not question:
            return jsonify({'error': 'filename and question are required'}), 400

        saved_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(saved_path):
            # try matching with substring (in case timestamp prefix used)
            candidates = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) if filename in f]
            if candidates:
                saved_path = os.path.join(app.config['UPLOAD_FOLDER'], candidates[0])
            else:
                return jsonify({'error': 'File not found. Re-upload via /api/read-file.'}), 404

        _, ext = os.path.splitext(saved_path.lower())

        q = question.lower()

        if ext == '.pdf':
            text = ""
            with fitz.open(saved_path) as doc:
                for page in doc:
                    text += page.get_text("text") + "\n"
            # simple keyword search
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            matches = [ln for ln in lines if q in ln.lower()]
            if matches:
                answer = " ".join(matches[:5])
                return jsonify({
                    "answer": answer,
                    "explanation": f"Found {len(matches)} matching lines in PDF (showing up to 5)."
                })
            else:
                # fuzzy fallback: show first 2000 chars
                return jsonify({
                    "answer": "No exact match found inside PDF text.",
                    "hint": "Try asking for a keyword such as 'FROSTED' or 'W1842', or upload the correct sheet.",
                    "text_sample": text[:2000]
                }), 200

        elif ext in ('.xls', '.xlsx'):
            sheets = pd.read_excel(saved_path, sheet_name=None)
            found = []
            for sheet_name, df in sheets.items():
                # normalize columns to str
                df.columns = [str(c) for c in df.columns]
                # search across all columns
                try:
                    mask = pd.DataFrame(False, index=df.index, columns=df.columns)
                    for col in df.columns:
                        mask_col = df[col].astype(str).str.contains(question, case=False, na=False)
                        if mask_col.any():
                            matches = df[mask_col]
                            found.append({
                                "sheet": sheet_name,
                                "column": col,
                                "rows": matches.head(5).to_dict(orient='records')
                            })
                except Exception:
                    # ignore problematic column casts
                    continue

            if found:
                # Build a friendly natural answer summarizing the top match
                top = found[0]
                pretty_rows = top['rows']
                # Try to extract a price number if question asks about price
                import re
                price_value = None
                if 'price' in q or '$' in q:
                    # find first numeric in top rows
                    for r in pretty_rows:
                        for v in r.values():
                            if v is None: 
                                continue
                            m = re.search(r'(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)', str(v))
                            if m:
                                price_value = m.group(0)
                                break
                        if price_value:
                            break

                human_answer = ""
                if price_value:
                    human_answer = f"For your question about '{question}', I found a price-like value {price_value} in sheet '{top['sheet']}', column '{top['column']}'.\n\nExample row:\n{pretty_rows[0]}"
                else:
                    human_answer = f"I found {len(found)} matching place(s). Top match: sheet '{top['sheet']}', column '{top['column']}'. Example row: {pretty_rows[0]}"

                return jsonify({
                    "answer": human_answer,
                    "matches": found
                }), 200
            else:
                return jsonify({"answer": "No matching rows found in Excel for that question."}), 200

        else:
            return jsonify({"error": "Unsupported file type."}), 400

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# Error handlers
@app.errorhandler(404)
def not_found(error):
    if request.path.startswith('/api/'):
        return jsonify(error='Resource not found'), 404
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(500)
def internal_error(error):
    if request.path.startswith('/api/'):
        return jsonify(error='Internal server error'), 500
    return jsonify(error='Internal server error'), 500

@app.errorhandler(413)
@app.errorhandler(RequestEntityTooLarge)
def file_too_large(e):
    return jsonify(error="File is larger than the maximum allowed size (50MB)."), 413


# Database init block (keeps your previous logic but guarded)
with app.app_context():
    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        existing_tables = inspector.get_table_names()
        if not existing_tables:
            db.create_all()
    except Exception as e:
        try:
            db.create_all()
        except Exception as e2:
            print("Warning: database initialization failed", e2)

    try:
        # create default user if possible
        default = User.query.filter_by(email='default@example.com').first() if 'User' in globals() else None
        if default is None and 'User' in globals():
            import bcrypt
            hashed_password = bcrypt.hashpw('default123'.encode('utf-8'), bcrypt.gensalt())
            default_user = User(name='Default User', email='default@example.com', password=hashed_password.decode('utf-8'), role='user')
            db.session.add(default_user)
            db.session.commit()
    except Exception as e:
        print("Skipping default user creation:", e)


if __name__ == '__main__':
    port = os.getenv('PORT', '5000')
    try:
        port = int(port)
    except Exception:
        port = 5000
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)
