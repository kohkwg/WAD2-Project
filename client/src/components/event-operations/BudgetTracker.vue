<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { FALLBACK_BUDGET_CATEGORY, MAX_CATEGORY_LENGTH, MAX_QUANTITY, budgetCategoryOptions, formatMoney, formatMoneyInput, lineTotalCents, parseMoneyToCents, parseQuantity, summariseBudget, validateCategoryName } from '../../utils/feature4.js';
import { parseReceiptDate, parseReceiptText } from '../../utils/receiptParse.js';
import { toDateTimeInputValue } from '../../utils/helpers.js';
import ConfirmationDialog from './ConfirmationDialog.vue';

const props = defineProps({
  budget: {
    type: Object,
    required: true
  },
  customCategories: {
    type: Array,
    default: () => []
  },
  pending: Boolean,
  actionError: String
});

const emit = defineEmits(['saveLimit', 'saveItem', 'deleteItem', 'saveCategory', 'deleteCategory', 'cancel-action']);

const categoryOptions = computed(() => budgetCategoryOptions(props.customCategories));

const summary = computed(() => summariseBudget(props.budget));

const money = cents => 'SGD ' + formatMoney(cents).replace('$', '');

const notice = computed(() => ({
  unset: 'Set a budget limit to track remaining funds.',
  normal: 'Spending is below 90% of the limit.',
  warning: 'Budget warning: at least 90% spent.',
  reached: 'Budget limit reached: 100% spent.',
  over: 'Over budget: spending exceeds the limit.'
})[summary.value.level]);

// spreadsheet rows: every saved expense is an editable row; a change saves when the cell loses focus or enter is pressed.

const rows = ref([]);

const rowErrors = ref({});

/**
 * Make an editable row from a saved expense.
 * Cells show unit costs. The saved item keeps line totals in exact cents.
 * The `saved` text lets commitRow skip a row that did not change.
 * @param {object} item The saved expense.
 * @returns {object} The row for the sheet.
 */
function toRow(item) {
  const count = item.quantity ?? 1;
  const planned = formatMoneyInput(item.plannedCents / count);
  const actual = formatMoneyInput(item.actualCents / count);
  const purchased = item.purchasedAt ? toDateTimeInputValue(new Date(item.purchasedAt)) : '';
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    quantity: String(count),
    planned,
    actual,
    purchased,
    lineActual: item.actualCents,
    linePlanned: item.plannedCents,
    saved: JSON.stringify([item.name, item.category, String(count), planned, actual, purchased])
  };
}

watch(() => props.budget.items, items => {
  rows.value = items.map(toRow);
  rowErrors.value = {};
}, {
  immediate: true,
  deep: true
});

function rowInput(row) {
  if (!row.name.trim()) throw new Error('Enter an item name.');
  const count = parseQuantity(row.quantity);
  return {
    name: row.name.trim(),
    category: row.category,
    quantity: count,
    plannedCents: lineTotalCents(parseMoneyToCents(row.planned), count),
    actualCents: lineTotalCents(parseMoneyToCents(row.actual, {
      allowBlank: true
    }), count),
    purchasedAt: row.purchased ? new Date(row.purchased).toISOString() : null
  };
}

function commitRow(row) {
  if (props.pending) return;
  if (JSON.stringify([row.name, row.category, row.quantity, row.planned, row.actual, row.purchased]) === row.saved) return;
  try {
    const input = {
      ...rowInput(row),
      id: row.id
    };
    rowErrors.value = {
      ...rowErrors.value,
      [row.id]: ''
    };
    emit('saveItem', {
      input
    });
  } catch (error) {
    rowErrors.value = {
      ...rowErrors.value,
      [row.id]: error.message
    };
  }
}

// A cell with invalid text shows the last saved total.
const rowTotal = row => {
  try {
    return lineTotalCents(parseMoneyToCents(row.actual, {
      allowBlank: true
    }), parseQuantity(row.quantity));
  } catch {
    return row.lineActual;
  }
};

// the last row of the sheet adds an expense. after saving it clears and stays ready for the next one.

const blank = () => ({
  name: '',
  category: categoryOptions.value[0],
  quantity: '1',
  planned: '',
  actual: '',
  purchased: ''
});

const draft = ref(blank());

const draftError = ref('');

const draftName = ref(null);

watch(categoryOptions, options => {
  if (!options.includes(draft.value.category)) draft.value.category = FALLBACK_BUDGET_CATEGORY;
});

