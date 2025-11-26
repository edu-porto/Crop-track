"""
Flask API for coffee leaf disease classification
"""
import os
import torch
import time
import numpy as np
import cv2
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
from pathlib import Path
from torchvision import transforms
from models import create_model_architecture
from database import db, Field, Spot, AnalysisResult
from utils import point_in_polygon, validate_polygon
from field_calculations import calculate_field_metrics

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crop_analysis.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# Initialize database
with app.app_context():
    db.create_all()
    print("✅ Database initialized")

# Configuration
CONFIG = {
    'img_size': 224,
    'device': torch.device('cuda' if torch.cuda.is_available() else 'cpu'),
}

# Model configurations - maps model names to (num_classes, class_names)
MODEL_CONFIGS = {
    # 5-class models
    'ShuffleNet': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    'MobileNetV3': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    'EfficientNet': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    'CustomCNN1': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    'CustomCNN2': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    'CustomCNN3': (5, ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']),
    # Binary classification models
    'BinaryCNN_Light': (2, ['Healthy', 'Not Healthy']),
    'BinaryCNN_Deep': (2, ['Healthy', 'Not Healthy']),
    'BinaryCNN_Efficient': (2, ['Healthy', 'Not Healthy']),
}

# Only use local models directory
# MODEL_DIRECTORIES = [
#     'models',  # Local models directory only
# ]

# Image preprocessing transform
transform = transforms.Compose([
    transforms.Resize((CONFIG['img_size'], CONFIG['img_size'])),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# Load models into memory
loaded_models = {}
model_paths = {}
model_configs = {}


def scan_for_models():
    """Automatically scan for model files in the local models directory only"""
    global model_paths, model_configs
    
    model_paths = {}
    model_configs = {}
    
    # Only check the local models directory (backend/models/)
    current_dir = Path(__file__).parent
    models_dir = current_dir / 'models'
    
    print("🔍 Scanning for model files in local models directory...")
    print(f"  Directory: {models_dir}")
    
    if not models_dir.exists():
        print(f"  ⚠️  Models directory not found: {models_dir}")
        print(f"  Please create the directory and add model files (.pth)")
        return model_paths
    
    if not models_dir.is_dir():
        print(f"  ⚠️  Path exists but is not a directory: {models_dir}")
        return model_paths
    
    # Look for .pth files in the models directory
    pth_files = list(models_dir.glob('*.pth'))
    
    if not pth_files:
        print(f"  ⚠️  No .pth files found in {models_dir}")
        return model_paths
    
    print(f"  Found {len(pth_files)} .pth file(s)")
    
    for pth_file in pth_files:
        model_name = pth_file.stem.replace('_best', '').replace('_checkpoint', '')
        print(f"  Processing: {pth_file.name} -> {model_name}")
        
        # Try to match model name with known configurations
        matched = False
        for config_name in MODEL_CONFIGS.keys():
            # Check if model name matches (case-insensitive, partial match)
            if (config_name.lower() in model_name.lower() or 
                model_name.lower() in config_name.lower() or
                config_name.lower().replace('cnn', '').replace('_', '') in model_name.lower().replace('_', '')):
                
                if config_name not in model_paths:
                    model_paths[config_name] = str(pth_file.resolve())
                    num_classes, class_names = MODEL_CONFIGS[config_name]
                    model_configs[config_name] = {
                        'num_classes': num_classes,
                        'class_names': class_names
                    }
                    print(f"  ✅ Matched {pth_file.name} to {config_name}")
                    matched = True
                    break
        
        if not matched:
            print(f"  ⚠️  Could not match {pth_file.name} to any known model configuration")
    
    print(f"\n📊 Found {len(model_paths)} matching model(s):")
    for name in model_paths.keys():
        print(f"  - {name}")
    
    if len(model_paths) == 0:
        print(f"\n💡 Tip: Make sure your model files are named like:")
        print(f"     - BinaryCNN_Light_best.pth")
        print(f"     - BinaryCNN_Efficient_best.pth")
        print(f"     - CustomCNN1_best.pth")
        print(f"     etc.")
    
    return model_paths


# Scan for models on startup
scan_for_models()


def _extract_layer_index(key):
    """Extract numeric index from layer key (e.g., 'classifier.4.weight' -> 4)"""
    import re
    # Match patterns like classifier.4, head.6, fc.1, etc.
    match = re.search(r'\.(\d+)\.', key)
    if match:
        return int(match.group(1))
    return 0


def detect_num_classes_from_checkpoint(state_dict, model_name):
    """Detect the number of classes from the checkpoint state dict"""
    # Strategy: Find the LAST classifier/head/fc layer (final output layer)
    # The final layer is the one with the highest index AND reasonable output dimension
    
    candidate_layers = []
    
    # Collect all potential classifier layers
    for key, tensor in state_dict.items():
        if 'weight' in key and len(tensor.shape) == 2:
            # Check if it's a classifier-related layer
            if any(term in key.lower() for term in ['classifier', 'fc', 'head']):
                output_dim = tensor.shape[0]
                input_dim = tensor.shape[1]
                layer_index = _extract_layer_index(key)
                
                candidate_layers.append({
                    'key': key,
                    'output_dim': output_dim,
                    'input_dim': input_dim,
                    'index': layer_index
                })
    
    if not candidate_layers:
        return None
    
    # Debug: print all candidate layers
    print(f"  Found {len(candidate_layers)} classifier layers:")
    for layer in sorted(candidate_layers, key=lambda x: x['index']):
        print(f"    {layer['key']}: shape [{layer['output_dim']}, {layer['input_dim']}], index {layer['index']}")
    
    # Sort by layer index (higher index = later in network)
    candidate_layers.sort(key=lambda x: x['index'], reverse=True)
    
    # The final classifier layer is the LAST one (highest index) with reasonable output
    # For CustomCNN1: classifier.4 (index 4) is final -> output_dim is num_classes
    # For CustomCNN2: classifier.7 (index 7) is final -> output_dim is num_classes
    # For CustomCNN3: head.6 (index 6) is final -> output_dim is num_classes
    
    # Try layers from highest index to lowest, looking for reasonable class count
    for layer in candidate_layers:
        output_dim = layer['output_dim']
        # Final layers typically have small output dimensions (2-100 classes)
        # Intermediate layers have larger dimensions (128, 256, 512, etc.)
        if 2 <= output_dim <= 100:
            num_classes = output_dim
            print(f"  ✅ Detected {num_classes} classes from checkpoint key: {layer['key']}")
            print(f"     Layer shape: [{layer['output_dim']}, {layer['input_dim']}], index: {layer['index']}")
            return num_classes
    
    # Fallback: use the layer with highest index regardless of size
    if candidate_layers:
        final_layer = candidate_layers[0]
        num_classes = final_layer['output_dim']
        print(f"  ⚠️  Using highest index layer: {final_layer['key']} with {num_classes} classes")
        return num_classes
    
    return None


def load_model(model_name):
    """Load a model if not already loaded"""
    if model_name in loaded_models:
        return loaded_models[model_name]
    
    model_path = model_paths.get(model_name)
    if not model_path or not os.path.exists(model_path):
        raise ValueError(f"Model {model_name} not found at {model_path}")
    
    # Get model configuration (default)
    config = model_configs.get(model_name, {})
    default_num_classes = config.get('num_classes', 5)
    default_class_names = config.get('class_names', [])
    
    print(f"Loading {model_name} from {model_path}...")
    
    # Load checkpoint first to detect actual number of classes
    try:
        checkpoint = torch.load(model_path, map_location=CONFIG['device'])
        
        # Handle different checkpoint formats
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                state_dict = checkpoint['model_state_dict']
            elif 'state_dict' in checkpoint:
                state_dict = checkpoint['state_dict']
            elif 'model' in checkpoint:
                state_dict = checkpoint['model']
            else:
                # Try to find state dict in the dict
                state_dict = None
                for key in checkpoint.keys():
                    if 'state_dict' in key.lower() or 'model' in key.lower():
                        state_dict = checkpoint[key]
                        break
                if state_dict is None:
                    state_dict = checkpoint
        else:
            state_dict = checkpoint
        
        # Detect number of classes from checkpoint
        detected_num_classes = detect_num_classes_from_checkpoint(state_dict, model_name)
        
        if detected_num_classes:
            num_classes = detected_num_classes
            print(f"  Using {num_classes} classes (detected from checkpoint)")
            
            # Update class names if needed
            if num_classes == 2:
                class_names = ['Healthy', 'Not Healthy']
            elif num_classes == 5:
                class_names = ['Cerscospora', 'Healthy', 'Leaf rust', 'Miner', 'Phoma']
            elif num_classes == 10:
                # Original 10-class setup
                class_names = [f'Class_{i}' for i in range(num_classes)]
            else:
                class_names = [f'Class_{i}' for i in range(num_classes)]
            
            # Update config for this model
            model_configs[model_name] = {
                'num_classes': num_classes,
                'class_names': class_names
            }
        else:
            num_classes = default_num_classes
            class_names = default_class_names
            print(f"  Using default {num_classes} classes (could not detect from checkpoint)")
        
        print(f"  Classes: {num_classes} - {class_names}")
        
    except Exception as e:
        print(f"  ⚠️  Error reading checkpoint, using default: {e}")
        num_classes = default_num_classes
        class_names = default_class_names
    
    # Detect architecture variant from checkpoint if needed
    variant = 'default'
    if model_name == 'BinaryCNN_Deep':
        # Check if checkpoint has simple variant (classifier.4 is final with shape [num_classes, 128])
        for key, tensor in state_dict.items():
            if 'classifier.4.weight' in key and len(tensor.shape) == 2:
                if tensor.shape[0] == num_classes and tensor.shape[1] == 128:
                    # This is the simple variant
                    variant = 'simple'
                    print(f"  Detected simple variant (checkpoint architecture)")
                    break
    
    # Create model with detected/default number of classes
    model = create_model_architecture(model_name, num_classes, variant=variant)
    
    # Load weights
    try:
        # First, try to load with strict=False to see what mismatches we have
        try:
            missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=False)
            if missing_keys:
                print(f"  ⚠️  Missing keys: {len(missing_keys)}")
                if len(missing_keys) <= 5:
                    for key in missing_keys:
                        print(f"      - {key}")
            if unexpected_keys:
                print(f"  ⚠️  Unexpected keys: {len(unexpected_keys)}")
                if len(unexpected_keys) <= 5:
                    for key in unexpected_keys:
                        print(f"      - {key}")
        except RuntimeError as e:
            # If there are size mismatches, try to load only compatible layers
            error_msg = str(e)
            if "size mismatch" in error_msg.lower():
                print(f"  ⚠️  Size mismatches detected. Attempting partial load...")
                print(f"  Error: {error_msg[:200]}...")
                
                # Create a filtered state dict with only compatible layers
                model_state = model.state_dict()
                compatible_state = {}
                incompatible_keys = []
                
                for key, value in state_dict.items():
                    if key in model_state:
                        if model_state[key].shape == value.shape:
                            compatible_state[key] = value
                        else:
                            incompatible_keys.append(f"{key}: checkpoint {value.shape} vs model {model_state[key].shape}")
                    else:
                        incompatible_keys.append(f"{key}: not in model")
                
                print(f"  ✅ Loaded {len(compatible_state)}/{len(state_dict)} compatible layers")
                if incompatible_keys:
                    print(f"  ⚠️  Skipped {len(incompatible_keys)} incompatible layers:")
                    for key in incompatible_keys[:10]:  # Show first 10
                        print(f"      - {key}")
                    if len(incompatible_keys) > 10:
                        print(f"      ... and {len(incompatible_keys) - 10} more")
                
                # Load only compatible layers
                model.load_state_dict(compatible_state, strict=False)
            else:
                raise
    except Exception as e:
        print(f"  ❌ Error loading checkpoint: {e}")
        raise
    
    model.to(CONFIG['device'])
    model.eval()
    
    loaded_models[model_name] = model
    print(f"✅ {model_name} loaded successfully!")
    return model


def preprocess_image(image_bytes):
    """Preprocess image for model input"""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        image_tensor = transform(image)
        image_tensor = image_tensor.unsqueeze(0)  # Add batch dimension
        return image_tensor.to(CONFIG['device'])
    except Exception as e:
        raise ValueError(f"Error processing image: {str(e)}")


def predict_image(model, model_name, image_tensor):
    """Make prediction on a single image tensor"""
    # Get model configuration
    config = model_configs.get(model_name)
    if not config:
        raise ValueError(f"Model {model_name} configuration not found")
    
    class_names = config['class_names']
    
    with torch.no_grad():
        outputs = model(image_tensor)
        probabilities = torch.softmax(outputs, dim=1)
        confidence, predicted_class = torch.max(probabilities, 1)
        
        # Get all class probabilities
        all_probs = probabilities.cpu().numpy()[0]
        class_probs = {
            class_names[i]: float(all_probs[i])
            for i in range(len(class_names))
        }
        
        # Sort by probability
        sorted_probs = sorted(
            class_probs.items(),
            key=lambda x: x[1],
            reverse=True
        )
    
    return {
        'predicted_class': class_names[predicted_class.item()],
        'confidence': float(confidence.item()),
        'all_probabilities': class_probs,
        'top_predictions': [
            {'class': cls, 'probability': prob}
            for cls, prob in sorted_probs
        ]
    }


def assess_image_quality(image_bytes):
    """Assess image quality: blur, exposure"""
    try:
        # Convert to PIL Image
        pil_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        # Convert to numpy array for OpenCV processing
        img_array = np.array(pil_image)
        
        # Convert RGB to BGR for OpenCV
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Convert to grayscale for blur detection
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # Blur detection using Laplacian variance
        # Lower variance = more blur
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        is_blurry = laplacian_var < 100  # Threshold for blur detection
        
        # Exposure analysis
        # Calculate mean brightness
        mean_brightness = np.mean(gray)
        # Normalize to 0-255 range
        is_underexposed = mean_brightness < 50  # Too dark
        is_overexposed = mean_brightness > 200  # Too bright
        
        # Quality notes
        notes = []
        if is_blurry:
            notes.append("Image appears blurry")
        if is_underexposed:
            notes.append("Image appears underexposed")
        if is_overexposed:
            notes.append("Image appears overexposed")
        if not notes:
            notes.append("Image quality acceptable")
        
        return {
            'is_blurry': bool(is_blurry),
            'is_underexposed': bool(is_underexposed),
            'is_overexposed': bool(is_overexposed),
            'notes': "; ".join(notes),
            'laplacian_variance': float(laplacian_var),
            'mean_brightness': float(mean_brightness)
        }
    except Exception as e:
        # If quality assessment fails, return defaults
        return {
            'is_blurry': False,
            'is_underexposed': False,
            'is_overexposed': False,
            'notes': f"Quality assessment error: {str(e)}"
        }


def map_prediction_to_schema(prediction_result, crop_type=""):
    """Map model prediction to the required schema format"""
    predicted_class = prediction_result.get('predicted_class', 'unknown')
    confidence = prediction_result.get('confidence', 0.0)
    all_probs = prediction_result.get('all_probabilities', {})
    
    # Map model classes to schema labels
    class_to_label = {
        'Healthy': 'healthy',
        'Not Healthy': 'mildly_stressed',  # Binary model's "Not Healthy"
        'Cerscospora': 'diseased',
        'Leaf rust': 'diseased',
        'Miner': 'pest_damage',
        'Phoma': 'diseased',
    }
    
    # Determine health assessment label
    health_label = class_to_label.get(predicted_class, 'unknown')
    
    # If we have "Not Healthy" from binary model, check if we can infer more
    if predicted_class == 'Not Healthy' and len(all_probs) == 2:
        # For binary models, we can't determine specific issues
        health_label = 'mildly_stressed'
    
    # Extract detailed findings based on predictions
    diseases_detected = []
    pests_detected = []
    nutrient_deficiencies_detected = []
    stress_signs = []
    
    # Map specific classes to findings
    disease_classes = ['Cerscospora', 'Leaf rust', 'Phoma']
    pest_classes = ['Miner']
    
    # Check all probabilities above a threshold (0.2) for multi-class models
    threshold = 0.2
    for class_name, prob in all_probs.items():
        if prob >= threshold:
            if class_name in disease_classes:
                # Use crop-specific disease names if available
                disease_name = class_name
                if crop_type:
                    disease_name = f"{class_name} ({crop_type})"
                if disease_name not in diseases_detected:
                    diseases_detected.append(disease_name)
            elif class_name in pest_classes:
                pest_name = class_name
                if crop_type:
                    pest_name = f"{class_name} ({crop_type})"
                if pest_name not in pests_detected:
                    pests_detected.append(pest_name)
            elif class_name == 'Not Healthy' and prob >= threshold:
                stress_signs.append("General plant stress detected")
    
    # If binary model says "Not Healthy" with high confidence, add stress
    if predicted_class == 'Not Healthy' and confidence >= 0.7:
        stress_signs.append("Plant health issues detected")
    
    return {
        'health_assessment': {
            'label': health_label,
            'confidence': confidence
        },
        'detailed_findings': {
            'diseases_detected': diseases_detected,
            'pests_detected': pests_detected,
            'nutrient_deficiencies_detected': nutrient_deficiencies_detected,
            'stress_signs': stress_signs
        }
    }


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'device': str(CONFIG['device']),
        'available_models': list(model_paths.keys()),
        'loaded_models': list(loaded_models.keys())
    })


