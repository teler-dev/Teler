import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthenticatedRouter } from './AuthenticatedRouter';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

const AUTH_PREFIXES = [
  '/dashboard',
  '/employees',
  '/alerts',
  '/analytics',
  '/reports',
  '/dashboards',
  '/saved-views',
  '/ai',
  '/settings',
  '/admin',
];
const useAuthenticatedRouter = AUTH_PREFIXES.some(prefix => window.location.pathname === prefix || window.location.pathname.startsWith(`${prefix}/`));

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {useAuthenticatedRouter ? <AuthenticatedRouter /> : <App />}
  </React.StrictMode>
);