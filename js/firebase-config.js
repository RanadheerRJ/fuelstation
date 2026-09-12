// FuelOps Firebase Configuration - PROD READY
// ==========================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (e.g., fuelops-prod)
// 3. Project Settings > General > Your apps > Web app > Copy config
// 4. Replace the placeholder below with your real config
// 5. Enable Auth and Firestore as per README/FIREBASE_SETUP.md
// ==========================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
  // Optional: measurementId: "G-XXXX"
};

// Helper to detect demo mode - prod ready: empty config = demo mode with clean DB
export const isDemoConfig = () => {
  return !firebaseConfig.apiKey || 
         firebaseConfig.apiKey === "YOUR_API_KEY" || 
         firebaseConfig.apiKey.includes("YOUR_") ||
         firebaseConfig.projectId === "YOUR_PROJECT_ID";
};

// Demo mode allowed only when Firebase not configured
// In production with real config, demo is disabled automatically
export const DEMO_MODE_ENABLED = true;

