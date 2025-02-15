import * as admin from "firebase-admin";

// Initialize Firebase Admin with service account
// You'll need to download your service account key from Firebase Console
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}"
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
