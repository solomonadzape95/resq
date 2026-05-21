import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Wipe transient demo data before reseeding. Users + responders stay so
  // the coordinator login and the 5 responders remain stable across reseed.
  await prisma.incidentResponder.deleteMany({});
  await prisma.call.deleteMany({});
  await prisma.ussdSession.deleteMany({});
  await prisma.incident.deleteMany({});

  // Coordinator user
  const coordinatorPwd = await bcrypt.hash("resq-demo-2026", 10);
  await prisma.user.upsert({
    where: { phone: "+2348000000001" },
    create: {
      phone: "+2348000000001",
      name: "Demo Coordinator",
      email: "coordinator@resq.ng",
      passwordHash: coordinatorPwd,
      role: "coordinator",
      verifiedPhone: true,
    },
    update: {},
  });

  // Sample responders (Port Harcourt area)
  const responders = [
    {
      phone: "+2348000000002",
      name: "Dr. Amara Okeke",
      skills: ["doctor", "first_aider"],
      lat: 4.8156,
      lng: 7.0498,
      status: "available" as const,
    },
    {
      phone: "+2348000000003",
      name: "Nurse Chinedu Eze",
      skills: ["nurse", "first_aider"],
      lat: 4.8245,
      lng: 7.0312,
      status: "available" as const,
    },
    {
      phone: "+2348000000004",
      name: "Paramedic Tunde Ade",
      skills: ["paramedic"],
      lat: 4.8418,
      lng: 7.0212,
      status: "available" as const,
    },
    {
      phone: "+2348000000005",
      name: "Officer Bola Ibrahim",
      skills: ["security", "police_liaison"],
      lat: 4.8112,
      lng: 7.0421,
      status: "available" as const,
    },
    {
      phone: "+2348000000006",
      name: "Fire Warden Ngozi",
      skills: ["fire_warden", "civil_defence"],
      lat: 4.8329,
      lng: 7.0356,
      status: "available" as const,
    },
  ];

  for (const r of responders) {
    const user = await prisma.user.upsert({
      where: { phone: r.phone },
      create: {
        phone: r.phone,
        name: r.name,
        role: "responder",
        verifiedPhone: true,
      },
      update: { name: r.name },
    });
    await prisma.responder.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        skills: r.skills,
        verified: true,
        availabilityRadiusKm: 10,
        status: r.status,
        currentLat: r.lat,
        currentLng: r.lng,
        lastLocationUpdate: new Date(),
      },
      update: {
        skills: r.skills,
        currentLat: r.lat,
        currentLng: r.lng,
        status: r.status,
      },
    });
  }

  // ---- Demo incidents -------------------------------------------------
  // 12 varied scenarios across Port Harcourt, every type/status combination
  // the dashboard needs to render. createdAt is spread across the last 90
  // minutes so the "time ago" labels look natural. Idempotent: the wipe
  // above plus deterministic IDs mean re-running the seed produces the
  // same outcome.

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

  const demoIncidents = [
    {
      id: "demo-001",
      type: "medical" as const,
      status: "new" as const,
      callerPhone: "+2348011111101",
      locationText: "GRA Phase 2, near the blue gate",
      locationLat: 4.8230,
      locationLng: 7.0125,
      createdAt: minutesAgo(2),
    },
    {
      id: "demo-002",
      type: "medical" as const,
      status: "new" as const,
      callerPhone: "+2348011111102",
      locationText: "Mile 1 Market — child having asthma attack, no inhaler",
      locationLat: 4.7945,
      locationLng: 7.0089,
      createdAt: minutesAgo(4),
    },
    {
      id: "demo-003",
      type: "medical" as const,
      status: "triaged" as const,
      callerPhone: "+2348011111103",
      locationText: "Rumuola junction, opposite filling station",
      locationLat: 4.8418,
      locationLng: 7.0212,
      aiTriageScore: 9,
      aiSeverity: "critical" as const,
      aiPriorityReason: "Woman in labour, severe bleeding reported.",
      transcriptFull:
        "My sister is having the baby, there is a lot of blood, please come quickly to Rumuola junction.",
      createdAt: minutesAgo(11),
    },
    {
      id: "demo-004",
      type: "fire" as const,
      status: "new" as const,
      callerPhone: "+2348011111104",
      locationText: "D-Line, three-storey residential building",
      locationLat: 4.7967,
      locationLng: 7.0145,
      createdAt: minutesAgo(7),
    },
    {
      id: "demo-005",
      type: "fire" as const,
      status: "active" as const,
      callerPhone: "+2348011111105",
      locationText: "Trans Amadi industrial estate, chemical storage",
      locationLat: 4.8056,
      locationLng: 7.0344,
      aiTriageScore: 9,
      aiSeverity: "critical" as const,
      aiPriorityReason: "Chemical fire, risk of explosion and toxic smoke.",
      transcriptFull:
        "Black smoke everywhere, the chemical drums are catching, we need fire service now.",
      createdAt: minutesAgo(28),
    },
    {
      id: "demo-006",
      type: "accident" as const,
      status: "new" as const,
      callerPhone: "+2348011111106",
      locationText: "Aba Road by Slaughter bus stop — motorbike vs car",
      locationLat: 4.8278,
      locationLng: 7.0234,
      createdAt: minutesAgo(3),
    },
    {
      id: "demo-007",
      type: "accident" as const,
      status: "active" as const,
      callerPhone: "+2348011111107",
      locationText: "Eleme junction, eastbound carriageway",
      locationLat: 4.7821,
      locationLng: 7.1145,
      aiTriageScore: 9,
      aiSeverity: "critical" as const,
      aiPriorityReason: "Trailer rollover, multiple casualties.",
      transcriptFull:
        "There's a trailer on its side blocking the road. At least three people not moving. Please come fast.",
      createdAt: minutesAgo(42),
    },
    {
      id: "demo-008",
      type: "accident" as const,
      status: "triaged" as const,
      callerPhone: "+2348011111108",
      locationText: "Garrison roundabout — hit and run, pedestrian down",
      locationLat: 4.8333,
      locationLng: 7.0276,
      aiTriageScore: 7,
      aiSeverity: "high" as const,
      aiPriorityReason: "Pedestrian hit by vehicle that fled the scene.",
      createdAt: minutesAgo(17),
    },
    {
      id: "demo-009",
      type: "crime" as const,
      status: "new" as const,
      callerPhone: "+2348011111109",
      locationText: "Mile 1 Market, north entrance — armed robbery",
      locationLat: 4.7951,
      locationLng: 7.0097,
      createdAt: minutesAgo(5),
    },
    {
      id: "demo-010",
      type: "crime" as const,
      status: "assigned" as const,
      callerPhone: "+2348011111110",
      locationText: "Choba, near university gate — kidnapping attempt foiled",
      locationLat: 4.8865,
      locationLng: 6.9034,
      aiTriageScore: 8,
      aiSeverity: "high" as const,
      aiPriorityReason: "Victim hiding nearby, kidnappers still in the area.",
      createdAt: minutesAgo(33),
    },
    {
      id: "demo-011",
      type: "crime" as const,
      status: "active" as const,
      callerPhone: "+2348011111111",
      locationText: "Old GRA, near the cathedral — assault outside nightclub",
      locationLat: 4.8156,
      locationLng: 7.0498,
      aiTriageScore: 6,
      aiSeverity: "medium" as const,
      aiPriorityReason: "Group fight, one person down with head injury.",
      transcriptFull:
        "Big fight outside the club, one guy is on the floor not moving. They hit him with a bottle.",
      createdAt: minutesAgo(54),
    },
    {
      id: "demo-012",
      type: "medical" as const,
      status: "resolved" as const,
      callerPhone: "+2348011111112",
      locationText: "Borokiri waterside — diabetic collapse stabilised",
      locationLat: 4.7567,
      locationLng: 7.0489,
      aiTriageScore: 4,
      aiSeverity: "low" as const,
      aiPriorityReason: "Low blood sugar; responder gave glucose, patient stable.",
      resolvedAt: minutesAgo(12),
      createdAt: minutesAgo(82),
    },
  ];

  for (const d of demoIncidents) {
    const base = {
      type: d.type,
      status: d.status,
      callerPhone: d.callerPhone,
      source: "ussd" as const,
      locationText: d.locationText,
      locationLat: d.locationLat,
      locationLng: d.locationLng,
      locationConfirmed: true,
      aiTriageScore: d.aiTriageScore ?? null,
      aiSeverity: d.aiSeverity ?? null,
      aiPriorityReason: d.aiPriorityReason ?? null,
      transcriptFull: d.transcriptFull ?? null,
      resolvedAt: d.resolvedAt ?? null,
    };
    await prisma.incident.create({
      data: { id: d.id, createdAt: d.createdAt, ...base },
    });
  }

  console.log("✅ Reseeded coordinator + 5 responders + 12 demo incidents.");
  console.log("   Coordinator login → phone +2348000000001 / password resq-demo-2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
