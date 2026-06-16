
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { PaymentLock, SmsWebhookLog, User, Order, Notification, Product, LegacyUser } from '@/lib/definitions';
import { ObjectId } from 'mongodb';
import { sendPushNotification } from '@/lib/push-notifications';
import { buildPurchaseSuccessHtml } from '@/lib/purchase-success-notifier';

// --- SMS Parsing Logic ---
function parseSms(body: string): { amount: number | null, upiRef: string | null } {
    // Regex for "Received ₹1 from Sayan Mondal"
    const newAmountMatch = body.match(/Received ₹\s*([\d,]+(\.\d{1,2})?)/);

    // Regex for "Bharat Interface for Money Received INR 1.00..."
    const oldAmountMatch = body.match(/Received INR\s*(\d+(\.\d{2})?)/);
    
    // Regex for "Received Rs.30.00 in your Kotak Bank..."
    const kotakAmountMatch = body.match(/Received Rs\.\s*([\d,]+(\.\d{1,2})?)/);

    // Regex for "credited with Rs.1.00"
    const airtelAmountMatch = body.match(/credited with Rs\.\s*([\d,]+(\.\d{1,2})?)/i);
    
    // Regex for "100.00 was credited to..."
    const growwAmountMatch = body.match(/([\d,]+(\.\d{1,2})?)\s*was credited to/i);

    // Upi Ref for compatibility, including formats like "UPI Ref:"
    const upiRefMatch = body.match(/Ref:(\d+)/i); // case-insensitive

    let amount = null;
    if (newAmountMatch) {
      amount = parseFloat(newAmountMatch[1].replace(/,/g, ''));
    } else if (oldAmountMatch) {
      amount = parseFloat(oldAmountMatch[1].replace(/,/g, ''));
    } else if (kotakAmountMatch) {
      amount = parseFloat(kotakAmountMatch[1].replace(/,/g, ''));
    } else if (airtelAmountMatch) {
      amount = parseFloat(airtelAmountMatch[1].replace(/,/g, ''));
    } else if (growwAmountMatch) {
      amount = parseFloat(growwAmountMatch[1].replace(/,/g, ''));
    }

    return {
        amount,
        upiRef: upiRefMatch ? upiRefMatch[1] : null
    };
}


async function createOrderFromLock(lock: PaymentLock, smsLogId: ObjectId) {
    const db = await connectToDatabase();
    const session = db.client.startSession();
    
    try {
        let createdOrder: Order | null = null;
        await session.withTransaction(async () => {
            const user = await db.collection<User>('users').findOne({ gamingId: lock.gamingId }, { session });
            const product = await db.collection<Product>('products').findOne({ _id: new ObjectId(lock.productId) });

            if (!user || !product) {
                throw new Error('User or Product not found for the payment lock.');
            }

            const coinsUsed = product.isCoinProduct ? 0 : Math.min(user.coins, product.coinsApplicable || 0);

            // Determine order status based on product type
            const orderStatus: Order['status'] = product.isCoinProduct ? 'Completed' : 'Processing';

            const newOrder: Omit<Order, '_id'> = {
                userId: user._id.toString(),
                gamingId: user.gamingId,
                productId: lock.productId,
                productName: lock.productName,
                productPrice: product.price,
                productImageUrl: product.imageUrl,
                paymentMethod: 'UPI-Auto',
                status: orderStatus, 
                coinsUsed,
                finalPrice: lock.amount,
                referralCode: user.referredByCode,
                isCoinProduct: !!product.isCoinProduct,
                createdAt: new Date(),
                coinsAtTimeOfPurchase: user.coins,
            };

            const orderResult = await db.collection<Order>('orders').insertOne(newOrder as Order, { session });
            createdOrder = { ...newOrder, _id: orderResult.insertedId };
            
            if (product.isCoinProduct) {
                // For coin products, order is completed immediately
                // Add coins to user
                await db.collection<User>('users').updateOne({ _id: user._id }, { $inc: { coins: product.quantity } }, { session });
                
                // If it's a coin product and it's completed, credit the referrer immediately.
                if (newOrder.referralCode) {
                    const rewardAmount = newOrder.finalPrice * 0.50;
                    await db.collection<LegacyUser>('legacy_users').updateOne(
                        { referralCode: newOrder.referralCode },
                        { $inc: { walletBalance: rewardAmount } },
                        { session }
                    );
                }

            } else if (coinsUsed > 0) {
                // For normal products, just deduct coins used.
                // The referrer will be credited when admin marks order as 'Completed'.
                await db.collection<User>('users').updateOne({ _id: user._id }, { $inc: { coins: -coinsUsed } }, { session });
            }


            await db.collection<PaymentLock>('payment_locks').updateOne(
                { _id: lock._id },
                { $set: { status: 'completed' } },
                { session }
            );

            await db.collection<SmsWebhookLog>('sms_webhook_logs').updateOne(
                { _id: smsLogId },
                { $set: { status: 'verified', matchedPaymentLockId: lock._id, matchedGamingId: user.gamingId } },
                { session }
            );
            
            const orderUrl = 'https://www.garenafreefire.store/order';
            const notificationMessage = `Your payment of ₹${lock.amount} for "${lock.productName}" has been successfully received. You can see the details and track your order here: ${orderUrl}`;
            const newNotification: Omit<Notification, '_id'> = {
                gamingId: user.gamingId,
                message: notificationMessage,
                // Rich animated "purchase successful" card for the bell; `message`
                // stays as the plain-text fallback (push / non-HTML clients).
                // The product image is embedded inside the card (near the bottom),
                // so we intentionally don't set the doc's separate `imageUrl` here
                // — that would render the image twice in the bell.
                html: buildPurchaseSuccessHtml({
                    productName: lock.productName,
                    amount: lock.amount,
                    status: orderStatus,
                    orderUrl,
                    imageUrl: product.imageUrl,
                }),
                isRead: false,
                createdAt: new Date(),
            };
            await db.collection<Notification>('notifications').insertOne(newNotification as Notification, { session });
        });
        
        // Send push notification outside the transaction
        const userForPush = await db.collection<User>('users').findOne({ gamingId: lock.gamingId });
        if (userForPush?.fcmToken && createdOrder) {
            await sendPushNotification({
                token: userForPush.fcmToken,
                title: 'Garena Store: Payment Received!',
                body: `Your payment of ₹${lock.amount} for "${createdOrder.productName}" is now processing.`,
                imageUrl: createdOrder.productImageUrl,
            });
        }
    } catch(error) {
        console.error(`Failed to create order for lock ${lock._id}:`, error);
        // If transaction fails, the webhook log remains 'unprocessed' for potential retry.
    } finally {
        await session.endSession();
    }
}


