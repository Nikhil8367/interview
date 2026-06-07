import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDU6TemDCqg7swYofxwKNUxhsniN7j0I10",
  authDomain: "unlimited-run-b667d.firebaseapp.com",
  projectId: "unlimited-run-b667d",
  storageBucket: "unlimited-run-b667d.firebasestorage.app",
  messagingSenderId: "584843441874",
  appId: "1:584843441874:web:358f8412aaf8b54fc79f0b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

export { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, db };
