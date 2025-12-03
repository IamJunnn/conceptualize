/**
 * Firebase Cloud Functions for Conceptualize Billing
 * Handles Stripe integration for team subscriptions
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin
admin.initializeApp();

// Initialize Stripe with your secret key from environment config
const stripe = new Stripe(functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

// Stripe price ID for per-member subscription
const PRICE_ID = functions.config().stripe?.price_id || process.env.STRIPE_PRICE_ID || '';

/**
 * Create a Stripe Checkout Session for team subscription
 */
export const createStripeCheckout = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { teamId, memberCount, successUrl, cancelUrl, customerEmail, metadata } = data;

  if (!teamId || !memberCount) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and memberCount are required');
  }

  try {
    // Check if customer already exists
    const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
    let customerId = teamDoc.data()?.billing?.subscription?.stripeCustomerId;

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          teamId,
          firebaseUid: context.auth.uid,
        },
      });
      customerId = customer.id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: PRICE_ID,
          quantity: memberCount,
        },
      ],
      success_url: successUrl || 'https://conceptualize.app/billing/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://conceptualize.app/billing/canceled',
      metadata: {
        teamId,
        memberCount: memberCount.toString(),
        ...metadata,
      },
      subscription_data: {
        metadata: {
          teamId,
          memberCount: memberCount.toString(),
        },
      },
    });

    return { sessionUrl: session.url };
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Create a Stripe Customer Portal session for managing subscription
 */
export const createStripePortal = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { customerId, returnUrl } = data;

  if (!customerId) {
    throw new functions.https.HttpsError('invalid-argument', 'customerId is required');
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'https://conceptualize.app/settings',
    });

    return { portalUrl: session.url };
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update subscription quantity when team members change
 */
