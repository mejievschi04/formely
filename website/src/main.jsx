import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import { captureAttribution } from './lib/attribution';
import './styles/theme.css';
import './styles/landing.css';

captureAttribution();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </HelmetProvider>
  </React.StrictMode>,
);
