import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

const SUSPICIOUS_KEYWORDS = [
  'drop table', 'drop database', 'select *', 'union select', 'delete from', 
  '<script>', 'javascript:', 'eval(', 'exec(', 'system(', 'shell_exec',
  'bypass', 'exploit', 'hack', 'admin=true', 'isAdmin=true'
];

/**
 * Checks if the given string contains any suspicious keywords/patterns.
 */
export const checkSuspiciousContent = (text) => {
  if (!text) return { isSuspicious: false, reason: '' };
  const lowerText = text.toLowerCase();
  
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { isSuspicious: true, reason: `Contains forbidden keyword/pattern: "${keyword}"` };
    }
  }
  return { isSuspicious: false, reason: '' };
};

/**
 * Log a user activity in the Firestore activity_logs collection.
 * Also performs rate-limiting checks to detect spamming share requests or questions.
 */
export const logActivity = async (user, action, description, metadata = {}) => {
  const userId = user?.id || user?.uid || 'anonymous';
  const username = user?.username || user?.displayName || 'anonymous';
  
  let isSuspicious = false;
  let suspiciousReason = '';

  // 1. Content check
  const contentCheck = checkSuspiciousContent(description + ' ' + JSON.stringify(metadata));
  if (contentCheck.isSuspicious) {
    isSuspicious = true;
    suspiciousReason = contentCheck.reason;
  }

  // 2. Performance/Bot-like behavior check (e.g. extremely high WPM)
  if (action === 'submit_mock' || action === 'submit_practice') {
    if (metadata.wpm > 300) {
      isSuspicious = true;
      suspiciousReason = `Impossible WPM of ${metadata.wpm} (potential automated bot submission).`;
    }
  }

  // 3. Sharing rate-limiting check
  if (action === 'share_request' && userId !== 'anonymous') {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const q = query(
        collection(db, 'activity_logs'),
        where('userId', '==', userId),
        where('action', '==', 'share_request'),
        where('timestamp', '>=', oneMinuteAgo),
        limit(10)
      );
      const snapshot = await getDocs(q);
      if (snapshot.size >= 5) {
        isSuspicious = true;
        suspiciousReason = `Spamming share requests: ${snapshot.size + 1} share requests in under 1 minute.`;
      }
    } catch (err) {
      console.error("Error checking share request rate:", err);
    }
  }

  // 4. Question creation rate check
  if (action === 'create_question' && userId !== 'anonymous') {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const q = query(
        collection(db, 'activity_logs'),
        where('userId', '==', userId),
        where('action', '==', 'create_question'),
        where('timestamp', '>=', oneMinuteAgo),
        limit(10)
      );
      const snapshot = await getDocs(q);
      if (snapshot.size >= 5) {
        isSuspicious = true;
        suspiciousReason = `Spamming question creation: ${snapshot.size + 1} custom questions created in under 1 minute.`;
      }
    } catch (err) {
      console.error("Error checking question creation rate:", err);
    }
  }

  try {
    const logData = {
      userId,
      username,
      action,
      description,
      isSuspicious,
      suspiciousReason,
      timestamp: new Date().toISOString(),
      metadata
    };
    await addDoc(collection(db, 'activity_logs'), logData);
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
};
