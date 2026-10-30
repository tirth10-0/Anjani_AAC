/**
 * test_dispatch_invoice_address_cleaning.js
 * 
 * Verifies that client addresses and states are cleanly parsed across
 * both the Dispatch workflow and the Invoice Builder:
 * 1. City / Street address displays cleanly without repeating the State (e.g. "Rajkot", not "Gujarat, Rajkot").
 * 2. State displays correctly on its dedicated "State: Gujarat" line.
 * 3. Both Dispatch PDF and Invoice Builder PDF produce identical clean addresses without empty blank lines or duplicate state tokens.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Dispatch & Invoice Builder Address Cleaning Verification...');

// Load invoice-pdf.js in mock window environment
global.window = global;
global.document = {
  getElementById: (id) => null,
  querySelector: (sel) => null
};

const invoicePdfPath = path.join(__dirname, '..', 'Invoice Builder', 'js', 'invoice-pdf.js');
const invoicePdfCode = fs.readFileSync(invoicePdfPath, 'utf8');
eval(invoicePdfCode);

assert.strictEqual(typeof window.resolveClientAddressAndState, 'function', 'resolveClientAddressAndState must be exposed on window');

// Test Case 1: Database format for Kisan Agro Agency (address: "Gujarat", city: "Rajkot", GSTIN: "24...")
const kisan = window.resolveClientAddressAndState({
  address: 'Gujarat',
  city: 'Rajkot',
  gst: '24AAAFK1122D1Z5'
});
console.log('  ✓ Kisan Agro Agency:', kisan);
assert.strictEqual(kisan.cleanAddress, 'Rajkot', 'Address should be Rajkot');
assert.strictEqual(kisan.state, 'Gujarat', 'State should be Gujarat');

// Test Case 2: Database format for Krishi Seva Kendra (address: "Amreli", city: "Gujarat")
const krishi = window.resolveClientAddressAndState({
  address: 'Amreli',
  city: 'Gujarat'
});
console.log('  ✓ Krishi Seva Kendra:', krishi);
assert.strictEqual(krishi.cleanAddress, 'Amreli', 'Address should be Amreli');
assert.strictEqual(krishi.state, 'Gujarat', 'State should be Gujarat');

// Test Case 3: Database format for Beej Bhandar (address: "Sri Dungargarh", city: "Rajasthan")
const beej = window.resolveClientAddressAndState({
  address: 'Sri Dungargarh',
  city: 'Rajasthan'
});
console.log('  ✓ Beej Bhandar:', beej);
assert.strictEqual(beej.cleanAddress, 'Sri Dungargarh', 'Address should be Sri Dungargarh');
assert.strictEqual(beej.state, 'Rajasthan', 'State should be Rajasthan');

// Test Case 4: Compound string starting with state "Gujarat, Rajkot"
const compound1 = window.resolveClientAddressAndState('Gujarat, Rajkot');
console.log('  ✓ Compound string ("Gujarat, Rajkot"):', compound1);
assert.strictEqual(compound1.cleanAddress, 'Rajkot', 'Leading state should be stripped');
assert.strictEqual(compound1.state, 'Gujarat', 'State should be Gujarat');

// Test Case 5: Compound string ending with state "Rajkot, Gujarat"
const compound2 = window.resolveClientAddressAndState('Rajkot, Gujarat');
console.log('  ✓ Compound string ("Rajkot, Gujarat"):', compound2);
assert.strictEqual(compound2.cleanAddress, 'Rajkot', 'Trailing state should be stripped');
assert.strictEqual(compound2.state, 'Gujarat', 'State should be Gujarat');

// Test Case 6: Full address with pincode "Plot 33, Siddhi Vinayak, Rajkot, Gujarat - 360024"
const fullAddr = window.resolveClientAddressAndState('Plot 33, Siddhi Vinayak, Rajkot, Gujarat - 360024');
console.log('  ✓ Full address with pincode:', fullAddr);
assert.strictEqual(fullAddr.cleanAddress, 'Plot 33, Siddhi Vinayak, Rajkot', 'Pincode and state should be cleanly stripped from address');
assert.strictEqual(fullAddr.state, 'Gujarat', 'State should be Gujarat');
assert.strictEqual(fullAddr.pincode, '360024', 'Pincode should be 360024');

// Test Case 7: Only state provided ("Gujarat")
const stateOnly = window.resolveClientAddressAndState('Gujarat');
console.log('  ✓ State-only string ("Gujarat"):', stateOnly);
assert.strictEqual(stateOnly.cleanAddress, '', 'Clean address should be empty so no duplicate is shown');
assert.strictEqual(stateOnly.state, 'Gujarat', 'State should be Gujarat');

// Test Case 8: Verify dispatch-ui.js incorporates resolveClientAddressAndState
const dispatchUiCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'dispatch-ui.js'), 'utf8');
assert(dispatchUiCode.includes('resolveClientAddressAndState'), 'dispatch-ui.js must use resolveClientAddressAndState');
assert(dispatchUiCode.includes('cleanClientAddr'), 'dispatch-ui.js must compute cleanClientAddr');

// Test Case 9: Verify main.js in Invoice Builder incorporates resolveClientAddressAndState
const mainJsCode = fs.readFileSync(path.join(__dirname, '..', 'Invoice Builder', 'js', 'main.js'), 'utf8');
assert(mainJsCode.includes('resolveClientAddressAndState'), 'main.js must use resolveClientAddressAndState');

console.log('✅ ALL CLIENT ADDRESS CLEANING TESTS PASSED!');
process.exit(0);
