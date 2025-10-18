import { Bindings } from "."

const textEncoder = new TextEncoder()

const ECDSA_IMPORT_PARAMS: EcKeyImportParams = {
  name: 'ECDSA',
  namedCurve: 'P-256'
}

const ECDSA_SIGN_PARAMS: EcdsaParams = {
  name: 'ECDSA',
  hash: 'SHA-256'
}

interface JsonWebKeyWithKid extends JsonWebKey {
  kid: string
}

type SignOptions = {
  expiresInSeconds?: number
}

type SigningMaterial = {
  privateKey: CryptoKey
  publicJwk: JsonWebKeyWithKid
}

let cachedMaterial: { cacheKey: string; promise: Promise<SigningMaterial> } | null = null

const base64UrlEncode = (source: ArrayBuffer | Uint8Array): string => {
  const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : source
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const base64UrlDecode = (input: string): Uint8Array => {
  const padding = '='.repeat((4 - (input.length % 4)) % 4)
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + padding
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const stringToArrayBuffer = (input: string) => {
  return textEncoder.encode(input).buffer
}

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

const dropPrivateFields = (jwk: JsonWebKey): JsonWebKey => {
  const { d, ...publicFields } = jwk
  return publicFields
}

const computeKid = async (jwk: JsonWebKey): Promise<string> => {
  if (!jwk.x || !jwk.y) {
    throw new Error('Missing EC coordinates in JWK')
  }
  const xBytes = base64UrlDecode(jwk.x)
  const yBytes = base64UrlDecode(jwk.y)
  const combined = new Uint8Array(xBytes.length + yBytes.length)
  combined.set(xBytes, 0)
  combined.set(yBytes, xBytes.length)
  const digest = await crypto.subtle.digest('SHA-256', combined)
  const kidSource = new Uint8Array(digest).slice(0, 12)
  return base64UrlEncode(kidSource.buffer)
}

const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  const keyData = pemToArrayBuffer(pem)
  return crypto.subtle.importKey('pkcs8', keyData, ECDSA_IMPORT_PARAMS, true, ['sign'])
}

const exportPublicJwk = async (privateKey: CryptoKey): Promise<JsonWebKeyWithKid> => {
  const privateJwk = await crypto.subtle.exportKey('jwk', privateKey)
  if (!privateJwk.kty || !privateJwk.x || !privateJwk.y) {
    throw new Error('Imported key is missing EC components')
  }
  const publicJwk = dropPrivateFields(privateJwk)
  publicJwk.use = 'sig'
  publicJwk.alg = 'ES256'
  publicJwk.crv = 'P-256'
  publicJwk.key_ops = ['verify']

  return {
    ...publicJwk,
    kid: await computeKid(publicJwk)
  }
}

const ensureSigningMaterial = async (pem: string): Promise<SigningMaterial> => {
  const pemParse = pem.replace(/\\n/g, '\n').trim()
  const privateKey = await importPrivateKey(pemParse)
  const publicJwk = await exportPublicJwk(privateKey)
  return { privateKey, publicJwk }
}

export const getSigningMaterial = (env: Bindings): Promise<SigningMaterial> => {
  if (!env.JWT_PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY secret is not configured')
  }
  const cacheKey = `${env.JWT_PRIVATE_KEY}`
  if (!cachedMaterial || cachedMaterial.cacheKey !== cacheKey) {
    cachedMaterial = {
      cacheKey,
      promise: ensureSigningMaterial(env.JWT_PRIVATE_KEY)
    }
  }
  return cachedMaterial.promise
}

export const signJwt = async (
  privateKey: CryptoKey,
  payload: Record<string, unknown>,
  options: SignOptions = {}
): Promise<string> => {
  const header: Record<string, string> = {
    alg: 'ES256',
    typ: 'JWT',
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const normalizedPayload: Record<string, unknown> = {
    ...payload,
    iat: issuedAt
  }
  if (options.expiresInSeconds) {
    normalizedPayload.exp = issuedAt + (options.expiresInSeconds ?? 300)
  }

  const encodedHeader = base64UrlEncode(stringToArrayBuffer(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(stringToArrayBuffer(JSON.stringify(normalizedPayload)))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign(
    ECDSA_SIGN_PARAMS,
    privateKey,
    stringToArrayBuffer(signingInput)
  )

  const encodedSignature = base64UrlEncode(signature)
  return `${signingInput}.${encodedSignature}`
}
