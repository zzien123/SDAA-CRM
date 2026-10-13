import { buyerMatches } from "@/lib/buyer-matches";
import { Card, CardHeader } from "./ui";
import { BuyerMatchPanel } from "./buyer-match-panel";
import { money } from "@/lib/utils";

export async function BuyerMatches({ orgId, propertyId, opportunityId, address }: { orgId: string; propertyId: string; opportunityId?: string | null; address: string }) {
  const { deal, matches } = await buyerMatches(orgId, propertyId, opportunityId);
  const fits = matches.filter((m) => m.result.tier !== "conflict").length;
  return (
    <Card>
      <CardHeader title={`Buyer matches · ${fits} fit${fits === 1 ? "" : "s"}`}
        sub={deal.price ? `Scored at ${money(deal.price)} (${deal.price_source})${deal.units ? `, ${deal.units} units` : ""}` : "No price on this property or deal yet — price can't be matched"} />
      <BuyerMatchPanel propertyId={propertyId} opportunityId={opportunityId} address={address}
        items={matches.map((m) => ({
          id: m.contact.id, name: m.contact.name, company: m.contact.company, email: m.contact.email, dnc: m.contact.do_not_contact,
          lastContact: m.contact.last_contacted_at, label: m.criteria.label, score: m.result.score, tier: m.result.tier,
          matches: m.result.matches, conflicts: m.result.conflicts, unknowns: m.result.unknowns, notes: m.result.notes,
        }))} />
    </Card>
  );
}
