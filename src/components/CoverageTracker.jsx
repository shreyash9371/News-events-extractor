import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Calendar, AlertCircle, Award, CheckCircle2 } from 'lucide-react';

export default function CoverageTracker({ refreshTrigger }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const targetYears = [2023, 2024, 2025, 2026];
  const months = [
    { name: 'Jan', num: 0 },
    { name: 'Feb', num: 1 },
    { name: 'Mar', num: 2 },
    { name: 'Apr', num: 3 },
    { name: 'May', num: 4 },
    { name: 'Jun', num: 5 },
    { name: 'Jul', num: 6 },
    { name: 'Aug', num: 7 },
    { name: 'Sep', num: 8 },
    { name: 'Oct', num: 9 },
    { name: 'Nov', num: 10 },
    { name: 'Dec', num: 11 },
  ];

  useEffect(() => {
    async function fetchSessions() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Supabase is not configured. Go to Settings.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('import_sessions')
          .select('*')
          .order('start_date', { ascending: true });

        if (error) throw error;
        setSessions(data || []);
      } catch (err) {
        console.error('Error fetching sessions:', err);
        setError(err.message || 'Failed to fetch sessions.');
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [refreshTrigger]);

  // Check if a specific half-month overlaps with any session
  const getCoveringSessions = (year, monthIndex, half) => {
    const startDay = half === 1 ? 1 : 16;
    const endDay = half === 1 ? 15 : new Date(year, monthIndex + 1, 0).getDate();
    
    const blockStart = new Date(year, monthIndex, startDay);
    const blockEnd = new Date(year, monthIndex, endDay);

    return sessions.filter(session => {
      const sessionStart = new Date(session.start_date);
      const sessionEnd = new Date(session.end_date);
      return sessionStart <= blockEnd && sessionEnd >= blockStart;
    });
  };

  // Calculate percentage coverage for a year
  const calculateYearCoverage = (year) => {
    let coveredBlocks = 0;
    const totalBlocks = 24; // 12 months * 2 halves

    for (let m = 0; m < 12; m++) {
      for (let h = 1; h <= 2; h++) {
        const matching = getCoveringSessions(year, m, h);
        if (matching.length > 0) coveredBlocks++;
      }
    }

    return Math.round((coveredBlocks / totalBlocks) * 100);
  };

  const calculateTotalCoverage = () => {
    if (sessions.length === 0) return 0;
    let totalCovered = 0;
    const totalBlocks = 24 * targetYears.length;

    targetYears.forEach(year => {
      for (let m = 0; m < 12; m++) {
        for (let h = 1; h <= 2; h++) {
          const matching = getCoveringSessions(year, m, h);
          if (matching.length > 0) totalCovered++;
        }
      }
    });

    return Math.round((totalCovered / totalBlocks) * 100);
  };

  if (loading) {
    return (
      <div className="view-container flex-center">
        <div className="loading-spinner-large"></div>
        <p className="loading-text">Analyzing database coverage...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-container">
        <div className="status-banner error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  const totalCoveragePercent = calculateTotalCoverage();

  return (
    <div className="view-container animate-fade-in">
      <div className="view-header">
        <h2 className="view-title">Calendar Coverage Tracker</h2>
        <p className="view-subtitle">Monitor data gaps across target years 2023, 2024, 2025, and 2026</p>
      </div>

      {/* Global Progress Dashboard */}
      <div className="progress-summary-card">
        <div className="progress-gauge-container">
          <div className="progress-gauge-label">
            <span className="gauge-value">{totalCoveragePercent}%</span>
            <span className="gauge-text">Total Covered</span>
          </div>
          <div className="progress-gauge-bar-outer">
            <div 
              className="progress-gauge-bar-inner" 
              style={{ width: `${totalCoveragePercent}%` }}
            ></div>
          </div>
        </div>

        <div className="progress-stats">
          <div className="stat-box">
            <div className="stat-num">{sessions.length}</div>
            <div className="stat-label">Import Sessions</div>
          </div>
          <div className="stat-box">
            <div className="stat-num">
              {targetYears.filter(y => calculateYearCoverage(y) === 100).length} / {targetYears.length}
            </div>
            <div className="stat-label">Years Completed</div>
          </div>
          <div className="stat-box">
            {totalCoveragePercent === 100 ? (
              <div className="stat-badge-complete success">
                <CheckCircle2 size={16} /> Fully Collected
              </div>
            ) : (
              <div className="stat-badge-complete info">
                <Calendar size={16} /> Data Collection Active
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="timeline-grid">
        {targetYears.map(year => {
          const yearPercent = calculateYearCoverage(year);
          return (
            <div key={year} className="year-card">
              <div className="year-card-header">
                <h3 className="year-title">{year} Calendar</h3>
                <span className={`year-badge ${yearPercent === 100 ? 'complete' : ''}`}>
                  {yearPercent}% Covered
                </span>
              </div>
              <div className="year-progress-bar">
                <div 
                  className="year-progress-fill" 
                  style={{ width: `${yearPercent}%` }}
                ></div>
              </div>

              <div className="year-months-grid">
                {months.map(month => {
                  const firstHalfSessions = getCoveringSessions(year, month.num, 1);
                  const secondHalfSessions = getCoveringSessions(year, month.num, 2);

                  const isFirstHalfCovered = firstHalfSessions.length > 0;
                  const isSecondHalfCovered = secondHalfSessions.length > 0;

                  return (
                    <div key={month.name} className="month-row">
                      <span className="month-name-label">{month.name}</span>
                      <div className="month-blocks">
                        {/* 1st - 15th Block */}
                        <div 
                          className={`month-block ${isFirstHalfCovered ? 'covered' : 'gap'}`}
                          title={
                            isFirstHalfCovered
                              ? `1st-15th Covered by:\n${firstHalfSessions.map(s => `${s.start_date} to ${s.end_date}`).join('\n')}`
                              : '1st-15th: GAP (Missing data)'
                          }
                        >
                          <span className="block-label">1-15</span>
                        </div>
                        {/* 16th - End Block */}
                        <div 
                          className={`month-block ${isSecondHalfCovered ? 'covered' : 'gap'}`}
                          title={
                            isSecondHalfCovered
                              ? `16th-End Covered by:\n${secondHalfSessions.map(s => `${s.start_date} to ${s.end_date}`).join('\n')}`
                              : '16th-End: GAP (Missing data)'
                          }
                        >
                          <span className="block-label">16+</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* List of Sessions Details */}
      <div className="sessions-list-card">
        <h3>Import Session History</h3>
        {sessions.length === 0 ? (
          <p className="no-data-text">No import sessions recorded yet. Paste an image to start.</p>
        ) : (
          <div className="sessions-table-wrapper">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Screenshot Reference</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id}>
                    <td>#{session.id}</td>
                    <td className="bold-text">{session.start_date}</td>
                    <td className="bold-text">{session.end_date}</td>
                    <td>
                      {session.image_url ? (
                        <a 
                          href={session.image_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="link-btn"
                        >
                          View Image
                        </a>
                      ) : (
                        <span className="text-muted">No Image</span>
                      )}
                    </td>
                    <td>{new Date(session.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
