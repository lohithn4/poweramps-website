---
title: "What is a DG synchronization panel and when do you need one?"
description: "A DG synchronization panel runs two or more generators in parallel and shares the load. How synchronizing works, what's inside and when you need one."
date: 2026-11-24
image: /uploads/panels/dg-sync-panel-25ka-1.webp
imageAlt: "DG synchronization panel for paralleling diesel generators"
topics: [dg-synchronization-panel, amf-panel]
faqs:
  - q: "Can DG sets of different ratings be synchronized?"
    a: "Yes. With proper load-sharing control, each set takes load in proportion to its rating, so a 500 kVA and a 250 kVA DG can run together."
  - q: "Is synchronizing better than buying one big DG?"
    a: "Often, yes. You get redundancy (one set can be serviced while the other runs), better fuel use at part load, and room to add sets later. One large DG costs less to buy and is simpler, so compare both for your load profile."
  - q: "Can a DG run in parallel with the grid?"
    a: "It can be done, but it needs the electricity utility's approval and additional protection. Most Indian sites run DGs in parallel with each other only, with the grid isolated through interlocking."
  - q: "What happens if one DG trips while running in parallel?"
    a: "Its breaker opens and the remaining sets carry the load. With load management, the panel can shed non-essential feeders first, so the running sets are not overloaded."
---

When a site's backup load grows beyond what one generator can carry, or when it cannot afford to lose power during a DG breakdown, the answer is usually to run **two or more DG sets in parallel**. The **DG synchronization panel** makes that possible.

## What "synchronizing" means

Before a generator can be connected to a live bus (another running DG), four things must match:

1. **Voltage:** the same magnitude.
2. **Frequency:** the same speed, in practice within a fraction of a hertz.
3. **Phase angle:** the waveforms lined up at the instant of closing.
4. **Phase sequence:** R-Y-B on both sides. This is checked once at commissioning.

Closing the breaker when these do not match causes a violent current surge that can damage the alternator, the coupling and the switchgear. The synchronizing controller adjusts the incoming set's speed (through the governor) and voltage (through the AVR) until they match, then closes its breaker at the right moment.

## What happens after the sets are in parallel

Once connected, the generators must **share the load**:

- **Active power (kW)** is shared by controlling each engine's fuel, through its governor.
- **Reactive power (kVAR)** is shared by controlling each alternator's excitation, through its AVR.

Good load sharing keeps every set loaded in proportion to its rating, so no one engine is overloaded while another idles.

## What's inside a DG synchronization panel

- **One incomer per DG:** usually a motorised ACB or MCCB that the controller can close and open automatically.
- **A synchronizing and load-sharing controller per DG:** modern units combine auto-synchronizing, load sharing, engine protection and metering.
- **A common bus**, rated for the combined output of all sets and the site's fault level.
- **Generator protection:** reverse power, over and under voltage and frequency, over-current, earth fault and loss of excitation, typically built into the controller or added as separate relays.
- **Outgoing feeders** to the loads, or a link to the main LT panel.
- **Mains interlock or AMF logic**, so the DG bus takes over automatically when the grid fails and the two never connect by mistake.

## Load management: getting the most out of several sets

A synchronization panel can do more than keep the lights on:

- **Load-dependent start/stop:** starts the second (or third) DG only when the load needs it, and stops it when the load drops.
- **Duty rotation:** changes which set leads, so running hours stay even.
- **Load shedding:** if a set trips, drops non-essential feeders so the remaining sets are not overloaded.

Diesel engines run more efficiently near their rated load. On sites whose load swings, for example a hospital at night versus mid-day, running only the sets you need saves fuel and engine wear.

## When do you need one?

- **The load is larger than one DG.** Two 500 kVA sets in parallel can cover a 1 MVA load.
- **You need redundancy.** With N+1 sets, one can be serviced or fail without losing backup.
- **The load varies a lot.** Load-dependent start/stop keeps engines efficiently loaded.
- **You expect to grow.** Add another DG later instead of replacing a single large set.
- **You already have DGs of different sizes** and want them to work together.

If you have **one DG** taking over from the grid, an [AMF panel](/articles/how-to-choose-an-amf-panel/) is usually all you need.

## What to give your panel builder

- Number, rating (kVA) and make of the DG sets, and their engine and controller details
- Whether they will parallel with each other only, or also with the grid
- The site's fault level and the main busbar rating needed
- Outgoing feeders and any essential/non-essential split
- Whether you want load-dependent start/stop, duty rotation and remote monitoring

## How we can help

We build DG synchronization panels with busbars up to 6300 A and fault ratings up to 35 kA at our Bengaluru works. Every panel is factory tested before dispatch. Describe your DG sets in the [online panel builder](/build/?app=generator), or send your SLD through the [contact page](/contact/).

See also: [DG synchronization panels](/dg-synchronization-panel-manufacturer/) · [AMF panels](/amf-panel-manufacturer/)
