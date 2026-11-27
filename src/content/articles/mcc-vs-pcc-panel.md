---
title: "MCC vs PCC panel: what's the difference and which do you need?"
description: "A power control centre (PCC) distributes power to big feeders; a motor control centre (MCC) starts, stops and protects motors. Here's how they differ and how they fit together on an Indian industrial site."
date: 2026-11-26
image: /uploads/panels/mcc-panel-1.webp
imageAlt: "Motor control centre (MCC) panel with individual motor feeders"
topics: [mcc-panel, power-distribution-panel, lt-panel]
faqs:
  - q: "Can one panel be both a PCC and an MCC?"
    a: "Yes. On smaller sites a single PMCC (power and motor control centre) combines the incomer and distribution section with motor starter feeders in one line-up."
  - q: "Which comes first in the power chain, PCC or MCC?"
    a: "The PCC. It takes power from the transformer or DG and feeds the MCCs, distribution boards and other large loads downstream."
  - q: "What starters can an MCC feeder have?"
    a: "Direct-on-line for small motors, star-delta for medium motors, and soft starters or VFDs where you need a smooth start or speed control. One MCC can mix all of these."
  - q: "What is form of separation in an MCC or PCC?"
    a: "It describes how the inside of the panel is divided by barriers, from Form 1 (no internal separation) to Form 4 (busbars, every functional unit and its terminals separated). Higher forms let you work on one feeder while others stay live."
---

On most factory, water-plant and building projects you will see both terms in the single-line diagram: a **PCC** near the transformer and one or more **MCCs** around the plant. They are both LT (low-tension) switchboards and can look similar from the front, but they do different jobs.

## The short answer

- A **PCC (power control centre)** receives power from the transformer and/or DG set and **distributes** it to large outgoing feeders: MCCs, lighting and power distribution boards, HVAC panels, capacitor panels.
- An **MCC (motor control centre)** receives power from the PCC and **controls and protects individual motors**, each with its own starter feeder.

Think of the PCC as the main road junction and the MCC as the set of driveways to each machine.

## Side-by-side comparison

| | PCC (power control centre) | MCC (motor control centre) |
|---|---|---|
| Main job | Receive and distribute bulk power | Start, stop and protect motors |
| Fed from | Transformer, DG set, or both | The PCC (or a main distribution board) |
| Typical incomer | ACB (air circuit breaker), sometimes with DG changeover | ACB or MCCB |
| Typical outgoing feeders | ACBs and MCCBs to sub-panels and large loads | Motor feeders: breaker or MPCB, contactor, overload relay, plus starter |
| Busbar rating | High: often thousands of amps | Lower than the upstream PCC |
| Metering | Incomer metering, often power-quality metering, sometimes APFC | Ammeter and run/trip indication per motor |
| Controls | Few: mostly switching and protection | Many: push buttons, selector switches, interlocks, PLC signals |

## What goes into an MCC feeder

Each motor gets its own feeder, sized to the motor. A typical feeder has:

1. **Short-circuit protection:** an MPCB or MCCB.
2. **Switching:** one or more contactors.
3. **Overload protection:** a thermal or electronic overload relay (or a motor protection relay on larger motors).
4. **The starter arrangement:** DOL for small motors, star-delta for medium motors, soft starter or VFD where a smooth start or speed control is needed.
5. **Indication and control:** ON/OFF/TRIP lamps, start/stop buttons, Auto/Manual selector, and terminals for remote or PLC control.

Because motors are spread across a plant, MCCs are often placed close to the loads they serve to keep cable runs short.

## What goes into a PCC

A PCC is built around high current and high fault level:

- **Incomers** from the transformer and DG, usually ACBs, with **interlocking** so the two sources are never connected together by mistake.
- **Main busbars** rated for the full site load and the prospective short-circuit current.
- **Outgoing feeders** to each MCC, PDB and large load.
- **Metering** on the incomer, and often an **APFC** (automatic power factor correction) panel connected alongside.

## Form of separation

Both PCCs and MCCs are specified with a **form of separation** under IS/IEC 61439: from Form 1 (no internal barriers) through Forms 2, 3 and 4 (progressively more separation between busbars, functional units and terminals). A Form 3b or Form 4 MCC lets maintenance staff work on one feeder while the rest of the plant keeps running. That matters on continuous-process sites, but it costs more space and money. Specify what your operation actually needs.

## Which do you need?

- **Small site, a handful of motors:** a single **PMCC**, one panel with an incomer, distribution and motor feeders, is usually the most economical.
- **Medium to large site:** a **PCC** at the transformer room feeding **separate MCCs** near each process area, plus lighting and power distribution boards.
- **Adding machines to an existing plant:** usually a **new MCC** fed from a spare feeder on the existing PCC. Check the PCC has the spare capacity and fault rating first.

## How we can help

We build MCCs with DOL, star-delta, soft-starter and VFD feeders, and distribution panels with busbars up to 6300 A, at our works in Bengaluru. Every panel is factory tested before dispatch. To get a price, list your motors in our [online panel builder](/build/?app=motor) or send us your SLD through the [contact page](/contact/).

See also: [MCC panels](/mcc-panel-manufacturer/) · [power distribution panels](/power-distribution-panel-manufacturer/) · [LT panels](/lt-panel-manufacturer/)
