// ============================================================
// MongoDB storage for the AAPNA SPA website
//
// Collections (database name comes from MONGODB_URI, default "apkaspa"):
//   users        – customer accounts (password stored only as a scrypt hash)
//   bookings     – every booking: WhatsApp requests, online payments, cash-on-delivery
//   subscribers  – newsletter sign-ups
//   events       – activity log shown live on the admin dashboard (kept 90 days)
//
// Booking status flow:
//   WhatsApp request:  requested → confirmed → completed   (or cancelled)
//   Online / COD:      pending_payment → paid → confirmed → completed (or cancelled)
// ============================================================
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

let client;
let db;
let changeStreams = false; // true on Atlas / replica sets: any server copy can watch for new events

const col = (name) => db.collection(name);

// mongodb+srv:// addresses need a DNS "SRV" lookup. Some PCs/networks (e.g. a local DNS helper on
// 127.0.0.1) refuse it for Node, even though the browser works. If that happens, retry with public DNS.
async function ensureSrvDns(uri) {
  const m = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  if (!m) return;
  const dns = require('dns');
  const lookup = () => dns.promises.resolveSrv(`_mongodb._tcp.${m[1]}`);
  try { await lookup(); } catch (e) {
    const fallback = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((s) => s.trim()).filter(Boolean);
    dns.setServers(fallback);
    await lookup(); // throws a clear error if even public DNS can't find the cluster
    console.log(`MongoDB: your DNS (${e.code}) couldn't look up the cluster – using public DNS ${fallback.join(', ')} instead`);
  }
}

async function connect(uri) {
  await ensureSrvDns(uri);
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  db = client.db(); // database name from the URI path
  if (db.databaseName === 'test') db = client.db('apkaspa'); // URI without a database name

  const hello = await db.admin().command({ hello: 1 }).catch(() => ({}));
  changeStreams = Boolean(hello.setName || hello.msg === 'isdbgrid');

  await Promise.all([
    col('users').createIndex({ email: 1 }, { unique: true }),
    col('bookings').createIndex({ bookingId: 1 }, { unique: true }),
    col('bookings').createIndex({ 'payment.orderId': 1 }, { sparse: true }),
    col('bookings').createIndex({ deviceHash: 1 }),
    col('bookings').createIndex({ userId: 1 }),
    col('bookings').createIndex({ 'payment.utr': 1 }, { unique: true, partialFilterExpression: { 'payment.utr': { $type: 'string' } } }),
    col('proofs').createIndex({ bookingId: 1 }),
    col('bookings').createIndex({ status: 1, createdAt: -1 }),
    col('subscribers').createIndex({ email: 1 }, { unique: true }),
    col('events').createIndex({ at: 1 }, { expireAfterSeconds: 90 * 86400 }),
  ]);
  return db;
}

// One-time import of the old JSON files (data/users.json, data/bookings.json) if the database is empty
async function importJsonFiles(dataDir) {
  const report = [];
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch (e) { return null; } };

  const users = read('users.json');
  if (users && users.length && (await col('users').countDocuments()) === 0) {
    await col('users').insertMany(users.map((u) => ({
      legacyId: u.id, name: u.name, email: u.email, mobile: u.mobile || '',
      password: u.password, createdAt: new Date(u.createdAt || Date.now()),
    })));
    report.push(`${users.length} users`);
  }

  const bookings = read('bookings.json');
  if (bookings && bookings.length && (await col('bookings').countDocuments()) === 0) {
    await col('bookings').insertMany(bookings.map((b) => ({
      ...b, source: b.source || 'online', status: b.status || 'paid',
      createdAt: new Date(b.createdAt || Date.now()), paidAt: b.paidAt ? new Date(b.paidAt) : undefined,
    })));
    report.push(`${bookings.length} bookings`);
  }
  return report;
}

const toId = (id) => { try { return new ObjectId(String(id)); } catch (e) { return null; } };

module.exports = {
  connect, importJsonFiles, col, toId, ObjectId,
  supportsChangeStreams: () => changeStreams,
  close: () => client && client.close(),
};
