import type { Metadata } from "next";
import { requireActiveChild } from "@/lib/auth";
import { PageTitle } from "@/components/ui/PageTitle";
import { Notice } from "@/components/ui/Notice";
import { UploadForm } from "./UploadForm";

export const metadata: Metadata = { title: "Upload kunst" };

export default async function UploadPage() {
  const { supabase, profile } = await requireActiveChild();
  const { data: canShare } = await supabase.rpc("has_consent", { p_child: profile.id, p_type: "image_sharing" });
  return (
    <>
      <PageTitle kicker="vis os noget weird!">UPLOAD</PageTitle>
      {canShare ? (
        <UploadForm />
      ) : (
        <Notice tone="info" title="Din voksen har ikke sagt ja til billeddeling">
          Du kan stadig se kunst og tage med på WAKT. Spørg din voksen, om de vil slå billeddeling til på forældresiden.
        </Notice>
      )}
    </>
  );
}
