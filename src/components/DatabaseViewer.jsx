import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { 
  Search, 
  Trash2, 
  Download, 
  Edit3, 
  Save, 
  X, 
  AlertCircle,
  FileSpreadsheet,
  FileJson,
  Filter
} from 'lucide-react';

export default function DatabaseViewer({ refreshTrigger, onDataChanged }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 1000;

  // Filter States
  const [searchName, setSearchName] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterColor, setFilterColor] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Editing States
  const [editingId, setEditingId] = useState(null);
  const [editRowData, setEditRowData] = useState(null);

  // Available filters values for selects (populating dynamically in useEffect)
  const [currenciesList, setCurrenciesList] = useState([]);

  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured. Go to Settings.');
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
        let query = supabase
          .from('calendar_events')
          .select(`
            id,
            session_id,
            news_date,
            news_time,
            currency,
            folder_color,
            news_name,
            actual,
            forecast,
            previous,
            import_sessions (
              start_date,
              end_date
            )
          `);

        if (searchName) query = query.ilike('news_name', `%${searchName}%`);
        if (filterCurrency) query = query.eq('currency', filterCurrency);
        if (filterColor) query = query.eq('folder_color', filterColor);
        if (startDate) query = query.gte('news_date', startDate);
        if (endDate) query = query.lte('news_date', endDate);

        // Order chronologically and paginate
        query = query.order('news_date', { ascending: true })
                     .order('news_time', { ascending: true })
                     .range(start, start + CHUNK_SIZE - 1);

        const { data, error: fetchErr } = await query;
        if (fetchErr) throw fetchErr;

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          lastFetched = data.length;
          start += CHUNK_SIZE;
        } else {
          lastFetched = 0;
        }
      }

      setEvents(allData);

      // Pull unique currencies for the filter dropdown if not set
      if (allData && currenciesList.length === 0) {
        const uniqCurs = [...new Set(allData.map(item => item.currency.toUpperCase()))]
          .filter(Boolean)
          .sort();
        setCurrenciesList(uniqCurs);
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      setError(err.message || 'Failed to fetch calendar events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [refreshTrigger, searchName, filterCurrency, filterColor, startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchName, filterCurrency, filterColor, startDate, endDate]);

  const handleEditClick = (row) => {
    setEditingId(row.id);
    setEditRowData({ ...row });
  };

  const handleEditChange = (field, value) => {
    setEditRowData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveClick = async (id) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error: updateErr } = await supabase
        .from('calendar_events')
        .update({
          news_date: editRowData.news_date,
          news_time: editRowData.news_time,
          currency: editRowData.currency.toUpperCase(),
          folder_color: editRowData.folder_color,
          news_name: editRowData.news_name,
          actual: editRowData.actual,
          forecast: editRowData.forecast,
          previous: editRowData.previous
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      setEditingId(null);
      setEditRowData(null);
      fetchEvents();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error updating row: ' + err.message);
    }
  };

  const handleDeleteClick = async (id) => {
    if (!window.confirm('Are you sure you want to delete this event from the database?')) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { error: deleteErr } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (deleteErr) throw deleteErr;

      fetchEvents();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error deleting row: ' + err.message);
    }
  };

  const handleResetFilters = () => {
    setSearchName('');
    setFilterCurrency('');
    setFilterColor('');
    setStartDate('');
    setEndDate('');
  };

  // Export Filtered Data to CSV
  const exportToCSV = () => {
    if (events.length === 0) return;

    const headers = [
      'Sr No',
      'Date of News',
      'Time of News',
      'Currency Tag',
      'Folder Color',
      'Name of News',
      'Actual',
      'Forecast',
      'Previous'
    ];

    const csvRows = [
      headers.join(','),
      ...events.map((row, index) => [
        index + 1,
        row.news_date,
        row.news_time,
        `"${row.currency}"`,
        `"${row.folder_color}"`,
        `"${row.news_name.replace(/"/g, '""')}"`,
        `"${(row.actual || '').replace(/"/g, '""')}"`,
        `"${(row.forecast || '').replace(/"/g, '""')}"`,
        `"${(row.previous || '').replace(/"/g, '""')}"`
      ].join(','))
    ];

    const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(csvBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `calendar_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Filtered Data to JSON
  const exportToJSON = () => {
    if (events.length === 0) return;

    const mappedEvents = events.map((row, index) => {
      const { id, session_id, import_sessions, ...rest } = row;
      return { sr_no: index + 1, ...rest };
    });

    const jsonString = JSON.stringify(mappedEvents, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(jsonBlob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `calendar_export_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="view-container animate-fade-in">
      <div className="view-header">
        <h2 className="view-title">News Events</h2>
        <p className="view-subtitle">Search, filter, and edit economic events stored in Supabase</p>
      </div>

      {/* Filter Card */}
      <div className="filter-card">
        <div className="filter-header">
          <div className="flex-center gap-sm">
            <Filter size={18} className="icon-accent" />
            <h3>Search & Filters</h3>
          </div>
          <button type="button" className="btn-link" onClick={handleResetFilters}>
            Reset All
          </button>
        </div>

        <div className="filter-grid">
          {/* Text Search */}
          <div className="form-group">
            <label>Event Name</label>
            <div className="input-search-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search CPI, GDP, FOMC..."
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
          </div>

          {/* Currency Filter */}
          <div className="form-group">
            <label>Currency</label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
            >
              <option value="">All Currencies</option>
              {currenciesList.map(cur => (
                <option key={cur} value={cur}>{cur}</option>
              ))}
            </select>
          </div>

          {/* Folder Color Filter */}
          <div className="form-group">
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

          {/* Date Picker Start */}
          <div className="form-group">
            <label>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Date Picker End */}
          <div className="form-group">
            <label>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Export Toolbar */}
      {events.length > 0 && (
        <div className="export-toolbar animate-fade-in">
          <span className="results-count">Showing <strong>{events.length}</strong> event entries</span>
          <div className="export-buttons">
            <button className="btn-secondary sm" onClick={exportToCSV}>
              <FileSpreadsheet size={14} /> Export CSV
            </button>
            <button className="btn-secondary sm" onClick={exportToJSON}>
              <FileJson size={14} /> Export JSON
            </button>
          </div>
        </div>
      )}

      {/* Main Events Table */}
      {loading ? (
        <div className="table-loading-container">
          <div className="loading-spinner"></div>
          <span>Loading calendar records...</span>
        </div>
      ) : error ? (
        <div className="status-banner error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state-card">
          <p className="empty-title">No events matched your criteria</p>
          <p className="empty-sub">Try adjusting your filters or importing new screenshots in Paste & Extract.</p>
        </div>
      ) : (
        <div className="table-card table-viewer-card animate-fade-in">
          <div className="table-responsive">
            <table className="editable-table db-view-table">
              <thead>
                <tr>
                  <th width="60">Sr No</th>
                  <th width="120">Date</th>
                  <th width="85">Time</th>
                  <th width="85">Currency</th>
                  <th width="130">Impact</th>
                  <th>Name of News</th>
                  <th width="100">Actual</th>
                  <th width="100">Forecast</th>
                  <th width="100">Previous</th>
                </tr>
              </thead>
              <tbody>
                {events.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((row, index) => {
                  const isEditing = editingId === row.id;
                  const displayRow = isEditing ? editRowData : row;
                  const displaySrNo = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;

                  return (
                    <tr key={row.id} className={isEditing ? 'row-editing' : ''}>
                      {/* Sr No */}
                      <td>{displaySrNo}</td>

                      {/* Date */}
                      <td>
                        {isEditing ? (
                          <input
                            type="date"
                            className="table-input"
                            value={displayRow.news_date}
                            onChange={(e) => handleEditChange('news_date', e.target.value)}
                          />
                        ) : (
                          row.news_date
                        )}
                      </td>

                      {/* Time */}
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input"
                            value={displayRow.news_time}
                            onChange={(e) => handleEditChange('news_time', e.target.value)}
                          />
                        ) : (
                          row.news_time
                        )}
                      </td>

                      {/* Currency */}
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input uppercase"
                            value={displayRow.currency}
                            onChange={(e) => handleEditChange('currency', e.target.value)}
                          />
                        ) : (
                          <span className="currency-badge">{row.currency}</span>
                        )}
                      </td>

                      {/* Folder Color / Impact */}
                      <td>
                        {isEditing ? (
                          <select
                            className={`table-select folder-${displayRow.folder_color.toLowerCase()}`}
                            value={displayRow.folder_color}
                            onChange={(e) => handleEditChange('folder_color', e.target.value)}
                          >
                            <option value="Red">🔴 Red (High)</option>
                            <option value="Orange">🟠 Orange (Medium)</option>
                            <option value="Yellow">🟡 Yellow (Low)</option>
                            <option value="Gray">⚪ Gray (None)</option>
                          </select>
                        ) : (
                          <span className={`impact-badge folder-${row.folder_color.toLowerCase()}`}>
                            {row.folder_color === 'Red' && '🔴 High'}
                            {row.folder_color === 'Orange' && '🟠 Medium'}
                            {row.folder_color === 'Yellow' && '🟡 Low'}
                            {row.folder_color === 'Gray' && '⚪ Gray'}
                          </span>
                        )}
                      </td>

                      {/* News Name */}
                      <td className="news-name-cell">
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input bold-text"
                            value={displayRow.news_name}
                            onChange={(e) => handleEditChange('news_name', e.target.value)}
                          />
                        ) : (
                          row.news_name
                        )}
                      </td>

                      {/* Actual */}
                      <td className="text-right">
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input text-right"
                            value={displayRow.actual}
                            onChange={(e) => handleEditChange('actual', e.target.value)}
                          />
                        ) : (
                          row.actual || '--'
                        )}
                      </td>

                      {/* Forecast */}
                      <td className="text-right">
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input text-right"
                            value={displayRow.forecast}
                            onChange={(e) => handleEditChange('forecast', e.target.value)}
                          />
                        ) : (
                          row.forecast || '--'
                        )}
                      </td>

                      {/* Previous */}
                      <td className="text-right">
                        {isEditing ? (
                          <input
                            type="text"
                            className="table-input text-right"
                            value={displayRow.previous}
                            onChange={(e) => handleEditChange('previous', e.target.value)}
                          />
                        ) : (
                          row.previous || '--'
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Math.ceil(events.length / ITEMS_PER_PAGE) > 1 && (
            <div className="pagination" style={{ display: 'flex', gap: '8px', padding: '16px', justifyContent: 'center' }}>
              {Array.from({ length: Math.ceil(events.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={`btn-secondary sm ${currentPage === page ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                  style={{ 
                    minWidth: '32px', 
                    backgroundColor: currentPage === page ? '#0d9488' : '', 
                    color: currentPage === page ? '#ffffff' : '',
                    borderColor: currentPage === page ? '#0d9488' : ''
                  }}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
