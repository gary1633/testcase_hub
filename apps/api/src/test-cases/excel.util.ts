import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type {
  AutomationStatus,
  DefectSeverity,
  ExecutionStatus,
  Priority,
  Severity,
  TestCaseStatus,
  TestCaseType,
} from '@tcms/shared';
import { parseCsv } from './csv.util';

export interface ExportableCaseItem {
  code: string;
  suitePath: string[]; // e.g. ['Authentication & Account', 'Login & Session']
  title: string;
  steps: Array<{ action: string; data: string; expectedResult: string }>;
  preconditions: string;
  description: string;
  priority: Priority;
  severity: Severity;
  type: TestCaseType;
  automationStatus: AutomationStatus;
  status: TestCaseStatus;
  tags: string[];
  jiraIssueKeys: string[];
  createdByName: string;
}

export interface BuildVikkiWorkbookOptions {
  projectCode: string;
  projectName: string;
  projectDescription?: string | null;
  featureName?: string;
  docLink?: string;
  cases: ExportableCaseItem[];
}

export interface ParsedImportCase {
  suiteSegments: string[];
  title: string;
  description: string;
  preconditions: string;
  priority: Priority;
  severity: Severity;
  type: TestCaseType;
  automationStatus: AutomationStatus;
  status: TestCaseStatus;
  tags: string[];
  jiraIssueKeys: string[];
  steps: Array<{ action: string; data: string; expectedResult: string }>;
}

function getVikkiTemplatePath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'assets', 'vikki-template.xlsx'),
    path.resolve(process.cwd(), 'apps', 'api', 'assets', 'vikki-template.xlsx'),
    path.resolve(__dirname, '..', '..', 'assets', 'vikki-template.xlsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Không tìm thấy file phôi vikki-template.xlsx trong apps/api/assets/');
}

function priorityToVikkiLabel(priority: Priority): string {
  switch (priority) {
    case 'CRITICAL':
    case 'HIGH':
      return 'High';
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
    default:
      return 'Medium';
  }
}

function vikkiLabelToPriority(raw: string): Priority {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'highest' || normalized === 'critical' || normalized === 'blocker') {
    return 'CRITICAL';
  }
  if (normalized === 'high') return 'HIGH';
  if (normalized === 'low' || normalized === 'lowest') return 'LOW';
  return 'MEDIUM';
}

function formatDateDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

interface RowStyleSnapshot {
  styles: Array<Partial<ExcelJS.Style>>;
  validations: Array<ExcelJS.DataValidation | undefined>;
}

function cleanFont(font?: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> {
  const copy: Partial<ExcelJS.Font> = font ? JSON.parse(JSON.stringify(font)) : {};
  copy.name = 'Be Vietnam Pro';
  copy.family = 2; // FF_SWISS (clean sans-serif fallback in Windows Excel if Be Vietnam Pro is not installed)
  delete copy.charset;
  return copy;
}

function sanitizeWorkbookFonts(workbook: ExcelJS.Workbook): void {
  for (const ws of workbook.worksheets) {
    if (ws.columns) {
      for (const col of ws.columns) {
        if (col && col.style && col.style.font) {
          col.style.font = cleanFont(col.style.font);
        }
      }
    }
    ws.eachRow({ includeEmpty: true }, (row) => {
      if (row.font) {
        row.font = cleanFont(row.font);
      }
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.font) {
          cell.font = cleanFont(cell.font);
        }
      });
    });
  }
}

