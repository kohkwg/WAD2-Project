<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { BUDGET_CATEGORIES, formatMoney, formatMoneyInput, parseMoneyToCents, summariseBudget } from '../../utils/feature4.js'
import ConfirmationDialog from './ConfirmationDialog.vue'
const props = defineProps({ budget: { type: Object, required: true }, pending: Boolean, actionError: String })
const emit = defineEmits(['saveLimit', 'saveItem', 'deleteItem', 'cancel-action'])
const limit = ref('')
const name = ref('')
const nameInput = ref(null)
const category = ref(BUDGET_CATEGORIES[0])
const planned = ref('')
const actual = ref('')
const editingId = ref(null)
const deleting = ref(null)
const validation = ref('')
const limitError = ref('')
const summary = computed(() => summariseBudget(props.budget))
const money = cents => 'SGD ' + formatMoney(cents).replace('$', '')
const notice = computed(() => ({ unset: 'Set a budget limit to track remaining funds.', normal: 'Spending is below 90% of the limit.', warning: 'Budget warning: at least 90% spent.', reached: 'Budget limit reached: 100% spent.', over: 'Over budget: spending exceeds the limit.' })[summary.value.level])
watch(() => props.budget.limitCents, value => { limit.value = value === null ? '' : formatMoneyInput(value) }, { immediate: true })
function clearDraft() { name.value = ''; category.value = BUDGET_CATEGORIES[0]; planned.value = ''; actual.value = ''; editingId.value = null; validation.value = '' }
function saveLimit() {
  try {
    const cents = limit.value.trim() ? parseMoneyToCents(limit.value) : null
    if (cents !== null && cents <= 0) throw new Error('Budget limit must be greater than zero, or blank to unset.')
    limitError.value = ''; emit('saveLimit', { input: cents })
  } catch (error) { limitError.value = error.message }
}
function saveItem() {
  try {
    if (!name.value.trim()) throw new Error('Enter an item name.')
    const input = { name: name.value.trim(), category: category.value, plannedCents: parseMoneyToCents(planned.value), actualCents: parseMoneyToCents(actual.value, { allowBlank: true }) }
    if (editingId.value) input.id = editingId.value
    const snapshot = [name.value, category.value, planned.value, actual.value, editingId.value]
    validation.value = ''; emit('saveItem', { input, done: () => { if (JSON.stringify(snapshot) === JSON.stringify([name.value, category.value, planned.value, actual.value, editingId.value])) clearDraft() } })
  } catch (error) { validation.value = error.message }
}
function deleteExpense() { const id = deleting.value.id; emit('deleteItem', { id, done: () => { if (editingId.value === id) clearDraft(); deleting.value = null } }) }
function cancelDelete() { deleting.value = null; emit('cancel-action') }
async function focusEditor() {
  await nextTick()
  nameInput.value?.focus({ preventScroll: true })
  nameInput.value?.scrollIntoView({ block: 'center' })
}
function edit(item) {
  editingId.value = item.id; name.value = item.name; category.value = item.category
  planned.value = formatMoneyInput(item.plannedCents); actual.value = formatMoneyInput(item.actualCents); validation.value = ''
  focusEditor()
}
</script>

