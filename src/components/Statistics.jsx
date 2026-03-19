import React, { useState, useEffect } from 'react';
import { Users, FileCheck, Download, Globe, Zap, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

export default function Statistics({ localStats }) {
  const [onlineStats, setOnlineStats] = useState({ visits: 0, conversions: 0, downloads: 0 });
  const [loadingOnline, setLoadingOnline] = useState(false);
  const [activeTab, setActiveTab] = useState('local');
  const [errorSync, setErrorSync] = useState(false);

  const fetchOnlineStats = async () => {
    setLoadingOnline(true);
    setErrorSync(false);
    
    try {
      const { data, error } = await supabase
        .from('global_stats')
        .select('visits, conversions, downloads')
        .eq('id', 1)
        .single();
      
      if (error) throw error;

      if (data) {
        setOnlineStats({
          visits: data.visits || 0,
          conversions: data.conversions || 0,
          downloads: data.downloads || 0
        });
      }
    } catch (error) {
      console.error("Supabase fetch error:", error);
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

  const currentStats = activeTab === 'local' ? localStats : onlineStats;

  return (
    <div className="statistics-section">
      <div className="stats-header">
        <div className="title">
          <Zap size={18} className={activeTab === 'online' ? 'pulse-indicator' : ''} style={{ color: 'var(--accent-primary)' }} />
          <h3>ESTADÍSTICAS</h3>
        </div>
        
        <div className="toggle-container">
          <button 
            className={`toggle-item ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            TUYAS
          </button>
          <button 
            className={`toggle-item ${activeTab === 'online' ? 'active' : ''}`}
            onClick={() => setActiveTab('online')}
          >
            GLOBAL
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card glass-card">
          <div className="stat-icon visitas">
            <Users size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{currentStats.visits}</span>
            <span className="stat-label">Visitas</span>
          </div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-icon gmls">
            <FileCheck size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{currentStats.conversions}</span>
            <span className="stat-label">GMLs</span>
          </div>
        </div>

        <div className="stat-card glass-card">
          <div className="stat-icon descargas">
            <Download size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{currentStats.downloads}</span>
            <span className="stat-label">Descargas</span>
          </div>
        </div>
      </div>

      {activeTab === 'online' && (
        <div className="online-footer">
          {loadingOnline ? (
            <div className="sync-status loading">
              <Loader2 size={12} className="animate-spin" /> Sincronizando...
            </div>
          ) : (
            <button className="refresh-btn" onClick={fetchOnlineStats}>
              <RefreshCw size={12} /> Refrescar datos globales
            </button>
          )}
          
          {errorSync && (
            <div className="sync-error">
              <AlertCircle size={10} /> No se pudo conectar. Refresca la web.
            </div>
          )}
        </div>
      )}

      <style jsx="true">{`
        .statistics-section {
          margin-bottom: 25px;
        }
        .stats-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        .stats-header .title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .stats-header h3 {
          margin: 0;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
          color: var(--text-primary);
        }
        .toggle-container {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          padding: 2px;
          border-radius: 20px;
        }
        .toggle-item {
          padding: 4px 12px;
          border: none;
          background: none;
          color: var(--text-secondary);
          font-size: 0.65rem;
          font-weight: 800;
          cursor: pointer;
          border-radius: 15px;
          transition: all 0.2s;
        }
        .toggle-item.active {
          background: var(--accent-primary);
          color: #000;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .stat-card {
          padding: 12px 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          text-align: center;
          background: rgba(255, 255, 255, 0.02);
        }
        .stat-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stat-icon.visitas { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
        .stat-icon.gmls { background: rgba(0, 255, 157, 0.1); color: var(--accent-primary); }
        .stat-icon.descargas { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        
        .stat-value {
          display: block;
          font-size: 1.1rem;
          font-weight: 800;
          font-family: monospace;
          color: var(--text-primary);
        }
        .stat-label {
          display: block;
          font-size: 0.55rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }
        .online-footer {
          margin-top: 10px;
          text-align: center;
        }
        .refresh-btn {
          background: none;
          border: none;
          color: var(--accent-primary);
          font-size: 0.6rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          margin: 0 auto;
          opacity: 0.7;
        }
        .refresh-btn:hover { opacity: 1; }
        .sync-status {
          font-size: 0.6rem;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .sync-error {
          font-size: 0.55rem;
          color: #ff4d4d;
          margin-top: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
      `}</style>
    </div>
  );
}
