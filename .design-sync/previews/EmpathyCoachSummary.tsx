import { EmpathyCoachSummary } from 'frontend';

const careData = {
  empathy_tool: 'CARE',
  overall_score: 3.8,
  summary:
    "The student demonstrated strong rapport-building and active listening throughout the conversation, checking in on the patient's concerns before moving to clinical questions. There is room to grow in collaborative planning — invite the patient to help shape next steps rather than presenting a finished plan.",
  rapport: 8,
  listening: 4,
  whole_person: 8,
  affective_empathy: 4,
  communication: 8,
  shared_planning: 6,
  strengths: [
    'Opened with an open-ended question and let the patient tell their story before redirecting',
    'Named the patient\'s emotion explicitly ("that sounds frustrating") before moving on',
  ],
  recommendations: [
    'Invite the patient to help shape the plan rather than presenting a finished one',
    'Summarize back what was heard before moving to the next topic',
  ],
  forward_target: 'Practice closing with a shared next step the patient helped choose.',
};

const prismData = {
  empathy_tool: 'PRISM',
  overall_score: 4.1,
  summary:
    'Good orientation and framing at the start of the conversation, with clear signals of engagement and in-the-moment self-monitoring throughout.',
  prepare: 4,
  recognise: 4,
  interact: 5,
  self_assess: 3,
  master: 4,
  strengths: ['Clear framing of the visit\'s purpose in the opening minute'],
  recommendations: ['Pause more often to check understanding before moving on'],
};

export const CareMeasure = () => (
  <div style={{ maxWidth: 480 }}>
    <EmpathyCoachSummary empathyData={careData} />
  </div>
);

export const PrismFramework = () => (
  <div style={{ maxWidth: 480 }}>
    <EmpathyCoachSummary empathyData={prismData} />
  </div>
);
