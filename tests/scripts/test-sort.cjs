const fs = require('fs');
const utilsCode = fs.readFileSync('assets/js/utils.js', 'utf8');

// Mock window and navigator
const window = { addEventListener: () => {} };
const navigator = { serviceWorker: { register: () => Promise.resolve() } };
eval(utilsCode);

const UTILS = window.UTILS;

// Test 1: Numeric IDs (10, 9, 8)
const t1 = [{id: 8}, {id: 10}, {id: 9}];
const r1 = UTILS.sortLatestFirst(t1);
console.log('Test 1 (Numeric ID):', JSON.stringify(r1.map(x=>x.id)) === '[10,9,8]' ? 'PASS' : 'FAIL', r1.map(x=>x.id));

// Test 2: Sequence codes (P-01, P-02, P-03)
const t2 = [{purchase_no: 'P-01'}, {purchase_no: 'P-02'}, {purchase_no: 'P-03'}];
const r2 = UTILS.sortLatestFirst(t2);
console.log('Test 2 (Sequence codes):', JSON.stringify(r2.map(x=>x.purchase_no)) === JSON.stringify(['P-03','P-02','P-01']) ? 'PASS' : 'FAIL', r2.map(x=>x.purchase_no));

// Test 3: No IDs, No codes, No dates (A -> B -> C added in that order)
const t3 = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
const r3 = UTILS.sortLatestFirst(t3);
console.log('Test 3 (A, B, C -> C, B, A):', JSON.stringify(r3.map(x=>x.name)) === JSON.stringify(['C','B','A']) ? 'PASS' : 'FAIL', r3.map(x=>x.name));

// Test 4: Mixed with timestamps
const t4 = [{name: 'A', created_at: '2026-10-01'}, {name: 'B', created_at: '2026-10-05'}];
const r4 = UTILS.sortLatestFirst(t4);
console.log('Test 4 (Timestamps):', JSON.stringify(r4.map(x=>x.name)) === JSON.stringify(['B','A']) ? 'PASS' : 'FAIL', r4.map(x=>x.name));

// Test 5: Empty and single item
console.log('Test 5 (Edge cases):', UTILS.sortLatestFirst([]).length === 0 && UTILS.sortLatestFirst([{id: 1}]).length === 1 ? 'PASS' : 'FAIL');
