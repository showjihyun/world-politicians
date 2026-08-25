import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useUIStore } from './store/uiStore';

const saved = localStorage.getItem('polaris-locale');
if (saved === 'ko') {
  document.title = 'POLARIS — 미국 정치인 관계 지형도';
  document.documentElement.lang = 'ko';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

void useUIStore;
