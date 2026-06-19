import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDU6TemDCqg7swYofxwKNUxhsniN7j0I10",
  authDomain: "unlimited-run-b667d.firebaseapp.com",
  databaseURL: "https://unlimited-run-b667d.firebaseio.com",
  projectId: "unlimited-run-b667d",
  storageBucket: "unlimited-run-b667d.firebasestorage.app",
  messagingSenderId: "584843441874",
  appId: "1:584843441874:web:6abbc526a7fb55a5c79f0b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log("Firebase initialized successfully!");
console.log("Auth:", !!auth);
console.log("Db:", !!db);
process.exit(0);