export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const smsBody = data.key;

    if (!smsBody) {
      return NextResponse.json({ success: false, message: 'SMS body not found in "key" field.' }, { status: 400 });
    }
    
    const db = await connectToDatabase();
    
    // Log the incoming SMS immediately
    const smsLog: Omit<SmsWebhookLog, '_id'> = {
        body: smsBody,
        sender: data.sender,
        receivedAt: new Date(),
        status: 'unprocessed',
    };
    const logResult = await db.collection('sms_webhook_logs').insertOne(smsLog as SmsWebhookLog);
    const smsLogId = logResult.insertedId;
    
    const { amount, upiRef } = parseSms(smsBody);
    
    if (amount === null) {
        await db.collection('sms_webhook_logs').updateOne({ _id: smsLogId }, { $set: { status: 'ignored_not_payment' } });
        return NextResponse.json({ success: true, message: 'Ignored: Not a payment SMS.' });
    }

    // Update log with parsed amount
    await db.collection('sms_webhook_logs').updateOne({ _id: smsLogId }, { $set: { parsedAmount: amount } });

    // --- Primary Match: Find an active lock for the exact amount ---
    const activeLock = await db.collection<PaymentLock>('payment_locks').findOne({ amount: amount, status: 'active' });
    if (activeLock) {
        await createOrderFromLock(activeLock, smsLogId);
        return NextResponse.json({ success: true, message: 'Payment verified and order created.' });
    }
    
    // --- Grace Period Match: Find a recently expired lock for the exact amount ---
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const recentExpiredLocks = await db.collection<PaymentLock>('payment_locks').find({
        amount: amount,
        status: 'expired',
        expiresAt: { $gte: thirtySecondsAgo }
    }).sort({ expiresAt: -1 }).toArray();

    if (recentExpiredLocks.length > 0) {
        // Grant the order to the most recently expired lock
        const lockToProcess = recentExpiredLocks[0];
        await createOrderFromLock(lockToProcess, smsLogId);
        return NextResponse.json({ success: true, message: 'Payment verified for recently expired session.' });
    }

    // If no match found
    await db.collection('sms_webhook_logs').updateOne({ _id: smsLogId }, { $set: { status: 'ignored_no_match' } });
    return NextResponse.json({ success: true, message: 'No matching payment session found.' });

  } catch (error) {
    console.error('SMS Webhook Error:', error);
    return NextResponse.json({ success: false, message: 'An internal error occurred.' }, { status: 500 });
  }
}

// Expire old locks that might have been missed by client-side events
async function expireOldLocks() {
    try {
        const db = await connectToDatabase();
        const now = new Date();
        const result = await db.collection<PaymentLock>('payment_locks').updateMany(
            { status: 'active', expiresAt: { $lt: now } },
            { $set: { status: 'expired' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`Expired ${result.modifiedCount} old payment locks.`);
        }
    } catch (error) {
        console.error("Error expiring old payment locks:", error);
    }
}

// Run the expiration check periodically.
// In a serverless environment, this might not run continuously,
// but it will trigger on incoming requests, providing a cleanup mechanism.
setInterval(expireOldLocks, 60 * 1000); // Check every minute
// Immediately run once on server startup
expireOldLocks();