@app.route('/api/models', methods=['GET'])
def get_models():
    """Get list of available models"""
    available_models = []
    for model_name, model_path in model_paths.items():
        config = model_configs.get(model_name, {})
        available_models.append({
            'name': model_name,
            'path': model_path,
            'available': os.path.exists(model_path) if model_path else False,
            'num_classes': config.get('num_classes', 5),
            'class_names': config.get('class_names', [])
        })
    
    return jsonify({
        'models': available_models,
        'total_models': len(available_models)
    })


@app.route('/api/predict', methods=['POST'])
def predict():
    """Predict disease from uploaded image"""
    try:
        # Check if image is in request
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No image file selected'}), 400
        
        # Get model name
        model_name = request.form.get('model')
        if not model_name:
            # Use first available model as default
            if model_paths:
                model_name = list(model_paths.keys())[0]
            else:
                return jsonify({'error': 'No models available'}), 500
        
        if model_name not in model_paths:
            return jsonify({'error': f'Unknown model: {model_name}. Available: {list(model_paths.keys())}'}), 400
        
        # Load model
        try:
            model = load_model(model_name)
        except Exception as e:
            return jsonify({'error': f'Error loading model: {str(e)}'}), 500
        
        # Preprocess image
        try:
            image_bytes = file.read()
            image_tensor = preprocess_image(image_bytes)
        except Exception as e:
            return jsonify({'error': f'Error processing image: {str(e)}'}), 400
        
        # Make prediction
        try:
            result = predict_image(model, model_name, image_tensor)
            result['model_used'] = model_name
            config = model_configs.get(model_name, {})
            result['num_classes'] = config.get('num_classes', 5)
            return jsonify(result)
        except Exception as e:
            return jsonify({'error': f'Error making prediction: {str(e)}'}), 500
    
    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500


