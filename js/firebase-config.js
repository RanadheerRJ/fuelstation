// FuelOps Firebase Configuration
// Replace with your Firebase project config
// Get this from Firebase Console > Project Settings > General > Your apps

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Helper to detect demo mode
export const isDemoConfig = () => {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.apiKey.includes("YOUR_");
};

// Demo data flag
export const DEMO_MODE_ENABLED = true; // allow demo when firebase not configured
