import { PageHeader } from "../components/AppShell";

export function ComingSoonPage({ name }: { name: string }) {
  return (
    <>
      <PageHeader title={name} />
      <div className="state state-empty">
        <strong>Coming soon.</strong> {name} will be built as a module on the same shell, permission policy and audit
        infrastructure as KYC Reviews. Nothing is implemented here yet.
      </div>
    </>
  );
}
