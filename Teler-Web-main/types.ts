import React from 'react';

export interface Employee {
  name: string;
  role: string;
  client: string;
}

export interface Feature {
  title: string;
  description: string;
  icon: React.ElementType;
}

export interface Stat {
  value: string;
  label: string;
  sub?: string;
}

export interface Step {
  title: string;
  description: string;
  icon: React.ElementType;
}

export interface Session {
  id: string;
  session_start: string;
  session_end: string;
  total_minutes: number;
  focus_score: number;
  workflow_structure_score: number;
  tool_usage_score: number;
  context_switching_score: number;
  overall_productivity_score: number;
  active_minutes_estimate: number;
  idle_minutes_estimate: number;
  main_tasks: string[];
  main_distractions: string[];
  top_apps: string[];
  red_flags: string[];
  recommendations: string[];
  report_type: 'IMG' | 'OCR';
  model_used: string;
  modelKey?: string;
  modelShort?: string;
  allModels?: { key: string; short: string }[];
  has_ai_report?: boolean;
  created_at: string;
  // ── Identity fields (from master.json) ────────────────────────────────
  userName?: string;
  role?: string;
  client?: string;
  task?: string;
  description?: string;
  // ── Raw telemetry ─────────────────────────────────────────────────────
  key_count?: number;
  mouse_clicks?: number;
  idle_percent?: number;
  // ── Rich telemetry (populated by API or mock) ──────────────────────────
  executive_summary?: string;
  timeline_segments?: TimelineSegment[];
  app_switches?: AppSwitch[];
  context_spikes?: ContextSpike[];
  // Timeline Intelligence (Phase 2 — deterministic, no AI)
  focus_blocks?:       TimelineBlock[];
  distraction_blocks?: TimelineBlock[];
  idle_streaks?:       TimelineBlock[];
  switch_bursts?:      SwitchBurst[];
  timeline_summary?:   TimelineSummary;
  // Role-Based Score (deterministic, no AI)
  role_based_score?:   RoleBasedScore;
  claimed_task?: string;
  detected_tasks?: DetectedTask[];
  task_overlap_pct?: number | null;
  task_breakdown?: TaskBreakdownItem[];
  evidence?: SessionEvidence;
  ai_report_text?: string;
  // Anomaly detection (populated server-side after baseline comparison)
  session_anomalies?: SessionAnomaly[];
  anomaly_summary?:   AnomalySummary;
  // Structured risk score (deterministic, combines all layers)
  structured_risk_score?: StructuredRiskScore;
  // Deterministic analytics (null when not yet generated)
  analytics?: SessionAnalytics | null;
  hourly_metrics?: HourlyMetric[];
  segments?: SegmentEntry[];
  // Layered AI pipeline (populated live during and after session)
  micro_windows?: MicroWindow[];
  hour_blocks?: HourBlock[];
  daily_summary?: DailySummary | null;
}

// ── Extended session telemetry types ────────────────────────────────────────

export type SegmentType = 'productive' | 'neutral' | 'distraction' | 'idle';

export interface TimelineSegment {
  startMin:     number;       // float minutes from session start (3 dp)
  endMin:       number;       // float minutes — endMin[i] === startMin[i+1] guaranteed
  durationMin:  number;       // endMin - startMin, always > 0
  wallStart:    string;       // ISO 8601 absolute timestamp
  type:         SegmentType;
  app:          string;
  label:        string;
  url:          string;       // first URL seen in this span; '' if unavailable
  classifiedBy: 'domain' | 'name' | 'fallback';
}

export interface AppSwitch {
  atMin: number;
  from: string;
  to: string;
}

export interface ContextSpike {
  atMin: number;
  label: string;
  severity: 'low' | 'medium' | 'high';
}

// ── Role-Based Scoring types ──────────────────────────────────────────────────

/** Deterministic role-aware score for a single session. */
export interface RoleBasedScore {
  role:        string;                     // normalized role key (developer | designer | ...)
  score:       number;                     // 0–100 weighted composite
  version:     string;                     // scoring model version tag (e.g. 'v1')
  weights:     Record<string, number>;     // factor weights used (sum = 100)
  factors:     Record<string, number>;     // per-factor sub-scores 0–100
  explanation: string[];                   // one plain-English bullet per factor
}

// ── Timeline Intelligence types (Phase 2) ────────────────────────────────────

