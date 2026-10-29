import { supabase } from './supabase.js'
import { getEvent } from './supabaseApi.js'
import { getForecastAreas as fetchLiveForecastAreas } from './supabaseFeature4Weather.js'
import { TASK_STATUSES, budgetCategoryOptions, validateCategoryName, validateCents, validateExpenseAmounts, summariseBudget } from './feature4.js'

const MAX_AMOUNT_CENTS = 999_999_999_999

function check({ data, error }) {
  if (error) {
    if (['PGRST205', 'PGRST202', '42P01', '42703', '42883'].includes(error.code)) {
      throw new Error('The live Feature 4 database migration is not available. Ask the project owner to review and apply it.', { cause: error })
    }
    throw Object.assign(new Error(error.message), error)
  }
  return data
}

function mayHaveCommitted(error) {
  if (/^[0-9A-Z]{5}$/.test(error?.code || '')) return error.code === '23505'
  if (Number.isFinite(error?.status)) return error.status >= 500
  return error instanceof TypeError || /failed to fetch|network|timed? ?out|connection (?:lost|closed|reset)|aborted/i.test(error?.message || '')
}

async function reconcileCreate(client, table, id, eventId, matches, columns, error) {
  if (!mayHaveCommitted(error)) throw error
  try {
    const row = check(await client.from(table).select(columns).eq('id', id).eq('event_id', eventId).maybeSingle())
    if (row && matches(row)) return row
  } catch {
    // Keep the original write error: a failed read does not establish that the
    // write succeeded, and must not turn an authorization failure into success.
  }
  throw error
}

function amountToCents(value) {
  if (value == null) return 0
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) throw new Error('Database returned an invalid money amount.')
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'))
  if (cents > BigInt(MAX_AMOUNT_CENTS)) throw new Error('Budget amount exceeds the supported database range.')
  return Number(cents)
}

