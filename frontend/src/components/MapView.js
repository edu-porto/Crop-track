import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMapEvents } from 'react-leaflet';
import { FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import axios from 'axios';
import SpotUploader from './SpotUploader';
import './MapView.css';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapView() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [drawingMode, setDrawingMode] = useState('field');
  const [showUploader, setShowUploader] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null);
  const [error, setError] = useState(null);
  const [mapType, setMapType] = useState('satellite');
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    fetchFields();
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const response = await axios.get('/api/models');
      const available = response.data.models.filter(m => m.available);
      setAvailableModels(available);
      if (available.length > 0) {
        setSelectedModel(available[0].name);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    }
  };

  const fetchFields = async () => {
    try {
      const response = await axios.get('/api/fields');
      setFields(response.data.fields);
    } catch (err) {
      console.error('Error fetching fields:', err);
      setError('Failed to load fields');
    }
  };

  const fetchFieldDetails = async (fieldId) => {
    try {
      const response = await axios.get(`/api/fields/${fieldId}`);
      setSelectedField(response.data);
    } catch (err) {
      console.error('Error fetching field details:', err);
    }
  };

  const fetchDashboardData = async (fieldId) => {
    setDashboardLoading(true);
    try {
      const response = await axios.get(`/api/fields/${fieldId}/analysis-summary`);
      setDashboardData(response.data);
      setShowDashboard(true);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      alert('Error loading dashboard data');
    } finally {
      setDashboardLoading(false);
    }
  };

  const handleCreated = async (e) => {
    const layer = e.layer;
    if (drawingMode === 'field') {
      const latlngs = layer.getLatLngs()[0];
      const coordinates = latlngs.map(ll => [ll.lat, ll.lng]);
      const name = prompt('Enter field name:');
      if (!name) { layer.remove(); return; }
      try {
        await axios.post('/api/fields', {
          name,
          crop_type: 'coffee',
          polygon_coordinates: coordinates
        });
        await fetchFields();
        layer.remove(); // Remove the drawn layer since we'll render from state
        alert('Field created successfully!');
      } catch (err) {
        console.error('Error creating field:', err);
        layer.remove();
        alert(err.response?.data?.error || 'Error creating field');
      }
    }
  };

  const handleSpotUploaded = async () => {
    setShowUploader(false);
    setClickedPosition(null);
    if (selectedField) {
      await fetchFieldDetails(selectedField.id);
    }
  };

  const getMarkerColor = (healthLabel) => {
    const colors = {
      'healthy': 'green',
      'mildly_stressed': 'yellow',
      'diseased': 'orange',
      'pest_damage': 'red',
      'nutrient_deficiency': 'purple',
      'unknown': 'gray'
    };
    return colors[healthLabel] || 'gray';
  };

  const createCustomIcon = (color) => {
    return L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  };

  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        if (drawingMode === 'spot' && selectedField) {
          setClickedPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
          setShowUploader(true);
        }
      },
    });
    return null;
  };

  return (
    <div className="map-view-container">
      <div className="map-sidebar">
        <h2>Fields</h2>
        
        <div className="model-selector">
          <label htmlFor="model-select">Analysis Model:</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="model-select"
          >
            {availableModels.length === 0 ? (
              <option value="">Loading models...</option>
            ) : (
              availableModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name} ({model.num_classes} classes)
                </option>
              ))
            )}
          </select>
        </div>

        <button className="btn-primary" onClick={() => {
          setDrawingMode('field');
          setSelectedField(null);
          setShowUploader(false);
          setShowDashboard(false);
        }}>
          + Create Field
        </button>
        
        <div className="fields-list">
          {fields.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
              No fields yet. Draw a polygon on the map to create one.
            </p>
          ) : (
            fields.map(field => (
              <div 
                key={field.id} 
                className={`field-item ${selectedField?.id === field.id ? 'selected' : ''}`}
                onClick={async () => {
                  setSelectedField(field);
                  setDrawingMode('spot');
                  setShowDashboard(false);
                  await fetchFieldDetails(field.id);
                }}
              >
                <h3>{field.name}</h3>
                <p>{field.crop_type || 'coffee'}</p>
                <small>{field.spot_count || 0} spots</small>
              </div>
            ))
          )}
        </div>

        {selectedField && (
          <div className="field-actions">
            <div className="mode-indicator">
              {drawingMode === 'spot' ? (
                <p style={{ color: '#28a745', fontWeight: 'bold' }}>
                  ✓ Click on map to add spot
                </p>
              ) : (
                <p style={{ color: '#666' }}>Select "Add Spot" to place markers</p>
              )}
            </div>
            <button className="btn-secondary" onClick={() => {
              setDrawingMode('spot');
              setShowUploader(false);
            }}>
              + Add Spot
            </button>
            <button 
              className="btn-info" 
              onClick={() => fetchDashboardData(selectedField.id)}
              disabled={dashboardLoading}
            >
              {dashboardLoading ? '⏳ Loading...' : '📊 View Dashboard'}
            </button>
            <button className="btn-danger" onClick={async () => {
              if (window.confirm('Delete this field and all its spots?')) {
                try {
                  await axios.delete(`/api/fields/${selectedField.id}`);
                  await fetchFields();
                  setSelectedField(null);
                  setShowDashboard(false);
                } catch (err) {
                  alert('Error deleting field');
                }
              }
            }}>
              🗑️ Delete Field
            </button>
          </div>
        )}
        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="map-container">
        <div className="map-controls">
          <button 
            className={`map-type-btn ${mapType === 'satellite' ? 'active' : ''}`}
            onClick={() => setMapType('satellite')}
          >
            🛰️ Satellite
          </button>
          <button 
            className={`map-type-btn ${mapType === 'street' ? 'active' : ''}`}
            onClick={() => setMapType('street')}
          >
            🗺️ Street
          </button>
        </div>
        
        <MapContainer 
          center={[-23.5505, -46.6333]} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
        >
          {mapType === 'satellite' ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; Esri'
              maxZoom={19}
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
          )}
          
          {drawingMode === 'field' && (
            <FeatureGroup>
              <EditControl
                position="topright"
                onCreated={handleCreated}
                draw={{
                  rectangle: false,
                  polygon: true,
                  circle: false,
                  marker: false,
                  circlemarker: false,
                  polyline: false
                }}
              />
            </FeatureGroup>
          )}

          {drawingMode === 'spot' && <MapClickHandler />}

          {fields.map(field => (
            <Polygon
              key={field.id}
              positions={field.polygon_coordinates}
              pathOptions={{
                color: '#3388ff',
                fillColor: '#3388ff',
                fillOpacity: selectedField?.id === field.id ? 0.3 : 0.1,
                weight: selectedField?.id === field.id ? 3 : 2
              }}
              interactive={drawingMode !== 'spot'}
              bubblingMouseEvents={drawingMode === 'spot'}
              eventHandlers={drawingMode !== 'spot' ? {
                click: () => {
                  setSelectedField(field);
                  fetchFieldDetails(field.id);
                }
              } : {}}
            />
          ))}

          {selectedField?.spots?.map(spot => {
            const color = spot.analysis 
              ? getMarkerColor(spot.analysis.health_assessment?.label || 'unknown') 
              : 'gray';
            return (
              <Marker
                key={spot.id}
                position={[spot.latitude, spot.longitude]}
                icon={createCustomIcon(color)}
              >
                <Popup>
                  <div className="spot-popup">
                    <h4>Spot #{spot.id}</h4>
                    {spot.analysis ? (
                      <>
                        <p><strong>Status:</strong> {spot.analysis.health_assessment?.label}</p>
                        <p><strong>Confidence:</strong> {((spot.analysis.health_assessment?.confidence || 0) * 100).toFixed(1)}%</p>
                        <p><strong>Model:</strong> {spot.analysis.model_version}</p>
                      </>
                    ) : (
                      <p>No analysis available</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Spot Upload Modal */}
        {showUploader && clickedPosition && selectedField && (
          <div className="uploader-overlay">
            <div className="uploader-modal">
              <h3>Upload Image for Spot</h3>
              <p>Location: {clickedPosition.lat.toFixed(6)}, {clickedPosition.lng.toFixed(6)}</p>
              <div className="model-info-box">
                <small>Using model: <strong>{selectedModel || 'Auto-select'}</strong></small>
              </div>
              <SpotUploader
                fieldId={selectedField.id}
                latitude={clickedPosition.lat}
                longitude={clickedPosition.lng}
                selectedModel={selectedModel}
                onUploadComplete={handleSpotUploaded}
                onCancel={() => {
                  setShowUploader(false);
                  setClickedPosition(null);
                }}
              />
            </div>
          </div>
        )}

        {/* Dashboard Modal */}
        {showDashboard && selectedField && dashboardData && (
          <div className="uploader-overlay">
            <div className="uploader-modal" style={{ maxWidth: '550px' }}>
              <h3>📊 {selectedField.name} - Dashboard</h3>
              
              <div style={{ 
                background: 'linear-gradient(135deg, #667eea, #764ba2)', 
                color: 'white', 
                padding: '20px', 
                borderRadius: '10px',
                textAlign: 'center',
                marginBottom: '20px'
              }}>
                <p style={{ margin: 0, opacity: 0.9 }}>Total Spots</p>
                <p style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '5px 0' }}>
                  {dashboardData.total_spots}
                </p>
              </div>

              <h4 style={{ marginBottom: '15px' }}>Health Distribution</h4>
              {Object.keys(dashboardData.health_distribution).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(dashboardData.health_distribution).map(([label, count]) => {
                    const colors = {
                      healthy: '#28a745',
                      mildly_stressed: '#ffc107',
                      diseased: '#fd7e14',
                      pest_damage: '#dc3545',
                      nutrient_deficiency: '#6f42c1',
                      unknown: '#6c757d'
                    };
                    const pct = dashboardData.total_spots > 0 
                      ? (count / dashboardData.total_spots) * 100 
                      : 0;
                    return (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '130px', textTransform: 'capitalize', fontSize: '14px' }}>
                          {label.replace('_', ' ')}
                        </span>
                        <div style={{ 
                          flex: 1, 
                          height: '24px', 
                          background: '#e9ecef', 
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{ 
                            width: `${pct}%`, 
                            height: '100%', 
                            background: colors[label] || '#6c757d',
                            borderRadius: '4px',
                            transition: 'width 0.3s'
                          }} />
                        </div>
                        <span style={{ width: '30px', textAlign: 'right', fontWeight: 'bold' }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ 
                  color: '#666', 
                  fontStyle: 'italic', 
                  textAlign: 'center',
                  padding: '20px',
                  background: '#f8f9fa',
                  borderRadius: '8px'
                }}>
                  No analysis data yet. Add spots to see health distribution.
                </p>
              )}

              <div style={{ 
                marginTop: '20px', 
                padding: '15px', 
                background: '#f8f9fa', 
                borderRadius: '8px' 
              }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
                  Marker Legend
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {[
                    { color: '#28a745', label: 'Healthy' },
                    { color: '#ffc107', label: 'Stressed' },
                    { color: '#fd7e14', label: 'Diseased' },
                    { color: '#dc3545', label: 'Pest' },
                    { color: '#6f42c1', label: 'Nutrient' },
                    { color: '#6c757d', label: 'Unknown' }
                  ].map(item => (
                    <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                      <span style={{ 
                        width: '12px', 
                        height: '12px', 
                        borderRadius: '50%', 
                        background: item.color 
                      }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              <button 
                className="btn-secondary" 
                onClick={() => setShowDashboard(false)}
                style={{ marginTop: '20px' }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MapView;