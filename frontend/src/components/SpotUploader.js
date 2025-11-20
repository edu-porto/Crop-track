import React, { useState } from 'react';
import axios from 'axios';

function SpotUploader({ fieldId, latitude, longitude, onUploadComplete, onCancel }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }
      setImage(file);
      setError(null);
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
    
    const formData = new FormData();
    formData.append('image', image);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    formData.append('notes', notes);
    formData.append('device', navigator.userAgent);

    try {
      const response = await axios.post(
        `/api/fields/${fieldId}/spots`,
        formData,
        { 
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000 // 60 second timeout for analysis
        }
      );
      
      onUploadComplete(response.data);
      setImage(null);
      setPreview(null);
      setNotes('');
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Error uploading spot. Make sure the spot is inside the field.');
    } finally {
      setLoading(false);
    }
  };

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
              <p>Click to select image</p>
            </div>
          )}
        </label>
      </div>

      <div className="notes-section">
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="upload-actions">
        <button 
          onClick={handleUpload} 
          disabled={!image || loading}
          className="btn-primary"
        >
          {loading ? 'Uploading & Analyzing...' : 'Upload & Analyze'}
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