async function stripBrokenCharsetFromXlsx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const stylesFile = zip.file('xl/styles.xml');
  if (stylesFile) {
    const xml = await stylesFile.async('string');
    // Remove GB2312 Chinese charset=134 so Windows Excel never falls back to SimSun
    const cleanedXml = xml.replace(/<charset\s+val="134"\s*\/>/g, '');
    zip.file('xl/styles.xml', cleanedXml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function snapshotRowStyle(sheet: ExcelJS.Worksheet, rowNumber: number, colCount = 12): RowStyleSnapshot {
  const row = sheet.getRow(rowNumber);
  const styles: Array<Partial<ExcelJS.Style>> = [];
  const validations: Array<ExcelJS.DataValidation | undefined> = [];
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    const clonedStyle: Partial<ExcelJS.Style> = cell.style
      ? JSON.parse(JSON.stringify(cell.style))
      : {};
    clonedStyle.font = cleanFont(clonedStyle.font);
    styles.push(clonedStyle);
    validations.push(cell.dataValidation ? JSON.parse(JSON.stringify(cell.dataValidation)) : undefined);
  }
  return { styles, validations };
}

function applyRowStyle(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  snapshot: RowStyleSnapshot,
  colCount = 12,
) {
  const row = sheet.getRow(rowNumber);
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.style = JSON.parse(JSON.stringify(snapshot.styles[c - 1] || {}));
    const dv = snapshot.validations[c - 1];
    if (dv) {
      cell.dataValidation = JSON.parse(JSON.stringify(dv));
    }
  }
}

/**
 * Returns the Vikki Excel template with Vikki logo, purple theme colors,
 * formulas, and DRAW_BUG sheet preserved, while fixing charset=134 so Windows Excel
 * renders Be Vietnam Pro cleanly instead of falling back to SimSun.
 */
export async function getCleanVikkiTemplateBuffer(): Promise<Buffer> {
  const templatePath = getVikkiTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  sanitizeWorkbookFonts(workbook);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return stripBrokenCharsetFromXlsx(Buffer.from(arrayBuffer));
}

/**
 * Clones the original Vikki Excel template and fills project metadata + test cases
 * while preserving 100% of Vikki's logo, colors (#8B00B4, #D5A6BD, #EAD1DC),
 * Be Vietnam Pro font (without broken GB2312 charset=134), data validations,
 * conditional formatting, and DRAW_BUG sheet.
 */
