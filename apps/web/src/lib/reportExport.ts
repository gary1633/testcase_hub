import {
  AUTOMATION_STATUSES,
  PRIORITIES,
  TEST_CASE_TYPES,
  type ProjectStatsDto,
  type ProjectSummaryDto,
} from '@tcms/shared';
import { AUTOMATION_STYLE, PRIORITY_STYLE, TYPE_LABEL } from './badges';

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

export function buildReportFileBaseName(projectCode: string): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `FinX-${projectCode}-BaoCaoTongQuan-${dateStr}`;
}

export async function exportOverviewAsImage(
  element: HTMLElement,
  projectCode: string,
): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  });
  triggerDownload(dataUrl, `${buildReportFileBaseName(projectCode)}.png`);
}

export async function exportOverviewAsPdf(
  element: HTMLElement,
  projectCode: string,
): Promise<void> {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  });

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });

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
    // Multi-page pagination cleanly slicing vertically
    let heightLeft = renderedHeight;
    let yOffset = margin;
    pdf.addImage(dataUrl, 'PNG', margin, yOffset, renderedWidth, renderedHeight, undefined, 'FAST');
    heightLeft -= usableHeight;

    while (heightLeft > 1) {
      pdf.addPage();
      yOffset = margin - (renderedHeight - heightLeft);
      pdf.addImage(dataUrl, 'PNG', margin, yOffset, renderedWidth, renderedHeight, undefined, 'FAST');
      heightLeft -= usableHeight;
    }
  }

  pdf.save(`${buildReportFileBaseName(projectCode)}.pdf`);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportOverviewAsHtml(
  project: ProjectSummaryDto,
  stats: ProjectStatsDto,
  exportedBy?: string | null,
): Promise<void> {
  const logoDataUri = await fetchLogoAsDataUri();
  const total = stats.totalCases;
  const autoCount = stats.byAutomation.AUTOMATED ?? 0;
  const autoPct = total > 0 ? Math.round((autoCount / total) * 100) : 0;
  const jiraPct = total > 0 ? Math.round((stats.linkedJiraCases / total) * 100) : 0;
  const generatedAt = new Date().toLocaleString('vi-VN');

  const priorityColors: Record<string, string> = {
    CRITICAL: '#f43f5e',
    HIGH: '#f59e0b',
    MEDIUM: '#0ea5e9',
    LOW: '#94a3b8',
  };

  const autoColors: Record<string, string> = {
    AUTOMATED: '#10b981',
    TO_BE_AUTOMATED: '#8b5cf6',
    MANUAL: '#94a3b8',
  };

  const priorityRowsHtml = PRIORITIES.map((p) => {
    const val = stats.byPriority[p] ?? 0;
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-label">${escapeHtml(PRIORITY_STYLE[p].label)}</span>
          <span class="bar-value">${val} (${pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${priorityColors[p]}"></div>
        </div>
      </div>`;
  }).join('');

  const autoRowsHtml = AUTOMATION_STATUSES.map((a) => {
    const val = stats.byAutomation[a] ?? 0;
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    return `
      <div class="bar-row">
        <div class="bar-meta">
          <span class="bar-label">${escapeHtml(AUTOMATION_STYLE[a].label)}</span>
          <span class="bar-value">${val} (${pct}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%;background:${autoColors[a]}"></div>
        </div>
      </div>`;
  }).join('');

  const typeChipsHtml = TEST_CASE_TYPES.filter((t) => (stats.byType[t] ?? 0) > 0)
    .map(
      (t) =>
        `<span class="chip">${escapeHtml(TYPE_LABEL[t])}: <strong>${stats.byType[t]}</strong></span>`,
    )
    .join('');

  const topSuitesHtml = stats.topSuites
    .map((s) => {
      const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
      return `
        <div class="suite-card">
          <div class="bar-meta">
            <span class="bar-label">${escapeHtml(s.title)}</span>
            <span class="bar-value">${s.count} cases (${pct}%)</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%;background:#851fb6"></div>
          </div>
        </div>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Báo cáo Tổng quan — ${escapeHtml(project.code)} ${escapeHtml(project.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Be Vietnam Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      padding: 28px 20px;
      line-height: 1.5;
    }
    .container { max-width: 1080px; margin: 0 auto; }
    .report-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { height: 34px; width: auto; object-fit: contain; }
    .divider { width: 1px; height: 28px; background: #cbd5e1; }
    .title { font-size: 20px; font-weight: 700; color: #0f172a; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 2px; }
    .code-badge {
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      background: #eef2ff;
      color: #4338ca;
      border: 1px solid #c7d2fe;
      margin-right: 6px;
    }
    .meta-right { text-align: right; font-size: 12px; color: #64748b; }
    .print-btn {
      margin-top: 8px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      background: #4f46e5;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }
    .kpi {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
    }
    .kpi-label { font-size: 12px; font-weight: 500; color: #64748b; }
    .kpi-val { font-size: 26px; font-weight: 700; margin-top: 6px; color: #0f172a; }
    .kpi-sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .two-col {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 18px;
      margin-bottom: 20px;
    }
    .panel {
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
      background: #ffffff;
    }
    .panel h2 { font-size: 14px; font-weight: 600; margin-bottom: 14px; color: #0f172a; }
    .panel h3 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 18px 0 10px; }
    .bar-row { margin-bottom: 12px; }
    .bar-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
    .bar-label { font-weight: 500; color: #334155; }
    .bar-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #64748b; }
    .bar-track { height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { font-size: 12px; padding: 4px 10px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; color: #334155; }
    .suites-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .suite-card { padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .report-card { border: none; box-shadow: none; padding: 12px; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="report-card">
      <div class="header">
        <div class="brand">
          ${logoDataUri ? `<img src="${logoDataUri}" alt="FinX" /><div class="divider"></div>` : ''}
          <div>
            <div class="title">Báo cáo Tổng quan Chất lượng Dự án</div>
            <div class="subtitle">
              <span class="code-badge">${escapeHtml(project.code)}</span>
              ${escapeHtml(project.name)}
            </div>
          </div>
        </div>
        <div class="meta-right">
          <div>Thời gian xuất: <strong>${escapeHtml(generatedAt)}</strong></div>
          ${exportedBy ? `<div>Người xuất: <strong>${escapeHtml(exportedBy)}</strong></div>` : ''}
          <button class="print-btn" onclick="window.print()">In / Lưu PDF</button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Tổng số Test Cases</div>
          <div class="kpi-val">${stats.totalCases.toLocaleString('vi-VN')}</div>
          <div class="kpi-sub">Active: ${stats.byStatus.ACTIVE} · Draft: ${stats.byStatus.DRAFT}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Tỷ lệ Automation</div>
          <div class="kpi-val" style="color:#047857">${autoPct}%</div>
          <div class="kpi-sub">${autoCount} Automated · ${stats.byAutomation.TO_BE_AUTOMATED} To Automate</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Liên kết Jira Issue</div>
          <div class="kpi-val" style="color:#1d4ed8">${stats.linkedJiraCases} <span style="font-size:14px;font-weight:500;color:#64748b">(${jiraPct}%)</span></div>
          <div class="kpi-sub">${project.jiraEnabled ? 'Jira Integration: Đã bật' : 'Jira Integration: Chưa bật'}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Tổng số Test Suites</div>
          <div class="kpi-val">${stats.totalSuites}</div>
          <div class="kpi-sub">${project.stats.memberCount} thành viên tham gia</div>
        </div>
      </div>

      <div class="two-col">
        <div class="panel">
          <h2>Phân bổ theo Mức độ ưu tiên (Priority)</h2>
          ${priorityRowsHtml}
        </div>
        <div class="panel">
          <h2>Phân bổ theo Trạng thái Automation</h2>
          ${autoRowsHtml}
          <h3>Theo Loại kiểm thử (Type)</h3>
          <div class="chips">${typeChipsHtml || '<span class="chip">Chưa có dữ liệu</span>'}</div>
        </div>
      </div>

      <div class="panel">
        <h2>Phân bổ Test Case theo Suite lớn nhất</h2>
        <div class="suites-grid">${topSuitesHtml}</div>
      </div>

      <div class="footer">
        <span>FinX TestCase Hub — Internal Quality Management Report</span>
        <span>${escapeHtml(project.code)} · ${escapeHtml(generatedAt)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${buildReportFileBaseName(project.code)}.html`, true);
}
