import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { BookOpen, Filter, AlertCircle } from 'lucide-react';

export default function LearnNewsEvents({ refreshTrigger }) {
  const [uniqueEvents, setUniqueEvents] = useState([]);
  const [allEvents, setAllEvents] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);
  const [dateRangeStr, setDateRangeStr] = useState('in the database');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filter state
  const [filterColor, setFilterColor] = useState('');

  const fetchUniqueEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let allData = [];
      let lastFetched = 1000;
      let start = 0;
      const CHUNK_SIZE = 1000;

      while (lastFetched === CHUNK_SIZE) {
        const { data, error: fetchErr } = await supabase
          .from('calendar_events')
          .select('news_name, folder_color, news_date, news_time, actual, forecast, previous')
          .range(start, start + CHUNK_SIZE - 1);

        if (fetchErr) throw fetchErr;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          lastFetched = data.length;
          start += CHUNK_SIZE;
        } else {
          lastFetched = 0;
        }
      }

      // Group by unique news_name and prioritize highest impact color
      const colorRank = { 'Red': 4, 'Orange': 3, 'Yellow': 2, 'Gray': 1 };
      const uniqueMap = new Map();
      const countMap = new Map();

      let minDate = new Date('2099-01-01');
      let maxDate = new Date('1970-01-01');

      allData.forEach(item => {
        const name = item.news_name.trim();
        const color = item.folder_color;
        
        countMap.set(name, (countMap.get(name) || 0) + 1);

        if (item.news_date) {
          const d = new Date(item.news_date);
          if (d < minDate) minDate = d;
          if (d > maxDate) maxDate = d;
        }

        if (!uniqueMap.has(name)) {
          uniqueMap.set(name, color);
        } else {
          const currentColor = uniqueMap.get(name);
          if (colorRank[color] > colorRank[currentColor]) {
            uniqueMap.set(name, color);
          }
        }
      });

      const formatMonthYear = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const rangeStr = (minDate <= maxDate) 
        ? `from ${formatMonthYear(minDate)} to ${formatMonthYear(maxDate)}`
        : 'in the database';

      const uniqueArr = Array.from(uniqueMap.entries()).map(([name, color]) => ({
        news_name: name,
        folder_color: color,
        count: countMap.get(name)
      }));

      // Sort alphabetically
      uniqueArr.sort((a, b) => a.news_name.localeCompare(b.news_name));

      setAllEvents(allData);
      setUniqueEvents(uniqueArr);
      setDateRangeStr(rangeStr);
    } catch (err) {
      console.error('Error fetching unique events:', err);
      setError(err.message || 'Failed to fetch unique events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUniqueEvents();
  }, [refreshTrigger]);

  // Scroll to top whenever the detail view is opened or closed
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedNews]);

  const exportUniqueEventsCSV = () => {
    if (uniqueEvents.length === 0) return;
    const currentList = filterColor ? uniqueEvents.filter(event => event.folder_color === filterColor) : uniqueEvents;
    if (currentList.length === 0) return;

    const headers = ['Sr No', 'Name of News', 'Impact', 'Total Occurrences'];
    const csvRows = [
      headers.join(','),
      ...currentList.map((row, index) => [
        index + 1,
        `"${row.news_name.replace(/"/g, '""')}"`,
        `"${row.folder_color}"`,
        row.count
      ].join(','))
    ];

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `unique_events_dictionary_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportOccurrencesCSV = (occurrencesList, newsName) => {
    if (occurrencesList.length === 0) return;

    const headers = ['Sr No', 'Date', 'Time', 'Impact', 'Actual', 'Forecast', 'Previous'];
    const csvRows = [
      headers.join(','),
      ...occurrencesList.map((row, index) => [
        index + 1,
        row.news_date,
        row.news_time,
        `"${row.folder_color}"`,
        `"${(row.actual || '').replace(/"/g, '""')}"`,
        `"${(row.forecast || '').replace(/"/g, '""')}"`,
        `"${(row.previous || '').replace(/"/g, '""')}"`
      ].join(','))
    ];

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const cleanName = newsName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute('download', `${cleanName}_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Apply filter
  const filteredEvents = filterColor 
    ? uniqueEvents.filter(event => event.folder_color === filterColor)
    : uniqueEvents;

  if (selectedNews) {
    const newsOccurrences = allEvents
      .filter(e => e.news_name.trim() === selectedNews)
      .sort((a, b) => new Date(b.news_date) - new Date(a.news_date));

    return (
      <div className="view-container animate-fade-in">
        <div className="view-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn-secondary" onClick={() => setSelectedNews(null)}>← Back</button>
          <div>
            <h2 className="view-title">{selectedNews}</h2>
            <p className="view-subtitle">Historical occurrences in the database</p>
          </div>
        </div>
        
        <div className="export-toolbar animate-fade-in" style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="results-count">Showing <strong>{newsOccurrences.length}</strong> historical occurrences</span>
          <button className="btn-secondary sm" onClick={() => exportOccurrencesCSV(newsOccurrences, selectedNews)}>
            Export CSV
          </button>
        </div>

        <div className="table-card table-viewer-card animate-fade-in" style={{ marginTop: '16px' }}>
          <div className="table-responsive">
            <table className="editable-table db-view-table">
              <thead>
                <tr>
                  <th width="80">Sr No</th>
                  <th width="120">Date</th>
                  <th width="100">Time</th>
                  <th width="120">Impact</th>
                  <th width="100">Actual</th>
                  <th width="100">Forecast</th>
                  <th width="100">Previous</th>
                </tr>
              </thead>
              <tbody>
                {newsOccurrences.map((row, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{row.news_date}</td>
                    <td>{row.news_time}</td>
                    <td>
                      <span className={`impact-badge folder-${row.folder_color.toLowerCase()}`}>
                        {row.folder_color === 'Red' && '🔴 High'}
                        {row.folder_color === 'Orange' && '🟠 Medium'}
                        {row.folder_color === 'Yellow' && '🟡 Low'}
                        {row.folder_color === 'Gray' && '⚪ Gray'}
                      </span>
                    </td>
                    <td>{row.actual || '--'}</td>
                    <td>{row.forecast || '--'}</td>
                    <td>{row.previous || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-container animate-fade-in">
      <div className="view-header">
        <h2 className="view-title">Learn News Events</h2>
        <p className="view-subtitle">A unique catalog of all economic events recorded in the database</p>
      </div>

      {/* Filter Card */}
      <div className="filter-card">
        <div className="filter-header" style={{ marginBottom: '16px' }}>
          <div className="flex-center gap-sm">
            <Filter size={18} className="icon-accent" />
            <h3>Search & Filters</h3>
          </div>
          <button type="button" className="btn-link" onClick={() => setFilterColor('')}>
            Reset
          </button>
        </div>

        <div className="filter-grid" style={{ gridTemplateColumns: '1fr' }}>
          {/* Folder Color Filter */}
          <div className="form-group" style={{ maxWidth: '300px' }}>
            <label>Folder Color</label>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
            >
              <option value="">All Colors</option>
              <option value="Red">🔴 Red (High Impact)</option>
              <option value="Orange">🟠 Orange (Medium Impact)</option>
              <option value="Yellow">🟡 Yellow (Low Impact)</option>
              <option value="Gray">⚪ Gray (No Impact)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Events Table */}
      {loading ? (
        <div className="table-loading-container">
          <div className="loading-spinner"></div>
          <span>Loading unique events...</span>
        </div>
      ) : error ? (
        <div className="status-banner error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="empty-state-card">
          <p className="empty-title">No unique events found</p>
          <p className="empty-sub">Check your database or adjust filters.</p>
        </div>
      ) : (
        <>
          <div className="export-toolbar animate-fade-in" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="results-count">Showing <strong>{filteredEvents.length}</strong> unique events</span>
            <button className="btn-secondary sm" onClick={exportUniqueEventsCSV}>
              Export CSV
            </button>
          </div>
          <div className="table-card table-viewer-card animate-fade-in">
            <div className="table-responsive">
              <table className="editable-table db-view-table">
              <thead>
                <tr>
                  <th width="80">Sr No</th>
                  <th>Name of News</th>
                  <th width="150">Impact</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((row, index) => (
                  <tr key={index} onClick={() => setSelectedNews(row.news_name)} style={{ cursor: 'pointer' }}>
                    {/* Dynamic Serial Number */}
                    <td>{index + 1}</td>

                    {/* News Name */}
                    <td className="bold-text" style={{ color: 'var(--color-text-primary)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>{row.news_name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'normal' }}>
                          This news happened {row.count} times {dateRangeStr}
                        </span>
                      </div>
                    </td>

                    {/* Folder Color / Impact */}
                    <td>
                      <span className={`impact-badge folder-${row.folder_color.toLowerCase()}`}>
                        {row.folder_color === 'Red' && '🔴 High'}
                        {row.folder_color === 'Orange' && '🟠 Medium'}
                        {row.folder_color === 'Yellow' && '🟡 Low'}
                        {row.folder_color === 'Gray' && '⚪ Gray'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
