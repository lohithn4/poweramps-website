/**
 * Search landing pages, one per panel type people search for ("MCC panel manufacturer", "AMF panel" …).
 * Each becomes /<slug>-manufacturer/ and lists the matching catalogue panels.
 *
 * Keep every claim true: only facts already shown elsewhere on the site
 * (since 2008, Bengaluru works, factory tested, dispatch 3–7 days, installation & service)
 * or in the panels' own specifications.
 */
export interface PanelType {
  slug: string; // URL: /<slug>-manufacturer/
  name: string; // "MCC Panel"
  short: string; // nav label, "MCC panels"
  h1: string;
  title: string; // <title> (site name is appended)
  description: string; // meta description, ~150 chars
  lead: string;
  what: string; // "What is …" paragraph
  build: string[]; // what we build / options
  uses: string[]; // where it is used
  faqs: { q: string; a: string }[];
  panels: string[]; // catalogue panel ids shown on the page
  app: string; // builder application id (/build/?app=…)
  related: string[]; // other type slugs
  umbrella?: true; // general page (LT panels, control panels): kept out of the per-type lists
}

export const PANEL_TYPES: PanelType[] = [
  {
    slug: 'lt-panel',
    name: 'LT Panel',
    short: 'LT panels',
    h1: 'LT Panel Manufacturer in Bengaluru',
    title: 'LT Panel Manufacturer in Bengaluru, India',
    description: 'LT electrical panel manufacturer in Bengaluru since 2008: MCC, PLC, VFD, AMF, DG sync, fire-fighting and power distribution panels, tested in-house.',
    lead: 'We design, build, test and install low-voltage (415 V) control and power distribution panels for factories, water and sewage plants, hospitals, data centres, IT parks and residential towers across India, from our works on Kanakapura Road, Bengaluru.',
    what: 'An LT (low tension) panel is the switchboard that receives power at low voltage, typically 415 V three phase, and distributes, controls and protects it for motors, lighting, HVAC and other loads. Depending on the job it can be a main distribution board, a motor control centre, a generator changeover panel or a dedicated control panel for a pump, plant or machine.',
    build: [
      'Motor control centres (MCC) with DOL, star-delta, soft-starter and VFD feeders',
      'PLC / HMI automation panels with SCADA connectivity',
      'AMF and DG synchronization panels for standby generators',
      'Fire pump, booster and fire-fighting control panels',
      'UPS distribution, remote power panels, PDUs and bus duct tap-off boxes',
      'STP, ETP and RO plant control panels',
    ],
    uses: ['Manufacturing plants', 'Water & wastewater plants', 'Hospitals & pharma', 'Data centres & IT parks', 'Residential towers & commercial buildings', 'Hotels, malls & warehouses'],
    faqs: [
      { q: 'What voltage do your LT panels work at?', a: 'Our standard panels are built for 415 V / 440 V, three phase, 50 Hz supply, with busbar ratings up to 6300 A and short-circuit ratings up to 35 kA depending on the panel.' },
      { q: 'Can you build a panel to our own drawings and component make?', a: 'Yes. Every panel is built to order to your ratings, single-line diagram and preferred component make. You can also configure one online with our panel builder and get a quotation.' },
      { q: 'Are panels tested before dispatch?', a: 'Yes, every panel is factory tested before it leaves our Bengaluru works.' },
      { q: 'Do you supply outside Bengaluru?', a: 'Yes. We are based in Bengaluru and supply panels to sites across India. Installation and service are available.' },
    ],
    panels: ['mcc-panel-25ka', 'amf-panel-15ka', 'dg-synchronization-panel-25ka', 'fire-pump-control-panel', 'ups-distribution-panel', 'plc-control-panel-5hp'],
    app: 'other',
    related: ['control-panel', 'mcc-panel', 'amf-panel', 'dg-synchronization-panel', 'fire-fighting-panel', 'power-distribution-panel'],
    umbrella: true,
  },
  {
    slug: 'control-panel',
    name: 'Electrical Control Panel',
    short: 'control panels',
    h1: 'Electrical Control Panel Manufacturer in Bengaluru',
    title: 'Control Panel Manufacturer in Bangalore / Bengaluru',
    description: 'Electrical control panel and panel board manufacturer in Bengaluru (Bangalore) since 2008: PLC, VFD, MCC, AMF, fire pump, STP and RO panels.',
    lead: 'Electric control panels and control panel boards for motors, pumps, generators, machines and plants, designed, wired and factory tested at our works on Kanakapura Road, Bengaluru, and supplied across India.',
    what: 'An electrical control panel (also called a control panel board or electric control panel) houses the switchgear, starters, relays, controllers and indication that run and protect a piece of equipment: a motor, a pump set, a generator, a treatment plant or a machine. It can be a simple starter panel, a PLC automation panel, a VFD speed-control panel or a full motor control centre.',
    build: [
      'PLC / HMI automation panels with SCADA connectivity',
      'VFD and soft-starter panels for pumps, fans and conveyors',
      'MCC panels with DOL, star-delta, soft-starter and VFD feeders',
      'AMF and DG synchronization panels for standby generators',
      'Fire pump, jockey and booster pump control panels',
      'STP, ETP and RO plant control panels',
    ],
    uses: ['Manufacturing plants & machines', 'Pumping stations', 'Water, STP & RO plants', 'Generator rooms', 'Fire-fighting systems', 'HVAC & building services'],
    faqs: [
      { q: 'Is a control panel the same as an electrical panel board?', a: 'The terms overlap. "Electrical panel board" usually means any switchboard that distributes power, while a control panel runs and protects specific equipment such as motors, pumps or generators. We build both: control panels and LT power distribution panels.' },
      { q: 'Which control panels do you make?', a: 'PLC, VFD, MCC, AMF, DG synchronization, fire pump, STP and RO control panels, each built to order to your ratings, drawings and preferred component make.' },
      { q: 'Can you build a control panel for our machine or plant?', a: 'Yes. Send your single-line diagram, motor list or I/O list, or configure the panel online with our panel builder, and we will send a quotation, usually within 1–2 working days.' },
      { q: 'Are control panels tested before dispatch?', a: 'Yes. Every panel is wired, checked and function tested at our Bengaluru works before it is dispatched.' },
    ],
    panels: ['plc-control-panel-5hp', 'vfd-control-panel-5hp', 'mcc-panel-25ka', 'amf-panel-15ka', 'fire-pump-control-panel', 'stp-control-panel-3hp', 'ro-plant-control-panel-5hp'],
    app: 'other',
    related: ['plc-control-panel', 'vfd-panel', 'mcc-panel', 'amf-panel', 'fire-fighting-panel', 'stp-ro-control-panel', 'lt-panel'],
    umbrella: true,
  },
  {
    slug: 'mcc-panel',
    name: 'MCC Panel',
    short: 'MCC panels',
    h1: 'MCC Panel Manufacturer in Bengaluru',
    title: 'MCC Panel Manufacturer in Bengaluru',
    description: 'Motor control centre (MCC) panels built in Bengaluru: 415 V, busbars up to 6300 A, 25 kA, DOL, star-delta, soft-starter and VFD feeders. Factory tested.',
    lead: 'Motor control centre panels that start, protect and monitor all the motors on a site from one place, built to your feeder list and component make at our Bengaluru works.',
    what: 'An MCC (motor control centre) panel groups the starters for many motors into one switchboard. A common incomer feeds a busbar, and each motor gets its own feeder with protection (MCCB or MPCB), a starter (DOL, star-delta, soft starter or VFD), an overload relay and indication, so operators can control and monitor every motor centrally.',
    build: [
      '415 V AC, three phase, 50 Hz; busbars up to 6300 A, short-circuit rating up to 25 kA',
      'DOL, star-delta, soft-starter and VFD motor feeders',
      'Fixed or draw-out construction, Form 1 to higher forms of separation',
      'Copper or aluminium busbars, CRCA / MS powder-coated enclosures',
      'Metering, indication and PLC / SCADA interfacing on request',
    ],
    uses: ['Pumping stations', 'Process plants', 'HVAC plant rooms', 'Conveyors & material handling', 'Water & sewage treatment'],
    faqs: [
      { q: 'What is the difference between an MCC and a PCC panel?', a: 'A PCC (power control centre) distributes power to large feeders and sub-panels, while an MCC controls and protects individual motors with their own starters. Many sites use a PCC upstream feeding one or more MCCs.' },
      { q: 'Which starters can an MCC feeder have?', a: 'DOL for small motors, star-delta for larger ones, and soft starters or VFDs where you need a smooth start or speed control. We mix feeder types in the same MCC to suit each motor.' },
      { q: 'Can the MCC be connected to a PLC or SCADA?', a: 'Yes. Feeder status, trip and run signals can be wired to a PLC, and the MCC can be supplied with a PLC / HMI section and Modbus or Ethernet communication.' },
      { q: 'How long does an MCC panel take?', a: 'Standard panels typically dispatch in 3 to 7 days; larger custom MCCs depend on the feeder count and approvals. Ask for a quotation and we will confirm the schedule.' },
    ],
    panels: ['mcc-panel-25ka', 'vfd-control-panel-5hp', 'plc-control-panel-5hp'],
    app: 'motor',
    related: ['vfd-panel', 'plc-control-panel', 'lt-panel', 'stp-ro-control-panel'],
  },
  {
    slug: 'plc-control-panel',
    name: 'PLC Control Panel',
    short: 'PLC panels',
    h1: 'PLC Control Panel Manufacturer in Bengaluru',
    title: 'PLC Control Panel Manufacturer in Bengaluru',
    description: 'PLC and HMI automation panels built in Bengaluru with Siemens, Schneider, Allen Bradley, Delta, Mitsubishi, ABB or Omron PLCs and Modbus, Ethernet or Profibus links.',
    lead: 'PLC and HMI automation panels for industrial and utility processes, built on the PLC platform you prefer and ready to connect to SCADA.',
    what: 'A PLC control panel houses a programmable logic controller, its I/O modules, power supplies, relays and often an HMI touch screen. It reads sensors and switches, runs the control logic and drives motors, valves and alarms automatically, replacing hard-wired relay logic and giving operators a clear screen to run the process.',
    build: [
      'PLC platforms: Siemens, Schneider, Allen Bradley, Delta, Mitsubishi, ABB, Omron',
      'Up to 32 I/O in standard builds; larger systems on request',
      'Modbus RTU / TCP as standard; Ethernet, Profibus, Profinet, BACnet on request',
      'HMI touch screens, SCADA and BMS connectivity',
      'IP42 mild-steel powder-coated enclosures (higher IP on request)',
    ],
    uses: ['Process automation', 'Water & wastewater plants', 'Packaging & machine control', 'Building management', 'Utilities'],
    faqs: [
      { q: 'Which PLC brands do you use?', a: 'We build on Siemens, Schneider, Allen Bradley, Delta, Mitsubishi, ABB and Omron PLCs, so the panel matches the platform your plant already uses.' },
      { q: 'Can the PLC panel talk to our SCADA or BMS?', a: 'Yes. Modbus RTU / TCP is standard, and Ethernet, Profibus, Profinet or BACnet can be added to connect to SCADA or a building management system.' },
      { q: 'Do you also supply the motor starters?', a: 'Yes. The PLC section can be combined with MCC or VFD feeders in one panel, or supplied separately to control an existing MCC.' },
    ],
    panels: ['plc-control-panel-5hp', 'ro-plant-control-panel-5hp', 'stp-control-panel-3hp'],
    app: 'automation',
    related: ['vfd-panel', 'mcc-panel', 'stp-ro-control-panel'],
  },
  {
    slug: 'vfd-panel',
    name: 'VFD Panel',
    short: 'VFD panels',
    h1: 'VFD Panel Manufacturer in Bengaluru',
    title: 'VFD Panel Manufacturer in Bengaluru',
    description: 'VFD control panels built in Bengaluru for pumps, fans, blowers and conveyors, with ABB, Schneider, Siemens, Danfoss, Delta, INVT, Fuji or Yaskawa drives.',
    lead: 'Variable frequency drive panels for speed control, energy saving and motor protection on pumps, fans, blowers and conveyors.',
    what: 'A VFD panel houses a variable frequency drive with its incoming protection, line reactor or filters, cooling and controls. The drive changes the motor speed by changing the supply frequency, giving a soft start, accurate speed control and large energy savings on pumps and fans that do not need to run at full speed all the time.',
    build: [
      'Drive makes: ABB, Schneider, Siemens, Danfoss, Delta, INVT, Fuji, Yaskawa',
      '415 V three-phase input; motor ratings from 5 HP upwards',
      'Automatic control from pressure, flow or level signals; local / remote selection',
      'Floor-mounted powder-coated enclosures with forced ventilation',
      'Bypass starters, harmonic filters and PLC interfacing on request',
    ],
    uses: ['Booster & transfer pumps', 'Cooling-tower & AHU fans', 'Blowers in STPs', 'Conveyors', 'Compressors'],
    faqs: [
      { q: 'How much energy can a VFD save?', a: 'On centrifugal pumps and fans, power falls sharply as speed falls, so running at reduced speed instead of throttling can save a large share of the energy. The actual saving depends on how much of the time the load runs below full flow.' },
      { q: 'Which drive brands can you use?', a: 'ABB, Schneider, Siemens, Danfoss, Delta, INVT, Fuji and Yaskawa. We can match the make already used on your site.' },
      { q: 'Can one panel run several motors?', a: 'Yes. We build multi-drive panels and MCCs with VFD feeders where several motors need speed control.' },
    ],
    panels: ['vfd-control-panel-5hp', 'mcc-panel-25ka', 'stp-control-panel-3hp'],
    app: 'automation',
    related: ['mcc-panel', 'plc-control-panel', 'stp-ro-control-panel'],
  },
  {
    slug: 'amf-panel',
    name: 'AMF Panel',
    short: 'AMF panels',
    h1: 'AMF Panel Manufacturer in Bengaluru',
    title: 'AMF Panel Manufacturer in Bengaluru',
    description: 'Fully automatic AMF panels built in Bengaluru: 440 V, 100 A, 15–16 kA, Micromann GC09 controller. Starts the DG and transfers load when mains power fails.',
    lead: 'Automatic mains failure panels that start your diesel generator and switch the load over the moment grid power fails, then switch back when it returns.',
    what: 'An AMF (automatic mains failure) panel watches the incoming mains supply. When the mains fails or goes out of limits, its controller starts the generator, waits for stable voltage and frequency and transfers the load to the DG. When the mains is healthy again it transfers the load back and stops the generator after a cool-down, with no one needing to operate it.',
    build: [
      '440 V three phase, 100 A standard, 15 kA and 16 kA short-circuit ratings',
      'Micromann GC09 AMF controller with engine protection and metering',
      'Mains / DG changeover with contactors or motorised breakers',
      'Floor-mounted panels for industrial and commercial generators',
      'Battery charger and remote monitoring on request',
    ],
    uses: ['Factories', 'Hospitals', 'Apartment complexes', 'Commercial buildings', 'Telecom & IT sites'],
    faqs: [
      { q: 'What does an AMF panel do?', a: 'It starts the generator automatically when mains power fails, transfers the load to the DG, and switches back and stops the generator when mains power returns.' },
      { q: 'What is the difference between an AMF panel and a DG synchronization panel?', a: 'An AMF panel switches one generator in when the mains fails. A synchronization panel runs two or more generators in parallel, matching voltage, frequency and phase and sharing the load between them.' },
      { q: 'Which controller do you use?', a: 'Our standard AMF panels use the Micromann GC09 controller. Other controller makes can be used on request.' },
    ],
    panels: ['amf-panel-15ka', 'amf-panel-16ka', 'battery-charger-24v'],
    app: 'generator',
    related: ['dg-synchronization-panel', 'lt-panel', 'power-distribution-panel'],
  },
  {
    slug: 'dg-synchronization-panel',
    name: 'DG Synchronization Panel',
    short: 'DG synchronization panels',
    h1: 'DG Synchronization Panel Manufacturer in Bengaluru',
    title: 'DG Synchronization Panel Manufacturer, Bengaluru',
    description: 'DG synchronization panels built in Bengaluru to run diesel generators in parallel with automatic load sharing: 415 V, busbars up to 6300 A, 25 kA and 35 kA.',
    lead: 'Synchronization panels that run two or more diesel generators in parallel, matching voltage, frequency and phase and sharing the load automatically.',
    what: 'A DG synchronization panel lets several generators feed one common busbar. Its controllers adjust each generator until voltage, frequency and phase angle match, close it onto the bus, and then share the load between the sets. This gives more capacity and redundancy than one large generator, and lets sets be added or removed as the load changes.',
    build: [
      '415 V, three phase, 50 Hz; busbars up to 6300 A',
      'Short-circuit ratings of 25 kA and 35 kA',
      'Two or more DG sets with automatic synchronizing and load sharing',
      'CRCA steel floor-mounted construction, copper or aluminium busbars',
      'Mains paralleling and AMF functions on request',
    ],
    uses: ['Large factories', 'Hospitals', 'Data centres', 'IT parks', 'Malls & large commercial buildings'],
    faqs: [
      { q: 'Why synchronize generators instead of using one large DG?', a: 'Parallel sets give redundancy (the load stays on if one set trips), better fuel economy at part load because sets can be switched off, and room to add capacity later.' },
      { q: 'How many generators can be synchronized?', a: 'Our standard panels are built for two DG sets; panels for more sets are built to order.' },
      { q: 'What short-circuit ratings do you offer?', a: '25 kA and 35 kA designs, with busbars up to 6300 A, depending on the site fault level.' },
    ],
    panels: ['dg-synchronization-panel-25ka', 'dg-synchronization-panel-35ka', 'amf-panel-15ka'],
    app: 'generator',
    related: ['amf-panel', 'lt-panel', 'power-distribution-panel'],
  },
  {
    slug: 'fire-fighting-panel',
    name: 'Fire Fighting Panel',
    short: 'Fire fighting panels',
    h1: 'Fire Fighting Panel Manufacturer in Bengaluru',
    title: 'Fire Fighting Panel Manufacturer in Bengaluru',
    description: 'Fire pump, booster and fire-fighting control panels built in Bengaluru for electric, diesel and jockey pumps, with pressure-switch and fire-alarm integration.',
    lead: 'Control panels for fire pumps, jockey pumps and booster pumps that keep a building\'s fire-fighting system pressurised and ready to start automatically.',
    what: 'A fire-fighting panel controls the pumps of a hydrant and sprinkler system. Pressure switches start the jockey pump to hold line pressure and start the main electric or diesel pump when a hydrant or sprinkler opens. The panel gives automatic and manual control, alarms and signalling so the system responds the moment it is needed.',
    build: [
      'Control for electric, diesel and jockey fire pumps (around 12 HP and up)',
      'Four-zone automatic booster and fire-fighting panels with remote alarm and signalling',
      'DOL, star-delta and soft-starter options; pressure-switch and fire-alarm integration',
      'IP45 MS and CRCA powder-coated enclosures',
      'Micromann EC09 controllers for diesel fire-pump engines',
    ],
    uses: ['Residential towers', 'Commercial buildings', 'Factories & warehouses', 'Hospitals', 'Hotels & malls'],
    faqs: [
      { q: 'What does a fire pump control panel include?', a: 'Starters and protection for the main and jockey pumps, pressure-switch inputs for automatic starting, manual controls, run / trip indication and alarm outputs, and for diesel pumps an engine controller.' },
      { q: 'Can the panel connect to the fire alarm system?', a: 'Yes. Pump run, fault and alarm signals can be wired to the fire alarm panel, and remote alarm and signalling are available.' },
      { q: 'Do you build panels for diesel fire pumps?', a: 'Yes. We supply Micromann EC09 engine controllers and complete diesel fire-pump control panels.' },
    ],
    panels: ['fire-pump-control-panel', 'fire-fighting-panel-3-phase', 'fire-fighting-booster-panel', 'ec09-engine-controller'],
    app: 'fire',
    related: ['lt-panel', 'amf-panel', 'mcc-panel'],
  },
  {
    slug: 'power-distribution-panel',
    name: 'Power Distribution Panel',
    short: 'UPS & distribution panels',
    h1: 'UPS & Power Distribution Panel Manufacturer in Bengaluru',
    title: 'UPS Distribution Panel Manufacturer, Bengaluru',
    description: 'UPS input/output distribution panels, remote power panels (RPP) and PDUs built in Bengaluru for data centres and critical loads: 415 V, up to 3200 A.',
    lead: 'Distribution panels that take utility and UPS power safely to critical loads, from the UPS room to the server rack.',
    what: 'UPS distribution panels manage power between the utility supply, the UPS and the critical load, with a maintenance bypass so the UPS can be serviced without a shutdown. Remote power panels (RPPs) and PDUs then distribute that conditioned power through many protected branch circuits close to the racks or equipment.',
    build: [
      'UPS input / output panels up to 3200 A with maintenance bypass, metering and surge protection',
      'Remote power panels up to 1600 A with MCB / MCCB outgoing feeders and BMS integration',
      'Floor-mounted 63 A three-phase PDUs with Indian 3-pin outlets',
      'ACB / MCCB incomers, copper or aluminium busbars, IP42 enclosures',
    ],
    uses: ['Data centres & server rooms', 'Hospitals', 'IT parks', 'Labs & equipment rooms', 'Workshops'],
    faqs: [
      { q: 'What is a remote power panel (RPP)?', a: 'An RPP is a distribution panel placed near server racks that takes UPS power and feeds many protected branch circuits, usually with metering and BMS monitoring.' },
      { q: 'Why does a UPS panel need a maintenance bypass?', a: 'The bypass lets the load run on utility power while the UPS is serviced or replaced, so critical equipment does not have to be shut down.' },
      { q: 'Can you build to our data-centre specification?', a: 'Yes. Ratings, feeder schedule, metering and component make are built to your specification.' },
    ],
    panels: ['ups-distribution-panel', 'remote-power-panel', 'power-distribution-unit'],
    app: 'distribution',
    related: ['bus-duct-tap-off-box', 'lt-panel', 'dg-synchronization-panel'],
  },
  {
    slug: 'bus-duct-tap-off-box',
    name: 'Bus Duct Tap-Off Box',
    short: 'Bus duct tap-off boxes',
    h1: 'Bus Duct Tap-Off Box Manufacturer in Bengaluru',
    title: 'Bus Duct Tap-Off Box Manufacturer, Bengaluru',
    description: 'Plug-in tap-off boxes for sandwich bus duct, built in Bengaluru: 415 / 440 V, 800 A, MCCB, MCB or fuse-switch protection, IP42, indoor and outdoor.',
    lead: 'Plug-in tap-off boxes that take power from sandwich busbar trunking to downstream loads, with MCCB, MCB or fuse-switch protection.',
    what: 'A tap-off box plugs into a bus duct (busbar trunking) run and takes power off it to feed a local load, such as a floor distribution board or a machine. It contains the protective device and connection to the busbars, so loads can be added or moved along the bus duct without rewiring.',
    build: [
      '415 V and 440 V, three phase, 50 Hz; 800 A ratings',
      'For aluminium or copper sandwich bus duct, 3 pole',
      'MCCB, MCB or fuse-switch protection',
      'CRCA / MS powder-coated enclosures, IP42, indoor and outdoor versions',
    ],
    uses: ['High-rise buildings', 'Factories', 'Commercial complexes', 'Data centres'],
    faqs: [
      { q: 'What is a bus duct tap-off box used for?', a: 'It takes power from a bus duct run to feed a local load or distribution board, with its own protective device.' },
      { q: 'Which protection can the tap-off box have?', a: 'MCCB, MCB or fuse-switch protection, chosen to suit the downstream load.' },
      { q: 'Are outdoor versions available?', a: 'Yes, tap-off boxes are available for indoor and outdoor installation.' },
    ],
    panels: ['bus-duct-tap-off-box-415v', 'bus-duct-tap-off-box-440v'],
    app: 'distribution',
    related: ['power-distribution-panel', 'lt-panel'],
  },
  {
    slug: 'stp-ro-control-panel',
    name: 'STP & RO Control Panel',
    short: 'STP & RO control panels',
    h1: 'STP & RO Plant Control Panel Manufacturer in Bengaluru',
    title: 'STP & RO Control Panel Manufacturer, Bengaluru',
    description: 'Fully automatic STP and RO plant control panels built in Bengaluru: pumps, blowers, agitators and dosing on level and timer logic, VFD optional.',
    lead: 'Automatic control panels for sewage treatment and RO plants that run pumps, blowers, agitators and dosing on level and timer logic.',
    what: 'An STP or RO control panel runs a treatment plant without constant supervision. Level sensors and timers start and stop the feed, transfer and high-pressure pumps, blowers and dosing pumps in sequence, with protection for every motor and alarms for faults such as dry run or high level.',
    build: [
      'STP panels for MBBR plants: pumps, blowers, agitators and dosing on level and timer logic',
      'RO plant panels up to 500 LPH: high-pressure, feed, transfer and dosing pumps',
      'DOL starters as standard; VFD optional',
      'Manual / automatic control, floor-mounted CRCA / MS enclosures',
    ],
    uses: ['Apartment STPs', 'Commercial buildings', 'Factories (ETP / STP)', 'RO plants for drinking & process water'],
    faqs: [
      { q: 'Can the STP panel run fully automatically?', a: 'Yes. Pumps, blowers, agitators and dosing run on level and timer logic, with manual override for maintenance.' },
      { q: 'Can a VFD be added to the blower or pump?', a: 'Yes, VFD integration is optional for blowers and pumps to save energy and control flow.' },
      { q: 'Do you build RO panels for larger plants?', a: 'Our standard RO panel covers plants up to 500 LPH; larger plants are built to order.' },
    ],
    panels: ['stp-control-panel-3hp', 'ro-plant-control-panel-5hp', 'plc-control-panel-5hp'],
    app: 'water',
    related: ['plc-control-panel', 'vfd-panel', 'mcc-panel'],
  },
];

export const typeHref = (slug: string) => `/${slug}-manufacturer/`;
export const typeBySlug = new Map(PANEL_TYPES.map((t) => [t.slug, t]));
/** Best landing page for a catalogue panel (used for links from panel pages). */
/** Panel types with their own product range (not the general LT / control panel pages). */
export const SPECIFIC_TYPES = PANEL_TYPES.filter((t) => !t.umbrella);
export const typeForPanel = (panelId: string) => SPECIFIC_TYPES.find((t) => t.panels[0] === panelId) ?? SPECIFIC_TYPES.find((t) => t.panels.includes(panelId));
