# backend/app.py
import os
from dotenv import load_dotenv
from flask import Flask, render_template, send_from_directory, jsonify, request, redirect
from werkzeug.exceptions import RequestEntityTooLarge

# --- NEW IMPORTS REQUIRED FOR ANALYSIS ---
import pandas as pd
import numpy as np
import re
import traceback
# ----------------------------------------

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
try:
    from extensions import db, login_manager, cors
    db.init_app(app)
    # ... (rest of extensions init) ...
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
# ... (existing web routes) ...
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
# ... (existing health/test routes) ...
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
# ... (existing /api/read-file and /api/ask routes) ...
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
            import fitz # PyMuPDF
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
                return jsonify({"error": f"Failed to read Excel: {str(e)}"}, 500)

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
    (This route uses a basic keyword/column search.)
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
            import fitz # PyMuPDF
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
# ---------------------------
# END EXISTING Q/A
# ---------------------------


# ---------------------------
# 🛠️ SMART PRICING ANALYSIS (NEW CODE TO FIX THE CHAT)
# ---------------------------

# Map for converting header codes/descriptions to natural material names
MATERIAL_ID_MAP = {
    '763': 'ELITE CHERRY / ELITE DURAFORM (TEXTURED)',
    '682': 'PREMIUM CHERRY / PREMIUM DURAFORM (TEXTURED) / ELITE MAPLE / ELITE PAINTED',
    '608': 'PRIME CHERRY / PREMIUM MAPLE / PREMIUM PAINTED / PREMIUM DURAFORM (NON-TEXTURED)',
    '543': 'PRIME MAPLE / PRIME PAINTED / PRIME DURAFORM',
    '485': 'CHOICE DURAFORM / CHOICE MAPLE / CHOICE PAINTED',
    'BASE': 'BASE / STANDARD',
    'STANDARD': 'BASE / STANDARD',
    'N/A': 'BASE / STANDARD',
    '753': 'ELITE CHERRY / ELITE DURAFORM (TEXTURED)',
    '672': 'PREMIUM CHERRY / ELITE MAPLE / ELITE PAINTED',
    '600': 'PRIME CHERRY / PREMIUM MAPLE / PREMIUM PAINTED / PREMIUM DURAFORM (NON-TEXTURED)',
    '536': 'PRIME MAPLE / PRIME PAINTED / PRIME DURAFORM',
    '479': 'CHOICE DURAFORM / CHOICE MAPLE / CHOICE PAINTED',
}

def extract_material_name(raw_header):
    """Translates raw header to a standard material name using the map."""
    if not raw_header:
        return ''
    
    material_name = str(raw_header).strip().upper()
    
    # 1. Check Hardcoded ID Map
    numeric_code_match = re.search(r'\b\d{3}\b', material_name)
    if numeric_code_match and numeric_code_match.group() in MATERIAL_ID_MAP:
        return MATERIAL_ID_MAP[numeric_code_match.group()]
    
    for key, value in MATERIAL_ID_MAP.items():
        if key in material_name:
             return value

    # 2. Check Keywords
    if 'ELITE CHERRY' in material_name or 'ELITE DURAFORM' in material_name:
        return 'ELITE CHERRY / ELITE DURAFORM (TEXTURED)'
    if 'PREMIUM CHERRY' in material_name or 'PREMIUM DURAFORM' in material_name or 'ELITE MAPLE' in material_name:
        return 'PREMIUM CHERRY / PREMIUM DURAFORM (TEXTURED) / ELITE MAPLE / ELITE PAINTED'
    if 'PRIME CHERRY' in material_name or 'PRIME MAPLE' in material_name:
        return 'PRIME CHERRY / PREMIUM MAPLE / PREMIUM PAINTED / PREMIUM DURAFORM (NON-TEXTURED)'
    if 'BASE' in material_name or 'STANDARD' in material_name:
        return 'BASE / STANDARD'
    
    return material_name

