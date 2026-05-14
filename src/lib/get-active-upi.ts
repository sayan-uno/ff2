'use server';

import { connectToDatabase } from '@/lib/mongodb';

// Fallback UPI ID — this is the original hardcoded value.
// It is used ONLY if the database has no UPI ID configured yet (first run).
const FALLBACK_UPI_ID = 'ffgarenasmaxsayan@yesg';

interface AppSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

/**
 * Fetches the currently active UPI ID from the app_settings collection.
 * If no UPI ID is set in the database, returns the fallback value
 * and seeds the database with it for future use.
 * 
 * This function is lightweight and designed to be called from both
 * admin pages and the purchase modal.
 */
export async function getActiveUpiId(): Promise<string> {
  try {
    const db = await connectToDatabase();
    const setting = await db.collection<AppSetting>('app_settings').findOne({ key: 'active_upi_id' });

    if (setting) {
      return setting.value;
    }

    // First time: seed the database with the original hardcoded UPI ID
    await db.collection<AppSetting>('app_settings').insertOne({
      key: 'active_upi_id',
      value: FALLBACK_UPI_ID,
      updatedAt: new Date(),
    } as AppSetting);

    return FALLBACK_UPI_ID;
  } catch (error) {
    console.error('Error fetching active UPI ID, using fallback:', error);
    return FALLBACK_UPI_ID;
  }
}
