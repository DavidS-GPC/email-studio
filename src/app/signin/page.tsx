import SignInPanel from "@/components/SignInPanel";

type SearchParams = Promise<{
  callbackUrl?: string;
  error?: string;
}>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { callbackUrl, error } = await searchParams;

  return <SignInPanel callbackUrl={callbackUrl || "/"} error={error || ""} />;
}
