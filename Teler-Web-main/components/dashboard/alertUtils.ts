import { Session } from '../../types';

// ── Alert types ────────────────────────────────────────────────────────────────

export type AlertType =
  | 'low_focus'
  | 'high_idle'
  | 'high_context_switch'
  | 'suspicious_inactivity';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

export const SEVERITY_CONFIG: Record<AlertSeverity, {
  color: string; bg: string; border: string; dot: string; label: string;
}> = {
  critical: { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    dot: 'bg-red-400 animate-pulse', label: 'CRITICAL' },
  high:     { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', dot: 'bg-orange-400',             label: 'HIGH'     },
  medium:   { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: 'bg-yellow-400',             label: 'MEDIUM'   },
  low:      { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20',  dot: 'bg-green-400',              label: 'LOW'      },
};

export interface Alert {
  id: string;
  employeeName: string;
  employeeRole?: string;
  alertType: AlertType;
  timestamp: string;       // session created_at
  severity: AlertSeverity;
  sessionId: string;
  alertLabel: string;
  details: string;
}

// ── Alert label map ────────────────────────────────────────────────────────────

export const ALERT_LABEL: Record<AlertType, string> = {
  low_focus:              'Low Focus Score',
  high_idle:              'High Idle Time',
  high_context_switch:    'High Context Switching',
  suspicious_inactivity:  'Suspicious Inactivity',
};

export const ALERT_DESCRIPTION: Record<AlertType, string> = {
  low_focus:              'Focus score is below acceptable threshold — indicates concentration or engagement issues.',
  high_idle:              'Significant idle time recorded in a single session.',
  high_context_switch:    'Context switching rate is elevated — frequent app switching fragments focus.',
  suspicious_inactivity:  'A large proportion of the session was spent idle, relative to total session length.',
};

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateAlerts(sessions: Session[]): Alert[] {
  const alerts: Alert[] = [];

  for (const s of sessions) {
    const empName = s.userName || s.role || 'Unknown';
    const empRole = s.role;

    // ── Rule 1: Focus score ───────────────────────────────────────────────────

    if (s.focus_score > 0 && s.focus_score < 30) {
      alerts.push({
        id: `${s.id}-lowfocus`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'low_focus',
        timestamp:   s.created_at,
        severity:   'critical',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.low_focus,
        details:    `Focus score ${s.focus_score}/100 — severe`,
      });
    } else if (s.focus_score >= 30 && s.focus_score < 50) {
      alerts.push({
        id: `${s.id}-lowfocus-high`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'low_focus',
        timestamp:   s.created_at,
        severity:   'high',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.low_focus,
        details:    `Focus score ${s.focus_score}/100 — low`,
      });
    } else if (s.focus_score >= 50 && s.focus_score < 60) {
      alerts.push({
        id: `${s.id}-lowfocus-low`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'low_focus',
        timestamp:   s.created_at,
        severity:   'low',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.low_focus,
        details:    `Focus score ${s.focus_score}/100 — borderline`,
      });
    }

    // ── Rule 2: Idle time ─────────────────────────────────────────────────────

    if (s.idle_minutes_estimate > 60) {
      alerts.push({
        id: `${s.id}-highidle`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'high_idle',
        timestamp:   s.created_at,
        severity:   'critical',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.high_idle,
        details:    `${s.idle_minutes_estimate}m idle / ${s.total_minutes}m total`,
      });
    } else if (s.idle_minutes_estimate > 30) {
      alerts.push({
        id: `${s.id}-highidle`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'high_idle',
        timestamp:   s.created_at,
        severity:   'high',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.high_idle,
        details:    `${s.idle_minutes_estimate}m idle / ${s.total_minutes}m total`,
      });
    } else if (s.idle_minutes_estimate > 20) {
      alerts.push({
        id: `${s.id}-highidle-med`,
        employeeName: empName, employeeRole: empRole,
        alertType:  'high_idle',
        timestamp:   s.created_at,
        severity:   'medium',
        sessionId:   s.id,
        alertLabel:  ALERT_LABEL.high_idle,
        details:    `${s.idle_minutes_estimate}m idle / ${s.total_minutes}m total — elevated`,
      });
    }

    // ── Rule 3: Context switching rate ────────────────────────────────────────

    const switchCount = s.app_switches?.length ?? 0;
    const totalHours  = s.total_minutes / 60;
    if (totalHours >= 0.5) {
      const switchRate = switchCount / totalHours;
      if (switchRate > 60) {
        alerts.push({
          id: `${s.id}-ctxswitch`,
          employeeName: empName, employeeRole: empRole,
          alertType:  'high_context_switch',
          timestamp:   s.created_at,
          severity:   'high',
          sessionId:   s.id,
          alertLabel:  ALERT_LABEL.high_context_switch,
          details:    `${Math.round(switchRate)}/hr app switches — excessive`,
        });
      } else if (switchRate > 40) {
        alerts.push({
          id: `${s.id}-ctxswitch`,
          employeeName: empName, employeeRole: empRole,
          alertType:  'high_context_switch',
          timestamp:   s.created_at,
          severity:   'medium',
          sessionId:   s.id,
          alertLabel:  ALERT_LABEL.high_context_switch,
          details:    `${Math.round(switchRate)}/hr app switches — elevated`,
        });
      }
    }

    // ── Rule 4: Suspicious inactivity ─────────────────────────────────────────

    if (s.total_minutes > 0) {
      const idlePct = s.idle_minutes_estimate / s.total_minutes;
      if (s.total_minutes > 60 && idlePct > 0.5) {
        alerts.push({
          id: `${s.id}-inactivity`,
          employeeName: empName, employeeRole: empRole,
          alertType:  'suspicious_inactivity',
          timestamp:   s.created_at,
          severity:   'critical',
          sessionId:   s.id,
          alertLabel:  ALERT_LABEL.suspicious_inactivity,
          details:    `${Math.round(idlePct * 100)}% idle — ${s.idle_minutes_estimate}m`,
        });
      } else if (s.total_minutes > 45 && idlePct > 0.4) {
        alerts.push({
          id: `${s.id}-inactivity-high`,
          employeeName: empName, employeeRole: empRole,
          alertType:  'suspicious_inactivity',
          timestamp:   s.created_at,
          severity:   'high',
          sessionId:   s.id,
          alertLabel:  ALERT_LABEL.suspicious_inactivity,
          details:    `${Math.round(idlePct * 100)}% idle — ${s.idle_minutes_estimate}m`,
        });
      }
    }
  }

  // Sort by severity first, then newest timestamp first; deduplicate by id
  const seen = new Set<string>();
  return alerts
    .sort((a, b) => {
      const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sd !== 0) return sd;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function alertsForEmployee(alerts: Alert[], name: string): Alert[] {
  return alerts.filter(a => a.employeeName === name);
}
