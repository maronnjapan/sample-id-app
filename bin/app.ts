#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TokenVaultStack } from '../lib/token-vault-stack';

const app = new cdk.App();

new TokenVaultStack(app, 'TokenVaultStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Auth0 Token Vault 風 AWS 構成（検証・研修用）',
});
