"use strict";
/**
 * Firebase Cloud Functions for Conceptualize
 * Handles Stripe billing and LiveKit recording integration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPromoExpiration = exports.getActivePromo = exports.redeemPartnerPromo = exports.checkPartnerDomain = exports.redeemPromoCode = exports.validatePromoCode = exports.livekitEgressWebhook = exports.processRecordingRequest = exports.getActiveEgressV2 = exports.getActiveEgress = exports.retryFailedCharges = exports.checkGracePeriodExpiry = exports.onTeamMemberChange = exports.acceptTeamInvite = exports.verifyCheckoutSession = exports.syncSubscriptionStatus = exports.stripeWebhook = exports.cancelStripeSubscription = exports.updateStripeSubscription = exports.createStripePortal = exports.createStripeCheckout = exports.generateLiveKitToken = void 0;
// Firebase Functions V1 for all functions (avoids IAM invoker issues)
const functionsV1 = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = __importDefault(require("stripe"));
const livekit_server_sdk_1 = require("livekit-server-sdk");
// Initialize Firebase Admin
admin.initializeApp();
// Initialize Stripe with your secret key from environment config
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16',
});
// Stripe price ID for per-member subscription
const PRICE_ID = process.env.STRIPE_PRICE_ID || '';
// LiveKit configuration for recording (Egress API)
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'https://conceptualize-ucbg0je6.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
// AWS S3 configuration for recording storage
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || '';
const AWS_S3_REGION = process.env.AWS_S3_REGION || 'us-east-2';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
// Initialize LiveKit Egress client (lazy initialization)
let egressClient = null;
function getEgressClient() {
    if (!egressClient) {
        if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
            throw new Error('LiveKit API credentials not configured');
        }
        egressClient = new livekit_server_sdk_1.EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    }
    return egressClient;
}
/**
 * Generate a LiveKit access token for video calls
 * This securely generates tokens server-side instead of exposing secrets in the frontend
 */
exports.generateLiveKitToken = functionsV1
    .runWith({
    secrets: ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
})
    .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { roomName, participantName, participantIdentity } = data;
    if (!roomName || !participantName || !participantIdentity) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'roomName, participantName, and participantIdentity are required');
    }
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        throw new functionsV1.https.HttpsError('failed-precondition', 'LiveKit API credentials not configured');
    }
    try {
        // Create access token with video grant
        const token = new livekit_server_sdk_1.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: participantIdentity,
            name: participantName,
            ttl: 3600, // 1 hour
        });
        token.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });
        return {
            token: await token.toJwt(),
            url: LIVEKIT_URL.replace('https://', 'wss://'),
        };
    }
    catch (error) {
        console.error('Error generating LiveKit token:', error);
        throw new functionsV1.https.HttpsError('internal', 'Failed to generate token');
    }
});
/**
 * Create a Stripe Checkout Session for team subscription
 * Note: CORS is automatically handled by Firebase callable functions
 */
exports.createStripeCheckout = functionsV1.https.onCall(async (data, context) => {
    var _a, _b, _c;
    // Verify authentication
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId, memberCount, successUrl, cancelUrl, customerEmail, metadata } = data;
    if (!teamId || !memberCount) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId and memberCount are required');
    }
    try {
        // Check if customer already exists
        const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
        let customerId = (_c = (_b = (_a = teamDoc.data()) === null || _a === void 0 ? void 0 : _a.billing) === null || _b === void 0 ? void 0 : _b.subscription) === null || _c === void 0 ? void 0 : _c.stripeCustomerId;
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
            metadata: Object.assign({ teamId, memberCount: memberCount.toString() }, metadata),
            subscription_data: {
                metadata: {
                    teamId,
                    memberCount: memberCount.toString(),
                },
            },
        });
        return { sessionUrl: session.url };
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Create a Stripe Customer Portal session for managing subscription
 */
