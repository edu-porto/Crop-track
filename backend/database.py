"""
Database models for crop analysis system
"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()


class Field(db.Model):
    """Field model - stores field polygons"""
    __tablename__ = 'fields'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    crop_type = db.Column(db.String(100))
    polygon_coordinates = db.Column(db.Text, nullable=False)  # JSON string
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship
    spots = db.relationship('Spot', backref='field', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'name': self.name,
            'crop_type': self.crop_type,
            'polygon_coordinates': json.loads(self.polygon_coordinates),
            'spot_count': len(self.spots),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def get_polygon_coords(self):
        """Get polygon coordinates as list"""
        return json.loads(self.polygon_coordinates)


class Spot(db.Model):
    """Spot model - stores GPS locations where images were taken"""
    __tablename__ = 'spots'
    
    id = db.Column(db.Integer, primary_key=True)
    field_id = db.Column(db.Integer, db.ForeignKey('fields.id'), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    image_path = db.Column(db.String(500))
    image_filename = db.Column(db.String(200))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    device = db.Column(db.String(100))
    notes = db.Column(db.Text)
    
    # Relationship
    analysis = db.relationship('AnalysisResult', backref='spot', uselist=False, cascade='all, delete-orphan')
    
    def to_dict(self, include_analysis=True):
        """Convert to dictionary for JSON serialization"""
        result = {
            'id': self.id,
            'field_id': self.field_id,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'device': self.device,
            'notes': self.notes,
            'image_filename': self.image_filename
        }
        
        if include_analysis and self.analysis:
            result['analysis'] = self.analysis.to_dict()
        
        return result


class AnalysisResult(db.Model):
    """Analysis result model - stores AI model analysis results"""
    __tablename__ = 'analysis_results'
    
    id = db.Column(db.Integer, primary_key=True)
    spot_id = db.Column(db.Integer, db.ForeignKey('spots.id'), nullable=False, unique=True)
    model_version = db.Column(db.String(50))
    status = db.Column(db.String(50), nullable=False)  # 'ok' or 'unusable_image'
    health_label = db.Column(db.String(50))  # 'healthy', 'diseased', etc.
    confidence = db.Column(db.Float)
    diseases_detected = db.Column(db.Text)  # JSON array
    pests_detected = db.Column(db.Text)  # JSON array
    nutrient_deficiencies_detected = db.Column(db.Text)  # JSON array
    stress_signs = db.Column(db.Text)  # JSON array
    image_quality_is_blurry = db.Column(db.Boolean)
    image_quality_is_underexposed = db.Column(db.Boolean)
    image_quality_is_overexposed = db.Column(db.Boolean)
    processing_time_ms = db.Column(db.Integer)
    analyzed_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'model_version': self.model_version,
            'status': self.status,
            'health_assessment': {
                'label': self.health_label,
                'confidence': self.confidence
            },
            'detailed_findings': {
                'diseases_detected': json.loads(self.diseases_detected) if self.diseases_detected else [],
                'pests_detected': json.loads(self.pests_detected) if self.pests_detected else [],
                'nutrient_deficiencies_detected': json.loads(self.nutrient_deficiencies_detected) if self.nutrient_deficiencies_detected else [],
                'stress_signs': json.loads(self.stress_signs) if self.stress_signs else []
            },
            'image_quality': {
                'is_blurry': self.image_quality_is_blurry,
                'is_underexposed': self.image_quality_is_underexposed,
                'is_overexposed': self.image_quality_is_overexposed
            },
            'processing_time_ms': self.processing_time_ms,
            'analyzed_at': self.analyzed_at.isoformat() if self.analyzed_at else None
        }

