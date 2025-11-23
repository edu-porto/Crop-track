import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import MapView from './components/MapView';
import ImageUploader from './components/ImageUploader';
import './App.css';

function App() {
  return (
    <Router>
      <nav style={{ 
        padding: '10px 20px', 
        background: '#f8f9fa', 
        borderBottom: '1px solidrgb(28, 100, 172)',
        display: 'flex',
        gap: '20px',
        alignItems: 'center'
      }}>
        <h2 style={{ margin: 0 }}>Crop Track</h2>
        <Link to="/" style={{ textDecoration: 'none', color: '#007bff', fontWeight: 'bold' }}>
          Map View
        </Link>
        <Link to="/upload" style={{ textDecoration: 'none', color: '#007bff', fontWeight: 'bold' }}>
          Image Upload
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<MapView />} />
        <Route path="/upload" element={<ImageUploader />} />
      </Routes>
    </Router>
  );
}

export default App;

