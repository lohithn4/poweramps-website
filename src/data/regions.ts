/**
 * Local search landing pages: /electrical-panel-manufacturer-<slug>/
 * (Bangalore, Karnataka, India). Each page has its own wording and FAQs so they
 * answer different searches instead of repeating one page three times.
 * Only state what is true; this is published as the company's own statement.
 */
import site from './site.json';
import { url } from '../lib/url';
import type { Faq } from './faqs';

export interface Region {
  slug: string;
  place: string; // "Bangalore"
  title: string; // <title> before " | Poweramps"
  h1: string;
  description: string;
  eyebrow: string;
  lead: string;
  typesTitle: string;
  whyEyebrow: string;
  whyTitle: string;
  why: string[];
  faqTitle: string;
  faqs: Faq[];
  areaServed: Record<string, unknown>[];
}

const brand = (site as any).shortName || site.name;
const a = site.address;
const est = site.established;
const callToFix = site.phone ? ` Call ${site.phone} to fix a time.` : '';
const gst = (site as any).gst as string | undefined;
const mapLink = site.map?.link ? { link: { href: site.map.link, text: 'Open in Google Maps' } } : {};
const buildLink = { href: url('/build/'), text: 'Build your panel online' };

export const REGIONS: Region[] = [
  {
    slug: 'bangalore',
    place: 'Bangalore / Bengaluru',
    title: 'Electrical Panel Manufacturer in Bangalore / Bengaluru',
    h1: 'Electrical panel manufacturer in Bangalore / Bengaluru',
    description: `${site.name}: electrical panel manufacturer in Bangalore (Bengaluru) since ${est}. MCC, PLC, VFD, AMF, DG sync and fire-fighting panels, factory tested, installed and serviced.`,
    eyebrow: 'Bangalore / Bengaluru · Karnataka',
    lead: `${brand} (${site.legalName}) has built LT control and power distribution panels at our works on Kanakapura Road, Bengaluru, since ${est}. Design, fabrication, factory testing, installation and service, all from one Bangalore (Bengaluru) team.`,
    typesTitle: 'Panels we manufacture in Bangalore / Bengaluru',
    whyEyebrow: 'Why a local manufacturer',
    whyTitle: 'One team, close to your site',
    why: [
      'Visit our works, see your panel being built and inspect it before dispatch',
      'Meet our engineers to go over your drawings, BOQ or motor list',
      'Installation, commissioning and maintenance by the team that built it',
      'Build your panel online and get a quotation, usually within 1–2 working days',
    ],
    faqTitle: 'Electrical panels in Bangalore / Bengaluru: questions',
    faqs: [
      { q: `Where is ${brand}'s panel factory in Bangalore?`, a: `Our works are at ${a.line1}, ${a.line2}, ${a.city} (Bangalore) ${a.pincode}, in Yelachenahalli on Kanakapura Road.`, ...mapLink },
      { q: 'Can I visit your works before ordering?', a: `Yes. You can see panels being built, inspect finished panels before dispatch and meet our engineers to discuss your project.${callToFix}` },
      { q: 'Do you install and service panels at sites in Bangalore / Bengaluru?', a: 'Yes. Along with manufacturing, our team handles installation, commissioning and maintenance of the panels we supply.' },
      { q: 'How do I get a quotation for an electrical panel in Bengaluru?', a: 'Build your panel online with our electric panel builder, or send your single-line diagram, BOQ or motor list. Our engineers reply with a quotation, usually within 1–2 working days.', link: buildLink },
    ],
    areaServed: [{ '@type': 'City', name: 'Bengaluru', alternateName: 'Bangalore' }],
  },
  {
    slug: 'karnataka',
    place: 'Karnataka',
    title: 'Electrical Panel Manufacturer in Karnataka',
    h1: 'Electrical panel manufacturer in Karnataka',
    description: `${site.name}, Bengaluru: Karnataka electrical panel manufacturer since ${est}. LT, MCC, PLC, VFD, AMF, DG synchronization and fire-fighting panels built to order for sites across Karnataka.`,
    eyebrow: 'Karnataka · Bengaluru works',
    lead: `${brand} is a Karnataka company building LT control and power distribution panels in Bengaluru since ${est}. Factories, water and sewage plants, hospitals and buildings across Karnataka get panels designed, built and factory tested at our Kanakapura Road works.`,
    typesTitle: 'Panels we build for Karnataka',
    whyEyebrow: 'Why a Karnataka manufacturer',
    whyTitle: 'Built in the state, for the state',
    why: [
      `Registered in Karnataka${gst ? ` (GSTIN ${gst})` : ''}: invoices to Karnataka customers carry CGST + SGST`,
      'Panels built to order to your ratings, drawings and preferred component make',
      'Every panel factory tested in Bengaluru before it is dispatched to your site',
      'Configure your panel online from anywhere in the state and get a quotation in 1–2 working days',
    ],
    faqTitle: 'Electrical panels in Karnataka: questions',
    faqs: [
      { q: 'Do you supply electrical panels across Karnataka?', a: `Yes. Panels are built at our works in ${a.city} and dispatched to sites anywhere in Karnataka.` },
      { q: 'Which GST applies when we order from within Karnataka?', a: `${site.legalName} is registered in Karnataka${gst ? ` (GSTIN ${gst})` : ''}, so supplies to Karnataka customers are billed with CGST + SGST. Customers in other states are billed IGST.` },
      { q: 'Can you build to the drawings from our consultant?', a: 'Yes. Send the single-line diagram, BOQ or panel specification and we build to it, with the component make you prefer.', link: { href: url('/contact/'), text: 'Send your drawings' } },
      { q: 'Can we inspect the panel before it leaves Bengaluru?', a: `Yes. Every panel is factory tested, and you are welcome to inspect it at our works before dispatch.${callToFix}` },
    ],
    areaServed: [{ '@type': 'State', name: 'Karnataka' }],
  },
  {
    slug: 'india',
    place: 'India',
    title: 'Electrical Panel Manufacturer in India',
    h1: 'Electrical panel manufacturer in India',
    description: `${site.name}: Indian electrical panel manufacturer since ${est}, based in Bengaluru. Build a custom electric panel online, or order MCC, PLC, VFD, AMF and fire-fighting panels supplied across India.`,
    eyebrow: 'Supplied across India',
    lead: `${brand} (${site.legalName}) is an Indian electrical panel manufacturer based in Bengaluru, building LT control and power distribution panels since ${est}. Customers anywhere in India can configure a panel online, get a quotation and have it built, factory tested and dispatched to site.`,
    typesTitle: 'Panels we supply across India',
    whyEyebrow: 'Ordering from anywhere in India',
    whyTitle: 'Order online, built and tested in Bengaluru',
    why: [
      'Free online electric panel builder: choose every component and make from anywhere in India',
      'One quotation for all your panels, usually within 1–2 working days',
      'Built to order to Indian 415 V / 440 V, 50 Hz supply, factory tested before dispatch',
      'GST invoices: IGST for customers outside Karnataka, CGST + SGST within Karnataka',
    ],
    faqTitle: 'Ordering electrical panels in India: questions',
    faqs: [
      { q: 'Do you supply electrical panels across India?', a: `Yes. Panels are built at our works in ${a.city}, Karnataka and supplied to customers across India.` },
      { q: 'How do I order a panel from another state?', a: 'Build your panel online with our electric panel builder, or email your single-line diagram, BOQ or motor list through our contact page. We send a quotation, usually within 1–2 working days, and dispatch the panel after factory testing.', link: buildLink },
      { q: 'Is the online electric panel builder available all over India?', a: 'Yes. It runs in any web browser. Create a free account, verify your email and start configuring.' },
      { q: 'Which supply systems do your panels work on?', a: 'Our standard panels are built for Indian 415 V / 440 V three-phase, 50 Hz supply. Single-phase 230 V and other systems can be specified in the builder.' },
    ],
    areaServed: [{ '@type': 'Country', name: 'India' }],
  },
];

export const regionHref = (slug: string) => `/electrical-panel-manufacturer-${slug}/`;
