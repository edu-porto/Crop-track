import React, { useMemo } from 'react';
import './FieldDashboard.css';

function FieldDashboard({ field, data, onClose }) {
  // Calculate statistics from data
  const stats = useMemo(() => {
    if (!data) return null;

    const distribution = data.health_distribution || {};
    const total = data.total_spots || 0;
    const healthy = distribution.healthy || 0;
    const issues = (distribution.mildly_stressed || 0) +
                   (distribution.diseased || 0) +
                   (distribution.pest_damage || 0) +
                   (distribution.nutrient_deficiency || 0);
    const healthRate = total > 0 ? ((healthy / total) * 100).toFixed(0) : 0;

    return {
      total,
      healthy,
      issues,
      healthRate,
      distribution
    };
  }, [data]);

  // Generate mock trend data based on actual data
  const trendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const baseValue = stats?.healthRate || 70;
    return months.map((month, index) => ({
      month,
      value: Math.max(0, Math.min(100, baseValue - 20 + (index * 4) + Math.random() * 10))
    }));
  }, [stats]);

  // Color mapping for health statuses
  const healthColors = {
    healthy: { bg: '#ecfdf5', bar: '#059669', text: '#047857', icon: '✓' },
    mildly_stressed: { bg: '#fffbeb', bar: '#d97706', text: '#b45309', icon: '⚠' },
    diseased: { bg: '#fef2f2', bar: '#dc2626', text: '#b91c1c', icon: '✕' },
    pest_damage: { bg: '#fef2f2', bar: '#ef4444', text: '#dc2626', icon: '🐛' },
    nutrient_deficiency: { bg: '#f5f3ff', bar: '#7c3aed', text: '#6d28d9', icon: '▼' },
    unknown: { bg: '#f8fafc', bar: '#64748b', text: '#475569', icon: '?' }
  };

  // Generate alerts from unhealthy spots
  const alerts = useMemo(() => {
    if (!stats?.distribution) return [];

    const alertList = [];
    const dist = stats.distribution;

    if (dist.diseased > 0) {
      alertList.push({
        type: 'danger',
        icon: '🔴',
        title: 'Disease Detected',
        description: `${dist.diseased} spot${dist.diseased > 1 ? 's' : ''} showing disease symptoms`,
        count: dist.diseased
      });
    }
    if (dist.pest_damage > 0) {
      alertList.push({
        type: 'danger',
        icon: '🐛',
        title: 'Pest Damage Found',
        description: `${dist.pest_damage} spot${dist.pest_damage > 1 ? 's' : ''} with pest damage detected`,
        count: dist.pest_damage
      });
    }
    if (dist.mildly_stressed > 0) {
      alertList.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Stress Indicators',
        description: `${dist.mildly_stressed} spot${dist.mildly_stressed > 1 ? 's' : ''} showing mild stress`,
        count: dist.mildly_stressed
      });
    }
    if (dist.nutrient_deficiency > 0) {
      alertList.push({
        type: 'info',
        icon: '🍃',
        title: 'Nutrient Deficiency',
        description: `${dist.nutrient_deficiency} spot${dist.nutrient_deficiency > 1 ? 's' : ''} with low nutrient levels`,
        count: dist.nutrient_deficiency
      });
    }

    return alertList;
  }, [stats]);

  if (!data || !stats) {
    return (
      <div className="dashboard-overlay">
        <div className="dashboard-loading">
          <div className="loading-spinner-large" />
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-overlay">
      <div className="dashboard-container">
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-header-left">
            <div className="dashboard-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10"/>
                <path d="M12 20V4"/>
                <path d="M6 20v-6"/>
              </svg>
            </div>
            <div className="dashboard-title-group">
              <h1>Field Analytics</h1>
              <p>{field?.name || 'Field Dashboard'}</p>
            </div>
          </div>
          <button className="dashboard-close-btn" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="dashboard-stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Total Spots</span>
              <div className="stat-card-icon blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
            </div>
            <div className="stat-card-value">{stats.total}</div>
            <p className="stat-card-subtitle">Analysis points in this field</p>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Healthy Crops</span>
              <div className="stat-card-icon green">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
            </div>
            <div className="stat-card-value green">{stats.healthy}</div>
            <p className="stat-card-subtitle">{stats.healthRate}% of total spots</p>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Issues Detected</span>
              <div className="stat-card-icon orange">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            <div className="stat-card-value orange">{stats.issues}</div>
            <p className="stat-card-subtitle">Spots requiring attention</p>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Health Rate</span>
              <div className="stat-card-icon purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="20" x2="12" y2="10"/>
                  <line x1="18" y1="20" x2="18" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="16"/>
                </svg>
              </div>
            </div>
            <div className="stat-card-value purple">{stats.healthRate}%</div>
            <p className="stat-card-subtitle">Overall field health score</p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="dashboard-charts-grid">
          {/* Health Trend Chart */}
          <div className="chart-card">
            <div className="chart-card-header">
              <h3>Health Trend</h3>
              <span className="chart-card-subtitle">6-month vigor evolution</span>
            </div>
            <div className="chart-area">
              <div className="line-chart">
                <div className="chart-y-axis">
                  <span>100%</span>
                  <span>50%</span>
                  <span>0%</span>
                </div>
                <div className="chart-content">
                  <svg viewBox="0 0 300 150" className="line-chart-svg">
                    {/* Grid lines */}
                    <line x1="0" y1="0" x2="300" y2="0" className="grid-line" />
                    <line x1="0" y1="75" x2="300" y2="75" className="grid-line" />
                    <line x1="0" y1="150" x2="300" y2="150" className="grid-line" />

                    {/* Area fill */}
                    <path
                      d={`M 0 ${150 - trendData[0].value * 1.5}
                          ${trendData.map((d, i) => `L ${i * 60} ${150 - d.value * 1.5}`).join(' ')}
                          L 300 150 L 0 150 Z`}
                      className="area-fill"
                    />

                    {/* Line */}
                    <path
                      d={`M 0 ${150 - trendData[0].value * 1.5}
                          ${trendData.map((d, i) => `L ${i * 60} ${150 - d.value * 1.5}`).join(' ')}`}
                      className="line-path"
                      fill="none"
                    />

                    {/* Data points */}
                    {trendData.map((d, i) => (
                      <circle
                        key={i}
                        cx={i * 60}
                        cy={150 - d.value * 1.5}
                        r="4"
                        className="data-point"
                      />
                    ))}
                  </svg>
                  <div className="chart-x-axis">
                    {trendData.map((d, i) => (
                      <span key={i}>{d.month}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Distribution Chart */}
          <div className="chart-card">
            <div className="chart-card-header">
              <h3>Health Distribution</h3>
              <span className="chart-card-subtitle">Analysis breakdown by category</span>
            </div>
            <div className="chart-area">
              <div className="bar-chart">
                {Object.entries(stats.distribution).length > 0 ? (
                  Object.entries(stats.distribution).map(([label, count]) => {
                    const colors = healthColors[label] || healthColors.unknown;
                    const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                    return (
                      <div key={label} className="bar-chart-row" style={{ background: colors.bg }}>
                        <div className="bar-chart-label">
                          <span className="bar-label-text" style={{ color: colors.text }}>
                            {label.replace(/_/g, ' ')}
                          </span>
                          <span className="bar-label-pct">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="bar-chart-bar-bg">
                          <div
                            className="bar-chart-bar"
                            style={{ width: `${pct}%`, background: colors.bar }}
                          />
                        </div>
                        <span className="bar-chart-count" style={{ color: colors.text }}>{count}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="chart-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <p>No analysis data yet</p>
                    <span>Add spots to see distribution</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Alerts and Quick Actions */}
        <div className="dashboard-bottom-grid">
          {/* Alerts Section */}
          <div className="alerts-card">
            <div className="alerts-card-header">
              <h3>Recent Alerts</h3>
              <span className="alerts-badge">{alerts.length} active</span>
            </div>
            <div className="alerts-list">
              {alerts.length > 0 ? (
                alerts.map((alert, index) => (
                  <div key={index} className={`alert-item alert-${alert.type}`}>
                    <span className="alert-icon">{alert.icon}</span>
                    <div className="alert-content">
                      <p className="alert-title">{alert.title}</p>
                      <p className="alert-description">{alert.description}</p>
                    </div>
                    <span className="alert-count">{alert.count}</span>
                  </div>
                ))
              ) : (
                <div className="alerts-empty">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <p>No alerts</p>
                  <span>All crops are healthy!</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions-card">
            <div className="quick-actions-header">
              <h3>Quick Actions</h3>
              <span className="quick-actions-subtitle">Manage your field</span>
            </div>
            <div className="quick-actions-list">
              <button className="quick-action-btn" onClick={onClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <line x1="12" y1="8" x2="12" y2="14"/>
                  <line x1="9" y1="11" x2="15" y2="11"/>
                </svg>
                Add Analysis Spot
              </button>
              <button className="quick-action-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export Report
              </button>
              <button className="quick-action-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Field Settings
              </button>
            </div>

            {/* Field Info */}
            <div className="field-info-section">
              <h4>Field Information</h4>
              <div className="field-info-grid">
                <div className="field-info-item">
                  <span className="field-info-label">Crop Type</span>
                  <span className="field-info-value">{field?.crop_type || 'Coffee'}</span>
                </div>
                <div className="field-info-item">
                  <span className="field-info-label">Created</span>
                  <span className="field-info-value">
                    {field?.created_at
                      ? new Date(field.created_at).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>
                {field?.metrics && (
                  <>
                    <div className="field-info-item">
                      <span className="field-info-label">Area</span>
                      <span className="field-info-value">
                        {field.metrics.area_hectares >= 1
                          ? `${field.metrics.area_hectares.toFixed(2)} ha`
                          : `${field.metrics.area_sqm?.toFixed(0) || 0} m²`}
                      </span>
                    </div>
                    <div className="field-info-item">
                      <span className="field-info-label">Perimeter</span>
                      <span className="field-info-value">
                        {field.metrics.perimeter_m >= 1000
                          ? `${(field.metrics.perimeter_m / 1000).toFixed(2)} km`
                          : `${field.metrics.perimeter_m?.toFixed(0) || 0} m`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="dashboard-footer">
          <button className="btn-primary-large" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to Map
          </button>
        </div>
      </div>
    </div>
  );
}

export default FieldDashboard;
