/**
 * EmployeeDevShell.tsx — DEV ONLY
 *
 * Constrains the EmployeeApp to 480×600 inside the browser so you can
 * visually verify it during development without an Electron build.
 *
 * This is a development fixture, not part of the shipped product.
 * The actual app entry point renders <EmployeeApp /> directly at 100vw/100vh.
 *
 * Usage: import this file anywhere in your dev environment.
 * Never import it in production code.
 */

import React from 'react';
import { EmployeeApp } from './EmployeeApp';

export const EmployeeDevShell: React.FC = () => (
  <div style={{
    minHeight:      '100vh',
    background:     '#05080d',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
  }}>
    <div style={{
      width:    480,
      height:   600,
      overflow: 'hidden',
      outline:  '1px solid #1e2d3d',
    }}>
      <EmployeeApp />
    </div>
  </div>
);

export default EmployeeDevShell;
