const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function encryptionKey() {
  const configuredKey = Deno.env.get('CANVAS_TOKEN_ENCRYPTION_KEY')
  if (!configuredKey) throw new Error('Canvas credential encryption is not configured.')
  const rawKey = base64ToBytes(configuredKey)
  if (rawKey.length !== 32) throw new Error('Canvas credential encryption key is invalid.')
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptCanvasToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), textEncoder.encode(token))
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`
}

export async function decryptCanvasToken(value: string) {
  const [ivValue, encryptedValue] = value.split('.')
  if (!ivValue || !encryptedValue) throw new Error('Stored Canvas credential is invalid.')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivValue) },
    await encryptionKey(),
    base64ToBytes(encryptedValue),
  )
  return textDecoder.decode(decrypted)
}
