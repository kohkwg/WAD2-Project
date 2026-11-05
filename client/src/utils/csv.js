// feature 3: attendance csv import/export.
//
// how to read this file
//   boilerplate   -> skim.
//   ===== huxley  -> your core logic; read it properly.

import Papa from 'papaparse';

// ===== huxley: core logic ===================================================
// tocsv(rows, columns)
// turns an array of objects into csv text. `columns` fixes the column order and
// header names, e.g. [{ key: 'email', label: 'email' }].
// escaping rule (rfc 4180): if a value contains a comma, a double quote or a
// newline, wrap it in double quotes and double any quotes inside it.
//   tan, bob   ->  "tan, bob"
//   say "hi"   ->  "say ""hi"""
// arrays (e.g. fraud_reasons) are joined with "; " so they stay in one cell.
// \r\n line endings because excel expects them.
// ============================================================================

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  const header = columns.map(c => escapeCell(c.label)).join(',');
  const lines = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

// ===== huxley: core logic ===================================================
// parseattendancecsv(file)
// reads an uploaded csv and returns the rows import_attendance expects:
//   [{ email, ticket_code, checked_in_at }]
// papaparse does the hard part (quotes, commas inside quotes, line endings).
// our part is cleaning it up:
//   - headers are matched case-insensitively and ignore spaces/underscores, so
//     "email", "ticket code", "ticket_code" and the headers from our own export
//     all work. that means you can export, edit in excel/sheets, and re-import.
//   - rows with neither an email nor a ticket code are dropped (nothing to match on)
//   - checked_in_at is optional; empty means "now" on the database side
// returns { rows, skipped } so the ui can say how many lines were ignored.
// ============================================================================

const normaliseHeader = h => h.trim().toLowerCase().replace(/[\s_]+/g, '');

const HEADER_ALIASES = {
  email: 'email',
  ticketcode: 'ticket_code',
  ticket: 'ticket_code',
  checkedinat: 'checked_in_at',
  checkedin: 'checked_in_at'
};

export function parseAttendanceCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: h => HEADER_ALIASES[normaliseHeader(h)] ?? normaliseHeader(h),
      error: reject,
      complete: ({
        data
      }) => {
        const rows = [];
        let skipped = 0;
        for (const r of data) {
          const email = (r.email ?? '').trim();
          const ticketCode = (r.ticket_code ?? '').trim();
          if (!email && !ticketCode) {
            skipped++;
            continue;
          }
          rows.push({
            email,
            ticket_code: ticketCode,
            checked_in_at: (r.checked_in_at ?? '').trim()
          });
        }
        resolve({
          rows,
          skipped
        });
      }
    });
  });
}

// boilerplate: make the browser download a text file.

export function downloadCsv(filename, text) {
  // ﻿ (bom) makes excel open utf-8 names (e.g. chinese characters) correctly
  const blob = new Blob(['﻿' + text], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
