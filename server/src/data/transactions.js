/**
 * In-memory store of transaction statuses, filled by the PayWay callback
 * webhook and by check-transaction results. Deliberately not persisted:
 * this is a stateless demo and a server restart just means we poll
 * PayWay again for the truth.
 *
 * Keyed by our own tran_id.
 */

/** @type {Map<string, { status: "PAID"|"PENDING"|"UNKNOWN", raw: object, updatedAt: number }>} */
const transactions = new Map();

export function setTransaction(tranId, entry) {
  transactions.set(tranId, { ...entry, updatedAt: Date.now() });
}

export function getTransaction(tranId) {
  return transactions.get(tranId) || null;
}
