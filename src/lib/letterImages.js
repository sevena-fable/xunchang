export const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export function imagePath(value, projectUrl) {
  if (typeof value !== 'string') throw new Error('照片路径无效')
  let path = value
  if (value.includes('://')) {
    const url = new URL(value)
    const prefix = '/storage/v1/object/public/letter-images/'
    if (url.origin !== new URL(projectUrl).origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) throw new Error('无法验证旧照片的来源')
    path = decodeURIComponent(url.pathname.slice(prefix.length))
  }
  if (!/^[a-f0-9-]{36}\/[A-Za-z0-9._/-]+$/.test(path) || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('照片路径无效')
  return path
}

export function validateAttachments(attachments) {
  if (attachments.length > 3) throw new Error('最多夹三张照片')
  for (const { file } of attachments) {
    if (!IMAGE_EXTENSIONS[file.type] || file.size > 6 * 1024 * 1024) throw new Error('照片格式或大小不符合要求')
  }
}

export async function fileHash(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
