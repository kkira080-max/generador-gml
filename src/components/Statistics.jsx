import React, { useState, useEffect } from 'react';
import { Users, FileCheck, Download, Globe, Zap, Loader2 } from 'lucide-react';

const NAMESPACE = 'gml_generator_v1_live'; // Unique namespace for the app
const BASE_API_URL = 'https://api.counterapi.dev';

export default function Statistics({ localStats }) {
  const [onlineStats, setOnlineStats] = useState({ visits: 0, conversions: 0, downloads: 0 });
  const [mode, setMode] = useState('local'); // 'local' or 'online'
  const [loading, setLoading] = useState(false);

  // Function to fetch all online stats
  const fetchOnlineStats = async () => {
    setLoading(true);
    try {
      const endpoints = ['visits', 'conversions', 'downloads'];
      const timestamp = Date.now();
      const results = await Promise.all(
        endpoints.map(id => 
          fetch(`${BASE_API_URL}/v1/${NAMESPACE}/${id}/?t=${timestamp}`)
            .then(res => res.json())
            .catch(() => ({ count: 0 }))
        )
      );

      setOnlineStats({
        visits: results[0].count || 0,
        conversions: results[1].count || 0,
        downloads: results[2].count || 0
      });
    } catch (error) {
      console.error("Error fetching online stats:", error);
    } finally {
      setLoadingOnline(false);
    }
  };

  // Initial fetch and periodic refresh for "Mundial" tab
  useEffect(() => {
    fetchOnlineStats();
    const interval = setInterval(() => {
      if (activeTab === 'online') fetchOnlineStats();
    }, 15000); // Refresh every 15s when active

    return () => clearInterval(interval);
  }, [activeTab]);

  const statsToShow = activeTab === 'local' ? localStats : onlineStats;

  return (
    <div className="statistics-container glass-card" style={{
      marginTop: '20px',
      padding: '16px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <h3 style={{
            fontSize: '0.9rem',
            fontWeight: 'bold',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            <Zap size={16} className="pulse-slow" /> Estadísticas
          </h3>
          
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '20px',
            padding: '2px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <button 
              onClick={() => setActiveTab('local')}
              style={{
                padding: '4px 10px',
                borderRadius: '18px',
                fontSize: '0.6rem',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'local' ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === 'local' ? '#000' : 'var(--text-secondary)',
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap'
              }}
            >
              TUYAS
            </button>
            <button 
              onClick={() => setActiveTab('online')}
              style={{
                padding: '4px 10px',
                borderRadius: '18px',
                fontSize: '0.6rem',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'online' ? 'var(--accent-secondary)' : 'transparent',
                color: activeTab === 'online' ? '#000' : 'var(--text-secondary)',
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap'
              }}
            >
              ONLINE
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', position: 'relative' }}>
        {loadingOnline && activeTab === 'online' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.2)',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px'
          }}>
            <Loader2 className="animate-spin" size={24} color="var(--accent-primary)" />
          </div>
        )}
        <StatCard 
          icon={<Users size={16} />} 
          label="Visitas" 
          value={statsToShow.visits} 
          color="var(--accent-primary)" 
        />
        <StatCard 
          icon={<FileCheck size={16} />} 
          label="GMLs" 
          value={statsToShow.conversions} 
          color="var(--accent-secondary)" 
        />
        <StatCard 
          icon={<Download size={16} />} 
          label="Descarga" 
          value={statsToShow.downloads} 
          color="#f59e0b" 
        />
      </div>

      <div style={{ 
        marginTop: '12px', 
        fontSize: '0.6rem', 
        color: 'var(--text-secondary)', 
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        opacity: 0.6
      }}>
        {activeTab === 'online' ? (
          <><Globe size={10} className="animate-spin-slow" /> Sincronizado con el servidor global</>
        ) : (
          <>Datos guardados localmente en tu equipo</>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color }) => (
  <div style={{
    background: 'rgba(0,0,0,0.4)',
    padding: '10px 4px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    border: `1px solid ${color}33`,
    transition: 'transform 0.2s ease',
    cursor: 'default',
    minWidth: 0
  }}
  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
  >
    <div style={{ color: color }}>{icon}</div>
    <div style={{ 
      fontSize: '1.1rem', 
      fontWeight: '800', 
      color: '#fff', 
      fontFamily: 'monospace',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '100%'
    }}>
      {value.toLocaleString()}
    </div>
    <div style={{ fontSize: '0.52rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </div>
  </div>
);

export default Statistics;
