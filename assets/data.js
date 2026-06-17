/* =====================================================================
   Mock data for Acreon CRM demo
   Single owner (Keya) + 45 employees + ~50 leads with varied states
   ===================================================================== */

const AVATAR_COLORS = ['amber','emerald','violet','rose','sky','teal','slate','indigo'];
const avColor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];

const OWNER = {
  initials: 'KT',
  id: 'U-0001',
  name: 'Keya Trehan',
  role: 'Owner',
  email: 'keya@acreon.in',
  phone: '+91 98450 11111',
  avatar: 'KT',
  color: 'amber',
};

const FIRST_NAMES = [
  'Aarush','Ahaan','Devansh','Disha','Ranveer','Kiaan','Hriday','Yuvan','Aarush','Tejas',
  'Aarit','Vivaan','Manas','Tara','Hriday','Hardik','Tisha','Shaurya','Pranav','Bhavya',
  'Advik','Jayesh','Tanish','Kabir','Vanya','Girik','Urvi','Saatvik','Darsh','Hiral',
  'Raghav','Reet','Omkar','Mira','Laksh','Aanya','Saanvi','Diya','Navya','Charvi',
  'Inaya','Dhruv','Ivaan','Lavin','Advik',
];
const LAST_NAMES = [
  'Trehan','Sodhi','Madan','Bhalla','Sahni','Marwah','Walia','Chauhan','Bhasin','Gandhi',
  'Rana','Dewan','Gulati','Khurana','Datta','Chhabra','Uppal','Malhotra','Ohri','Thakur',
  'Hooda','Mehta','Dhawan','Mathur','Oberoi','Vohra','Disha','Hiral','Wadhwa','Garg',
  'Kalra','Sachdev','Bhandari','Chawla','Dua','Kakkar','Bajaj','Kapadia','Raina','Talwar',
  'Chadha','Kohli','Prasad','Chandra','Narang',
];

const TEAMS = ['Whitefield', 'North Bangalore', 'South Bangalore', 'East Bangalore', 'CP Network'];

// ---- 45 employees ----
const EMPLOYEES = [];
for (let i = 0; i < 45; i++) {
  const fn = FIRST_NAMES[i % FIRST_NAMES.length];
  const ln = LAST_NAMES[(i * 3) % LAST_NAMES.length];
  EMPLOYEES.push({
    id: `E-${String(46160 + i).padStart(5, '0')}`,
    name: `${fn} ${ln}`,
    initials: (fn[0] + ln[0]).toUpperCase(),
    color: avColor(i),
    team: TEAMS[i % TEAMS.length],
    phone: `+91 9${(800000000 + i * 13).toString().slice(0,9)}`,
    email: `${fn.toLowerCase()}.${ln.toLowerCase()}@acreon.in`,
    joinedAt: '2024-09-15',
  });
}

const PROJECTS = [
  { name: 'Amberstone Sleek', builder: 'Amberstone Group', location: 'Whitefield', category: 'Apartment' },
  { name: 'Prestige Lakeside Habitat', builder: 'Prestige Estates', location: 'Varthur', category: 'Apartment' },
  { name: 'Sobha Indraprastha', builder: 'Sobha Limited', location: 'Rajajinagar', category: 'Apartment' },
  { name: 'Brigade Cornerstone Utopia', builder: 'Brigade Group', location: 'Varthur', category: 'Apartment' },
  { name: 'Godrej Splendour', builder: 'Godrej Properties', location: 'Whitefield', category: 'Apartment' },
  { name: 'Mantri Webcity', builder: 'Mantri Developers', location: 'Hennur', category: 'Apartment' },
  { name: 'Tata New Haven', builder: 'Tata Housing', location: 'Tumkur Road', category: 'Villa' },
  { name: 'Salarpuria Sattva Magnus', builder: 'Sattva Group', location: 'Outer Ring Road', category: 'Apartment' },
  { name: 'Purva Atmosphere', builder: 'Puravankara', location: 'Thanisandra', category: 'Apartment' },
  { name: 'Embassy Lake Terraces', builder: 'Embassy Group', location: 'Hebbal', category: 'Villa' },
];

