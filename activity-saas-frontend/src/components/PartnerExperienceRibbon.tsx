import { useEffect, useRef, useState } from 'react';
import munnar from '../assets/partner-experiences/munnar-jpg.jpg';
import alleppey from '../assets/partner-experiences/alleppey-jpg.jpg';
import kochi from '../assets/partner-experiences/kochi-jpg.jpg';
import coast from '../assets/voya-partner-hero.webp';
import kathakali from '../assets/partner-experiences/motion/kathakali-jpg.jpg';
import periyar from '../assets/partner-experiences/motion/periyar-jpg.jpg';
import varkala from '../assets/partner-experiences/motion/varkala-jpg.jpg';
import wayanad from '../assets/partner-experiences/motion/wayanad-jpg.jpg';

const experiences = [
  { title: 'Nature trails', image: munnar },
  { title: 'Backwater cruises', image: alleppey },
  { title: 'Cultural shows', image: kathakali },
  { title: 'Heritage walks', image: kochi },
  { title: 'Wildlife encounters', image: periyar },
  { title: 'Beach escapes', image: varkala },
  { title: 'Hill treks', image: wayanad },
  { title: 'Coastal days', image: coast },
];
const secondRow = [...experiences.slice(3), ...experiences.slice(0, 3)];
const credits = [
  { title: 'Munnar — Tea Plantations', author: 'Ingo Mehling', license: '4.0', file: 'Munnar_-_Tea_Plantations.jpg' },
  { title: 'Alleppey backwaters', author: 'Paul Arps', license: '2.0', by: true, file: 'Houseboat_on_Alleppey_backwaters_(Kerala,_India_2023)_(52703799562).jpg' },
  { title: 'Chinese Fishing Nets — 2', author: 'Ingo Mehling', license: '4.0', file: 'Chinese_Fishing_Nets_-_2.jpg' },
  { title: 'Kathakali at Nishagandhi dance festival 2024 (266)', author: 'Shagil Kannur', license: '3.0', file: 'Kathakali_of_Kerala_at_Nishagandhi_dance_festival_2024_(266).jpg' },
  { title: 'Periyar lake, Kerala, India', author: 'Abhirami.c', license: '4.0', file: 'Periyar_lake,Kerala,India.jpg' },
  { title: 'Varkala Cliff by KS', author: 'Krissubh', license: '4.0', file: 'Varkala_Cliff_by_KS.jpg' },
  { title: 'En Ooru — Chembra Peak View', author: 'Ingo Mehling', license: '4.0', file: 'En_Ooru_-_Chembra_Peak_View.jpg' },
];

export default function PartnerExperienceRibbon() {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !section.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '100px' });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  return <section ref={section} className="partner-experience-ribbon" aria-labelledby="voya-ribbon-title" data-paused={!visible}>
    <header className="partner-ribbon-heading"><div><h3 id="voya-ribbon-title">An experience for every kind of day.</h3><p>Walks, water, wildlife and local culture. Bring the experiences you know best.</p></div></header>
    <div id="voya-experience-ribbons" className="partner-ribbon-viewport">
      {[experiences, secondRow].map((row, rowIndex) => <div className="partner-ribbon-row" key={rowIndex} aria-hidden={rowIndex === 1 ? true : undefined}>
        <div className="partner-ribbon-track">
          {[false, true].map(clone => <ul className="partner-ribbon-group" key={String(clone)} data-clone={clone} aria-hidden={clone ? true : undefined}>
            {row.map(item => <li className="partner-ribbon-tile" key={item.title}><figure><img src={item.image} alt="" width={140} height={140} loading="lazy" decoding="async" /><figcaption>{item.title}</figcaption></figure></li>)}
          </ul>)}
        </div>
      </div>)}
    </div>
    <details className="partner-ribbon-credits"><summary>Photo credits</summary><ul>{credits.map(item => <li key={item.file}><a href={`https://commons.wikimedia.org/wiki/File:${item.file}`} target="_blank" rel="noreferrer">{item.title}</a> by {item.author} · <a href={`https://creativecommons.org/licenses/${item.by ? 'by' : 'by-sa'}/${item.license}/`} target="_blank" rel="noreferrer">CC {item.by ? 'BY' : 'BY-SA'} {item.license}</a></li>)}<li>Coastal scene: existing Voya partner imagery. Photographs are cropped to fit their display windows.</li></ul></details>
  </section>;
}
