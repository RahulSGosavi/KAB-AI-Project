from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from extensions import db
from models import Annotation, User

annotations_bp = Blueprint('annotations', __name__)

@annotations_bp.route('/file/<int:file_id>', methods=['GET'])
@login_required
def get_annotations_by_file(file_id):
    annotations = Annotation.query.filter_by(file_id=file_id).all()
    return jsonify([a.to_dict() for a in annotations]), 200

@annotations_bp.route('/project/<int:project_id>', methods=['GET'])
@login_required
def get_annotations_by_project(project_id):
    annotations = Annotation.query.filter_by(project_id=project_id).all()
    return jsonify([a.to_dict() for a in annotations]), 200

@annotations_bp.route('', methods=['POST'])
@login_required
def create_annotation():
    user_id = current_user.id
    data = request.get_json()
    
    annotation = Annotation(
        project_id=data.get('project_id'),
        file_id=data.get('file_id'),
        user_id=user_id,
        annotation_type=data.get('type'),
        x=data.get('x'),
        y=data.get('y'),
        width=data.get('width'),
        height=data.get('height'),
        text=data.get('text'),
        color=data.get('color'),
        page=data.get('page', 1)
    )
    
    db.session.add(annotation)
    db.session.commit()
    
    return jsonify(annotation.to_dict()), 201

@annotations_bp.route('/<int:annotation_id>', methods=['PUT'])
@login_required
def update_annotation(annotation_id):
    user_id = current_user.id
    annotation = Annotation.query.filter_by(id=annotation_id, user_id=user_id).first()
    
    if not annotation:
        return jsonify({'message': 'Annotation not found'}), 404
    
    data = request.get_json()
    
    # Update allowed fields
    if 'type' in data:
        annotation.annotation_type = data.get('type')
    if 'x' in data:
        annotation.x = data.get('x')
    if 'y' in data:
        annotation.y = data.get('y')
    if 'width' in data:
        annotation.width = data.get('width')
    if 'height' in data:
        annotation.height = data.get('height')
    if 'text' in data:
        annotation.text = data.get('text')
    if 'color' in data:
        annotation.color = data.get('color')
    if 'page' in data:
        annotation.page = data.get('page')
    
    db.session.commit()
    return jsonify(annotation.to_dict()), 200

@annotations_bp.route('/<int:annotation_id>', methods=['DELETE'])
@login_required
def delete_annotation(annotation_id):
    user_id = current_user.id
    annotation = Annotation.query.filter_by(id=annotation_id, user_id=user_id).first()
    
    if not annotation:
        return jsonify({'message': 'Annotation not found'}), 404
    
    db.session.delete(annotation)
    db.session.commit()
    
    return jsonify({'message': 'Annotation deleted'}), 200