exports.createStripePortal = functionsV1.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { customerId, returnUrl } = data;
    if (!customerId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'customerId is required');
    }
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || 'https://conceptualize.app/settings',
        });
        return { portalUrl: session.url };
    }
    catch (error) {
        console.error('Error creating portal session:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Update subscription quantity when team members change
 */
exports.updateStripeSubscription = functionsV1.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { subscriptionId, quantity } = data;
    if (!subscriptionId || !quantity) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'subscriptionId and quantity are required');
    }
    try {
        // Get the subscription to find the subscription item
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const subscriptionItemId = (_a = subscription.items.data[0]) === null || _a === void 0 ? void 0 : _a.id;
        if (!subscriptionItemId) {
            throw new Error('No subscription item found');
        }
        // Update the quantity
        await stripe.subscriptionItems.update(subscriptionItemId, {
            quantity,
        });
        return { success: true };
    }
    catch (error) {
        console.error('Error updating subscription:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Cancel a subscription
 */
exports.cancelStripeSubscription = functionsV1.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { subscriptionId, immediately } = data;
    if (!subscriptionId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'subscriptionId is required');
    }
    try {
        if (immediately) {
            // Cancel immediately
            await stripe.subscriptions.cancel(subscriptionId);
        }
        else {
            // Cancel at period end
            await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true,
            });
        }
        return { success: true };
    }
    catch (error) {
        console.error('Error canceling subscription:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Stripe Webhook Handler
 * Handles all Stripe events for subscription management
 */
exports.stripeWebhook = functionsV1.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    console.log(`Received Stripe event: ${event.type}`);
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await handleCheckoutCompleted(session);
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await handleSubscriptionUpdate(subscription);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await handleSubscriptionDeleted(subscription);
                break;
            }
            case 'invoice.paid': {
                const invoice = event.data.object;
                await handleInvoicePaid(invoice);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                await handlePaymentFailed(invoice);
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session) {
    var _a;
    const teamId = (_a = session.metadata) === null || _a === void 0 ? void 0 : _a.teamId;
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
async function handleSubscriptionUpdate(subscription) {
    var _a;
    const teamId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.teamId;
    if (!teamId) {
        console.error('No teamId in subscription metadata');
        return;
    }
    console.log(`Subscription updated for team ${teamId}: ${subscription.status}`);
    const status = mapStripeStatus(subscription.status);
    await admin.firestore().collection('teams').doc(teamId).update({
        'billing.subscription.status': status,
        'billing.subscription.stripeSubscriptionId': subscription.id,
        'billing.subscription.currentPeriodStart': subscription.current_period_start * 1000,
        'billing.subscription.currentPeriodEnd': subscription.current_period_end * 1000,
        'billing.subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
    });
}
/**
 * Handle subscription deletion/cancellation
 */
async function handleSubscriptionDeleted(subscription) {
    var _a;
    const teamId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.teamId;
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
async function handleInvoicePaid(invoice) {
    var _a;
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const teamId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.teamId;
    if (!teamId) {
        console.error('No teamId in subscription metadata');
        return;
    }
    console.log(`Invoice paid for team ${teamId}`);
    await admin.firestore().collection('teams').doc(teamId).update({
        'billing.subscription.status': 'active',
        'billing.lastPaymentDate': new Date(),
    });
}
/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
    var _a;
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const teamId = (_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.teamId;
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
function mapStripeStatus(stripeStatus) {
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
exports.syncSubscriptionStatus = functionsV1.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId } = data;
    if (!teamId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId is required');
    }
    try {
        // Get team document
        const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
        const teamData = teamDoc.data();
        if (!teamData) {
            throw new functionsV1.https.HttpsError('not-found', 'Team not found');
        }
        const customerId = (_b = (_a = teamData.billing) === null || _a === void 0 ? void 0 : _a.subscription) === null || _b === void 0 ? void 0 : _b.stripeCustomerId;
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
            'billing.subscription.currentPeriodStart': subscription.current_period_start * 1000,
            'billing.subscription.currentPeriodEnd': subscription.current_period_end * 1000,
            'billing.subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
            'billing.lastSyncedAt': new Date(),
        });
        return {
            status,
            subscriptionId: subscription.id,
            currentPeriodEnd: subscription.current_period_end * 1000,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            synced: true,
        };
    }
    catch (error) {
        console.error('Error syncing subscription:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Verify checkout session completion (called after redirect from Stripe)
 * This replaces the webhook for checkout.session.completed
 */
exports.verifyCheckoutSession = functionsV1.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { sessionId, teamId } = data;
    if (!sessionId || !teamId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'sessionId and teamId are required');
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
        const subscription = session.subscription;
        if (!subscription) {
            return {
                success: false,
                error: 'No subscription found',
            };
        }
        // Update team billing info in Firestore
        // Store timestamps as milliseconds for easier frontend handling
        await admin.firestore().collection('teams').doc(teamId).update({
            'billing.subscription.status': 'active',
            'billing.subscription.stripeCustomerId': session.customer,
            'billing.subscription.stripeSubscriptionId': subscription.id,
            'billing.subscription.currentPeriodStart': subscription.current_period_start * 1000,
            'billing.subscription.currentPeriodEnd': subscription.current_period_end * 1000,
            'billing.subscription.cancelAtPeriodEnd': false,
            'billing.lastSyncedAt': new Date(),
        });
        return {
            success: true,
            status: 'active',
            subscriptionId: subscription.id,
        };
    }
    catch (error) {
        console.error('Error verifying checkout session:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Accept a team invite using admin privileges
 * This bypasses Firestore rules to allow invited users to join teams
 */
exports.acceptTeamInvite = functionsV1.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId, memberEmail, memberDisplayName, memberPhotoURL } = data;
    if (!teamId || !memberEmail) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId and memberEmail are required');
    }
    // Verify the caller's email matches the invite email (case-insensitive)
    const callerEmail = (_a = context.auth.token.email) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    const normalizedEmail = memberEmail.toLowerCase();
    if (callerEmail !== normalizedEmail) {
        throw new functionsV1.https.HttpsError('permission-denied', 'You can only accept invites for your own email');
    }
    try {
        const db = admin.firestore();
        // 1. Find the invite - try lowercase ID first, then search by teamId
        let inviteId = `${teamId}_${normalizedEmail.replace(/[.@]/g, '_')}`;
        let inviteDoc = await db.collection('team_invites').doc(inviteId).get();
        // If not found with lowercase, search for it
        if (!inviteDoc.exists) {
            console.log(`Invite not found with ID ${inviteId}, searching...`);
            const invitesSnapshot = await db.collection('team_invites')
                .where('teamId', '==', teamId)
                .where('status', '==', 'pending')
                .get();
            const matchingInvite = invitesSnapshot.docs.find(doc => { var _a; return ((_a = doc.data().memberEmail) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === normalizedEmail; });
            if (matchingInvite) {
                inviteId = matchingInvite.id;
                inviteDoc = matchingInvite;
                console.log(`Found invite with ID: ${inviteId}`);
            }
        }
        if (!inviteDoc.exists) {
            throw new functionsV1.https.HttpsError('not-found', 'No pending invite found for this team');
        }
        const inviteData = inviteDoc.data();
        if ((inviteData === null || inviteData === void 0 ? void 0 : inviteData.status) !== 'pending') {
            throw new functionsV1.https.HttpsError('failed-precondition', 'Invite is not pending');
        }
        const role = (inviteData === null || inviteData === void 0 ? void 0 : inviteData.role) || 'member';
        // 2. Get the team
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functionsV1.https.HttpsError('not-found', 'Team not found');
        }
        // 3. Update team with new member
        const memberEmailKey = normalizedEmail.replace('.', '_DOT_').replace('@', '_AT_');
        const now = firestore_1.FieldValue.serverTimestamp();
        await db.collection('teams').doc(teamId).update({
            [`members.${memberEmailKey}`]: {
                email: normalizedEmail,
                role: role,
                joinedAt: now,
                displayName: memberDisplayName || normalizedEmail,
                photoURL: memberPhotoURL || null,
            },
            memberEmails: firestore_1.FieldValue.arrayUnion(normalizedEmail),
        });
        // 4. Update invite status
        await db.collection('team_invites').doc(inviteId).update({
            status: 'accepted',
            acceptedAt: now,
        });
        // 5. Create notification for team owner
        const teamData = teamDoc.data();
        if (teamData === null || teamData === void 0 ? void 0 : teamData.createdBy) {
            await db.collection('teams').doc(teamId).collection('notifications').add({
                type: 'member_joined',
                title: 'New Team Member',
                message: `${memberDisplayName || normalizedEmail} has joined your team as ${role}`,
                recipientEmail: teamData.createdBy,
                senderEmail: normalizedEmail,
                senderName: memberDisplayName || normalizedEmail,
                createdAt: now,
                read: false,
            });
        }
        console.log(`✅ ${normalizedEmail} accepted invite to team ${teamId} as ${role}`);
        return {
            success: true,
            teamId,
            role,
            teamName: teamData === null || teamData === void 0 ? void 0 : teamData.name,
        };
    }
    catch (error) {
        console.error('Error accepting team invite:', error);
        if (error instanceof functionsV1.https.HttpsError) {
            throw error;
        }
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Automatically update subscription when team members change
 * Triggered by Firestore document changes
 */
exports.onTeamMemberChange = functionsV1.firestore
    .document('teams/{teamId}')
    .onUpdate(async (change, context) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const before = change.before.data();
    const after = change.after.data();
    // Check if member count changed
    const beforeCount = ((_a = before.memberEmails) === null || _a === void 0 ? void 0 : _a.length) || 0;
    const afterCount = ((_b = after.memberEmails) === null || _b === void 0 ? void 0 : _b.length) || 0;
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
    const subscriptionId = (_d = (_c = after.billing) === null || _c === void 0 ? void 0 : _c.subscription) === null || _d === void 0 ? void 0 : _d.stripeSubscriptionId;
    if (subscriptionId && ((_f = (_e = after.billing) === null || _e === void 0 ? void 0 : _e.subscription) === null || _f === void 0 ? void 0 : _f.status) === 'active') {
        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const subscriptionItemId = (_g = subscription.items.data[0]) === null || _g === void 0 ? void 0 : _g.id;
            if (subscriptionItemId) {
                await stripe.subscriptionItems.update(subscriptionItemId, {
                    quantity: afterCount,
                });
                console.log(`Updated Stripe subscription quantity to ${afterCount}`);
            }
        }
        catch (error) {
            console.error('Error updating Stripe subscription:', error);
        }
    }
});
/**
 * Scheduled function to check and block members whose grace period has expired
 * Runs daily at midnight UTC
 */
exports.checkGracePeriodExpiry = functionsV1.pubsub
    .schedule('0 0 * * *') // Run daily at midnight UTC
    .timeZone('UTC')
    .onRun(async () => {
    console.log('🔄 Running grace period expiry check...');
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    try {
        // Get all teams
        const teamsSnapshot = await db.collection('teams').get();
        let blockedCount = 0;
        for (const teamDoc of teamsSnapshot.docs) {
            const teamData = teamDoc.data();
            const members = teamData.members || {};
            let teamUpdated = false;
            const updates = {};
            // Check each member's grace period
            for (const [memberKey, member] of Object.entries(members)) {
                const memberData = member;
                if (memberData.billingStatus === 'grace_period' && memberData.gracePeriodEnd) {
                    const gracePeriodEnd = memberData.gracePeriodEnd.toDate ?
                        memberData.gracePeriodEnd.toDate() : new Date(memberData.gracePeriodEnd);
                    if (gracePeriodEnd <= now.toDate()) {
                        // Grace period has expired - block the member
                        console.log(`⏰ Grace period expired for ${memberData.email} in team ${teamDoc.id}`);
                        updates[`members.${memberKey}.billingStatus`] = 'blocked';
                        teamUpdated = true;
                        blockedCount++;
                        // Create notification for the team owner
                        const ownerEmail = teamData.createdBy;
                        if (ownerEmail) {
                            await db.collection('teams').doc(teamDoc.id).collection('notifications').add({
                                type: 'billing_warning',
                                title: 'Member Access Blocked',
                                message: `${memberData.displayName || memberData.email}'s grace period has expired. They can no longer access team features until payment is resolved.`,
                                recipientEmail: ownerEmail,
                                senderEmail: 'system',
                                senderName: 'System',
                                createdAt: now,
                                read: false,
                            });
                        }
                    }
                }
            }
            // Apply updates if any members were blocked
            if (teamUpdated) {
                await teamDoc.ref.update(updates);
            }
        }
        console.log(`✅ Grace period check complete. Blocked ${blockedCount} member(s).`);
        return null;
    }
    catch (error) {
        console.error('Error checking grace period expiry:', error);
        throw error;
    }
});
/**
 * Retry failed billing charges for members in grace period
 * Runs daily at 2 AM UTC
 */
exports.retryFailedCharges = functionsV1.pubsub
    .schedule('0 2 * * *') // Run daily at 2 AM UTC
    .timeZone('UTC')
    .onRun(async () => {
    var _a, _b, _c, _d;
    console.log('🔄 Running retry for failed charges...');
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    try {
        // Get all teams with active subscriptions
        const teamsSnapshot = await db.collection('teams')
            .where('billing.subscription.status', '==', 'active')
            .get();
        let retryCount = 0;
        let successCount = 0;
        for (const teamDoc of teamsSnapshot.docs) {
            const teamData = teamDoc.data();
            const members = teamData.members || {};
            const subscriptionId = (_b = (_a = teamData.billing) === null || _a === void 0 ? void 0 : _a.subscription) === null || _b === void 0 ? void 0 : _b.stripeSubscriptionId;
            if (!subscriptionId)
                continue;
            // Check for members in grace period
            for (const [memberKey, member] of Object.entries(members)) {
                const memberData = member;
                if (memberData.billingStatus === 'grace_period') {
                    retryCount++;
                    console.log(`💳 Retrying charge for ${memberData.email} in team ${teamDoc.id}`);
                    try {
                        // Try to update subscription quantity (this will trigger a charge)
                        const memberCount = ((_c = teamData.memberEmails) === null || _c === void 0 ? void 0 : _c.length) || 1;
                        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                        const subscriptionItemId = (_d = subscription.items.data[0]) === null || _d === void 0 ? void 0 : _d.id;
                        if (subscriptionItemId) {
                            await stripe.subscriptionItems.update(subscriptionItemId, {
                                quantity: memberCount,
                                proration_behavior: 'create_prorations',
                            });
                            // If successful, update member status to active
                            await teamDoc.ref.update({
                                [`members.${memberKey}.billingStatus`]: 'active',
                                [`members.${memberKey}.gracePeriodEnd`]: admin.firestore.FieldValue.delete(),
                                [`members.${memberKey}.chargeFailureReason`]: admin.firestore.FieldValue.delete(),
                                [`members.${memberKey}.lastChargeAttempt`]: now,
                            });
                            successCount++;
                            console.log(`✅ Charge successful for ${memberData.email}`);
                            // Notify owner of successful charge
                            const ownerEmail = teamData.createdBy;
                            if (ownerEmail) {
                                await db.collection('teams').doc(teamDoc.id).collection('notifications').add({
                                    type: 'billing_updated',
                                    title: 'Payment Successful',
                                    message: `Payment for ${memberData.displayName || memberData.email} has been processed successfully.`,
                                    recipientEmail: ownerEmail,
                                    senderEmail: 'system',
                                    senderName: 'System',
                                    createdAt: now,
                                    read: false,
                                });
                            }
                        }
                    }
                    catch (chargeError) {
                        console.warn(`⚠️ Charge retry failed for ${memberData.email}:`, chargeError.message);
                        // Update last charge attempt
                        await teamDoc.ref.update({
                            [`members.${memberKey}.lastChargeAttempt`]: now,
                            [`members.${memberKey}.chargeFailureReason`]: chargeError.message || 'Payment failed',
                        });
                    }
                }
            }
        }
        console.log(`✅ Retry complete. Attempted ${retryCount}, succeeded ${successCount}.`);
        return null;
    }
    catch (error) {
        console.error('Error retrying failed charges:', error);
        throw error;
    }
});
// ============================================================================
// LIVEKIT RECORDING FUNCTIONS (Firestore Trigger based - no CORS/IAM issues)
// ============================================================================
/**
 * Get active egress for a room (callable function)
 * This allows the client to retrieve the egressId when the Firestore trigger
 * can't write it back due to IAM permission issues
 */
exports.getActiveEgress = functionsV1.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { roomName, recordingId, teamId } = data;
    if (!roomName) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'roomName is required');
    }
    try {
        const client = getEgressClient();
        // List all active egress for this room
        const egressList = await client.listEgress({ roomName });
        console.log(`Found ${egressList.length} egress for room ${roomName}`);
        // Find active egress (status EGRESS_STARTING or EGRESS_ACTIVE)
        const activeEgress = egressList.find(e => e.status === 0 || // EGRESS_STARTING
            e.status === 1 // EGRESS_ACTIVE
        );
        if (activeEgress) {
            console.log(`Found active egress: ${activeEgress.egressId}, status: ${activeEgress.status}`);
            // Also try to update the recording document with the egressId
            if (recordingId && teamId) {
                try {
                    const db = admin.firestore();
                    await db.collection('teams').doc(teamId).collection('recordings').doc(recordingId).update({
                        egressId: activeEgress.egressId,
                    });
                    console.log(`Updated recording ${recordingId} with egressId`);
                }
                catch (updateError) {
                    console.warn('Could not update recording document:', updateError);
                }
            }
            return {
                success: true,
                egressId: activeEgress.egressId,
                status: activeEgress.status,
            };
        }
        return {
            success: false,
            error: 'No active egress found for this room',
        };
    }
    catch (error) {
        console.error('Error getting active egress:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
// Import 2nd gen functions for public access support
const https_1 = require("firebase-functions/v2/https");
/**
 * HTTP endpoint to get active egress (2nd Gen with public access)
 * Uses Firebase ID token for authentication
 * Named V2 to avoid conflict with existing 1st gen function
 */
exports.getActiveEgressV2 = (0, https_1.onRequest)({
    cors: true, // Enable CORS for all origins
    invoker: 'public', // Allow public access (bypasses IAM invoker requirement)
}, async (req, res) => {
    try {
        // Verify Firebase ID token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
            return;
        }
        const idToken = authHeader.split('Bearer ')[1];
        try {
            await admin.auth().verifyIdToken(idToken);
        }
        catch (authError) {
            console.error('Token verification failed:', authError);
            res.status(401).json({ success: false, error: 'Invalid token' });
            return;
        }
        const { roomName, recordingId, teamId } = req.body;
        if (!roomName) {
            res.status(400).json({ success: false, error: 'roomName is required' });
            return;
        }
        console.log(`[getActiveEgressHttp] Looking for egress in room: ${roomName}`);
        const client = getEgressClient();
        const egressList = await client.listEgress({ roomName });
        console.log(`[getActiveEgressHttp] Found ${egressList.length} egress for room ${roomName}`);
        // Find active egress
        const activeEgress = egressList.find(e => e.status === 0 || // EGRESS_STARTING
            e.status === 1 // EGRESS_ACTIVE
        );
        if (activeEgress) {
            console.log(`[getActiveEgressHttp] ✅ Found active egress: ${activeEgress.egressId}`);
            // Try to update recording document
            if (recordingId && teamId) {
                try {
                    const db = admin.firestore();
                    await db.collection('teams').doc(teamId).collection('recordings').doc(recordingId).update({
                        egressId: activeEgress.egressId,
                    });
                    console.log(`[getActiveEgressHttp] Updated recording ${recordingId}`);
                }
                catch (updateError) {
                    console.warn('[getActiveEgressHttp] Could not update recording:', updateError);
                }
            }
            res.json({
                success: true,
                egressId: activeEgress.egressId,
                status: activeEgress.status,
            });
        }
        else {
            console.log('[getActiveEgressHttp] No active egress found');
            res.json({
                success: false,
                error: 'No active egress found for this room',
            });
        }
    }
    catch (error) {
        console.error('[getActiveEgressHttp] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * Process recording requests via Firestore trigger
 * Client writes to 'teams/{teamId}/recordingRequests/{requestId}'
 * This trigger processes the request and updates the document with results
 *
 * This approach bypasses CORS and IAM invoker issues because:
 * - Firestore writes use the Firebase SDK (no CORS)
 * - Firestore triggers run server-side (no public access needed)
 */
exports.processRecordingRequest = functionsV1.firestore
    .document('teams/{teamId}/recordingRequests/{requestId}')
    .onCreate(async (snapshot, context) => {
    const { teamId, requestId } = context.params;
    const requestData = snapshot.data();
    const db = admin.firestore();
    const requestRef = db.collection('teams').doc(teamId).collection('recordingRequests').doc(requestId);
    console.log(`Processing recording request ${requestId} for team ${teamId}:`, requestData);
    // Helper to safely update Firestore (handles permission issues gracefully)
    const safeUpdate = async (ref, data) => {
        try {
            await ref.update(data);
            return true;
        }
        catch (updateError) {
            console.warn(`Failed to update document (permission issue): ${updateError.message}`);
            return false;
        }
    };
    try {
        const { action, recordingId, roomName, type, egressId } = requestData;
        if (action === 'start') {
            // Start recording
            if (!recordingId || !roomName) {
                await safeUpdate(requestRef, {
                    status: 'error',
                    error: 'recordingId and roomName are required',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }
            const client = getEgressClient();
            // Validate S3 credentials
            if (!AWS_S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
                await safeUpdate(requestRef, {
                    status: 'error',
                    error: 'AWS S3 credentials not configured',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }
            // Configure S3 output - always use MP4 for better codec compatibility
            const filePath = `recordings/${teamId}/${recordingId}`;
            const fileExtension = 'mp4';
            const fileOutput = new livekit_server_sdk_1.EncodedFileOutput({
                filepath: `${filePath}.${fileExtension}`,
                fileType: livekit_server_sdk_1.EncodedFileType.MP4,
                output: {
                    case: 's3',
                    value: new livekit_server_sdk_1.S3Upload({
                        bucket: AWS_S3_BUCKET,
                        region: AWS_S3_REGION,
                        accessKey: AWS_ACCESS_KEY_ID,
                        secret: AWS_SECRET_ACCESS_KEY,
                    }),
                },
            });
            // Start the egress with audio-only option if not video type
            const egressOptions = type === 'video'
                ? { file: fileOutput }
                : { file: fileOutput, audioOnly: true };
            const egressInfo = await client.startRoomCompositeEgress(roomName, egressOptions);
            console.log(`✅ Started recording for room ${roomName}, egressId: ${egressInfo.egressId}`);
            // Try to update both documents - but don't fail if we can't
            const recordingRef = db.collection('teams').doc(teamId).collection('recordings').doc(recordingId);
            // Update recording document with egress ID
            await safeUpdate(recordingRef, {
                egressId: egressInfo.egressId,
            });
            // Update request with success
            await safeUpdate(requestRef, {
                status: 'completed',
                result: {
                    success: true,
                    egressId: egressInfo.egressId,
                },
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else if (action === 'stop') {
            // Stop recording
            if (!recordingId) {
                await safeUpdate(requestRef, {
                    status: 'error',
                    error: 'recordingId is required',
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }
            const client = getEgressClient();
            // If egressId provided, use it directly. Otherwise, find active egress for the room.
            let targetEgressId = egressId;
            if (!targetEgressId && roomName) {
                // Query LiveKit for active egress in this room
                console.log(`No egressId provided, querying LiveKit for active egress in room: ${roomName}`);
                const egressList = await client.listEgress({ roomName });
                const activeEgress = egressList.find(e => e.status === 0 || // EGRESS_STARTING
                    e.status === 1 // EGRESS_ACTIVE
                );
                if (activeEgress) {
                    targetEgressId = activeEgress.egressId;
                    console.log(`Found active egress: ${targetEgressId}`);
                }
            }
            if (!targetEgressId) {
                // No active egress found - might have already stopped
                console.log('No active egress found, treating as already stopped');
                await safeUpdate(requestRef, {
                    status: 'completed',
                    result: {
                        success: true,
                        message: 'No active recording found (may have already stopped)',
                    },
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return;
            }
            // Stop the egress
            await client.stopEgress(targetEgressId);
            // Construct S3 URL
            const filePath = `recordings/${teamId}/${recordingId}.mp4`;
            const fileUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${filePath}`;
            console.log(`✅ Stopped recording ${recordingId}, egressId: ${targetEgressId}`);
            // Try to update recording document to 'processing' status
            // The file is being uploaded to S3 asynchronously by LiveKit
            // LiveKit webhook will update to 'completed' when upload finishes
            // Or client will poll and mark as completed after timeout
            const recordingRef = db.collection('teams').doc(teamId).collection('recordings').doc(recordingId);
            await safeUpdate(recordingRef, {
                status: 'processing',
                expectedFileUrl: fileUrl,
                endedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            // Update request with success
            await safeUpdate(requestRef, {
                status: 'completed',
                result: {
                    success: true,
                    fileUrl,
                },
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
            await safeUpdate(requestRef, {
                status: 'error',
                error: `Unknown action: ${action}`,
                processedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    }
    catch (error) {
        console.error('Error processing recording request:', error);
        // Try to update with error, but don't fail if we can't
        await safeUpdate(requestRef, {
            status: 'error',
            error: error.message || 'Unknown error',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
});
/**
 * LiveKit Webhook Handler
 * Receives notifications when:
 * - Egress (recording) status changes
 * - Room closes (all participants left) - auto-stops any active recordings
 */
exports.livekitEgressWebhook = functionsV1.https.onRequest(async (req, res) => {
    // Verify webhook signature (LiveKit uses JWT for webhooks)
    // For production, you should verify the webhook signature
    // const token = req.headers['authorization']?.replace('Bearer ', '');
    var _a, _b, _c, _d;
    try {
        const event = req.body;
        console.log('Received LiveKit webhook:', JSON.stringify(event));
        // Handle room closed - auto-stop any active recordings
        if (event.event === 'room_finished') {
            const roomName = (_a = event.room) === null || _a === void 0 ? void 0 : _a.name;
            console.log(`🚪 Room finished: ${roomName}`);
            if (roomName) {
                const db = admin.firestore();
                // Find any active recordings for this room
                const recordingsSnapshot = await db.collectionGroup('recordings')
                    .where('liveKitRoomName', '==', roomName)
                    .where('status', '==', 'recording')
                    .get();
                console.log(`Found ${recordingsSnapshot.size} active recordings for room ${roomName}`);
                for (const recordingDoc of recordingsSnapshot.docs) {
                    const recordingData = recordingDoc.data();
                    const recordingId = recordingDoc.id;
                    const teamId = recordingData.teamId;
                    const egressId = recordingData.egressId;
                    console.log(`🛑 Auto-stopping recording ${recordingId} (egressId: ${egressId || 'unknown'})`);
                    try {
                        // Try to stop the egress if we have an ID
                        if (egressId) {
                            const client = getEgressClient();
                            try {
                                await client.stopEgress(egressId);
                                console.log(`✅ Stopped egress ${egressId}`);
                            }
                            catch (egressError) {
                                // Egress might already be stopped
                                console.warn(`Could not stop egress ${egressId}: ${egressError.message}`);
                            }
                        }
                        else {
                            // No egressId, try to find and stop any active egress for this room
                            try {
                                const client = getEgressClient();
                                const egressList = await client.listEgress({ roomName });
                                const activeEgress = egressList.find(e => e.status === 0 || e.status === 1);
                                if (activeEgress) {
                                    await client.stopEgress(activeEgress.egressId);
                                    console.log(`✅ Stopped discovered egress ${activeEgress.egressId}`);
                                }
                            }
                            catch (listError) {
                                console.warn(`Could not list/stop egress for room ${roomName}: ${listError.message}`);
                            }
                        }
                        // Construct expected S3 URL
                        const filePath = `recordings/${teamId}/${recordingId}.mp4`;
                        const fileUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${filePath}`;
                        // Update recording to processing status
                        await recordingDoc.ref.update({
                            status: 'processing',
                            expectedFileUrl: fileUrl,
                            endedAt: admin.firestore.FieldValue.serverTimestamp(),
                            autoStoppedReason: 'room_closed',
                        });
                        console.log(`📝 Recording ${recordingId} marked as processing (auto-stopped)`);
                    }
                    catch (stopError) {
                        console.error(`Failed to auto-stop recording ${recordingId}:`, stopError);
                        // Mark as failed if we couldn't handle it
                        await recordingDoc.ref.update({
                            status: 'failed',
                            error: `Room closed but failed to stop recording: ${stopError.message}`,
                            endedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                }
            }
        }
        // Handle egress ended - update recording with file info
        if (event.event === 'egress_ended') {
            const egressId = (_b = event.egressInfo) === null || _b === void 0 ? void 0 : _b.egressId;
            const status = (_c = event.egressInfo) === null || _c === void 0 ? void 0 : _c.status;
            const fileResults = ((_d = event.egressInfo) === null || _d === void 0 ? void 0 : _d.fileResults) || [];
            if (egressId) {
                const db = admin.firestore();
                // Find the recording by egressId
                const recordingsSnapshot = await db.collectionGroup('recordings')
                    .where('egressId', '==', egressId)
                    .limit(1)
                    .get();
                if (!recordingsSnapshot.empty) {
                    const recordingDoc = recordingsSnapshot.docs[0];
                    const recordingRef = recordingDoc.ref;
                    // Get file info from results
                    const fileResult = fileResults[0];
                    const fileSize = (fileResult === null || fileResult === void 0 ? void 0 : fileResult.size) || 0;
                    const duration = (fileResult === null || fileResult === void 0 ? void 0 : fileResult.duration) ? Math.floor(fileResult.duration / 1000000000) : 0; // Convert nanoseconds to seconds
                    // Construct proper S3 URL for the recording file
                    let fileUrl = null;
                    if (status === 'EGRESS_COMPLETE' && (fileResult === null || fileResult === void 0 ? void 0 : fileResult.filename)) {
                        // S3 URL format: https://{bucket}.s3.{region}.amazonaws.com/{filepath}
                        const filepath = fileResult.filename;
                        fileUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_S3_REGION}.amazonaws.com/${filepath}`;
                        console.log(`📁 Recording file URL: ${fileUrl}`);
                    }
                    // Update recording with file info
                    await recordingRef.update({
                        status: status === 'EGRESS_COMPLETE' ? 'completed' : 'failed',
                        fileUrl,
                        fileSize,
                        duration,
                        processedAt: admin.firestore.FieldValue.serverTimestamp(),
                        error: status !== 'EGRESS_COMPLETE' ? `Egress failed with status: ${status}` : null,
                    });
                    console.log(`✅ Updated recording ${recordingDoc.id} with egress results`);
                }
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Error processing LiveKit webhook:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============================================================================
// PROMO CODE FUNCTIONS
// ============================================================================
/**
 * Validate a promo code without redeeming it
 * Returns code details if valid
 */
exports.validatePromoCode = functionsV1.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { code } = data;
    if (!code) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'code is required');
    }
    try {
        const db = admin.firestore();
        const normalizedCode = code.toUpperCase().trim();
        // Look up the promo code
        const codeDoc = await db.collection('promoCodes').doc(normalizedCode).get();
        if (!codeDoc.exists) {
            return {
                valid: false,
                error: 'Invalid promo code',
            };
        }
        const codeData = codeDoc.data();
        // Check if code is active
        if (!(codeData === null || codeData === void 0 ? void 0 : codeData.isActive)) {
            return {
                valid: false,
                error: 'This promo code is no longer active',
            };
        }
        // Check if code has expired
        if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
            return {
                valid: false,
                error: 'This promo code has expired',
            };
        }
        // Check redemption limit
        const remainingRedemptions = codeData.maxRedemptions - (codeData.currentRedemptions || 0);
        if (remainingRedemptions <= 0) {
            return {
                valid: false,
                error: 'This promo code has reached its usage limit',
            };
        }
        return {
            valid: true,
            code: normalizedCode,
            type: codeData.type,
            durationMonths: codeData.durationMonths,
            remainingRedemptions,
        };
    }
    catch (error) {
        console.error('Error validating promo code:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Redeem a promo code for a team
 * Creates a promoRedemption record and updates team billing
 */
exports.redeemPromoCode = functionsV1.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId, code } = data;
    if (!teamId || !code) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId and code are required');
    }
    try {
        const db = admin.firestore();
        const normalizedCode = code.toUpperCase().trim();
        const callerEmail = ((_a = context.auth.token.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const userId = context.auth.uid;
        // Get the team
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functionsV1.https.HttpsError('not-found', 'Team not found');
        }
        const teamData = teamDoc.data();
        // Verify caller is the team owner
        if (((_b = teamData === null || teamData === void 0 ? void 0 : teamData.createdBy) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== callerEmail) {
            throw new functionsV1.https.HttpsError('permission-denied', 'Only the team owner can redeem promo codes');
        }
        // Check if team already has an active promo
        const existingPromo = await db.collection('promoRedemptions')
            .where('teamId', '==', teamId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (!existingPromo.empty) {
            return {
                success: false,
                error: 'This team already has an active promo. You cannot stack promo codes.',
            };
        }
        // Validate the promo code
        const codeDoc = await db.collection('promoCodes').doc(normalizedCode).get();
        if (!codeDoc.exists) {
            return {
                success: false,
                error: 'Invalid promo code',
            };
        }
        const codeData = codeDoc.data();
        // Check if code is active
        if (!(codeData === null || codeData === void 0 ? void 0 : codeData.isActive)) {
            return {
                success: false,
                error: 'This promo code is no longer active',
            };
        }
        // Check if code has expired
        if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
            return {
                success: false,
                error: 'This promo code has expired',
            };
        }
        // Check redemption limit
        if ((codeData.currentRedemptions || 0) >= codeData.maxRedemptions) {
            return {
                success: false,
                error: 'This promo code has reached its usage limit',
            };
        }
        // Calculate promo period
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + codeData.durationMonths);
        // Create redemption record
        const redemptionId = `${teamId}_${normalizedCode}_${Date.now()}`;
        const redemption = {
            id: redemptionId,
            type: 'welcome',
            code: normalizedCode,
            domain: null,
            userId,
            userEmail: callerEmail,
            teamId,
            teamName: (teamData === null || teamData === void 0 ? void 0 : teamData.name) || 'Unknown Team',
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            durationMonths: codeData.durationMonths,
            promoStartDate: admin.firestore.Timestamp.fromDate(now),
            promoExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            status: 'active',
        };
        // Use a batch to update atomically
        const batch = db.batch();
        // Create redemption
        batch.set(db.collection('promoRedemptions').doc(redemptionId), redemption);
        // Increment code redemption count
        batch.update(codeDoc.ref, {
            currentRedemptions: firestore_1.FieldValue.increment(1),
        });
        // Update team billing to reflect promo status
        batch.update(teamDoc.ref, {
            'billing.promoActive': true,
            'billing.promoExpiresAt': admin.firestore.Timestamp.fromDate(expiresAt),
            'billing.promoType': 'welcome',
            'billing.promoCode': normalizedCode,
        });
        await batch.commit();
        console.log(`✅ Promo code ${normalizedCode} redeemed by ${callerEmail} for team ${teamId}`);
        return {
            success: true,
            redemption: Object.assign(Object.assign({}, redemption), { redeemedAt: now, promoStartDate: now, promoExpiresAt: expiresAt }),
        };
    }
    catch (error) {
        console.error('Error redeeming promo code:', error);
        if (error instanceof functionsV1.https.HttpsError) {
            throw error;
        }
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Check if an email domain is a partner domain
 * Called on login to auto-detect partnerships
 */
exports.checkPartnerDomain = functionsV1.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const email = ((_a = context.auth.token.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    if (!email) {
        return {
            isPartner: false,
            error: 'No email found',
        };
    }
    try {
        const db = admin.firestore();
        // Extract domain from email
        const domain = email.split('@')[1];
        if (!domain) {
            return {
                isPartner: false,
                error: 'Invalid email format',
            };
        }
        // Look up the domain
        const domainDoc = await db.collection('partnerDomains').doc(domain).get();
        if (!domainDoc.exists) {
            return {
                isPartner: false,
            };
        }
        const domainData = domainDoc.data();
        // Check if partnership is active
        if (!(domainData === null || domainData === void 0 ? void 0 : domainData.isActive)) {
            return {
                isPartner: false,
            };
        }
        return {
            isPartner: true,
            domain,
            partnerName: domainData.partnerName,
            durationMonths: domainData.durationMonths,
        };
    }
    catch (error) {
        console.error('Error checking partner domain:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Redeem a partner domain promo for a team
 * Called automatically when team owner has a partner domain email
 */
exports.redeemPartnerPromo = functionsV1.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId } = data;
    if (!teamId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId is required');
    }
    try {
        const db = admin.firestore();
        const callerEmail = ((_a = context.auth.token.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const userId = context.auth.uid;
        // Extract domain from email
        const domain = callerEmail.split('@')[1];
        if (!domain) {
            return {
                success: false,
                error: 'Invalid email format',
            };
        }
        // Check if domain is a partner
        const domainDoc = await db.collection('partnerDomains').doc(domain).get();
        if (!domainDoc.exists || !((_b = domainDoc.data()) === null || _b === void 0 ? void 0 : _b.isActive)) {
            return {
                success: false,
                error: 'Your email domain is not a partner',
            };
        }
        const domainData = domainDoc.data();
        // Get the team
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functionsV1.https.HttpsError('not-found', 'Team not found');
        }
        const teamData = teamDoc.data();
        // Verify caller is the team owner
        if (((_c = teamData === null || teamData === void 0 ? void 0 : teamData.createdBy) === null || _c === void 0 ? void 0 : _c.toLowerCase()) !== callerEmail) {
            return {
                success: false,
                error: 'Only the team owner can redeem partner promos',
            };
        }
        // Check if team already has an active promo
        const existingPromo = await db.collection('promoRedemptions')
            .where('teamId', '==', teamId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (!existingPromo.empty) {
            return {
                success: false,
                error: 'This team already has an active promo',
            };
        }
        // Calculate promo period
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + ((domainData === null || domainData === void 0 ? void 0 : domainData.durationMonths) || 12));
        // Create redemption record
        const redemptionId = `${teamId}_partner_${domain}_${Date.now()}`;
        const redemption = {
            id: redemptionId,
            type: 'partnership',
            code: null,
            domain,
            userId,
            userEmail: callerEmail,
            teamId,
            teamName: (teamData === null || teamData === void 0 ? void 0 : teamData.name) || 'Unknown Team',
            redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
            durationMonths: (domainData === null || domainData === void 0 ? void 0 : domainData.durationMonths) || 12,
            promoStartDate: admin.firestore.Timestamp.fromDate(now),
            promoExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            status: 'active',
        };
        // Use a batch to update atomically
        const batch = db.batch();
        // Create redemption
        batch.set(db.collection('promoRedemptions').doc(redemptionId), redemption);
        // Update team billing to reflect promo status
        batch.update(teamDoc.ref, {
            'billing.promoActive': true,
            'billing.promoExpiresAt': admin.firestore.Timestamp.fromDate(expiresAt),
            'billing.promoType': 'partnership',
            'billing.promoPartnerDomain': domain,
            'billing.promoPartnerName': domainData === null || domainData === void 0 ? void 0 : domainData.partnerName,
        });
        await batch.commit();
        console.log(`✅ Partner promo for ${domain} redeemed by ${callerEmail} for team ${teamId}`);
        return {
            success: true,
            redemption: Object.assign(Object.assign({}, redemption), { redeemedAt: now, promoStartDate: now, promoExpiresAt: expiresAt }),
            partnerName: domainData === null || domainData === void 0 ? void 0 : domainData.partnerName,
        };
    }
    catch (error) {
        console.error('Error redeeming partner promo:', error);
        if (error instanceof functionsV1.https.HttpsError) {
            throw error;
        }
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Get active promo for a team
 * Returns promo details if one is active
 */
exports.getActivePromo = functionsV1.https.onCall(async (data, context) => {
    var _a, _b, _c, _d;
    if (!context.auth) {
        throw new functionsV1.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { teamId } = data;
    if (!teamId) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'teamId is required');
    }
    try {
        const db = admin.firestore();
        // Find active promo for this team
        const promoSnapshot = await db.collection('promoRedemptions')
            .where('teamId', '==', teamId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
        if (promoSnapshot.empty) {
            return {
                hasActivePromo: false,
            };
        }
        const promoDoc = promoSnapshot.docs[0];
        const promoData = promoDoc.data();
        // Check if promo has actually expired
        const expiresAt = ((_b = (_a = promoData.promoExpiresAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || promoData.promoExpiresAt;
        const now = new Date();
        if (expiresAt && new Date(expiresAt) < now) {
            // Promo has expired, update status
            await promoDoc.ref.update({ status: 'expired' });
            // Also update team billing
            const teamRef = db.collection('teams').doc(teamId);
            await teamRef.update({
                'billing.promoActive': false,
            });
            return {
                hasActivePromo: false,
                expired: true,
            };
        }
        // Calculate days remaining
        const daysRemaining = expiresAt
            ? Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        return {
            hasActivePromo: true,
            promo: {
                type: promoData.type,
                code: promoData.code,
                domain: promoData.domain,
                partnerName: promoData.partnerName,
                durationMonths: promoData.durationMonths,
                promoStartDate: ((_d = (_c = promoData.promoStartDate) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || promoData.promoStartDate,
                promoExpiresAt: expiresAt,
                daysRemaining,
                isExpiringSoon: daysRemaining <= 7,
            },
        };
    }
    catch (error) {
        console.error('Error getting active promo:', error);
        throw new functionsV1.https.HttpsError('internal', error.message);
    }
});
/**
 * Scheduled function to check and expire promos
 * Runs daily at midnight UTC
 */
exports.checkPromoExpiration = functionsV1.pubsub
    .schedule('0 0 * * *') // Run daily at midnight UTC
    .timeZone('UTC')
    .onRun(async () => {
    console.log('🔄 Running promo expiration check...');
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    try {
        // Find all active promos that have expired
        const expiredPromos = await db.collection('promoRedemptions')
            .where('status', '==', 'active')
            .where('promoExpiresAt', '<=', now)
            .get();
        let expiredCount = 0;
        for (const promoDoc of expiredPromos.docs) {
            const promoData = promoDoc.data();
            // Update promo status to expired
            await promoDoc.ref.update({ status: 'expired' });
            // Update team billing
            const teamId = promoData.teamId;
            if (teamId) {
                const teamRef = db.collection('teams').doc(teamId);
                await teamRef.update({
                    'billing.promoActive': false,
                });
                // Create notification for team owner
                const teamDoc = await teamRef.get();
                const teamData = teamDoc.data();
                const ownerEmail = teamData === null || teamData === void 0 ? void 0 : teamData.createdBy;
                if (ownerEmail) {
                    await db.collection('teams').doc(teamId).collection('notifications').add({
                        type: 'promo_expired',
                        title: 'Promo Period Ended',
                        message: promoData.type === 'partnership'
                            ? `Your ${promoData.partnerName || 'partner'} promo has expired. Upgrade to Pro to continue using premium features.`
                            : 'Your promo code has expired. Upgrade to Pro to continue using premium features.',
                        recipientEmail: ownerEmail,
                        senderEmail: 'system',
                        senderName: 'System',
                        createdAt: now,
                        read: false,
                    });
                }
            }
            expiredCount++;
            console.log(`⏰ Promo expired for team ${promoData.teamId}`);
        }
        console.log(`✅ Promo expiration check complete. Expired ${expiredCount} promo(s).`);
        return null;
    }
    catch (error) {
        console.error('Error checking promo expiration:', error);
        throw error;
    }
});
//# sourceMappingURL=index.js.map