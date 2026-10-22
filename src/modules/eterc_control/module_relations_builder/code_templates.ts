
function lit(value: string): string {
  return JSON.stringify(value);
}

/** create(): fetch the dropdown options into the view data. */
export function optionsFetchBlock(
  fk: string,
  optionsVar: string,
  altSingular: string
): string {
  return [
    `    // flo_relation: ${fk} options fetch`,
    `    data[${lit(fk)}] = Number(data[${lit(fk)}] ?? 0) || 0;`,
    `    data[${lit(optionsVar)}] = await this.get_${altSingular}_options(`,
    `      Number(data[${lit(fk)}] ?? 0)`,
    `    );`,
  ].join("\n");
}

/** Private get_{alt_singular}_options() method. */
export function getOptionsMethodBlock(
  altSingular: string,
  label: string,
  module: string,
  altModule: string
): string {
  return [
    `  /**`,
    `   * Options for the ${label} dropdown on the create form.`,
    `   *`,
    `   * Delegates to the module_relations runtime (the single SQL owner);`,
    `   * generated modules never duplicate query logic.`,
    `   */`,
    `  private async get_${altSingular}_options(`,
    `    selected_key = 0`,
    `  ): Promise<Record<number, string>> {`,
    `    const runtime = (await this.module("module_relations")) as {`,
    `      fetch_create_options(params: {`,
    `        calling_module: string;`,
    `        alt_module: string;`,
    `        selected_key: number;`,
    `      }): Record<number, string>;`,
    `    };`,
    ``,
    `    return runtime.fetch_create_options({`,
    `      calling_module: ${lit(module)},`,
    `      alt_module: ${lit(altModule)},`,
    `      selected_key,`,
    `    });`,
    `  }`,
  ].join("\n");
}

/** Create-view dropdown row (JSX). */
export function dropdownRowBlock(
  fk: string,
  optionsVar: string,
  label: string
): string {
  return [
    `          {/* flo_relation: ${fk} dropdown row */}`,
    `          <label>{${lit(label)}}</label>`,
    `          <ValidationErrors field=${lit(fk)} />`,
    `          <select`,
    `            name=${lit(fk)}`,
    `            defaultValue={String(data.${fk} ?? 0)}`,
    `          >`,
    `            {Object.entries(`,
    `              (data.${optionsVar} ?? {}) as Record<string, string>`,
    `            ).map(([value, optionLabel]) => (`,
    `              <option key={value} value={value}>`,
    `                {optionLabel}`,
    `              </option>`,
    `            ))}`,
    `          </select>`,
  ].join("\n");
}

/** Model get_data_from_post(): FK line, defaulting to the 0 sentinel. */
export function postedDataBlock(fk: string): string {
  return [
    `      // flo_relation: ${fk} posted data`,
    `      ${fk}:`,
    `        Number(post(${lit(fk)}, true)) > 0`,
    `          ? Number(post(${lit(fk)}, true))`,
    `          : 0,`,
  ].join("\n");
}

/** submit(): capture the previous FK before the UPDATE overwrites it. */
export function prevCaptureBlock(fk: string): string {
  return [
    `      // flo_relation: ${fk} prev capture`,
    `      const previous_${fk}_row = this.moduleModel().find_by_id(update_id);`,
    `      const prev_${fk} =`,
    `        previous_${fk}_row === false`,
    `          ? 0`,
    `          : Number(previous_${fk}_row[${lit(fk)}] ?? 0);`,
  ].join("\n");
}

/** submit(): sync the 1:1 claim after a create. */
export function syncOnSaveCreateBlock(
  altSingular: string,
  fk: string
): string {
  return [
    `    // flo_relation: ${fk} sync on save`,
    `    await this.sync_with_${altSingular}(`,
    `      update_id,`,
    `      Number(data[${lit(fk)}] ?? 0),`,
    `      0`,
    `    );`,
  ].join("\n");
}

/** submit(): sync the 1:1 claim after an update. */
export function syncOnSaveUpdateBlock(
  altSingular: string,
  fk: string
): string {
  return [
    `      // flo_relation: ${fk} sync on save`,
    `      await this.sync_with_${altSingular}(`,
    `        update_id,`,
    `        Number(data[${lit(fk)}] ?? 0),`,
    `        prev_${fk}`,
    `      );`,
  ].join("\n");
}

