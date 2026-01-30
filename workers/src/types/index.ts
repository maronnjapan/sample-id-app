export interface Bindings {
  PAYMENT_STORE: KVNamespace;
  OKTA_DOMAIN: string;
  OKTA_CLIENT_ID: string;
  OKTA_CLIENT_SECRET: string;
}

export interface PaymentRecord {
  payment_id: string;
  user_email: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  auth_req_id: string;
  access_token?: string;
  id_token?: string;
  created_at: string;
  expires_at: string;
  completed_at?: string;
}

export type PaymentStatus =
  | 'pending_approval'
  | 'approved'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface CibaAuthResponse {
  auth_req_id: string;
  expires_in: number;
  interval: number;
}

export interface CibaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export interface CibaErrorResponse {
  error: string;
  error_description: string;
}

export type CibaPollResult =
  | { status: 'pending' }
  | { status: 'approved'; access_token: string; id_token?: string }
  | { status: 'rejected'; reason: string }
  | { status: 'expired' }
  | { status: 'slow_down' };
