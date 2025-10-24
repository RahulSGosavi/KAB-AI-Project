from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from extensions import db
from models import Project, ProjectFile, User
import os
import PyPDF2
import threading
from datetime import datetime

ai_design_bp = Blueprint('ai_design', __name__)

def get_openai_client():
    """Get OpenAI client, initializing it if needed"""
    try:
        from openai import OpenAI
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            return None
        return OpenAI(api_key=api_key)
    except Exception as e:
        print(f"Error initializing OpenAI client: {e}")
        return None

def get_grok_client():
    """Get Grok AI client, initializing it if needed"""
    try:
        # Grok AI integration would go here
        # For now, return None as it requires separate setup
        grok_api_key = os.getenv('GROK_API_KEY')
        if not grok_api_key:
            return None
        # TODO: Implement Grok AI client when API becomes available
        return None
    except Exception as e:
        print(f"Error initializing Grok client: {e}")
        return None

def extract_text_from_pdf(file_path, max_pages=10):
    """Extract text from PDF file for analysis"""
    try:
        text = ""
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            num_pages = min(len(pdf_reader.pages), max_pages)
            
            for page_num in range(num_pages):
                page = pdf_reader.pages[page_num]
                text += page.extract_text() + "\n\n"
        
        return text[:10000]  # Limit to 10k characters
    except Exception as e:
        print(f"Error extracting PDF text: {e}")
        return ""

@ai_design_bp.route('/analyze/<int:project_id>', methods=['POST'])
def analyze_project(project_id):
    """
    Analyze a project and provide AI-powered design insights
    """
    user_id = current_user.id
    project = Project.query.filter_by(id=project_id, user_id=user_id).first()
    
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    # Get OpenAI client
    client = get_openai_client()
    
    if not client:
        return jsonify({
            'error': 'OpenAI API not configured',
            'message': 'Please set OPENAI_API_KEY environment variable to use AI features'
        }), 503
    
    try:
        # Extract context from project files
        file_context = ""
        if project.files:
            for file in project.files[:3]:  # Analyze up to 3 files
                file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], file.file_path)
                if file.file_type == 'pdf' and os.path.exists(file_path):
                    pdf_text = extract_text_from_pdf(file_path)
                    if pdf_text:
                        file_context += f"\n\nFile: {file.name}\nContent:\n{pdf_text}\n"
        
        # Create comprehensive analysis prompt
        system_prompt = """You are an expert interior designer and architect with 20+ years of experience. 
You provide comprehensive design analysis including:
- Space planning and layout optimization
- Material and finish recommendations
- Color palette suggestions
- Lighting design
- Budget-conscious alternatives
- Sustainability considerations
- Current design trends

Provide detailed, actionable recommendations."""
        
        user_prompt = f"""Please analyze this interior design project:

Project Name: {project.name}
Description: {project.description or 'No description provided'}

{file_context if file_context else 'No files uploaded yet.'}

Provide a comprehensive design analysis covering:
1. Overall Design Assessment
2. Space Planning Recommendations
3. Material & Finish Suggestions
4. Color Palette Recommendations
5. Lighting Design Ideas
6. Budget Optimization Tips
7. Next Steps and Priorities

Format your response in a clear, professional manner with specific, actionable recommendations."""

        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=1500,
            temperature=0.7
        )
        
        analysis = response.choices[0].message.content
        
        return jsonify({
            'success': True,
            'project_id': project_id,
            'analysis': analysis,
            'files_analyzed': len(project.files) if project.files else 0
        }), 200
        
    except Exception as e:
        print(f"Error in AI analysis: {str(e)}")
        return jsonify({
            'error': 'Analysis failed',
            'message': str(e)
        }), 500

