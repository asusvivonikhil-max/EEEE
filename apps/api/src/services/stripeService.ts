import Stripe from 'stripe';
import { config } from '../config/env';

export let stripe: Stripe | null = null;

if (config.stripe.secretKey) {
  stripe = new Stripe(config.stripe.secretKey, {
    apiVersion: '2024-06-20' as any,
    maxNetworkRetries: 3,
    timeout: 10000,
  });
  console.log('✅ Stripe Service Initialized (Live/Test Mode API Keys)');
} else {
  console.log('⚠️ Stripe Secret Key missing! Stripe payments will run in SIMULATED mode.');
}
