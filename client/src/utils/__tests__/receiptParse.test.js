import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptDate, parseReceiptText } from '../receiptParse.js';
test('reads item lines and skips totals, tax and payment lines', () => {
  const text = ['CAFE DINO', 'Iced latte      5.50', '2 x Croissant  $7.80', 'Subtotal 13.30', 'GST 9% 1.20', 'TOTAL  14.50', 'CASH 20.00', 'Change 5.50', 'Thank you!'].join('\n');
  assert.deepEqual(parseReceiptText(text), [{
    name: 'Iced latte',
    cents: 550
  }, {
    name: 'Croissant',
    cents: 780
  }]);
});
test('ignores lines without a name or a price', () => {
  assert.deepEqual(parseReceiptText('12.50\nHello world\n--- 3.00'), []);
  assert.deepEqual(parseReceiptText(''), []);
});
test('drops a misread total and its repeat when they equal the items above', () => {
  const text = ['2X4X PREMIUM STUD 11.96', 'DEALT 20V DRILL KIT 149.00', 'GORILLA GLUE 6.97', 'TX (7.5%) 12.50', 'Tora 180.52', 'AHOUNT 180.52'].join('\n');
  assert.deepEqual(parseReceiptText(text).map(item => item.name), ['2X4X PREMIUM STUD', 'DEALT 20V DRILL KIT', 'GORILLA GLUE']);
});
test('reads a day-first receipt date and time', () => {
  assert.equal(parseReceiptDate('Tora 5.00\n03/11/2026 14:35'), '2026-11-03T14:35');
  assert.equal(parseReceiptDate('12-01-26'), '2026-01-12T12:00');
  assert.equal(parseReceiptDate('31/02/2026'), '');
  assert.equal(parseReceiptDate('no date here'), '');
});
