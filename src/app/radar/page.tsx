import { redirect } from "next/navigation";

// Etsy Radar has been merged into the Research page as a tab.
// Old bookmarks redirect there.
export default function RadarRedirect() {
  redirect("/research?tab=radar");
}