export const updateStripeSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subscriptionId, quantity } = data;

  if (!subscriptionId || !quantity) {
    throw new functions.https.HttpsError('invalid-argument', 'subscriptionId and quantity are required');
  }

  try {
    // Get the subscription to find the subscription item
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionItemId = subscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      throw new Error('No subscription item found');
    }

    // Update the quantity
    await stripe.subscriptionItems.update(subscriptionItemId, {
      quantity,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error updating subscription:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Cancel a subscription
 */
export const cancelStripeSubscription = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { subscriptionId, immediately } = data;

  if (!subscriptionId) {
    throw new functions.https.HttpsError('invalid-argument', 'subscriptionId is required');
  }

  try {
    if (immediately) {
      // Cancel immediately
      await stripe.subscriptions.cancel(subscriptionId);
    } else {
      // Cancel at period end
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Stripe Webhook Handler
 * Handles all Stripe events for subscription management
 */
export const stripeWebhook = functions
  .runWith({ invoker: 'public' })
  .https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const teamId = session.metadata?.teamId;
  if (!teamId) {
    console.error('No teamId in checkout session metadata');
    return;
  }

  console.log(`Checkout completed for team ${teamId}`);

  // Update team billing info
  await admin.firestore().collection('teams').doc(teamId).update({
    'billing.subscription.status': 'active',
    'billing.subscription.stripeCustomerId': session.customer,
    'billing.subscription.stripeSubscriptionId': session.subscription,
  });
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) {
    console.error('No teamId in subscription metadata');
    return;
  }

  console.log(`Subscription updated for team ${teamId}: ${subscription.status}`);

  const status = mapStripeStatus(subscription.status);

  await admin.firestore().collection('teams').doc(teamId).update({
    'billing.subscription.status': status,
    'billing.subscription.stripeSubscriptionId': subscription.id,
    'billing.subscription.currentPeriodStart': admin.firestore.Timestamp.fromMillis(subscription.current_period_start * 1000),
    'billing.subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
    'billing.subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
  });
}

/**
 * Handle subscription deletion/cancellation
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) {
    console.error('No teamId in subscription metadata');
    return;
  }

  console.log(`Subscription deleted for team ${teamId}`);

  await admin.firestore().collection('teams').doc(teamId).update({
    'billing.subscription.status': 'canceled',
  });
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const teamId = subscription.metadata?.teamId;

  if (!teamId) {
    console.error('No teamId in subscription metadata');
    return;
  }

  console.log(`Invoice paid for team ${teamId}`);

  await admin.firestore().collection('teams').doc(teamId).update({
    'billing.subscription.status': 'active',
    'billing.lastPaymentDate': admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const teamId = subscription.metadata?.teamId;

  if (!teamId) {
    console.error('No teamId in subscription metadata');
    return;
  }

  console.log(`Payment failed for team ${teamId}`);

  await admin.firestore().collection('teams').doc(teamId).update({
    'billing.subscription.status': 'past_due',
  });

  // TODO: Send notification email to team owner
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
      return 'canceled';
    default:
      return 'free';
  }
}

/**
 * Sync subscription status from Stripe (polling-based approach)
 * Called when app loads to ensure Firestore is in sync with Stripe
 */
export const syncSubscriptionStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { teamId } = data;

  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
  }

  try {
    // Get team document
    const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
    const teamData = teamDoc.data();

    if (!teamData) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }

    const customerId = teamData.billing?.subscription?.stripeCustomerId;

    // If no customer ID, team is on free tier
    if (!customerId) {
      return {
        status: 'free',
        synced: true,
      };
    }

    // Get customer's subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 1,
    });

    const subscription = subscriptions.data[0];

    if (!subscription) {
      // No subscription found, revert to free tier
      await admin.firestore().collection('teams').doc(teamId).update({
        'billing.subscription.status': 'free',
        'billing.subscription.stripeSubscriptionId': null,
      });

      return {
        status: 'free',
        synced: true,
      };
    }

    // Map Stripe status to our status
    const status = mapStripeStatus(subscription.status);

    // Update Firestore with current Stripe data
    await admin.firestore().collection('teams').doc(teamId).update({
      'billing.subscription.status': status,
      'billing.subscription.stripeSubscriptionId': subscription.id,
      'billing.subscription.currentPeriodStart': admin.firestore.Timestamp.fromMillis(subscription.current_period_start * 1000),
      'billing.subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
      'billing.subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
      'billing.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      status,
      subscriptionId: subscription.id,
      currentPeriodEnd: subscription.current_period_end * 1000,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      synced: true,
    };
  } catch (error: any) {
    console.error('Error syncing subscription:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Verify checkout session completion (called after redirect from Stripe)
 * This replaces the webhook for checkout.session.completed
 */
export const verifyCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { sessionId, teamId } = data;

  if (!sessionId || !teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId and teamId are required');
  }

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Verify the session was successful
    if (session.payment_status !== 'paid') {
      return {
        success: false,
        error: 'Payment not completed',
      };
    }

    // Get the subscription
    const subscription = session.subscription as Stripe.Subscription;

    if (!subscription) {
      return {
        success: false,
        error: 'No subscription found',
      };
    }

    // Update team billing info in Firestore
    await admin.firestore().collection('teams').doc(teamId).update({
      'billing.subscription.status': 'active',
      'billing.subscription.stripeCustomerId': session.customer,
      'billing.subscription.stripeSubscriptionId': subscription.id,
      'billing.subscription.currentPeriodStart': admin.firestore.Timestamp.fromMillis(subscription.current_period_start * 1000),
      'billing.subscription.currentPeriodEnd': admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
      'billing.subscription.cancelAtPeriodEnd': false,
      'billing.lastSyncedAt': admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      status: 'active',
      subscriptionId: subscription.id,
    };
  } catch (error: any) {
    console.error('Error verifying checkout session:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Automatically update subscription when team members change
 * Triggered by Firestore document changes
 */
export const onTeamMemberChange = functions.firestore
  .document('teams/{teamId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if member count changed
    const beforeCount = before.memberEmails?.length || 0;
    const afterCount = after.memberEmails?.length || 0;

    if (beforeCount === afterCount) {
      return; // No change in member count
    }

    console.log(`Team ${context.params.teamId} member count changed: ${beforeCount} -> ${afterCount}`);

    // Update billing member count
    await change.after.ref.update({
      'billing.memberCount': afterCount,
      'billing.monthlyPriceCents': afterCount * 300, // $3 per member
    });

    // If team has active subscription, update Stripe quantity
    const subscriptionId = after.billing?.subscription?.stripeSubscriptionId;
    if (subscriptionId && after.billing?.subscription?.status === 'active') {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionItemId = subscription.items.data[0]?.id;

        if (subscriptionItemId) {
          await stripe.subscriptionItems.update(subscriptionItemId, {
            quantity: afterCount,
          });
          console.log(`Updated Stripe subscription quantity to ${afterCount}`);
        }
      } catch (error) {
        console.error('Error updating Stripe subscription:', error);
      }
    }
  });
