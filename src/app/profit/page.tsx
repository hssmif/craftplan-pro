import { redirect } from "next/navigation";

// Profit Tracker has been merged into the Research page as a tab.
// Old bookmarks redirect there.
export default function ProfitRedirect() {
  redirect("/research?tab=profit");
}
