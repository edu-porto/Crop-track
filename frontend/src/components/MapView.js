import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import axios from 'axios';
import SpotUploader from './SpotUploader';
import FieldDashboard from './FieldDashboard';
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
  const [drawingMode, setDrawingMode] = useState(null); // null, 'field', 'spot'
  const [showUploader, setShowUploader] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null);
  const [error, setError] = useState(null);
  const [mapType, setMapType] = useState('satellite');
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showFieldNameModal, setShowFieldNameModal] = useState(false);
  const [pendingFieldData, setPendingFieldData] = useState(null);
  const [fieldNameInput, setFieldNameInput] = useState('');
  const [savingField, setSavingField] = useState(false);

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

  // Component to handle polygon drawing directly via Leaflet Draw API
  const PolygonDrawer = ({ onComplete, onCancel, disabled }) => {
    const map = useMap();
    const handlerRef = useRef(null);
    const drawnItemsRef = useRef(null);

    useEffect(() => {
      if (!map) return;

      // Create polygon draw handler
      const drawnItems = new L.FeatureGroup();
      drawnItemsRef.current = drawnItems;
      map.addLayer(drawnItems);

      const drawHandler = new L.Draw.Polygon(map, {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.3,
          weight: 3
        }
      });

      handlerRef.current = drawHandler;

      // Start drawing immediately if not disabled
      if (!disabled) {
        drawHandler.enable();
        setIsDrawing(true);
      }

      // Listen for created event
      const onDrawCreated = (e) => {
        const layer = e.layer;
        drawnItems.addLayer(layer);
        onComplete(layer);
      };

      map.on(L.Draw.Event.CREATED, onDrawCreated);

      // Cleanup
      return () => {
        if (handlerRef.current) {
          handlerRef.current.disable();
        }
        map.off(L.Draw.Event.CREATED, onDrawCreated);
        map.removeLayer(drawnItems);
        setIsDrawing(false);
      };
    }, [map, onComplete]);

    // Disable/enable handler when disabled prop changes
    useEffect(() => {
      if (handlerRef.current) {
        if (disabled) {
          handlerRef.current.disable();
        }
      }
    }, [disabled]);

    return null;
  };

  const cancelDrawing = () => {
    setDrawingMode(null);
    setIsDrawing(false);
  };

  // Handler when polygon is completed - shows modal for field name
  const handlePolygonComplete = (layer) => {
    setIsDrawing(false);
    const latlngs = layer.getLatLngs()[0];
    const coordinates = latlngs.map(ll => [ll.lat, ll.lng]);

    // Store pending data and show modal
    setPendingFieldData({ layer, coordinates });
    setFieldNameInput('');
    setShowFieldNameModal(true);
  };

  // Save field after user enters name
  const handleSaveField = async () => {
    if (fieldNameInput.trim().length < 3 || !pendingFieldData) return;

    setSavingField(true);
    try {
      await axios.post('/api/fields', {
        name: fieldNameInput.trim(),
        crop_type: 'coffee',
        polygon_coordinates: pendingFieldData.coordinates
      });
      await fetchFields();
      pendingFieldData.layer.remove();
      setDrawingMode(null);
      setShowFieldNameModal(false);
      setPendingFieldData(null);
      setFieldNameInput('');
    } catch (err) {
      console.error('Error creating field:', err);
      alert(err.response?.data?.error || 'Error creating field');
    } finally {
      setSavingField(false);
    }
  };

  // Cancel field creation
  const handleCancelFieldCreation = () => {
    if (pendingFieldData?.layer) {
      pendingFieldData.layer.remove();
    }
    setShowFieldNameModal(false);
    setPendingFieldData(null);
    setFieldNameInput('');
    setDrawingMode(null);
  };

  return (
    <div className="map-view-container">
      <div className="map-sidebar">
        <h2>Fields</h2>

        <button
          className={`btn-create-field ${drawingMode === 'field' ? 'active-drawing' : ''}`}
          onClick={() => {
            setDrawingMode('field');
            setSelectedField(null);
            setShowUploader(false);
            setShowDashboard(false);
          }}
          disabled={drawingMode === 'field'}
        >
          <div className="btn-create-field-icon">
            {drawingMode === 'field' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            )}
          </div>
          <span className="btn-create-field-title">
            {drawingMode === 'field' ? 'Drawing...' : 'Create New Field'}
          </span>
        </button>

        <div className="fields-list">
          {fields.length === 0 ? (
            <div className="empty-fields-message">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <p>No fields created yet</p>
              <span>Click "Create New Field" and draw a polygon on the map</span>
            </div>
          ) : (
            fields.map(field => (
              <div
                key={field.id}
                className={`field-item ${selectedField?.id === field.id ? 'selected' : ''}`}
                onClick={async () => {
                  setSelectedField(field);
                  setDrawingMode(null);
                  setShowDashboard(false);
                  await fetchFieldDetails(field.id);
                }}
              >
                <div className="field-item-header">
                  <h3>{field.name}</h3>
                  <span className="field-crop-badge">{field.crop_type || 'coffee'}</span>
                </div>
                <div className="field-item-stats">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>{field.spot_count || 0} spots</span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedField && (
          <div className="field-actions">
            <div className="selected-field-header">
              <span className="selected-label">Selected</span>
              <span className="selected-name">{selectedField.name}</span>
            </div>

            {/* Field Metrics Display - Compact */}
            {selectedField.metrics && (
              <div className="field-metrics-compact">
                <div className="metric-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                  </svg>
                  <span>
                    {selectedField.metrics.area_hectares >= 1
                      ? `${selectedField.metrics.area_hectares.toFixed(2)} ha`
                      : `${selectedField.metrics.area_sqm.toFixed(0)} m²`}
                  </span>
                </div>
                <div className="metric-chip">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
                  </svg>
                  <span>
                    {selectedField.metrics.perimeter_m >= 1000
                      ? `${(selectedField.metrics.perimeter_m / 1000).toFixed(2)} km`
                      : `${selectedField.metrics.perimeter_m.toFixed(0)} m`}
                  </span>
                </div>
              </div>
            )}

            <button
              className={`btn-add-spot ${drawingMode === 'spot' ? 'active-mode' : ''}`}
              onClick={() => {
                setDrawingMode('spot');
                setShowUploader(false);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <line x1="12" y1="8" x2="12" y2="14"/>
                <line x1="9" y1="11" x2="15" y2="11"/>
              </svg>
              Add Analysis Spot
            </button>

            <button
              className="btn-dashboard"
              onClick={() => fetchDashboardData(selectedField.id)}
              disabled={dashboardLoading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10"/>
                <path d="M12 20V4"/>
                <path d="M6 20v-6"/>
              </svg>
              {dashboardLoading ? 'Loading...' : 'View Dashboard'}
            </button>

            <button className="btn-delete" onClick={async () => {
              if (window.confirm('Delete this field and all its spots?')) {
                try {
                  await axios.delete(`/api/fields/${selectedField.id}`);
                  await fetchFields();
                  setSelectedField(null);
                  setShowDashboard(false);
                  setDrawingMode(null);
                } catch (err) {
                  alert('Error deleting field');
                }
              }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete Field
            </button>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>

      <div className="map-container">
        {/* Instruction Banner */}
        {drawingMode && (
          <div className={`instruction-banner-new ${drawingMode === 'field' ? 'field-mode' : 'spot-mode'}`}>
            {drawingMode === 'field' ? (
              <>
                <div className="banner-content">
                  <div className="banner-icon-wrapper">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
                    </svg>
                  </div>
                  <div className="banner-text">
                    <span className="banner-title">
                      {isDrawing ? 'Drawing Field' : 'Starting...'}
                    </span>
                    <span className="banner-description">
                      {isDrawing
                        ? 'Click to add points. Close by clicking the first point.'
                        : 'Preparing drawing mode...'}
                    </span>
                  </div>
                </div>
                <div className="banner-actions">
                  <div className="banner-tip">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    Min. 3 points
                  </div>
                  <button className="banner-cancel-btn" onClick={cancelDrawing}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="banner-content">
                  <div className="banner-icon-wrapper spot-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                  </div>
                  <div className="banner-text">
                    <span className="banner-title">Adding Analysis Spot</span>
                    <span className="banner-description">
                      Click inside the field boundary to place a spot
                    </span>
                  </div>
                </div>
                <button className="banner-cancel-btn" onClick={cancelDrawing}>
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        <div className="map-controls">
          <button
            className={`map-type-btn ${mapType === 'satellite' ? 'active' : ''}`}
            onClick={() => setMapType('satellite')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            Satellite
          </button>
          <button
            className={`map-type-btn ${mapType === 'street' ? 'active' : ''}`}
            onClick={() => setMapType('street')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            Street
          </button>
        </div>

        <MapContainer
          center={[-23.5505, -46.6333]}
          zoom={17}
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
            <PolygonDrawer
              onComplete={handlePolygonComplete}
              onCancel={cancelDrawing}
              disabled={showFieldNameModal}
            />
          )}

          {drawingMode === 'spot' && <MapClickHandler />}

          {fields.map(field => (
            <Polygon
              key={field.id}
              positions={field.polygon_coordinates}
              pathOptions={{
                color: selectedField?.id === field.id ? '#3b82f6' : '#64748b',
                fillColor: selectedField?.id === field.id ? '#3b82f6' : '#64748b',
                fillOpacity: selectedField?.id === field.id ? 0.35 : 0.15,
                weight: selectedField?.id === field.id ? 3 : 2,
                dashArray: drawingMode === 'spot' && selectedField?.id === field.id ? '5, 10' : null
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
              <div className="modal-header">
                <div className="modal-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                <div className="modal-title-group">
                  <h3>Crop Analysis</h3>
                  <p>Upload leaf image for AI-powered disease detection</p>
                </div>
              </div>
              <SpotUploader
                fieldId={selectedField.id}
                latitude={clickedPosition.lat}
                longitude={clickedPosition.lng}
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
          <FieldDashboard
            field={selectedField}
            data={dashboardData}
            onClose={() => setShowDashboard(false)}
          />
        )}

        {/* Field Name Modal */}
        {showFieldNameModal && (
          <div className="uploader-overlay" onClick={(e) => e.target === e.currentTarget && handleCancelFieldCreation()}>
            <div className="field-name-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-icon field-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
                  </svg>
                </div>
                <div className="modal-title-group">
                  <h3>Name Your Field</h3>
                  <p>Enter a name for your new crop field</p>
                </div>
              </div>

              <div className="field-name-input-group">
                <label htmlFor="field-name">Field Name</label>
                <input
                  id="field-name"
                  type="text"
                  placeholder="e.g., North Coffee Plantation"
                  value={fieldNameInput}
                  onChange={(e) => setFieldNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleSaveField();
                    if (e.key === 'Escape') handleCancelFieldCreation();
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                  onKeyPress={(e) => e.stopPropagation()}
                  autoFocus
                />
                <span className="field-name-hint">
                  {fieldNameInput.trim().length < 3
                    ? `Minimum 3 characters (${fieldNameInput.trim().length}/3)`
                    : 'Valid name'}
                </span>
              </div>

              <div className="field-name-actions">
                <button
                  className="btn-primary-full"
                  onClick={handleSaveField}
                  disabled={fieldNameInput.trim().length < 3 || savingField}
                >
                  {savingField ? (
                    <>
                      <div className="btn-spinner" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Create Field
                    </>
                  )}
                </button>
                <button
                  className="btn-secondary-full"
                  onClick={handleCancelFieldCreation}
                  disabled={savingField}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MapView;
