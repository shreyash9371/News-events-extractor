import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import PasteExtractView from './components/PasteExtractView';
import CoverageTracker from './components/CoverageTracker';
import DatabaseViewer from './components/DatabaseViewer';
import LearnNewsEvents from './components/LearnNewsEvents';
import { getSupabaseConfig } from './supabaseClient';
import { AlertCircle, ShieldAlert, Lock, X } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('database');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdminAuthed, setIsAdminAuthed] = useState(false);
  
  // Password modal states
  const [showPwdPrompt, setShowPwdPrompt] = useState(false);
  const [pendingTab, setPendingTab] = useState('');
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState(false);

  const handleTabChange = (tabId) => {
    if (tabId === 'extract' || tabId === 'tracker') {
      if (!isAdminAuthed) {
        setPendingTab(tabId);
        setShowPwdPrompt(true);
        setPwdInput('');
        setPwdError(false);
      } else {
        setActiveTab(tabId);
      }
    } else {
      setActiveTab(tabId);
    }
  };

  const handlePwdSubmit = (e) => {
    e.preventDefault();
    if (pwdInput === 'Avengers1@') {
      setIsAdminAuthed(true);
      setShowPwdPrompt(false);
      setActiveTab(pendingTab);
    } else {
      setPwdError(true);
    }
  };

  const handleDataSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-layout">
      {showPwdPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--color-bg-card)', padding: '24px', borderRadius: 'var(--radius-lg)', width: '340px', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--color-border)', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Lock className="icon-accent" size={24} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--color-text-primary)' }}>Admin Login</h3>
              <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => setShowPwdPrompt(false)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              This section is restricted. Please enter the admin password to continue.
            </p>
            <form onSubmit={handlePwdSubmit}>
              <input 
                type="password" 
                autoFocus
                value={pwdInput}
                onChange={(e) => setPwdInput(e.target.value)}
                placeholder="Enter Password" 
                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: pwdError ? '1px solid #ef4444' : '1px solid var(--color-border)', marginBottom: '8px', backgroundColor: '#f8fafc', color: 'var(--color-text-primary)', outline: 'none' }} 
              />
              {pwdError && <p style={{ color: '#ef4444', fontSize: '12px', margin: '0 0 16px 0' }}>Incorrect password. Please try again.</p>}
              {!pwdError && <div style={{ height: '16px', marginBottom: '16px' }}></div>}
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>Unlock Access</button>
            </form>
          </div>
        </div>
      )}
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        refreshTrigger={refreshTrigger}
      />

      {/* Main Content Area */}
      <main className="main-content">
        <div className="view-scroll-container">
          {activeTab === 'extract' && (
            <PasteExtractView 
              activeTab={activeTab} 
              onDataSaved={handleDataSaved} 
            />
          )}

          {activeTab === 'tracker' && (
            <CoverageTracker 
              refreshTrigger={refreshTrigger} 
            />
          )}

          {activeTab === 'database' && (
            <DatabaseViewer 
              refreshTrigger={refreshTrigger} 
              onDataChanged={handleDataSaved}
            />
          )}

          {activeTab === 'learn' && (
            <LearnNewsEvents 
              refreshTrigger={refreshTrigger} 
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
