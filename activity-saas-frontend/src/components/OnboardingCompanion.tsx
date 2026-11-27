import { useState } from 'react';

const guidance = [
  { title: 'Start with your business', purpose: 'Use the legal details on your documents and the name your guests will recognise.', items: ['Your registered business name and address', 'The cities and experiences you operate', 'Your website or existing listing links, if available'] },
  { title: 'Keep the right people connected', purpose: 'Give us a reachable primary contact, then add the people who handle bookings and urgent issues.', items: ['A working email and mobile number', 'Booking and operations contacts', 'Escalation contacts for time-sensitive help'] },
  { title: 'Make verification straightforward', purpose: 'Clear, complete documents help the review team match your business details.', items: ['PAN details matching your legal name', 'GST registration or the applicable declaration', 'Readable documents with all edges visible'] },
  { title: 'Show you are ready to operate', purpose: 'Provide the licences and insurance relevant to your activities. Keep validity dates current.', items: ['Documents relevant to your supplier type', 'Licence numbers and expiry dates', 'Insurance details where applicable'] },
  { title: 'Prepare your payout details', purpose: 'The account holder name should match your business and the bank proof you upload.', items: ['Account number and account type', 'Bank name and IFSC', 'A cancelled cheque or accepted bank proof'] },
  { title: 'Understand your commercial terms', purpose: 'Review the terms assigned to your business before moving on to the agreement.', items: ['Your commission or commercial model', 'The assigned settlement cycle', 'Contact your account manager for revisions'] },
  { title: 'Review before you sign', purpose: 'Read the agreement and confirm the authorised business and representative details.', items: ['The agreement for your supplier type', 'Your authorised representative', 'A signature and the required acceptance'] },
  { title: 'One final check', purpose: 'The final review uses your saved details. Follow any flagged item back to its section before submitting.', items: ['Business and contact details are correct', 'Documents and bank proof are included', 'Agreement requirements are complete'] },
];

export default function OnboardingCompanion({ step }: { step: number }) {
  const [expanded,setExpanded]=useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1100px)').matches);
  const item = guidance[Math.max(0, Math.min(guidance.length - 1, step - 1))];
  return <aside className="onboarding-companion" aria-label="Help for this onboarding section"><details className="onboarding-companion-content" open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>Help with this section</summary><h3>{item.title}</h3><p>{item.purpose}</p><details open={step === 1 || step === 3 || step === 5}><summary>Have these ready</summary><ul>{item.items.map(text => <li key={text}>{text}</li>)}</ul></details><p className="journey-save-hint">Choose Save draft to keep your progress. A saved draft does not submit your application.</p><span className="journey-brand-signature">Voya Partner Hub</span></details></aside>;
}

export function OnboardingPreparation() {
  return <div className="onboarding-preparation"><div><h3>Your business, ready for Voya.</h3><p>Work through a section at a time. You can save a draft and return with the same account.</p></div><ul><li><b>Business identity</b><span>Legal name, PAN and registered address</span></li><li><b>Operating documents</b><span>GST details and applicable licences</span></li><li><b>Payout setup</b><span>Bank details and supporting proof</span></li><li><b>Authorised representative</b><span>Contact details and agreement signature</span></li></ul></div>;
}