/** Private sync_with_{alt_singular}() method. */
export function syncMethodBlock(
  altSingular: string,
  module: string,
  altModule: string
): string {
  return [
    `  /**`,
    `   * Bidirectional 1:1 integrity at create/edit: claims the chosen`,
    `   * partner on both sides and releases any previous partner.`,
    `   *`,
    `   * @param update_id   The record being created/edited.`,
    `   * @param alt_id      The chosen partner record id.`,
    `   * @param prev_alt_id The previously-linked partner (edit path).`,
    `   */`,
    `  private async sync_with_${altSingular}(`,
    `    update_id: number,`,
    `    alt_id: number,`,
    `    prev_alt_id = 0`,
    `  ): Promise<void> {`,
    `    if (update_id < 1) {`,
    `      return;`,
    `    }`,
    ``,
    `    const runtime = (await this.module("module_relations")) as {`,
    `      sync_create_claim(params: Record<string, unknown>): void;`,
    `    };`,
    ``,
    `    runtime.sync_create_claim({`,
    `      calling_module: ${lit(module)},`,
    `      alt_module: ${lit(altModule)},`,
    `      update_id,`,
    `      value: alt_id,`,
    `      prev_value: prev_alt_id,`,
    `    });`,
    `  }`,
  ].join("\n");
}

/** submit_delete(): release the partner's back-FK before deleting. */
export function deleteHookBlock(altSingular: string, fk: string): string {
  return [
    `    // flo_relation: ${fk} delete hook`,
    `    await this.release_${altSingular}_link(update_id);`,
  ].join("\n");
}

/** Private release_{alt_singular}_link() method. */
export function releaseMethodBlock(
  altSingular: string,
  module: string,
  altModule: string
): string {
  return [
    `  /**`,
    `   * Delete hook: zeroes the partner's back-FK before this record is`,
    `   * deleted (1:1 no-bridge; the partner must never point at a deleted`,
    `   * record). Delegates to the module_relations runtime.`,
    `   */`,
    `  private async release_${altSingular}_link(update_id: number): Promise<void> {`,
    `    const runtime = (await this.module("module_relations")) as {`,
    `      release_create_link(params: Record<string, unknown>): void;`,
    `    };`,
    ``,
    `    runtime.release_create_link({`,
    `      calling_module: ${lit(module)},`,
    `      alt_module: ${lit(altModule)},`,
    `      update_id,`,
    `    });`,
    `  }`,
  ].join("\n");
}

/** Parent submit_delete(): release children before deleting the parent. */
export function parentDeleteHookBlock(fk: string, plural: string): string {
  return [
    `    // flo_relation: ${fk} delete hook`,
    `    await this.release_${plural}_links(update_id);`,
  ].join("\n");
}

/** Parent private release_{plural}_links() method. */
export function releaseChildrenMethodBlock(
  plural: string,
  module: string,
  altModule: string
): string {
  return [
    `  /**`,
    `   * Delete hook: releases every child before this parent record is`,
    `   * deleted (1:N; children must never point at a deleted record).`,
    `   * Delegates to the module_relations runtime.`,
    `   */`,
    `  private async release_${plural}_links(update_id: number): Promise<void> {`,
    `    const runtime = (await this.module("module_relations")) as {`,
    `      release_children(params: Record<string, unknown>): void;`,
    `    };`,
    ``,
    `    runtime.release_children({`,
    `      calling_module: ${lit(module)},`,
    `      alt_module: ${lit(altModule)},`,
    `      update_id,`,
    `    });`,
    `  }`,
  ].join("\n");
}

/** submit_delete(): release junction rows before deleting. */
export function junctionDeleteHookBlock(): string {
  return [
    `    // flo_relation: junction delete hook`,
    `    await this.release_junction_links(update_id);`,
  ].join("\n");
}

/** Private release_junction_links() method. */
export function releaseJunctionMethodBlock(
  module: string,
  altModule: string
): string {
  return [
    `  /**`,
    `   * Delete hook: removes every junction row that references this record`,
    `   * before it is deleted (junction relations; a deleted record must not`,
    `   * leave orphaned links behind). Delegates to the module_relations`,
    `   * runtime.`,
    `   */`,
    `  private async release_junction_links(update_id: number): Promise<void> {`,
    `    const runtime = (await this.module("module_relations")) as {`,
    `      release_junction_links(params: Record<string, unknown>): void;`,
    `    };`,
    ``,
    `    runtime.release_junction_links({`,
    `      calling_module: ${lit(module)},`,
    `      alt_module: ${lit(altModule)},`,
    `      update_id,`,
    `    });`,
    `  }`,
  ].join("\n");
}

/** show(): render the runtime summary panel into a view-data key. */
export function summaryPanelFetchBlock(altModule: string): string {
  return [
    `    // flo_relation: summary panel fetch ${altModule}`,
    `    const relation_panel_${altModule} = await (`,
    `      (await this.module("module_relations")) as {`,
    `        draw_summary_panel(alt_module: string): Promise<unknown>;`,
    `      }`,
    `    ).draw_summary_panel(${lit(altModule)});`,
  ].join("\n");
}

/** show(): expose the rendered panel to the view. */
export function summaryPanelDataBlock(altModule: string): string {
  return [
    `      // flo_relation: summary panel data ${altModule}`,
    `      relation_panel_${altModule},`,
  ].join("\n");
}

/** show view: render the panel node below the details card. */
export function summaryPanelExpression(altModule: string): string {
  return `      {data.relation_panel_${altModule} as import("react").ReactNode}`;
}