function addDraft() {
  if (props.pending) return;
  try {
    const input = rowInput(draft.value);
    draftError.value = '';
    const snapshot = JSON.stringify(draft.value);
    emit('saveItem', {
      input,
      done: () => {
        if (snapshot === JSON.stringify(draft.value)) {
          draft.value = blank();
          nextTick(() => draftName.value?.focus());
        }
      }
    });
  } catch (error) {
    draftError.value = error.message;
  }
}

// budget limit sits in the summary strip.

const limit = ref('');

const limitError = ref('');

watch(() => props.budget.limitCents, value => {
  limit.value = value === null ? '' : formatMoneyInput(value);
}, {
  immediate: true
});

function saveLimit() {
  try {
    const cents = limit.value.trim() ? parseMoneyToCents(limit.value) : null;
    if (cents !== null && cents <= 0) throw new Error('Budget limit must be greater than zero, or blank to unset.');
    limitError.value = '';
    if (cents !== props.budget.limitCents) emit('saveLimit', {
      input: cents
    });
  } catch (error) {
    limitError.value = error.message;
  }
}

const spendBar = computed(() => {
  const items = props.budget.items.filter(item => item.actualCents > 0).sort((a, b) => a.actualCents - b.actualCents);
  const limitCents = props.budget.limitCents;
  // Use the larger value as the scale, so the segments stay inside the bar.
  const scaleCents = Math.max(limitCents ?? 0, summary.value.actualCents);
  const segments = items.map((item, index) => ({
    id: item.id,
    name: item.name,
    cents: item.actualCents,
    width: item.actualCents / scaleCents * 100,
    shade: Math.round(35 + 65 * (index + 1) / items.length)
  }));
  const limitAt = limitCents !== null && summary.value.actualCents > limitCents ? limitCents / scaleCents * 100 : null;
  return {
    segments,
    limitAt
  };
});

const spendBarLabel = computed(() => 'Actual spending ' + money(summary.value.actualCents) + (props.budget.limitCents === null ? ', no budget limit set' : ' of ' + money(props.budget.limitCents) + ' budget limit'));

// delete stays behind a confirmation.

const deleting = ref(null);

function deleteExpense() {
  const id = deleting.value.id;
  emit('deleteItem', {
    id,
    done: () => {
      deleting.value = null;
    }
  });
}

function cancelDelete() {
  deleting.value = null;
  emit('cancel-action');
}

// categories

const newCategory = ref('');

const categoryError = ref('');

const deletingCategory = ref(null);

const deletingCategoryCount = computed(() => props.budget.items.filter(item => item.category === deletingCategory.value).length);

function addCategory() {
  try {
    const value = validateCategoryName(newCategory.value, props.customCategories);
    categoryError.value = '';
    emit('saveCategory', {
      name: value,
      done: () => {
        if (newCategory.value.trim().replace(/\s+/g, ' ') === value) newCategory.value = '';
      }
    });
  } catch (error) {
    categoryError.value = error.message;
  }
}

function deleteCategory() {
  emit('deleteCategory', {
    name: deletingCategory.value,
    done: () => {
      deletingCategory.value = null;
    }
  });
}

function cancelCategoryDelete() {
  deletingCategory.value = null;
  emit('cancel-action');
}

// receipt scanner: text is read in the browser (tesseract.js, loaded only when used); the photo is not uploaded.

const scanInput = ref(null);

const scanning = ref(false);

const scanProgress = ref(0);

const scanError = ref('');

const scanned = ref([]); // [{ key, include, name, amount, category }]

const scannedDate = ref('');

const importing = ref(false);

async function scanReceipt(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    scanError.value = 'Choose a photo or screenshot of the receipt (JPG or PNG).';
    return;
  }
  scanning.value = true;
  scanProgress.value = 0;
  scanError.value = '';
  scanned.value = [];
  try {
    const {
      createWorker
    } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      logger: message => {
        if (message.status === 'recognizing text') scanProgress.value = Math.round(message.progress * 100);
      }
    });
    try {
      const {
        data
      } = await worker.recognize(file);
      const found = parseReceiptText(data.text);
      scannedDate.value = parseReceiptDate(data.text);
      if (!found.length) throw new Error('No item lines found. Try a clearer, straight-on photo, or type the expenses in.');
      scanned.value = found.map((item, index) => ({
        key: index,
        include: true,
        name: item.name,
        amount: formatMoneyInput(item.cents),
        category: FALLBACK_BUDGET_CATEGORY
      }));
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    scanError.value = error.message || 'The receipt could not be read.';
  } finally {
    scanning.value = false;
  }
}