def parse_data_file(file_path, filename):
    """Reads a file into a pandas DataFrame, trying to detect the header row."""
    df = None
    try:
        # Check if the file is an Excel file
        if filename.lower().endswith(('.xlsx', '.xls')):
            xls = pd.ExcelFile(file_path)
            sheet_name = xls.sheet_names[0]
            df_check = pd.read_excel(xls, sheet_name=sheet_name, header=None, nrows=10, keep_default_na=False)
            
            # Simple header detection
            best_header_row = 0
            max_score = -1
            
            for i in range(len(df_check)):
                row = df_check.iloc[i]
                score = row.apply(lambda x: 1 if isinstance(x, str) and len(str(x).strip()) > 0 and not re.match(r'^-?\d+(\.\d+)?$', str(x).strip()) else 0).sum()
                if score > max_score and str(row.iloc[0]).strip().upper() in ['SKU', 'OPTION', 'W942', 'DDF24', 'DOOR STYLES', 'WRH3024 RP', 'CONSTRUCTION OPTIONS']:
                    max_score = score
                    best_header_row = i
            
            df = pd.read_excel(xls, sheet_name=sheet_name, header=best_header_row, keep_default_na=False)

        # Check if the file is a CSV
        elif filename.lower().endswith('.csv'):
             df_check = pd.read_csv(file_path, header=None, nrows=10, keep_default_na=False)
            
             best_header_row = 0
             max_score = -1
             for i in range(len(df_check)):
                 row = df_check.iloc[i]
                 score = row.apply(lambda x: 1 if isinstance(x, str) and len(str(x).strip()) > 0 and not re.match(r'^-?\d+(\.\d+)?$', str(x).strip()) else 0).sum()
                 if score > max_score and str(row.iloc[0]).strip().upper() in ['SKU', 'OPTION', 'W942', 'DDF24', 'DOOR STYLES', 'WRH3024 RP', 'CONSTRUCTION OPTIONS']:
                     max_score = score
                     best_header_row = i
            
             df = pd.read_csv(file_path, header=best_header_row, keep_default_na=False)
        
        if df is not None:
            df = df.dropna(axis=1, how='all')
            df.columns = [str(col).strip() if not str(col).startswith('Unnamed:') else '' for col in df.columns]

        return df

    except Exception as e:
        app.logger.error(f"Error parsing file {filename}: {e}")
        return None

def build_data_index(data_frames, filename_map):
    """Builds a flattened index map: SKU -> List of Price Records."""
    data_index = {}
    
    for filename, df in data_frames.items():
        if df is None or df.empty:
            continue

        raw_headers = list(df.columns)
        sku_col_name = next((col for col in raw_headers if col.strip()), None)
        
        if not sku_col_name:
            continue

        for index, row in df.iterrows():
            sku_raw = row[sku_col_name]
            if pd.isna(sku_raw) or not str(sku_raw).strip():
                continue

            sku = str(sku_raw).strip().upper().replace(' ', '')
            
            if not re.match(r'^[A-Z]{1,4}\d{2,6}|MI$', sku):
                 continue

            record = {
                'sku': sku,
                'source': f"{filename_map.get(filename, filename)} > Row {index + 1}",
                'prices': []
            }
            
            for i, raw_header in enumerate(raw_headers):
                if raw_header == sku_col_name or raw_header.startswith('Unnamed:') or not raw_header.strip():
                    continue
                
                cell_value = row.iloc[i]
                if pd.isna(cell_value) or not str(cell_value).strip():
                    continue
                
                # Special handling for Option Pricing sheet MI code
                if sku == 'MI' and raw_header.upper() == 'PRICING':
                    if sku not in data_index:
                        data_index[sku] = []
                    data_index[sku].append({
                        'sku': sku,
                        'source': record['source'],
                        'option_pricing': str(cell_value).strip()
                    })
                    continue

                try:
                    price_str = re.sub(r'[$,]', '', str(cell_value)).strip()
                    price = float(price_str)
                    
                    if 50 <= price <= 20000:
                        material_name = extract_material_name(raw_header)
                        if material_name.strip():
                             record['prices'].append({
                                'material': material_name,
                                'price': price
                            })
                except ValueError:
                    pass
            
            if record['prices']:
                if sku not in data_index:
                    data_index[sku] = []
                data_index[sku].append(record)

    return data_index

def find_prices_for_sku(sku, data_index):
    """Finds all price points for a normalized SKU from the data index."""
    normalized_sku = sku.strip().upper().replace(' ', '')
    
    all_prices = []
    seen_materials = set()
    
    if normalized_sku in data_index:
        for record in data_index[normalized_sku]:
            for price_data in record['prices']:
                material = price_data['material']
                price = price_data['price']
                
                key = f"{material}:{price}"
                if key not in seen_materials:
                    all_prices.append({
                        'sku': normalized_sku,
                        'material': material,
                        'price': price,
                        'source': record['source']
                    })
                    seen_materials.add(key)
    
    return sorted(all_prices, key=lambda x: x['price'])

