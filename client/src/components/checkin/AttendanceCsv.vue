<script setup>
// Feature 3: attendance CSV export + import panel (sits under the dashboard).
// Mostly BOILERPLATE wiring. The real logic is in utils/csv.js (toCsv,
// parseAttendanceCsv) and in the database functions export_attendance /
// import_attendance. Imported check-ins show up in the arrivals feed on their own,
// through the dashboard's Realtime subscription.
import { ref } from 'vue'
import { exportAttendance, importAttendance } from '@/utils/checkin'
import { downloadCsv, parseAttendanceCsv, toCsv } from '@/utils/csv'

const props = defineProps({
  eventId: { type: String, required: true },
  eventTitle: { type: String, default: 'event' },
})

const exporting = ref(false)
const importing = ref(false)
const error = ref('')
const importResult = ref(null) // { matched, unmatched: [...], skipped }
const fileInput = ref(null)

// Column order in the exported file. email + ticket_code + checked_in_at use the
// same names parseAttendanceCsv accepts, so an export can be edited and re-imported.
const EXPORT_COLUMNS = [
  { key: 'display_name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'ticket_code', label: 'Ticket code' },
  { key: 'status', label: 'Status' },
  { key: 'checked_in_at', label: 'Checked in at' },
  { key: 'method', label: 'Method' },
]

async function onExport() {
  exporting.value = true
  error.value = ''
  try {
    const rows = await exportAttendance(props.eventId)
    // export_attendance filters to organisers in SQL, so a helper gets [] rather than an error
    if (!rows.length) throw new Error('Nothing to export. Only organisers can export attendance (it contains emails).')
    const slug = props.eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadCsv(`attendance-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows, EXPORT_COLUMNS))
  } catch (e) {
    error.value = e.message
  } finally {
    exporting.value = false
  }
}

async function onFileChosen(e) {
  const file = e.target.files?.[0]
  if (!file) return
  importing.value = true
  error.value = ''
  importResult.value = null
  try {
    const { rows, skipped } = await parseAttendanceCsv(file)
    if (!rows.length) throw new Error('No rows with an email or ticket code were found in that file.')
    const { matched, unmatched } = await importAttendance(props.eventId, rows)
    importResult.value = { matched, unmatched: unmatched ?? [], skipped }
  } catch (err) {
    error.value = err.message
  } finally {
    importing.value = false
    fileInput.value.value = '' // allow choosing the same file again
  }
}
</script>

<template>
  <section class="card card-body">
    <h2 class="h6 text-uppercase text-body-secondary">Import / export</h2>
    <p class="small text-body-secondary">
      Export the attendance list as CSV (organisers only). Import a CSV with <code>email</code> and/or
      <code>ticket_code</code> columns, plus optional <code>checked_in_at</code>, to check people in.
    </p>

    <div class="d-flex flex-wrap gap-2">
      <button class="btn btn-outline-primary btn-sm" :disabled="exporting" @click="onExport">
        <span v-if="exporting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Export CSV
      </button>
      <label class="btn btn-outline-primary btn-sm mb-0" :class="{ disabled: importing }">
        <span v-if="importing" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Import CSV
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="d-none" @change="onFileChosen" />
      </label>
    </div>

    <div v-if="error" class="alert alert-danger mt-3 mb-0 small" role="alert">{{ error }}</div>

    <div v-if="importResult" class="mt-3">
      <div class="alert alert-success py-2 small mb-2" role="status">
        {{ importResult.matched }} checked in from the file.
        <template v-if="importResult.skipped">{{ importResult.skipped }} blank row(s) skipped.</template>
      </div>
      <template v-if="importResult.unmatched.length">
        <p class="small mb-1">
          <strong>{{ importResult.unmatched.length }}</strong> row(s) didn't match a confirmed registration:
        </p>
        <div class="table-responsive">
          <table class="table table-sm small mb-0">
            <thead>
              <tr><th>Email</th><th>Ticket code</th></tr>
            </thead>
            <tbody>
              <tr v-for="(u, i) in importResult.unmatched" :key="i">
                <td>{{ u.email || '—' }}</td>
                <td>{{ u.ticket_code || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>
