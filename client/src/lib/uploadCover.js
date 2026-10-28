import { api } from './api'

// Returns the public URL to save into events.cover_image_url
export async function uploadCover(file) {
  const { data } = await api.post('/api/uploads/cover', {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  })
  const res = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('Image upload failed')
  return data.publicUrl
}
