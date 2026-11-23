import type { ProjectSummaryDto, TestRunDetailDto } from '@tcms/shared';
import { EXECUTION_STATUS_STYLE, safeExternalHttpUrl } from './badges';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerDownload(url: string, fileName: string, revokeAfter = false): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (revokeAfter) {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function buildRunReportFileBase(projectCode: string, runTitle: string): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = runTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `FinX-${projectCode}-TestRun-${slug || 'Report'}-${dateStr}`;
}

async function fetchLogoAsDataUri(): Promise<string | null> {
  try {
    const res = await fetch('/finx-logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildRunReportHtml(
  project: ProjectSummaryDto,
  run: TestRunDetailDto,
  logoDataUri: string | null,
  exportedBy?: string | null,
): string {
  const s = run.stats;
  const total = Math.max(s.total, 1);
  const pPct = (s.passed / total) * 100;
  const fPct = (s.failed / total) * 100;
  const bPct = (s.blocked / total) * 100;
  const ntPct = (s.notTest / total) * 100;
  const generatedAt = new Date().toLocaleString('vi-VN');

  const safeRunJiraHref =
    run.jiraBaseUrl && run.jiraIssueKey
      ? safeExternalHttpUrl(
          `${run.jiraBaseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(run.jiraIssueKey)}`,
        )
      : null;

  // Breakdown by assignee
  const byAssignee = new Map<
    string,
    { name: string; total: number; passed: number; failed: number; blocked: number; remaining: number }
  >();
  for (const r of run.results) {
    const key = r.assigneeId || '__unassigned__';
    const cur = byAssignee.get(key) ?? {
      name: r.assigneeName || 'Chưa phân công',
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      remaining: 0,
    };
    cur.total++;
    if (r.status === 'PASSED') cur.passed++;
    else if (r.status === 'FAILED') cur.failed++;
    else if (r.status === 'BLOCKED') cur.blocked++;
    else cur.remaining++;
    byAssignee.set(key, cur);
  }

  const issueCases = run.results.filter((r) => r.status === 'FAILED' || r.status === 'BLOCKED');

  const assigneeRowsHtml = Array.from(byAssignee.values())
    .map(
      (a) => `
      <tr>
        <td style="font-weight:600;color:#11131a">${escapeHtml(a.name)}</td>
        <td style="text-align:center;font-family:monospace">${a.total}</td>
        <td style="text-align:center;color:#047857;font-weight:600;font-family:monospace">${a.passed}</td>
        <td style="text-align:center;color:#be123c;font-weight:600;font-family:monospace">${a.failed}</td>
        <td style="text-align:center;color:#b45309;font-weight:600;font-family:monospace">${a.blocked}</td>
        <td style="text-align:center;color:#64748b;font-family:monospace">${a.remaining}</td>
      </tr>`,
    )
    .join('');

  const issueRowsHtml =
    issueCases.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:18px;color:#047857;font-weight:600">Không có Test Case Failed hoặc Blocked nào trong đợt chạy này!</td></tr>`
      : issueCases
          .map((r) => {
            const stLabel = EXECUTION_STATUS_STYLE[r.status]?.label || r.status;
            const stBg =
              r.status === 'FAILED'
                ? 'background:#ffe4e6;color:#be123c;border:1px solid #fecdd3'
                : 'background:#fef3c7;color:#b45309;border:1px solid #fde68a';
            const bugsHtml =
              r.jiraBugKeys.length > 0
                ? r.jiraBugKeys
                    .map((bk) => {
                      const href = run.jiraBaseUrl
                        ? safeExternalHttpUrl(
                            `${run.jiraBaseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(bk)}`,
                          )
                        : null;
                      return href
                        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer" style="display:inline-block;padding:1px 6px;border-radius:5px;background:#fff1f2;color:#be123c;border:1px solid #fecdd3;font-family:monospace;font-size:11px;text-decoration:none;margin:1px">${escapeHtml(bk)}</a>`
                        : `<span style="display:inline-block;padding:1px 6px;border-radius:5px;background:#fff1f2;color:#be123c;border:1px solid #fecdd3;font-family:monospace;font-size:11px;margin:1px">${escapeHtml(bk)}</span>`;
                    })
                    .join(' ')
                : '<span style="color:#94a3b8">—</span>';

            return `
              <tr>
                <td style="font-family:monospace;font-weight:700;color:#851fb6;white-space:nowrap">${escapeHtml(r.caseCode)}</td>
                <td>
                  <div style="font-weight:600;color:#11131a">${escapeHtml(r.caseSnapshot.title)}</div>
                  ${r.executedByName ? `<div style="font-size:11px;color:#64748b;margin-top:2px">Thực thi: ${escapeHtml(r.executedByName)}</div>` : ''}
                </td>
                <td style="white-space:nowrap"><span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;${stBg}">${escapeHtml(stLabel)}</span></td>
                <td style="font-size:12px;color:#334155">${escapeHtml(r.actualResult || r.comment || '—')}</td>
                <td>${bugsHtml}</td>
              </tr>`;
          })
          .join('');

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Báo cáo Test Run — ${escapeHtml(run.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f7f7fa;
      color: #11131a;
      padding: 24px 18px;
      line-height: 1.5;
    }
    .report-card {
      max-width: 1060px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e6e6ee;
      border-radius: 16px;
      padding: 28px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 18px;
      border-bottom: 1px solid #e6e6ee;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { height: 32px; width: auto; object-fit: contain; }
    .divider { width: 1px; height: 28px; background: #cbd5e1; }
    .title { font-size: 19px; font-weight: 700; color: #11131a; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 3px; }
    .badge {
      display: inline-block;
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      background: #fbf4fe;
      color: #6e1797;
      border: 1px solid #eaccf8;
      margin-right: 6px;
    }
    .meta-right { text-align: right; font-size: 12px; color: #64748b; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi {
      background: #f7f7fa;
      border: 1px solid #e6e6ee;
      border-radius: 12px;
      padding: 12px;
    }
    .kpi-label { font-size: 11px; color: #64748b; font-weight: 500; }
    .kpi-val { font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .progress-wrap {
      height: 12px;
      border-radius: 999px;
      background: #e2e8f0;
      overflow: hidden;
      display: flex;
      margin-bottom: 22px;
    }
    h2 { font-size: 14px; font-weight: 700; color: #11131a; margin: 18px 0 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e6e6ee; border-radius: 10px; overflow: hidden; }
    th { background: #f7f7fa; text-align: left; padding: 9px 10px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e6e6ee; }
    td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .footer { margin-top: 22px; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .report-card { border: none; padding: 8px; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-card">
    <div class="header">
      <div class="brand">
        ${logoDataUri ? `<img src="${logoDataUri}" alt="FinX" /><div class="divider"></div>` : ''}
        <div>
          <div class="title">${escapeHtml(run.title)}</div>
          <div class="subtitle">
            <span class="badge">${escapeHtml(project.code)}</span>
            ${escapeHtml(project.name)} · Môi trường: <strong>${escapeHtml(run.environment)}</strong> · Phiên bản: <strong>${escapeHtml(run.appVersion)}</strong>
            ${
              run.jiraIssueKey
                ? safeRunJiraHref
                  ? ` · Jira: <a href="${escapeHtml(safeRunJiraHref)}" target="_blank" rel="noreferrer" style="color:#0369a1;font-weight:600">${escapeHtml(run.jiraIssueKey)}</a>`
                  : ` · Jira: ${escapeHtml(run.jiraIssueKey)}`
                : ''
            }
          </div>
        </div>
      </div>
      <div class="meta-right">
        <div>Xuất lúc: <strong>${escapeHtml(generatedAt)}</strong></div>
        ${exportedBy ? `<div>Người xuất: <strong>${escapeHtml(exportedBy)}</strong></div>` : ''}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Pass Rate</div>
        <div class="kpi-val" style="color:#851fb6">${s.passRate}%</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Tổng Case</div>
        <div class="kpi-val">${s.total}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Passed</div>
        <div class="kpi-val" style="color:#047857">${s.passed}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Failed</div>
        <div class="kpi-val" style="color:#be123c">${s.failed}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Blocked</div>
        <div class="kpi-val" style="color:#b45309">${s.blocked}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Còn lại / Not Test</div>
        <div class="kpi-val" style="color:#475569">${s.notExecuted + s.notTest}</div>
      </div>
    </div>

    <div class="progress-wrap">
      <div style="width:${pPct}%;background:#10b981"></div>
      <div style="width:${fPct}%;background:#f43f5e"></div>
      <div style="width:${bPct}%;background:#f59e0b"></div>
      <div style="width:${ntPct}%;background:#8b5cf6"></div>
    </div>

    <h2>Phân bổ theo Người thực hiện (QA)</h2>
    <table>
      <thead>
        <tr>
          <th>Thành viên</th>
          <th style="text-align:center">Tổng</th>
          <th style="text-align:center">Passed</th>
          <th style="text-align:center">Failed</th>
          <th style="text-align:center">Blocked</th>
          <th style="text-align:center">Còn lại</th>
        </tr>
      </thead>
      <tbody>${assigneeRowsHtml}</tbody>
    </table>

    <h2>Danh sách Test Cases Failed / Blocked (${issueCases.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Mã</th>
          <th>Tên Test Case</th>
          <th>Trạng thái</th>
          <th>Kết quả thực tế / Ghi chú</th>
          <th>Bug Jira</th>
        </tr>
      </thead>
      <tbody>${issueRowsHtml}</tbody>
    </table>

    <div class="footer">
      <span>FinX TestCase Hub — Test Run Execution Report</span>
      <span>${escapeHtml(project.code)} · ${escapeHtml(generatedAt)}</span>
    </div>
  </div>
</body>
</html>`;
}

async function renderReportElementForCapture(htmlBodyContent: string): Promise<{
  host: HTMLDivElement;
  card: HTMLElement;
}> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1060px';
  host.style.background = '#ffffff';
  host.style.padding = '16px';
  host.style.zIndex = '-1';
  host.innerHTML = htmlBodyContent;
  document.body.appendChild(host);
  const card = (host.querySelector('.report-card') as HTMLElement) || host;
  // Wait one frame for images/layout
  await new Promise((r) => setTimeout(r, 120));
  return { host, card };
}

function extractBodyInner(fullHtml: string): string {
  const match = fullHtml.match(/<style>([\s\S]*?)<\/style>[\s\S]*<body>([\s\S]*?)<\/body>/i);
  if (!match) return fullHtml;
  return `<style>${match[1]}</style>${match[2]}`;
}

export async function exportRunReport(
  format: 'pdf' | 'html' | 'image',
  project: ProjectSummaryDto,
  run: TestRunDetailDto,
  exportedBy?: string | null,
): Promise<void> {
  const logoDataUri = await fetchLogoAsDataUri();
  const fullHtml = buildRunReportHtml(project, run, logoDataUri, exportedBy);
  const baseName = buildRunReportFileBase(project.code, run.title);

  if (format === 'html') {
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${baseName}.html`, true);
    return;
  }

  const { host, card } = await renderReportElementForCapture(extractBodyInner(fullHtml));
  try {
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(card, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });

    if (format === 'image') {
      triggerDownload(dataUrl, `${baseName}.png`);
      return;
    }

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
      img.src = dataUrl;
    });

    const { jsPDF } = await import('jspdf');
    const isWide = img.width > img.height * 1.15;
    const pdf = new jsPDF({
      orientation: isWide ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const renderedWidth = usableWidth;
    const renderedHeight = (img.height * renderedWidth) / img.width;

    if (renderedHeight <= usableHeight) {
      pdf.addImage(dataUrl, 'PNG', margin, margin, renderedWidth, renderedHeight, undefined, 'FAST');
    } else {
      let heightLeft = renderedHeight;
      let yOffset = margin;
      pdf.addImage(dataUrl, 'PNG', margin, yOffset, renderedWidth, renderedHeight, undefined, 'FAST');
      heightLeft -= usableHeight;

      while (heightLeft > 1) {
        pdf.addPage();
        yOffset = margin - (renderedHeight - heightLeft);
        pdf.addImage(
          dataUrl,
          'PNG',
          margin,
          yOffset,
          renderedWidth,
          renderedHeight,
          undefined,
          'FAST',
        );
        heightLeft -= usableHeight;
      }
    }

    pdf.save(`${baseName}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
