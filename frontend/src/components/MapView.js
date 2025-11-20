import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMapEvents } from 'react-leaflet';
import { FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import axios from 'axios';
import SpotUploader from './SpotUploader';
import './MapView.css';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapView() {
  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [drawingMode, setDrawingMode] = useState('field'); // 'field' or 'spot'
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [showUploader, setShowUploader] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapType, setMapType] = useState('satellite'); // 'satellite' or 'street'

  useEffect(() => {
    fetchFields();
  }, []);

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

  const handleCreated = async (e) => {
    const layer = e.layer;
    
    if (drawingMode === 'field') {
      // Extract polygon coordinates
      const latlngs = layer.getLatLngs()[0];
      const coordinates = latlngs.map(ll => [ll.lat, ll.lng]);
      
      // Prompt for field name
      const name = prompt('Enter field name:');
      if (!name) {
        layer.remove();
        return;
      }
      
      setLoading(true);
      try {
        const response = await axios.post('/api/fields', {
          name,
          crop_type: 'coffee',
          polygon_coordinates: coordinates
        });
        
        await fetchFields();
        alert('Field created successfully!');
      } catch (err) {
        console.error('Error creating field:', err);
        layer.remove();
        alert(err.response?.data?.error || 'Error creating field');
      } finally {
        setLoading(false);
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
    const map = useMapEvents({
      click: (e) => {
        // Only handle if in spot mode and have a selected field
        if (drawingMode === 'spot' && selectedField) {
          const { lat, lng } = e.latlng;
          setClickedPosition({ lat, lng });
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
        <button 
          className="btn-primary"
          onClick={() => {
            setDrawingMode('field');
            setSelectedField(null);
            setShowUploader(false);
          }}
        >
          Create Field
        </button>
        
        <div className="fields-list">
          {fields.map(field => (
            <div 
              key={field.id} 
              className={`field-item ${selectedField?.id === field.id ? 'selected' : ''}`}
              onClick={async () => {
                setSelectedField(field);
                setDrawingMode('spot');
                await fetchFieldDetails(field.id);
              }}
            >
              <h3>{field.name}</h3>
              <p>{field.crop_type || 'coffee'}</p>
              <small>{field.spot_count || 0} spots</small>
            </div>
          ))}
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
            <button 
              className="btn-secondary"
              onClick={() => {
                setDrawingMode('spot');
                setShowUploader(false);
              }}
            >
              Add Spot
            </button>
            <button 
              className="btn-danger"
              onClick={async () => {
                if (window.confirm('Delete this field?')) {
                  try {
                    await axios.delete(`/api/fields/${selectedField.id}`);
                    await fetchFields();
                    setSelectedField(null);
                  } catch (err) {
                    alert('Error deleting field');
                  }
                }
              }}
            >
              Delete Field
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
            title="Satellite View"
          >
            🛰️ Satellite
          </button>
          <button 
            className={`map-type-btn ${mapType === 'street' ? 'active' : ''}`}
            onClick={() => setMapType('street')}
            title="Street Map"
          >
            🗺️ Street
          </button>
        </div>
        <MapContainer
          center={[-23.5505, -46.6333]} // São Paulo, Brazil (default)
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          {mapType === 'satellite' ? (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; <a href="https://www.esri.com/">Esri</a> &copy; <a href="https://www.esri.com/">Esri</a>'
              maxZoom={19}
            />
          ) : (
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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

          {/* Render field polygons */}
          {fields.map(field => (
            <Polygon
              key={field.id}
              positions={field.polygon_coordinates}
              pathOptions={{
                color: selectedField?.id === field.id ? '#3388ff' : '#3388ff',
                fillColor: selectedField?.id === field.id ? '#3388ff' : '#3388ff',
                fillOpacity: drawingMode === 'spot' ? 0.2 : (selectedField?.id === field.id ? 0.3 : 0.1),
                weight: selectedField?.id === field.id ? 3 : 2
              }}
              interactive={drawingMode !== 'spot'} // Make non-interactive when adding spots
              bubblingMouseEvents={drawingMode === 'spot'} // Allow clicks to pass through in spot mode
              eventHandlers={drawingMode !== 'spot' ? {
                click: (e) => {
                  e.originalEvent.stopPropagation(); // Stop event from bubbling to map
                  setSelectedField(field);
                  fetchFieldDetails(field.id);
                }
              } : {}}
            >
              {drawingMode !== 'spot' && (
                <Popup>
                  <div>
                    <h3>{field.name}</h3>
                    <p>{field.crop_type || 'coffee'}</p>
                    <small>{field.spot_count || 0} spots</small>
                  </div>
                </Popup>
              )}
            </Polygon>
          ))}

          {/* Render spots */}
          {selectedField && selectedField.spots && selectedField.spots.map(spot => {
            const color = spot.analysis 
              ? getMarkerColor(spot.analysis.health_assessment?.label || 'unknown')
              : 'gray';
            
            return (
              <Marker
                key={spot.id}
                position={[spot.latitude, spot.longitude]}
                icon={createCustomIcon(color)}
                eventHandlers={{
                  click: () => setSelectedSpot(spot)
                }}
              >
                <Popup>
                  <div className="spot-popup">
                    <h4>Spot Analysis</h4>
                    {spot.analysis ? (
                      <>
                        <p><strong>Status:</strong> {spot.analysis.health_assessment?.label || 'unknown'}</p>
                        <p><strong>Confidence:</strong> {((spot.analysis.health_assessment?.confidence || 0) * 100).toFixed(1)}%</p>
                        {spot.analysis.detailed_findings?.diseases_detected?.length > 0 && (
                          <p><strong>Diseases:</strong> {spot.analysis.detailed_findings.diseases_detected.join(', ')}</p>
                        )}
                        {spot.analysis.detailed_findings?.pests_detected?.length > 0 && (
                          <p><strong>Pests:</strong> {spot.analysis.detailed_findings.pests_detected.join(', ')}</p>
                        )}
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

        {showUploader && clickedPosition && selectedField && (
          <div className="uploader-overlay">
            <div className="uploader-modal">
              <h3>Upload Image for Spot</h3>
              <p>Location: {clickedPosition.lat.toFixed(6)}, {clickedPosition.lng.toFixed(6)}</p>
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

        {selectedSpot && (
          <div className="spot-details-panel">
            <button className="close-btn" onClick={() => setSelectedSpot(null)}>×</button>
            <h3>Spot Details</h3>
            {selectedSpot.analysis && (
              <div className="analysis-details">
                <h4>Analysis Results</h4>
                <p><strong>Health:</strong> {selectedSpot.analysis.health_assessment?.label}</p>
                <p><strong>Confidence:</strong> {((selectedSpot.analysis.health_assessment?.confidence || 0) * 100).toFixed(1)}%</p>
                <div className="findings">
                  <h5>Diseases Detected:</h5>
                  <ul>
                    {selectedSpot.analysis.detailed_findings?.diseases_detected?.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                  <h5>Pests Detected:</h5>
                  <ul>
                    {selectedSpot.analysis.detailed_findings?.pests_detected?.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MapView;