export async function buildVikkiExcelExportBuffer(
  options: BuildVikkiWorkbookOptions,
): Promise<Buffer> {
  const templatePath = getVikkiTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  // Strip broken charset=134 across both sheets so Windows Excel never falls back to Chinese SimSun
  sanitizeWorkbookFonts(workbook);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('File vikki-template.xlsx không có worksheet hợp lệ');
  }

  // Snapshot original Vikki styles for Level 1 group (R27), Level 2 group (R28), and Case row (R29)
  const level1Style = snapshotRowStyle(sheet, 27, 12);
  const level2Style = snapshotRowStyle(sheet, 28, 12);
  const caseRowStyle = snapshotRowStyle(sheet, 29, 12);

  // Fill metadata block (preserving exact cell styles from Vikki template)
  const todayStr = formatDateDdMmYyyy(new Date());
  sheet.getCell('C10').value = `${options.projectCode}-TC-${todayStr.replace(/-/g, '')}`;
  sheet.getCell('C11').value = options.projectName;
  sheet.getCell('C14').value =
    options.featureName || options.projectDescription || '[Nhập tên tính năng]';
  if (options.docLink) {
    sheet.getCell('C15').value = options.docLink;
  }
  sheet.getCell('C16').value = todayStr;

  // Clear ALL sample rows & leftover shared formulas from R27..sheet.rowCount (all 1009 rows)
  // so COUNTA(A27:A1009) counts ONLY real exported test cases (no phantom 48 count!)
  const maxExistingRow = Math.max(sheet.rowCount, 1009);
  for (let r = 27; r <= maxExistingRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      if (cell.value !== null && cell.value !== undefined) {
        cell.value = null;
      }
    }
    if (r === 27 || r === 28) {
      applyRowStyle(sheet, r, caseRowStyle, 12);
    }
  }

  // Write grouped Suites (R27/R28 Vikki purple tones) + Test Cases (R29 style)
  let currentRow = 27;
  let totalCaseCount = 0;
  let lastLevel1: string | null = null;
  let lastLevel2: string | null = null;

  for (const tc of options.cases) {
    const level1 = tc.suitePath[0] || 'Chưa phân loại';
    const level2 = tc.suitePath.length > 1 ? tc.suitePath.slice(1).join(' / ') : null;

    if (level1 !== lastLevel1) {
      applyRowStyle(sheet, currentRow, level1Style, 12);
      sheet.getRow(currentRow).getCell(2).value = level1;
      sheet.getRow(currentRow).height = 22;
      currentRow++;
      lastLevel1 = level1;
      lastLevel2 = null;
    }

    if (level2 && level2 !== lastLevel2) {
      applyRowStyle(sheet, currentRow, level2Style, 12);
      sheet.getRow(currentRow).getCell(2).value = level2;
      sheet.getRow(currentRow).height = 21;
      currentRow++;
      lastLevel2 = level2;
    }

    applyRowStyle(sheet, currentRow, caseRowStyle, 12);
    const row = sheet.getRow(currentRow);

    const stepsText = tc.steps
      .map((s, idx) => `${idx + 1}. ${s.action}`)
      .filter((line) => line.replace(/^\d+\.\s*/, '').trim() !== '')
      .join('\n');

    const expectedText = tc.steps
      .map((s, idx) => `${idx + 1}. ${s.expectedResult}`)
      .filter((line) => line.replace(/^\d+\.\s*/, '').trim() !== '')
      .join('\n');

    const dataParts: string[] = [];
    if (tc.preconditions.trim()) {
      dataParts.push(`[Pre] ${tc.preconditions.trim()}`);
    }
    tc.steps.forEach((s, idx) => {
      if (s.data.trim()) dataParts.push(`${idx + 1}. ${s.data.trim()}`);
    });

    const noteParts: string[] = [];
    if (tc.priority === 'CRITICAL') {
      noteParts.push('[Priority: Critical/Highest]');
    }
    if (tc.jiraIssueKeys.length > 0) {
      noteParts.push(`Jira: ${tc.jiraIssueKeys.join(', ')}`);
    }
    if (tc.tags.length > 0) {
      noteParts.push(tc.tags.map((t) => `#${t}`).join(' '));
    }
    if (tc.description.trim()) {
      noteParts.push(tc.description.trim());
    }

    row.getCell(1).value = tc.code;
    row.getCell(2).value = tc.title;
    row.getCell(3).value = stepsText;
    row.getCell(4).value = expectedText;
    row.getCell(5).value = '';
    row.getCell(6).value = dataParts.join('\n');
    row.getCell(7).value = tc.createdByName;
    row.getCell(8).value = '';
    row.getCell(9).value = '';
    row.getCell(10).value = '';
    row.getCell(11).value = priorityToVikkiLabel(tc.priority);
    row.getCell(12).value = noteParts.join('\n');

    // Keep text wrapping neat for multi-line steps
    for (let c = 2; c <= 12; c++) {
      const existingAlign = row.getCell(c).alignment || {};
      row.getCell(c).alignment = { ...existingAlign, wrapText: true, vertical: 'top' };
    }
    const estimateWrappedLines = (text: string, charsPerLine: number): number => {
      if (!text) return 1;
      return text
        .split('\n')
        .reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    };

    const maxLines = Math.max(
      1,
      estimateWrappedLines(tc.title, 34),
      estimateWrappedLines(stepsText, 38),
      estimateWrappedLines(expectedText, 34),
      estimateWrappedLines(dataParts.join('\n'), 22),
      estimateWrappedLines(noteParts.join('\n'), 24),
    );
    row.height = Math.max(24, Math.min(220, maxLines * 17 + 10));

    totalCaseCount++;
    currentRow++;
  }

  // Update KẾT QUẢ KIỂM THỬ summary formulas (R24) to cover full exported range accurately
  const formulaEndRow = Math.max(1009, currentRow + 50);
  sheet.getCell('A24').value = {
    formula: `COUNTA(A27:A${formulaEndRow})`,
    result: totalCaseCount,
  };
  sheet.getCell('B24').value = {
    formula: `COUNTIF(J27:J${formulaEndRow},"Passed")`,
    result: 0,
  };
  sheet.getCell('C24').value = {
    formula: `COUNTIF(J27:J${formulaEndRow},"Failed")`,
    result: 0,
  };
  sheet.getCell('D24').value = {
    formula: `COUNTIF(J27:J${formulaEndRow},"Blocked")`,
    result: 0,
  };
  sheet.getCell('E24').value = {
    formula: `COUNTIF(J27:J${formulaEndRow},"Not Test")`,
    result: 0,
  };
  sheet.getCell('F24').value = {
    formula: 'A24-SUM(B24:E24)',
    result: totalCaseCount,
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return stripBrokenCharsetFromXlsx(Buffer.from(arrayBuffer));
}

