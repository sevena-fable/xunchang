export const REACTIONS = [
  { key: 'coffee', label: '下次聊聊', icon: '/reaction-coffee.png' },
  { key: 'heart', label: '喜欢', icon: '/reaction-heart.png' },
  { key: 'thumb', label: '点赞', icon: '/reaction-thumb.png' },
  { key: 'dog', label: '狗头', icon: '/reaction-dog.png' },
]

export function reactionOf(key) {
  return REACTIONS.find((reaction) => reaction.key === key)
}

export function dayKey(iso) {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
