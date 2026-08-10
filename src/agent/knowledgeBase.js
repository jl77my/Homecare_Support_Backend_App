const KNOWLEDGE_BASE = [
  {
    id: 'fall-immediate-response',
    title: 'Immediate response after an older adult falls',
    keywords: [
      'fall', 'fell', 'fallen', 'bathroom', 'slip', 'head injury', 'hip injury',
      'cannot get up', 'unresponsive', 'not breathing', 'bleeding', 'emergency',
    ],
    content:
      'First make the area safe and check responsiveness and normal breathing. In Malaysia, call 999 immediately if the person is unresponsive, is not breathing normally, has severe bleeding, may have injured the head, neck, back or hip, or cannot get up. Do not move or lift them when a head, neck, back or hip injury is possible, unless there is immediate danger or movement is required for CPR. Keep them warm and comfortable and stay with them. If they are fully alert, have no warning signs and say they can get up, support them without trying to lift them alone. A head impact needs prompt medical assessment, especially when the person takes blood thinners.',
    sourceTitle: 'NHS — Falls',
    sourceUrl: 'https://www.nhs.uk/conditions/falls/',
  },
  {
    id: 'fall-prevention',
    title: 'Reducing fall risk at home',
    keywords: [
      'prevent fall', 'fall risk', 'bathroom safety', 'grab bar', 'lighting',
      'slippery', 'balance', 'footwear', 'home hazard',
    ],
    content:
      'Reduce fall hazards by improving lighting, removing clutter and loose rugs, using non-slip bathroom surfaces and grab bars, and checking footwear. Ask a healthcare professional to review balance, vision and medicines that may cause dizziness or sleepiness. A previous fall or new unsteadiness should be discussed with a clinician.',
    sourceTitle: 'CDC — About Older Adult Fall Prevention',
    sourceUrl: 'https://www.cdc.gov/falls/about/index.html',
  },
  {
    id: 'missed-medication',
    title: 'Safe response to a missed medication dose',
    keywords: [
      'missed dose', 'not taken', 'medication', 'medicine', 'pill', 'tablet',
      'double dose', 'late dose', 'forgot',
    ],
    content:
      'Do not give a double dose to make up for a missed dose. The correct next step depends on the specific medicine and how late the dose is. Check the medicine label or patient leaflet and contact the pharmacist or prescriber when unsure. Some medicines, including insulin, anticoagulants, seizure medicines, cancer medicines and immunosuppressants, require medicine-specific urgent advice.',
    sourceTitle: 'NHS — Medicines tips for carers',
    sourceUrl:
      'https://www.nhs.uk/social-care-and-support/practical-tips-if-you-care-for-someone/medicines-tips-for-carers/',
  },
  {
    id: 'emergency-warning-signs',
    title: 'Warning signs requiring emergency help',
    keywords: [
      'chest pain', 'stroke', 'face droop', 'weakness', 'speech', 'difficulty breathing',
      'unconscious', 'unresponsive', 'seizure', 'severe bleeding', 'emergency',
    ],
    content:
      'Call Malaysia emergency services at 999 for life-threatening symptoms such as unresponsiveness, abnormal or absent breathing, suspected stroke, severe chest pain, a prolonged seizure or severe uncontrolled bleeding. Stay with the person and follow the emergency call handler instructions.',
    sourceTitle: 'Malaysia Ministry of Health — Emergency triage',
    sourceUrl: 'https://icemas.hmelaka.moh.gov.my/triage',
  },
  {
    id: 'care-reporting',
    title: 'Writing an objective care report',
    keywords: [
      'care report', 'report', 'observation', 'document', 'daily log', 'injury',
      'meal', 'mobility', 'medical observation',
    ],
    content:
      'Record what was directly observed, when it happened, relevant measurements, assistance provided and the person notified. Avoid diagnosing or presenting assumptions as facts. Escalate urgent symptoms immediately rather than relying on a care report alone.',
    sourceTitle: 'HomeCare reporting guidance',
    sourceUrl: null,
  },
];

const SYNONYMS = {
  fell: ['fall', 'fallen'],
  slipped: ['fall', 'slip'],
  toilet: ['bathroom'],
  meds: ['medication', 'medicine'],
  took: ['taken'],
  unconscious: ['unresponsive'],
};

function tokenize(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
  const expanded = new Set(normalized);
  normalized.forEach((token) => (SYNONYMS[token] || []).forEach((item) => expanded.add(item)));
  return [...expanded];
}

function retrieveKnowledge(query, limit = 3) {
  const queryText = String(query || '').toLowerCase();
  const queryTokens = new Set(tokenize(query));

  return KNOWLEDGE_BASE.map((document) => {
    const searchableTokens = tokenize(
      `${document.title} ${document.keywords.join(' ')} ${document.content}`,
    );
    let score = searchableTokens.reduce(
      (total, token) => total + (queryTokens.has(token) ? 1 : 0),
      0,
    );

    for (const keyword of document.keywords) {
      if (keyword.includes(' ') && queryText.includes(keyword)) score += 4;
    }

    const asksAboutFall = /\b(fall|fell|fallen|slip|slipped)\b/.test(queryText);
    const asksWhatToDo = /\b(what|how|react|help|do|immediate|now)\b/.test(queryText);
    if (document.id === 'fall-immediate-response' && asksAboutFall && asksWhatToDo) score += 12;
    if (document.id === 'fall-prevention' && asksAboutFall && asksWhatToDo) score -= 2;

    return { ...document, score };
  })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 5)));
}

module.exports = { KNOWLEDGE_BASE, retrieveKnowledge, tokenize };
