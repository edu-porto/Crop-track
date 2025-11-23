import React, { useState } from 'react';
import axios from 'axios';

function SpotUploader({ fieldId, latitude, longitude, selectedModel, onUploadComplete, onCancel }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      setImage(file);
      setError(null);
      setAnalysisResult(null);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      setError('Please select an image');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    
    const formData = new FormData();
    formData.append('image', image);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('notes', notes);
    formData.append('device', navigator.userAgent);
    
    // Pass the selected model to the backend
    if (selectedModel) {
      formData.append('model', selectedModel);
    }

    try {
      const response = await axios.post(
        `/api/fields/${fieldId}/spots`,
        formData,
        { 
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000 // 2 minute timeout for analysis
        }
      );
      
      // Show analysis result before closing
      setAnalysisResult(response.data);
      
      // Auto-close after 2 seconds or let user click Done
      setTimeout(() => {
        if (onUploadComplete) {
          onUploadComplete(response.data);
        }
      }, 2500);
      
    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.error || 
        'Error uploading spot. Make sure the spot is inside the field boundary.'
      );
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (label) => {
    const colors = {
      healthy: '#28a745',
      mildly_stressed: '#ffc107',
      diseased: '#fd7e14',
      pest_damage: '#dc3545',
      nutrient_deficiency: '#6f42c1',
      unknown: '#6c757d'
    };
    return colors[label] || '#6c757d';
  };

  // Show analysis result
  if (analysisResult) {
    const analysis = analysisResult.analysis;
    const healthLabel = analysis?.health_assessment?.label || 'unknown';
    const confidence = analysis?.health_assessment?.confidence || 0;
    
    return (
      <div className="analysis-result">
        <h4>✅ Analysis Complete!</h4>
        <div 
          className="result-card"
          style={{ borderLeftColor: getHealthColor(healthLabel) }}
        >
          <p className="result-label" style={{ color: getHealthColor(healthLabel) }}>
            {healthLabel.replace('_', ' ').toUpperCase()}
          </p>
          <p className="result-confidence">
            Confidence: {(confidence * 100).toFixed(1)}%
          </p>
          {analysis?.model_version && (
            <p className="result-details">
              Model: {analysis.model_version}
            </p>
          )}
        </div>
        <button 
          className="btn-primary"
          onClick={() => onUploadComplete(analysisResult)}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="spot-uploader">
      <div className="upload-section">
        <label className="upload-label">
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleImageSelect}
            disabled={loading}
          />
          {preview ? (
            <img src={preview} alt="Preview" className="image-preview-small" />
          ) : (
            <div className="upload-placeholder-small">
              <p>📷 Click to select image</p>
            </div>
          )}
        </label>
      </div>

      <div className="notes-section">
        <textarea
          placeholder="Notes (optional) - e.g., observed symptoms, weather conditions"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </div>

      {error && <div className="error-message">⚠️ {error}</div>}

      <div className="upload-actions">
        <button 
          onClick={handleUpload} 
          disabled={!image || loading}
          className="btn-primary"
        >
          {loading ? '🔄 Analyzing...' : '🔬 Upload & Analyze'}
        </button>
        {onCancel && (
          <button 
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default SpotUploader;