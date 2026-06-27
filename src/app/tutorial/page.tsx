import { TutorialPage } from "@/components/tutorial/tutorial-page";
import { requireMembership } from "@/lib/auth";

export default async function TutorialRoute() {
  const membership = await requireMembership();

  return <TutorialPage membership={membership} />;
}
