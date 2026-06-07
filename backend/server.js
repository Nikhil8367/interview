import express from 'express';
import cors from 'cors';
import https from 'https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onRequest } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Seed Question Presets
const PRESETS = [
  {
    id: 'react-vdom',
    category: 'Frontend Development',
    text: 'Explain the difference between the Virtual DOM and the real DOM in React, and why it improves performance.',
    keywords: ['Virtual DOM', 'reconciliation', 'diffing', 'browser DOM', 'batching', 'paint'],
    suggestedAnswer: 'The real DOM represents the UI as a tree structure. Updating it directly is slow because it triggers layout recalculations and repaints. React’s Virtual DOM is a lightweight JavaScript representation of the real DOM. When state changes, React updates the Virtual DOM first, compares it with the previous snapshot using a diffing algorithm (Reconciliation), and batches updates to write only the differences to the real DOM, minimizing costly browser reflows.'
  },
  {
    id: 'db-deadlock',
    category: 'System & Database',
    text: 'What is a deadlock in Database management systems? Explain the conditions for it and how we can prevent it.',
    keywords: ['deadlock', 'circular wait', 'mutual exclusion', 'hold and wait', 'lock', 'rollback'],
    suggestedAnswer: 'A deadlock is a state where two or more transactions are blocked because each holds a lock that the other needs, creating a cycle. The four Coffman conditions for deadlocks are mutual exclusion, hold and wait, no preemption, and circular wait. Prevention strategies include ordering resource acquisition globally, using wait-die or wound-wait preemptive schemes, setting lock timeout limits, or executing deadlock detection algorithms and rolling back one transaction.'
  },
  {
    id: 'api-rest',
    category: 'Web Services',
    text: 'Describe the principles of REST architecture. Specifically, explain what statelessness means in this context.',
    keywords: ['REST', 'stateless', 'HTTP', 'client-server', 'resource', 'cacheable', 'payload'],
    suggestedAnswer: 'REST principles include client-server separation, a uniform interface (URIs, HTTP verbs), statelessness, cacheability, and layered systems. Statelessness means that the server stores no context about the client session. Every incoming HTTP request must contain all the information necessary to understand and process the request (e.g. auth tokens, query params, headers). This improves server scalability and routing flexibility.'
  },
  {
    id: 'https-sec',
    category: 'Computer Networks',
    text: 'How does HTTPS establish a secure connection between a browser and a server? Walk through the handshake process.',
    keywords: ['HTTPS', 'SSL', 'TLS', 'handshake', 'symmetric key', 'asymmetric', 'certificate authority', 'public key'],
    suggestedAnswer: 'HTTPS combines HTTP with SSL/TLS encryption. During the handshake: 1. The client sends a ClientHello with supported cipher suites. 2. The server responds with ServerHello and its digital certificate (containing its public key). 3. The client verifies the certificate with trusted root Certificate Authorities (CAs). 4. The client generates a random Pre-Master Secret, encrypts it with the server’s public key, and sends it to the server (asymmetric encryption). 5. Both derive the Master Secret to generate symmetric session keys for subsequent message encryption.'
  },
  {
    id: 'hr-conflict',
    category: 'Behavioral',
    text: 'Tell me about a time you disagreed with a technical design choice made by a teammate. How did you resolve it?',
    keywords: ['disagreement', 'compromise', 'collaboration', 'constructive feedback', 'empathy', 'alignment'],
    suggestedAnswer: 'A successful behavioral response uses the STAR method: 1. Situation: outline a disagreement over an architecture (e.g., GraphQL vs REST). 2. Task: describe the need to resolve it without harming team cohesion. 3. Action: set up an objective comparison matrix, schedule a collaborative review, seek compromises, and gather data. 4. Result: describe the selected option, project success, team alignment, and how relationship trust was preserved.'
  }
];

