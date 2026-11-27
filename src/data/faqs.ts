/**
 * Site-wide FAQs (home page) and panel-builder FAQs (/build/).
 * Shown as visible accordions AND emitted as FAQPage structured data, so the
 * questions people type into Google ("what is <brand>", "build a custom
 * electric panel online") have a direct, crawlable answer on the site.
 * Keep every answer true: it is published as the company's own statement.
 */
import site from './site.json';
import { PANEL_TYPES, typeHref } from './panel-types';
import { url } from '../lib/url';
import { extraContacts, contactLine, whatsappOwner } from '../lib/contacts';

export interface Faq {
  q: string;
  a: string; // plain text: also used in structured data
  link?: { href: string; text: string }; // shown after the answer on the page only
}

const brand = (site as any).shortName || site.name;
const a = site.address;
// "MCC panels, PLC panels, … and STP & RO control panels" (acronyms kept in capitals)
const types = PANEL_TYPES.filter((t) => t.slug !== 'lt-panel').map((t) => {
  const [first, ...rest] = t.short.split(' ');
  return [first === first.toUpperCase() ? first : first.toLowerCase(), ...rest].join(' ');
});
const typeList = `${types.slice(0, -1).join(', ')} and ${types[types.length - 1]}`;
const domain = (() => {
  try { return new URL(import.meta.env.SITE).host.replace(/^www\./, ''); } catch { return 'poweramps.in'; }
})();

export const siteFaqs: Faq[] = [
  {
    q: `What is ${brand}?`,
    a: `${brand} (${site.legalName}) is an electric panel builder and manufacturer in ${a.city}, ${a.state}, building LT control and power distribution panels since ${site.established}. We design, fabricate, test and install panels for factories, water plants, hospitals, data centres and buildings across India.`,
    link: { href: url('/about/'), text: `About ${brand}` },
  },
  {
    q: `Is ${brand} the same as the Poweramp music app?`,
    a: `No. ${brand}, spelt with an "s", is ${site.legalName}, an electrical panel manufacturer in ${a.city} (Bangalore). We are not connected with the Poweramp music player app. Our website is ${domain}.`,
  },
  {
    q: `Can I build a custom electric panel online at ${brand}?`,
    a: `Yes. Our online panel builder at ${domain}/build lets you pick what the panel is for, list your motors or feeders, and choose every component and make. Ratings are calculated and the panel is drawn as you go. Send it to us and our engineers reply with a quotation, usually within 1–2 days.`,
    link: { href: url('/build/'), text: 'Build your panel online' },
  },
  {
    q: 'Is the online panel builder free to use?',
    a: 'Yes. You create a free account, verify your email and start building. There is nothing to pay to configure panels or to ask for a quotation.',
  },
  {
    q: `Which electrical panels does ${brand} manufacture?`,
    a: `We manufacture ${typeList}, along with remote power panels, battery chargers and engine controllers. Every panel is built to order to your ratings.`,
    link: { href: url('/panels/'), text: 'See all panels' },
  },
  {
    q: 'Can you build a panel to our own drawings and component make?',
    a: 'Yes. Send your single-line diagram, BOQ or motor list and we build the panel to it, with the component make you prefer.',
    link: { href: url('/contact/'), text: 'Send your drawings' },
  },
  {
    q: 'Are panels tested before dispatch?',
    a: `Yes. Every panel is factory tested at our ${a.city} works before it is dispatched.`,
  },
  {
    q: 'Do you supply panels outside Bangalore / Bengaluru?',
    a: `Yes. Panels are built in ${a.city} and supplied across Karnataka and India. We also handle installation, commissioning and maintenance.`,
    link: { href: url('/electrical-panel-manufacturer-india/'), text: 'Ordering from anywhere in India' },
  },
  {
    q: `Where is ${brand} located?`,
    a: `Our works are at ${a.line1}, ${a.line2}, ${a.city} (Bangalore), ${a.state} ${a.pincode}.`,
    ...(site.map?.link ? { link: { href: site.map.link, text: 'Open in Google Maps' } } : {}),
  },
  {
    q: `How do I contact ${brand} for a quotation?`,
    a: [
      'Build your panel online, or send your requirements through the enquiry form on our contact page.',
      site.phone ? `You can also call ${site.contactName ? `${site.contactName}${site.contactRole ? ` (${site.contactRole})` : ''} on ` : ''}${site.phone}.` : '',
      ...extraContacts.map((c) => `Or call ${contactLine(c)}.`),
      site.whatsapp && !whatsappOwner ? `WhatsApp: ${site.whatsapp}.` : '',
      site.email ? `Email: ${site.email}.` : '',
    ].filter(Boolean).join(' '),
    link: { href: url('/contact/'), text: 'Contact us' },
  },
];

export const builderFaqs: Faq[] = [
  {
    q: 'How do I build a custom electric panel online?',
    a: 'Create a free account and verify your email. Then choose what the panel is for (motor control, water and wastewater, automation, generator backup, fire fighting or power distribution), add your loads, pick each component and make, and enter your project details. Review it and send the enquiry.',
  },
  {
    q: 'What happens after I send my panel?',
    a: `Our engineers in ${a.city} check the configuration and come back with a quotation, usually within 1–2 days. You can track the request in your account and place the order from there.`,
  },
  {
    q: 'Can I configure more than one panel?',
    a: 'Yes. Save several panels in your account and send them together to get one quotation for the whole job.',
  },
  {
    q: 'What if I am not sure which panel I need?',
    a: 'Choose "Something else / not sure" and describe the job in your own words, or send us your single-line diagram or motor list. Our engineers will design the panel for you.',
    link: { href: url('/contact/'), text: 'Send an enquiry instead' },
  },
  {
    q: 'Which panel types can I build?',
    a: `MCC and starter panels, pump and STP / RO control panels, PLC and VFD automation panels, AMF and DG synchronization panels, fire fighting panels and power distribution panels. For anything else, describe it and we will build it to order.`,
    link: { href: url(typeHref('lt-panel')), text: 'LT panels we make' },
  },
];

/** FAQPage structured-data node for a list of FAQs. */
export const faqJsonLd = (faqs: Faq[]) => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
