import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { Session, classifyScore } from '../../types';

// ─────────────────────────────────────────────
// Productivity Trend (last 7 days line chart)
// ─────────────────────────────────────────────
function buildTrendData(sessions: Session[]) {
  const days: Record<string, number[]> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days[d.toISOString().slice(0, 10)] = [];
  }
  sessions.forEach(s => {
    const day = s.created_at.slice(0, 10);
    if (day in days) days[day].push(s.overall_productivity_score);
  });
  return Object.entries(days).map(([date, scores]) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    sessions: scores.length,
  }));
}

const CustomTrendTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const cls = score != null ? classifyScore(score) : null;
  return (
    <div className="bg-surface-card border border-subtle rounded-xl p-3 text-sm shadow-xl">
      <p className="text-secondary mb-1">{label}</p>
      {score != null ? (
        <>
          <p className="text-primary font-bold text-base">{score}</p>
          <p className={`text-xs font-semibold ${cls?.color}`}>{cls?.label}</p>
        </>
      ) : (
        <p className="text-muted italic">No sessions</p>
      )}
    </div>
  );
};

export const TrendChart: React.FC<{ sessions: Session[] }> = ({ sessions }) => {
  const data = buildTrendData(sessions);
  return (
    <div className="bg-surface-card border border-subtle rounded-2xl p-6 flex flex-col gap-4 hover:border-strong transition-colors">
      <div>
        <h3 className="text-primary font-bold text-base">Productivity Trend</h3>
        <p className="text-muted text-xs mt-0.5">Overall score · Last 7 days</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="rgb(var(--accent))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="rgb(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-subtle))" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTrendTooltip />} cursor={{ stroke: 'rgba(34,211,238,0.12)', strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="rgb(var(--accent))"
            strokeWidth={2.5}
            dot={{ fill: 'rgb(var(--accent))', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: 'rgb(var(--accent-hover))', strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─────────────────────────────────────────────
// Focus vs Idle donut
// ─────────────────────────────────────────────
const DONUT_COLORS = ['rgb(var(--accent))', 'rgb(var(--info))', 'rgb(var(--warning))'];

export const FocusDonut: React.FC<{ sessions: Session[] }> = ({ sessions }) => {
  const filtered = sessions.slice(0, 20); // most recent
  const totalActive = filtered.reduce((a, s) => a + s.active_minutes_estimate, 0);
  const totalIdle = filtered.reduce((a, s) => a + s.idle_minutes_estimate, 0);
  const totalContext = filtered.reduce((a, s) => a + Math.round(s.total_minutes * (1 - s.context_switching_score / 100) * 0.1), 0);

  const data = [
    { name: 'Active', value: Math.max(totalActive, 1) },
    { name: 'Idle', value: Math.max(totalIdle, 1) },
    { name: 'Context Switch', value: Math.max(totalContext, 1) },
  ];

  const total = totalActive + totalIdle + totalContext;
  const activePct = total > 0 ? Math.round((totalActive / total) * 100) : 0;

  const CustomLabel = ({ cx, cy }: any) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="rgb(var(--text-primary))">
      <tspan x={cx} dy="-6" fontSize="22" fontWeight="800" fill="rgb(var(--accent-hover))">{activePct}%</tspan>
      <tspan x={cx} dy="20" fontSize="11" fill="rgb(var(--text-muted))">Active</tspan>
    </text>
  );

  return (
    <div className="bg-surface-card border border-subtle rounded-2xl p-6 flex flex-col gap-4 hover:border-strong transition-colors">
      <div>
        <h3 className="text-primary font-bold text-base">Focus vs Idle</h3>
        <p className="text-muted text-xs mt-0.5">Time distribution · Recent sessions</p>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            labelLine={false}
            label={<CustomLabel />}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i]} opacity={0.9} />
            ))}
          </Pie>
          <Legend
            formatter={(val: string) => <span style={{ color: 'rgb(var(--text-secondary))', fontSize: '11px' }}>{val}</span>}
            iconType="circle"
            iconSize={8}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-1">
        {data.map((d, i) => (
          <div key={i} className="text-center">
            <div className="text-sm font-bold" style={{ color: DONUT_COLORS[i] }}>
              {Math.floor(d.value / 60) > 0 ? `${Math.floor(d.value / 60)}h ${d.value % 60}m` : `${d.value}m`}
            </div>
            <div className="text-xs text-muted">{d.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Score Comparison bar chart
// ─────────────────────────────────────────────
const ScoreTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const cls = classifyScore(score);
  return (
    <div className="bg-surface-card border border-subtle rounded-xl p-3 text-sm shadow-xl">
      <p className="text-secondary mb-1">{payload[0].name}</p>
      <p className="text-primary font-bold">{score}</p>
      <p className={`text-xs font-semibold ${cls.color}`}>{cls.label}</p>
    </div>
  );
};

export const ScoreComparison: React.FC<{ session: Session | null }> = ({ session }) => {
  if (!session) return null;

  const bars = [
    { name: 'Focus',            key: 'focus_score',              value: session.focus_score,              color: 'rgb(var(--accent))' },
    { name: 'Workflow',         key: 'workflow_structure_score',  value: session.workflow_structure_score, color: '#818cf8' },
    { name: 'Tool Usage',       key: 'tool_usage_score',          value: session.tool_usage_score,         color: '#34d399' },
    { name: 'Context Switch',   key: 'context_switching_score',   value: session.context_switching_score,  color: '#f59e0b' },
    { name: 'Overall',          key: 'overall_productivity_score',value: session.overall_productivity_score,color: '#f472b6' },
  ];

  return (
    <div className="bg-surface-card border border-subtle rounded-2xl p-6 hover:border-strong transition-colors">
      <div className="mb-4">
        <h3 className="text-primary font-bold text-base">Score Breakdown</h3>
        <p className="text-muted text-xs mt-0.5">
          Session · {new Date(session.session_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bars} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border-subtle))" horizontal={true} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'rgb(var(--text-muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(34,211,238,0.08)' }} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {bars.map((b, i) => <Cell key={i} fill={b.color} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};