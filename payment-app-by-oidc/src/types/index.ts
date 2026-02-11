export interface Bindings {
  PAYMENT_STORE: KVNamespace;
  OKTA_DOMAIN: string;
  OKTA_CLIENT_ID: string;
  OKTA_CLIENT_SECRET: string;
  APP_BASE_URL: string;
}

export interface PaymentRecord {
  payment_id: string;
  user_email: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  nonce: string;
  created_at: string;
  expires_at: string;
  completed_at?: string;
  id_token?: string;
  auth_time?: number;
  acr?: string;
  amr?: string[];
  failure_reason?: string;
}

export type PaymentStatus =
  | 'pending_approval'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface IdTokenPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  auth_time: number;
  acr: string;
  amr: string[];
  nonce?: string;
}