export interface ExportableRunResultItem {
  code: string;
  suitePath: string[];
  title: string;
  steps: Array<{ action: string; data: string; expectedResult: string }>;
  preconditions: string;
  actualResult: string;
  creatorName: string;
  plannedDate: string;
  executedDate: string;
  executionStatus: ExecutionStatus;
  priority: Priority;
  notes: string;
}

export interface ExportableRunDefectItem {
  bugKey: string;
  title: string;
  severity: DefectSeverity;
  status: string;
  caseCode: string;
  jiraUrl: string;
}

export interface BuildVikkiRunExportOptions {
  projectCode: string;
  projectName: string;
  runTitle: string;
  appVersion: string;
  environment: string;
  docLink?: string;
  executedDateStr?: string;
  items: ExportableRunResultItem[];
  defects: ExportableRunDefectItem[];
}

function executionStatusToVikki(status: ExecutionStatus): string {
  switch (status) {
    case 'PASSED':
      return 'Passed';
    case 'FAILED':
      return 'Failed';
    case 'BLOCKED':
      return 'Blocked';
    case 'NOT_TEST':
      return 'Not Test';
    case 'NOT_EXECUTED':
    default:
      return '';
  }
}

function defectSeverityToVikki(sev: DefectSeverity): string {
  switch (sev) {
    case 'HIGHEST':
      return 'Highest';
    case 'HIGH':
      return 'High';
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
    default:
      return 'Medium';
  }
}

/**
 * Exports a Test Run onto the original Vikki Excel template filling ALL 12/12 columns
 * (including Actual Result, Planned Date, Execution Date, Test Status) AND populating
 * Sheet 2 (DRAW_BUG) so Vikki's BUG STATISTICS formulas (COUNTIF(C:C,"Highest"...)) calculate live.
 */