@app.route('/api/analyze', methods=['POST'])
def analyze_crop_image():
    """
    Agronomic image analysis endpoint.
    Analyzes a geolocated crop image and returns structured JSON with health indicators.
    """
    start_time = time.time()
    
    try:
        # Check if image is in request
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No image file selected'}), 400
        
        # Extract metadata from form data
        field_id = request.form.get('field_id')
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        timestamp = request.form.get('timestamp')
        crop_type = request.form.get('crop_type', '')
        device = request.form.get('device', '')
        notes = request.form.get('notes', '')
        
        # Read image bytes
        image_bytes = file.read()
        
        # Assess image quality first
        quality_assessment = assess_image_quality(image_bytes)
        
        # Check if image is unusable
        # Criteria: very blurry (laplacian variance < 50) OR extremely over/underexposed
        laplacian_var = quality_assessment.get('laplacian_variance', 1000)
        mean_brightness = quality_assessment.get('mean_brightness', 128)
        is_unusable = (
            (quality_assessment['is_blurry'] and laplacian_var < 50) or
            mean_brightness < 20 or  # Extremely dark
            mean_brightness > 240    # Extremely bright
        )
        
        if is_unusable:
            # Image quality too poor to analyze
            processing_time = int((time.time() - start_time) * 1000)
            return jsonify({
                "model_version": "1.0",
                "status": "unusable_image",
                "predictions": {
                    "health_assessment": {
                        "label": "unknown",
                        "confidence": 0.0
                    },
                    "detailed_findings": {
                        "diseases_detected": [],
                        "pests_detected": [],
                        "nutrient_deficiencies_detected": [],
                        "stress_signs": []
                    }
                },
                "spatial_context": {
                    "latitude": float(latitude) if latitude and latitude != 'null' else None,
                    "longitude": float(longitude) if longitude and longitude != 'null' else None,
                    "field_id": field_id if field_id and field_id != 'null' else None
                },
                "image_quality": {
                    "is_blurry": quality_assessment['is_blurry'],
                    "is_underexposed": quality_assessment['is_underexposed'],
                    "is_overexposed": quality_assessment['is_overexposed'],
                    "notes": quality_assessment['notes']
                },
                "processing_time_ms": processing_time
            })
        
        # Select best model for analysis
        # Prefer multi-class models for detailed analysis, fallback to binary
        model_name = None
        preferred_models = ['CustomCNN1', 'CustomCNN2', 'CustomCNN3', 'EfficientNet', 'MobileNetV3']
        
        for preferred in preferred_models:
            if preferred in model_paths:
                model_name = preferred
                break
        
        # Fallback to any available model
        if not model_name and model_paths:
            model_name = list(model_paths.keys())[0]
        
        if not model_name:
            return jsonify({'error': 'No models available for analysis'}), 500
        
        # Load model
        try:
            model = load_model(model_name)
        except Exception as e:
            return jsonify({'error': f'Error loading model: {str(e)}'}), 500
        
        # Preprocess image
        try:
            image_tensor = preprocess_image(image_bytes)
        except Exception as e:
            return jsonify({'error': f'Error processing image: {str(e)}'}), 400
        
        # Make prediction
        try:
            prediction_result = predict_image(model, model_name, image_tensor)
        except Exception as e:
            return jsonify({'error': f'Error making prediction: {str(e)}'}), 500
        
        # Map prediction to schema
        predictions = map_prediction_to_schema(prediction_result, crop_type)
        
        # Calculate processing time
        processing_time = int((time.time() - start_time) * 1000)
        
        # Build response according to schema
        response = {
            "model_version": "1.0",
            "status": "ok",
            "predictions": predictions,
            "spatial_context": {
                "latitude": float(latitude) if latitude and latitude != 'null' else None,
                "longitude": float(longitude) if longitude and longitude != 'null' else None,
                "field_id": field_id if field_id and field_id != 'null' else None
            },
            "image_quality": {
                "is_blurry": quality_assessment['is_blurry'],
                "is_underexposed": quality_assessment['is_underexposed'],
                "is_overexposed": quality_assessment['is_overexposed'],
                "notes": quality_assessment['notes']
            },
            "processing_time_ms": processing_time
        }
        
        return jsonify(response)
    
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        return jsonify({
            'error': f'Unexpected error: {str(e)}',
            'processing_time_ms': processing_time
        }), 500


