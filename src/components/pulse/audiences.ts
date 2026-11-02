import { PulseVisibilityScope } from "@/lib/api/pulse.api";

/** Who can see a post. Location audiences come from the author's profile. */
export const POST_AUDIENCES: {
  key: PulseVisibilityScope;
  label: string;
  description: string;
}[] = [
  { key: "all", label: "Everyone", description: "Anyone on Citizen Monitors" },
  { key: "state", label: "My State", description: "People in your state" },
  { key: "lga", label: "My LGA", description: "People in your LGA" },
  { key: "ward", label: "My Ward", description: "People in your ward" },
  {
    key: "polling-unit",
    label: "My Polling Unit",
    description: "People at your polling unit",
  },
];
