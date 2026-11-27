import site from '../data/site.json';

/** Extra named contacts (e.g. a second director) from Site settings, with ready-made links. */
export interface Contact { name: string; role?: string; phone: string; whatsapp?: boolean; tel: string; wa?: string }

export const extraContacts: Contact[] = (((site as any).contacts ?? []) as any[])
  .filter((c) => c?.name && c?.phone)
  .map((c) => ({
    name: c.name,
    role: c.role || undefined,
    phone: c.phone,
    whatsapp: !!c.whatsapp,
    tel: `tel:${String(c.phone).replace(/\s/g, '')}`,
    wa: c.whatsapp ? `https://wa.me/${String(c.phone).replace(/\D/g, '')}` : undefined,
  }));

/** "Rajshekar (Director) on +91 98450 79640 (also on WhatsApp)" */
export const contactLine = (c: Contact) => `${c.name}${c.role ? ` (${c.role})` : ''} on ${c.phone}${c.whatsapp ? ' (also on WhatsApp)' : ''}`;