export async function buildVikkiRunExecutionExportBuffer(
  options: BuildVikkiRunExportOptions,
): Promise<Buffer> {
  const templatePath = getVikkiTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  sanitizeWorkbookFonts(workbook);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('File vikki-template.xlsx không có worksheet hợp lệ');
  }

  const level1Style = snapshotRowStyle(sheet, 27, 12);
  const level2Style = snapshotRowStyle(sheet, 28, 12);
  const caseRowStyle = snapshotRowStyle(sheet, 29, 12);

  const todayStr = options.executedDateStr || formatDateDdMmYyyy(new Date());
  sheet.getCell('C10').value = `${options.projectCode}-RUN-${todayStr.replace(/-/g, '')}`;
  sheet.getCell('C11').value = options.projectName;
  sheet.getCell('C12').value = options.appVersion || '[x.x.x]';
  sheet.getCell('C13').value = options.environment || 'Staging';
  sheet.getCell('C14').value = options.runTitle;
  if (options.docLink) {
    sheet.getCell('C15').value = options.docLink;
  }
  sheet.getCell('C16').value = todayStr;

  const maxExistingRow = Math.max(sheet.rowCount, 1009);
  for (let r = 27; r <= maxExistingRow; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c);
      if (cell.value !== null && cell.value !== undefined) {
        cell.value = null;
      }
    }
    if (r === 27 || r === 28) {
      applyRowStyle(sheet, r, caseRowStyle, 12);
    }
  }

  let currentRow = 27;
  let lastLevel1: string | null = null;
  let lastLevel2: string | null = null;

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let notTest = 0;

  for (const item of options.items) {
    const level1 = item.suitePath[0] || 'Chưa phân loại';
    const level2 = item.suitePath.length > 1 ? item.suitePath.slice(1).join(' / ') : null;

    if (level1 !== lastLevel1) {
      applyRowStyle(sheet, currentRow, level1Style, 12);
      sheet.getRow(currentRow).getCell(2).value = level1;
      sheet.getRow(currentRow).height = 22;
      currentRow++;
      lastLevel1 = level1;
      lastLevel2 = null;
    }

    if (level2 && level2 !== lastLevel2) {
      applyRowStyle(sheet, currentRow, level2Style, 12);
      sheet.getRow(currentRow).getCell(2).value = level2;
      sheet.getRow(currentRow).height = 21;
      currentRow++;
      lastLevel2 = level2;
    }

    applyRowStyle(sheet, currentRow, caseRowStyle, 12);
    const row = sheet.getRow(currentRow);

    const stepsText = item.steps
      .map((s, idx) => `${idx + 1}. ${s.action}`)
      .filter((line) => line.replace(/^\d+\.\s*/, '').trim() !== '')
      .join('\n');
    const expectedText = item.steps
      .map((s, idx) => `${idx + 1}. ${s.expectedResult}`)
      .filter((line) => line.replace(/^\d+\.\s*/, '').trim() !== '')
      .join('\n');

    const dataParts: string[] = [];
    if (item.preconditions.trim()) dataParts.push(`[Pre] ${item.preconditions.trim()}`);
    item.steps.forEach((s, idx) => {
      if (s.data.trim()) dataParts.push(`${idx + 1}. ${s.data.trim()}`);
    });
    const dataText = dataParts.join('\n');

    const statusLabel = executionStatusToVikki(item.executionStatus);
    if (item.executionStatus === 'PASSED') passed++;
    else if (item.executionStatus === 'FAILED') failed++;
    else if (item.executionStatus === 'BLOCKED') blocked++;
    else if (item.executionStatus === 'NOT_TEST') notTest++;

    row.getCell(1).value = item.code;
    row.getCell(2).value = item.title;
    row.getCell(3).value = stepsText;
    row.getCell(4).value = expectedText;
    row.getCell(5).value = item.actualResult;
    row.getCell(6).value = dataText;
    row.getCell(7).value = item.creatorName;
    row.getCell(8).value = item.plannedDate;
    row.getCell(9).value = item.executedDate;
    row.getCell(10).value = statusLabel;
    row.getCell(11).value = priorityToVikkiLabel(item.priority);
    row.getCell(12).value = item.notes;

    // Color-code Status cell J nicely matching execution state
    if (item.executionStatus === 'PASSED') {
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    } else if (item.executionStatus === 'FAILED') {
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    } else if (item.executionStatus === 'BLOCKED') {
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    } else if (item.executionStatus === 'NOT_TEST') {
      row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    }

    for (let c = 2; c <= 12; c++) {
      const existingAlign = row.getCell(c).alignment || {};
      row.getCell(c).alignment = { ...existingAlign, wrapText: true, vertical: 'top' };
    }

    const estimateWrappedLines = (text: string, charsPerLine: number): number => {
      if (!text) return 1;
      return text
        .split('\n')
        .reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    };

    const maxLines = Math.max(
      1,
      estimateWrappedLines(item.title, 34),
      estimateWrappedLines(stepsText, 38),
      estimateWrappedLines(expectedText, 34),
      estimateWrappedLines(item.actualResult, 28),
      estimateWrappedLines(dataText, 22),
      estimateWrappedLines(item.notes, 24),
    );
    row.height = Math.max(24, Math.min(220, maxLines * 17 + 10));
    currentRow++;
  }

  const totalCount = options.items.length;
  const notExecuted = Math.max(0, totalCount - (passed + failed + blocked + notTest));
  const formulaEndRow = Math.max(1009, currentRow + 50);

  sheet.getCell('A24').value = { formula: `COUNTA(A27:A${formulaEndRow})`, result: totalCount };
  sheet.getCell('B24').value = { formula: `COUNTIF(J27:J${formulaEndRow},"Passed")`, result: passed };
  sheet.getCell('C24').value = { formula: `COUNTIF(J27:J${formulaEndRow},"Failed")`, result: failed };
  sheet.getCell('D24').value = { formula: `COUNTIF(J27:J${formulaEndRow},"Blocked")`, result: blocked };
  sheet.getCell('E24').value = { formula: `COUNTIF(J27:J${formulaEndRow},"Not Test")`, result: notTest };
  sheet.getCell('F24').value = { formula: 'A24-SUM(B24:E24)', result: notExecuted };

  // Populate Sheet 2 (DRAW_BUG) with Bugs from this Test Run so COUNTIF(C:C,"Highest"...) works!
  const bugSheet = workbook.worksheets[1];
  if (bugSheet) {
    const bugHeaders = ['Bug ID / Jira Key', 'Mô tả lỗi (Title)', 'Severity', 'Status', 'Testcase ID', 'Jira Link'];
    bugHeaders.forEach((h, idx) => {
      const cell = bugSheet.getRow(1).getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Be Vietnam Pro', family: 2, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B00B4' } };
    });

    let highestCnt = 0;
    let highCnt = 0;
    let mediumCnt = 0;
    let lowCnt = 0;

    options.defects.forEach((d, idx) => {
      const r = idx + 2;
      const sevLabel = defectSeverityToVikki(d.severity);
      if (d.severity === 'HIGHEST') highestCnt++;
      else if (d.severity === 'HIGH') highCnt++;
      else if (d.severity === 'MEDIUM') mediumCnt++;
      else lowCnt++;

      const row = bugSheet.getRow(r);
      const vals = [d.bugKey, d.title, sevLabel, d.status, d.caseCode, d.jiraUrl];
      vals.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: 'Be Vietnam Pro', family: 2, size: 10 };
      });
    });

    // Update cached results in M2:N5 BUG STATISTICS (formulas already exist in template!)
    bugSheet.getCell('N2').value = { formula: 'COUNTIF(C:C,"Highest")', result: highestCnt };
    bugSheet.getCell('N3').value = { formula: 'COUNTIF(C:C,"High")', result: highCnt };
    bugSheet.getCell('N4').value = { formula: 'COUNTIF(C:C,"Medium")', result: mediumCnt };
    bugSheet.getCell('N5').value = { formula: 'COUNTIF(C:C,"Low")', result: lowCnt };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return stripBrokenCharsetFromXlsx(Buffer.from(arrayBuffer));
}

function cellValueToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) return formatDateDdMmYyyy(val);
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((part) => part.text).join('').trim();
    }
    if ('text' in val && typeof val.text === 'string') {
      return val.text.trim();
    }
    if ('result' in val && val.result !== undefined && val.result !== null) {
      if (typeof val.result === 'object' && 'error' in val.result) return '';
      return String(val.result).trim();
    }
  }
  return '';
}

function splitNumberedLines(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:\d+[.)]\s*|[-•]\s*)/, '').trim());
}

function parseStepsFromColumns(
  stepsRaw: string,
  expectedRaw: string,
  dataRaw: string,
): { preconditions: string; steps: Array<{ action: string; data: string; expectedResult: string }> } {
  let preconditions = '';
  const dataLinesRaw = dataRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const stepDataLines: string[] = [];
  for (const line of dataLinesRaw) {
    if (/^\[pre\]/i.test(line)) {
      preconditions = line.replace(/^\[pre\]\s*/i, '').trim();
    } else {
      stepDataLines.push(line.replace(/^(?:\d+[.)]\s*|[-•]\s*)/, '').trim());
    }
  }

  const actionLines = splitNumberedLines(stepsRaw);
  const expectedLines = splitNumberedLines(expectedRaw);

  const maxLen = Math.max(actionLines.length, expectedLines.length);
  if (maxLen === 0) {
    if (stepDataLines.length > 0 && !preconditions) {
      preconditions = stepDataLines.join('\n');
    }
    return { preconditions, steps: [] };
  }

  const steps: Array<{ action: string; data: string; expectedResult: string }> = [];
  for (let i = 0; i < maxLen; i++) {
    steps.push({
      action: actionLines[i] || '',
      data:
        stepDataLines[i] ||
        (i === 0 && stepDataLines.length === 1 && maxLen > 1 ? stepDataLines[0] : ''),
      expectedResult: expectedLines[i] || '',
    });
  }
  return { preconditions, steps };
}