const scannedValid = computed(() => scanned.value.filter(line => line.include).map(line => {
  try {
    const cents = parseMoneyToCents(line.amount);
    return line.name.trim() ? {
      name: line.name.trim(),
      category: line.category,
      cents
    } : null;
  } catch {
    return null;
  }
}).filter(Boolean));
// one expense at a time. the parent ignores a save while another is pending and clears that flag just after `done`, so the next one waits a tick.

function importScanned() {
  const queue = [...scannedValid.value];
  if (!queue.length || importing.value) return;
  importing.value = true;
  const next = () => {
    const line = queue.shift();
    if (!line) {
      importing.value = false;
      scanned.value = [];
      return;
    }
    emit('saveItem', {
      input: {
        name: line.name,
        category: line.category,
        quantity: 1,
        plannedCents: line.cents,
        actualCents: line.cents,
        purchasedAt: scannedDate.value ? new Date(scannedDate.value).toISOString() : null
      },
      done: () => setTimeout(next),
      failed: () => {
        importing.value = false;
      }
    });
  };
  next();
}
</script>

<template>
  <section aria-labelledby="budget-heading" class="budget-sheet">
    <div class="tool-heading">
      <div>
      <h2 id="budget-heading" tabindex="-1">Budget</h2>
      <p class="tool-description">Type straight into the sheet. Changes save when you leave a cell.</p></div>
      <div class="d-flex flex-wrap gap-2">
        <input
        ref="scanInput"
        type="file"
        accept="image/*"
        class="visually-hidden"
        tabindex="-1"
        aria-label="Receipt photo"
        @change="scanReceipt" />
        <button
        type="button"
        class="btn btn-outline-primary"
        :disabled="pending || scanning || importing"
        @click="scanInput.click()">{{ scanning ? 'Reading receipt… ' + scanProgress + '%' : 'Scan receipt' }}</button>
      </div>
    </div>

    <p v-dismissible v-if="scanError" class="alert alert-warning" role="alert">{{ scanError }}</p>
    <form v-if="scanned.length" class="workspace-panel scan-review" @submit.prevent="importScanned">
      <h3 class="section-heading">Check the receipt</h3>
      <p class="form-text mt-0">Fix any misreads, untick lines you don't want, then add them as expenses.</p>
      <div class="scan-date">
      <label for="scan-date" class="form-label mb-0">Purchased</label>
      <input
        id="scan-date"
        v-model="scannedDate"
        type="datetime-local"
        class="form-control"
        aria-describedby="scan-date-help" />
      <span id="scan-date-help" class="form-text">Read from the receipt when possible. Applies to every line below.</span></div>
      <ul class="scan-lines">
        <li v-for="line in scanned" :key="line.key">
          <input v-model="line.include" type="checkbox" :aria-label="'Include ' + line.name" />
          <input v-model="line.name" class="form-control" :aria-label="'Item name for ' + line.name" />
          <select
          v-model="line.category"
          class="form-select"
          aria-label="Category">
          <option v-for="option in categoryOptions" :key="option">{{ option }}</option></select>
          <input v-model="line.amount" class="form-control amount" inputmode="decimal" aria-label="Amount (SGD)" />
        </li>
      </ul>
      <div class="d-flex flex-wrap gap-2 mt-3">
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="!scannedValid.length || importing">{{ importing ? 'Adding…' : 'Add ' + scannedValid.length + ' expense' + (scannedValid.length === 1 ? '' : 's') }}</button>
      <button
        type="button"
        class="btn btn-outline-secondary"
        :disabled="importing"
        @click="scanned = []">Discard</button></div>
    </form>

    <div class="workspace-panel sheet-summary">
      <dl class="budget-totals">
        <div>
        <dt>Planned</dt>
        <dd>{{ money(summary.plannedCents) }}</dd></div>
        <div>
        <dt>Actual</dt>
        <dd>{{ money(summary.actualCents) }}</dd></div>
        <div>
        <dt>Remaining</dt>
        <dd :class="{ 'text-danger': summary.remainingCents < 0 }">{{ summary.remainingCents === null ? 'Not set' : money(summary.remainingCents) }}</dd></div>
        <div class="limit-cell">
        <dt>
          <label for="budget-limit">Budget limit (SGD)</label></dt>
        <dd>
          <input
            id="budget-limit"
            v-model="limit"
            type="text"
            inputmode="decimal"
            class="form-control"
            placeholder="No limit"
            :disabled="pending"
            aria-describedby="budget-limit-help"
            @change="saveLimit"
            @keydown.enter.prevent="saveLimit" /></dd></div>
      </dl>
      <p id="budget-limit-help" class="visually-hidden">Leave blank to unset. A set limit must be greater than zero.</p>
      <p v-dismissible v-if="limitError" role="alert" class="text-danger mb-0">{{ limitError }}</p>
      <div
      v-dismissible
      class="alert mb-0"
      :class="summary.level === 'over' ? 'alert-danger' : ['warning', 'reached'].includes(summary.level) ? 'alert-warning' : 'alert-light border'"
      role="status">{{ notice }}<span v-if="summary.percentage !== null"> {{ summary.percentage.toFixed(1) }}% used.</span></div>
      <figure v-if="spendBar.segments.length" class="spend-bar">
        <div
        class="spend-bar-track"
        :class="{ over: spendBar.limitAt !== null }"
        role="img"
        :aria-label="spendBarLabel">
          <span
          v-for="segment in spendBar.segments"
          :key="segment.id"
          class="spend-bar-segment"
          :style="{ width: segment.width + '%', '--shade': segment.shade + '%' }"
          :title="segment.name + ': ' + money(segment.cents)"></span>
          <span
          v-if="spendBar.limitAt !== null"
          class="spend-bar-limit"
          :style="{ left: spendBar.limitAt + '%' }"
          title="Budget limit"></span>
        </div>
      </figure>
    </div>

    <div class="workspace-panel sheet-wrap">
      <table class="sheet">
        <caption class="visually-hidden">Expenses. Edit any cell; it saves when you leave it.</caption>
        <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Category</th>
          <th scope="col" class="num">Qty</th>
          <th scope="col" class="num">Planned each</th>
          <th scope="col" class="num">Actual each</th>
          <th scope="col" class="num">Line total</th>
          <th scope="col">Purchased</th>
          <th scope="col">
            <span class="visually-hidden">Delete</span></th></tr></thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <tr>
              <td>
              <input
                v-model="row.name"
                class="cell"
                :aria-label="'Item name, ' + row.name"
                :disabled="pending"
                @change="commitRow(row)"
                @keydown.enter.prevent="commitRow(row)" /></td>
              <td>
              <select
                v-model="row.category"
                class="cell"
                :aria-label="'Category for ' + row.name"
                :disabled="pending"
                @change="commitRow(row)">
                <option v-for="option in categoryOptions" :key="option">{{ option }}</option></select></td>
              <td class="num">
              <input
                v-model="row.quantity"
                class="cell num"
                type="number"
                min="1"
                :max="MAX_QUANTITY"
                step="1"
                inputmode="numeric"
                :aria-label="'Quantity for ' + row.name"
                :disabled="pending"
                @change="commitRow(row)"
                @keydown.enter.prevent="commitRow(row)" /></td>
              <td class="num">
              <input
                v-model="row.planned"
                class="cell num"
                inputmode="decimal"
                :aria-label="'Planned unit cost for ' + row.name"
                :disabled="pending"
                @change="commitRow(row)"
                @keydown.enter.prevent="commitRow(row)" /></td>
              <td class="num">
              <input
                v-model="row.actual"
                class="cell num"
                inputmode="decimal"
                :aria-label="'Actual unit cost for ' + row.name"
                :disabled="pending"
                @change="commitRow(row)"
                @keydown.enter.prevent="commitRow(row)" /></td>
              <td class="num total" :class="{ 'text-danger': rowTotal(row) > row.linePlanned }">{{ money(rowTotal(row)) }}</td>
              <td class="when">
              <input
                v-model="row.purchased"
                type="datetime-local"
                class="cell"
                :aria-label="'Purchase date and time for ' + row.name"
                :disabled="pending"
                @change="commitRow(row)"
                @keydown.enter.prevent="commitRow(row)" /></td>
              <td class="act">
              <button
                type="button"
                class="btn btn-sm btn-link text-danger"
                :disabled="pending"
                :aria-label="'Delete expense: ' + row.name"
                @click="deleting = { id: row.id, name: row.name }">Delete</button></td>
            </tr>
            <tr v-if="rowErrors[row.id]" class="row-error">
            <td v-dismissible colspan="8" role="alert" class="text-danger">{{ rowErrors[row.id] }}</td></tr>
          </template>
          <tr v-if="!rows.length">
          <td colspan="8" class="text-secondary empty">No expenses yet. Add the first one in the last row, or scan a receipt.</td></tr>
          <tr class="add-row" @keydown.enter.prevent="addDraft">
            <td>
            <input
              ref="draftName"
              v-model="draft.name"
              class="cell"
              placeholder="New item…"
              aria-label="New item name"
              :disabled="pending" /></td>
            <td>
            <select
              v-model="draft.category"
              class="cell"
              aria-label="New item category"
              :disabled="pending">
              <option v-for="option in categoryOptions" :key="option">{{ option }}</option></select></td>
            <td class="num">
            <input
              v-model="draft.quantity"
              class="cell num"
              type="number"
              min="1"
              :max="MAX_QUANTITY"
              step="1"
              inputmode="numeric"
              aria-label="New item quantity"
              :disabled="pending" /></td>
            <td class="num">
            <input
              v-model="draft.planned"
              class="cell num"
              inputmode="decimal"
              placeholder="0.00"
              aria-label="New item planned unit cost"
              :disabled="pending" /></td>
            <td class="num">
            <input
              v-model="draft.actual"
              class="cell num"
              inputmode="decimal"
              placeholder="0.00"
              aria-label="New item actual unit cost"
              :disabled="pending" /></td>
            <td class="num total"></td>
            <td class="when">
            <input
              v-model="draft.purchased"
              type="datetime-local"
              class="cell"
              aria-label="New item purchase date and time"
              :disabled="pending" /></td>
            <td class="act">
            <button type="button" class="btn btn-sm btn-primary" :disabled="pending" @click="addDraft">Add</button></td>
          </tr>
        </tbody>
      </table>
      <p v-dismissible v-if="draftError" role="alert" class="text-danger mt-2 mb-0">{{ draftError }}</p>
      <p class="form-text mb-0 mt-2">Press Enter on the last row to add it and keep going. Leave "Actual each" blank until you've spent it.</p>
    </div>

    <details class="workspace-panel category-manager mt-3">
      <summary>Categories</summary>
      <p class="form-text mt-2">Deleting a category moves its expenses to {{ FALLBACK_BUDGET_CATEGORY }}.</p>
      <ul class="category-list">
        <li v-for="option in categoryOptions" :key="option" class="category-chip">
          <span class="item-name">{{ option }}</span>
          <button
          v-if="customCategories.includes(option)"
          type="button"
          class="btn btn-sm btn-link text-danger p-0"
          :disabled="pending"
          :aria-label="'Delete category: ' + option"
          @click="deletingCategory = option">Delete</button>
          <span v-else class="visually-hidden">(built-in)</span>
        </li>
      </ul>
      <form class="d-flex flex-wrap gap-2" @submit.prevent="addCategory">
        <label for="budget-category-name" class="visually-hidden">New category</label>
        <input
        id="budget-category-name"
        v-model="newCategory"
        class="form-control limit-input"
        placeholder="New category"
        :maxlength="MAX_CATEGORY_LENGTH"
        autocomplete="off"
        :disabled="pending" />
        <button type="submit" class="btn btn-outline-primary" :disabled="pending">Add category</button>
      </form>
      <p v-dismissible v-if="categoryError" role="alert" class="text-danger mt-2 mb-0">{{ categoryError }}</p>
    </details>

    <ConfirmationDialog
    v-if="deleting"
    title="Delete expense?"
    focus-fallback="#budget-limit"
    :pending="pending"
    :error="actionError"
    @cancel="cancelDelete"
    @confirm="deleteExpense">
    <p>Delete “{{ deleting.name }}” and remove it from the totals?</p></ConfirmationDialog>
    <ConfirmationDialog
    v-if="deletingCategory"
    title="Delete category?"
    focus-fallback="#budget-category-name"
    :pending="pending"
    :error="actionError"
    @cancel="cancelCategoryDelete"
    @confirm="deleteCategory">
    <p>Delete the “{{ deletingCategory }}” category? {{ deletingCategoryCount }} {{ deletingCategoryCount === 1 ? 'expense moves' : 'expenses move' }} to {{ FALLBACK_BUDGET_CATEGORY }}.</p></ConfirmationDialog>
  </section>
