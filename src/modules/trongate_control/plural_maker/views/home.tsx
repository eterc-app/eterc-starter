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
    <div className="container">
      <h1>Plural Maker</h1>

      <p>
        The Plural Maker is an English pluralisation engine used by the module
        generators when naming database tables and labels. It is a service, not
        an interactive tool — the examples below are produced by the same
        methods the generators call.
      </p>

      <h2>Public API</h2>
      <ul>
        <li>
          <code>make_plural(word)</code> — convert a singular word or phrase to
          its plural form.
        </li>
        <li>
          <code>get_singular(word)</code> — attempt the reverse conversion.
        </li>
      </ul>

      <h2>Examples</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Singular</th>
            <th>Plural</th>
            <th>Round trip</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((example) => (
            <tr key={example.singular}>
              <td>{example.singular}</td>
              <td>{example.plural}</td>
              <td>{example.round_trip}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Return to the <a href="/trongate_control">control panel</a>.
      </p>
    </div>
  );
}