// 1. Auth Endpoints
app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'ID Token is required' });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    const usersRef = db.collection('users');
    const doc = await usersRef.doc(uid).get();
    let user = null;

    if (!doc.exists) {
      user = {
        id: uid,
        username: name || (email ? email.split('@')[0] : 'user_' + Math.random().toString(36).substr(2, 5)),
        email: email || '',
        picture: picture || ''
      };
      await usersRef.doc(uid).set(user);

      // Seed default questions scoped for this user
      const batch = db.batch();
      PRESETS.forEach(p => {
        const qId = `q_${p.id}_${uid}`;
        const qRef = db.collection('questions').doc(qId);
        batch.set(qRef, {
          ...p,
          id: qId,
          userId: uid
        });
      });
      await batch.commit();
    } else {
      user = doc.data();
    }

    res.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Error verifying Google ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid Google ID token' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('usernameNormalized', '==', normalizedUsername).get();
    if (!snapshot.empty) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const userId = 'u_' + Math.random().toString(36).substr(2, 9);
    const newUser = { id: userId, username: username.trim(), usernameNormalized: normalizedUsername, password };
    await usersRef.doc(userId).set(newUser);

    // Seed default questions scoped for this user
    const batch = db.batch();
    PRESETS.forEach(p => {
      const qId = `q_${p.id}_${userId}`;
      const qRef = db.collection('questions').doc(qId);
      batch.set(qRef, {
        ...p,
        id: qId,
        userId
      });
    });
    await batch.commit();

    res.status(201).json({ success: true, user: { id: userId, username: newUser.username } });
  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('usernameNormalized', '==', normalizedUsername)
      .where('password', '==', password)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userDoc = snapshot.docs[0].data();
    res.json({ success: true, user: { id: userDoc.id, username: userDoc.username } });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Questions CRUD (scoped to active user)
app.get('/api/questions', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  try {
    const snapshot = await db.collection('questions').where('userId', '==', userId).get();
    const userQuestions = [];
    snapshot.forEach(doc => {
      userQuestions.push(doc.data());
    });
    res.json(userQuestions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/questions', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  const { text, category, keywords, suggestedAnswer } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Question text is required' });
  }

  try {
    const normalizedText = text.trim().toLowerCase();
    const questionsRef = db.collection('questions');

    const snapshot = await questionsRef
      .where('userId', '==', userId)
      .where('textNormalized', '==', normalizedText)
      .get();

    if (!snapshot.empty) {
      console.log(`Deduplication triggered: Question already exists for user ${userId}.`);
      return res.status(200).json(snapshot.docs[0].data());
    }

    const qId = 'q_' + Math.random().toString(36).substr(2, 9);
    const newQuestion = {
      id: qId,
      userId,
      text,
      textNormalized: normalizedText,
      category: category || 'General',
      keywords: Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : []),
      suggestedAnswer: suggestedAnswer || ''
    };

    await questionsRef.doc(qId).set(newQuestion);
    res.status(201).json(newQuestion);
  } catch (error) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  try {
    const docRef = db.collection('questions').doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().userId !== userId) {
      return res.status(404).json({ error: 'Question not found or unauthorized' });
    }

    await docRef.delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Reports Scoped Operations
app.get('/api/reports', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  try {
    const snapshot = await db.collection('reports').where('userId', '==', userId).get();
    const userReports = [];
    snapshot.forEach(doc => {
      userReports.push(doc.data());
    });
    res.json(userReports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reports', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  const { report } = req.body;
  if (!report) {
    return res.status(400).json({ error: 'Report data is required' });
  }

  try {
    const reportsRef = db.collection('reports');

    if (report.id) {
      const doc = await reportsRef.doc(report.id).get();
      if (doc.exists) {
        console.log(`Deduplication triggered: Report ${report.id} already exists.`);
        return res.status(200).json(doc.data());
      }
    }

    const reportId = report.id || 'rep_' + Math.random().toString(36).substr(2, 9);
    console.log(`Saving report backup for user ${userId}, report ${reportId}`);

    const newReport = {
      ...report,
      id: reportId,
      userId,
      timestamp: report.timestamp || new Date().toISOString()
    };

    await reportsRef.doc(reportId).set(newReport);
    res.status(201).json(newReport);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: missing User-ID header' });
  }

  try {
    const docRef = db.collection('reports').doc(id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().userId !== userId) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await docRef.delete();
    res.status(200).json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AssemblyAI Real-time Token endpoint
app.post('/api/assemblyai/token', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'AssemblyAI API Key is required' });
  }

  try {
    const url = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=600';
    const options = {
      headers: {
        'Authorization': apiKey
      }
    };
    
    https.get(url, options, (apiRes) => {
      let data = '';
      apiRes.on('data', (chunk) => {
        data += chunk;
      });
      apiRes.on('end', () => {
        if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
          try {
            res.json(JSON.parse(data));
          } catch (e) {
            res.status(500).json({ error: 'Failed to parse AssemblyAI token response: ' + e.message });
          }
        } else {
          res.status(apiRes.statusCode).json({ error: `AssemblyAI API error (${apiRes.statusCode}): ${data}` });
        }
      });
    }).on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server locally if running standard node environment or emulator is NOT present (production environment relies on functions handler)
if (!process.env.FUNCTIONS_EMULATOR && process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
}

// Export the cloud function
export const api = onRequest({ cors: true, memory: '256MiB' }, app);
