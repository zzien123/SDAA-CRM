"use client";
import { ActionButton } from "@/components/forms";
import { resolveOwnershipReview, rollbackImportAction } from "../actions";
export function Rollback({ id }: { id: string }) {
  return <ActionButton variant="danger" run={() => rollbackImportAction(id)} confirm="Undo this import?">Roll back</ActionButton>;
}
export function Review({ id }: { id: string }) {
  return (
    <span className="flex gap-1">
      <ActionButton variant="secondary" run={() => resolveOwnershipReview(id, "accepted")}>Accept new owner</ActionButton>
      <ActionButton run={() => resolveOwnershipReview(id, "rejected")}>Keep current</ActionButton>
    </span>
  );
}
