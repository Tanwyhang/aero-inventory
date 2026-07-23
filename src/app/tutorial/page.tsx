import { LazyTutorialPage } from "@/components/lazy-page-components";
import { requireMembership } from "@/lib/auth";

export default async function TutorialRoute() {
  const membership = await requireMembership();

  return <LazyTutorialPage membership={membership} />;
}
