---
title: "How to choose an AMF panel for your DG set"
description: "An AMF panel starts your generator when grid power fails and changes the load over. What it does, how to size it and what to specify before you buy."
date: 2026-11-25
image: /uploads/panels/amf-panel-15ka-1.webp
imageAlt: "AMF panel for automatic DG changeover"
topics: [amf-panel, dg-synchronization-panel]
faqs:
  - q: "What is the difference between an AMF panel and an ATS?"
    a: "An ATS (automatic transfer switch) only changes the load between two sources. An AMF panel also senses the mains failure, starts and stops the DG, protects the engine and alternator, and then does the changeover."
  - q: "How do I find the current rating for an AMF panel?"
    a: "Start from the DG's full-load current. At 415 V three phase, it is roughly 1.39 A per kVA, so a 250 kVA DG is about 348 A. Choose the changeover and busbars at or above that, with the fault level of the site in mind."
  - q: "Can the AMF panel start the DG on a schedule for testing?"
    a: "Most AMF controllers have an exercise timer that runs the DG off-load (or on-load, if you choose) at set intervals, which helps keep the set and its battery healthy."
  - q: "Why does the DG keep running for a few minutes after the mains comes back?"
    a: "That is the cool-down period. The load goes back to the mains first, and the engine runs without load for a few minutes before it stops, which is better for the engine."
---

Power cuts are still part of life for many factories, hospitals, apartments and offices in India. An **AMF (automatic mains failure) panel** makes the switch to your diesel generator without anyone having to run to the DG room.

## What an AMF panel does

The panel's controller watches the incoming mains on all three phases. When the supply fails or goes outside limits, it runs this sequence:

1. **Mains failure detected:** under or over voltage, under or over frequency, phase failure or phase reversal.
2. **Start delay:** a few seconds' wait, so a brief dip does not start the DG unnecessarily.
3. **Engine start:** it cranks the DG, retrying a set number of times if it fails to start.
4. **Warm-up and transfer:** once voltage and frequency are stable, it opens the mains side and closes the DG side.
5. **Mains returns:** it waits through a **return delay** to make sure the supply is stable.
6. **Transfer back:** the load goes back to mains.
7. **Cool-down and stop:** the DG runs without load for a few minutes, then shuts down.

The panel also **protects the DG** throughout: low oil pressure, high water temperature, over-speed, fail to start, battery and charging faults, alternator over-current and earth fault, depending on the controller and engine.

## The main parts

- **AMF controller:** the brain. It senses the mains and DG, runs the start/stop sequence, shows the readings and logs alarms.
- **Changeover:** contactors, motorised MCCBs or ACBs, or an automatic transfer switch. Mains and DG must be **interlocked electrically and mechanically** so they can never be connected together, which would back-feed the grid and damage the DG.
- **Busbars and breakers** rated for the DG's full-load current and the site's fault level.
- **Battery charger** to keep the DG starting battery topped up.
- **Metering:** voltage, current, frequency, kW and kWh for both sources on most modern controllers.

## How to size an AMF panel

Start from the **DG rating in kVA**. At 415 V, three phase:

> Full-load current ≈ kVA × 1.39 A

| DG rating | Approximate full-load current at 415 V |
|---|---|
| 62.5 kVA | 87 A |
| 125 kVA | 174 A |
| 250 kVA | 348 A |
| 500 kVA | 696 A |
| 1010 kVA | 1405 A |

Choose the changeover device and busbars **at or above** this current, from the standard ratings your preferred make offers, and check the **short-circuit (kA) rating** against your site's fault level. If the mains side feeds a bigger load than the DG can carry, the panel may also need **load shedding**, so that only essential feeders stay on DG.

## What to specify when you ask for a quotation

- DG rating (kVA) and engine/controller make, if the DG is already bought
- Supply voltage and number of incomers (one mains, one DG; or more)
- Changeover type: contactor, motorised MCCB/ACB, or ATS
- Outgoing feeders and their ratings, if the AMF panel also distributes
- Any essential/non-essential load split
- Metering and remote monitoring needs
- Enclosure: indoor or outdoor, and the IP rating

## AMF or DG synchronization?

An AMF panel handles **one DG** taking over from the grid. If one DG is not enough for your load, or you want a standby set for redundancy, you need a **DG synchronization panel**, which runs two or more DGs in parallel and shares the load between them. See [what a DG synchronization panel is](/articles/what-is-a-dg-synchronization-panel/).

## How we can help

We build AMF panels at our Bengaluru works, factory tested before dispatch. To get a price, enter your DG rating and feeders in the [online panel builder](/build/?app=generator), or send your requirement through the [contact page](/contact/).

See also: [AMF panels](/amf-panel-manufacturer/) · [DG synchronization panels](/dg-synchronization-panel-manufacturer/)
