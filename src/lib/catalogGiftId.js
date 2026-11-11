// A catalog version has one playlist ID per sender and pair, whether its
// audio came from the catalog or from the sender's own copy of that version.
export async function catalogGiftId(pairId, userId, trackId) {
  const input = new TextEncoder().encode(`catalog:${pairId}:${userId}:${trackId}`)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  bytes[6] = (bytes[6] & 15) | 128
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes.subarray(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
