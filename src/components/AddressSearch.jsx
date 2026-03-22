import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';

export default function AddressSearch({ onSelectLocation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimer = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddress = async (q) => {
    if (!q || q.length < 3) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      // Prioritize Spain results by adding countrycodes=es
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5&countrycodes=es`
      );
      const data = await response.json();
      setResults(data);
      setShowDropdown(true);
    } catch (error) {
      console.error('Error fetching address:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      searchAddress(val);
    }, 500);
  };

  const handleSelect = (result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    
    onSelectLocation([lat, lon], result.display_name);
    setQuery(result.display_name);
    setShowDropdown(false);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '2px 12px',
        transition: 'all 0.3s ease',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
      }}>
        <Search size={16} style={{ color: 'var(--text-secondary)', marginRight: '10px' }} />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => query.length >= 3 && results.length > 0 && setShowDropdown(true)}
          placeholder="Buscar calle, municipio, lugar..."
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            padding: '10px 0',
            width: '100%',
            outline: 'none'
          }}
        />
        {isLoading ? (
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
        ) : query && (
          <button onClick={clearSearch} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="glass-card" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 1000,
          marginTop: '6px',
          maxHeight: '250px',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          padding: '4px'
        }}>
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => handleSelect(r)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px',
                cursor: 'pointer',
                borderRadius: '6px',
                transition: 'background 0.2s ease',
                borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
              }}
              className="suggestion-item"
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <MapPin size={14} style={{ color: 'var(--accent-primary)', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', lineHeight: '1.4' }}>
                {r.display_name}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
