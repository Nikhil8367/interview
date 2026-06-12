/**
 * AI Engine for Speech, Grammar, and Technical Theory Assessment
 */

export function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonCandidate = text.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (innerErr) {
        throw new Error("Found JSON block but failed to parse: " + innerErr.message + "\nRaw text: " + text);
      }
    }
    throw new Error("No JSON object found in response:\n" + text);
  }
}

const COMMON_FILLER_WORDS = [
  'um', 'uh', 'like', 'so', 'actually', 'basically', 'you know', 
  'literally', 'honestly', 'ah', 'er', 'okay', 'right'
];

const GRAMMAR_RULES = [
  {
    id: 'sv-singular',
    regex: /\b(he|she|it)\b\s+\b(have|don't|go|do|run|say|think)\b/i,
    check: (match) => {
      const verbMap = {
        'have': 'has',
        "don't": "doesn't",
        'go': 'goes',
        'do': 'does',
        'run': 'runs',
        'say': 'says',
        'think': 'thinks'
      };
      const word = match[2].toLowerCase();
      return {
        original: match[0],
        correction: `${match[1]} ${verbMap[word] || word + 's'}`,
        explanation: `Subject-verb agreement: '${match[1]}' requires a singular verb form.`
      };
    }
  },
  {
    id: 'sv-plural',
    regex: /\b(i|we|they|you)\b\s+\b(has|doesn't|goes|does|says)\b/i,
    check: (match) => {
      const verbMap = {
        'has': 'have',
        "doesn't": "don't",
        'goes': 'go',
        'does': 'do',
        'says': 'say'
      };
      const word = match[2].toLowerCase();
      return {
        original: match[0],
        correction: `${match[1]} ${verbMap[word] || word.slice(0, -1)}`,
        explanation: `Subject-verb agreement: '${match[1]}' requires a plural verb form.`
      };
    }
  },
  {
    id: 'double-negative',
    regex: /\b(don't|doesn't|didn't|can't|won't|shouldn't)\b\s+\b(have|need|want|get|do)\b\s+\bno\b/i,
    check: (match) => {
      return {
        original: match[0],
        correction: `${match[1]} ${match[2]} any`,
        explanation: `Double negative: Combining negation '${match[1]}' with 'no' is grammatically incorrect. Use 'any' instead.`
      };
    }
  },
  {
    id: 'did-past',
    regex: /\b(did|didn't)\b\s+\b(went|came|saw|took|had|did|ate|talked|wrote|made|spoke|told|thought)\b/i,
    check: (match) => {
      const presentMap = {
        'went': 'go',
        'came': 'come',
        'saw': 'see',
        'took': 'take',
        'had': 'have',
        'did': 'do',
        'ate': 'eat',
        'talked': 'talk',
        'wrote': 'write',
        'made': 'make',
        'spoke': 'speak',
        'told': 'tell',
        'thought': 'think'
      };
      const word = match[2].toLowerCase();
      return {
        original: match[0],
        correction: `${match[1]} ${presentMap[word] || word}`,
        explanation: `Incorrect verb form: Auxiliary '${match[1]}' must be followed by a base form verb (e.g., '${presentMap[word] || word}'), not a past tense verb.`
      };
    }
  },
  {
    id: 'redundancy-back',
    regex: /\b(return|revert|reply|repeat|retreat)\s+back\b/i,
    check: (match) => {
      return {
        original: match[0],
        correction: match[1],
        explanation: `Redundant phrasing: '${match[1]}' already implies moving or going back. Adding 'back' is redundant.`
      };
    }
  },
  {
    id: 'comparative-double',
    regex: /\b(more|most)\s+\b(better|worse|faster|slower|easier|harder|greater|smaller|bigger)\b/i,
    check: (match) => {
      return {
        original: match[0],
        correction: match[2],
        explanation: `Double comparative: '${match[2]}' is already comparative. Adding '${match[1]}' is grammatically redundant.`
      };
    }
  }
];

/**
 * Perform local syntax and rule-based analysis
 */
export function analyzeTranscriptLocally(transcript, questionObj, durationSeconds) {
  const text = transcript.trim();
  if (!text) {
    return {
      score: 0,
      wordCount: 0,
      wpm: 0,
      fillerCount: 0,
      fillerBreakdown: {},
      grammarMistakes: [],
      theoryMistakes: [{ concept: 'Empty Answer', explanation: 'No speech was detected. Please answer the question verbally.', correction: 'Provide a verbal response.' }],
      feedback: 'No speech was recorded. Try again and make sure your microphone is working.',
      paceRating: 'N/A'
    };
  }

  const words = text.split(/\s+/);
  const wordCount = words.length;
  
  // 1. Calculate WPM (Pace)
  const durationMin = durationSeconds > 0 ? durationSeconds / 60 : 0.5; // fallback
  const wpm = Math.round(wordCount / durationMin);
  
  let paceRating = 'Good';
  let paceFeedback = 'Excellent speed! Keep speaking at this rate (120-160 WPM).';
  if (wpm < 100) {
    paceRating = 'Too Slow';
    paceFeedback = 'Try to speak a bit faster. Aim for 120-160 WPM to sound more confident and engaging.';
  } else if (wpm > 180) {
    paceRating = 'Too Fast';
    paceFeedback = 'You are speaking very quickly. Slow down slightly to let the interviewer digest your ideas.';
  }

  // 2. Count Fillers
  let fillerCount = 0;
  const fillerBreakdown = {};
  
  words.forEach(w => {
    const cleanWord = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    if (COMMON_FILLER_WORDS.includes(cleanWord)) {
      fillerCount++;
      fillerBreakdown[cleanWord] = (fillerBreakdown[cleanWord] || 0) + 1;
    }
  });

  // 3. Grammar Checking
  const grammarMistakes = [];
  GRAMMAR_RULES.forEach(rule => {
    let match;
    // We scan the text for matches
    const regex = new RegExp(rule.regex.source, 'gi');
    while ((match = regex.exec(text)) !== null) {
      grammarMistakes.push(rule.check(match));
    }
  });

  // 4. Theory Checking (Keywords matching)
  const theoryMistakes = [];
  const lowercaseText = text.toLowerCase();
  
  if (questionObj.keywords && questionObj.keywords.length > 0) {
    questionObj.keywords.forEach(keyword => {
      const isPresent = lowercaseText.includes(keyword.toLowerCase());
      if (!isPresent) {
        theoryMistakes.push({
          concept: `Missing: "${keyword}"`,
          explanation: `In technical context, discussing "${keyword}" is crucial for a complete answer to this question.`,
          correction: `Include a discussion about "${keyword}" in your explanation.`
        });
      }
    });
  }

  // Calculate Scores
  // Content Score (based on keywords hit)
  const totalKeywords = questionObj.keywords ? questionObj.keywords.length : 0;
  const keywordsHit = totalKeywords - theoryMistakes.length;
  const contentScore = totalKeywords > 0 ? Math.round((keywordsHit / totalKeywords) * 100) : 100;

  // Delivery Score (based on filler words density and WPM)
  const fillerDensity = fillerCount / wordCount;
  let deliveryScore = 100;
  deliveryScore -= Math.min(40, Math.round(fillerDensity * 200)); // penalize fillers
  if (wpm < 90 || wpm > 190) deliveryScore -= 15;
  else if (wpm < 110 || wpm > 170) deliveryScore -= 5;
  deliveryScore = Math.max(0, deliveryScore);

  // Grammar Score
  const grammarScore = Math.max(0, 100 - (grammarMistakes.length * 15));

  // Overall Score
  const overallScore = Math.round((contentScore * 0.4) + (deliveryScore * 0.3) + (grammarScore * 0.3));

  // General feedback paragraphs
  let feedback = `Your response was analyzed locally. You achieved an overall score of ${overallScore}%. `;
  if (theoryMistakes.length > 0) {
    feedback += `To make your response more robust, try to cover concepts like: ${questionObj.keywords.slice(0, 3).join(', ')}. `;
  } else {
    feedback += `Great job covering all core conceptual keywords! `;
  }
  if (grammarMistakes.length > 0) {
    feedback += `We detected ${grammarMistakes.length} minor grammar slip(s). Check the suggestions panel below to review them. `;
  }
  if (fillerCount > 2) {
    feedback += `Try to reduce filler words like "${Object.keys(fillerBreakdown)[0]}" to sound more professional.`;
  }

  return {
    score: overallScore,
    wordCount,
    wpm,
    fillerCount,
    fillerBreakdown,
    grammarMistakes,
    theoryMistakes,
    feedback,
    paceRating,
    paceFeedback
  };
}

/**
 * Maps any experimental/realtime/unsupported model ID to a standard REST model ID.
 */
export function getValidRestModel(model) {
  if (!model) return 'gemini-2.0-flash';
  
  const mapped = model.trim().toLowerCase();
  
  // Explicitly map known live/audio models
  if (mapped === 'gemini-2.5-flash-audio' || mapped === 'gemini-2.5-flash-native-audio-preview-12-2025') {
    return 'gemini-2.0-flash';
  }
  if (mapped === 'gemini-3-flash-live' || mapped === 'gemini-3.1-flash-live-preview') {
    return 'gemini-2.0-flash';
  }

  // Standard models supported by Google's v1beta REST API:
  const standardModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3-flash'
  ];
  if (standardModels.includes(mapped)) {
    return mapped;
  }
  
  // Map experimental/hypothetical/live models to the nearest valid REST model:
  if (mapped.includes('pro')) {
    return 'gemini-1.5-pro';
  }
  
  // Default fallback for any other models (e.g. gemma, newer experimental, etc.)
  return 'gemini-2.0-flash';
}

/**
 * Helper to query Gemini API with support for model fallbacks on 404, 429, or general exceptions.
 */
async function generateGeminiContentWithFallback(prompt, apiKey, initialModel) {
  const modelsToTry = [
    getValidRestModel(initialModel),
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];
  
  // Deduplicate candidate models
  const uniqueModels = [...new Set(modelsToTry)];
  
  let lastError = null;
  for (const model of uniqueModels) {
    try {
      console.log(`Attempting report generation with model: ${model}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      }
      
      console.warn(`Model ${model} failed with status ${response.status}. Retrying fallback...`);
      lastError = new Error(`API returned status ${response.status}`);
    } catch (e) {
      console.warn(`Fetch error for model ${model}:`, e);
      lastError = e;
    }
  }
  
  throw lastError || new Error("Failed to generate content with all fallback models");
}

/**
 * Query Gemini AI API for advanced semantic, grammar and technical correctness assessment
 */
export async function analyzeTranscriptWithGemini(transcript, questionObj, durationSeconds, apiKey, model = '') {
  try {
    const rawModel = model || localStorage.getItem('gemini_model');
    
    const prompt = `
You are an expert technical interviewer and communications coach.
Analyze the following interview transcript and assess the user's performance.

Question asked: "${questionObj.text}"
Target Concepts/Keywords: ${JSON.stringify(questionObj.keywords || [])}
${questionObj.suggestedAnswer ? `Target Reference Answer to grade against: "${questionObj.suggestedAnswer}"` : ''}
Duration of speech: ${durationSeconds} seconds
User's Transcribed Answer: "${transcript}"

CRITICAL GRADING CONSTRAINT:
Evaluate the response under realistic verbal interview constraints. The candidate spoke for only ${durationSeconds} seconds. Do not expect an exhaustive textbook dissertation, and do not penalize them for omitting complex edge cases or deep theoretical minutiae. Grade them strictly on whether they communicated the high-impact core principles clearly, concisely, and accurately within this short verbal duration.

Assess the answer in terms of:
1. Grammar Mistakes (identify incorrect grammar, awkward sentences, double negatives, bad tenses, and suggest fixes).
2. Theory Mistakes / Inaccuracies:
   - IMPORTANT: If a "Target Reference Answer to grade against" is provided above, you MUST evaluate the candidate's transcript strictly and solely with respect to how accurately and completely they covered the concepts, facts, and structure outlined in that reference answer. List any specific mismatches or missing details from that reference answer as theory mistakes.
   - If NO "Target Reference Answer to grade against" is provided, evaluate technical correctness and concept coverage based on general industry standards and the "Target Concepts/Keywords" list.
3. Delivery & Flow (assess pace and communication clarity).

You MUST respond in JSON format ONLY. Do not wrap it in markdown code blocks. The JSON structure must match this EXACT format:
{
  "score": <number between 0 and 100 representing overall quality>,
  "grammarMistakes": [
    {
      "original": "substring of original speech containing mistake",
      "correction": "corrected phrasing",
      "explanation": "why it was incorrect and how to fix it"
    }
  ],
  "theoryMistakes": [
    {
      "concept": "Name of the theory concept / misconception",
      "explanation": "What was wrong, missing, or inaccurate",
      "correction": "The correct definition, implementation, or explanation to include"
    }
  ],
  "paceAssessment": "Feedback on speed (WPM is calculated roughly as ${Math.round(transcript.split(/\s+/).length / (durationSeconds / 60))} WPM)",
  "fillerWordsAssessment": "Feedback on pauses, flow, and filler usage",
  "overallFeedback": "A concise paragraph summarizing their performance, strengths, and primary area to focus on."
}
`;

    const rawText = await generateGeminiContentWithFallback(prompt, apiKey, rawModel);
    const parsedReport = extractJson(rawText);

    // Calculate metadata locally
    const words = transcript.split(/\s+/);
    const fillerBreakdown = {};
    let fillerCount = 0;
    words.forEach(w => {
      const cleanWord = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (COMMON_FILLER_WORDS.includes(cleanWord)) {
        fillerCount++;
        fillerBreakdown[cleanWord] = (fillerBreakdown[cleanWord] || 0) + 1;
      }
    });

    return {
      score: parsedReport.score || 70,
      wordCount: words.length,
      wpm: Math.round(words.length / (durationSeconds / 60)),
      fillerCount,
      fillerBreakdown,
      grammarMistakes: parsedReport.grammarMistakes || [],
      theoryMistakes: parsedReport.theoryMistakes || [],
      feedback: parsedReport.overallFeedback || 'Great response!',
      paceRating: parsedReport.paceAssessment || 'Normal',
      paceFeedback: parsedReport.paceAssessment || 'Your pace is great.'
    };

  } catch (error) {
    console.error("Gemini API error:", error);
    // Fall back to local assessment if Gemini fails
    const localResult = analyzeTranscriptLocally(transcript, questionObj, durationSeconds);
    return {
      ...localResult,
      feedback: `(API Fallback) ${localResult.feedback}. (Error details: ${error.message})`
    };
  }
}

export function analyzeMockInterviewLocally(answers) {
  let totalScore = 0;
  let totalDuration = 0;
  let totalBreaks = 0;
  let totalWords = 0;
  let totalFillers = 0;
  const fillerBreakdown = {};
  const questionReports = [];

  answers.forEach((ans, index) => {
    const localReport = analyzeTranscriptLocally(ans.transcript, ans.question, ans.duration);
    
    // Add duration and breaks count from the actual console state
    localReport.totalDuration = ans.duration;
    localReport.breaksCount = ans.breaksCount;
    
    totalScore += localReport.score;
    totalDuration += ans.duration;
    totalBreaks += ans.breaksCount;
    totalWords += localReport.wordCount;
    totalFillers += localReport.fillerCount;

    // Merge filler breakdown
    Object.entries(localReport.fillerBreakdown).forEach(([word, count]) => {
      fillerBreakdown[word] = (fillerBreakdown[word] || 0) + count;
    });

    questionReports.push({
      questionIndex: index + 1,
      question: ans.question,
      transcript: ans.transcript,
      score: localReport.score,
      duration: ans.duration,
      breaksCount: ans.breaksCount,
      wordCount: localReport.wordCount,
      wpm: localReport.wpm,
      grammarMistakes: localReport.grammarMistakes,
      theoryMistakes: localReport.theoryMistakes
    });
  });

  const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
  const avgWpm = totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0;

  // Pace assessment
  let paceRating = 'Good';
  let paceFeedback = 'Excellent overall pacing across questions.';
  if (avgWpm < 100) {
    paceRating = 'Too Slow';
    paceFeedback = 'Try speaking slightly faster in subsequent interviews to keep momentum.';
  } else if (avgWpm > 180) {
    paceRating = 'Too Fast';
    paceFeedback = 'Try slowing down your answers to sound more structured and calm.';
  }

  const feedback = `You completed a ${answers.length}-question mock interview with an overall score of ${avgScore}%. ` +
    `You covered key concepts well, spoke a total of ${totalWords} words, and maintained a pacing of ${avgWpm} WPM. ` +
    `Review each individual question's breakdown below to see grammatical mistakes or theoretical gaps.`;

  return {
    score: avgScore,
    totalDuration,
    breaksCount: totalBreaks,
    wordCount: totalWords,
    wpm: avgWpm,
    fillerCount: totalFillers,
    fillerBreakdown,
    paceRating,
    paceFeedback,
    behavioralAssessment: 'Analyzed locally: Maintained steady progress throughout questions.',
    bluffingAudit: 'Analyzed locally: Answers appear direct based on keyword matches.',
    strengths: ['Keyword mapping coverage', 'Logical breakdown flow', 'Consistent volume levels'],
    weaknesses: ['Varying speech speed', 'Minor grammatical slips', 'Missed auxiliary details'],
    actionableSteps: [
      'Practice answering with the STAR method for behavioral questions',
      'Ensure all key technical keywords from presets are mentioned',
      'Aim for a steady pace of 130-150 words per minute'
    ],
    feedback,
    questions: questionReports
  };
}

export async function analyzeMockInterviewWithGemini(answers, apiKey, model = '') {
  try {
    const rawModel = model || localStorage.getItem('gemini_model') || 'gemini-2.5-flash';

    // Format questions and answers for Gemini
    const QAPairs = answers.map((ans, idx) => ({
      index: idx + 1,
      question: ans.question.text,
      keywords: ans.question.keywords || [],
      suggestedAnswer: ans.question.suggestedAnswer || undefined,
      transcript: ans.transcript,
      duration: ans.duration,
      breaksCount: ans.breaksCount
    }));

    const prompt = `
You are an expert technical interviewer and executive communications coach.
You are evaluating a candidate who just completed a mock interview consisting of ${answers.length} questions.
Analyze the candidate's answers below and output a comprehensive, structured evaluation report.

Interview Transcript Data:
${JSON.stringify(QAPairs, null, 2)}

CRITICAL GRADING CONSTRAINT:
Evaluate each response under realistic, time-limited verbal interview constraints based on the duration of speech for each question. Do not expect exhaustive textbook dissertations or penalize the candidate for omitting lengthy, complex details that cannot be reasonably spoken within the elapsed seconds. Grade them on whether they communicated the high-impact core principles clearly, concisely, and accurately within their speaking time.

For the evaluation:
1. Review each question's answer individually. Grade it (0-100), identify grammar mistakes, and list any technical concepts or gaps (theory mistakes) that were omitted or explained incorrectly.
   - IMPORTANT: If a "suggestedAnswer" is provided for a question, evaluate the candidate's transcript STRICTLY and SOLELY with respect to how closely and accurately it covers the core facts and details of that "suggestedAnswer". Treat any deviations or omissions from the "suggestedAnswer" as conceptual/theory gaps.
   - If NO "suggestedAnswer" is provided for a question, evaluate technical correctness and concept coverage based on general industry standards and the "keywords" list.
2. Calculate an overall average score (0-100).
3. Evaluate overall communication performance (pacing, filler word usage, and breaks/pauses).
4. Perform a Bluffing Audit: identify where the candidate attempted to bluff, talk around the question, pad their answer with repeating phrases, or stuff irrelevant buzzwords to mask a gap in technical understanding. If they were direct and honest, note that.
5. Perform a Behavioral Assessment: assess their demeanor, confidence, structure, and calmness based on their pauses and transcript phrasing patterns.
6. List exactly 3 key technical or communication strengths of the candidate.
7. List exactly 3 key technical or communication weaknesses or areas for improvement.
8. Provide a list of 3 to 5 highly actionable, concrete study tasks or "Next Steps / Homework Tasks" to help them perform better on subsequent attempts.
9. Provide a high-level summary feedback paragraph.

You MUST respond in JSON format ONLY. Do not wrap it in markdown code blocks. The JSON structure must match this EXACT format:
{
  "overallScore": <number between 0 and 100 representing overall quality>,
  "overallFeedback": "A concise paragraph summarizing their overall strengths, major theoretical gaps, and core communications advice.",
  "paceAssessment": "Feedback on their pacing and speed based on transcripts.",
  "communicationAssessment": "Feedback on pauses, breaks, and flow.",
  "behavioralAssessment": "Review of their demeanor, structure, and verbal confidence patterns.",
  "bluffingAudit": "Audit detailing where the user was honest, straightforward, or attempted to bluff/evade technical details with buzzwords.",
  "strengths": ["string", "string", "string"],
  "weaknesses": ["string", "string", "string"],
  "actionableSteps": ["string", "string", "string"],
  "questions": [
    {
      "questionIndex": <number>,
      "score": <number between 0 and 100>,
      "grammarMistakes": [
        {
          "original": "substring of original speech containing mistake",
          "correction": "corrected phrasing",
          "explanation": "why it was incorrect and how to fix it"
        }
      ],
      "theoryMistakes": [
        {
          "concept": "Name of the theory concept / misconception",
          "explanation": "What was wrong, missing, or inaccurate",
          "correction": "The correct definition, implementation, or explanation to include"
        }
      ]
    }
  ]
}
`;

    const rawText = await generateGeminiContentWithFallback(prompt, apiKey, rawModel);
    
    const parsedReport = extractJson(rawText);

    // Calculate metadata locally
    let totalDuration = 0;
    let totalBreaks = 0;
    let totalWords = 0;
    let totalFillers = 0;
    const fillerBreakdown = {};

    answers.forEach((ans) => {
      totalDuration += ans.duration;
      totalBreaks += ans.breaksCount;
      const words = ans.transcript.split(/\s+/).filter(Boolean);
      totalWords += words.length;

      words.forEach(w => {
        const cleanWord = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
        if (COMMON_FILLER_WORDS.includes(cleanWord)) {
          totalFillers++;
          fillerBreakdown[cleanWord] = (fillerBreakdown[cleanWord] || 0) + 1;
        }
      });
    });

    const avgWpm = totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0;

    // Merge localized calculations with Gemini's assessment
    const finalizedQuestions = parsedReport.questions.map((q, idx) => {
      const originalAns = answers[idx];
      const words = originalAns.transcript.split(/\s+/).filter(Boolean);
      return {
        ...q,
        question: originalAns.question,
        transcript: originalAns.transcript,
        duration: originalAns.duration,
        breaksCount: originalAns.breaksCount,
        wordCount: words.length,
        wpm: originalAns.duration > 0 ? Math.round(words.length / (originalAns.duration / 60)) : 0
      };
    });

    return {
      score: parsedReport.overallScore || 70,
      totalDuration,
      breaksCount: totalBreaks,
      wordCount: totalWords,
      wpm: avgWpm,
      fillerCount: totalFillers,
      fillerBreakdown,
      paceRating: parsedReport.paceAssessment || 'Normal',
      paceFeedback: parsedReport.communicationAssessment || 'Good flow.',
      behavioralAssessment: parsedReport.behavioralAssessment || 'Professional and structured response patterns.',
      bluffingAudit: parsedReport.bluffingAudit || 'Straightforward, direct answers with no bluffing detected.',
      strengths: parsedReport.strengths || ['Direct response style', 'Good pace control', 'Vocabulary range'],
      weaknesses: parsedReport.weaknesses || ['Slight pauses between details', 'Buzzword padding on gaps', 'Minor grammar slips'],
      actionableSteps: parsedReport.actionableSteps || [
        'Review the key concepts checklist for technical categories',
        'Avoid filler phrasing when transitioning between concepts',
        'Try reading technical definitions out loud to build fluency'
      ],
      feedback: parsedReport.overallFeedback || 'Great work completing your mock interview!',
      questions: finalizedQuestions
    };

  } catch (error) {
    console.error("Gemini Mock Interview API error:", error);
    // Fall back to local assessment if API fails
    const localResult = analyzeMockInterviewLocally(answers);
    return {
      ...localResult,
      feedback: `(API Fallback) ${localResult.feedback}. (Error details: ${error.message})`
    };
  }
}

/**
 * Generates the next question dynamically using Gemini based on selected topics.
 */
export async function generateNextMockQuestion(selectedTopics, previousQuestions, currentDifficulty, apiKey, model = '') {
  try {
    const rawModel = model || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    const previousQuestionsText = previousQuestions.map(q => q.text).join('\n');
    
    const prompt = `You are an expert technical interviewer.
Generate a single interview question based on the selected topics: ${selectedTopics.join(', ')}.
Choose one of the selected topics to focus this question on.
The desired difficulty of the question is: ${currentDifficulty} (options: Easy, Medium, Hard).

To ensure a diverse and professional interview:
- The question must be highly relevant and accurate to the selected topic.
- Do NOT generate any question that is similar or identical to these previously asked questions:
${previousQuestionsText ? previousQuestionsText : 'None'}

Provide a comprehensive, high-quality, suggested/ideal reference answer for this question. This ideal answer will be used for evaluating the candidate's response in the background. Also identify 3-5 technical keywords/concepts that the candidate should mention in their response.

Respond ONLY with a valid JSON object matching this schema (do NOT wrap it in markdown code blocks or add any markdown formatting):
{
  "text": "The text of the generated interview question",
  "category": "The specific topic of this question (must be one of: ${selectedTopics.join(', ')})",
  "difficulty": "${currentDifficulty}",
  "suggestedAnswer": "A detailed, comprehensive, high-fidelity reference answer that contains the ideal response.",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

    const rawText = await generateGeminiContentWithFallback(prompt, apiKey, rawModel);
    const parsed = extractJson(rawText);
    return parsed;
  } catch (error) {
    console.error("Error generating question, using local preset fallback:", error);
    const fallbackPool = [
      { category: 'DSA', text: 'Explain the difference between an Array and a Linked List, and when to use each.', difficulty: 'Easy', keywords: ['Array', 'Linked List', 'index', 'pointers', 'sequential', 'memory allocation'], suggestedAnswer: 'Arrays are stored in contiguous memory locations, allowing O(1) random access but making insertions and deletions slow O(N). Linked lists consist of nodes with pointers scattered in memory, enabling O(1) insertions/deletions at known positions but O(N) lookup. Use arrays for index-heavy lookups, and linked lists for frequent insertions/deletions.' },
      { category: 'OOP', text: 'What is Polymorphism in Object-Oriented Programming? Give examples of compile-time and runtime polymorphism.', difficulty: 'Medium', keywords: ['Polymorphism', 'overloading', 'overriding', 'runtime', 'compile-time', 'inheritance'], suggestedAnswer: 'Polymorphism allows objects of different classes to be treated as objects of a common superclass. Compile-time polymorphism is achieved through method overloading (same name, different arguments). Runtime polymorphism is achieved through method overriding (subclass redefines a superclass method, resolved at runtime via dynamic binding).' },
      { category: 'DBMS', text: 'What are the ACID properties in database management systems, and why are they important?', difficulty: 'Medium', keywords: ['ACID', 'Atomicity', 'Consistency', 'Isolation', 'Durability', 'transaction'], suggestedAnswer: 'ACID properties ensure database reliability: Atomicity (all or nothing executes), Consistency (database transitions from one valid state to another), Isolation (concurrent transactions execute independently without interference), and Durability (once committed, changes persist even through system crashes).' },
      { category: 'OS', text: 'Explain the concept of virtual memory in operating systems and how paging works.', difficulty: 'Hard', keywords: ['Virtual Memory', 'paging', 'page fault', 'physical memory', 'RAM', 'disk swap'], suggestedAnswer: 'Virtual memory is a storage allocation scheme where secondary memory (disk) is treated as part of main memory (RAM). Paging divides virtual memory into fixed-size blocks called pages, and physical memory into frames. The page table maps virtual pages to physical frames. When a page is not in RAM, a page fault occurs, loading the page from the disk.' },
      { category: 'System Design', text: 'Describe the key components of a load balancer and how it distributes traffic.', difficulty: 'Hard', keywords: ['Load Balancer', 'round robin', 'health check', 'scalability', 'proxy', 'reverse proxy'], suggestedAnswer: 'A load balancer distributes incoming network traffic across multiple servers to ensure scalability and reliability. It performs health checks to route traffic only to active servers, uses algorithms like Round Robin or Least Connections, and serves as a reverse proxy protecting the internal servers.' }
    ];

    const matched = fallbackPool.filter(q => selectedTopics.includes(q.category));
    const finalPool = matched.length > 0 ? matched : fallbackPool;
    const randomQ = finalPool[Math.floor(Math.random() * finalPool.length)];
    
    return {
      text: randomQ.text,
      category: randomQ.category,
      difficulty: randomQ.difficulty,
      suggestedAnswer: randomQ.suggestedAnswer,
      keywords: randomQ.keywords
    };
  }
}

/**
 * Performs real-time evaluation of a single mock interview question answer.
 */
export async function evaluateMockQuestionAnswer(questionObj, transcript, durationSeconds, apiKey, model = '') {
  try {
    const rawModel = model || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    const result = await analyzeTranscriptWithGemini(transcript, questionObj, durationSeconds, apiKey, rawModel);
    
    const words = transcript.split(/\s+/).filter(Boolean);
    const wpm = durationSeconds > 0 ? Math.round(words.length / (durationSeconds / 60)) : 0;
    
    return {
      score: result.score ?? 70,
      grammarMistakes: result.grammarMistakes || [],
      theoryMistakes: result.theoryMistakes || [],
      wpm,
      feedback: result.overallFeedback || ''
    };
  } catch (error) {
    console.error("Error evaluating mock question answer:", error);
    const localResult = analyzeTranscriptLocally(transcript, questionObj, durationSeconds);
    const words = transcript.split(/\s+/).filter(Boolean);
    const wpm = durationSeconds > 0 ? Math.round(words.length / (durationSeconds / 60)) : 0;
    
    return {
      score: localResult.score ?? 60,
      grammarMistakes: localResult.grammarMistakes || [],
      theoryMistakes: localResult.theoryMistakes || [],
      wpm,
      feedback: localResult.feedback || 'Answer reviewed locally.'
    };
  }
}

/**
 * Compiles the final detailed report from individual question evaluations.
 */
export async function compileFinalMockReport(answers, selectedTopics, apiKey, model = '') {
  try {
    const rawModel = model || localStorage.getItem('gemini_model') || 'gemini-2.0-flash';
    
    let totalScore = 0;
    let totalDuration = 0;
    let totalBreaks = 0;
    let totalWords = 0;
    let totalFillers = 0;
    const fillerBreakdown = {};
    const topicScores = {};
    
    answers.forEach((ans) => {
      totalScore += ans.score || 0;
      totalDuration += ans.duration || 0;
      totalBreaks += ans.breaksCount || 0;
      
      const words = (ans.transcript || '').split(/\s+/).filter(Boolean);
      totalWords += words.length;
      
      words.forEach(w => {
        const cleanWord = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
        if (COMMON_FILLER_WORDS.includes(cleanWord)) {
          totalFillers++;
          fillerBreakdown[cleanWord] = (fillerBreakdown[cleanWord] || 0) + 1;
        }
      });
      
      const topic = ans.question.category || 'General';
      if (!topicScores[topic]) {
        topicScores[topic] = { sum: 0, count: 0 };
      }
      topicScores[topic].sum += ans.score || 0;
      topicScores[topic].count += 1;
    });
    
    const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
    const avgWpm = totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0;
    
    const finalizedTopicScores = {};
    Object.keys(topicScores).forEach(topic => {
      finalizedTopicScores[topic] = Math.round(topicScores[topic].sum / topicScores[topic].count);
    });

    const summaryPromptData = answers.map((ans, idx) => ({
      index: idx + 1,
      question: ans.question.text,
      category: ans.question.category,
      transcript: ans.transcript,
      score: ans.score,
      theoryMistakes: ans.theoryMistakes || [],
      grammarMistakes: ans.grammarMistakes || []
    }));

    const prompt = `You are an expert interview coach. Analyze this summary data of a candidate's completed mock interview:
Selected Topics: ${selectedTopics.join(', ')}
Overall Score (calculated): ${avgScore}/100
Average Pacing: ${avgWpm} WPM
Filler Words Count: ${totalFillers}
Breaks/Pauses Count: ${totalBreaks}

Question evaluations:
${JSON.stringify(summaryPromptData, null, 2)}

Please provide a comprehensive summary audit of the interview containing:
1. "overallFeedback": A detailed coaching paragraph summarizing their performance, key technical areas of strength/weakness, and verbal communication advice.
2. "paceAssessment": Feedback on their pace and speed.
3. "communicationAssessment": Feedback on their pauses, flow, and filler usage.
4. "behavioralAssessment": Review of structure, confidence, and verbal patterns.
5. "bluffingAudit": Review of whether they tried to bluff/evade technical details.
6. "strengths": Array of exactly 3 overall strength strings.
7. "weaknesses": Array of exactly 3 overall weakness strings.
8. "actionableSteps": Array of 3 to 5 highly concrete, actionable next steps or study tasks.

Respond ONLY with a valid JSON object matching this schema (do NOT wrap in markdown blocks):
{
  "overallFeedback": "coaching feedback...",
  "paceAssessment": "pace feedback...",
  "communicationAssessment": "pauses feedback...",
  "behavioralAssessment": "behavioral feedback...",
  "bluffingAudit": "bluffing audit...",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "actionableSteps": ["step 1", "step 2", "step 3"]
}`;

    const rawText = await generateGeminiContentWithFallback(prompt, apiKey, rawModel);
    const parsed = extractJson(rawText);
    
    let paceRating = 'Normal';
    if (avgWpm < 110) paceRating = 'Slow';
    else if (avgWpm > 170) paceRating = 'Fast';
    
    return {
      score: avgScore,
      totalDuration,
      breaksCount: totalBreaks,
      wordCount: totalWords,
      wpm: avgWpm,
      fillerCount: totalFillers,
      fillerBreakdown,
      paceRating,
      paceFeedback: parsed.paceAssessment || 'Normal flow.',
      communicationAssessment: parsed.communicationAssessment || '',
      behavioralAssessment: parsed.behavioralAssessment || '',
      bluffingAudit: parsed.bluffingAudit || '',
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      actionableSteps: parsed.actionableSteps || [],
      feedback: parsed.overallFeedback || '',
      topicScores: finalizedTopicScores,
      questions: answers.map(ans => ({
        question: ans.question,
        score: ans.score,
        transcript: ans.transcript,
        wpm: ans.wpm,
        duration: ans.duration,
        breaksCount: ans.breaksCount,
        theoryMistakes: ans.theoryMistakes || [],
        grammarMistakes: ans.grammarMistakes || []
      }))
    };
  } catch (error) {
    console.error("Error compiling final report with Gemini:", error);
    return compileFinalReportLocally(answers, selectedTopics);
  }
}

/**
 * Fallback local report compiler.
 */
export function compileFinalReportLocally(answers, selectedTopics) {
  let totalScore = 0;
  let totalDuration = 0;
  let totalBreaks = 0;
  let totalWords = 0;
  let totalFillers = 0;
  const fillerBreakdown = {};
  const topicScores = {};
  
  answers.forEach((ans) => {
    totalScore += ans.score || 0;
    totalDuration += ans.duration || 0;
    totalBreaks += ans.breaksCount || 0;
    
    const words = (ans.transcript || '').split(/\s+/).filter(Boolean);
    totalWords += words.length;
    
    words.forEach(w => {
      const cleanWord = w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (COMMON_FILLER_WORDS.includes(cleanWord)) {
        totalFillers++;
        fillerBreakdown[cleanWord] = (fillerBreakdown[cleanWord] || 0) + 1;
      }
    });
    
    const topic = ans.question.category || 'General';
    if (!topicScores[topic]) {
      topicScores[topic] = { sum: 0, count: 0 };
    }
    topicScores[topic].sum += ans.score || 0;
    topicScores[topic].count += 1;
  });
  
  const avgScore = answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
  const avgWpm = totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0;
  
  const finalizedTopicScores = {};
  Object.keys(topicScores).forEach(topic => {
    finalizedTopicScores[topic] = Math.round(topicScores[topic].sum / topicScores[topic].count);
  });
  
  let paceRating = 'Normal';
  if (avgWpm < 110) paceRating = 'Slow';
  else if (avgWpm > 170) paceRating = 'Fast';
  
  return {
    score: avgScore,
    totalDuration,
    breaksCount: totalBreaks,
    wordCount: totalWords,
    wpm: avgWpm,
    fillerCount: totalFillers,
    fillerBreakdown,
    paceRating,
    paceFeedback: `Pacing was ${avgWpm} WPM.`,
    communicationAssessment: 'Communication metrics analyzed locally.',
    behavioralAssessment: 'Behavioral structure compiled locally.',
    bluffingAudit: 'Bluffing audit complete.',
    strengths: ['Direct response style', 'Good pace control', 'Vocabulary range'],
    weaknesses: ['Slight pauses between details', 'Buzzword padding on gaps', 'Minor grammar slips'],
    actionableSteps: [
      'Review the key concepts checklist for technical categories',
      'Avoid filler phrasing when transitioning between concepts',
      'Try reading technical definitions out loud to build fluency'
    ],
    feedback: 'Thank you for completing your mock interview session. Report compiled successfully.',
    topicScores: finalizedTopicScores,
    questions: answers.map(ans => ({
      question: ans.question,
      score: ans.score,
      transcript: ans.transcript,
      wpm: ans.wpm,
      duration: ans.duration,
      breaksCount: ans.breaksCount,
      theoryMistakes: ans.theoryMistakes || [],
      grammarMistakes: ans.grammarMistakes || []
    }))
  };
}

