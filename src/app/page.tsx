import { Landing } from "@/features/site/landing";
import { env } from "@/server/env";

export default function Home() {
  return <Landing demo={env().demo} />;
}