function centsToAmount(cents, { positive = false } = {}) {
  validateCents(cents, { positive })
  if (cents > MAX_AMOUNT_CENTS) throw new Error('Budget amount exceeds the supported database range.')
  const value = BigInt(cents)
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

function taskDto(row) {
  return { id: row.id, eventId: row.event_id, title: row.title, notes: row.description || '', status: row.status, position: row.position }
}

function announcementDto(row) {
  return {
    id: row.id, eventId: row.event_id, body: row.body,
    kind: row.is_automatic ? 'venue-switch' : 'manual', createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  }
}

function budgetItemDto(row) {
  return {
    id: row.id, eventId: row.event_id, name: row.description, category: row.category, quantity: row.quantity ?? 1,
    plannedCents: amountToCents(row.estimated_amount), actualCents: amountToCents(row.actual_amount),
  }
}

function nonBlank(value, label, optional = false) {
  if (optional && (value == null || String(value).trim() === '')) return null
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required.`)
  return value.trim()
}

function ordered(rows) {
  return rows.map(taskDto).sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.position - b.position)
}

/** Factory is exported so the browser adapter can be exercised against a deterministic Supabase client. */
export function createSupabaseFeature4Api(client, fetchEvent = getEvent, fetchAreas = fetchLiveForecastAreas) {
  async function requireOwner(eventId) {
    const event = await fetchEvent(eventId)
    if (!event.isMine) throw new Error('Only the event organiser can manage these operations.')
    return event
  }

  async function readPosts(eventId) {
    const rows = check(await client.from('announcements').select('id,event_id,body,is_automatic,created_at,updated_at')
      .eq('event_id', eventId).eq('audience', 'everyone').order('created_at', { ascending: false }))
    return rows.map(announcementDto)
  }

  async function readBudget(eventId) {
    const [setting, rows] = await Promise.all([
      client.from('event_operation_settings').select('budget_limit').eq('event_id', eventId).maybeSingle(),
      client.from('budget_items').select('id,event_id,description,category,quantity,estimated_amount,actual_amount')
        .eq('event_id', eventId).eq('kind', 'expense').order('created_at'),
    ])
    const config = check(setting)
    const items = check(rows).map(budgetItemDto)
    const limitCents = config?.budget_limit == null ? null : amountToCents(config.budget_limit)
    if (limitCents !== null) validateCents(limitCents, { positive: true })
    summariseBudget({ limitCents, items })
    return { limitCents, items }
  }

  async function readCategories(eventId) {
    return check(await client.from('event_operation_settings').select('budget_categories').eq('event_id', eventId).maybeSingle())?.budget_categories ?? []
  }

  async function getEventOperations(eventId) {
    const event = await requireOwner(eventId)
    const [tasksResult, announcements, budgetResult, settingsResult] = await Promise.all([
      client.from('tasks').select('id,event_id,title,description,status,position').eq('event_id', eventId).order('status').order('position'),
      readPosts(eventId), readBudget(eventId),
      client.from('event_operation_settings').select('forecast_area,budget_categories').eq('event_id', eventId).maybeSingle(),
    ])
    const settings = check(settingsResult)
    return {
      event, tasks: ordered(check(tasksResult)), announcements, budget: budgetResult,
      budgetCategories: settings?.budget_categories ?? [], forecastAreaOverride: settings?.forecast_area || null,
    }
  }

  async function getAnnouncements(eventId) { return readPosts(eventId) }

  async function createTask(eventId, input) {
    await requireOwner(eventId)
    const title = nonBlank(input?.title, 'Task title')
    const notes = nonBlank(input?.notes, 'Notes', true)
    const requestId = input?.requestId || globalThis.crypto.randomUUID()
    let row
    try {
      row = check(await client.rpc('create_feature4_task', {
        p_event_id: eventId, p_task_id: requestId, p_title: title, p_description: notes,
      }))
    } catch (error) {
      row = await reconcileCreate(client, 'tasks', requestId, eventId,
        candidate => candidate.title === title && (candidate.description || '') === (notes || ''),
        'id,event_id,title,description,status,position', error)
    }
    return taskDto(row)
  }

  async function updateTask(eventId, taskId, input) {
    await requireOwner(eventId)
    const row = check(await client.from('tasks').update({ title: nonBlank(input?.title, 'Task title'), description: nonBlank(input?.notes, 'Notes', true) })
      .eq('event_id', eventId).eq('id', taskId).select('id,event_id,title,description,status,position').single())
    return taskDto(row)
  }

  async function deleteTask(eventId, taskId) {
    await requireOwner(eventId)
    const deleted = check(await client.rpc('delete_feature4_task', { p_event_id: eventId, p_task_id: taskId }))
    if (deleted !== 1) throw new Error('Task not found.')
  }

  async function saveTaskBoard(eventId, columns) {
    await requireOwner(eventId)
    if (!columns || Object.keys(columns).length !== TASK_STATUSES.length || !TASK_STATUSES.every((status) => Array.isArray(columns[status]))) {
      throw new Error('The board must contain exactly the three task columns.')
    }
    const ids = TASK_STATUSES.flatMap((status) => columns[status])
    if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('The board must contain every event task exactly once.')
    const result = check(await client.rpc('save_feature4_task_board', { p_event_id: eventId, p_columns: columns }))
    if (Array.isArray(result)) return ordered(result)
    const rows = check(await client.from('tasks').select('id,event_id,title,description,status,position').eq('event_id', eventId))
    return ordered(rows)
  }

  async function createAnnouncement(eventId, body, requestId) {
    await requireOwner(eventId)
    const content = nonBlank(body, 'Announcement content')
    requestId ||= globalThis.crypto.randomUUID()
    const columns = 'id,event_id,body,is_automatic,created_at,updated_at'
    let row
    try {
      row = check(await client.from('announcements').insert({ id: requestId, event_id: eventId, title: 'Event update', body: content, audience: 'everyone', is_automatic: false })
        .select(columns).single())
    } catch (error) {
      row = await reconcileCreate(client, 'announcements', requestId, eventId,
        candidate => candidate.body === content && !candidate.is_automatic,
        columns, error)
    }
    return announcementDto(row)
  }

  async function editablePost(eventId, id) {
    const row = check(await client.from('announcements').select('id,is_automatic').eq('event_id', eventId).eq('id', id).single())
    if (row.is_automatic) throw new Error('Automatic venue-switch history is immutable.')
  }

  async function updateAnnouncement(eventId, id, body) {
    await requireOwner(eventId)
    await editablePost(eventId, id)
    const row = check(await client.from('announcements').update({ body: nonBlank(body, 'Announcement content') })
      .eq('event_id', eventId).eq('id', id).select('id,event_id,body,is_automatic,created_at,updated_at').single())
    return announcementDto(row)
  }

  async function deleteAnnouncement(eventId, id) {
    await requireOwner(eventId)
    await editablePost(eventId, id)
    check(await client.from('announcements').delete().eq('event_id', eventId).eq('id', id).select('id').single())
  }

  async function saveBudgetLimit(eventId, limitCents) {
    await requireOwner(eventId)
    const budgetLimit = limitCents === null ? null : centsToAmount(limitCents, { positive: true })
    const persistedLimit = check(await client.rpc('set_feature4_budget_limit', { p_event_id: eventId, p_limit: budgetLimit }))
    const budget = await readBudget(eventId)
    return { ...budget, limitCents: persistedLimit == null ? null : amountToCents(persistedLimit) }
  }

  async function saveBudgetItem(eventId, input) {
    await requireOwner(eventId)
    const category = input?.category
    if (!budgetCategoryOptions(await readCategories(eventId)).includes(category)) throw new Error('Choose a valid budget category.')
    const quantity = validateExpenseAmounts({ quantity: input?.quantity ?? 1, plannedCents: input?.plannedCents, actualCents: input?.actualCents })
    const planned = centsToAmount(input?.plannedCents)
    const actual = centsToAmount(input?.actualCents)
    const values = { event_id: eventId, kind: 'expense', category, description: nonBlank(input?.name, 'Item name'), quantity, estimated_amount: planned, actual_amount: actual }
    const columns = 'id,event_id,kind,description,category,quantity,estimated_amount,actual_amount'
    let row
    if (input?.id) {
      row = check(await client.from('budget_items').update(values).eq('event_id', eventId).eq('id', input.id).select(columns).single())
    } else {
      const requestId = input?.requestId || globalThis.crypto.randomUUID()
      try {
        row = check(await client.from('budget_items').insert({ ...values, id: requestId }).select(columns).single())
      } catch (error) {
        row = await reconcileCreate(client, 'budget_items', requestId, eventId,
          candidate => candidate.kind === 'expense' && candidate.category === category && candidate.description === values.description
            && (candidate.quantity ?? 1) === quantity
            && amountToCents(candidate.estimated_amount) === input.plannedCents
            && amountToCents(candidate.actual_amount) === input.actualCents,
          columns, error)
      }
    }
    return budgetItemDto(row)
  }

  async function deleteBudgetItem(eventId, id) {
    await requireOwner(eventId)
    check(await client.from('budget_items').delete().eq('event_id', eventId).eq('id', id).select('id').single())
  }

  async function createBudgetCategory(eventId, name) {
    await requireOwner(eventId)
    const value = validateCategoryName(name, await readCategories(eventId))
    return check(await client.rpc('add_feature4_budget_category', { p_event_id: eventId, p_name: value }))
  }

  /** The RPC moves the category's expenses to Other and removes it in one transaction. */
  async function deleteBudgetCategory(eventId, name) {
    await requireOwner(eventId)
    const categories = check(await client.rpc('delete_feature4_budget_category', { p_event_id: eventId, p_name: name }))
    return { categories, items: (await readBudget(eventId)).items }
  }

  async function setForecastArea(eventId, name) {
    await requireOwner(eventId)
    if (typeof name !== 'string' || !name.trim()) throw new Error('Choose an available forecast area.')
    const areaName = name.trim()
    const areas = await fetchAreas()
    if (!areas.some((area) => area.name === areaName)) throw new Error('Choose an available forecast area.')
    return check(await client.rpc('set_feature4_forecast_area', { p_event_id: eventId, p_area: areaName }))
  }

  return { getEventOperations, getAnnouncements, createTask, updateTask, deleteTask, saveTaskBoard,
    createAnnouncement, updateAnnouncement, deleteAnnouncement, saveBudgetLimit, saveBudgetItem,
    deleteBudgetItem, createBudgetCategory, deleteBudgetCategory, setForecastArea }
}

const api = supabase ? createSupabaseFeature4Api(supabase) : null
function live(method) {
  return (...args) => {
    if (!api) throw new Error('Supabase is not configured for live Feature 4 operations.')
    return api[method](...args)
  }
}

export const getEventOperations = live('getEventOperations')
export const getAnnouncements = live('getAnnouncements')
export const createTask = live('createTask')
export const updateTask = live('updateTask')
export const deleteTask = live('deleteTask')
export const saveTaskBoard = live('saveTaskBoard')
export const createAnnouncement = live('createAnnouncement')
export const updateAnnouncement = live('updateAnnouncement')
export const deleteAnnouncement = live('deleteAnnouncement')
export const saveBudgetLimit = live('saveBudgetLimit')
export const saveBudgetItem = live('saveBudgetItem')
export const deleteBudgetItem = live('deleteBudgetItem')
export const createBudgetCategory = live('createBudgetCategory')
export const deleteBudgetCategory = live('deleteBudgetCategory')
export const setForecastArea = live('setForecastArea')
