import { route } from "@/server/http/route";
import { exportCsv, exportKind } from "@/server/modules/export";

/** CSV для Excel и Google Таблиц: точка с запятой, UTF-8 с BOM. */
export const GET = route({ roles: ["owner", "admin"], limit: [20, 60] }, async ({ auth, query }) => {
  const kind = exportKind.parse(query.get("what"));
  const body = await exportCsv(auth, kind);
  const name = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});
