# How to Run the Crop Analysis System

## Quick Start

### 1. Backend Setup

```bash
cd "Modulo XIV/sprint 3/backend"

# Install dependencies
pip install -r requirements.txt

# Run the Flask server
python app.py
```

The backend will start on `http://localhost:5000`

### 2. Frontend Setup

Open a **new terminal** window:

```bash
cd "Modulo XIV/sprint 3/frontend"

# Install dependencies (first time only)
npm install

# Start the React app
npm start
```

The frontend will start on `http://localhost:3000` and automatically open in your browser.

## Features

### Map View (Default Route: `/`)
- **Create Fields**: Click "Create Field" button, then draw a polygon on the map
- **Add Spots**: Select a field, click "Add Spot", then click on the map to place a spot
- **Upload Images**: When adding a spot, upload an image to analyze
- **View Analysis**: Click on markers to see disease analysis results
- **Color-Coded Markers**: 
  - 🟢 Green = Healthy
  - 🟡 Yellow = Mildly Stressed
  - 🟠 Orange = Diseased
  - 🔴 Red = Pest Damage
  - 🟣 Purple = Nutrient Deficiency

### Image Upload View (Route: `/upload`)
- Upload images directly for analysis
- Select different AI models
- View detailed prediction results

## Troubleshooting

### Backend Issues

1. **Database not created**: The database will be created automatically on first run
2. **Port 5000 already in use**: Change port in `app.py` last line: `app.run(debug=True, host='0.0.0.0', port=5001)`
3. **Models not found**: Make sure model files (.pth) are in `backend/models/` directory
4. **Import errors**: Run `pip install -r requirements.txt` again

### Frontend Issues

1. **npm install fails**: Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
2. **Map not loading**: Check browser console for errors, ensure Leaflet CSS is imported
3. **CORS errors**: Make sure backend is running and CORS is enabled
4. **Port 3000 in use**: React will automatically use the next available port

### Common Errors

- **"No models available"**: Check that model files exist in `backend/models/`
- **"Spot must be inside field polygon"**: Make sure you click inside the field boundary
- **Image upload fails**: Check file size and format (JPG, PNG supported)

## File Structure

```
backend/
├── app.py              # Main Flask application
├── database.py         # Database models
├── utils.py            # Utility functions
├── models.py           # AI model architectures
├── models/             # Trained model files (.pth)
├── uploads/            # Uploaded images (created automatically)
└── crop_analysis.db    # SQLite database (created automatically)

frontend/
├── src/
│   ├── App.js          # Main app with routing
│   ├── components/
│   │   ├── MapView.js      # Map interface
│   │   ├── SpotUploader.js # Image upload component
│   │   └── ImageUploader.js # Direct upload view
│   └── index.js        # Entry point
└── package.json        # Dependencies
```

## API Endpoints

- `GET /api/fields` - List all fields
- `POST /api/fields` - Create new field
- `GET /api/fields/<id>` - Get field with spots
- `DELETE /api/fields/<id>` - Delete field
- `POST /api/fields/<id>/spots` - Add spot and analyze image
- `GET /api/fields/<id>/analysis-summary` - Get analysis summary
- `POST /api/predict` - Direct image prediction
- `POST /api/analyze` - Agronomic image analysis

## Next Steps

1. Create your first field by drawing a polygon
2. Add spots inside the field
3. Upload images to analyze crop health
4. View results on the map with color-coded markers

Enjoy using the Crop Analysis System! 🌱