<template>
  <section aria-labelledby="budget-heading">
    <div class="tool-heading">
      <div><h2 id="budget-heading" tabindex="-1">Budget</h2><p class="tool-description">Compare planned and actual expenses in Singapore dollars.</p></div>
      <button id="budget-new-expense" class="btn btn-outline-primary" type="button" :disabled="pending" @click="focusEditor">{{ editingId ? 'Continue editing' : 'New expense' }}</button>
    </div>

    <dl class="budget-totals workspace-panel">
      <div><dt>Budget limit</dt><dd>{{ budget.limitCents === null ? 'Not set' : money(budget.limitCents) }}</dd></div>
      <div><dt>Planned total</dt><dd>{{ money(summary.plannedCents) }}</dd></div>
      <div><dt>Actual total</dt><dd>{{ money(summary.actualCents) }}</dd></div>
      <div><dt>Remaining budget</dt><dd :class="{ 'text-danger': summary.remainingCents < 0 }">{{ summary.remainingCents === null ? 'Not set' : money(summary.remainingCents) }}</dd></div>
    </dl>
    <div class="alert" :class="summary.level === 'over' ? 'alert-danger' : ['warning', 'reached'].includes(summary.level) ? 'alert-warning' : 'alert-light border'" role="status">{{ notice }}<span v-if="summary.percentage !== null"> {{ summary.percentage.toFixed(1) }}% used.</span></div>

    <form class="budget-limit-form mb-4" @submit.prevent="saveLimit">
      <fieldset :disabled="pending">
        <label for="budget-limit" class="form-label">Budget limit (SGD)</label>
        <div class="d-flex flex-wrap gap-2"><input id="budget-limit" v-model="limit" type="text" inputmode="decimal" class="form-control limit-input" aria-describedby="budget-limit-help" /><button type="submit" class="btn btn-outline-primary">Save limit</button></div>
        <p id="budget-limit-help" class="form-text mb-0">Leave blank to unset. A set limit must be greater than zero.</p>
        <p v-if="limitError" role="alert" class="text-danger mt-2 mb-0">{{ limitError }}</p>
      </fieldset>
    </form>

    <h3 class="section-heading">Expenses</h3>
    <p v-if="!budget.items.length" class="text-secondary">No expenses yet. Add your first item below.</p>
    <div v-else class="expense-list workspace-panel">
      <article v-for="item in budget.items" :key="item.id" class="expense-row">
        <div class="expense-identity"><h4 class="h6 item-name mb-1">{{ item.name }}</h4><p class="small text-secondary mb-0">{{ item.category }}</p></div>
        <dl class="cost-comparison">
          <div><dt>Planned</dt><dd>{{ money(item.plannedCents) }}</dd></div>
          <div><dt>Actual</dt><dd>{{ money(item.actualCents) }}</dd></div>
          <div><dt>Actual − planned</dt><dd :class="{ 'text-danger': item.actualCents > item.plannedCents }">{{ money(item.actualCents - item.plannedCents) }}</dd></div>
        </dl>
        <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-outline-primary" :disabled="pending" :aria-label="'Edit expense: ' + item.name" @click="edit(item)">Edit</button><button type="button" class="btn btn-sm btn-outline-danger" :disabled="pending" :aria-label="'Delete expense: ' + item.name" @click="deleting = item">Delete</button></div>
      </article>
    </div>

    <form class="workspace-panel expense-editor mt-4" @submit.prevent="saveItem">
      <h3 class="section-heading">{{ editingId ? 'Edit expense' : 'New expense' }}</h3>
      <fieldset :disabled="pending">
        <div class="row g-3">
          <div class="col-md-6"><label for="budget-name" class="form-label">Item name</label><input id="budget-name" ref="nameInput" v-model="name" class="form-control" required /></div>
          <div class="col-md-6"><label for="budget-category" class="form-label">Category</label><select id="budget-category" v-model="category" class="form-select"><option v-for="option in BUDGET_CATEGORIES" :key="option">{{ option }}</option></select></div>
          <div class="col-md-6"><label for="budget-planned" class="form-label">Planned cost (SGD)</label><input id="budget-planned" v-model="planned" type="text" inputmode="decimal" class="form-control" required /></div>
          <div class="col-md-6"><label for="budget-actual" class="form-label">Actual cost (SGD)</label><input id="budget-actual" v-model="actual" type="text" inputmode="decimal" class="form-control" aria-describedby="actual-help" /><div id="actual-help" class="form-text">Blank means zero spent.</div></div>
        </div>
        <p v-if="validation" class="text-danger mt-2" role="alert">{{ validation }}</p>
        <div class="d-flex flex-wrap gap-2 mt-3"><button type="submit" class="btn btn-primary">Save item</button><button v-if="editingId" type="button" class="btn btn-outline-secondary" @click="clearDraft">Cancel edit</button></div>
      </fieldset>
    </form>
    <ConfirmationDialog v-if="deleting" title="Delete expense?" focus-fallback="#budget-new-expense" :pending="pending" :error="actionError" @cancel="cancelDelete" @confirm="deleteExpense"><p>Delete “{{ deleting.name }}” and remove its costs from the totals?</p></ConfirmationDialog>
  </section>
</template>
<style scoped>
.limit-input { max-width: 18rem; }
.expense-editor { max-width: 56rem; padding: clamp(1rem, 2vw, 1.4rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.item-name, dd { overflow-wrap: anywhere; }
.budget-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1rem; padding: .85rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-glass-solid); }
.budget-totals > div { min-width: 0; padding: .85rem; border: 1px solid var(--bookedz-border); border-radius: .8rem; background: var(--bookedz-surface); }
.budget-totals dt, .cost-comparison dt { color: var(--bookedz-muted); font-size: .78rem; font-weight: 600; margin-bottom: .3rem; }
.budget-totals dd { color: var(--bookedz-ink); font-size: clamp(1rem, 2vw, 1.25rem); font-weight: 700; margin: 0; font-variant-numeric: tabular-nums; }
.budget-totals > div:last-child dd { color: var(--bookedz-primary-dark); }
.expense-row { display: grid; gap: 1rem; padding: 1.1rem 0; border-bottom: 1px solid var(--bookedz-border); }
.expense-row:first-child { padding-top: 0; }
.expense-row:last-child { border-bottom: 0; padding-bottom: 0; }
.cost-comparison { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin: 0; }
.cost-comparison > div { min-width: 0; }
.cost-comparison dd { color: var(--bookedz-ink); font-size: .875rem; font-weight: 650; margin: 0; font-variant-numeric: tabular-nums; }
.expense-list { border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); }
.budget-limit-form { max-width: 48rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: .95rem; background: var(--bookedz-surface); }
.budget-limit-form .btn, .expense-editor .btn, .expense-row .btn { min-height: 44px; }
.budget-totals, .expense-list { box-shadow: var(--bookedz-card-shadow); }
@media (min-width: 992px) { .budget-totals { grid-template-columns: repeat(4, minmax(0, 1fr)); } .expense-row { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto; align-items: center; } }
@media (max-width: 399.98px) { .cost-comparison { grid-template-columns: 1fr; gap: .5rem; } }
</style>