/** A contiguous run of same-type segments that meets the minimum duration threshold. */
export interface TimelineBlock {
  startMin:     number;   // minutes from session start
  endMin:       number;
  durationMin:  number;   // endMin - startMin (1 dp)
  wallStart:    string;   // ISO 8601 — wall time at block start
  wallEnd:      string;   // ISO 8601 — wall time at block end
  dominantApp:  string;   // app with most accumulated time in this block
  segmentCount: number;   // number of underlying segments
}

/** A rolling 15-min window containing ≥ 3 app switches. */
export interface SwitchBurst {
  startMin:     number;
  endMin:       number;
  durationMin:  number;
  wallStart:    string;
  wallEnd:      string;
  dominantApp:  string;   // most-switched-to app in this burst
  segmentCount: number;   // number of distinct app spans (switches + 1)
}

/** Aggregate metrics derived from focus_blocks, distraction_blocks, idle_streaks, switch_bursts. */
export interface TimelineSummary {
  totalFocusMin:         number;
  totalDistractionMin:   number;
  totalIdleMin:          number;
  longestFocusMin:       number;
  longestDistractionMin: number;
  longestIdleMin:        number;
  switchBurstCount:      number;
}

export interface DetectedTask {
  name: string;
  duration_minutes: number;
  apps: string[];
  confidence: number;  // 0–100
}

export interface TaskBreakdownItem {
  start: string;  // "09:00"
  end: string;    // "09:45"
  activity: string;
  app: string;
  type: SegmentType;
}

export interface KeystrokeMinute {
  label: string;
  count: number;
}

export interface SessionEvidence {
  screenshot_count: number;
  screenshot_urls: string[];        // absolute Windows paths served via /screenshots?path=; '' for duplicates
  screenshot_types?: string[];      // parallel to screenshot_urls: "image" | "duplicate"; absent in old sessions
  ocr_sample: string;
  keystroke_per_minute: KeystrokeMinute[];
  peak_wpm: number;
  total_keystrokes?: number;
  top_apps_minutes: {
    app: string;
    minutes: number;
    url?: string;           // domain extracted from active_url (e.g. "github.com")
    process?: string;       // canonical process name (e.g. "chrome")
    window_title?: string;  // most frequent raw window title for this process
    idle_seconds?: number;  // total idle seconds accumulated while this app was active
  }[];
}

export interface SegmentEntry {
  index: number;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  app: string;
  window_title?: string;
  url_domain?: string;
  keys?: number;
  clicks?: number;
  scrolls?: number;
  segment_type: string;          // legacy: active | passive | idle
  activity_state?: string;       // v2: active | passive_work | idle
  context_type?: string;         // from context_labels.json
  work_relevance?: string;       // from context_labels.json
  app_category?: string;         // from context_labels.json
}

export interface SessionAnalytics {
  focus_score: number;
  deep_work_blocks: number;
  deep_work_minutes: number;
  context_switch_rate: number;
  distraction_ratio: number;
  activity_intensity: number;
  volatility_index: number;
  top_tools: { app: string; minutes_used: number }[];
}

export interface HourlyMetric {
  hour: number;
  focus_minutes: number;
  deep_work_minutes: number;
  distraction_minutes: number;
  top_app: string;
}

// ── Layered AI pipeline output types ────────────────────────────────────────

export interface MicroWindow {
  window_index:  number;
  window_start:  string;   // "HH:mm:ss"
  window_end:    string;   // "HH:mm:ss"
  focus_score:   number;   // 0-100
  activity_type: string;   // productive | distraction | idle | meeting | communication
  distraction:   boolean;
  apps:          string[];
  confidence:    number;   // 0-100
  summary:       string;
}

export interface HourBlock {
  hour_index:          number;
  hour_start:          string;  // "HH:mm:ss"
  hour_end:            string;  // "HH:mm:ss"
  focus_score:         number;  // 0-100
  deep_work_minutes:   number;
  distraction_minutes: number;
  context_switch_rate: number;  // 0-100
  primary_task:        string;
  top_apps:            string[];
  summary:             string;
}

export interface DailySummary {
  date:              string;
  total_focus_score: number;   // 0-100
  productive_hours:  number;
  deep_work_hours:   number;
  distraction_hours: number;
  top_apps:          string[];
  primary_tasks:     string[];
  highlights:        string;
  recommendations:   string;
  biggest_distraction?:  string;
  context_switch_count?: number;
}

