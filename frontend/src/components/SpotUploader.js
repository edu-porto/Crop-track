import React, { useState, useEffect } from 'react';
import axios from 'axios';

function SpotUploader({ fieldId, latitude, longitude, onUploadComplete, onCancel }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [uploadStep, setUploadStep] = useState(1); // 1: select, 2: uploading, 3: analyzing, 4: done
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');

  // Fetch available models on component mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get('/api/models');
        const models = response.data.models.filter(m => m.available);
        setAvailableModels(models);

        // Load saved model from localStorage or use first available
        const savedModel = localStorage.getItem('croptrack_selected_model');
        if (savedModel && models.some(m => m.name === savedModel)) {
          setSelectedModel(savedModel);
        } else if (models.length > 0) {
          setSelectedModel(models[0].name);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };
    fetchModels();
  }, []);

  // Save selected model to localStorage when changed
  const handleModelChange = (e) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    localStorage.setItem('croptrack_selected_model', newModel);
  };

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
    setUploadStep(2);

    const formData = new FormData();
    formData.append('image', image);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('notes', notes);
    formData.append('device', navigator.userAgent);

    if (selectedModel) {
      formData.append('model', selectedModel);
    }

    try {
      // Simulate upload step
      await new Promise(resolve => setTimeout(resolve, 800));
      setUploadStep(3);

      const response = await axios.post(
        `/api/fields/${fieldId}/spots`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000
        }
      );

      setUploadStep(4);
      setAnalysisResult(response.data);

    } catch (err) {
      console.error('Upload error:', err);
      setError(
        err.response?.data?.error ||
        'Error uploading spot. Make sure the spot is inside the field boundary.'
      );
      setUploadStep(1);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (label) => {
    const colors = {
      healthy: '#059669',
      mildly_stressed: '#d97706',
      diseased: '#dc2626',
      pest_damage: '#dc2626',
      nutrient_deficiency: '#7c3aed',
      unknown: '#64748b'
    };
    return colors[label] || '#64748b';
  };

  const getHealthBgColor = (label) => {
    const colors = {
      healthy: '#ecfdf5',
      mildly_stressed: '#fffbeb',
      diseased: '#fef2f2',
      pest_damage: '#fef2f2',
      nutrient_deficiency: '#f5f3ff',
      unknown: '#f8fafc'
    };
    return colors[label] || '#f8fafc';
  };

  const getHealthIcon = (label) => {
    if (label === 'healthy') {
      return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      );
    }
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    );
  };

  const formatLabel = (label) => {
    return label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Analysis Complete View
  if (analysisResult) {
    const analysis = analysisResult.analysis;
    const healthLabel = analysis?.health_assessment?.label || 'unknown';
    const confidence = analysis?.health_assessment?.confidence || 0;

    return (
      <div className="spot-uploader-result">
        <div className="result-icon">
          {getHealthIcon(healthLabel)}
        </div>

        <h3 className="result-title">Analysis Complete</h3>

        <div
          className="result-status-card"
          style={{
            background: getHealthBgColor(healthLabel),
            borderColor: getHealthColor(healthLabel)
          }}
        >
          <div className="result-status-label" style={{ color: getHealthColor(healthLabel) }}>
            {formatLabel(healthLabel)}
          </div>
          <div className="result-confidence">
            <div className="confidence-label">Confidence Level</div>
            <div className="confidence-bar-wrapper">
              <div
                className="confidence-bar-fill"
                style={{
                  width: `${confidence * 100}%`,
                  background: getHealthColor(healthLabel)
                }}
              />
            </div>
            <div className="confidence-value">{(confidence * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div className="result-meta">
          <div className="meta-item">
            <span className="meta-label">Model Used</span>
            <span className="meta-value">{analysis?.model_version || selectedModel}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Location</span>
            <span className="meta-value">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
          </div>
        </div>

        <button
          className="btn-primary-full"
          onClick={() => onUploadComplete(analysisResult)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Done - Close Window
        </button>
      </div>
    );
  }

  return (
    <div className="spot-uploader-modern">
      {/* Progress Steps */}
      <div className="upload-progress-steps">
        <div className={`progress-step ${uploadStep >= 1 ? 'active' : ''} ${uploadStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <span>Select Image</span>
        </div>
        <div className="progress-line" />
        <div className={`progress-step ${uploadStep >= 2 ? 'active' : ''} ${uploadStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <span>Upload</span>
        </div>
        <div className="progress-line" />
        <div className={`progress-step ${uploadStep >= 3 ? 'active' : ''} ${uploadStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">3</div>
          <span>Analyze</span>
        </div>
      </div>

      {/* Location and Model Row */}
      <div className="upload-info-row">
        <div className="location-info-card">
          <div className="location-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div className="location-details">
            <span className="location-label">Location</span>
            <span className="location-coords">{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>
          </div>
        </div>

        <div className="model-selector-card">
          <div className="model-selector-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span>AI Model</span>
          </div>
          <select
            className="model-dropdown"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={loading}
          >
            {availableModels.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              availableModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Upload Area */}
      <div className="upload-area-modern">
        <label className="upload-dropzone">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            disabled={loading}
          />
          {preview ? (
            <div className="preview-container">
              <img src={preview} alt="Preview" className="image-preview-thumb" />
              <div className="preview-overlay">
                <span>Click to change image</span>
              </div>
            </div>
          ) : (
            <div className="dropzone-content">
              <div className="dropzone-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <div className="dropzone-text">
                <span className="dropzone-title">Upload leaf image</span>
                <span className="dropzone-hint">Click to browse or drag and drop</span>
                <span className="dropzone-formats">JPG, PNG or WEBP up to 10MB</span>
              </div>
            </div>
          )}
        </label>
      </div>

      {/* Notes Input */}
      <div className="notes-input-group">
        <label className="notes-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Field Notes (Optional)
        </label>
        <textarea
          placeholder="Describe any visible symptoms, weather conditions, or other observations..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span className="loading-text">
            {uploadStep === 2 ? 'Uploading image...' : 'Analyzing with AI...'}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="action-buttons">
        <button
          className="btn-primary-full"
          onClick={handleUpload}
          disabled={!image || loading}
        >
          {loading ? (
            <>
              <div className="btn-spinner" />
              Processing...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
              Upload & Analyze
            </>
          )}
        </button>
        <button
          className="btn-secondary-full"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default SpotUploader;
