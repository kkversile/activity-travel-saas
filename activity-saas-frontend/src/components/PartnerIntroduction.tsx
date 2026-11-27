import { useState } from 'react';
import munnar from '../assets/partner-experiences/munnar-jpg.jpg';
import alleppey from '../assets/partner-experiences/alleppey-jpg.jpg';
import kochi from '../assets/partner-experiences/kochi-jpg.jpg';
import coast from '../assets/voya-partner-hero.webp';
import PartnerExperienceRibbon from './PartnerExperienceRibbon';

const scenes = [
  { name: 'Nature trails', place: 'Munnar, Kerala', detail: 'The places you know. The stories only you can tell.', image: munnar, alt: 'Tea-covered hills and a hillside village in Munnar', credit: 'Ingo Mehling · CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Munnar_-_Tea_Plantations.jpg', license: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { name: 'On the water', place: 'Alleppey, Kerala', detail: 'Turn a day on the water into a lasting memory.', image: alleppey, alt: 'A traditional houseboat on the palm-lined Alleppey backwaters', credit: 'Paul Arps · CC BY 2.0', source: 'https://commons.wikimedia.org/wiki/File:Houseboat_on_Alleppey_backwaters_(Kerala,_India_2023)_(52703799562).jpg', license: 'https://creativecommons.org/licenses/by/2.0/' },
  { name: 'Local stories', place: 'Fort Kochi, Kerala', detail: 'Help travellers see your home through a local’s eyes.', image: kochi, alt: 'Traditional fishing nets along the waterfront at Fort Kochi', credit: 'Ingo Mehling · CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Chinese_Fishing_Nets_-_2.jpg', license: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { name: 'Coastal days', place: 'Coastal inspiration', detail: 'Make space for discovery, from shore to shore.', image: coast, alt: 'A long-tail boat on turquoise water between limestone islands' },
];

export default function PartnerIntroduction() {
  const [selected, setSelected] = useState(0);
  const scene = scenes[selected];
  return <section className="auth-introduction partner-story" aria-labelledby="auth-hero-title">
    <div className="partner-story-copy"><h1 id="auth-hero-title">Your experiences,<br />on Voya.</h1><p>Bring your tours, tickets and local experiences to travellers. One partner workspace, from your first listing to your next booking.</p></div>
    <figure className="partner-story-photo">
      <img key={scene.image} src={scene.image} alt={scene.alt} width={1280} height={745} fetchPriority="high" decoding="async" />
      <figcaption aria-live="polite"><b>{scene.place}</b><span>{scene.detail}</span></figcaption>
    </figure>
    <div className="partner-story-choices" role="group" aria-label="Experience inspiration">
      {scenes.map((item, index) => <button type="button" key={item.name} aria-pressed={selected === index} onClick={() => setSelected(index)}><img src={item.image} alt="" loading="lazy" width={80} height={58} /><span>{item.name}</span></button>)}
    </div>
    <p className="partner-story-note">Built for the people behind the experience.</p>
    {scene.source && <small className="partner-photo-credit"><a href={scene.source} target="_blank" rel="noreferrer">Photo: {scene.credit}</a> · <a href={scene.license} target="_blank" rel="noreferrer">Licence</a></small>}
  </section>;
}

export function PartnerEntryGuide() {
  return <section className="partner-entry-guide" aria-labelledby="partner-guide-title">
    <div><h2 id="partner-guide-title">A good experience starts with you.</h2><p>You bring the local knowledge. Voya brings your business, listings and bookings together.</p></div>
    <ol className="partner-entry-journey">
      <li><b>Get your business ready</b><span>Create your account, add your business details and complete verification. Save your progress as you go.</span></li>
      <li><b>Make the experience yours</b><span>Add photos, bookable options, prices and availability. Create one listing or bring in a catalogue with bulk upload.</span></li>
      <li><b>Be ready for your guests</b><span>Submit for review, then manage bookings, fulfilment and settlement from your partner workspace.</span></li>
    </ol>
    <PartnerExperienceRibbon />
    <div className="partner-entry-faq"><details><summary>Can I finish my setup later?</summary><p>Yes. Save your onboarding or product draft and return to it from the same account.</p></details><details><summary>When can my experience go live?</summary><p>Your business verification and product review must be approved. Your workspace shows what is ready and what still needs attention.</p></details><details><summary>Can my team manage different outlets?</summary><p>Yes. Owners can manage their outlets together. Team members work with the outlets and permissions assigned to them.</p></details></div>
  </section>;
}

export function PartnerEntryFooter() {
  return <footer className="partner-entry-footer"><b>Voya Partner Hub</b><span>Your experiences. Your local expertise.</span></footer>;
}
