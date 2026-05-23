import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

// Pulled out of prisma/seed.ts so the same logic powers both the CLI seed
// (tsx prisma/seed.ts) and the /admin/seed route. Idempotent: wipes
// transient demo rows, then upserts the coordinator + responders, then
// re-creates the demo incidents with deterministic IDs.
export async function seedDatabase(prisma: PrismaClient) {
  await prisma.incidentResponder.deleteMany({});
  await prisma.call.deleteMany({});
  await prisma.ussdSession.deleteMany({});
  await prisma.incident.deleteMany({});

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

  const responders = [
    // -------- Port Harcourt --------
    { phone: "+2348000000002", name: "Dr. Amara Okeke", skills: ["doctor", "first_aider"], lat: 4.8156, lng: 7.0498 },
    { phone: "+2348000000003", name: "Nurse Chinedu Eze", skills: ["nurse", "first_aider"], lat: 4.8245, lng: 7.0312 },
    { phone: "+2348000000004", name: "Paramedic Tunde Ade", skills: ["paramedic"], lat: 4.8418, lng: 7.0212 },
    { phone: "+2348000000005", name: "Officer Bola Ibrahim", skills: ["security", "police_liaison"], lat: 4.8112, lng: 7.0421 },
    { phone: "+2348000000006", name: "Fire Warden Ngozi", skills: ["fire_warden", "civil_defence"], lat: 4.8329, lng: 7.0356 },
    { phone: "+2348000000007", name: "Nurse Bisi Adeleke", skills: ["nurse", "first_aider"], lat: 4.8056, lng: 7.0344 },
    // -------- Nsukka (UNN) --------
    { phone: "+2348070000001", name: "Dr. Ifeoma Nwokocha", skills: ["doctor", "first_aider"], lat: 6.8585, lng: 7.3961 },
    { phone: "+2348070000002", name: "Paramedic Emeka Okoye", skills: ["paramedic", "first_aider"], lat: 6.8623, lng: 7.3974 },
    { phone: "+2348070000003", name: "Officer Uche Mba", skills: ["security", "police_liaison"], lat: 6.8541, lng: 7.3902 },
    // -------- Enugu (Airport / GRA) --------
    { phone: "+2348080000001", name: "Paramedic Chima Eze", skills: ["paramedic", "first_aider"], lat: 6.476, lng: 7.5605 },
    { phone: "+2348080000002", name: "Officer Ifeoma Onyeka", skills: ["security", "police_liaison"], lat: 6.4485, lng: 7.502 },
    { phone: "+2348080000003", name: "Fire Warden Obi Nnamdi", skills: ["fire_warden", "civil_defence"], lat: 6.4625, lng: 7.5275 },
    // -------- Yaba Phase 1, Lagos --------
    { phone: "+2348070000004", name: "Paramedic Adesua Bello", skills: ["paramedic", "first_aider"], lat: 6.5095, lng: 3.3756 },
    { phone: "+2348070000005", name: "Officer Bamidele John", skills: ["security", "police_liaison"], lat: 6.5125, lng: 3.3795 },
    { phone: "+2348070000006", name: "Fire Warden Olu Babatunde", skills: ["fire_warden", "civil_defence"], lat: 6.5048, lng: 3.3712 },
    { phone: "+2348070000007", name: "Dr. Folake Adeyemi", skills: ["doctor", "first_aider"], lat: 6.5072, lng: 3.3768 },
    // -------- Ikeja, Lagos (clustered ~1 km from 6.6344, 3.3475) --------
    { phone: "+2348090000001", name: "Dr. Yetunde Ojo", skills: ["doctor", "first_aider"], lat: 6.6350, lng: 3.3470 },
    { phone: "+2348090000002", name: "Paramedic Kelechi Anozie", skills: ["paramedic", "first_aider"], lat: 6.6320, lng: 3.3500 },
    { phone: "+2348090000003", name: "Fire Warden Hassan Bello", skills: ["fire_warden", "civil_defence"], lat: 6.6380, lng: 3.3460 },
    { phone: "+2348090000004", name: "Officer Aisha Yusuf", skills: ["security", "police_liaison"], lat: 6.6330, lng: 3.3445 },
  ];

  for (const r of responders) {
    const user = await prisma.user.upsert({
      where: { phone: r.phone },
      create: { phone: r.phone, name: r.name, role: "responder", verifiedPhone: true },
      update: { name: r.name },
    });
    await prisma.responder.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        skills: r.skills,
        verified: true,
        availabilityRadiusKm: 10,
        status: "available",
        currentLat: r.lat,
        currentLng: r.lng,
        lastLocationUpdate: new Date(),
      },
      update: {
        skills: r.skills,
        currentLat: r.lat,
        currentLng: r.lng,
        status: "available",
      },
    });
  }

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
  const demoIncidents = [
    { id: "demo-001", type: "medical" as const, status: "new" as const, callerPhone: "+2348011111101", locationText: "GRA Phase 2, near the blue gate", locationLat: 4.823, locationLng: 7.0125, createdAt: minutesAgo(2) },
    { id: "demo-002", type: "medical" as const, status: "new" as const, callerPhone: "+2348011111102", locationText: "Mile 1 Market — child having asthma attack, no inhaler", locationLat: 4.7945, locationLng: 7.0089, createdAt: minutesAgo(4) },
    { id: "demo-003", type: "medical" as const, status: "triaged" as const, callerPhone: "+2348011111103", locationText: "Rumuola junction, opposite filling station", locationLat: 4.8418, locationLng: 7.0212, aiTriageScore: 9, aiSeverity: "critical" as const, aiPriorityReason: "Woman in labour, severe bleeding reported.", transcriptFull: "My sister is having the baby, there is a lot of blood, please come quickly to Rumuola junction.", createdAt: minutesAgo(11) },
    { id: "demo-004", type: "fire" as const, status: "new" as const, callerPhone: "+2348011111104", locationText: "D-Line, three-storey residential building", locationLat: 4.7967, locationLng: 7.0145, createdAt: minutesAgo(7) },
    { id: "demo-005", type: "fire" as const, status: "active" as const, callerPhone: "+2348011111105", locationText: "Trans Amadi industrial estate, chemical storage", locationLat: 4.8056, locationLng: 7.0344, aiTriageScore: 9, aiSeverity: "critical" as const, aiPriorityReason: "Chemical fire, risk of explosion and toxic smoke.", transcriptFull: "Black smoke everywhere, the chemical drums are catching, we need fire service now.", createdAt: minutesAgo(28) },
    { id: "demo-006", type: "accident" as const, status: "new" as const, callerPhone: "+2348011111106", locationText: "Aba Road by Slaughter bus stop — motorbike vs car", locationLat: 4.8278, locationLng: 7.0234, createdAt: minutesAgo(3) },
    { id: "demo-007", type: "accident" as const, status: "active" as const, callerPhone: "+2348011111107", locationText: "Eleme junction, eastbound carriageway", locationLat: 4.7821, locationLng: 7.1145, aiTriageScore: 9, aiSeverity: "critical" as const, aiPriorityReason: "Trailer rollover, multiple casualties.", transcriptFull: "There's a trailer on its side blocking the road. At least three people not moving. Please come fast.", createdAt: minutesAgo(42) },
    { id: "demo-008", type: "accident" as const, status: "triaged" as const, callerPhone: "+2348011111108", locationText: "Garrison roundabout — hit and run, pedestrian down", locationLat: 4.8333, locationLng: 7.0276, aiTriageScore: 7, aiSeverity: "high" as const, aiPriorityReason: "Pedestrian hit by vehicle that fled the scene.", createdAt: minutesAgo(17) },
    { id: "demo-009", type: "crime" as const, status: "new" as const, callerPhone: "+2348011111109", locationText: "Mile 1 Market, north entrance — armed robbery", locationLat: 4.7951, locationLng: 7.0097, createdAt: minutesAgo(5) },
    { id: "demo-010", type: "crime" as const, status: "assigned" as const, callerPhone: "+2348011111110", locationText: "Choba, near university gate — kidnapping attempt foiled", locationLat: 4.8865, locationLng: 6.9034, aiTriageScore: 8, aiSeverity: "high" as const, aiPriorityReason: "Victim hiding nearby, kidnappers still in the area.", createdAt: minutesAgo(33) },
    { id: "demo-011", type: "crime" as const, status: "active" as const, callerPhone: "+2348011111111", locationText: "Old GRA, near the cathedral — assault outside nightclub", locationLat: 4.8156, locationLng: 7.0498, aiTriageScore: 6, aiSeverity: "medium" as const, aiPriorityReason: "Group fight, one person down with head injury.", transcriptFull: "Big fight outside the club, one guy is on the floor not moving. They hit him with a bottle.", createdAt: minutesAgo(54) },
    { id: "demo-012", type: "medical" as const, status: "resolved" as const, callerPhone: "+2348011111112", locationText: "Borokiri waterside — diabetic collapse stabilised", locationLat: 4.7567, locationLng: 7.0489, aiTriageScore: 4, aiSeverity: "low" as const, aiPriorityReason: "Low blood sugar; responder gave glucose, patient stable.", resolvedAt: minutesAgo(12), createdAt: minutesAgo(82) },
  ];

  for (const d of demoIncidents) {
    await prisma.incident.create({
      data: {
        id: d.id,
        createdAt: d.createdAt,
        type: d.type,
        status: d.status,
        callerPhone: d.callerPhone,
        source: "ussd",
        locationText: d.locationText,
        locationLat: d.locationLat,
        locationLng: d.locationLng,
        locationConfirmed: true,
        aiTriageScore: d.aiTriageScore ?? null,
        aiSeverity: d.aiSeverity ?? null,
        aiPriorityReason: d.aiPriorityReason ?? null,
        transcriptFull: d.transcriptFull ?? null,
        resolvedAt: d.resolvedAt ?? null,
      },
    });
  }

  return {
    responderCount: responders.length,
    incidentCount: demoIncidents.length,
  };
}

// Wipes only the demo transactional rows (incidents + their dependents).
// Users and responders are kept intact.
export async function wipeIncidents(prisma: PrismaClient) {
  const r1 = await prisma.incidentResponder.deleteMany({});
  const r2 = await prisma.call.deleteMany({});
  const r3 = await prisma.ussdSession.deleteMany({});
  const r4 = await prisma.incident.deleteMany({});
  return {
    incidentResponders: r1.count,
    calls: r2.count,
    ussdSessions: r3.count,
    incidents: r4.count,
  };
}

// Truncates everything. Optionally keeps the calling coordinator so the
// session that triggered the wipe doesn't immediately log itself out.
export async function wipeAll(
  prisma: PrismaClient,
  opts: { keepUserId?: string } = {},
) {
  await prisma.incidentResponder.deleteMany({});
  await prisma.call.deleteMany({});
  await prisma.ussdSession.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.responder.deleteMany({});
  if (opts.keepUserId) {
    await prisma.user.deleteMany({ where: { id: { not: opts.keepUserId } } });
  } else {
    await prisma.user.deleteMany();
  }
}
