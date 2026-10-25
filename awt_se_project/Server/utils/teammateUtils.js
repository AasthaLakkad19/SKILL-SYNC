// Pure helpers for the Find Teammates feature (no database access).

// Same values/labels as the page's "Project Interests" dropdown
const INTERESTS = [
  { value: "web development", label: "Web Development" },
  { value: "ui/ux", label: "UI/UX" },
  { value: "artificial intelligence", label: "Artificial Intelligence" },
  { value: "mobile app development", label: "Mobile App Development" },
  { value: "data science", label: "Data Science" }
];

const INTEREST_LABELS = Object.fromEntries(INTERESTS.map((i) => [i.value, i.label]));

// Used ONLY when a user hasn't picked an interest: guess from their skills.
// Ambiguous skills (Python, Java ...) are deliberately left out.
const INTEREST_SKILLS = {
  "web development": ["javascript", "react", "node.js", "html/css", "html", "css", "express", "angular", "vue", "mongodb", "php"],
  "ui/ux": ["ui/ux", "figma", "ux", "ui", "design", "adobe xd"],
  "artificial intelligence": ["machine learning", "deep learning", "tensorflow", "pytorch", "nlp", "ai"],
  "mobile app development": ["flutter", "kotlin", "swift", "react native", "android", "ios", "dart"],
  "data science": ["pandas", "data analysis", "statistics", "sql", "power bi", "tableau", "numpy"]
};

function deriveInterest(skills) {
  const have = new Set((skills || []).map((s) => String(s).toLowerCase()));
  let best = null;
  let bestCount = 0;
  for (const [interest, list] of Object.entries(INTEREST_SKILLS)) {
    const count = list.filter((s) => have.has(s)).length;
    if (count > bestCount) {
      best = interest;
      bestCount = count;
    }
  }
  return best; // null when nothing matches
}

const makePairKey = (a, b) => [String(a), String(b)].sort().join(":");

// "B.Tech CSE · Semester 5" style line from Profile.education
function educationLine(edu) {
  if (!edu) return "";
  const parts = [edu.degree, edu.years].map((p) => (p || "").trim()).filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return (edu.school || "").trim();
}

// Merge skill names from the User and Profile documents (case-insensitive unique)
function mergeSkills(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const name = String(raw || "").trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

// Same rules as the page's matchesFilters(), so server and client agree
function matchesFilters(card, f) {
  const skills = card.skills.map((s) => s.toLowerCase());
  const text = (f.search || "").trim().toLowerCase();

  const matchesText =
    !text || card.name.toLowerCase().includes(text) || skills.some((s) => s.includes(text));
  const matchesSkill = !f.skill || f.skill === "all" || skills.includes(String(f.skill).toLowerCase());
  const matchesInterest = !f.interest || f.interest === "all" || card.interest === f.interest;
  const matchesAvailability =
    !f.availability || f.availability === "all" || card.availability === f.availability;

  return matchesText && matchesSkill && matchesInterest && matchesAvailability;
}

module.exports = {
  INTERESTS,
  INTEREST_LABELS,
  deriveInterest,
  makePairKey,
  educationLine,
  mergeSkills,
  matchesFilters
};
