<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { FALLBACK_BUDGET_CATEGORY, MAX_CATEGORY_LENGTH, MAX_QUANTITY, budgetCategoryOptions, formatMoney, formatMoneyInput, lineTotalCents, parseMoneyToCents, parseQuantity, summariseBudget, validateCategoryName } from '../../utils/feature4.js'
import ConfirmationDialog from './ConfirmationDialog.vue'
const props = defineProps({ budget: { type: Object, required: true }, customCategories: { type: Array, default: () => [] }, pending: Boolean, actionError: String })
const emit = defineEmits(['saveLimit', 'saveItem', 'deleteItem', 'saveCategory', 'deleteCategory', 'cancel-action'])
const categoryOptions = computed(() => budgetCategoryOptions(props.customCategories))
const limit = ref('')
const name = ref('')
const nameInput = ref(null)
const category = ref(categoryOptions.value[0])
const newCategory = ref('')
const categoryError = ref('')
const deletingCategory = ref(null)
const deletingCategoryCount = computed(() => props.budget.items.filter(item => item.category === deletingCategory.value).length)
// A draft whose category was just deleted follows its saved expenses to the fallback.
watch(categoryOptions, options => { if (!options.includes(category.value)) category.value = FALLBACK_BUDGET_CATEGORY })
const quantity = ref('1')
const planned = ref('')
const actual = ref('')
const editingId = ref(null)
const deleting = ref(null)
const validation = ref('')
const limitError = ref('')
const summary = computed(() => summariseBudget(props.budget))
const money = cents => 'SGD ' + formatMoney(cents).replace('$', '')
// Spending bar: one segment per expense with spending, smallest left so the highest actual sits at the right.
const spendBar = computed(() => {
  const items = props.budget.items.filter(item => item.actualCents > 0).sort((a, b) => a.actualCents - b.actualCents)
  const limitCents = props.budget.limitCents
  const scaleCents = Math.max(limitCents ?? 0, summary.value.actualCents)
  const segments = items.map((item, index) => ({ id: item.id, name: item.name, cents: item.actualCents, width: item.actualCents / scaleCents * 100, shade: Math.round(35 + 65 * (index + 1) / items.length) }))
  const limitAt = limitCents !== null && summary.value.actualCents > limitCents ? limitCents / scaleCents * 100 : null
  return { segments, limitAt }
})
const spendBarLabel = computed(() => 'Actual spending ' + money(summary.value.actualCents) + (props.budget.limitCents === null ? ', no budget limit set' : ' of ' + money(props.budget.limitCents) + ' budget limit'))
// Live line totals for the draft; blank while an input is still invalid.
const draftTotals = computed(() => {
  try {
    const count = parseQuantity(quantity.value)
    return { planned: lineTotalCents(parseMoneyToCents(planned.value), count), actual: lineTotalCents(parseMoneyToCents(actual.value, { allowBlank: true }), count) }
  } catch { return null }
})
const notice = computed(() => ({ unset: 'Set a budget limit to track remaining funds.', normal: 'Spending is below 90% of the limit.', warning: 'Budget warning: at least 90% spent.', reached: 'Budget limit reached: 100% spent.', over: 'Over budget: spending exceeds the limit.' })[summary.value.level])
watch(() => props.budget.limitCents, value => { limit.value = value === null ? '' : formatMoneyInput(value) }, { immediate: true })
function clearDraft() { name.value = ''; category.value = categoryOptions.value[0]; quantity.value = '1'; planned.value = ''; actual.value = ''; editingId.value = null; validation.value = '' }
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
    const count = parseQuantity(quantity.value)
    const input = { name: name.value.trim(), category: category.value, quantity: count, plannedCents: lineTotalCents(parseMoneyToCents(planned.value), count), actualCents: lineTotalCents(parseMoneyToCents(actual.value, { allowBlank: true }), count) }
    if (editingId.value) input.id = editingId.value
    const draft = () => JSON.stringify([name.value, category.value, quantity.value, planned.value, actual.value, editingId.value])
    const snapshot = draft()
    validation.value = ''; emit('saveItem', { input, done: () => { if (snapshot === draft()) clearDraft() } })
  } catch (error) { validation.value = error.message }
}
function deleteExpense() { const id = deleting.value.id; emit('deleteItem', { id, done: () => { if (editingId.value === id) clearDraft(); deleting.value = null } }) }
function cancelDelete() { deleting.value = null; emit('cancel-action') }
function addCategory() {
  try {
    const value = validateCategoryName(newCategory.value, props.customCategories)
    categoryError.value = ''; emit('saveCategory', { name: value, done: () => { if (newCategory.value.trim().replace(/\s+/g, ' ') === value) newCategory.value = '' } })
  } catch (error) { categoryError.value = error.message }
}
function deleteCategory() { emit('deleteCategory', { name: deletingCategory.value, done: () => { deletingCategory.value = null } }) }
function cancelCategoryDelete() { deletingCategory.value = null; emit('cancel-action') }
async function focusEditor() {
  await nextTick()
  nameInput.value?.focus({ preventScroll: true })
  nameInput.value?.scrollIntoView({ block: 'center' })
}
function edit(item) {
  // Stored amounts are line totals; the backends guarantee they divide exactly by quantity.
  const count = item.quantity ?? 1
  editingId.value = item.id; name.value = item.name; category.value = item.category; quantity.value = String(count)
  planned.value = formatMoneyInput(item.plannedCents / count); actual.value = formatMoneyInput(item.actualCents / count); validation.value = ''
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

    <figure v-if="spendBar.segments.length" class="spend-bar workspace-panel">
      <figcaption class="spend-bar-caption"><span>Actual spending vs budget</span><span>{{ money(summary.actualCents) }} / {{ budget.limitCents === null ? 'No limit' : money(budget.limitCents) }}</span></figcaption>
      <div class="spend-bar-track" :class="{ over: spendBar.limitAt !== null }" role="img" :aria-label="spendBarLabel">
        <span v-for="segment in spendBar.segments" :key="segment.id" class="spend-bar-segment" :style="{ width: segment.width + '%', '--shade': segment.shade + '%' }" :title="segment.name + ': ' + money(segment.cents)"></span>
        <span v-if="spendBar.limitAt !== null" class="spend-bar-limit" :style="{ left: spendBar.limitAt + '%' }" title="Budget limit"></span>
      </div>
      <ol class="spend-bar-legend">
        <li v-for="segment in spendBar.segments" :key="segment.id"><span class="spend-bar-swatch" :style="{ '--shade': segment.shade + '%' }" aria-hidden="true"></span><span class="item-name">{{ segment.name }}</span> <span class="text-secondary">{{ money(segment.cents) }}</span></li>
      </ol>
    </figure>

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
        <div class="expense-identity"><h4 class="h6 item-name mb-1">{{ item.name }}</h4><p class="small text-secondary mb-0">{{ item.category }} · Qty {{ item.quantity ?? 1 }}<template v-if="(item.quantity ?? 1) > 1"> × {{ money(item.plannedCents / item.quantity) }} planned</template></p></div>
        <dl class="cost-comparison">
          <div><dt>Planned</dt><dd>{{ money(item.plannedCents) }}</dd></div>
          <div><dt>Actual</dt><dd>{{ money(item.actualCents) }}</dd></div>
          <div><dt>Actual − planned</dt><dd :class="{ 'text-danger': item.actualCents > item.plannedCents }">{{ money(item.actualCents - item.plannedCents) }}</dd></div>
        </dl>
        <div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-sm btn-outline-primary" :disabled="pending" :aria-label="'Edit expense: ' + item.name" @click="edit(item)">Edit</button><button type="button" class="btn btn-sm btn-outline-danger" :disabled="pending" :aria-label="'Delete expense: ' + item.name" @click="deleting = item">Delete</button></div>
      </article>
    </div>

    <section class="workspace-panel category-manager mt-4" aria-labelledby="budget-categories-heading">
      <h3 id="budget-categories-heading" class="section-heading">Categories</h3>
      <p class="form-text mt-0">Add categories for this event. Deleting one moves its expenses to {{ FALLBACK_BUDGET_CATEGORY }}.</p>
      <ul class="category-list">
        <li v-for="option in categoryOptions" :key="option" class="category-chip">
          <span class="item-name">{{ option }}</span>
          <button v-if="customCategories.includes(option)" type="button" class="btn btn-sm btn-link text-danger p-0" :disabled="pending" :aria-label="'Delete category: ' + option" @click="deletingCategory = option">Delete</button>
          <span v-else class="visually-hidden">(built-in)</span>
        </li>
      </ul>
      <form @submit.prevent="addCategory">
        <fieldset :disabled="pending">
          <label for="budget-category-name" class="form-label">New category</label>
          <div class="d-flex flex-wrap gap-2"><input id="budget-category-name" v-model="newCategory" class="form-control limit-input" :maxlength="MAX_CATEGORY_LENGTH" autocomplete="off" /><button type="submit" class="btn btn-outline-primary">Add category</button></div>
          <p v-if="categoryError" role="alert" class="text-danger mt-2 mb-0">{{ categoryError }}</p>
        </fieldset>
      </form>
    </section>

    <form class="workspace-panel expense-editor mt-4" @submit.prevent="saveItem">
      <h3 class="section-heading">{{ editingId ? 'Edit expense' : 'New expense' }}</h3>
      <fieldset :disabled="pending">
        <div class="row g-3">
          <div class="col-md-6"><label for="budget-name" class="form-label">Item name</label><input id="budget-name" ref="nameInput" v-model="name" class="form-control" required /></div>
          <div class="col-md-6"><label for="budget-category" class="form-label">Category</label><select id="budget-category" v-model="category" class="form-select"><option v-for="option in categoryOptions" :key="option">{{ option }}</option></select></div>
          <div class="col-md-4"><label for="budget-quantity" class="form-label">Quantity</label><input id="budget-quantity" v-model="quantity" type="number" inputmode="numeric" min="1" :max="MAX_QUANTITY" step="1" class="form-control" required /></div>
          <div class="col-md-4"><label for="budget-planned" class="form-label">Planned unit cost (SGD)</label><input id="budget-planned" v-model="planned" type="text" inputmode="decimal" class="form-control" required /></div>
          <div class="col-md-4"><label for="budget-actual" class="form-label">Actual unit cost (SGD)</label><input id="budget-actual" v-model="actual" type="text" inputmode="decimal" class="form-control" aria-describedby="actual-help" /><div id="actual-help" class="form-text">Blank means zero spent.</div></div>
        </div>
        <p class="form-text mb-0 mt-2" aria-live="polite">{{ draftTotals ? 'Line total: ' + money(draftTotals.planned) + ' planned, ' + money(draftTotals.actual) + ' actual.' : 'Enter a quantity and unit costs to see the line total.' }}</p>
        <p v-if="validation" class="text-danger mt-2" role="alert">{{ validation }}</p>
        <div class="d-flex flex-wrap gap-2 mt-3"><button type="submit" class="btn btn-primary">Save item</button><button v-if="editingId" type="button" class="btn btn-outline-secondary" @click="clearDraft">Cancel edit</button></div>
      </fieldset>
    </form>
    <ConfirmationDialog v-if="deleting" title="Delete expense?" focus-fallback="#budget-new-expense" :pending="pending" :error="actionError" @cancel="cancelDelete" @confirm="deleteExpense"><p>Delete “{{ deleting.name }}” and remove its costs from the totals?</p></ConfirmationDialog>
    <ConfirmationDialog v-if="deletingCategory" title="Delete category?" focus-fallback="#budget-category-name" :pending="pending" :error="actionError" @cancel="cancelCategoryDelete" @confirm="deleteCategory"><p>Delete the “{{ deletingCategory }}” category? <template v-if="deletingCategoryCount">{{ deletingCategoryCount }} {{ deletingCategoryCount === 1 ? 'expense' : 'expenses' }} will move to {{ FALLBACK_BUDGET_CATEGORY }}.</template><template v-else>No expenses use it.</template></p></ConfirmationDialog>
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
.budget-limit-form .btn, .expense-editor .btn, .expense-row .btn, .category-manager form .btn { min-height: 44px; }
.category-manager { max-width: 56rem; padding: clamp(1rem, 2vw, 1.4rem); border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.category-list { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 1rem; padding: 0; list-style: none; }
.category-chip { display: inline-flex; align-items: center; gap: .5rem; min-width: 0; max-width: 100%; padding: .35rem .75rem; border: 1px solid var(--bookedz-border); border-radius: 999px; background: var(--bookedz-glass-solid); font-size: .85rem; }
.category-chip .btn { min-height: 44px; font-size: .8rem; }
.budget-totals, .expense-list { box-shadow: var(--bookedz-card-shadow); }
.spend-bar { margin: 0 0 1.5rem; padding: 1rem; border: 1px solid var(--bookedz-border); border-radius: 1rem; background: var(--bookedz-surface); box-shadow: var(--bookedz-card-shadow); }
.spend-bar-caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; margin-bottom: .6rem; color: var(--bookedz-muted); font-size: .78rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.spend-bar-track { position: relative; display: flex; height: 1.25rem; overflow: hidden; border-radius: 999px; background: var(--bookedz-hover); }
.spend-bar-track.over { outline: 2px solid var(--bookedz-danger); outline-offset: 2px; }
.spend-bar-segment, .spend-bar-swatch { background: color-mix(in srgb, var(--bookedz-primary-dark) var(--shade), var(--bookedz-surface)); }
.spend-bar-segment { flex: none; height: 100%; transition: width var(--bookedz-motion-normal) ease; }
.spend-bar-segment + .spend-bar-segment { border-left: 2px solid var(--bookedz-surface); }
.spend-bar-limit { position: absolute; top: 0; bottom: 0; width: 3px; transform: translateX(-50%); background: var(--bookedz-danger); }
.spend-bar-legend { display: flex; flex-wrap: wrap; gap: .4rem 1rem; margin: .75rem 0 0; padding: 0; list-style: none; font-size: .8rem; }
.spend-bar-legend li { display: flex; align-items: center; gap: .35rem; min-width: 0; }
.spend-bar-swatch { flex: none; width: .75rem; height: .75rem; border-radius: .2rem; }
@media (prefers-reduced-motion: reduce) { .spend-bar-segment { transition: none; } }
@media (min-width: 992px) { .budget-totals { grid-template-columns: repeat(4, minmax(0, 1fr)); } .expense-row { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto; align-items: center; } }
@media (max-width: 399.98px) { .cost-comparison { grid-template-columns: 1fr; gap: .5rem; } }
</style>
