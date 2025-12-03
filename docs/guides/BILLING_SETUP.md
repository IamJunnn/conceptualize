# Billing System Setup Guide

This guide explains how to set up the Stripe billing system for Conceptualize.

## Overview

The billing system uses:
- **Stripe** for payment processing
- **Firebase Cloud Functions** for webhook handling
- **Firestore** for storing billing data
- **Firebase Storage** for file storage tracking

## Pricing Model

| Tier | Storage | Price | Description |
|------|---------|-------|-------------|
| Free | 2 GB | $0 | Full access under limit, restricted when exceeded |
| Paid | 20 GB | $3/member/month | Owner pays for all team members |
| Enterprise | 20+ GB | Custom | Contact sales |

### When Storage Exceeded (Free tier)
- **Can**: Edit existing notes, delete files, view content
- **Cannot**: Create new notes, upload files

## Setup Steps

### 1. Create Stripe Account

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create an account or sign in
3. Enable test mode for development

### 2. Create Stripe Product & Price

1. Go to **Products** in Stripe Dashboard
2. Click **Add Product**
3. Set:
   - Name: "Conceptualize Team"
   - Description: "Per-member team collaboration"
4. Add a Price:
   - Pricing model: **Recurring**
   - Price: **$3.00**
   - Billing period: **Monthly**
   - Usage type: **Metered** or **Licensed** (quantity-based)
5. Copy the **Price ID** (starts with `price_`)

### 3. Get API Keys

1. Go to **Developers > API keys**
2. Copy:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

### 4. Configure Environment Variables

#### Frontend (.env)
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_STRIPE_PRICE_ID=price_your_price_id_here
```

#### Firebase Functions
```bash
# Set config using Firebase CLI
firebase functions:config:set stripe.secret_key="sk_test_your_key_here"
firebase functions:config:set stripe.price_id="price_your_price_id_here"
firebase functions:config:set stripe.webhook_secret="whsec_your_webhook_secret"
```

### 5. Set Up Webhook

1. Go to **Developers > Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. Set:
   - Endpoint URL: `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/stripeWebhook`
   - Events to listen:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
4. Copy the **Signing secret** (starts with `whsec_`)
5. Add to Firebase config:
   ```bash
   firebase functions:config:set stripe.webhook_secret="whsec_your_secret"
   ```

### 6. Deploy Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### 7. Test the Integration

1. Start your app in team mode
2. Create a team and add content until over 2 GB
3. You should see the upgrade banner
4. Click "Upgrade" and complete checkout with test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits

## Testing

### Test Card Numbers
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires auth: `4000 0025 0000 3155`

### Stripe CLI (Local Testing)
```bash
# Install Stripe CLI
# Forward webhooks to local emulator
stripe listen --forward-to localhost:5001/YOUR_PROJECT/YOUR_REGION/stripeWebhook
```

## Firestore Data Structure

### teams/{teamId}
```javascript
{
  billing: {
    memberCount: 3,
    storageUsedBytes: 1500000000,
    lastStorageCalculation: Timestamp,
    monthlyPriceCents: 900, // $9.00
    subscription: {
      status: 'active', // 'free' | 'active' | 'past_due' | 'canceled'
      stripeCustomerId: 'cus_xxx',
      stripeSubscriptionId: 'sub_xxx',
      currentPeriodStart: Timestamp,
      currentPeriodEnd: Timestamp,
      cancelAtPeriodEnd: false
    },
    ownerId: 'uid_xxx',
    ownerEmail: 'owner@example.com'
  }
}
```

## Troubleshooting

### Webhook Not Receiving Events
1. Check the endpoint URL is correct
2. Verify webhook secret is set in Firebase config
3. Check function logs: `firebase functions:log`

### Payment Not Updating Status
1. Verify teamId is in metadata
2. Check Firestore rules allow updates
3. Review webhook logs in Stripe Dashboard

### Storage Not Calculating
1. Ensure Firebase Storage rules allow list operations
2. Check team storage path: `teams/{teamId}/`

## Going Live

1. Switch to live API keys in Stripe
2. Update Firebase config with live keys
3. Create production webhook endpoint
4. Test with real card
5. Monitor transactions in Stripe Dashboard