@ai_design_bp.route('/color-palette/<int:project_id>', methods=['POST'])
def generate_color_palette(project_id):
    """
    Generate AI-powered color palette recommendations
    """
    user_id = current_user.id
    project = Project.query.filter_by(id=project_id, user_id=user_id).first()
    
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    client = get_openai_client()
    if not client:
        return jsonify({
            'error': 'OpenAI API not configured'
        }), 503
    
    try:
        data = request.get_json() or {}
        style = data.get('style', 'modern')
        room_type = data.get('room_type', 'living room')
        
        prompt = f"""As an expert color consultant, create a professional color palette for a {style} style {room_type}.

Project: {project.name}
Description: {project.description or 'No description'}

Provide:
1. Primary Color (with hex code)
2. Secondary Color (with hex code)
3. Accent Color (with hex code)
4. Neutral/Background Color (with hex code)
5. Brief explanation of why these colors work together
6. Application suggestions (where to use each color)

Format each color as: Color Name (#HEXCODE) - Usage description"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert color consultant and interior designer."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=800,
            temperature=0.8
        )
        
        return jsonify({
            'success': True,
            'palette': response.choices[0].message.content,
            'style': style,
            'room_type': room_type
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ai_design_bp.route('/material-recommendations/<int:project_id>', methods=['POST'])
def recommend_materials(project_id):
    """
    Generate AI-powered material and finish recommendations
    """
    user_id = current_user.id
    project = Project.query.filter_by(id=project_id, user_id=user_id).first()
    
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    client = get_openai_client()
    if not client:
        return jsonify({'error': 'OpenAI API not configured'}), 503
    
    try:
        data = request.get_json() or {}
        budget_level = data.get('budget', 'medium')  # low, medium, high
        sustainability = data.get('sustainability', False)
        
        prompt = f"""As an expert in materials and finishes, recommend materials for this interior design project:

Project: {project.name}
Description: {project.description or 'No description'}
Budget Level: {budget_level}
Sustainability Priority: {'Yes' if sustainability else 'No'}

Provide specific recommendations for:
1. Flooring (2-3 options with pros/cons)
2. Wall Finishes (2-3 options)
3. Countertops/Surfaces (2-3 options)
4. Cabinetry/Millwork (2-3 options)
5. Hardware & Fixtures (style recommendations)

