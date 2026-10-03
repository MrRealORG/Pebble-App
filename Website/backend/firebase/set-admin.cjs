// Run only from a trusted server or terminal with Application Default Credentials.
// Usage: node set-admin.cjs FIREBASE_USER_UID [--revoke]
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
async function main() {
  const uid = process.argv[2];
  if (!uid) throw new Error('Supply the Firebase UID of the intended administrator.');
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const revoke = process.argv.includes('--revoke');
  await auth.setCustomUserClaims(uid, { ...user.customClaims, role: 'authenticated', admin: !revoke });
  if (revoke) await auth.revokeRefreshTokens(uid);
  console.log(`Admin claim ${revoke ? 'removed from' : 'granted to'} ${uid}. Sign out and back in to refresh the token.`);
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });