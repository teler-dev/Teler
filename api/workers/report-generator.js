'use strict';

const { getPool, withTransaction } = require('../db');

async function processReportGeneration(payload) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return withTransaction(async client => {
    const reportResult = await client.query(`select * from app.reports where organization_id=$1 and id=$2 for update`, [payload.organization_id, payload.report_id]);
    if (!reportResult.rowCount) throw new Error('Report not found');
    const report = reportResult.rows[0];
    const metrics = await client.query(`select d.metric_date,d.employee_id,e.display_name as employee_name,d.session_count,d.total_duration_seconds,
      d.key_count,d.click_count,d.app_switches,d.idle_seconds,d.focus_seconds,d.distraction_seconds,d.avg_productivity_score
      from app.session_metrics_daily d join app.employees e on e.organization_id=d.organization_id and e.id=d.employee_id
      where d.organization_id=$1 and ($2::timestamptz is null or d.metric_date >= $2::date) and ($3::timestamptz is null or d.metric_date <= $3::date)
      order by d.metric_date,e.display_name`, [payload.organization_id, report.date_start, report.date_end]);
    const alerts = await client.query(`select severity,count(*)::int as count from app.alerts where organization_id=$1
      and ($2::timestamptz is null or created_at >= $2) and ($3::timestamptz is null or created_at <= $3)
      group by severity order by severity`, [payload.organization_id, report.date_start, report.date_end]);
    const summary = metrics.rows.reduce((acc,row) => {
      acc.sessions += Number(row.session_count || 0);
      acc.duration_seconds += Number(row.total_duration_seconds || 0);
      acc.focus_seconds += Number(row.focus_seconds || 0);
      acc.idle_seconds += Number(row.idle_seconds || 0);
      acc.distraction_seconds += Number(row.distraction_seconds || 0);
      if (row.avg_productivity_score !== null) { acc.productivity_total += Number(row.avg_productivity_score); acc.productivity_rows += 1; }
      return acc;
    }, { sessions:0,duration_seconds:0,focus_seconds:0,idle_seconds:0,distraction_seconds:0,productivity_total:0,productivity_rows:0 });
    const data = {
      generated_at: new Date().toISOString(),
      report_type: report.report_type,
      summary: { ...summary, avg_productivity_score: summary.productivity_rows ? Math.round(summary.productivity_total / summary.productivity_rows * 10) / 10 : null },
      alerts_by_severity: alerts.rows,
      daily_metrics: metrics.rows,
    };
    delete data.summary.productivity_total;
    delete data.summary.productivity_rows;
    await client.query(`update app.reports set data=$3,status='ready',updated_at=now() where organization_id=$1 and id=$2`, [payload.organization_id, payload.report_id, data]);
    return { report_id: payload.report_id, rows: metrics.rowCount };
  });
}

module.exports = { processReportGeneration };