const SOURCES = [
  { id: 'fb',       name: 'Facebook',     icon: 'F',  cls: 'source-fb' },
  { id: 'ig',       name: 'Instagram',    icon: 'I',  cls: 'source-ig' },
  { id: '99',       name: '99acres',      icon: '9',  cls: 'source-99' },
  { id: 'mb',       name: 'MagicBricks',  icon: 'M',  cls: 'source-mb' },
  { id: 'housing',  name: 'Housing.com',  icon: 'H',  cls: 'source-housing' },
  { id: 'website',  name: 'Website',      icon: 'W',  cls: 'source-website' },
  { id: 'walkin',   name: 'Walk-in',      icon: 'V',  cls: 'source-walkin' },
  { id: 'referral', name: 'Referral',     icon: 'R',  cls: 'source-referral' },
];

const CONFIGURATIONS = ['2 BHK', '2.5 BHK', '3 BHK', '3.5 BHK', '4 BHK', 'Villa'];
const BUDGETS = ['₹65 L', '₹85 L', '₹1.2 Cr', '₹1.5 Cr', '₹2.1 Cr', '₹2.5 Cr', '₹3.2 Cr', '₹4.5 Cr', '₹6 Cr'];

const ROTATION_REASONS = [
  'Customer not responding — called 5 times, no answer',
  'Phone switched off for 3 consecutive days',
  'Customer asked to call back next month, marked stale',
  'Number busy / out of service',
  'No response on WhatsApp despite read receipts',
  'Customer travelling abroad — re-engage later',
  'Called during office hours, asked to call evening, missed',
  'Site visit scheduled and missed twice',
  'Customer says budget reconsidering — pending decision',
  'No reply to WhatsApp / call for 4 days',
];

const CLOSE_REASONS = [
  { reason: 'Disqualified — budget mismatch', pill: 'pill-slate' },
  { reason: 'Not Interested', pill: 'pill-slate' },
  { reason: 'Bought elsewhere', pill: 'pill-red' },
  { reason: 'Wrong number / spam lead', pill: 'pill-slate' },
  { reason: 'Converted to Deal ✓', pill: 'pill-emerald' },
  { reason: 'Postponed — long-term', pill: 'pill-slate' },
];

// helper: pick deterministic-ish from index
const pick = (arr, i) => arr[i % arr.length];

// ---- ~50 leads with varied rotation states ----
// State distribution we want for a realistic demo:
//   Active (no rotation yet): ~18
//   Rotated once (in rotation queue or follow-up): ~12
//   Rotated twice: ~8
//   Rotated thrice (final attempt): ~5
//   Closed: ~7

const LEAD_NAMES = [
  'Rudra Tandon','Veer Sodhi','Rudra Nanda','Kabir Darsh','Bodhi Bakshi',
  'Tara Chauhan','Urvi Hooda','Viraj Gulati','Kabir Luthra','Ahaan Dewan',
  'Tanish Ohri','Laksh Khurana','Jayesh Thakur','Tisha Datta','Nirvaan Chhabra',
  'Hiral Bhalla','Shaurya Sahni','Darsh Sodhi','Laksh Vohra','Aanya Walia',
  'Saanvi Bhasin','Diya Handa','Navya Marwah','Charvi Mehta','Inaya Rana',
  'Reet Malhotra','Mira Madan','Girik Bajaj','Nirvaan Kapadia','Advik Raina',
  'Veer Talwar','Yuvan Chadha','Kiaan Kohli','Mehul Prasad','Nakul Chandra',
  'Vivaan Narang','Mehul Bhandari','Nakul Chawla','Samar Dua','Vedant Kakkar',
  'Yash Ahuja','Ira Bedi','Anvi Sodhi','Kiara Grover','Pari Hooda',
  'Gauri Puri','Jiya Sachdev','Zara Sahni','Chirag Bhasin','Farhan Marwah',
];

const PIPELINE_STAGES = ['Open', 'Prospect', 'Opportunity', 'Site Visit', 'Negotiation'];

