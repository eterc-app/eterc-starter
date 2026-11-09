"use client";

import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import { FieldLabel, format_datetime } from "../ui";
import {
  ColorInput,
  DatetimeInput,
  HashInput,
  IconInput,
  MapInput,
  SliderInput,
  ToggleInput,
} from "./basics";
import {
  CheckboxesInput,
  CheckboxesTreeInput,
  ChoiceMultiSelect,
  ChoiceSelect,
  choice_summary,
  RadioInput,
  TagsInput,
} from "./choices";
import { FileInput, FilesInput, ImageInput } from "./media";
import {
  AccordionGroup,
  ButtonsDisplay,
  DetailGroup,
  DividerDisplay,
  HeaderDisplay,
  NoticeDisplay,
  RawGroup,
} from "./presentation";
import {
  BuilderInput,
  RelationInput,
  RelationMultiInput,
  RepeaterInput,
  TreeRelationInput,
  TranslationsInput,
} from "./relational";
import {
  AutocompleteApiInput,
  BlockEditorInput,
  CodeInput,
  MarkdownInput,
  TextareaInput,
  TextInput,
} from "./text";
import { WysiwygInput } from "./rich-text-editor";
import {
  as_array,
  as_object,
  as_string,
  field_choices,
  field_interface,
  is_system_sort_field,
  is_status_field,
  is_alias_field,
  is_group_field,
  type CmsFieldFormProps,
  type CmsMediaConfig,
  type FieldInputProps,
} from "./types";

export type { CmsFieldFormProps, CmsMediaConfig, FieldInputProps };
export {
  default_value_for_field,
  is_alias_field,
  is_status_field,
  is_system_sort_field,
} from "./types";

