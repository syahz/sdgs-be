/**
 * Keycloak (IAM Universitas) — OIDC Authorization Code flow + PKCE.
 *
 * Catatan arsitektur penting:
 *  - Sistem ini TIDAK memakai sesi Keycloak. Keycloak hanya dipakai untuk
 *    membuktikan identitas (email) sekali saat login. Otorisasi & sesi
 *    sepenuhnya milik sistem ini (cookie refresh_token + access token JWT).
 *  - `redirect_uri` harus menunjuk ke ORIGIN FRONT-END (yang mem-proxy /api ke
 *    BE lewat Next.js rewrites), bukan ke origin BE langsung. Ini agar Set-Cookie
 *    `refresh_token` jatuh di origin FE (host-only) — konsisten dengan login
 *    email/password. Lihat next.config.ts → rewrites.
 *
 * Endpoint OIDC diturunkan dari issuer realm standar Keycloak:
 *   <issuer>/protocol/openid-connect/{auth,token,userinfo,logout}
 * di mana <issuer> = https://<host-keycloak>/realms/<nama-realm>
 */

import crypto from 'crypto'
import {
  KEYCLOAK_ISSUER_URL,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_REDIRECT_URI
} from './index'

const ISSUER = (KEYCLOAK_ISSUER_URL ?? '').replace(/\/+$/, '')

/** True bila semua env Keycloak terisi — kalau false, route Keycloak menolak. */
export const keycloakEnabled = Boolean(
  ISSUER && KEYCLOAK_CLIENT_ID && KEYCLOAK_CLIENT_SECRET && KEYCLOAK_REDIRECT_URI
)

export const KC_AUTH_ENDPOINT = `${ISSUER}/protocol/openid-connect/auth`
export const KC_TOKEN_ENDPOINT = `${ISSUER}/protocol/openid-connect/token`
export const KC_USERINFO_ENDPOINT = `${ISSUER}/protocol/openid-connect/userinfo`

/** State acak anti-CSRF untuk parameter `state`. */
export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url')
}

/** PKCE — verifier rahasia + challenge S256 yang dikirim ke authorize endpoint. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/** URL authorize Keycloak lengkap dengan param untuk memulai login. */
export function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID!,
    redirect_uri: KEYCLOAK_REDIRECT_URI!,
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })
  return `${KC_AUTH_ENDPOINT}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  id_token?: string
  token_type?: string
  expires_in?: number
}

/** Tukar authorization code → token set di token endpoint Keycloak. */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: KEYCLOAK_REDIRECT_URI!,
    client_id: KEYCLOAK_CLIENT_ID!,
    client_secret: KEYCLOAK_CLIENT_SECRET!,
    code_verifier: codeVerifier
  })

  const res = await fetch(KC_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Keycloak token exchange failed (${res.status}): ${detail}`)
  }
  return res.json() as Promise<TokenResponse>
}

interface UserInfo {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
}

/** Ambil profil user (email) dari userinfo endpoint memakai access token. */
export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await fetch(KC_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Keycloak userinfo failed (${res.status}): ${detail}`)
  }
  return res.json() as Promise<UserInfo>
}
