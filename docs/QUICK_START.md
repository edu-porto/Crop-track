# Quick Start: React-Flask Integration

This guide provides step-by-step instructions to implement the map-based crop analysis system.

## Prerequisites

- Python 3.8+
- Node.js 16+
- Flask backend running
- React frontend running

## Step 1: Backend Setup

### 1.1 Install Dependencies

```bash
cd "Modulo XIV/sprint 3/backend"
pip install flask-sqlalchemy
```

### 1.2 Update app.py

Add these imports at the top:

```python
from database import db, Field, Spot, AnalysisResult
from utils import point_in_polygon, validate_polygon
import json
from pathlib import Path
```

Add database configuration after `app = Flask(__name__)`:

```python
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crop_analysis.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Initialize database
with app.app_context():
    db.create_all()
```

### 1.3 Add Field Endpoints

Add these routes to `app.py`:

```python
@app.route('/api/fields', methods=['POST'])
def create_field():
    """Create a new field"""
    data = request.get_json()
    
    if not data.get('name') or not data.get('polygon_coordinates'):
        return jsonify({'error': 'Name and polygon_coordinates required'}), 400
    
    # Validate polygon
    is_valid, error_msg = validate_polygon(data['polygon_coordinates'])
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    field = Field(
        name=data['name'],
        crop_type=data.get('crop_type', 'coffee'),
        polygon_coordinates=json.dumps(data['polygon_coordinates'])
    )
    
    try:
        db.session.add(field)
        db.session.commit()
        return jsonify(field.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/fields', methods=['GET'])
def get_fields():
    """Get all fields"""
    fields = Field.query.all()
    return jsonify({'fields': [f.to_dict() for f in fields]})


@app.route('/api/fields/<int:field_id>', methods=['GET'])
def get_field(field_id):
    """Get a specific field with spots"""
    field = Field.query.get_or_404(field_id)
    result = field.to_dict()
    result['spots'] = [s.to_dict() for s in field.spots]
    return jsonify(result)


@app.route('/api/fields/<int:field_id>', methods=['DELETE'])
def delete_field(field_id):
    """Delete a field"""
    field = Field.query.get_or_404(field_id)
    try:
        db.session.delete(field)
        db.session.commit()
        return jsonify({'message': 'Field deleted'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
```

### 1.4 Add Spot Endpoint

Add this route to `app.py`:

```python
@app.route('/api/fields/<int:field_id>/spots', methods=['POST'])
def create_spot(field_id):
    """Create a spot and analyze image"""
    field = Field.query.get_or_404(field_id)
    
    # Get coordinates
    try:
        lat = float(request.form.get('latitude'))
        lng = float(request.form.get('longitude'))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid coordinates'}), 400
    
    # Validate point is inside polygon
    polygon_coords = field.get_polygon_coords()
    if not point_in_polygon(lat, lng, polygon_coords):
        return jsonify({'error': 'Spot must be inside field polygon'}), 400
    
    # Handle image upload
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400
    
    # Create upload directory
    upload_dir = Path('uploads') / f'field_{field_id}'
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Save image
    filename = f"spot_{int(time.time())}_{file.filename}"
    filepath = upload_dir / filename
    file.save(str(filepath))
    
    # Read image bytes for analysis
    file.seek(0)
    image_bytes = file.read()
    
    # Create spot
    spot = Spot(
        field_id=field_id,
        latitude=lat,
        longitude=lng,
        image_path=str(filepath),
        image_filename=file.filename,
        device=request.form.get('device'),
        notes=request.form.get('notes')
    )
    db.session.add(spot)
    db.session.flush()  # Get spot.id
    
    # Perform analysis (reuse analyze_crop_image logic)
    try:
        # Assess image quality
        quality_assessment = assess_image_quality(image_bytes)
        
        # Check if unusable
        laplacian_var = quality_assessment.get('laplacian_variance', 1000)
        mean_brightness = quality_assessment.get('mean_brightness', 128)
        is_unusable = (
            (quality_assessment['is_blurry'] and laplacian_var < 50) or
            mean_brightness < 20 or mean_brightness > 240
        )
        
        if is_unusable:
            status = 'unusable_image'
            health_label = 'unknown'
            confidence = 0.0
            predictions_data = {
                'health_assessment': {'label': health_label, 'confidence': confidence},
                'detailed_findings': {
                    'diseases_detected': [],
                    'pests_detected': [],
                    'nutrient_deficiencies_detected': [],
                    'stress_signs': []
                }
            }
        else:
            # Load model and predict
            model_name = None
            preferred_models = ['CustomCNN1', 'CustomCNN2', 'CustomCNN3', 'EfficientNet']
            for preferred in preferred_models:
                if preferred in model_paths:
                    model_name = preferred
                    break
            
            if not model_name and model_paths:
                model_name = list(model_paths.keys())[0]
            
            if not model_name:
                raise ValueError('No models available')
            
            model = load_model(model_name)
            image_tensor = preprocess_image(image_bytes)
            prediction_result = predict_image(model, model_name, image_tensor)
            predictions = map_prediction_to_schema(prediction_result, field.crop_type)
            
            status = 'ok'
            health_label = predictions['health_assessment']['label']
            confidence = predictions['health_assessment']['confidence']
            predictions_data = predictions
        
        # Store analysis
        analysis = AnalysisResult(
            spot_id=spot.id,
            model_version='1.0',
            status=status,
            health_label=health_label,
            confidence=confidence,
            diseases_detected=json.dumps(predictions_data['detailed_findings']['diseases_detected']),
            pests_detected=json.dumps(predictions_data['detailed_findings']['pests_detected']),
            nutrient_deficiencies_detected=json.dumps(predictions_data['detailed_findings']['nutrient_deficiencies_detected']),
            stress_signs=json.dumps(predictions_data['detailed_findings']['stress_signs']),
            image_quality_is_blurry=quality_assessment['is_blurry'],
            image_quality_is_underexposed=quality_assessment['is_underexposed'],
            image_quality_is_overexposed=quality_assessment['is_overexposed']
        )
        db.session.add(analysis)
        db.session.commit()
        
        return jsonify({
            'spot': spot.to_dict(),
            'analysis': analysis.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500
```

