/**
 * services/emailTemplates.service.js
 *
 * Very small HTML template loader for notification emails.
 *
 * Templates live in: <projectRoot>/email_templates
 *
 * Usage:
 *   const { renderTemplate } = require('./emailTemplates.service');
 *   const html = renderTemplate('user_created.html', { username: 'jsmith' });
 *
 * Placeholders:
 *   {{username}}
 *   {{displayName}}
 *   {{groupsCsv}}
 *
 * Note: This is intentionally lightweight so you can edit the HTML files later
 * without touching JS.
 */

const fs = require('fs');
const path = require('path');

function getTemplatesDir() {
  // This file lives in /services; templates live in /email_templates
  return path.join(__dirname, '..', 'email_templates');
}

function loadTemplateFile(filename) {
  const safeName = path.basename(String(filename || ''));
  const fullPath = path.join(getTemplatesDir(), safeName);
  return fs.readFileSync(fullPath, 'utf8');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(filename, vars) {
  const tpl = loadTemplateFile(filename);
  const data = vars && typeof vars === 'object' ? vars : {};

  // Replace {{key}} with escaped value; allow raw HTML via {{{key}}}
  return tpl
    .replace(/\{\{\{\s*([a-zA-Z0-9_]+)\s*\}\}\}/g, (_, k) =>
      String(data[k] ?? '')
    )
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
      escapeHtml(data[k])
    );
}

function htmlToText(html) {
  // Super-simple fallback text conversion.
  // Keeps this dependency-free; you can improve later if desired.
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  renderTemplate,
  htmlToText,
  getTemplatesDir,
};
