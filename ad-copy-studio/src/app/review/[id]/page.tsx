import { ApprovalView } from './ApprovalView';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApprovalView id={id} />;
}
