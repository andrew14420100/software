import { Grid } from "@/components/Grid";
import { listTitles } from "@/server/catalog.ts";
import { currentUser } from "@/server/session.ts";
import { toCard, withProgress } from "@/server/view.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Serie" };

export default async function Series() {
  const u = await currentUser();
  return <Grid title="Serie" items={withProgress(u?.id ?? null, listTitles({ type: "series" }).map(toCard))} />;
}
