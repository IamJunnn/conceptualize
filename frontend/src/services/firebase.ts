// Firebase Configuration and Initialization
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  CACHE_SIZE_UNLIMITED
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA2OtESM8gTDehgXdt1OKfjsA40dDYCH6g",
  authDomain: "conceptualize-c9a41.firebaseapp.com",
  projectId: "conceptualize-c9a41",
  storageBucket: "conceptualize-c9a41.firebasestorage.app",
  messagingSenderId: "295348593042",
  appId: "1:295348593042:web:224dad14ab26817e40614b",
  measurementId: "G-7XRMBC15WG"
};

// Initialize Firebase
console.log('[firebase] Initializing Firebase app...');
const app = initializeApp(firebaseConfig);
console.log('[firebase] App initialized');

// Initialize Firebase services
export const auth = getAuth(app);

// Initialize Firestore with offline persistence
// This caches all Firestore data locally in IndexedDB
// Data loads instantly from cache, then syncs with server in background
// TEMPORARY: Use memory cache to bypass corrupted IndexedDB persistent cache
// TODO: Switch back to persistentLocalCache after clearing IndexedDB
console.log('[firebase] Initializing Firestore with memory cache (bypassing corrupted persistent cache)...');
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});
console.log('[firebase] Firestore initialized with memory cache');

export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1'); // Specify region for callable functions

// Use Functions Emulator if enabled (for local development)
if (import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5003);
  console.log('🔧 Using Functions Emulator at http://127.0.0.1:5003');
}

export const googleProvider = new GoogleAuthProvider();

// Configure Google provider
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export default app;