function extractNotesMeta(rawNotes: string, extraTextForJira = ''): {
  jiraIssueKeys: string[];
  tags: string[];
  description: string;
  isCriticalNote: boolean;
} {
  const isCriticalNote = /\[priority:\s*critical/i.test(rawNotes);
  const combinedForJira = `${rawNotes}\n${extraTextForJira}`;
  const jiraMatches = combinedForJira.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) || [];
  const jiraIssueKeys = Array.from(new Set(jiraMatches));

  const tagMatches = rawNotes.match(/#([a-zA-Z0-9_-]+)/g) || [];
  const tags = Array.from(new Set(tagMatches.map((t) => t.slice(1).toLowerCase())));

  const cleanedDesc = rawNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^jira:\s*/i.test(line) &&
        !/^\[priority:/i.test(line) &&
        !/^(?:#[a-zA-Z0-9_-]+\s*)+$/.test(line),
    )
    .join('\n');

  return { jiraIssueKeys, tags, description: cleanedDesc, isCriticalNote };
}

async function fileToMatrix(buffer: Buffer, fileName: string): Promise<string[][]> {
  const isXlsx =
    /\.xlsx$/i.test(fileName) ||
    (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);

  if (isXlsx) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      const colCount = Math.max(12, Math.min(20, row.cellCount));
      for (let c = 1; c <= colCount; c++) {
        cells.push(cellValueToString(row.getCell(c).value));
      }
      if (cells.some((v) => v !== '')) {
        matrix.push(cells);
      }
    });
    return matrix;
  }

  return parseCsv(buffer.toString('utf-8'));
}