def process_question(question, data_index):
    """Answers the user question based on the indexed data."""
    q = question.strip().lower()

    # 1. Handle Non-SKU Option Questions (e.g., MI Option)
    if 'matching interior option' in q or 'mi option' in q:
        if 'MI' in data_index and data_index['MI']:
            mi_record = data_index['MI'][0]
            mi_pricing = mi_record.get('option_pricing', '20% Over List Price')
            return {
                'success': True,
                'message': (
                    f"✓ OPTION PRICING\n\n"
                    f"The **Matching Interior Option (MI)** increases the list price by: \n\n"
                    f"**{mi_pricing.strip()}**\n\n"
                    f"📍 Source: {mi_record['source']}"
                )
            }
        else:
            return {
                 'success': False,
                 'message': "Matching Interior Option (MI) data not found in the uploaded files."
            }

    # 2. Extract SKU for all other questions
    sku_match = re.search(r'\b([A-Z]{1,4}\d{2,6}(?:\s*[A-Z]{1,4})*(?:\s*[A-Z]{2,4})?)\b', question, re.IGNORECASE)

    if not sku_match:
        return {
            'success': False,
            'message': 'Please include a valid SKU code in your question.\nExamples: W1230, B24, DB24 2DWR'
        }

    sku_raw = sku_match.group(1).strip()
    all_prices = find_prices_for_sku(sku_raw, data_index)

    if not all_prices:
        return {
            'success': False,
            'message': f'SKU "{sku_raw.upper()}" not found in the pricing data of the uploaded files. Please verify the SKU.'
        }

    # 3. Handle Single Material Price Query
    material_keywords = r'(elite cherry|elite maple|elite painted|elite duraform|premium cherry|premium maple|premium painted|premium duraform|prime cherry|prime maple|prime painted|prime duraform|choice duraform|choice maple|choice painted|base|standard)'
    material_match = re.search(material_keywords, q)
    
    if material_match:
        search_material = material_match.group(1).lower()
        match = next((p for p in all_prices if search_material in p['material'].lower()), None)

        if match:
            return {
                'success': True,
                'message': (
                    f"✓ PRICING ANALYSIS\n\n"
                    f"The price for **{match['sku']}** in the **{match['material']}** option is:\n\n"
                    f"**${match['price']:.2f}**\n\n"
                    f"📍 Source: {match['source']}"
                )
            }
        
    # 4. Handle Least Expensive / Full Range Queries
    sorted_prices = all_prices
    min_price = sorted_prices[0]
    max_price = sorted_prices[-1]
    
    if 'least expensive' in q or 'cheapest' in q or 'lowest price' in q:
        response = (
            f"✓ LEAST EXPENSIVE OPTION\n\n"
            f"The least expensive material option for **{min_price['sku']}** is:\n\n"
            f"**{min_price['material']}**: **${min_price['price']:.2f}**\n\n"
            f"(This is a saving of ${max_price['price'] - min_price['price']:.2f} compared to the highest option: {max_price['material']}).\n\n"
            f"📍 Source: {min_price['source']}"
        )
        return {'success': True, 'message': response}

    # 5. Default General Price Query (Full Range)
    details = '\n'.join([f"- **{p['material']}**: **${p['price']:.2f}**" for p in sorted_prices])
    
    response = (
        f"✓ PRICING ANALYSIS (FULL RANGE)\n\n"
        f"SKU: **{sorted_prices[0]['sku']}**\n"
        f"Materials Available: {len(sorted_prices)}\n"
        f"Price Range: **${min_price['price']:.2f}** - **${max_price['price']:.2f}**\n\n"
        f"### All Options:\n{details}\n\n"
        f"📍 Source: {min_price['source'].split(' > ')[0]}"
    )
    return {'success': True, 'message': response}

def get_file_path_from_id(file_id):
    """Uses the filename property of the file object to get the saved path."""
    filename_id = file_id.get('name') or file_id.get('filename') or file_id
    if not isinstance(filename_id, str):
        # Fallback to a string conversion if the ID is complex
        filename_id = str(filename_id)
            
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename_id)
    
    # Try matching with substring (in case file has a timestamp prefix)
    if not os.path.exists(file_path):
        candidates = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) if filename_id in f]
        if candidates:
            return os.path.join(app.config['UPLOAD_FOLDER'], candidates[0])
    
    return file_path


# ----------------------------------------------------
# NEW ROUTE: /api/projects/analyze-files
# (This route handles the chat component's request)
# ----------------------------------------------------
@app.route('/api/projects/analyze-files', methods=['POST'])
def analyze_files_route():
    data = request.get_json()
    file_ids = data.get('file_ids', [])
    question = data.get('question', '')
    
    if not file_ids or not question:
        return jsonify(error="Missing file IDs or question."), 400

    data_frames = {}
    filename_map = {}
    
    # 1. Parse Files
    for file_id in file_ids:
        # The frontend passes the full file object if files were selected previously.
        file_name_for_map = file_id.get('name') or file_id.get('filename') or str(file_id)
        file_path = get_file_path_from_id(file_id)

        if not os.path.exists(file_path):
            app.logger.warning(f"File not found: {file_path}")
            continue

        # file_path[-25:] is a simple way to get a unique identifier for the dataframe key
        df_key = os.path.basename(file_path) 

        df = parse_data_file(file_path, file_name_for_map)
        if df is not None:
            data_frames[df_key] = df
            filename_map[df_key] = file_name_for_map
            
    if not data_frames:
        return jsonify(error="No valid Excel or CSV files could be parsed. Analysis failed."), 400

    # 2. Build Index and Process Question
    data_index = build_data_index(data_frames, filename_map)
    
    if not data_index:
        return jsonify(error="Could not extract any SKU pricing data from the files. Check that files contain SKU codes and pricing columns."), 400

    result = process_question(question, data_index)

    return jsonify(analysis=result['message'], success=result['success'])

# ---------------------------
# END NEW ANALYSIS CODE
# ---------------------------


# Error handlers
# ... (existing error handlers) ...
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
# ... (rest of the database init block) ...
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