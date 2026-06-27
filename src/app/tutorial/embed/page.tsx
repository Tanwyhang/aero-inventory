import { TutorialEmbed } from "@/components/tutorial/tutorial-embed";
import { requireMembership } from "@/lib/auth";

export default async function TutorialEmbedRoute({ searchParams }: { searchParams: Promise<{ lesson?: string; role?: string }> }) {
  const membership = await requireMembership();
  const params = await searchParams;
  const requestedRole = params.role === "staff" ? "staff" : "admin";
  const role = membership.role === "admin" ? requestedRole : "staff";

  return <TutorialEmbed lessonId={params.lesson ?? "stock"} role={role} />;
}
