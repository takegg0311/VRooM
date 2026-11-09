import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";
const emulatorHost =
    process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "localhost";

// 開発時のホットリロードで二重に初期化しないよう、既存のアプリがあれば再利用する
const isFirstInit = firebase.apps.length === 0;

const firebaseApp = isFirstInit
    ? firebase.initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
      })
    : firebase.app();

export const db = firebaseApp.firestore();

export const auth = firebase.auth();

// ローカル実行時は Firebase Emulator Suite（docker compose の firebase サービス）に接続する
if (useEmulator && isFirstInit) {
    auth.useEmulator(`http://${emulatorHost}:9099`, { disableWarnings: true });
    db.useEmulator(emulatorHost, 8081);
}
