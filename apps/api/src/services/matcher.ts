import { INCIDENT_TYPE_TO_SKILLS, type IncidentType } from "@resq/shared/types";
import { prisma } from "../db/prisma.js";

const EARTH_R_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

export interface RankedResponder {
  responderId: string;
  userId: string;
  name: string;
  phone: string;
  distanceKm: number | null;
  skills: string[];
}

export async function findCandidateResponders(args: {
  type: IncidentType;
  lat: number | null;
  lng: number | null;
  limit?: number;
}): Promise<RankedResponder[]> {
  const requiredSkills = INCIDENT_TYPE_TO_SKILLS[args.type];

  const responders = await prisma.responder.findMany({
    where: {
      status: "available",
      verified: true,
      skills: { hasSome: requiredSkills },
    },
    include: { user: true },
  });

  const ranked = responders.map((r) => {
    const dist =
      args.lat != null &&
      args.lng != null &&
      r.currentLat != null &&
      r.currentLng != null
        ? haversineKm(args.lat, args.lng, r.currentLat, r.currentLng)
        : null;
    return {
      responderId: r.id,
      userId: r.userId,
      name: r.user.name ?? "Responder",
      phone: r.user.phone,
      distanceKm: dist,
      skills: r.skills,
      withinRadius:
        dist == null ? true : dist <= r.availabilityRadiusKm,
    };
  });

  const limit = args.limit ?? 10;
  const sorted = ranked.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  // Primary pass: responders whose declared service radius covers this
  // incident. Fallback: when nobody covers the incident (e.g. an out-of-LGA
  // demo call from a real phone), surface the closest verified responders
  // anyway so the dashboard isn't empty. The coordinator can still override.
  const inRadius = sorted.filter((r) => r.withinRadius);
  const final = inRadius.length > 0 ? inRadius : sorted;

  return final
    .slice(0, limit)
    .map(({ withinRadius: _w, ...rest }) => rest);
}