export function FieldInput(props: FieldInputProps) {
  const { field, value, onChange, disabled, media, collections } = props;
  const iface = field_interface(field);

  switch (iface) {
    case "input":
    case "number":
      return (
        <TextInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "input_autocomplete_api":
      return (
        <AutocompleteApiInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "block_editor":
      return (
        <BlockEditorInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "code":
    case "json":
      return (
        <CodeInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "textarea":
      return (
        <TextareaInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "wysiwyg":
      return (
        <WysiwygInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "markdown":
      return (
        <MarkdownInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "tags":
      return (
        <TagsInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "toggle":
      return (
        <ToggleInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "datetime":
      return (
        <DatetimeInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "repeater":
      return (
        <RepeaterInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          renderField={(subfield, subvalue, subchange) => (
            <FieldInput
              field={subfield}
              value={subvalue}
              onChange={subchange}
              disabled={disabled}
              media={media}
              collections={collections}
            />
          )}
        />
      );
    case "map":
      return (
        <MapInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "color":
      return (
        <ColorInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "dropdown":
    case "select":
      return (
        <ChoiceSelect
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "icon":
      return (
        <IconInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "checkboxes":
      return (
        <CheckboxesInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "checkboxes_tree":
      return (
        <CheckboxesTreeInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "dropdown_multiselect":
      return (
        <ChoiceMultiSelect
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "radio":
      return (
        <RadioInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "file":
      return (
        <FileInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "image":
      return (
        <ImageInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "files":
      return (
        <FilesInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          media={media}
        />
      );
    case "builder_m2a":
      return (
        <BuilderInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          collections={collections}
        />
      );
    case "many_to_many":
    case "one_to_many":
    case "collection_item_dropdown_multiple":
      return (
        <RelationMultiInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          collections={collections}
        />
      );
    case "tree_view":
      return (
        <TreeRelationInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          collections={collections}
        />
      );
    case "many_to_one":
    case "collection_item_dropdown":
    case "relation":
      return (
        <RelationInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          collections={collections}
        />
      );
    case "translations":
      return (
        <TranslationsInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "header":
      return <HeaderDisplay field={field} />;
    case "divider":
      return <DividerDisplay field={field} />;
    case "notice":
      return <NoticeDisplay field={field} />;
    case "buttons":
      return <ButtonsDisplay field={field} />;
    case "hash":
      return (
        <HashInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "slider":
      return (
        <SliderInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case "accordion":
    case "detail_group":
    case "raw_group":
      return null;
    default:
      return (
        <TextInput
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}

function has_group(field: CmsField): boolean {
  return typeof field.group === "string" && field.group.trim() !== "";
}

function group_children(fields: CmsField[], name: string): CmsField[] {
  return fields.filter((field) => field.group === name);
}

export function CmsFieldForm({
  fields,
  values,
  onChange,
  disabled,
  media,
  collections,
}: CmsFieldFormProps) {
  const by_name = new Map(fields.map((field) => [field.name, field]));
  const top_level = fields.filter(
    (field) => !has_group(field) || !by_name.has(field.group ?? "")
  );

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {top_level.map((field) => {
        if (field.hidden) return null;
        const widthClass =
          field.options.width === "half" ? "sm:col-span-1" : "sm:col-span-2";
        if (is_group_field(field)) {
          const children = group_children(fields, field.name);
          const content = (
            <CmsFieldForm
              fields={children}
              values={values}
              onChange={onChange}
              disabled={disabled}
              media={media}
              collections={collections}
            />
          );
          if (field.interface === "accordion") {
            return (
              <div key={field.name} className={widthClass}>
                <AccordionGroup field={field}>{content}</AccordionGroup>
              </div>
            );
          }
          if (field.interface === "detail_group") {
            return (
              <div key={field.name} className={widthClass}>
                <DetailGroup field={field}>{content}</DetailGroup>
              </div>
            );
          }
          return (
            <div key={field.name} className={widthClass}>
              <RawGroup>{content}</RawGroup>
            </div>
          );
        }

        if (is_alias_field(field)) {
          if (
            field.interface === "header" ||
            field.interface === "divider" ||
            field.interface === "notice" ||
            field.interface === "buttons"
          ) {
            return (
              <div key={field.name} className={widthClass}>
                <FieldInput
                  field={field}
                  value={undefined}
                  onChange={() => undefined}
                  disabled
                  media={media}
                  collections={collections}
                />
              </div>
            );
          }
          return null;
        }

        const readOnly =
          disabled || field.readonly || is_system_sort_field(field);
        return (
          <div key={field.name} className={`grid gap-3 ${widthClass}`}>
            <FieldLabel field={field} />
            <FieldInput
              field={field}
              value={values[field.name]}
              onChange={(value) => onChange(field.name, value)}
              disabled={readOnly}
              media={media}
              collections={collections}
            />
          </div>
        );
      })}
    </div>
  );
}

function strip_markup(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cell_text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const array = Array.isArray(value) ? value : null;
    if (array) return `${array.length} item${array.length === 1 ? "" : "s"}`;
    return `${Object.keys(value as Record<string, unknown>).length} keys`;
  }
  return String(value);
}

function count_badge(count: number, label: string) {
  return (
    <Badge variant="outline" className="rounded-md text-xs">
      {count} {label}
      {count === 1 ? "" : "s"}
    </Badge>
  );
}

export function FieldValueDisplay({
  field,
  value,
  userLabel,
}: {
  field: CmsField;
  value: unknown;
  userLabel?: string;
}) {
  const iface = field_interface(field);
  if (is_alias_field(field)) return null;
  const userAuditKind = field.options?._eterc_system_field;
  if (
    userAuditKind === "user_created" ||
    userAuditKind === "user_updated" ||
    field.name === "user_created" ||
    field.name === "user_updated"
  ) {
    if (value === null || value === undefined || value === "") {
      return <span className="text-muted-foreground">—</span>;
    }
    const id = Number(value);
    return (
      <Badge variant="secondary" className="rounded-md text-xs">
        {userLabel || (Number.isFinite(id) ? `User #${id}` : as_string(value))}
      </Badge>
    );
  }
  const displayValue =
    is_status_field(field) && (value === null || value === undefined || value === "")
      ? "draft"
      : value;

  if (iface === "toggle" || field.type === "boolean") {
    const checked =
      value === true || value === 1 || value === "1" || value === "true";
    return (
      <Badge variant={checked ? "success" : "outline"} className="rounded-md text-xs">
        {checked ? "Yes" : "No"}
      </Badge>
    );
  }

  if (iface === "datetime" || field.type === "datetime") {
    return (
      <span className="text-muted-foreground">{format_datetime(value)}</span>
    );
  }

  if (iface === "image") {
    const url = as_string(value);
    if (!url) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={field.name}
          className="size-7 shrink-0 rounded border border-border bg-muted object-cover"
          loading="lazy"
        />
        <span className="truncate text-xs text-muted-foreground">{url}</span>
      </div>
    );
  }

  if (iface === "file") {
    const url = as_string(value);
    if (!url) return <span className="text-muted-foreground">—</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        {url.split("/").filter(Boolean).pop() || url}
      </a>
    );
  }

  if (iface === "files") {
    const files = as_array(value);
    return files.length === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      count_badge(files.length, "file")
    );
  }

  if (iface === "color") {
    const color = as_string(value);
    if (!color) return <span className="text-muted-foreground">—</span>;
    const swatch_style = { backgroundColor: color };
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
        <span
          className="size-3 rounded-full border border-border"
          style={swatch_style}
        />
        {color}
      </span>
    );
  }

  if (iface === "icon") {
    const icon = as_string(value);
    if (!icon) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <DynamicIcon name={icon} size={14} />
        {icon}
      </span>
    );
  }

  if (
    iface === "tags" ||
    iface === "checkboxes" ||
    iface === "checkboxes_tree" ||
    iface === "dropdown_multiselect"
  ) {
    const entries = as_array(value);
    if (entries.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.slice(0, 3).map((entry) => (
          <Badge
            key={String(entry)}
            variant="secondary"
            className="rounded-md text-xs"
          >
            {iface === "tags" ? as_string(entry) : choice_summary(field, entry)}
          </Badge>
        ))}
        {entries.length > 3 ? (
          <Badge variant="outline" className="rounded-md text-xs">
            +{entries.length - 3}
          </Badge>
        ) : null}
      </div>
    );
  }

  if (iface === "dropdown" || iface === "radio" || iface === "select") {
    if (displayValue === null || displayValue === undefined || displayValue === "") {
      return <span className="text-muted-foreground">—</span>;
    }
    const choices = field_choices(field);
    const choice = choices.find(
      (entry) => String(entry.value) === String(displayValue)
    );
    return (
      <Badge variant="secondary" className="rounded-md text-xs">
        {choice?.text ?? as_string(displayValue)}
      </Badge>
    );
  }

  if (iface === "slider") {
    return <span className="font-mono text-xs tabular-nums">{as_string(value)}</span>;
  }

  if (iface === "wysiwyg") {
    const text = strip_markup(as_string(value));
    return (
      <span className="line-clamp-2 break-words text-muted-foreground">
        {text || "—"}
      </span>
    );
  }

  if (iface === "markdown" || iface === "block_editor") {
    const text =
      iface === "block_editor"
        ? as_array(value)
            .map((entry) => as_string(as_object(entry).value))
            .join(" ")
        : strip_markup(as_string(value));
    return (
      <span className="line-clamp-2 break-words text-muted-foreground">
        {text || "—"}
      </span>
    );
  }

  if (iface === "code" || iface === "json") {
    const text = as_string(value);
    return (
      <span className="line-clamp-2 break-words font-mono text-xs text-muted-foreground">
        {text ? text.split("\n")[0] : "—"}
      </span>
    );
  }

  if (iface === "repeater") {
    const count = as_array(value).length;
    return count === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      count_badge(count, "item")
    );
  }

  if (iface === "builder_m2a") {
    const count = as_array(value).length;
    return count === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      count_badge(count, "block")
    );
  }

  if (
    iface === "many_to_many" ||
    iface === "one_to_many" ||
    iface === "collection_item_dropdown_multiple"
  ) {
    const count = as_array(value).length;
    return count === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      count_badge(count, "item")
    );
  }

  if (
    iface === "many_to_one" ||
    iface === "tree_view" ||
    iface === "collection_item_dropdown" ||
    iface === "relation"
  ) {
    const relationValue = as_string(value);
    return relationValue ? (
      <Badge variant="outline" className="rounded-md font-mono text-xs">
        #{relationValue}
      </Badge>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  if (iface === "translations") {
    const count = Object.keys(as_object(value)).length;
    return count === 0 ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      count_badge(count, "language")
    );
  }

  if (iface === "map") {
    const object = as_object(value);
    const coordinates = as_array(object.coordinates);
    if (coordinates.length >= 2) {
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {String(coordinates[1])}, {String(coordinates[0])}
        </span>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }

  if (iface === "hash") {
    return <span className="font-mono text-xs text-muted-foreground">••••••••</span>;
  }

  const text = cell_text(value);
  return (
    <span
      className={cn(
        "line-clamp-2 break-words",
        field.type === "integer" || field.type === "decimal"
          ? "font-mono text-xs tabular-nums"
          : "text-muted-foreground"
      )}
    >
      {text}
    </span>
  );
}
