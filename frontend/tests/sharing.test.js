import { test } from "node:test";
import assert from "node:assert";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDU6TemDCqg7swYofxwKNUxhsniN7j0I10",
  authDomain: "unlimited-run-b667d.firebaseapp.com",
  databaseURL: "https://unlimited-run-b667d.firebaseio.com",
  projectId: "unlimited-run-b667d",
  storageBucket: "unlimited-run-b667d.firebasestorage.app",
  messagingSenderId: "584843441874",
  appId: "1:584843441874:web:6abbc526a7fb55a5c79f0b"
};

// Initialize distinct app instances for virtual users to simulate two independent client sessions
const appA = initializeApp(firebaseConfig, "UserA");
const authA = getAuth(appA);
const dbA = getFirestore(appA);

const appB = initializeApp(firebaseConfig, "UserB");
const authB = getAuth(appB);
const dbB = getFirestore(appB);

test("End-to-End Peer Question Sharing Integration Flow", async (t) => {
  const timestamp = Date.now();
  const usernameA = `test_alpha_${timestamp}`;
  const usernameB = `test_beta_${timestamp}`;
  const emailA = `${usernameA}@example.com`;
  const emailB = `${usernameB}@example.com`;
  const password = "password123";

  let uidA, uidB;
  let questionId = `test_q_${timestamp}`;
  let shareId;

  await t.test("1. Register two unique virtual users", async () => {
    // Register User Alpha
    const credA = await createUserWithEmailAndPassword(authA, emailA, password);
    uidA = credA.user.uid;
    await setDoc(doc(dbA, 'users', uidA), {
      id: uidA,
      username: usernameA,
      usernameNormalized: usernameA.toLowerCase(),
      email: emailA,
      createdAt: new Date().toISOString()
    });

    // Register User Beta
    const credB = await createUserWithEmailAndPassword(authB, emailB, password);
    uidB = credB.user.uid;
    await setDoc(doc(dbB, 'users', uidB), {
      id: uidB,
      username: usernameB,
      usernameNormalized: usernameB.toLowerCase(),
      email: emailB,
      createdAt: new Date().toISOString()
    });

    assert.ok(uidA, "User Alpha should have a valid UID");
    assert.ok(uidB, "User Beta should have a valid UID");
    console.log(`Successfully registered User Alpha (UID: ${uidA}) and User Beta (UID: ${uidB})`);
  });

  await t.test("2. Create a question owned by User Alpha", async () => {
    const qRef = doc(dbA, 'questions', questionId);
    await setDoc(qRef, {
      id: questionId,
      userId: uidA,
      text: "How does connection pooling work in database drivers?",
      category: "Backend Development",
      keywords: ["pool size", "active connections", "database reuse"],
      suggestedAnswer: "Connection pooling caches database connections so they can be reused."
    });

    // Verify it exists for User Alpha
    const snap = await getDoc(qRef);
    assert.strictEqual(snap.exists(), true);
    assert.strictEqual(snap.data().text, "How does connection pooling work in database drivers?");
    console.log("Successfully created question owned by User Alpha");
  });

  await t.test("3. Verify User Beta cannot read Alpha's question before sharing", async () => {
    const qRefB = doc(dbB, 'questions', questionId);
    try {
      await getDoc(qRefB);
      assert.fail("User Beta should not be allowed to read User Alpha's question before sharing");
    } catch (err) {
      assert.ok(err.message.includes("permission-denied") || err.code === "permission-denied", 
        `Expected permission-denied error, got: ${err.message}`);
      console.log("Correctly denied User Beta access to Alpha's question before sharing");
    }
  });

  await t.test("4. User Alpha searches for User Beta by normalized username", async () => {
    const usersRef = collection(dbA, 'users');
    const q = query(usersRef, where('usernameNormalized', '==', usernameB.toLowerCase()));
    const snapshot = await getDocs(q);

    assert.strictEqual(snapshot.empty, false, "Should find User Beta");
    const foundUser = snapshot.docs[0].data();
    assert.strictEqual(foundUser.username, usernameB);
    console.log(`User Alpha successfully searched and found User Beta (@${foundUser.username})`);
  });

  await t.test("5. Send sharing request from User Alpha to User Beta", async () => {
    shareId = `${uidB}_${questionId}`;
    const shareRef = doc(dbA, 'shares', shareId);
    await setDoc(shareRef, {
      id: shareId,
      questionId: questionId,
      questionText: "How does connection pooling work in database drivers?",
      senderId: uidA,
      senderUsername: usernameA,
      receiverId: uidB,
      receiverUsername: usernameB,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    const snap = await getDoc(shareRef);
    assert.strictEqual(snap.exists(), true);
    assert.strictEqual(snap.data().status, "pending");
    console.log("Successfully created pending share request in Firestore");
  });

  await t.test("6. Verify User Beta still cannot read Alpha's question while share is pending", async () => {
    const qRefB = doc(dbB, 'questions', questionId);
    try {
      await getDoc(qRefB);
      assert.fail("User Beta should not be allowed to read Alpha's question while share is pending");
    } catch (err) {
      assert.ok(err.message.includes("permission-denied") || err.code === "permission-denied",
        `Expected permission-denied error, got: ${err.message}`);
      console.log("Correctly denied User Beta access while share request is pending");
    }
  });

  await t.test("7. User Beta accepts the share request", async () => {
    const shareRefB = doc(dbB, 'shares', shareId);
    await updateDoc(shareRefB, { status: "accepted" });

    const snap = await getDoc(shareRefB);
    assert.strictEqual(snap.data().status, "accepted");
    console.log("User Beta accepted the share request");
  });

  await t.test("8. Verify User Beta can now read Alpha's question", async () => {
    const qRefB = doc(dbB, 'questions', questionId);
    const snap = await getDoc(qRefB);
    assert.strictEqual(snap.exists(), true);
    assert.strictEqual(snap.data().text, "How does connection pooling work in database drivers?");
    console.log("Correctly allowed User Beta to read Alpha's question after accepting share request");
  });

  await t.test("9. Verify User Beta cannot delete Alpha's question", async () => {
    const qRefB = doc(dbB, 'questions', questionId);
    try {
      await deleteDoc(qRefB);
      assert.fail("User Beta should not be allowed to delete User Alpha's question");
    } catch (err) {
      assert.ok(err.message.includes("permission-denied") || err.code === "permission-denied",
        `Expected permission-denied error, got: ${err.message}`);
      console.log("Correctly denied User Beta's attempt to delete Alpha's question");
    }
  });

  await t.test("10. Test collaborative edit of question metadata", async () => {
    const qRefB = doc(dbB, 'questions', questionId);
    await updateDoc(qRefB, {
      category: "System & Database",
      keywords: ["pool size", "active connections", "database reuse", "performance optimization"],
      suggestedAnswer: "Connection pooling caches database connections so they can be reused. (Collaboratively Updated)"
    });

    // Verify it updated in Firestore for both
    const snapA = await getDoc(doc(dbA, 'questions', questionId));
    assert.strictEqual(snapA.data().category, "System & Database");
    assert.strictEqual(snapA.data().suggestedAnswer, "Connection pooling caches database connections so they can be reused. (Collaboratively Updated)");
    console.log("Successfully updated question metadata collaboratively");
  });

  await t.test("11. Test fork-on-modify behavior", async () => {
    const forkQId = `test_fork_${timestamp}`;
    const modifiedText = "How does connection pooling work in database drivers? (Forked)";

    // Fork the question by creating a new document owned by User Beta
    await setDoc(doc(dbB, 'questions', forkQId), {
      id: forkQId,
      userId: uidB,
      text: modifiedText,
      category: "System & Database",
      keywords: ["pool size", "active connections", "database reuse", "performance optimization"],
      suggestedAnswer: "Connection pooling caches database connections so they can be reused. (Collaboratively Updated)"
    });

    // Delete the share link
    await deleteDoc(doc(dbB, 'shares', shareId));

    // Verify User Beta owns the new question
    const forkedSnap = await getDoc(doc(dbB, 'questions', forkQId));
    assert.strictEqual(forkedSnap.exists(), true);
    assert.strictEqual(forkedSnap.data().text, modifiedText);
    assert.strictEqual(forkedSnap.data().userId, uidB);

    // Verify User Beta no longer has access to the original shared question (since the share is deleted)
    try {
      await getDoc(doc(dbB, 'questions', questionId));
      assert.fail("User Beta should no longer be allowed to read Alpha's question after the share is deleted");
    } catch (err) {
      assert.ok(err.message.includes("permission-denied") || err.code === "permission-denied",
        `Expected permission-denied error, got: ${err.message}`);
    }

    // Verify User Alpha's original question text remains unmodified
    const originalSnap = await getDoc(doc(dbA, 'questions', questionId));
    assert.strictEqual(originalSnap.exists(), true);
    assert.strictEqual(originalSnap.data().text, "How does connection pooling work in database drivers?");
    console.log("Successfully verified fork-on-modify behavior and share revocation");

    // Clean up local question from this subtest
    await deleteDoc(doc(dbA, 'questions', questionId));
    await deleteDoc(doc(dbB, 'questions', forkQId));
  });

  await t.test("12. Test bulk sharing of multiple questions using writeBatch", async () => {
    const q1Id = `test_bulk1_${timestamp}`;
    const q2Id = `test_bulk2_${timestamp}`;

    // Create 2 questions for User Alpha
    await setDoc(doc(dbA, 'questions', q1Id), {
      id: q1Id,
      userId: uidA,
      text: "Bulk Question 1",
      category: "Frontend Development",
      keywords: ["test"],
      suggestedAnswer: "Answer 1"
    });

    await setDoc(doc(dbA, 'questions', q2Id), {
      id: q2Id,
      userId: uidA,
      text: "Bulk Question 2",
      category: "Frontend Development",
      keywords: ["test"],
      suggestedAnswer: "Answer 2"
    });

    // Send bulk share invites using writeBatch
    const batch = writeBatch(dbA);
    const share1Id = `${uidB}_${q1Id}`;
    const share2Id = `${uidB}_${q2Id}`;

    batch.set(doc(dbA, 'shares', share1Id), {
      id: share1Id,
      questionId: q1Id,
      questionText: "Bulk Question 1",
      senderId: uidA,
      senderUsername: usernameA,
      receiverId: uidB,
      receiverUsername: usernameB,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    batch.set(doc(dbA, 'shares', share2Id), {
      id: share2Id,
      questionId: q2Id,
      questionText: "Bulk Question 2",
      senderId: uidA,
      senderUsername: usernameA,
      receiverId: uidB,
      receiverUsername: usernameB,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    await batch.commit();

    // Verify both pending shares exist
    const snap1 = await getDoc(doc(dbA, 'shares', share1Id));
    const snap2 = await getDoc(doc(dbA, 'shares', share2Id));
    assert.strictEqual(snap1.exists(), true);
    assert.strictEqual(snap2.exists(), true);
    assert.strictEqual(snap1.data().status, "pending");
    assert.strictEqual(snap2.data().status, "pending");

    // Accept both shares from User Beta
    await updateDoc(doc(dbB, 'shares', share1Id), { status: 'accepted' });
    await updateDoc(doc(dbB, 'shares', share2Id), { status: 'accepted' });

    // Verify User Beta can now read both questions
    const q1Snap = await getDoc(doc(dbB, 'questions', q1Id));
    const q2Snap = await getDoc(doc(dbB, 'questions', q2Id));
    assert.strictEqual(q1Snap.exists(), true);
    assert.strictEqual(q2Snap.exists(), true);
    assert.strictEqual(q1Snap.data().text, "Bulk Question 1");
    assert.strictEqual(q2Snap.data().text, "Bulk Question 2");

    console.log("Successfully verified bulk sharing of multiple questions");

    // Clean up all test data
    await deleteDoc(doc(dbA, 'questions', q1Id));
    await deleteDoc(doc(dbA, 'questions', q2Id));
    await deleteDoc(doc(dbA, 'shares', share1Id));
    await deleteDoc(doc(dbA, 'shares', share2Id));
  });

  // Final global cleanup
  await t.test("13. Clean up virtual user accounts", async () => {
    await deleteDoc(doc(dbA, 'users', uidA));
    await deleteDoc(doc(dbB, 'users', uidB));
    await deleteUser(authA.currentUser);
    await deleteUser(authB.currentUser);
    console.log("Cleaned up virtual user accounts successfully");
  });
});