For each material, include:
- Material name and type
- Approximate price range
- Durability rating
- Maintenance requirements
- Aesthetic qualities
- Sustainability notes (if applicable)"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert in interior design materials and finishes."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1200,
            temperature=0.7
        )
        
        return jsonify({
            'success': True,
            'recommendations': response.choices[0].message.content,
            'budget_level': budget_level,
            'sustainability_focused': sustainability
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@ai_design_bp.route('/cost-estimate/<int:project_id>', methods=['POST'])
def estimate_costs(project_id):
    """
    Generate AI-powered cost estimation and budgeting with enhanced accuracy
    """
    user_id = current_user.id
    project = Project.query.filter_by(id=project_id, user_id=user_id).first()
    
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    
    client = get_openai_client()
    if not client:
        return jsonify({'error': 'OpenAI API not configured. Please set your OPENAI_API_KEY environment variable.'}), 503
    
    try:
        data = request.get_json() or {}
        square_footage = data.get('square_footage', 0)
        scope = data.get('scope', 'full renovation')
        location = data.get('location', 'United States')
        ai_provider = data.get('ai_provider', 'gpt-4')  # gpt-4, gpt-3.5-turbo, or grok
        
        # Input validation
        if not square_footage or square_footage <= 0:
            return jsonify({'error': 'Please provide a valid square footage greater than 0'}), 400
        
        if not location or location.strip() == '':
            return jsonify({'error': 'Please provide a valid location'}), 400
        
        # Enhanced prompt with more specific instructions
        prompt = f"""You are an expert construction cost estimator and project manager with 20+ years of experience. Provide a comprehensive, accurate budget estimate for this interior design project.

PROJECT DETAILS:
- Project Name: {project.name}
- Description: {project.description or 'No description provided'}
- Square Footage: {square_footage} sq ft
- Project Scope: {scope}
- Location: {location}

REQUIRED OUTPUT FORMAT:
Please provide a detailed budget breakdown in the following structure:

## 📊 TOTAL BUDGET ESTIMATE
**Range: $X,XXX - $XX,XXX** (based on {location} market rates)

## 📋 DETAILED BREAKDOWN

### 1. Design & Planning (X-X% of total)
- **Range: $X,XXX - $X,XXX**
- Architect/Designer fees: $X,XXX - $X,XXX
- Permits & inspections: $X,XXX - $X,XXX
- **Key factors:** [List 2-3 main factors]
- **Cost-saving tips:** [Provide specific alternatives]

### 2. Materials & Finishes (X-X% of total)
- **Range: $X,XXX - $X,XXX**
- Flooring: $X,XXX - $X,XXX
- Paint & finishes: $X,XXX - $X,XXX
- Fixtures & hardware: $X,XXX - $X,XXX
- **Key factors:** [List 2-3 main factors]
- **Cost-saving tips:** [Provide specific alternatives]

### 3. Labor & Installation (X-X% of total)
- **Range: $X,XXX - $X,XXX**
- General contractor: $X,XXX - $X,XXX
- Specialized trades: $X,XXX - $X,XXX
- **Key factors:** [List 2-3 main factors]
- **Cost-saving tips:** [Provide specific alternatives]

### 4. Contingency (10-20%)
- **Range: $X,XXX - $X,XXX**
- Recommended: 15% for {scope} projects

## ⏰ TIMELINE ESTIMATE
- **Duration:** X-X weeks
- **Key milestones:** [List 3-4 major phases]

## 💡 VALUE ENGINEERING SUGGESTIONS
1. [Specific cost-saving recommendation with potential savings]
2. [Another recommendation with potential savings]
3. [Third recommendation with potential savings]

## 🎯 PRIORITY RECOMMENDATIONS
**Must-Have (Core Budget):** [List essential items]
**Nice-to-Have (Upgrade Budget):** [List optional upgrades]
**Future Considerations:** [List items that can be added later]

## 📈 MARKET INSIGHTS
- Current {location} market trends affecting costs
- Seasonal considerations
- Material availability factors

IMPORTANT: Use current 2024 market rates for {location}. Be specific with dollar amounts and provide realistic ranges based on the {square_footage} sq ft size and {scope} scope."""

        # Select model and client based on provider preference
        model = "gpt-4"
        if ai_provider == "gpt-3.5-turbo":
            model = "gpt-3.5-turbo"
        elif ai_provider == "grok":
            # Check if Grok is available, otherwise fallback to GPT-4
            grok_client = get_grok_client()
            if grok_client:
                # TODO: Implement Grok AI call when API becomes available
                model = "gpt-4"  # Fallback for now
            else:
                model = "gpt-4"  # Fallback to GPT-4
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are an expert construction cost estimator and project manager with extensive knowledge of current market rates, building codes, and cost optimization strategies. Always provide accurate, detailed, and actionable cost estimates."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.3  # Lower temperature for more consistent, accurate results
        )
        
        estimate_content = response.choices[0].message.content
        
        # Add metadata to the response
        return jsonify({
            'success': True,
            'estimate': estimate_content,
            'metadata': {
                'square_footage': square_footage,
                'scope': scope,
                'location': location,
                'ai_provider': ai_provider,
                'model_used': model,
                'generated_at': datetime.utcnow().isoformat(),
                'project_id': project_id
            }
        }), 200
        
    except Exception as e:
        error_message = str(e)
        if "rate limit" in error_message.lower():
            return jsonify({'error': 'API rate limit exceeded. Please wait a moment and try again.'}), 429
        elif "insufficient_quota" in error_message.lower():
            return jsonify({'error': 'OpenAI API quota exceeded. Please check your billing settings.'}), 402
        elif "invalid_api_key" in error_message.lower():
            return jsonify({'error': 'Invalid OpenAI API key. Please check your configuration.'}), 401
        else:
            return jsonify({'error': f'Failed to generate cost estimate: {error_message}'}), 500

@ai_design_bp.route('/quick-suggestion', methods=['POST'])
def quick_suggestion():
    """
    Get a quick AI design suggestion without a specific project
    """
    client = get_openai_client()
    if not client:
        return jsonify({'error': 'OpenAI API not configured'}), 503
    
    try:
        data = request.get_json()
        question = data.get('question', '')
        
        if not question:
            return jsonify({'error': 'Question is required'}), 400
        
        response = client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert interior designer providing quick, practical design advice."},
                {"role": "user", "content": question}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        return jsonify({
            'success': True,
            'suggestion': response.choices[0].message.content
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

