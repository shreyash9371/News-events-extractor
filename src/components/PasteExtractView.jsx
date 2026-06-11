import React, { useState, useEffect, useRef } from 'react';
import { parseScreenshotLocally } from '../localOcrParser';
import { getSupabaseClient, getSupabaseConfig } from '../supabaseClient';
import { 
  Clipboard, 
  Trash2, 
  Plus, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle,
  UploadCloud,
  Send,
  X,
  RefreshCw
} from 'lucide-react';

export default function PasteExtractView({ activeTab, onDataSaved }) {
  const [pastedImage, setPastedImage] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [importYear, setImportYear] = useState('2023');
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({ type: '', message: '' });

  const fileInputRef = useRef(null);

  // Helper to parse Forex Factory date string (e.g. "Sunday, Jun 1" -> "2023-06-01")
  const parseForexFactoryDate = (dateStr, year = importYear) => {
    if (!dateStr) return '';
    const cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*/i, '');
    const parts = cleaned.split(/\s+/);
    if (parts.length < 2) return '';
    
    const monthName = parts[0].substring(0, 3).toLowerCase();
    const dayNum = parseInt(parts[1]);
    if (isNaN(dayNum)) return '';

    const monthsMap = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };

    const monthVal = monthsMap[monthName];
    if (!monthVal) return '';

    const formattedDay = dayNum.toString().padStart(2, '0');
    return `${year}-${monthVal}-${formattedDay}`;
  };

  // Helper to parse pasted Forex Factory HTML calendar content
  const parseForexFactoryHTML = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Select rows
      const rows = doc.querySelectorAll('.calendar__row, tr[class*="calendar__row"]');
      if (rows.length === 0) {
        throw new Error('No calendar rows found in the pasted content. Make sure to highlight and copy rows from the Forex Factory Calendar page.');
      }

      let currentDate = '';
      let currentTime = '';
      const parsedEvents = [];

      rows.forEach((row, idx) => {
        // Skip spacer rows
        if (row.classList.contains('calendar__row--spacer') || row.classList.contains('calendar__row--day-breaker')) {
          return;
        }

        // 1. Date
        const dateCell = row.querySelector('.calendar__date');
        if (dateCell) {
          const dateText = dateCell.textContent.trim();
          if (dateText) {
            currentDate = parseForexFactoryDate(dateText);
          }
        }

        // 2. Time
        const timeCell = row.querySelector('.calendar__time');
        if (timeCell) {
          const timeText = timeCell.textContent.trim();
          if (timeText) {
            currentTime = timeText;
          }
        }

        // 3. Currency
        const currencyCell = row.querySelector('.calendar__currency');
        const currency = currencyCell ? currencyCell.textContent.trim().toUpperCase() : '';

        // Skip rows that have no currency (e.g. general day spacer rows)
        if (!currency) return;

        // 4. Impact (Folder Color)
        const impactCell = row.querySelector('.calendar__impact');
        let folderColor = 'Gray';
        if (impactCell) {
          const span = impactCell.querySelector('span, div, i');
          if (span) {
            const title = (span.getAttribute('title') || '').toLowerCase();
            const className = (span.getAttribute('class') || '').toLowerCase();
            
            if (title.includes('high') || className.includes('high') || className.includes('red') || className.includes('icon--impact-red')) {
              folderColor = 'Red';
            } else if (title.includes('medium') || className.includes('medium') || className.includes('orange') || className.includes('icon--impact-orange')) {
              folderColor = 'Orange';
            } else if (title.includes('low') || className.includes('low') || className.includes('yellow') || className.includes('icon--impact-yellow')) {
              folderColor = 'Yellow';
            } else if (title.includes('non') || className.includes('gray') || className.includes('grey') || className.includes('icon--impact-gray')) {
              folderColor = 'Gray';
            }
          }
        }

        // 5. News Name
        const eventCell = row.querySelector('.calendar__event');
        let newsName = '';
        if (eventCell) {
          const titleSpan = eventCell.querySelector('.calendar__event-title, span');
          newsName = titleSpan ? titleSpan.textContent.trim() : eventCell.textContent.trim();
        }

        // 6. Actual, Forecast, Previous
        const actualCell = row.querySelector('.calendar__actual');
        const actual = actualCell ? actualCell.textContent.trim() : '';

        const forecastCell = row.querySelector('.calendar__forecast');
        const forecast = forecastCell ? forecastCell.textContent.trim() : '';

        const previousCell = row.querySelector('.calendar__previous');
        const previous = previousCell ? previousCell.textContent.trim() : '';

        parsedEvents.push({
          id: Date.now() + idx + Math.random(),
          sr_num: parsedEvents.length + 1,
          news_date: currentDate || startDate || `${importYear}-01-01`,
          news_time: currentTime || 'All Day',
          currency,
          folder_color: folderColor,
          news_name: newsName || 'Economic Event',
          actual,
          forecast,
          previous
        });
      });

      if (parsedEvents.length === 0) {
        throw new Error('No calendar events could be parsed. Make sure you select the rows properly.');
      }

      // Autofill session dates
      const dates = parsedEvents.map(e => e.news_date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (dates.length > 0) {
        dates.sort();
        setStartDate(dates[0]);
        setEndDate(dates[dates.length - 1]);
      }

      setEvents(parsedEvents);
      setPastedImage(null); // Clear image if we parse raw table data
      setStatus({
        type: 'success',
        message: `Successfully parsed ${parsedEvents.length} events from copied website elements (AI-Free Mode)!`
      });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to parse clipboard HTML: ' + err.message });
    }
  };

  // Helper to parse pasted Forex Factory Plain Text calendar content
  const parseForexFactoryText = (textContent) => {
    try {
      const lines = textContent.split(/\r?\n/);
      let currentDate = '';
      let currentTime = '';
      const parsedEvents = [];

      lines.forEach((line, idx) => {
        const cols = line.split('\t');
        if (cols.length < 4) return; // Skip non-calendar lines

        // Date check: Mon Jun 1 or Sunday, Jun 1
        const col0 = cols[0].trim();
        if (col0 && (col0.includes('Jan') || col0.includes('Feb') || col0.includes('Mar') || col0.includes('Apr') || col0.includes('May') || col0.includes('Jun') || col0.includes('Jul') || col0.includes('Aug') || col0.includes('Sep') || col0.includes('Oct') || col0.includes('Nov') || col0.includes('Dec'))) {
          currentDate = parseForexFactoryDate(col0);
        }

        // Time check: e.g. "2:00am" or "All Day"
        const col1 = cols[1].trim();
        if (col1) {
          currentTime = col1;
        }

        // Currency check: USD, EUR, etc.
        const currency = cols[2].trim().toUpperCase();
        if (!currency || currency.length > 4) return;

        // Guess Impact (Folder Color) from line strings
        let folderColor = 'Gray';
        const rowLower = line.toLowerCase();
        if (rowLower.includes('high')) folderColor = 'Red';
        else if (rowLower.includes('medium')) folderColor = 'Orange';
        else if (rowLower.includes('low')) folderColor = 'Yellow';

        // News title
        const newsName = cols[3].trim() || 'Economic Event';

        // Figures: actual, forecast, previous
        let actual = '';
        let forecast = '';
        let previous = '';

        if (cols.length >= 7) {
          previous = cols[cols.length - 1] || '';
          forecast = cols[cols.length - 2] || '';
          actual = cols[cols.length - 3] || '';
        }

        parsedEvents.push({
          id: Date.now() + idx + Math.random(),
          sr_num: parsedEvents.length + 1,
          news_date: currentDate || startDate || `${importYear}-01-01`,
          news_time: currentTime || 'All Day',
          currency,
          folder_color: folderColor,
          news_name: newsName,
          actual,
          forecast,
          previous
        });
      });

      if (parsedEvents.length === 0) {
        throw new Error('No calendar events could be parsed from the text.');
      }

      // Autofill session dates
      const dates = parsedEvents.map(e => e.news_date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      if (dates.length > 0) {
        dates.sort();
        setStartDate(dates[0]);
        setEndDate(dates[dates.length - 1]);
      }

      setEvents(parsedEvents);
      setPastedImage(null); // Clear image if we parse raw table data
      setStatus({
        type: 'success',
        message: `Successfully parsed ${parsedEvents.length} events from copied plain text (AI-Free Mode)!`
      });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to parse clipboard text: ' + err.message });
    }
  };

  // Setup global clipboard paste listener
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      if (activeTab !== 'extract') return;

      // 1. Prioritize HTML Table parsing (Forex Factory copied content contains rich elements)
      const html = e.clipboardData?.getData('text/html');
      if (html && (html.includes('calendar__row') || html.includes('calendar__table') || html.includes('calendar_row'))) {
        e.preventDefault();
        parseForexFactoryHTML(html);
        return;
      }

      // 2. Tabular text parsing
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.includes('\t') && (text.includes('USD') || text.includes('EUR') || text.includes('GBP') || text.includes('JPY') || text.includes('AUD'))) {
        e.preventDefault();
        parseForexFactoryText(text);
        return;
      }

      // 3. Fallback to image paste
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          loadImage(file);
          setStatus({ type: 'success', message: 'Image pasted! Click "Extract Table" to run local OCR.' });
          setTimeout(() => setStatus({ type: '', message: '' }), 2000);
          break;
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeTab, importYear]);

  const loadImage = (file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      setPastedImage(event.target.result); // Base64 data URL
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) loadImage(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      loadImage(file);
    }
  };

  const clearImage = () => {
    setPastedImage(null);
    setEvents([]);
  };

  // Convert Base64 Data URL to Blob for Supabase Upload
  const base64ToBlob = (base64, mimeType) => {
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  const handleExtract = async () => {
    if (!pastedImage) {
      setStatus({ type: 'error', message: 'Please paste or upload an image first.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'Initializing Tesseract OCR worker...' });
    setEvents([]);

    try {
      const parsedRows = await parseScreenshotLocally(
        pastedImage,
        importYear,
        (progressMsg) => setStatus({ type: 'info', message: progressMsg })
      );
      
      // Enforce default values
      const validatedRows = parsedRows.map((row, idx) => ({
        id: Date.now() + idx + Math.random(), // unique React key
        sr_num: row.sr_num || (idx + 1),
        news_date: row.news_date,
        news_time: row.news_time || '00:00',
        currency: (row.currency || 'USD').toUpperCase(),
        folder_color: row.folder_color || 'Gray',
        news_name: row.news_name || 'Economic Event',
        actual: row.actual || '',
        forecast: row.forecast || '',
        previous: row.previous || ''
      }));

      // Automatically deduce session start/end dates from parsed rows
      const extractedDates = validatedRows
        .map(row => row.news_date)
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
      
      let dateDeductionMsg = '';
      if (extractedDates.length > 0) {
        extractedDates.sort();
        const minDate = extractedDates[0];
        const maxDate = extractedDates[extractedDates.length - 1];
        setStartDate(minDate);
        setEndDate(maxDate);
        dateDeductionMsg = ` Session dates deduced: ${minDate} to ${maxDate}.`;
      }

      setEvents(validatedRows);
      setStatus({ 
        type: 'success', 
        message: `Successfully extracted ${validatedRows.length} events locally!${dateDeductionMsg}` 
      });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: err.message || 'Extraction failed. Make sure your image is a clear Forex Factory calendar table.' });
    } finally {
      setLoading(false);
    }
  };

  // Table Edit Helpers
  const handleCellChange = (id, field, value) => {
    setEvents(prev => prev.map(row => {
      if (row.id === id) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleDeleteRow = (id) => {
    setEvents(prev => prev.filter(row => row.id !== id));
  };

  const handleAddRow = () => {
    const newRow = {
      id: Date.now(),
      sr_num: events.length + 1,
      news_date: startDate || new Date().toISOString().split('T')[0],
      news_time: '12:00',
      currency: 'USD',
      folder_color: 'Gray',
      news_name: 'New Event',
      actual: '',
      forecast: '',
      previous: ''
    };
    setEvents(prev => [...prev, newRow]);
  };

  // Save Session & Events to Supabase
  const handleSendToDatabase = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus({ type: 'error', message: 'Supabase is not configured. Go to Settings.' });
      return;
    }
    if (!startDate || !endDate) {
      setStatus({ type: 'error', message: 'Start Date and End Date are required.' });
      return;
    }
    if (events.length === 0) {
      setStatus({ type: 'error', message: 'No events to save. Extract or add rows first.' });
      return;
    }

    setSaveLoading(true);
    setStatus({ type: 'info', message: 'Saving session and uploading screenshot...' });

    try {
      const config = getSupabaseConfig();
      let imageUrl = null;

      // 1. Upload Screenshot to Storage Bucket
      if (pastedImage) {
        const bucketName = config.bucketName || 'calendar-images';
        const fileExt = 'png';
        const fileName = `session_${Date.now()}.${fileExt}`;
        const blob = base64ToBlob(pastedImage, 'image/png');

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, blob, { contentType: 'image/png' });

        if (uploadError) {
          console.warn('Storage upload error (continuing without image):', uploadError);
        } else {
          // Get Public URL
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);
          imageUrl = urlData.publicUrl;
        }
      }

      // 2. Save Import Session
      const { data: sessionData, error: sessionError } = await supabase
        .from('import_sessions')
        .insert([{
          start_date: startDate,
          end_date: endDate,
          image_url: imageUrl
        }])
        .select()
        .single();

      if (sessionError) throw sessionError;

      const sessionId = sessionData.id;

      // 3. Save Calendar Events
      const dbEvents = events.map(row => ({
        session_id: sessionId,
        sr_num: parseInt(row.sr_num) || 1,
        news_date: row.news_date,
        news_time: row.news_time,
        currency: row.currency,
        folder_color: row.folder_color,
        news_name: row.news_name,
        actual: row.actual,
        forecast: row.forecast,
        previous: row.previous
      }));

      const { error: eventsError } = await supabase
        .from('calendar_events')
        .insert(dbEvents);

      if (eventsError) {
        // Attempt clean up of session if event insert fails
        await supabase.from('import_sessions').delete().eq('id', sessionId);
        throw eventsError;
      }

      setStatus({ type: 'success', message: 'Session data successfully sent to Supabase!' });
      clearImage();
      if (onDataSaved) onDataSaved();
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Failed to save database entries: ' + err.message });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="view-container animate-fade-in">
      <div className="view-header">
        <h2 className="view-title">Paste & Extract Calendar</h2>
        <p className="view-subtitle">Copy/paste website table rows directly, or upload screenshots to extract using AI</p>
      </div>

      {/* Inputs for Date Context */}
      <div className="meta-card">
        <h3>1. Set Session Metadata</h3>
        <p className="meta-description">
          Select the year of the calendar you are copying to automatically format dates. Start and end dates are deduced from the data.
        </p>
        <div className="date-inputs-row">
          <div className="form-group inline" style={{ flex: '0.5', minWidth: '120px' }}>
            <label htmlFor="import-year">Context Year</label>
            <select
              id="import-year"
              value={importYear}
              onChange={(e) => {
                const newYear = e.target.value;
                setImportYear(newYear);
                // Dynamically update existing event rows dates with the new year!
                setEvents(prev => prev.map(row => {
                  const cleanedDate = row.news_date.replace(/^\d{4}/, newYear);
                  return { ...row, news_date: cleanedDate };
                }));
                // Update start/end dates
                setStartDate(prev => prev ? prev.replace(/^\d{4}/, newYear) : '');
                setEndDate(prev => prev ? prev.replace(/^\d{4}/, newYear) : '');
              }}
            >
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
          <div className="form-group inline">
            <label htmlFor="start-date">Start Date</label>
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group inline">
            <label htmlFor="end-date">End Date</label>
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      {/* Paste / Dropzone Area */}
      <div className="paste-wrapper">
        {!pastedImage && events.length === 0 ? (
          <div 
            className="paste-dropzone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current.click()}
          >
            <UploadCloud size={48} className="dropzone-icon" />
            <p className="dropzone-title">Press <strong>Ctrl + V</strong> to Paste copied calendar rows or a Screenshot</p>
            <p className="dropzone-sub" style={{ maxWidth: '600px', margin: '8px auto', lineHeight: '1.4' }}>
              💡 <strong>AI-Free Mode:</strong> Select & copy table rows directly from the <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noreferrer" className="link-btn" onClick={(e) => e.stopPropagation()}>Forex Factory Calendar</a>, click this window, and press <strong>Ctrl+V</strong>. It parses instantly with 100% accuracy and zero AI costs!
            </p>
            <p className="dropzone-sub">Or click to browse a screenshot image file (uses local Tesseract OCR — no AI or internet required)</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>
        ) : pastedImage ? (
          <div className="preview-container">
            <div className="preview-header-bar">
              <span className="preview-filename">Captured Screenshot Preview</span>
              <button className="btn-icon-danger" onClick={clearImage}>
                <X size={16} /> Clear Image
              </button>
            </div>
            <div className="preview-scrollable">
              <img src={pastedImage} alt="Calendar screenshot preview" />
            </div>
          </div>
        ) : (
          /* Table exists but no image (AI-free text paste success) */
          <div className="preview-container" style={{ padding: '20px 24px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>✓</span>
              <div>
                <p style={{ color: '#16a34a', fontWeight: '600', fontSize: '14.5px' }}>
                  Direct website data parsed successfully from clipboard!
                </p>
                <p style={{ color: '#475569', fontSize: '12.5px', marginTop: '2px' }}>
                  The data is rendered in the editable grid below. You can modify cells or click "Send to Database" to store it.
                </p>
              </div>
              <button onClick={clearImage} className="btn-icon-danger" style={{ marginLeft: 'auto' }}>
                <X size={14} /> Clear Data
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Chat-like Control Bar */}
      <div className="action-control-bar">
        <div className="action-left">
          {pastedImage && (
            <div className="action-thumb">
              <img src={pastedImage} alt="thumbnail" />
              <div className="thumb-indicator">✓</div>
            </div>
          )}
          <span className="action-status">
            {pastedImage 
              ? 'Screenshot loaded. Click "Extract Table" to run local OCR.' 
              : events.length > 0 
                ? 'Website data parsed successfully.' 
                : 'Waiting for clipboard paste (table rows or screenshot) or file upload...'}
          </span>
        </div>

        <div className="action-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleExtract}
            disabled={loading || !pastedImage}
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="spinner" /> Extracting...
              </>
            ) : (
              <>
                <Sparkles size={16} /> Extract Table
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {status.message && (
        <div className={`status-banner ${status.type}`}>
          {status.type === 'success' && <CheckCircle size={18} />}
          {status.type === 'error' && <AlertTriangle size={18} />}
          <span>{status.message}</span>
        </div>
      )}

      {/* Extracted Editable Grid */}
      {events.length > 0 && (
        <div className="table-card animate-fade-in">
          <div className="table-card-header">
            <h3>2. Review and Modify Extracted Rows</h3>
            <button type="button" className="btn-secondary sm" onClick={handleAddRow}>
              <Plus size={14} /> Add Row
            </button>
          </div>

          <div className="table-responsive">
            <table className="editable-table">
              <thead>
                <tr>
                  <th width="60">Sr No</th>
                  <th width="120">Date</th>
                  <th width="80">Time</th>
                  <th width="80">Currency</th>
                  <th width="120">Impact</th>
                  <th>Name of News</th>
                  <th width="100">Actual</th>
                  <th width="100">Forecast</th>
                  <th width="100">Previous</th>
                  <th width="60">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="number"
                        className="table-input"
                        value={row.sr_num}
                        onChange={(e) => handleCellChange(row.id, 'sr_num', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="table-input"
                        value={row.news_date}
                        onChange={(e) => handleCellChange(row.id, 'news_date', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input"
                        value={row.news_time}
                        onChange={(e) => handleCellChange(row.id, 'news_time', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input uppercase"
                        value={row.currency}
                        onChange={(e) => handleCellChange(row.id, 'currency', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className={`table-select folder-${row.folder_color.toLowerCase()}`}
                        value={row.folder_color}
                        onChange={(e) => handleCellChange(row.id, 'folder_color', e.target.value)}
                      >
                        <option value="Red">🔴 Red (High)</option>
                        <option value="Orange">🟠 Orange (Medium)</option>
                        <option value="Yellow">🟡 Yellow (Low)</option>
                        <option value="Gray">⚪ Gray (None)</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input bold-text"
                        value={row.news_name}
                        onChange={(e) => handleCellChange(row.id, 'news_name', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input text-right"
                        value={row.actual}
                        placeholder="--"
                        onChange={(e) => handleCellChange(row.id, 'actual', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input text-right"
                        value={row.forecast}
                        placeholder="--"
                        onChange={(e) => handleCellChange(row.id, 'forecast', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="table-input text-right"
                        value={row.previous}
                        placeholder="--"
                        onChange={(e) => handleCellChange(row.id, 'previous', e.target.value)}
                      />
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="btn-table-action delete"
                        onClick={() => handleDeleteRow(row.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-footer-actions">
            <button
              type="button"
              className="btn-primary flex-center"
              onClick={handleSendToDatabase}
              disabled={saveLoading}
            >
              {saveLoading ? (
                <>
                  <RefreshCw size={16} className="spinner" /> Sending to Supabase...
                </>
              ) : (
                <>
                  <Send size={16} /> Send to Database
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
