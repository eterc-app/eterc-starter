
function lit(value: string): string {
  return JSON.stringify(value);
}

/** show(): render the runtime picture panel into a view-data key. */
export function panelFetchBlock(module: string): string {
  return [
    `    // image_uploader: picture panel fetch`,
    `    const upload_panel = await (`,
    `      (await this.module("image_uploader")) as {`,
    `        draw_panel(module_name?: string | null): Promise<unknown>;`,
    `      }`,
    `    ).draw_panel(${lit(module)});`,
  ].join("\n");
}

/** show(): expose the rendered panel to the view. */
export function panelDataBlock(): string {
  return [
    `      // image_uploader: picture panel data`,
    `      upload_panel,`,
  ].join("\n");
}

/** show view: render the panel node below the details card. */
export function panelExpression(): string {
  return `      {data.upload_panel as import("react").ReactNode}`;
}

/** submit_delete(): capture the picture file name before the row goes. */
export function deleteCaptureBlock(column: string): string {
  return [
    `    // Image uploader delete hook: capture the picture file name`,
    `    // BEFORE the row is deleted (the runtime needs it to clean up`,
    `    // the files afterwards).`,
    `    const picture_file_name = String(`,
    `      (record as Record<string, unknown>)[${lit(column)}] ?? ""`,
    `    );`,
  ].join("\n");
}

/** submit_delete(): remove the recorded files after the row has gone. */
export function deleteHookBlock(module: string): string {
  return [
    `    // Image uploader delete hook: remove the recorded files`,
    `    // AFTER the row deletion has succeeded (no orphans, no`,
    `    // lost-file-with-surviving-row).`,
    `    if (picture_file_name !== "") {`,
    `      ((await this.module("image_uploader")) as {`,
    `        delete_files(params: Record<string, unknown>): void;`,
    `      }).delete_files({`,
    `        module_name: ${lit(module)},`,
    `        update_id,`,
    `        file_name: picture_file_name,`,
    `      });`,
    `    }`,
  ].join("\n");
}
