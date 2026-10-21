"use client";

import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UPLOADER_DEFAULTS, type UploaderWizard } from "../types";

/**
 * Read-only uploader summary — port of
 * image_uploader_builder/views/conf_uploader_details.php.
 *
 * The PHP view seeded its table from localStorage; the port takes the same
 * values from the wizard session passed by the controller. There is no form:
 * the copy tells the developer the settings file can be edited after
 * generation.
 */

export default function ConfUploaderDetails({ data }: TgViewProps) {
  const wizard = (data.wizard ?? {}) as UploaderWizard;

  const afterCloseUrl = String(
    data.after_close_url ??
      "/control/image-uploader-builder/conf_generate_uploader"
  );
  const afterCloseWidth = String(data.after_close_width ?? 800);
  const afterCloseHeight = String(data.after_close_height ?? 600);

  const closeWindow = () => {
    window.parent.postMessage(
      `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
      "*"
    );
    if (typeof window !== "undefined" && window.parent === window) {
      window.location.href = afterCloseUrl;
    }
  };

  const rows: Array<[string, string | number]> = [
    ["Module", String(data.module_label ?? wizard.module ?? "")],
    ["Column Name", wizard.column ?? UPLOADER_DEFAULTS.column],
    ["Table Name", wizard.table ?? wizard.module ?? ""],
    ["Destination Folder", wizard.destination ?? UPLOADER_DEFAULTS.destination],
    ["Max Upload Size (KB)", wizard.max_size ?? UPLOADER_DEFAULTS.max_size],
    ["Max Source Width (px)", wizard.max_width ?? UPLOADER_DEFAULTS.max_width],
    [
      "Max Source Height (px)",
      wizard.max_height ?? UPLOADER_DEFAULTS.max_height,
    ],
    [
      "Downscale-to Width (px)",
      wizard.resize_max_width ?? UPLOADER_DEFAULTS.resize_max_width,
    ],
    [
      "Downscale-to Height (px)",
      wizard.resize_max_height ?? UPLOADER_DEFAULTS.resize_max_height,
    ],
    [
      "Thumbnail Max Width (px)",
      wizard.thumbnail_max_width ?? UPLOADER_DEFAULTS.thumbnail_max_width,
    ],
    [
      "Thumbnail Max Height (px)",
      wizard.thumbnail_max_height ?? UPLOADER_DEFAULTS.thumbnail_max_height,
    ],
    [
      "Generate Thumbnail",
      (wizard.thumbnails ?? UPLOADER_DEFAULTS.thumbnails) ? "Yes" : "No",
    ],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <h1>Image Uploader Details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your uploader details are displayed below. If required, you can modify
          these details after generation via the settings file.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle>Uploader Settings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-4">Setting</TableHead>
                <TableHead className="px-4">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="px-4 font-medium">{label}</TableCell>
                  <TableCell className="px-4">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Button type="button" variant="outline" onClick={closeWindow}>
        Close Window
      </Button>
    </div>
  );
}
