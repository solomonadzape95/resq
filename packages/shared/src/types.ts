export type IncidentType = "medical" | "fire" | "crime" | "accident";

export type IncidentStatus =
  | "new"
  | "triaged"
  | "assigned"
  | "active"
  | "resolved"
  | "false_alarm"
  | "cancelled";

export type IncidentSource = "ussd" | "app" | "web" | "sms" | "voice";

export type ResponderStatus = "available" | "busy" | "off_duty";

export type ResponderSkill =
  | "doctor"
  | "nurse"
  | "paramedic"
  | "first_aider"
  | "fire_warden"
  | "security"
  | "civil_defence"
  | "police_liaison"
  | "traffic_warden";

export type Severity = "low" | "medium" | "high" | "critical";

export type IncidentResponderStatus =
  | "assigned"
  | "accepted"
  | "declined"
  | "en_route"
  | "on_scene"
  | "resolved";

export interface Incident {
  id: string;
  createdAt: string;
  type: IncidentType;
  status: IncidentStatus;
  callerPhone: string | null;
  callerUserId: string | null;
  source: IncidentSource;
  locationText: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationConfirmed: boolean;
  aiTriageScore: number | null;
  aiSeverity: Severity | null;
  aiExtractedLocation: string | null;
  transcriptFull: string | null;
  transcriptSummary: string | null;
  resolvedAt: string | null;
}

export interface Responder {
  id: string;
  userId: string;
  name: string;
  phone: string;
  skills: ResponderSkill[];
  verified: boolean;
  availabilityRadiusKm: number;
  status: ResponderStatus;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationUpdate: string | null;
  totalResponses: number;
  avgResponseTime: number | null;
}

export const INCIDENT_TYPE_TO_SKILLS: Record<IncidentType, ResponderSkill[]> = {
  medical: ["doctor", "nurse", "paramedic", "first_aider"],
  fire: ["fire_warden", "security", "civil_defence"],
  crime: ["security", "police_liaison"],
  accident: ["paramedic", "doctor", "traffic_warden"],
};

export const USSD_OPTION_TO_TYPE: Record<string, IncidentType> = {
  "1": "medical",
  "2": "fire",
  "3": "crime",
  "4": "accident",
};
