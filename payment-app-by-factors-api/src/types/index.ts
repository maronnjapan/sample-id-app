export interface Bindings {
  PAYMENT_STORE: KVNamespace;
  OKTA_DOMAIN: string;
  OKTA_MGMT_CLIENT_ID: string;
  OKTA_MGMT_KID: string;
  OKTA_MGMT_PRIVATE_KEY: string;
}

export interface PaymentRecord {
  payment_id: string;
  user_email: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  user_id: string;
  factor_id: string;
  transaction_id: string;
  poll_url: string;
  approval_result?: FactorResult;
  created_at: string;
  expires_at: string;
  completed_at?: string;
}

export type PaymentStatus =
  | 'pending_approval'
  | 'completed'
  | 'rejected'
  | 'expired';

export type FactorResult = 'WAITING' | 'SUCCESS' | 'REJECTED' | 'TIMEOUT';

export interface FactorVerifyResponse {
  expiresAt: string;
  factorResult: FactorResult;
  _links: {
    poll: { href: string };
    cancel: { href: string };
  };
}

export interface FactorPollResponse {
  expiresAt: string;
  factorResult: FactorResult;
}