// Build the leads programmatically
const LEADS = LEAD_NAMES.map((name, i) => {
  const proj = pick(PROJECTS, i);
  const source = pick(SOURCES, i + 1);
  const config = pick(CONFIGURATIONS, i);
  const budget = pick(BUDGETS, i + 2);
  const firstOwnerIdx = (i * 7) % EMPLOYEES.length;

  // Decide rotation state
  let rotations = 0;
  let isClosed = false;
  let closeInfo = null;

  if (i < 18)           rotations = 0;           // 18 active untouched
  else if (i < 30)      rotations = 1;           // 12 rotated once
  else if (i < 38)      rotations = 2;           // 8 rotated twice
  else if (i < 43)      rotations = 3;           // 5 at final attempt
  else { isClosed = true; rotations = 3; closeInfo = pick(CLOSE_REASONS, i); }   // 7 closed

  // Build the rotation trail (Step 0 = original owner, each next step = a rotation)
  const trail = [];
  for (let r = 0; r <= rotations; r++) {
    const ownerIdx = (firstOwnerIdx + r * 11) % EMPLOYEES.length;
    const isFinalStep = (r === rotations);
    const stage = pick(PIPELINE_STAGES, i + r);

    let note = null;
    let dateFrom, dateTo;
    const baseDay = i % 25 + 1;
    if (r === 0) {
      dateFrom = `${baseDay} Apr 2026`;
      dateTo = (rotations > 0) ? `${baseDay + 3} Apr 2026` : 'present';
    } else {
      dateFrom = `${baseDay + r * 3} Apr 2026`;
      dateTo = (r < rotations) ? `${baseDay + (r + 1) * 3} Apr 2026` : (isClosed ? 'closed' : 'present');
    }
    if (r < rotations) {
      // Rotated out — must have an outgoing note
      note = pick(ROTATION_REASONS, i + r);
    } else if (isClosed) {
      note = closeInfo.reason;
    }
    trail.push({
      employee: EMPLOYEES[ownerIdx],
      dateFrom,
      dateTo,
      note,
      stage,
      isCurrent: isFinalStep && !isClosed,
      isClosed: isFinalStep && isClosed,
    });
  }

  const currentOwner = trail[trail.length - 1].employee;
  const daysSinceContact = isClosed ? null : (Math.abs((i * 3) % 7));
  const isStale = !isClosed && daysSinceContact >= 3;

  let status;
  if (isClosed) status = { label: closeInfo.reason, pill: closeInfo.pill };
  else if (rotations === 0) status = { label: 'Fresh', pill: 'pill-emerald' };
  else if (rotations === 1) status = { label: 'Rotated 1×', pill: 'pill-amber' };
  else if (rotations === 2) status = { label: 'Rotated 2×', pill: 'pill-amber' };
  else status = { label: 'Final attempt', pill: 'pill-red' };

  return {
    id: `L-${String(1000 + i).padStart(4, '0')}`,
    name,
    initials: name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase(),
    color: avColor(i + 1),
    phone: `+91 9${(700000000 + i * 11).toString().slice(0,9)}`,
    email: `${name.toLowerCase().replace(/\s+/g,'.')}@gmail.com`,
    source,
    project: proj,
    configuration: config,
    budget,
    possession: pick(['Ready to Move','Mar 2026','Jun 2026','Dec 2026','Mar 2027'], i),
    pipelineStage: trail[trail.length - 1].stage,
    rotations,
    isClosed,
    isStale,
    daysSinceContact,
    currentOwner,
    originalOwner: trail[0].employee,
    trail,
    status,
    createdAt: '15 Apr 2026',
  };
});

// ---- Stats derived for dashboard ----
const STATS = {
  totalLeads: LEADS.length,
  activeLeads: LEADS.filter(l => !l.isClosed).length,
  inRotation: LEADS.filter(l => !l.isClosed && l.rotations > 0).length,
  staleToday: LEADS.filter(l => l.isStale && !l.isClosed).length,
  closedThisMonth: LEADS.filter(l => l.isClosed).length,
  converted: LEADS.filter(l => l.isClosed && l.status.label.includes('Converted')).length,
};

// Workload per employee (lead count per employee currently)
const EMP_WORKLOAD = {};
EMPLOYEES.forEach(e => { EMP_WORKLOAD[e.id] = { active: 0, rotatedIn: 0, closed: 0 }; });
LEADS.forEach(l => {
  const w = EMP_WORKLOAD[l.currentOwner.id];
  if (l.isClosed) w.closed += 1;
  else w.active += 1;
  if (l.rotations > 0 && l.currentOwner.id !== l.originalOwner.id) w.rotatedIn += 1;
});

// Source breakdown (for chart on dashboard)
const SOURCE_BREAKDOWN = {};
SOURCES.forEach(s => SOURCE_BREAKDOWN[s.id] = 0);
LEADS.forEach(l => { SOURCE_BREAKDOWN[l.source.id] += 1; });

// Make available globally for non-module scripts
window.MOCK = {
  OWNER, EMPLOYEES, LEADS, PROJECTS, SOURCES, CONFIGURATIONS, BUDGETS,
  PIPELINE_STAGES, ROTATION_REASONS, CLOSE_REASONS, STATS, EMP_WORKLOAD, SOURCE_BREAKDOWN,
};