// ── Multi-Session Memory types ────────────────────────────────────────────────
// Returned by GET /api/memory and GET /api/memory/:name
// Deterministic aggregates — no AI, no LLM.

export type TrendDirection = 'improving' | 'worsening' | 'stable';

/** Average behaviour over a window of sessions (7, 14, or all). */
export interface EmployeeBaseline {
  sessionCount:               number;
  avgProductivityScore:       number;
  avgRoleScore:               number;   // avg role_based_score.score across window
  avgIdleMin:                 number;
  avgFocusMin:                number;
  avgDistractionMin:          number;
  avgSwitchBurstCount:        number;
  avgSessionDurationMin:      number;
  focusBlockFrequency:        number;   // avg focus blocks per session
  distractionBlockFrequency:  number;   // avg distraction blocks per session
  idleStreakFrequency:        number;   // avg idle streaks per session
}

/** Direction of change: last 7 sessions vs prior 7 sessions (>5% delta = trend). */
export interface EmployeeTrends {
  productivityTrend: TrendDirection;
  idleTrend:         TrendDirection;
  focusTrend:        TrendDirection;
  distractionTrend:  TrendDirection;
  switchBurstTrend:  TrendDirection;
  comparedAgainst:   string;            // description of comparison window used
}

/** Session regularity and score/duration stability across all available sessions. */
export interface EmployeeConsistency {
  sessionCount:      number;
  activeDaysCount:   number;
  avgSessionsPerDay: number;
  scoreVariance:     number;    // population variance of overall_productivity_score
  durationVariance:  number;    // population variance of total_minutes
}

export interface EmployeeMemory {
  employee_name:           string;
  computed_at:             string;   // ISO 8601 — when this was calculated
  session_count_available: number;
  baseline_7:              EmployeeBaseline | null;
  baseline_14:             EmployeeBaseline | null;
  baseline_all:            EmployeeBaseline;
  trends:                  EmployeeTrends;
  consistency:             EmployeeConsistency;
}

// ── Structured Risk Scoring types ────────────────────────────────────────────

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface RiskContributor {
  factor:       string;               // signal name: role_based_score | anomaly_signals | trends | timeline_quality | consistency
  contribution: number;               // signed points (+ = increases risk, − = decreases risk)
  direction:    'increase' | 'decrease';
  explanation:  string;               // one plain-English sentence
}

export interface StructuredRiskScore {
  score:        number;               // 0–100, higher = more risk
  level:        RiskLevel;            // 0–29 low · 30–54 moderate · 55–74 high · 75–100 critical
  version:      string;               // scoring model version tag (e.g. 'v1')
  contributors: RiskContributor[];    // what drove the score up or down
  summary:      string[];             // 2–5 short sentences for UI display
}

// ── Anomaly Detection types ───────────────────────────────────────────────────

export type AnomalyType =
  | 'low_role_score'
  | 'high_idle_time'
  | 'low_focus_time'
  | 'high_distraction'
  | 'high_switch_bursts'
  | 'short_session'
  | 'long_session'
  | 'sudden_score_drop';

export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface SessionAnomaly {
  type:          AnomalyType;
  severity:      AnomalySeverity;
  metric:        string;           // dot-path to the field that triggered this (e.g. "idle_minutes_estimate")
  currentValue:  number;           // value for this session (1 dp)
  baselineValue: number;           // baseline comparison value (1 dp)
  deviationPct:  number;           // |current - baseline| / baseline × 100, rounded
  explanation:   string;           // plain-English sentence
}

export interface AnomalySummary {
  anomalyCount:        number;
  highSeverityCount:   number;
  dominantAnomalyType: AnomalyType | null;
}

export type ScoreClassification = 'Low' | 'Moderate' | 'Strong' | 'Elite';

export function classifyScore(score: number): { label: ScoreClassification; color: string; bg: string; border: string; dot: string } {
  if (score >= 86) return { label: 'Elite',    color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   dot: 'bg-cyan-400' };
  if (score >= 71) return { label: 'Strong',   color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30',  dot: 'bg-green-400' };
  if (score >= 41) return { label: 'Moderate', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  dot: 'bg-amber-400' };
  return               { label: 'Low',      color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    dot: 'bg-red-400' };
}