### 1.5 Add Analysis Summary Endpoint

```python
@app.route('/api/fields/<int:field_id>/analysis-summary', methods=['GET'])
def get_analysis_summary(field_id):
    """Get aggregated analysis for visualization"""
    field = Field.query.get_or_404(field_id)
    spots = field.spots
    
    # Count health distribution
    health_dist = {}
    heatmap_data = []
    
    for spot in spots:
        if spot.analysis:
            label = spot.analysis.health_label
            health_dist[label] = health_dist.get(label, 0) + 1
            
            heatmap_data.append({
                'latitude': spot.latitude,
                'longitude': spot.longitude,
                'severity': spot.analysis.confidence or 0.5,
                'health_label': label
            })
    
    return jsonify({
        'field_id': field_id,
        'total_spots': len(spots),
        'health_distribution': health_dist,
        'disease_heatmap': heatmap_data
    })
```

## Step 2: Frontend Setup

### 2.1 Install Dependencies

```bash
cd "Modulo XIV/sprint 3/frontend"
npm install leaflet react-leaflet react-leaflet-draw
npm install leaflet.heat
```

### 2.2 Create Components Directory

```bash
mkdir src/components
```

### 2.3 Create MapView Component

Create `src/components/MapView.js` (see INTEGRATION_DESIGN.md for full code)

### 2.4 Update App.js

Replace the current App.js with a router that includes both the original upload view and the new map view:

```javascript
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import MapView from './components/MapView';
import ImageUploader from './ImageUploader'; // Your existing component

function App() {
  return (
    <Router>
      <nav>
        <Link to="/">Map View</Link> | <Link to="/upload">Image Upload</Link>
      </nav>
      <Routes>
        <Route path="/" element={<MapView />} />
        <Route path="/upload" element={<ImageUploader />} />
      </Routes>
    </Router>
  );
}

export default App;
```

### 2.5 Add Leaflet CSS

Add to `src/index.js`:

```javascript
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
```

## Step 3: Testing

### 3.1 Test Backend

```bash
# Start backend
cd backend
python app.py

# Test in another terminal
curl -X POST http://localhost:5000/api/fields \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Field",
    "crop_type": "coffee",
    "polygon_coordinates": [[-23.5505, -46.6333], [-23.5515, -46.6333], [-23.5515, -46.6343], [-23.5505, -46.6343]]
  }'
```

### 3.2 Test Frontend

```bash
# Start frontend
cd frontend
npm start

# Open http://localhost:3000
```

## Step 4: Workflow Testing

1. **Create Field**: Draw polygon on map → Enter name → Save
2. **Add Spot**: Select field → Click location → Upload image → Analyze
3. **View Results**: See colored markers and analysis details
4. **View Summary**: See health distribution and heatmap

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure `CORS(app)` is enabled in Flask
2. **Map Not Loading**: Check Leaflet CSS imports
3. **Point-in-Polygon Fails**: Verify coordinates format `[lat, lng]`
4. **Image Upload Fails**: Check upload directory permissions
5. **Database Errors**: Ensure `db.create_all()` is called

### Debug Tips

- Check browser console for frontend errors
- Check Flask terminal for backend errors
- Use Postman/curl to test API endpoints directly
- Verify database file is created (`crop_analysis.db`)

## Next Steps

- Add authentication
- Add field editing
- Add spot deletion
- Add export functionality
- Add mobile responsiveness
- Deploy to production