</template>

<style scoped>
.limit-input {
  max-width: 18rem;
}

.item-name {
  overflow-wrap: anywhere;
}

.sheet-summary {
  display: grid;
  gap: .75rem;
  margin-bottom: 1rem;
}

.budget-totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .75rem;
  margin: 0;
}

.budget-totals > div {
  min-width: 0;
  padding: .7rem .85rem;
  border: 1px solid var(--bookedz-border);
  border-radius: .8rem;
  background: var(--bookedz-surface);
}

.budget-totals dt, .budget-totals dt label {
  color: var(--bookedz-muted);
  font-size: .78rem;
  font-weight: 600;
  margin-bottom: .2rem;
}

.budget-totals dd {
  margin: 0;
  color: var(--bookedz-ink);
  font-size: clamp(1rem, 2vw, 1.25rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.limit-cell input {
  min-height: 40px;
  font-weight: 700;
}

.sheet-wrap {
  overflow-x: auto;
  padding: .5rem;
}

.sheet .when {
  min-width: 12.5rem;
}

.scan-date {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .5rem .75rem;
  margin-bottom: .75rem;
}

.scan-date input {
  max-width: 15rem;
}

.sheet {
  width: 100%;
  min-width: 60rem;
  border-collapse: separate;
  border-spacing: 0;
  font-size: .92rem;
}

.sheet th {
  padding: .55rem .5rem;
  border-bottom: 2px solid var(--bookedz-ink);
  color: var(--bookedz-muted);
  font-size: .76rem;
  font-weight: 700;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: .04em;
  white-space: nowrap;
}

.sheet td {
  padding: 0;
  border-bottom: 1px solid var(--bookedz-border);
}

.sheet .num {
  text-align: right;
  width: 8rem;
}

.sheet th.num {
  text-align: right;
}

.sheet td.total {
  padding: 0 .75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sheet td.act {
  width: 5.5rem;
  text-align: center;
  padding: 0 .25rem;
}

.cell {
  width: 100%;
  min-height: 44px;
  padding: .4rem .5rem;
  border: 2px solid transparent;
  border-radius: .5rem;
  background: transparent;
  color: var(--bookedz-ink);
  font: inherit;
}

.cell.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cell:hover {
  background: var(--bookedz-glass-hover);
}

.cell:focus {
  outline: none;
  border-color: var(--bookedz-fill);
  background: var(--bookedz-surface);
}

.cell:disabled {
  opacity: .6;
}

.add-row td {
  background: color-mix(in srgb, var(--bookedz-teal) 18%, transparent);
  border-bottom: 0;
}

.add-row .btn {
  min-height: 40px;
}

.sheet .btn-link {
  min-height: 44px;
  text-decoration: none;
}

.empty {
  padding: 1rem .75rem;
}

.row-error td {
  padding: .25rem .75rem;
  font-size: .85rem;
}

.scan-review {
  margin-bottom: 1rem;
}

.scan-lines {
  display: grid;
  gap: .4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.scan-lines li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(7rem, 10rem) 6rem;
  gap: .5rem;
  align-items: center;
}

.category-manager summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  font-weight: 700;
}

.category-list {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  max-width: 100%;
  padding: .35rem .75rem;
  border: 1px solid var(--bookedz-border);
  border-radius: 999px;
  background: var(--bookedz-glass-solid);
}

.category-chip .btn {
  min-height: 44px;
  font-size: .8rem;
}

.spend-bar {
  margin: 0;
}

.spend-bar-track {
  position: relative;
  display: flex;
  height: 1rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bookedz-hover);
}

.spend-bar-track.over {
  outline: 2px solid var(--bookedz-danger);
  outline-offset: 2px;
}

.spend-bar-segment {
  flex: none;
  height: 100%;
  background: color-mix(in srgb, var(--bookedz-primary-dark) var(--shade), var(--bookedz-surface));
  transition: width var(--bookedz-motion-normal) ease;
}

.spend-bar-segment + .spend-bar-segment {
  border-left: 2px solid var(--bookedz-surface);
}

.spend-bar-limit {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  transform: translateX(-50%);
  background: var(--bookedz-danger);
}

@media (prefers-reduced-motion: reduce) {
  .spend-bar-segment {
    transition: none;
  }
}

@media (min-width: 992px) {
  .budget-totals {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 575.98px) {
  .scan-lines li {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .scan-lines li .form-select, .scan-lines li .amount {
    grid-column: 2;
  }
}
</style>
