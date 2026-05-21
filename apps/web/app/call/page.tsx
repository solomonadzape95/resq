import { redirect } from "next/navigation";

// The dedicated /call surface has folded into the unified phone simulator.
// Anyone hitting /call lands directly on the voicemail mode of /simulator.
export default function CallRedirect() {
  redirect("/simulator?mode=call");
}
