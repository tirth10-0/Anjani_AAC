import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Table Layout & Horizontal Scroll Fix: Companies & Warehouses Verification', async (t) => {
  const companiesHtmlPath = path.join(rootDir, 'pages', 'companies.html');
  const warehousesHtmlPath = path.join(rootDir, 'pages', 'warehouses.html');
  const companiesJsPath = path.join(rootDir, 'assets', 'js', 'companies.js');
  const warehousesJsPath = path.join(rootDir, 'assets', 'js', 'warehouses.js');
  const tablesCssPath = path.join(rootDir, 'assets', 'css', 'tables.css');

  const companiesHtml = fs.readFileSync(companiesHtmlPath, 'utf8');
  const warehousesHtml = fs.readFileSync(warehousesHtmlPath, 'utf8');
  const companiesJs = fs.readFileSync(companiesJsPath, 'utf8');
  const warehousesJs = fs.readFileSync(warehousesJsPath, 'utf8');
  const tablesCss = fs.readFileSync(tablesCssPath, 'utf8');

  await t.test('1. Companies table header column widths sum to 100%', () => {
    assert.match(companiesHtml, /<th style="width:8%">Code<\/th>/);
    assert.match(companiesHtml, /<th style="width:22%">Company Legal Name<\/th>/);
    assert.match(companiesHtml, /<th style="width:10%">Entity Type<\/th>/);
    assert.match(companiesHtml, /<th style="width:13%">GSTIN<\/th>/);
    assert.match(companiesHtml, /<th style="width:10%">Location<\/th>/);
    assert.match(companiesHtml, /<th style="width:11%">Branches & WH<\/th>/);
    assert.match(companiesHtml, /<th style="width:8%">Status<\/th>/);
    assert.match(companiesHtml, /<th style="width:18%;text-align:right;">Actions<\/th>/);

    const widths = [8, 22, 10, 13, 10, 11, 8, 18];
    const sum = widths.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100, 'Sum of column percentages must be exactly 100%');
  });

  await t.test('2. Warehouses table header column widths sum to 100%', () => {
    assert.match(warehousesHtml, /<th style="width:10%">Code<\/th>/);
    assert.match(warehousesHtml, /<th style="width:22%">Warehouse Name<\/th>/);
    assert.match(warehousesHtml, /<th style="width:17%">Legal Entity<\/th>/);
    assert.match(warehousesHtml, /<th style="width:15%">Associated Branch<\/th>/);
    assert.match(warehousesHtml, /<th style="width:11%">Storage Type<\/th>/);
    assert.match(warehousesHtml, /<th style="width:8%">Status<\/th>/);
    assert.match(warehousesHtml, /<th style="width:17%;text-align:right;">Actions<\/th>/);

    const widths = [10, 22, 17, 15, 11, 8, 17];
    const sum = widths.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100, 'Sum of column percentages must be exactly 100%');
  });

  await t.test('3. Scoped CSS for #companies-table and #warehouses-table in tables.css', () => {
    assert.match(tablesCss, /#companies-table\s*\{[^}]*table-layout:\s*fixed;[^}]*width:\s*100%;/s);
    assert.match(tablesCss, /#warehouses-table\s*\{[^}]*table-layout:\s*fixed;[^}]*width:\s*100%;/s);
    assert.match(tablesCss, /#companies-table th,\s*#companies-table td\s*\{[^}]*padding:\s*10px 8px;/s);
    assert.match(tablesCss, /#warehouses-table th,\s*#warehouses-table td\s*\{[^}]*padding:\s*10px 8px;/s);
    assert.match(tablesCss, /#companies-table \.action-btn\s*\{[^}]*width:\s*28px;\s*min-width:\s*28px;\s*height:\s*28px;/s);
    assert.match(tablesCss, /#warehouses-table \.action-btn\s*\{[^}]*width:\s*28px;\s*min-width:\s*28px;\s*height:\s*28px;/s);
  });

  await t.test('4. Compact stacked structures and action preservation in companies.js', () => {
    assert.match(companiesJs, /comp-code-stack/, 'Must have comp-code-stack');
    assert.match(companiesJs, /cell-company-name/, 'Must have cell-company-name');
    assert.match(companiesJs, /location-stack/, 'Must have location-stack');
    assert.match(companiesJs, /facility-badges-stack/, 'Must have facility-badges-stack');
    assert.match(companiesJs, /action-btn-select/, 'Must have action-btn-select');
    assert.match(companiesJs, /action-btn edit/, 'Must preserve edit button');
    assert.match(companiesJs, /action-btn reactivate/, 'Must preserve reactivate button');
    assert.match(companiesJs, /action-btn archive/, 'Must preserve archive button');
    assert.match(companiesJs, /action-btn delete/, 'Must preserve delete button');
    assert.match(companiesJs, /action-active-badge/, 'Must have action-active-badge');
  });

  await t.test('5. Compact stacked structures and action preservation in warehouses.js', () => {
    assert.match(warehousesJs, /wh-code-stack/, 'Must have wh-code-stack');
    assert.match(warehousesJs, /cell-wh-name/, 'Must have cell-wh-name');
    assert.match(warehousesJs, /wh-entity-stack/, 'Must have wh-entity-stack');
    assert.match(warehousesJs, /action-btn view/, 'Must have action-btn view');
    assert.match(warehousesJs, /action-btn edit/, 'Must preserve edit button');
    assert.match(warehousesJs, /action-btn reactivate/, 'Must preserve reactivate button');
    assert.match(warehousesJs, /action-btn archive/, 'Must preserve archive button');
    assert.match(warehousesJs, /action-btn delete/, 'Must preserve delete button');
  });

  await t.test('6. Medium laptop screen breakpoint optimizations (769px - 1150px)', () => {
    assert.match(tablesCss, /@media\s*\(min-width:\s*769px\)\s*and\s*\(max-width:\s*1150px\)/);
    assert.match(tablesCss, /padding:\s*8px 6px;/);
  });

  await t.test('7. User Roles table header column widths sum to 100%', () => {
    const userRolesHtmlPath = path.join(rootDir, 'pages', 'user-roles.html');
    const userRolesHtml = fs.readFileSync(userRolesHtmlPath, 'utf8');

    assert.match(userRolesHtml, /<th style="width:24%;">User \/ Email<\/th>/);
    assert.match(userRolesHtml, /<th style="width:16%;">Assigned Role<\/th>/);
    assert.match(userRolesHtml, /<th style="width:13%;">Company Scope<\/th>/);
    assert.match(userRolesHtml, /<th style="width:11%;">Branch Scope<\/th>/);
    assert.match(userRolesHtml, /<th style="width:11%;">Warehouse Scope<\/th>/);
    assert.match(userRolesHtml, /<th style="width:9%;">Status<\/th>/);
    assert.match(userRolesHtml, /<th style="width:16%;text-align:right;">Actions<\/th>/);

    const widths = [24, 16, 13, 11, 11, 9, 16];
    const sum = widths.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100, 'Sum of column percentages must be exactly 100%');
  });

  await t.test('8. Scoped CSS for #users-table and #users-table-wrap in tables.css', () => {
    assert.match(tablesCss, /#users-table\s*\{[^}]*table-layout:\s*fixed;[^}]*width:\s*100%;/s);
    assert.match(tablesCss, /#users-table th,\s*#users-table td\s*\{[^}]*padding:\s*10px 8px;/s);
    assert.match(tablesCss, /#users-table \.action-btn\s*\{[^}]*width:\s*28px;\s*min-width:\s*28px;\s*height:\s*28px;/s);
    assert.match(tablesCss, /#users-table-wrap \.pagination\s*\{[^}]*width:\s*100%;/s);
  });

  await t.test('9. Compact cell structures and action preservation in user-roles.js', () => {
    const userRolesJsPath = path.join(rootDir, 'assets', 'js', 'user-roles.js');
    const userRolesJs = fs.readFileSync(userRolesJsPath, 'utf8');

    assert.match(userRolesJs, /cell-user-info/, 'Must have cell-user-info');
    assert.match(userRolesJs, /user-avatar-circle/, 'Must have user-avatar-circle');
    assert.match(userRolesJs, /user-email-text/, 'Must have user-email-text');
    assert.match(userRolesJs, /cell-role/, 'Must have cell-role');
    assert.match(userRolesJs, /role-badge-pill/, 'Must have role-badge-pill');
    assert.match(userRolesJs, /cell-company-scope/, 'Must have cell-company-scope');
    assert.match(userRolesJs, /cell-branch-scope/, 'Must have cell-branch-scope');
    assert.match(userRolesJs, /cell-warehouse-scope/, 'Must have cell-warehouse-scope');
    assert.match(userRolesJs, /cell-status/, 'Must have cell-status');
    assert.match(userRolesJs, /cell-actions/, 'Must have cell-actions');
    assert.match(userRolesJs, /action-btn edit/, 'Must preserve edit button');
    assert.match(userRolesJs, /btn-action-revoke/, 'Must preserve revoke button');
    assert.match(userRolesJs, /btn-action-reinstate/, 'Must preserve reinstate button');
    assert.match(userRolesJs, /action-btn delete/, 'Must preserve delete button');
  });

  await t.test('10. Medium laptop screen breakpoint optimizations for #users-table (769px - 1150px)', () => {
    assert.match(tablesCss, /#users-table th,\s*#users-table td\s*\{[^}]*padding:\s*8px 5px;/s);
    assert.match(tablesCss, /#users-table \.action-btn\s*\{[^}]*width:\s*26px;/s);
  });
});