# ============================================================================
# Field Management Endpoints
# ============================================================================

@app.route('/api/fields', methods=['POST'])
def create_field():
    """Create a new field with polygon coordinates"""
    try:
        data = request.get_json()
        
        if not data or not data.get('name') or not data.get('polygon_coordinates'):
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
        
        db.session.add(field)
        db.session.commit()
        return jsonify(field.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@app.route('/api/fields', methods=['GET'])
def get_fields():
    """Get all fields"""
    try:
        fields = Field.query.all()
        return jsonify({'fields': [f.to_dict() for f in fields]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/fields/<int:field_id>', methods=['GET'])
def get_field(field_id):
    """Get a specific field with all its spots and metrics"""
    try:
        field = Field.query.get_or_404(field_id)
        result = field.to_dict()
        result['spots'] = [s.to_dict() for s in field.spots]

        # Add field metrics (area, perimeter, etc.)
        polygon_coords = field.get_polygon_coords()
        if polygon_coords:
            result['metrics'] = calculate_field_metrics(polygon_coords)

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/fields/<int:field_id>/metrics', methods=['GET'])
def get_field_metrics(field_id):
    """Get calculated metrics for a field (area, perimeter, centroid)"""
    try:
        field = Field.query.get_or_404(field_id)
        polygon_coords = field.get_polygon_coords()

        if not polygon_coords:
            return jsonify({'error': 'Field has no polygon coordinates'}), 400

        metrics = calculate_field_metrics(polygon_coords)
        metrics['field_id'] = field_id
        metrics['field_name'] = field.name

        return jsonify(metrics)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/fields/<int:field_id>', methods=['DELETE'])
def delete_field(field_id):
    """Delete a field and all associated spots"""
    try:
        field = Field.query.get_or_404(field_id)
        db.session.delete(field)
        db.session.commit()
        return jsonify({'message': 'Field deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Spot Management Endpoints
# ============================================================================

@app.route('/api/fields/<int:field_id>/spots', methods=['POST'])
def create_spot(field_id):
    """Create a spot and analyze the uploaded image with selected model"""
    try:
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
        
        # Get selected model from form data
        selected_model = request.form.get('model')
        
        # Create upload directory
        upload_dir = Path('uploads') / f'field_{field_id}'
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Save image
        filename = f"spot_{int(time.time())}_{file.filename}"
        filepath = upload_dir / filename
        file.save(str(filepath))
        
        # Read image bytes for analysis (reset file pointer)
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
        
        # Perform analysis
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
                model_used = 'none'
            else:
                # Use selected model if provided and available
                model_name = None
                
                if selected_model and selected_model in model_paths:
                    model_name = selected_model
                else:
                    # Fallback to preferred models
                    preferred_models = ['CustomCNN1', 'CustomCNN2', 'CustomCNN3', 'EfficientNet', 'MobileNetV3']
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
                model_used = model_name
            
            # Store analysis with model info
            analysis = AnalysisResult(
                spot_id=spot.id,
                model_version=model_used,  # Store which model was used
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
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

    
@app.route('/api/spots/<int:spot_id>', methods=['GET'])
def get_spot(spot_id):
    """Get spot details with full analysis"""
    try:
        spot = Spot.query.get_or_404(spot_id)
        return jsonify(spot.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/spots/<int:spot_id>', methods=['DELETE'])
def delete_spot(spot_id):
    """Delete a spot and its analysis"""
    try:
        spot = Spot.query.get_or_404(spot_id)
        db.session.delete(spot)
        db.session.commit()
        return jsonify({'message': 'Spot deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Analysis Summary Endpoint
# ============================================================================

@app.route('/api/fields/<int:field_id>/analysis-summary', methods=['GET'])
def get_analysis_summary(field_id):
    """Get aggregated analysis for visualization"""
    try:
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
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("=" * 60)
    print("Starting Flask API server...")
    print(f"Device: {CONFIG['device']}")
    print(f"Available models: {len(model_paths)}")
    for name in model_paths.keys():
        print(f"  - {name}")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)