export async function parseVikkiOrGenericImport(
  buffer: Buffer,
  fileName: string,
): Promise<{ cases: ParsedImportCase[]; skipped: number }> {
  const matrix = await fileToMatrix(buffer, fileName);
  if (matrix.length < 2) {
    return { cases: [], skipped: 0 };
  }

  // Detect Vikki Vietnamese template header row ("Testcase ID" & "Tên testcase")
  let vikkiHeaderIdx = -1;
  for (let i = 0; i < matrix.length; i++) {
    const lower = matrix[i].map((c) => c.trim().toLowerCase());
    if (
      lower.some((c) => c.includes('testcase id') || c === 'tc id') &&
      lower.some((c) => c.includes('tên testcase') || c.includes('ten testcase'))
    ) {
      vikkiHeaderIdx = i;
      break;
    }
  }

  if (vikkiHeaderIdx !== -1) {
    const headerRow = matrix[vikkiHeaderIdx].map((c) => c.trim().toLowerCase());
    const findCol = (...keywords: string[]): number =>
      headerRow.findIndex((h) => keywords.some((kw) => h.includes(kw)));

    const colId = findCol('testcase id', 'tc id');
    const colTitle = findCol('tên testcase', 'ten testcase');
    const colSteps = findCol('các bước', 'cac buoc');
    const colExpected = findCol('kết quả mong đợi', 'ket qua mong doi');
    const colData = findCol('dữ liệu test', 'du lieu test');
    const colPriority = findCol('mức độ ưu tiên', 'muc do uu tien', 'priority');
    const colNotes = findCol('ghi chú', 'ghi chu', 'note');

    const parsedCases: ParsedImportCase[] = [];
    let skipped = 0;
    let currentParentSuite = '';
    let currentChildSuite = '';
    let lastWasGroupHeader = false;

    for (let r = vikkiHeaderIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      const cell = (idx: number) => (idx >= 0 && row[idx] ? row[idx].trim() : '');

      if (row.some((v) => v.trim().toUpperCase() === 'BUG STATISTICS')) {
        break;
      }

      const idVal = cell(colId);
      const titleVal = cell(colTitle);

      // Suite / Feature group header row (ID empty, Title filled)
      if (!idVal && titleVal) {
        const looksLikeSubGroup = lastWasGroupHeader && Boolean(currentParentSuite);
        if (looksLikeSubGroup) {
          currentChildSuite = titleVal;
        } else {
          currentParentSuite = titleVal;
          currentChildSuite = '';
        }
        lastWasGroupHeader = true;
        continue;
      }

      if (!titleVal) {
        if (idVal) skipped++;
        lastWasGroupHeader = false;
        continue;
      }

      lastWasGroupHeader = false;
      const suiteSegments = [currentParentSuite, currentChildSuite].filter(Boolean);
      const { preconditions, steps } = parseStepsFromColumns(
        cell(colSteps),
        cell(colExpected),
        cell(colData),
      );
      const { jiraIssueKeys, tags, description, isCriticalNote } = extractNotesMeta(
        cell(colNotes),
        currentParentSuite,
      );

      const priority = isCriticalNote ? 'CRITICAL' : vikkiLabelToPriority(cell(colPriority));

      parsedCases.push({
        suiteSegments,
        title: titleVal,
        description,
        preconditions,
        priority,
        severity: 'NORMAL',
        type: 'FUNCTIONAL',
        automationStatus: 'MANUAL',
        status: 'ACTIVE',
        tags,
        jiraIssueKeys,
        steps,
      });
    }

    return { cases: parsedCases, skipped };
  }

  // Fallback: Generic CSV / Excel table with "Title" header
  const headerMap = new Map<string, number>();
  matrix[0].forEach((h, idx) => headerMap.set(h.trim().toLowerCase(), idx));
  if (!headerMap.has('title') && !headerMap.has('name') && !headerMap.has('tên')) {
    return { cases: [], skipped: matrix.length };
  }

  const getCell = (row: string[], ...keys: string[]): string => {
    for (const k of keys) {
      const idx = headerMap.get(k);
      if (idx !== undefined && row[idx] !== undefined) return row[idx].trim();
    }
    return '';
  };

  const parsedCases: ParsedImportCase[] = [];
  let skipped = 0;

  for (const row of matrix.slice(1)) {
    const title = getCell(row, 'title', 'name', 'tên');
    if (!title) {
      skipped++;
      continue;
    }

    const rawSteps = getCell(row, 'steps');
    const steps = rawSteps
      ? rawSteps
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            const cleaned = line.replace(/^\d+\.\s*/, '');
            const [left, right] = cleaned.split('=>');
            return {
              action: (left || cleaned).trim(),
              data: '',
              expectedResult: (right || '').trim(),
            };
          })
      : [];

    parsedCases.push({
      suiteSegments: getCell(row, 'suite', 'suite path', 'folder')
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean),
      title,
      description: getCell(row, 'description'),
      preconditions: getCell(row, 'preconditions', 'precondition'),
      priority: vikkiLabelToPriority(getCell(row, 'priority')),
      severity: 'NORMAL',
      type: 'FUNCTIONAL',
      automationStatus: 'MANUAL',
      status: 'ACTIVE',
      tags: getCell(row, 'tags')
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      jiraIssueKeys: getCell(row, 'jira keys', 'jira', 'jira_keys')
        .split(/[,;]/)
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean),
      steps,
    });
  }

  return { cases: parsedCases, skipped };
}
