import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Port-only landing page for the plural_maker child module.
 *
 * The PHP module is a pure service used by the generators; this page documents
 * it and shows live output from the ported engine.
 */

export interface PluralExample {
  singular: string;
  plural: string;
  round_trip: string;
}

export function PluralMakerHome({
  examples,
}: {
  examples?: PluralExample[];
}) {
  const rows = Array.isArray(examples) ? examples : [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-6">
      <p className="text-sm text-muted-foreground">
        The Plural Maker is an English pluralisation engine used by the module
        generators when naming database tables and labels. It is a service, not
        an interactive tool — the examples below are produced by the same
        methods the generators call.
      </p>

      <section className="space-y-2">
        <h2>Public API</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>
            <code>make_plural(word)</code> — convert a singular word or phrase
            to its plural form.
          </li>
          <li>
            <code>get_singular(word)</code> — attempt the reverse conversion.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2>Examples</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-3">Singular</TableHead>
                <TableHead className="px-3">Plural</TableHead>
                <TableHead className="px-3">Round trip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((example) => (
                <TableRow key={example.singular}>
                  <TableCell className="px-3">{example.singular}</TableCell>
                  <TableCell className="px-3">{example.plural}</TableCell>
                  <TableCell className="px-3">{example.round_trip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Button asChild variant="outline">
        <a href="/trongate_control">Return to the control panel</a>
      </Button>
    </div>
  );
}
