import React, { useState, useEffect } from 'react';
import { Users, FileCheck, Download, Globe, Zap, Loader2, RefreshCw } from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale);

const NAMESPACE = 'gml_final_stats_v1';
const BASE_API_URL = 'https://api.counterapi.dev';

export default function Statistics({ localStats }) {
  const [onlineStats, setOnlineStats] = useState({ visits: 0, conversions: 0, downloads: 0 });
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [activeTab, setActiveTab] = useState('local');
  const [errorSync, setErrorSync] = useState(false);

  // Fetch online stats
  const fetchOnlineStats = async () => {
    setLoadingOnline(true);
    setErrorSync(false);
    console.log("Sincronizando con CounterAPI:", NAMESPACE);
    
    try {
      const endpoints = ['visits', 'conversions', 'downloads'];
      const timestamp = Date.now();
      
      const results = await Promise.all(
        endpoints.map(id => 
          fetch(`${BASE_API_URL}/v1/${NAMESPACE}/${id}/?t=${timestamp}`)
            .then(res => {
              if (!res.ok) throw new Error("API status " + res.status);
              return res.json();
            })
            .catch(() => ({ count: 0 }))
        )
      );

      setOnlineStats({
        visits: results[0].count || 0,
        conversions: results[1].count || 0,
        downloads: results[2].count || 0
      });
    } catch (error) {
      console.error("Error en sincronización online:", error);
      setErrorSync(true);
    } finally {
      setLoadingOnline(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'online') {
      fetchOnlineStats();
    }
  }, [activeTab]);

  // Chart Data
  const currentStats = activeTab === 'local' ? localStats : onlineStats;
  
  const chartData = {
    labels: ['Visitas', 'GMLs', 'Descargas'],
    datasets: [{
      data: [currentStats.visits, currentStats.conversions, currentStats.downloads],
      backgroundColor: ['#B6C88D', '#00ff9d', '#6B8E23'],
      borderColor: 'rgba(0,0,0,0.1)',
      borderWidth: 1,
      hoverOffset: 15
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.label}: ${context.raw}`
        }
      }
    }
  };

  return (
    <div className="statistics-section glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', color: 'var(--text-primary)' }}>
          <Zap size={18} className="pulse-indicator" style={{ color: 'var(--accent-primary)' }} />
          ESTADÍSTICAS
        </h3>
        
        <div className="stats-toggle" style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: '2px' }}>
          <button 
            className={`toggle-btn ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            TUYAS
          </button>
          <button 
            className={`toggle-btn ${activeTab === 'online' ? 'active' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            GLOBAL
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        {/* Chart Container */}
        <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
          <Doughnut data={chartData} options={chartOptions} />
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
              {currentStats.visits + currentStats.conversions + currentStats.downloads}
            </span>
            <div style={{ fontSize: '0.5rem', textTransform: 'uppercase', opacity: 0.6 }}>Total</div>
          </div>
        </div>

        {/* Legend / Metrics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="metric-row">
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#B6C88D' }}></div>
            <span className="metric-label">Visitas</span>
            <span className="metric-value">{currentStats.visits}</span>
          </div>
          <div className="metric-row">
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00ff9d' }}></div>
            <span className="metric-label">GMLs</span>
            <span className="metric-value">{currentStats.conversions}</span>
          </div>
          <div className="metric-row">
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6B8E23' }}></div>
            <span className="metric-label">Descargas</span>
            <span className="metric-value">{currentStats.downloads}</span>
          </div>
        </div>
      </div>

      {activeTab === 'online' && (
        <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
          {loadingOnline ? (
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <Loader2 size={12} className="animate-spin" /> Sincronizando datos...
            </div>
          ) : (
            <button 
              onClick={fetchOnlineStats}
              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto' }}
            >
              <RefreshCw size={10} /> Actualizar ahora
            </button>
          )}
          {errorSync && (
            <div style={{ fontSize: '0.6rem', color: '#ff4d4d', marginTop: 4 }}>
              * Error de conexión. Revisa tu AdBlock o refresca.
            </div>
          )}
        </div>
      )}
      
      <style jsx="true">{`
        .statistics-section {
          background: rgba(255, 255, 255, 0.03) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3) !important;
        }
        .toggle-btn {
          padding: 6px 14px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 0.7rem;
          font-weight: bold;
          cursor: pointer;
          border-radius: 18px;
          transition: all 0.2s ease;
        }
        .toggle-btn.active {
          background: var(--accent-primary);
          color: #000;
        }
        .metric-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.8rem;
        }
        .metric-label {
          color: var(--text-secondary);
          flex: 1;
        }
        .metric-value {
          font-weight: bold;
          font-family: monospace;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
