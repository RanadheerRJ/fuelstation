// FuelOps Firebase Configuration - REAL PRODUCTION - Connected to Firebase
// Project: fuelops-a93f6
// Connected on 2026-09-13

export const firebaseConfig = {
  apiKey: "AIzaSyB93oCsiWGvU85oyVw3b1sY-Nuqd0GUpO4",
  authDomain: "fuelops-a93f6.firebaseapp.com",
  projectId: "fuelops-a93f6",
  storageBucket: "fuelops-a93f6.firebasestorage.app",
  messagingSenderId: "404216002240",
  appId: "1:404216002240:web:d800cd8131ca59c9efdf25",
  measurementId: "G-X8132WCSBN"
};

export const isDemoConfig = () => {
  return !firebaseConfig.apiKey || 
         firebaseConfig.apiKey === "YOUR_API_KEY" || 
         firebaseConfig.apiKey.includes("YOUR_") ||
         firebaseConfig.projectId === "YOUR_PROJECT_ID";
};

export const DEMO_MODE_ENABLED = false;
