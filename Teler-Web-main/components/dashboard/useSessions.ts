import { useState, useEffect, useCallback } from 'react';
import { Session, TimelineSegment, TaskBreakdownItem, KeystrokeMinute } from '../../types';
import { apiUrl, authHeaders } from '../../services/apiConfig';

// ─── helpers ─────────────────────────────────────────────────────────────────
function ks(n: number): KeystrokeMinute[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`,
    count: Math.round(Math.random() * 35 + (i % 7 === 0 ? 5 : 20)),
  }));
}

function seg(startMin: number, endMin: number, type: TimelineSegment['type'], app: string, label: string): TimelineSegment {
  return {
    startMin,
    endMin,
    durationMin: endMin - startMin,
    wallStart: '',
    type,
    app,
    label,
    url: '',
    classifiedBy: 'fallback',
  };
}

function tb(start: string, end: string, activity: string, app: string, type: TaskBreakdownItem['type']): TaskBreakdownItem {
  return { start, end, activity, app, type };
}

// ─── Mock dataset ─────────────────────────────────────────────────────────────
const MOCK: Session[] = [
  {
    id: '1',
    session_start: '2026-02-26T08:55:00',
    session_end:   '2026-02-26T12:10:00',
    total_minutes: 195,
    focus_score: 88,
    workflow_structure_score: 84,
    tool_usage_score: 91,
    context_switching_score: 72,
    overall_productivity_score: 87,
    active_minutes_estimate: 172,
    idle_minutes_estimate: 23,
    main_tasks: ['Implemented OAuth2 flow', 'Code review PR #312', 'Updated API documentation'],
    main_distractions: ['Twitter (9 min)', 'Slack non-work threads (6 min)'],
    top_apps: ['VS Code', 'Chrome', 'Terminal', 'Slack', 'Postman'],
    red_flags: [],
    recommendations: ['Batch Slack checks to 10am and 3pm', 'Add 2-hour deep work block before standup', 'Consider using GitHub Copilot for repetitive patterns'],
    report_type: 'OCR',
    model_used: 'grok',
    created_at: '2026-02-26T12:12:00',
    executive_summary: 'Strong productive session with sustained deep work on OAuth2 implementation. Developer maintained high keystroke density for 88% of tracked time. Two brief distraction windows (Twitter, Slack) totalling 15 min were offset by long unbroken coding blocks. Workflow structure was methodical: code → test → review → document. Tool usage score is the session high point, reflecting effective IDE + CLI + API testing workflow.',
    claimed_task: 'Implement OAuth2 authentication module',
    task_overlap_pct: 91,
    detected_tasks: [
      { name: 'OAuth2 implementation (VS Code)', duration_minutes: 92, apps: ['VS Code', 'Terminal'], confidence: 96 },
      { name: 'Code review / GitHub PR #312',    duration_minutes: 35, apps: ['Chrome', 'VS Code'],  confidence: 88 },
      { name: 'API documentation update',         duration_minutes: 24, apps: ['Chrome', 'Notion'],   confidence: 82 },
      { name: 'Slack coordination',               duration_minutes: 11, apps: ['Slack'],              confidence: 74 },
      { name: 'Distraction (Twitter)',             duration_minutes:  9, apps: ['Chrome'],             confidence: 99 },
    ],
    task_breakdown: [
      tb('08:55','09:42','OAuth2 module — token logic','VS Code','productive'),
      tb('09:42','09:50','Unit tests for auth flow','Terminal','productive'),
      tb('09:50','10:05','Slack standup + team sync','Slack','neutral'),
      tb('10:05','10:14','Twitter / distraction','Chrome','distraction'),
      tb('10:14','11:00','OAuth2 — refresh token flow','VS Code','productive'),
      tb('11:00','11:20','PR #312 code review','Chrome','productive'),
      tb('11:20','11:35','VS Code edits from review','VS Code','productive'),
      tb('11:35','11:50','Postman API testing','Postman','productive'),
      tb('11:50','12:10','API docs update','Chrome','neutral'),
    ],
    timeline_segments: [
      seg(0,  47,'productive','VS Code','OAuth2 token logic'),
      seg(47, 55,'productive','Terminal','Unit tests'),
      seg(55, 70,'neutral',   'Slack',   'Standup'),
      seg(70, 79,'distraction','Chrome', 'Twitter'),
      seg(79,125,'productive','VS Code','Refresh token flow'),
      seg(125,140,'productive','Chrome','PR review'),
      seg(140,155,'productive','VS Code','Review edits'),
      seg(155,170,'productive','Postman','API testing'),
      seg(170,195,'neutral',  'Chrome', 'Documentation'),
    ],
    app_switches: [
      { atMin: 47, from: 'VS Code', to: 'Terminal' },
      { atMin: 55, from: 'Terminal', to: 'Slack' },
      { atMin: 70, from: 'Slack', to: 'Chrome' },
      { atMin: 79, from: 'Chrome', to: 'VS Code' },
      { atMin: 125, from: 'VS Code', to: 'Chrome' },
      { atMin: 140, from: 'Chrome', to: 'VS Code' },
      { atMin: 155, from: 'VS Code', to: 'Postman' },
      { atMin: 170, from: 'Postman', to: 'Chrome' },
    ],
    context_spikes: [
      { atMin: 70, label: 'Twitter window', severity: 'low' },
      { atMin: 125, label: 'PR context shift', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 12,
      screenshot_urls: [],
      ocr_sample: `http://localhost:3000/auth/callback\nVS Code - oauth2.service.ts\nconst token = await this.tokenService.exchange(code);\nreturn this.userService.findOrCreate(profile);`,
      keystroke_per_minute: ks(195),
      peak_wpm: 78,
      top_apps_minutes: [
        { app: 'VS Code', minutes: 116 },
        { app: 'Chrome',  minutes: 38  },
        { app: 'Terminal',minutes: 11  },
        { app: 'Slack',   minutes: 15  },
        { app: 'Postman', minutes: 15  },
      ],
    },
  },

  {
    id: '2',
    session_start: '2026-02-26T13:30:00',
    session_end:   '2026-02-26T17:00:00',
    total_minutes: 210,
    focus_score: 79,
    workflow_structure_score: 76,
    tool_usage_score: 82,
    context_switching_score: 68,
    overall_productivity_score: 79,
    active_minutes_estimate: 185,
    idle_minutes_estimate: 25,
    main_tasks: ['Database schema migration', 'Frontend bug fixes', 'Sprint planning'],
    main_distractions: ['YouTube (14 min)', 'Reddit (7 min)'],
    top_apps: ['VS Code', 'Chrome', 'DBeaver', 'Figma', 'Slack'],
    red_flags: ['Context switching spike 14:45–15:10'],
    recommendations: ['Use Pomodoro for migration tasks', 'Disable YouTube in browser during work hours', 'Pre-populate sprint board before planning meeting'],
    report_type: 'IMG',
    model_used: 'gemini',
    created_at: '2026-02-26T17:02:00',
    executive_summary: 'Productive afternoon session hampered by a 21-minute distraction window (YouTube + Reddit) and a notable context-switching spike mid-session. Database migration work was the primary focus with good tool usage across DBeaver and VS Code. Sprint planning at end of session was efficient. Recommend establishing browser content blockers during focused migration work.',
    claimed_task: 'Database migration and sprint planning',
    task_overlap_pct: 78,
    detected_tasks: [
      { name: 'DB schema migration (DBeaver+VS Code)', duration_minutes: 85, apps: ['DBeaver','VS Code'], confidence: 91 },
      { name: 'Frontend bug fixes',                    duration_minutes: 48, apps: ['VS Code','Chrome'],  confidence: 85 },
      { name: 'Sprint planning meeting',               duration_minutes: 30, apps: ['Slack','Chrome'],    confidence: 90 },
      { name: 'YouTube / Reddit distraction',          duration_minutes: 21, apps: ['Chrome'],            confidence: 98 },
    ],
    task_breakdown: [
      tb('13:30','14:15','Schema migration scripts','DBeaver','productive'),
      tb('14:15','14:45','Apply migration to dev DB','VS Code','productive'),
      tb('14:45','15:10','YouTube / Reddit','Chrome','distraction'),
      tb('15:10','15:50','Frontend bug fixes','VS Code','productive'),
      tb('15:50','16:10','Test frontend changes','Chrome','productive'),
      tb('16:10','16:20','Slack / team sync','Slack','neutral'),
      tb('16:20','17:00','Sprint planning','Chrome','neutral'),
    ],
    timeline_segments: [
      seg(0,  45,'productive','DBeaver','Schema migration'),
      seg(45, 75,'productive','VS Code','Apply migration'),
      seg(75, 100,'distraction','Chrome','YouTube/Reddit'),
      seg(100,140,'productive','VS Code','Bug fixes'),
      seg(140,160,'productive','Chrome','Testing'),
      seg(160,170,'neutral',  'Slack',  'Team sync'),
      seg(170,210,'neutral',  'Chrome', 'Sprint planning'),
    ],
    app_switches: [
      { atMin: 45, from: 'DBeaver', to: 'VS Code' },
      { atMin: 75, from: 'VS Code', to: 'Chrome' },
      { atMin: 100, from: 'Chrome', to: 'VS Code' },
      { atMin: 140, from: 'VS Code', to: 'Chrome' },
      { atMin: 160, from: 'Chrome', to: 'Slack' },
      { atMin: 170, from: 'Slack', to: 'Chrome' },
    ],
    context_spikes: [
      { atMin: 75, label: 'Distraction block start', severity: 'high' },
      { atMin: 100, label: '25min distraction ended', severity: 'medium' },
    ],
    evidence: {
      screenshot_count: 10,
      screenshot_urls: [],
      ocr_sample: `DBeaver — ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50);\nALTER TABLE sessions ADD COLUMN refresh_token TEXT;\nCREATE INDEX idx_users_oauth ON users(oauth_provider);`,
      keystroke_per_minute: ks(210),
      peak_wpm: 62,
      top_apps_minutes: [
        { app: 'VS Code',  minutes: 88 },
        { app: 'Chrome',   minutes: 72 },
        { app: 'DBeaver',  minutes: 30 },
        { app: 'Slack',    minutes: 12 },
        { app: 'Figma',    minutes: 8  },
      ],
    },
  },

  {
    id: '3',
    session_start: '2026-02-25T09:00:00',
    session_end:   '2026-02-25T13:00:00',
    total_minutes: 240,
    focus_score: 93,
    workflow_structure_score: 90,
    tool_usage_score: 88,
    context_switching_score: 85,
    overall_productivity_score: 91,
    active_minutes_estimate: 218,
    idle_minutes_estimate: 22,
    main_tasks: ['Architected microservice layout', 'Wrote unit tests (87% coverage)', 'Reviewed design specs'],
    main_distractions: ['Email (8 min)'],
    top_apps: ['VS Code', 'Terminal', 'Chrome', 'Notion', 'Slack'],
    red_flags: [],
    recommendations: ['Maintain current deep-work cadence', 'Document architecture decisions in Notion', 'Consider pair programming for test coverage gaps'],
    report_type: 'OCR',
    model_used: 'nvidia',
    created_at: '2026-02-25T13:05:00',
    executive_summary: 'Elite session. Developer sustained near-unbroken deep work for 4 hours with only 8 minutes of distraction. Architecture work was systematic and well-documented. Test coverage reached 87%, indicating quality-first mindset. Context switching was minimal and purposeful. This session represents peak performance and should be used as a reference baseline for workflow optimization.',
    claimed_task: 'Microservice architecture + test coverage improvement',
    task_overlap_pct: 94,
    detected_tasks: [
      { name: 'Architecture diagrams + ADRs',    duration_minutes: 72, apps: ['Notion','Chrome'],   confidence: 89 },
      { name: 'Unit test implementation',         duration_minutes: 110, apps: ['VS Code','Terminal'], confidence: 95 },
      { name: 'Design spec review + annotations', duration_minutes: 38, apps: ['Figma','Chrome'],   confidence: 84 },
      { name: 'Email distraction',                duration_minutes: 8,  apps: ['Chrome'],           confidence: 97 },
    ],
    task_breakdown: [
      tb('09:00','09:30','Architecture ADR writing','Notion','productive'),
      tb('09:30','10:12','Service boundary design','Chrome','productive'),
      tb('10:12','10:20','Email (distraction)','Chrome','distraction'),
      tb('10:20','11:30','Unit tests — auth service','VS Code','productive'),
      tb('11:30','11:45','Test run + coverage report','Terminal','productive'),
      tb('11:45','12:05','Design spec review','Chrome','productive'),
      tb('12:05','12:30','Unit tests — data service','VS Code','productive'),
      tb('12:30','13:00','Final test run + commit','Terminal','productive'),
    ],
    timeline_segments: [
      seg(0,   30,'productive','Notion',   'ADR writing'),
      seg(30,  72,'productive','Chrome',   'Service design'),
      seg(72,  80,'distraction','Chrome',  'Email'),
      seg(80, 150,'productive','VS Code',  'Unit tests auth'),
      seg(150,165,'productive','Terminal', 'Test run'),
      seg(165,185,'productive','Chrome',   'Design spec'),
      seg(185,210,'productive','VS Code',  'Unit tests data'),
      seg(210,240,'productive','Terminal', 'Final run+commit'),
    ],
    app_switches: [
      { atMin: 30, from: 'Notion', to: 'Chrome' },
      { atMin: 80, from: 'Chrome', to: 'VS Code' },
      { atMin: 150, from: 'VS Code', to: 'Terminal' },
      { atMin: 165, from: 'Terminal', to: 'Chrome' },
      { atMin: 185, from: 'Chrome', to: 'VS Code' },
      { atMin: 210, from: 'VS Code', to: 'Terminal' },
    ],
    context_spikes: [
      { atMin: 72, label: 'Email window', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 14,
      screenshot_urls: [],
      ocr_sample: `Notion — Architecture Decision Record: Microservice Boundaries\nDecision: Split auth, user, and data services\ndescribe('AuthService', () => {\n  it('should issue JWT on valid credentials', async () => {\n    const token = await service.login(mockUser);\n    expect(token).toBeDefined();\n  });\n});`,
      keystroke_per_minute: ks(240),
      peak_wpm: 91,
      top_apps_minutes: [
        { app: 'VS Code',  minutes: 95 },
        { app: 'Terminal', minutes: 45 },
        { app: 'Chrome',   minutes: 60 },
        { app: 'Notion',   minutes: 30 },
        { app: 'Slack',    minutes: 10 },
      ],
    },
  },

  {
    id: '4',
    session_start: '2026-02-25T14:00:00',
    session_end:   '2026-02-25T16:30:00',
    total_minutes: 150,
    focus_score: 65,
    workflow_structure_score: 60,
    tool_usage_score: 71,
    context_switching_score: 55,
    overall_productivity_score: 64,
    active_minutes_estimate: 115,
    idle_minutes_estimate: 35,
    main_tasks: ['Attended 3 back-to-back meetings', 'Slack coordination'],
    main_distractions: ['Social media (18 min)', 'Personal email (12 min)'],
    top_apps: ['Zoom', 'Slack', 'Chrome', 'Outlook', 'VS Code'],
    red_flags: ['High idle % after meetings (23%)', 'Fragmented task switching (11 switches)', '30 min distraction block post-meeting fatigue'],
    recommendations: ['Consolidate meetings into 2 daily blocks', 'Schedule 15-min recovery buffer after consecutive meetings', 'Use async video for status updates instead of live meetings'],
    report_type: 'IMG',
    model_used: 'grok',
    created_at: '2026-02-25T16:32:00',
    executive_summary: 'Meeting-heavy afternoon with significant post-meeting cognitive fatigue. Three consecutive Zoom calls fragmented deep work capacity. Social media and personal email accounted for 30 minutes of distraction, concentrated in the post-meeting window. Idle time of 23% reflects recovery periods. This session pattern is unsustainable long-term and meeting consolidation is strongly recommended.',
    claimed_task: 'Sprint review meetings and stakeholder sync',
    task_overlap_pct: 62,
    detected_tasks: [
      { name: 'Zoom meetings (3x)',        duration_minutes: 70, apps: ['Zoom'],           confidence: 99 },
      { name: 'Slack coordination',        duration_minutes: 22, apps: ['Slack'],          confidence: 88 },
      { name: 'Social media / email',      duration_minutes: 30, apps: ['Chrome','Outlook'], confidence: 95 },
      { name: 'Brief coding work',         duration_minutes: 13, apps: ['VS Code'],        confidence: 70 },
    ],
    task_breakdown: [
      tb('14:00','14:30','Sprint review (Zoom)','Zoom','productive'),
      tb('14:30','15:00','Stakeholder sync (Zoom)','Zoom','productive'),
      tb('15:00','15:30','Team planning (Zoom)','Zoom','productive'),
      tb('15:30','15:48','Social media fatigue','Chrome','distraction'),
      tb('15:48','16:00','Personal email','Outlook','distraction'),
      tb('16:00','16:15','Slack catch-up','Slack','neutral'),
      tb('16:15','16:30','Brief code review','VS Code','productive'),
    ],
    timeline_segments: [
      seg(0,  30,'productive','Zoom',    'Sprint review'),
      seg(30, 60,'productive','Zoom',    'Stakeholder sync'),
      seg(60, 90,'productive','Zoom',    'Team planning'),
      seg(90,108,'distraction','Chrome', 'Social media'),
      seg(108,120,'distraction','Outlook','Personal email'),
      seg(120,135,'neutral',  'Slack',   'Slack catch-up'),
      seg(135,150,'productive','VS Code', 'Code review'),
    ],
    app_switches: [
      { atMin: 30,  from: 'Zoom', to: 'Zoom' },
      { atMin: 60,  from: 'Zoom', to: 'Zoom' },
      { atMin: 90,  from: 'Zoom', to: 'Chrome' },
      { atMin: 108, from: 'Chrome', to: 'Outlook' },
      { atMin: 120, from: 'Outlook', to: 'Slack' },
      { atMin: 135, from: 'Slack', to: 'VS Code' },
    ],
    context_spikes: [
      { atMin: 90,  label: 'Post-meeting fatigue block', severity: 'high' },
      { atMin: 108, label: 'Email distraction',          severity: 'medium' },
    ],
    evidence: {
      screenshot_count: 8,
      screenshot_urls: [],
      ocr_sample: `Zoom — Sprint Review Meeting\nParticipants: 8\nAgenda: Demo features, review velocity, retrospective items\nSlack — @channel standup completed ✓`,
      keystroke_per_minute: ks(150),
      peak_wpm: 44,
      top_apps_minutes: [
        { app: 'Zoom',    minutes: 72 },
        { app: 'Slack',   minutes: 25 },
        { app: 'Chrome',  minutes: 30 },
        { app: 'Outlook', minutes: 14 },
        { app: 'VS Code', minutes: 9  },
      ],
    },
  },

  {
    id: '5',
    session_start: '2026-02-24T09:15:00',
    session_end:   '2026-02-24T12:45:00',
    total_minutes: 210,
    focus_score: 82,
    workflow_structure_score: 78,
    tool_usage_score: 80,
    context_switching_score: 74,
    overall_productivity_score: 80,
    active_minutes_estimate: 188,
    idle_minutes_estimate: 22,
    main_tasks: ['CI/CD pipeline setup', 'Docker containerization', 'PR reviews'],
    main_distractions: ['News sites (11 min)', 'Slack (9 min)'],
    top_apps: ['VS Code', 'Terminal', 'Chrome', 'Docker Desktop', 'GitHub'],
    red_flags: [],
    recommendations: ['Automate test runs on PR open', 'Document Docker configs for team', 'Create pipeline template for future repos'],
    report_type: 'OCR',
    model_used: 'deepseek',
    created_at: '2026-02-24T12:48:00',
    executive_summary: 'Strong DevOps session with effective CI/CD pipeline implementation. Docker containerization was completed efficiently with minimal context switching. PR review cycle was fast with good code comprehension. News site distraction (11 min) was the main disruption but did not significantly impact flow state. Session demonstrates solid DevOps toolchain proficiency.',
    claimed_task: 'CI/CD pipeline and Docker setup for project',
    task_overlap_pct: 85,
    detected_tasks: [
      { name: 'CI/CD pipeline (GitHub Actions)', duration_minutes: 80, apps: ['VS Code','Chrome','Terminal'], confidence: 88 },
      { name: 'Docker containerization',          duration_minutes: 75, apps: ['Docker Desktop','Terminal'],  confidence: 92 },
      { name: 'PR review (3 PRs)',                duration_minutes: 24, apps: ['Chrome','VS Code'],           confidence: 86 },
      { name: 'News distraction',                 duration_minutes: 11, apps: ['Chrome'],                    confidence: 97 },
    ],
    task_breakdown: [
      tb('09:15','09:55','GitHub Actions YAML','VS Code','productive'),
      tb('09:55','10:08','Test pipeline run','Terminal','productive'),
      tb('10:08','10:19','News sites','Chrome','distraction'),
      tb('10:19','11:15','Docker Compose setup','Docker Desktop','productive'),
      tb('11:15','11:30','Container test build','Terminal','productive'),
      tb('11:30','11:50','PR review x3','Chrome','productive'),
      tb('11:50','12:10','Pipeline fixes from review','VS Code','productive'),
      tb('12:10','12:45','Final integration test','Terminal','productive'),
    ],
    timeline_segments: [
      seg(0,  40,'productive','VS Code',        'GitHub Actions'),
      seg(40, 53,'productive','Terminal',        'Pipeline test'),
      seg(53, 64,'distraction','Chrome',         'News'),
      seg(64,120,'productive','Docker Desktop',  'Docker Compose'),
      seg(120,135,'productive','Terminal',        'Container test'),
      seg(135,155,'productive','Chrome',          'PR review'),
      seg(155,175,'productive','VS Code',         'Pipeline fixes'),
      seg(175,210,'productive','Terminal',        'Integration test'),
    ],
    app_switches: [
      { atMin: 40, from: 'VS Code', to: 'Terminal' },
      { atMin: 53, from: 'Terminal', to: 'Chrome' },
      { atMin: 64, from: 'Chrome', to: 'Docker Desktop' },
      { atMin: 120, from: 'Docker Desktop', to: 'Terminal' },
      { atMin: 135, from: 'Terminal', to: 'Chrome' },
      { atMin: 155, from: 'Chrome', to: 'VS Code' },
      { atMin: 175, from: 'VS Code', to: 'Terminal' },
    ],
    context_spikes: [
      { atMin: 53, label: 'News distraction', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 11,
      screenshot_urls: [],
      ocr_sample: `# .github/workflows/ci.yml\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: npm ci && npm test`,
      keystroke_per_minute: ks(210),
      peak_wpm: 68,
      top_apps_minutes: [
        { app: 'VS Code',        minutes: 75 },
        { app: 'Terminal',       minutes: 65 },
        { app: 'Chrome',         minutes: 40 },
        { app: 'Docker Desktop', minutes: 21 },
        { app: 'GitHub',         minutes: 9  },
      ],
    },
  },

  {
    id: '6',
    session_start: '2026-02-23T10:00:00',
    session_end:   '2026-02-23T14:00:00',
    total_minutes: 240,
    focus_score: 55,
    workflow_structure_score: 58,
    tool_usage_score: 62,
    context_switching_score: 45,
    overall_productivity_score: 57,
    active_minutes_estimate: 165,
    idle_minutes_estimate: 75,
    main_tasks: ['Debugging production issue', 'Hotfix deployment'],
    main_distractions: ['News (20 min)', 'YouTube (16 min)', 'Twitter (12 min)'],
    top_apps: ['Chrome', 'VS Code', 'Slack', 'Terminal', 'YouTube'],
    red_flags: ['31% idle rate', 'Production incident caused context fragmentation', 'Extended distraction windows (48 min total)', 'No structured recovery after incident resolution'],
    recommendations: ['Post-incident review to prevent recurrence', 'Use incident runbook template', 'Take structured break after high-stress incidents', 'Block distraction sites during incident response'],
    report_type: 'IMG',
    model_used: 'gemini',
    created_at: '2026-02-23T14:03:00',
    executive_summary: 'Below-average session driven by a production incident that caused significant cognitive fragmentation. The incident response itself was effective (hotfix deployed within 2 hours), but 48 minutes of distraction in the aftermath indicate burnout recovery behaviour. Context switching was the session\'s weakest metric at 45, with 11 distinct app switches in 30 minutes during peak stress. Structured incident runbooks would reduce cognitive load in future incidents.',
    claimed_task: 'Resolve production authentication bug',
    task_overlap_pct: 68,
    detected_tasks: [
      { name: 'Production incident triage',   duration_minutes: 55, apps: ['Chrome','Slack','Terminal'], confidence: 91 },
      { name: 'Hotfix coding + deployment',   duration_minutes: 62, apps: ['VS Code','Terminal'],        confidence: 88 },
      { name: 'Post-incident distraction',    duration_minutes: 48, apps: ['Chrome','YouTube'],          confidence: 96 },
      { name: 'Slack incident comms',         duration_minutes: 28, apps: ['Slack'],                    confidence: 85 },
    ],
    task_breakdown: [
      tb('10:00','10:55','Production triage','Chrome','neutral'),
      tb('10:55','11:15','Incident Slack comms','Slack','neutral'),
      tb('11:15','12:17','Hotfix implementation','VS Code','productive'),
      tb('12:17','12:30','Hotfix deployment','Terminal','productive'),
      tb('12:30','12:50','News sites','Chrome','distraction'),
      tb('12:50','13:06','YouTube','Chrome','distraction'),
      tb('13:06','13:18','Twitter','Chrome','distraction'),
      tb('13:18','14:00','Post-incident review','Slack','neutral'),
    ],
    timeline_segments: [
      seg(0,   55,'neutral',    'Chrome',   'Incident triage'),
      seg(55,  75,'neutral',    'Slack',    'Incident comms'),
      seg(75, 137,'productive', 'VS Code',  'Hotfix code'),
      seg(137,150,'productive', 'Terminal', 'Hotfix deploy'),
      seg(150,170,'distraction','Chrome',   'News'),
      seg(170,186,'distraction','Chrome',   'YouTube'),
      seg(186,198,'distraction','Chrome',   'Twitter'),
      seg(198,240,'neutral',    'Slack',    'PIR'),
    ],
    app_switches: [
      { atMin: 55,  from: 'Chrome', to: 'Slack' },
      { atMin: 75,  from: 'Slack', to: 'VS Code' },
      { atMin: 137, from: 'VS Code', to: 'Terminal' },
      { atMin: 150, from: 'Terminal', to: 'Chrome' },
      { atMin: 198, from: 'Chrome', to: 'Slack' },
    ],
    context_spikes: [
      { atMin: 75,  label: 'Incident stress peak', severity: 'high' },
      { atMin: 150, label: 'Post-incident fatigue', severity: 'high' },
    ],
    evidence: {
      screenshot_count: 9,
      screenshot_urls: [],
      ocr_sample: `PagerDuty CRITICAL — auth-service 503 errors (rate: 847/min)\nSlack #incidents: @here production auth is down, investigating\ngit commit -m "hotfix: fix race condition in token refresh handler"`,
      keystroke_per_minute: ks(240),
      peak_wpm: 54,
      top_apps_minutes: [
        { app: 'Chrome',   minutes: 90 },
        { app: 'VS Code',  minutes: 65 },
        { app: 'Slack',    minutes: 40 },
        { app: 'Terminal', minutes: 28 },
        { app: 'YouTube',  minutes: 17 },
      ],
    },
  },

  {
    id: '7',
    session_start: '2026-02-22T08:30:00',
    session_end:   '2026-02-22T12:00:00',
    total_minutes: 210,
    focus_score: 76,
    workflow_structure_score: 73,
    tool_usage_score: 78,
    context_switching_score: 70,
    overall_productivity_score: 75,
    active_minutes_estimate: 185,
    idle_minutes_estimate: 25,
    main_tasks: ['Feature branch development', 'Code refactoring', 'Documentation updates'],
    main_distractions: ['Slack (13 min)', 'Email (8 min)'],
    top_apps: ['VS Code', 'Chrome', 'Slack', 'Terminal', 'Notion'],
    red_flags: [],
    recommendations: ['Good session — replicate morning structure', 'Consider async-first for Slack responses', 'Add JSDoc to refactored modules'],
    report_type: 'OCR',
    model_used: 'nvidia',
    created_at: '2026-02-22T12:04:00',
    executive_summary: 'Solid morning session with consistent feature development. Refactoring work was structured and incremental. Documentation updates kept pace with code changes. Slack interruptions (13 min) were the primary friction point but were contained. Session represents a reliable, repeatable work pattern worth maintaining.',
    claimed_task: 'Feature: user preference settings module',
    task_overlap_pct: 80,
    detected_tasks: [
      { name: 'Feature branch dev (VS Code)',  duration_minutes: 95, apps: ['VS Code','Terminal'], confidence: 90 },
      { name: 'Code refactoring',              duration_minutes: 55, apps: ['VS Code'],            confidence: 85 },
      { name: 'Docs update (Notion)',          duration_minutes: 28, apps: ['Notion','Chrome'],    confidence: 80 },
      { name: 'Slack / email distraction',     duration_minutes: 21, apps: ['Slack','Chrome'],     confidence: 93 },
    ],
    task_breakdown: [
      tb('08:30','09:25','Preference settings API','VS Code','productive'),
      tb('09:25','09:38','Slack messages','Slack','neutral'),
      tb('09:38','09:46','Personal email','Chrome','distraction'),
      tb('09:46','10:35','Code refactoring','VS Code','productive'),
      tb('10:35','10:50','Unit tests','Terminal','productive'),
      tb('10:50','11:18','Notion docs','Notion','productive'),
      tb('11:18','12:00','Feature completion','VS Code','productive'),
    ],
    timeline_segments: [
      seg(0,  55,'productive','VS Code',  'Feature API'),
      seg(55, 68,'neutral',  'Slack',    'Slack messages'),
      seg(68, 76,'distraction','Chrome', 'Email'),
      seg(76,125,'productive','VS Code', 'Refactoring'),
      seg(125,140,'productive','Terminal','Unit tests'),
      seg(140,168,'productive','Notion', 'Docs update'),
      seg(168,210,'productive','VS Code','Feature complete'),
    ],
    app_switches: [
      { atMin: 55, from: 'VS Code', to: 'Slack' },
      { atMin: 68, from: 'Slack', to: 'Chrome' },
      { atMin: 76, from: 'Chrome', to: 'VS Code' },
      { atMin: 125, from: 'VS Code', to: 'Terminal' },
      { atMin: 140, from: 'Terminal', to: 'Notion' },
      { atMin: 168, from: 'Notion', to: 'VS Code' },
    ],
    context_spikes: [
      { atMin: 55, label: 'Slack interruption', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 10,
      screenshot_urls: [],
      ocr_sample: `VS Code — preferences.service.ts\nexport class PreferencesService {\n  async updateTheme(userId: string, theme: ThemeDto) {\n    return this.repo.update({ userId }, { theme });\n  }\n}`,
      keystroke_per_minute: ks(210),
      peak_wpm: 71,
      top_apps_minutes: [
        { app: 'VS Code',  minutes: 110 },
        { app: 'Terminal', minutes: 25  },
        { app: 'Notion',   minutes: 28  },
        { app: 'Slack',    minutes: 18  },
        { app: 'Chrome',   minutes: 19  },
      ],
    },
  },

  {
    id: '8',
    session_start: '2026-02-21T09:00:00',
    session_end:   '2026-02-21T11:30:00',
    total_minutes: 150,
    focus_score: 71,
    workflow_structure_score: 68,
    tool_usage_score: 74,
    context_switching_score: 63,
    overall_productivity_score: 70,
    active_minutes_estimate: 128,
    idle_minutes_estimate: 22,
    main_tasks: ['Sprint retrospective', 'Backlog grooming', 'Technical debt review'],
    main_distractions: ['Twitter (10 min)', 'Personal chat (7 min)'],
    top_apps: ['Jira', 'Confluence', 'Slack', 'Chrome', 'Zoom'],
    red_flags: [],
    recommendations: ['Limit meeting count to 2 per morning', 'Pre-fill retro notes before meeting', 'Assign tech debt tickets during grooming not after'],
    report_type: 'IMG',
    model_used: 'grok',
    created_at: '2026-02-21T11:33:00',
    executive_summary: 'Moderate planning session focused on sprint ceremonies. Retrospective and backlog grooming were completed efficiently. Technical debt review identified 3 high-priority items. Distraction windows (Twitter + personal chat, 17 min) occurred between ceremonies. Session quality would improve with async pre-work for retro items.',
    claimed_task: 'Sprint retro, backlog grooming, tech debt review',
    task_overlap_pct: 76,
    detected_tasks: [
      { name: 'Sprint retrospective (Zoom)', duration_minutes: 45, apps: ['Zoom','Confluence'], confidence: 94 },
      { name: 'Backlog grooming (Jira)',     duration_minutes: 38, apps: ['Jira'],              confidence: 90 },
      { name: 'Tech debt review',            duration_minutes: 30, apps: ['Confluence','Jira'], confidence: 82 },
      { name: 'Twitter / chat',              duration_minutes: 17, apps: ['Chrome','Slack'],    confidence: 95 },
    ],
    task_breakdown: [
      tb('09:00','09:45','Sprint retro (Zoom)','Zoom','productive'),
      tb('09:45','09:55','Twitter break','Chrome','distraction'),
      tb('09:55','10:02','Personal chat','Slack','distraction'),
      tb('10:02','10:40','Backlog grooming','Jira','productive'),
      tb('10:40','11:10','Tech debt tickets','Confluence','productive'),
      tb('11:10','11:30','Ticket assignments','Jira','productive'),
    ],
    timeline_segments: [
      seg(0,  45,'productive','Zoom',       'Sprint retro'),
      seg(45, 55,'distraction','Chrome',    'Twitter'),
      seg(55, 62,'distraction','Slack',     'Personal chat'),
      seg(62,100,'productive','Jira',       'Backlog grooming'),
      seg(100,130,'productive','Confluence','Tech debt'),
      seg(130,150,'productive','Jira',      'Ticket assignment'),
    ],
    app_switches: [
      { atMin: 45, from: 'Zoom', to: 'Chrome' },
      { atMin: 55, from: 'Chrome', to: 'Slack' },
      { atMin: 62, from: 'Slack', to: 'Jira' },
      { atMin: 100, from: 'Jira', to: 'Confluence' },
      { atMin: 130, from: 'Confluence', to: 'Jira' },
    ],
    context_spikes: [
      { atMin: 45, label: 'Post-retro distraction', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 7,
      screenshot_urls: [],
      ocr_sample: `Jira Sprint Backlog — 23 items remaining\nTech debt: AUTH-112 (High), DB-89 (Medium), API-201 (High)\nRetrospective: What went well — CI pipeline, test coverage\nImprove: Meeting load, async communication`,
      keystroke_per_minute: ks(150),
      peak_wpm: 55,
      top_apps_minutes: [
        { app: 'Jira',       minutes: 48 },
        { app: 'Confluence', minutes: 35 },
        { app: 'Zoom',       minutes: 40 },
        { app: 'Slack',      minutes: 15 },
        { app: 'Chrome',     minutes: 12 },
      ],
    },
  },

  {
    id: '9',
    session_start: '2026-02-20T08:00:00',
    session_end:   '2026-02-20T13:00:00',
    total_minutes: 300,
    focus_score: 84,
    workflow_structure_score: 81,
    tool_usage_score: 86,
    context_switching_score: 77,
    overall_productivity_score: 83,
    active_minutes_estimate: 267,
    idle_minutes_estimate: 33,
    main_tasks: ['New feature implementation (3 components)', 'E2E test suite', 'Performance profiling'],
    main_distractions: ['Email (10 min)', 'Slack (8 min)'],
    top_apps: ['VS Code', 'Chrome', 'Terminal', 'Cypress', 'Figma'],
    red_flags: [],
    recommendations: ['Strong session — share workflow template with team', 'Add Lighthouse CI for automated performance tracking', 'Consider splitting long sessions with scheduled breaks'],
    report_type: 'OCR',
    model_used: 'deepseek',
    created_at: '2026-02-20T13:02:00',
    executive_summary: 'Strong 5-hour session with excellent sustained output. Three UI components were implemented, E2E test suite was expanded to 47 tests, and performance profiling identified two rendering bottlenecks. Distraction was minimal at 6%. The extended duration is noteworthy — developer maintained quality throughout. Session is a strong benchmark for team comparison.',
    claimed_task: 'Dashboard UI components + E2E tests + performance audit',
    task_overlap_pct: 88,
    detected_tasks: [
      { name: 'Component implementation (3x)', duration_minutes: 130, apps: ['VS Code','Figma'],  confidence: 92 },
      { name: 'E2E test suite (Cypress)',       duration_minutes: 90,  apps: ['Cypress','VS Code'], confidence: 89 },
      { name: 'Performance profiling',          duration_minutes: 52,  apps: ['Chrome','Terminal'], confidence: 85 },
      { name: 'Email + Slack distraction',      duration_minutes: 18,  apps: ['Chrome','Slack'],   confidence: 94 },
    ],
    task_breakdown: [
      tb('08:00','08:45','KpiStrip component','VS Code','productive'),
      tb('08:45','09:00','Figma spec review','Figma','productive'),
      tb('09:00','09:10','Email','Chrome','distraction'),
      tb('09:10','09:55','TrendChart component','VS Code','productive'),
      tb('09:55','10:35','SessionTable component','VS Code','productive'),
      tb('10:35','10:43','Slack messages','Slack','neutral'),
      tb('10:43','11:45','E2E tests — auth flows','Cypress','productive'),
      tb('11:45','12:10','E2E tests — dashboard','Cypress','productive'),
      tb('12:10','12:35','Chrome DevTools perf','Chrome','productive'),
      tb('12:35','13:00','Terminal profiling','Terminal','productive'),
    ],
    timeline_segments: [
      seg(0,   45,'productive','VS Code',  'KpiStrip comp'),
      seg(45,  60,'productive','Figma',    'Spec review'),
      seg(60,  70,'distraction','Chrome',  'Email'),
      seg(70, 115,'productive','VS Code',  'TrendChart comp'),
      seg(115,155,'productive','VS Code',  'SessionTable comp'),
      seg(155,163,'neutral',  'Slack',    'Messages'),
      seg(163,225,'productive','Cypress',  'E2E auth tests'),
      seg(225,250,'productive','Cypress',  'E2E dashboard'),
      seg(250,275,'productive','Chrome',   'DevTools perf'),
      seg(275,300,'productive','Terminal', 'CLI profiling'),
    ],
    app_switches: [
      { atMin: 45, from: 'VS Code', to: 'Figma' },
      { atMin: 60, from: 'Figma', to: 'Chrome' },
      { atMin: 70, from: 'Chrome', to: 'VS Code' },
      { atMin: 155, from: 'VS Code', to: 'Slack' },
      { atMin: 163, from: 'Slack', to: 'Cypress' },
      { atMin: 250, from: 'Cypress', to: 'Chrome' },
      { atMin: 275, from: 'Chrome', to: 'Terminal' },
    ],
    context_spikes: [
      { atMin: 60, label: 'Email distraction', severity: 'low' },
    ],
    evidence: {
      screenshot_count: 18,
      screenshot_urls: [],
      ocr_sample: `Cypress — 47 passing (2m 14s)\n  Dashboard Suite\n    ✓ renders KPI strip correctly\n    ✓ filters sessions by date range\n    ✓ opens session drawer on row click\nChrome DevTools: LCP 1.2s, FID 14ms, CLS 0.04`,
      keystroke_per_minute: ks(300),
      peak_wpm: 83,
      top_apps_minutes: [
        { app: 'VS Code',  minutes: 115 },
        { app: 'Cypress',  minutes: 80  },
        { app: 'Chrome',   minutes: 50  },
        { app: 'Terminal', minutes: 35  },
        { app: 'Figma',    minutes: 20  },
      ],
    },
  },
];

// ─── Employee identity map ─────────────────────────────────────────────────────
const EMPLOYEE_MAP: Record<string, { userName: string; role: string; client: string }> = {
  '1': { userName: 'Muhammad Ali',  role: 'HR Manager',         client: 'XYZ Corp'     },
  '2': { userName: 'Muhammad Ali',  role: 'HR Manager',         client: 'XYZ Corp'     },
  '3': { userName: 'Sara Ahmed',    role: 'Software Developer', client: 'ABC LLC'      },
  '4': { userName: 'Sara Ahmed',    role: 'Software Developer', client: 'ABC LLC'      },
  '5': { userName: 'Sara Ahmed',    role: 'Software Developer', client: 'ABC LLC'      },
  '6': { userName: 'John Smith',    role: 'Tax Accountant',     client: 'MAD Industry' },
  '7': { userName: 'John Smith',    role: 'Tax Accountant',     client: 'MAD Industry' },
  '8': { userName: 'John Smith',    role: 'Tax Accountant',     client: 'MAD Industry' },
  '9': { userName: 'Muhammad Ali',  role: 'HR Manager',         client: 'XYZ Corp'     },
};
const MOCK_WITH_EMPLOYEES = MOCK.map(s => ({ ...s, ...EMPLOYEE_MAP[s.id] }));

// ─── Developer flag ────────────────────────────────────────────────────────────
// Set to true ONLY for local UI development without the TELER API running.
// When false (default), the app will NEVER fall back to mock data automatically.
// If the API is unavailable, an error is surfaced instead.
const USE_MOCK_DATA = false;

// ─── Hook ──────────────────────────────────────────────────────────────────────
// employeeName — when provided, fetches /api/employee/:name (single-employee view).
//                when omitted,  fetches /api/sessions       (workforce overview).
const POLL_INTERVAL_MS  = 60_000; // 60-second live refresh
const FETCH_TIMEOUT_MS  = 10_000; // abort if no response within 10s

export function useSessions(employeeName?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);
  const [usingMock, setUsingMock] = useState(USE_MOCK_DATA);
  const [error, setError]       = useState<string | null>(null);

  // showLoading=false performs a silent background refresh (no spinner flicker)
  const fetchSessions = useCallback(async (showLoading = true) => {
    // Dev mock mode: bypass API entirely. Never triggered automatically.
    if (USE_MOCK_DATA) {
      const mockData = employeeName
        ? MOCK_WITH_EMPLOYEES.filter(s => s.userName === employeeName)
        : MOCK_WITH_EMPLOYEES;
      setSessions(mockData);
      setUsingMock(true);
      setError(null);
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    setError(null);

    try {
      const url = employeeName
        ? apiUrl(`/api/employee/${encodeURIComponent(employeeName)}`)
        : apiUrl('/api/sessions');

      const res = await fetch(url, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from TELER API`);

      const data: unknown = await res.json();
      if (!Array.isArray(data)) throw new Error('API returned unexpected format (expected array)');

      setSessions(data as Session[]);
      setUsingMock(false);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Unknown error';
      const msg = raw === 'The operation was aborted.'
        ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
        : raw;
      setError(`Failed to connect to TELER API — ${msg}`);
      setSessions([]); // no silent fallback: real failure is always surfaced
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [employeeName]);

  // Initial load (shows spinner)
  useEffect(() => { fetchSessions(true); }, [fetchSessions]);

  // Polling — silent refresh picks up new micro/hour/daily analysis files
  useEffect(() => {
    if (USE_MOCK_DATA) return; // no polling needed in dev mock mode
    const id = setInterval(() => fetchSessions(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchSessions]);

  return { sessions, loading, usingMock, error, refetch: fetchSessions };
}
