import React, { useEffect, useState } from 'react';
import { Calendar, Database, Eye, BarChart2, BookOpen } from 'lucide-react';
import { getSupabaseClient } from '../supabaseClient';

export default function Sidebar({ activeTab, setActiveTab, refreshTrigger }) {
  const [stats, setStats] = useState({ events: 0, sessions: 0 });

  useEffect(() => {
    async function fetchStats() {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      try {
        // Fetch sessions count
        const { count: sessionCount, error: sessionErr } = await supabase
          .from('import_sessions')
          .select('*', { count: 'exact', head: true });

        // Fetch events count
        const { count: eventCount, error: eventErr } = await supabase
          .from('calendar_events')
          .select('*', { count: 'exact', head: true });

        if (!sessionErr && !eventErr) {
          setStats({
            events: eventCount || 0,
            sessions: sessionCount || 0
          });
        }
      } catch (err) {
        console.error('Error fetching sidebar stats:', err);
      }
    }

    fetchStats();
  }, [refreshTrigger]);

  const menuItems = [
    { id: 'database', label: 'News Events', icon: Database },
    { id: 'learn', label: 'Learn News Events', icon: BookOpen },
    { id: 'extract', label: 'Paste & Extract', icon: Calendar },
    { id: 'tracker', label: 'Coverage Tracker', icon: BarChart2 },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">📅</div>
          <div>
            <h1 className="logo-title">Calendar DB</h1>
            <p className="logo-subtitle">Economic News Hub</p>
          </div>
        </div>
        
        <div className="stats-badge">
          <span className="stats-count">{stats.events}</span> Events Saved
          <div className="stats-sub">{stats.sessions} Sessions</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <IconComponent size={18} className="nav-icon" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <p className="footer-text">Target: 2023 - 2026</p>
        <div className="footer-progress">
          <div className="footer-progress-bar" style={{ width: '45%' }}></div>
        </div>
      </div>
    </aside>
  );
}
